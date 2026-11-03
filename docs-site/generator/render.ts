import { type HarRequest, HTTPSnippet } from '@readme/httpsnippet';
import slugify from '@sindresorhus/slugify';
import type { RootContent } from 'mdast';
import type {
    MediaTypeObject,
    OpenAPIObject,
    OperationObject,
    ParameterObject,
    ReferenceObject,
    SchemaObject,
} from 'openapi3-ts/oas31';
import type { JsonObject, JsonValue } from 'type-fest';
import { type Block, directive, entity, esm, fence, heading, jsx, mdx, paragraph, phrasing, rule, text } from './mdx';
import {
    isReference,
    type Node,
    normalize,
    type Row,
    rows,
    sample,
    typeLabel,
    UnsupportedError,
    unwrapData,
} from './schema';

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

export type Endpoint = { method: (typeof METHODS)[number]; path: string; operation: OperationObject };

// Parameters, request bodies and responses must be written out in full. A
// `$ref` in their place is rejected.
const inline = <T extends object>(value: T | ReferenceObject, where: string): T => {
    if (isReference(value)) {
        throw new UnsupportedError(`${where}: a $ref to ${value.$ref} is not supported here`);
    }

    return value;
};

// "Media Types" becomes "media type". Dropping the final "s" is enough for the
// tag names used here.
const singular = (tag: string) => tag.toLowerCase().replace(/s$/, '');

// The heading of a tag's model section, which the operations link to. The theme
// builds a heading's anchor from its text with `slugify`.
const modelHeading = (tag: string) => `The ${singular(tag)} model`;

const propertyRows = (items: Row[], where: string) =>
    jsx(
        'Properties',
        {},
        items.map(({ name, type, description, required }) =>
            jsx('Property', { name, type: required ? type : `${type}, optional` }, [
                description ? paragraph(phrasing(description, `${where}.${name}`)) : entity('&nbsp;'),
            ]),
        ),
    );

const label = (path: string) => path.replace(/\{(\w+)\}/g, ':$1');

const parameterRow = (parameter: ParameterObject, where: string): Row => {
    const node = normalize(parameter.schema ?? {}, `${where}.${parameter.name}`);
    return {
        name: parameter.name,
        type: typeLabel(node),
        description: parameter.description ?? node.description ?? '',
        required: parameter.required ?? false,
    };
};

// Picks the JSON schema of a response: `application/json`, or a `+json` type
// such as the `application/problem+json` used for errors.
const jsonSchemaOf = (content?: Record<string, MediaTypeObject>): SchemaObject | ReferenceObject | undefined => {
    const types = Object.keys(content ?? {});
    const type = types.find((name) => name === 'application/json') ?? types.find((name) => name.endsWith('+json'));

    return type ? content?.[type]?.schema : undefined;
};

const responseNode = (operation: OperationObject, status: string, where: string): Node | undefined => {
    const response = operation.responses?.[status];
    const schema = response ? jsonSchemaOf(inline(response, `${where}.responses.${status}`).content) : undefined;
    return schema ? normalize(schema, `${where}.responses.${status}`) : undefined;
};

// The success status of an operation: 200 for a read, 201 for a create, or
// whichever 2xx it declares.
const successStatus = (operation: OperationObject): string | undefined =>
    Object.keys(operation.responses ?? {})
        .sort()
        .find((status) => status.startsWith('2'));

const requestNode = (operation: OperationObject, where: string): Node | undefined => {
    if (!operation.requestBody) return undefined;

    const schema = inline(operation.requestBody, `${where}.requestBody`).content?.['application/json']?.schema;
    if (!schema) {
        throw new UnsupportedError(`${where}: only a JSON request body is supported`);
    }

    return normalize(schema, `${where}.requestBody`);
};

// The model is read from a GET route, because a write can answer with something
// else.
const modelOf = (endpoints: Endpoint[]): Node | undefined => {
    const reads = endpoints.filter((endpoint) => endpoint.method === 'get');
    const byID = reads.find((endpoint) => endpoint.path.includes('{'));
    const list = reads.find((endpoint) => !endpoint.path.includes('{'));

    for (const endpoint of [byID, list]) {
        const status = endpoint && successStatus(endpoint.operation);
        const node =
            endpoint &&
            status &&
            responseNode(endpoint.operation, status, `${endpoint.method.toUpperCase()} ${endpoint.path}`);
        if (!node) continue;

        const data = unwrapData(node);
        const model = data.kind === 'array' ? data.items : data;
        if (model?.kind === 'object') return model;
    }

    return undefined;
};

const sameProperties = (a: Node, b: Node) => {
    const names = (node: Node) => (node.properties ?? []).map((property) => property.name).sort();

    return a.kind === 'object' && b.kind === 'object' && names(a).join() === names(b).join();
};

const exampleValue = (spec: OpenAPIObject, node: Node) => JSON.stringify(sample(spec, node), null, 2);

const isObject = (value: JsonValue | undefined): value is JsonObject =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

// An example request body. Values come from the model where it has them
// ("AC/DC" rather than "string"), and are made up for fields it does not have,
// such as the id of a playlist track.
const bodyExample = (spec: OpenAPIObject, body: Node, model: Node | undefined): JsonValue => {
    const known = model ? sample(spec, model) : undefined;
    const values = isObject(known) ? known : {};

    if (body.kind !== 'object') return sample(spec, body);

    return Object.fromEntries(
        (body.properties ?? []).map(({ name, node }) => [name, name in values ? values[name] : sample(spec, node)]),
    );
};

// The request examples, in the order of the tabs. The TypeScript tab uses the
// Node `fetch` example, which is valid TypeScript.
const languages = [
    { language: 'bash', title: 'cURL', target: 'shell', client: 'curl' },
    { language: 'ts', title: 'TypeScript', target: 'node', client: 'fetch' },
    { language: 'php', title: 'PHP', target: 'php', client: 'guzzle' },
] as const;

const requestExamples = (
    spec: OpenAPIObject,
    { method, path, operation }: Endpoint,
    model: Node | undefined,
    baseUrl: string,
): Block => {
    const where = `${method.toUpperCase()} ${path}`;
    const parameters = (operation.parameters ?? []).map((parameter, index) =>
        inline(parameter, `${where}.parameters[${index}]`),
    );
    const concrete = path.replace(/\{(\w+)\}/g, (_, name: string) => {
        const parameter = parameters.find((candidate) => candidate.name === name);
        return String(sample(spec, normalize(parameter?.schema ?? {}, `${where}.${name}`)));
    });
    const required = parameters.filter((parameter) => parameter.in === 'query' && parameter.required);
    const query = required.length
        ? `?${required.map((parameter) => `${parameter.name}=${sample(spec, normalize(parameter.schema ?? {}, where))}`).join('&')}`
        : '';
    const url = `${baseUrl}${concrete}${query}`;
    const secured = (operation.security?.length ?? 0) > 0;
    const requestBody = requestNode(operation, where);
    const body = requestBody && bodyExample(spec, requestBody, model);

    // The snippet library wants a body on every request, even a GET, so the
    // type is cast here.
    const snippet = new HTTPSnippet({
        method: method.toUpperCase(),
        url,
        httpVersion: 'HTTP/1.1',
        cookies: [],
        headers: [
            ...(secured ? [{ name: 'Authorization', value: 'Bearer {token}' }] : []),
            ...(requestBody ? [{ name: 'Content-Type', value: 'application/json' }] : []),
        ],
        queryString: [],
        headersSize: -1,
        bodySize: -1,
        ...(requestBody ? { postData: { mimeType: 'application/json', text: JSON.stringify(body) } } : {}),
    } as HarRequest);

    const example = ({ language, title, target, client }: (typeof languages)[number]) => {
        const [code] = snippet.convert(target, client);
        if (!code) throw new UnsupportedError(`${where}: no ${client} snippet for ${target}`);

        return fence(language, title, code);
    };

    return jsx('CodeGroup', { title: 'Request', tag: method.toUpperCase(), label: concrete }, languages.map(example));
};

const responseExamples = (spec: OpenAPIObject, { method, path, operation }: Endpoint): Block[] => {
    const where = `${method.toUpperCase()} ${path}`;
    const blocks: Block[] = [];

    for (const status of Object.keys(operation.responses ?? {}).sort()) {
        const node = responseNode(operation, status, where);
        if (!node) continue;

        const variants = node.kind === 'union' && node.variants ? node.variants : [node];
        for (const variant of variants) {
            const title = status.startsWith('2') ? 'Response' : `Error response (${status})`;
            blocks.push(fence('json', title, exampleValue(spec, variant)));
        }
    }

    return blocks;
};

const section = (
    spec: OpenAPIObject,
    endpoint: Endpoint,
    tag: string,
    model: Node | undefined,
    baseUrl: string,
): Block[] => {
    const { method, path, operation } = endpoint;
    const where = `${method.toUpperCase()} ${path}`;
    const parameters = (operation.parameters ?? []).map((parameter, index) =>
        parameterRow(inline(parameter, `${where}.parameters[${index}]`), where),
    );
    const required = parameters.filter((row) => row.required);
    const optional = parameters.filter((row) => !row.required);

    const description = phrasing(operation.description ?? '', where);
    const left: Block[] = description.length ? [paragraph(description)] : [];

    if (required.length) left.push(heading(3, 'Required parameters'), propertyRows(required, where));
    if (optional.length) left.push(heading(3, 'Optional parameters'), propertyRows(optional, where));

    const requestBody = requestNode(operation, where);
    if (requestBody) {
        const attributes = rows(requestBody);
        const requiredAttributes = attributes.filter((row) => row.required);
        const optionalAttributes = attributes.filter((row) => !row.required);

        if (requiredAttributes.length) {
            left.push(heading(3, 'Required attributes'), propertyRows(requiredAttributes, where));
        }
        if (optionalAttributes.length) {
            left.push(heading(3, 'Optional attributes'), propertyRows(optionalAttributes, where));
        }
    }

    const status = successStatus(operation);
    const ok = status && responseNode(operation, status, where);
    const data = ok && ok.kind === 'object' ? ok.properties?.find((property) => property.name === 'data') : undefined;
    if (ok && data) {
        const isList = data.node.kind === 'array';
        const row = isList ? data.node.items : data.node;

        // Link to the model only when `data` is the model. A response with a
        // different shape, such as a playlist entry, lists its own attributes
        // instead.
        if (model && row && sameProperties(row, model)) {
            const note = `${isList ? `The ${tag.toLowerCase()} on this page` : `The ${singular(tag)}`}. See [the ${singular(tag)} model](#${slugify(modelHeading(tag))}).`;

            left.push(
                heading(3, 'Response attributes'),
                propertyRows(rows(ok, { collapse: new Map([['data', note]]) }), where),
            );
        } else {
            left.push(heading(3, 'Response attributes'), propertyRows(rows(ok), where));
        }
    } else if (model) {
        left.push(paragraph(phrasing(`Returns [the ${singular(tag)} model](#${slugify(modelHeading(tag))}).`, where)));
    }

    const errors = Object.entries(operation.responses ?? {})
        .filter(([status]) => !status.startsWith('2'))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(
            ([status, response]): Row => ({
                name: status,
                type: 'error',
                description: response.description ?? '',
                required: true,
            }),
        );
    if (errors.length) left.push(heading(3, 'Errors'), propertyRows(errors, where));

    const right = [requestExamples(spec, endpoint, model, baseUrl), ...responseExamples(spec, endpoint)];

    return [
        heading(2, [
            ...phrasing(operation.summary ?? '', where),
            text(' '),
            directive({ tag: method.toUpperCase(), label: label(path) }),
        ]),
        jsx('Row', {}, [jsx('Col', {}, left), jsx('Col', { sticky: true }, right)]),
    ];
};

export const endpointsByTag = (spec: OpenAPIObject): Map<string, Endpoint[]> => {
    const declared = new Map((spec.tags ?? []).map((tag) => [tag.name, tag.description]));
    const byTag = new Map<string, Endpoint[]>((spec.tags ?? []).map((tag) => [tag.name, []]));

    for (const [path, item] of Object.entries(spec.paths ?? {})) {
        for (const method of METHODS) {
            const operation = item[method];
            if (!operation) continue;

            const where = `${method.toUpperCase()} ${path}`;
            const [tag, ...rest] = operation.tags ?? [];
            if (!tag || rest.length) {
                throw new UnsupportedError(`${where}: expected exactly one tag`);
            }
            if (!declared.get(tag)) {
                throw new UnsupportedError(`${where}: tag "${tag}" is not declared with a description`);
            }
            if (!operation.summary || !operation.description) {
                throw new UnsupportedError(`${where}: a summary and a description are required`);
            }

            byTag.get(tag)?.push({ method, path, operation });
        }
    }

    // Routes for a whole collection come first, then routes for a single item.
    // Routes on the same path go in method order: get, post, put, patch, delete.
    const params = (path: string) => (path.match(/\{/g) ?? []).length;
    for (const endpoints of byTag.values()) {
        endpoints.sort(
            (a, b) =>
                params(a.path) - params(b.path) ||
                a.path.localeCompare(b.path) ||
                METHODS.indexOf(a.method) - METHODS.indexOf(b.method),
        );
    }

    return byTag;
};

export const renderTagPage = (spec: OpenAPIObject, tag: string, endpoints: Endpoint[], baseUrl: string): string => {
    const description = spec.tags?.find((candidate) => candidate.name === tag)?.description ?? '';
    const model = modelOf(endpoints);

    const page: RootContent[] = [
        esm(
            [
                'export const metadata = {',
                `  title: ${JSON.stringify(tag)},`,
                `  description: ${JSON.stringify(description)},`,
                '}',
            ].join('\n'),
        ),
        heading(1, phrasing(tag, tag)),
        paragraph([...phrasing(description, tag), text(' '), directive({ className: 'lead' })]),
    ];

    if (model) {
        page.push(
            heading(2, modelHeading(tag)),
            paragraph(`The ${singular(tag)} model contains the following properties.`),
            heading(3, 'Properties'),
            propertyRows(rows(model), tag),
            rule,
        );
    }

    endpoints.forEach((endpoint, index) => {
        if (index) page.push(rule);
        page.push(...section(spec, endpoint, tag, model, baseUrl));
    });

    return mdx(page);
};
