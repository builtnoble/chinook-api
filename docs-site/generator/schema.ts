import type { Schema, Spec } from './types';

export class UnsupportedError extends Error {}

type Kind = 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null' | 'union' | 'any';

export type Property = { name: string; node: Node; required: boolean };

// A schema with `$ref`, `allOf` and nullable `anyOf` already resolved, so rendering never meets them.
export type Node = {
    kind: Kind;
    nullable: boolean;
    description?: string;
    format?: string;
    const?: unknown;
    enum?: unknown[];
    example?: { value: unknown };
    properties?: Property[];
    items?: Node;
    variants?: Node[];
};

export type Row = { name: string; type: string; description: string; required: boolean };

// Keywords that change what a value may be in ways the property tables cannot express.
const UNSUPPORTED = ['not', 'if', 'then', 'else', 'patternProperties', 'dependentSchemas', 'prefixItems'];

const KINDS = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']);

export const normalize = (spec: Spec, schema: Schema, where: string, stack: string[] = []): Node => {
    if (schema.$ref !== undefined) {
        const match = /^#\/components\/schemas\/(.+)$/.exec(schema.$ref);
        const target = match ? spec.components?.schemas?.[match[1]] : undefined;
        if (!target) {
            throw new UnsupportedError(`${where}: cannot resolve ${schema.$ref}`);
        }
        if (stack.includes(schema.$ref)) {
            throw new UnsupportedError(`${where}: ${schema.$ref} refers to itself`);
        }

        const node = normalize(spec, target, where, [...stack, schema.$ref]);
        return schema.description ? { ...node, description: schema.description } : node;
    }

    for (const keyword of UNSUPPORTED) {
        if (keyword in schema) {
            throw new UnsupportedError(`${where}: the "${keyword}" keyword is not supported`);
        }
    }

    const example = schema.examples?.length
        ? { value: schema.examples[0] }
        : 'example' in schema
          ? { value: schema.example }
          : undefined;
    const common = { description: schema.description, ...(example ? { example } : {}) };

    if (schema.allOf) {
        return mergeAll(
            schema.allOf.map((part, index) => normalize(spec, part, `${where}.allOf[${index}]`, stack)),
            where,
            common,
        );
    }

    const variants = schema.anyOf ?? schema.oneOf;
    if (variants) {
        const nodes = variants.map((variant, index) => normalize(spec, variant, `${where}.anyOf[${index}]`, stack));
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

        return { kind: 'union', nullable, variants: present, ...stripUndefined(common) };
    }

    if (schema.type === 'null') {
        return { kind: 'null', nullable: true };
    }

    const types = (Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : []).filter(
        (type) => type !== 'null',
    );
    const nullable = Array.isArray(schema.type) && schema.type.includes('null');

    if (types.length > 1) {
        return {
            kind: 'union',
            nullable,
            variants: types.map((type) => normalize(spec, { ...schema, type }, where, stack)),
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
        ...stripUndefined({ ...common, format: schema.format }),
    };
    if ('const' in schema) node.const = schema.const;
    if (schema.enum) node.enum = schema.enum;

    if (node.kind === 'object') {
        const required = new Set(schema.required ?? []);
        node.properties = Object.entries(schema.properties ?? {}).map(([name, property]) => ({
            name,
            node: normalize(spec, property, `${where}.${name}`, stack),
            required: required.has(name),
        }));
    }

    if (node.kind === 'array') {
        node.items = schema.items
            ? normalize(spec, schema.items, `${where}[]`, stack)
            : { kind: 'any', nullable: false };
    }

    return node;
};

const stripUndefined = <T extends object>(value: T): Partial<T> =>
    Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>;

const mergeAll = (parts: Node[], where: string, common: Partial<Node>): Node => {
    if (parts.some((part) => part.kind !== 'object')) {
        throw new UnsupportedError(`${where}: allOf is only supported for objects`);
    }

    const properties = new Map<string, Property>();
    for (const part of parts) {
        for (const property of part.properties ?? []) {
            properties.set(property.name, property);
        }
    }

    return { kind: 'object', nullable: false, properties: [...properties.values()], ...stripUndefined(common) };
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

// A deterministic example value, used when the spec carries none.
export const sample = (node: Node): unknown => {
    if (node.example) return node.example.value;
    if (node.const !== undefined) return node.const;
    if (node.enum) return node.enum[0];

    switch (node.kind) {
        case 'object':
            return Object.fromEntries((node.properties ?? []).map(({ name, node }) => [name, sample(node)]));
        case 'array':
            return node.items ? [sample(node.items)] : [];
        case 'union':
            return node.variants?.[0] ? sample(node.variants[0]) : null;
        case 'string':
            return 'string';
        case 'number':
        case 'integer':
            return 1;
        case 'boolean':
            return true;
        default:
            return null;
    }
};

type RowOptions = {
    // Property names whose children are left out because they are documented elsewhere on the page.
    collapse?: Map<string, string>;
    maxDepth?: number;
};

// One row per property, with nested objects and arrays of objects flattened into dotted names.
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
