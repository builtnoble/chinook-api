import $RefParser from '@apidevtools/json-schema-ref-parser';
import { sample as sampleSchema } from 'openapi-sampler';
import type { OpenAPIObject, ReferenceObject, SchemaObject } from 'openapi3-ts/oas31';
import type { JsonValue } from 'type-fest';

export class UnsupportedError extends Error {}

export const isReference = (value: object): value is ReferenceObject => '$ref' in value;

type Kind = 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null' | 'union' | 'any';

export type Property = { name: string; node: Node; required: boolean };

// A schema with `$ref`, `allOf` and nullable `anyOf` already resolved, so
// rendering never meets them. `schema` is the source it was read from, which
// the sampler reads for an example.
export type Node = {
    kind: Kind;
    nullable: boolean;
    schema: SchemaObject | ReferenceObject;
    description?: string;
    format?: string;
    const?: unknown;
    enum?: unknown[];
    properties?: Property[];
    items?: Node;
    variants?: Node[];
};

export type Row = { name: string; type: string; description: string; required: boolean };

// Keywords that change what a value may be in ways the property tables cannot
// express.
const UNSUPPORTED = ['not', 'if', 'then', 'else', 'patternProperties', 'dependentSchemas', 'prefixItems'];

const KINDS = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']);

// Resolves every `$ref` that points inside the document. One that loops back on
// itself, or points outside the document, is left in place for `normalize` to
// refuse, so nothing is read from disk or fetched.
export const dereference = async (spec: OpenAPIObject): Promise<OpenAPIObject> => {
    try {
        return await $RefParser.dereference(spec, {
            mutateInputSchema: false,
            resolve: { external: false },
            dereference: { circular: 'ignore' },
        });
    } catch (error) {
        throw new UnsupportedError(`cannot resolve a $ref: ${error instanceof Error ? error.message : error}`);
    }
};

export const normalize = (schema: SchemaObject | ReferenceObject, where: string): Node => {
    if (isReference(schema)) {
        throw new UnsupportedError(`${where}: ${schema.$ref} refers to itself or lies outside the document`);
    }

    for (const keyword of UNSUPPORTED) {
        if (keyword in schema) {
            throw new UnsupportedError(`${where}: the "${keyword}" keyword is not supported`);
        }
    }

    const common = { description: schema.description };

    if (schema.allOf) {
        return mergeAll(
            schema.allOf.map((part, index) => normalize(part, `${where}.allOf[${index}]`)),
            where,
            schema,
            common,
        );
    }

    const variants = schema.anyOf ?? schema.oneOf;
    if (variants) {
        const nodes = variants.map((variant, index) => normalize(variant, `${where}.anyOf[${index}]`));
        const present = nodes.filter((node) => node.kind !== 'null');
        const nullable = present.length < nodes.length || present.some((node) => node.nullable);

        if (present.length === 1) {
            const [only] = present;
            return {
                ...only,
                ...stripUndefined(common),
                nullable,
                description: schema.description ?? only.description,
            };
        }

        return { kind: 'union', nullable, schema, variants: present, ...stripUndefined(common) };
    }

    if (schema.type === 'null') {
        return { kind: 'null', nullable: true, schema };
    }

    const types = (Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : []).filter(
        (type) => type !== 'null',
    );
    const nullable = Array.isArray(schema.type) && schema.type.includes('null');

    if (types.length > 1) {
        return {
            kind: 'union',
            nullable,
            schema,
            variants: types.map((type) => normalize({ ...schema, type }, where)),
            ...stripUndefined(common),
        };
    }

    const type = types[0] ?? (schema.properties ? 'object' : undefined);
    if (type !== undefined && !KINDS.has(type)) {
        throw new UnsupportedError(`${where}: unknown type "${type}"`);
    }

    const node: Node = {
        kind: (type as Kind | undefined) ?? 'any',
        nullable,
        schema,
        ...stripUndefined({ ...common, format: schema.format }),
    };
    if ('const' in schema) node.const = schema.const;
    if (schema.enum) node.enum = schema.enum;

    if (node.kind === 'object') {
        const required = new Set(schema.required ?? []);
        node.properties = Object.entries(schema.properties ?? {}).map(([name, property]) => ({
            name,
            node: normalize(property, `${where}.${name}`),
            required: required.has(name),
        }));
    }

    if (node.kind === 'array') {
        node.items = schema.items
            ? normalize(schema.items, `${where}[]`)
            : { kind: 'any', nullable: false, schema: {} };
    }

    return node;
};

const stripUndefined = <T extends object>(value: T): Partial<T> =>
    Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>;

const mergeAll = (parts: Node[], where: string, schema: Node['schema'], common: Partial<Node>): Node => {
    if (parts.some((part) => part.kind !== 'object')) {
        throw new UnsupportedError(`${where}: allOf is only supported for objects`);
    }

    const properties = new Map<string, Property>();
    for (const part of parts) {
        for (const property of part.properties ?? []) {
            properties.set(property.name, property);
        }
    }

    return {
        kind: 'object',
        nullable: false,
        schema,
        properties: [...properties.values()],
        ...stripUndefined(common),
    };
};

// The `data` of a `{ data }` envelope, or the node itself.
export const unwrapData = (node: Node): Node => {
    const data = node.kind === 'object' && node.properties?.length === 1 ? node.properties[0] : undefined;
    return data?.name === 'data' ? data.node : node;
};

const literal = (value: unknown) => JSON.stringify(value);

export const typeLabel = (node: Node): string => {
    const label = baseLabel(node);
    return node.nullable ? `${label} | null` : label;
};

const baseLabel = (node: Node): string => {
    if (node.const !== undefined) return literal(node.const);
    if (node.enum) return node.enum.map(literal).join(' | ');

    switch (node.kind) {
        case 'union':
            return (node.variants ?? []).map(typeLabel).join(' | ');
        case 'array': {
            const item = node.items ? typeLabel(node.items) : 'any';
            return item.includes(' ') ? `(${item})[]` : `${item}[]`;
        }
        case 'any':
            return 'any';
        default:
            return node.format && node.kind === 'string' ? `string (${node.format})` : node.kind;
    }
};

// An example value for the node, from its schema's own examples where it has
// them.
export const sample = (spec: OpenAPIObject, node: Node) =>
    sampleSchema(node.schema as Parameters<typeof sampleSchema>[0], {}, spec) as JsonValue;

type RowOptions = {
    // Property names whose children are left out because they are documented
    // elsewhere on the page.
    collapse?: Map<string, string>;
    maxDepth?: number;
};

// One row per property, with nested objects and arrays of objects flattened
// into dotted names.
export const rows = (node: Node, options: RowOptions = {}, prefix = '', depth = 1): Row[] => {
    const { collapse = new Map(), maxDepth = 4 } = options;
    const out: Row[] = [];

    for (const property of node.properties ?? []) {
        const name = `${prefix}${property.name}`;
        const note = depth === 1 ? collapse.get(property.name) : undefined;

        out.push({
            name,
            type: typeLabel(property.node),
            description: note ?? property.node.description ?? '',
            required: property.required,
        });

        const child = property.node.kind === 'array' ? property.node.items : property.node;
        if (note === undefined && depth < maxDepth && child?.kind === 'object' && child.properties?.length) {
            out.push(...rows(child, options, `${name}${property.node.kind === 'array' ? '[]' : ''}.`, depth + 1));
        }
    }

    return out;
};
