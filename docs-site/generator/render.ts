import { type HarRequest, HTTPSnippet } from '@readme/httpsnippet';
import slugify from '@sindresorhus/slugify';
import type {
    MediaTypeObject,
    OpenAPIObject,
    OperationObject,
    ParameterObject,
    ReferenceObject,
    SchemaObject,
} from 'openapi3-ts/oas31';
import type { JsonObject, JsonValue } from 'type-fest';
import { escapeMarkdown } from './markdown';
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

// The generator reads parameters, request bodies and responses where they are
// written, so a `$ref` to one of them is refused.
const inline = <T extends object>(value: T | ReferenceObject, where: string): T => {
    if (isReference(value)) {
        throw new UnsupportedError(`${where}: a $ref to ${value.$ref} is not supported here`);
    }

    return value;
};

// "Media Types" -> "media type". Tag names are plural nouns, so dropping the
// final "s" is enough.
const singular = (tag: string) => tag.toLowerCase().replace(/s$/, '');

// The heading of a tag's model section, which its operations link to. The theme
// gives a heading the id that `slugify` makes of its text.
const modelHeading = (tag: string) => `The ${singular(tag)} model`;

// Descriptions come from the API's source and land inside MDX as a single line,
// where `{`, `}` and `<` would start expressions and tags.
export const escapeMdx = (text: string) => escapeMarkdown(text.replace(/\s+/g, ' ').trim());

const indent = (text: string, spaces: number) =>
    text
        .split('\n')
        .map((line) => (line === '' ? line : ' '.repeat(spaces) + line))
        .join('\n');

const fence = (language: string, title: string | undefined, body: string) =>
    `\`\`\`${language}${title ? ` {{ title: '${title}' }}` : ''}\n${body}\n\`\`\``;

// A JSX attribute has no escape sequences, so a value with a quote or backslash
// goes in as an expression.
const attribute = (value: string) => (/["\\]/.test(value) ? `{${JSON.stringify(value)}}` : `"${value}"`);

const propertyRows = (items: Row[]) =>
    [
        '<Properties>',
        ...items.map(({ name, type, description, required }) =>
            [
                `  <Property name=${attribute(name)} type=${attribute(required ? type : `${type}, optional`)}>`,
                `    ${escapeMdx(description) || '&nbsp;'}`,
                '  </Property>',
            ].join('\n'),
        ),
        '</Properties>',
    ].join('\n');

const label = (path: string) => path.replace(/\{(\w+)\}/g, ':$1');

const parameterRow = (spec: OpenAPIObject, parameter: ParameterObject, where: string): Row => {
    const node = normalize(spec, parameter.schema ?? {}, `${where}.${parameter.name}`);
    return {
        name: parameter.name,
        type: typeLabel(node),
        description: parameter.description ?? node.description ?? '',
        required: parameter.required ?? false,
    };
};

// A response body is `application/json`, or a `+json` type such as the
// `application/problem+json` of an error.
const jsonSchemaOf = (content?: Record<string, MediaTypeObject>): SchemaObject | ReferenceObject | undefined => {
    const types = Object.keys(content ?? {});
    const type = types.find((name) => name === 'application/json') ?? types.find((name) => name.endsWith('+json'));

    return type ? content?.[type]?.schema : undefined;
};

const responseNode = (
    spec: OpenAPIObject,
    operation: OperationObject,
    status: string,
    where: string,
): Node | undefined => {
    const response = operation.responses?.[status];
    const schema = response ? jsonSchemaOf(inline(response, `${where}.responses.${status}`).content) : undefined;
    return schema ? normalize(spec, schema, `${where}.responses.${status}`) : undefined;
};

// A read answers 200 and a create 201, so the page documents whichever 2xx the
// operation declares.
const successStatus = (operation: OperationObject): string | undefined =>
    Object.keys(operation.responses ?? {})
        .sort()
        .find((status) => status.startsWith('2'));

const requestNode = (spec: OpenAPIObject, operation: OperationObject, where: string): Node | undefined => {
    if (!operation.requestBody) return undefined;

    const schema = inline(operation.requestBody, `${where}.requestBody`).content?.['application/json']?.schema;
    if (!schema) {
        throw new UnsupportedError(`${where}: only a JSON request body is supported`);
    }

    return normalize(spec, schema, `${where}.requestBody`);
};

// The model comes from a read, since a write may answer with a different shape.
const modelOf = (spec: OpenAPIObject, endpoints: Endpoint[]): Node | undefined => {
    const reads = endpoints.filter((endpoint) => endpoint.method === 'get');
    const byID = reads.find((endpoint) => endpoint.path.includes('{'));
    const list = reads.find((endpoint) => !endpoint.path.includes('{'));

    for (const endpoint of [byID, list]) {
        const status = endpoint && successStatus(endpoint.operation);
        const node =
            endpoint &&
            status &&
            responseNode(spec, endpoint.operation, status, `${endpoint.method.toUpperCase()} ${endpoint.path}`);
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

// A body example in the model's own words ("AC/DC", not "string"), falling back
// to a synthesized value for a field the model does not have, such as the id of
// a playlist track.
const bodyExample = (spec: OpenAPIObject, body: Node, model: Node | undefined): JsonValue => {
    const known = model ? sample(spec, model) : undefined;
    const values = isObject(known) ? known : {};

    if (body.kind !== 'object') return sample(spec, body);

    return Object.fromEntries(
        (body.properties ?? []).map(({ name, node }) => [name, name in values ? values[name] : sample(spec, node)]),
    );
};

// The request examples, in tab order. httpsnippet has no TypeScript target, but
// its Node `fetch` snippet is valid TypeScript.
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
): string => {
    const where = `${method.toUpperCase()} ${path}`;
    const parameters = (operation.parameters ?? []).map((parameter, index) =>
        inline(parameter, `${where}.parameters[${index}]`),
    );
    const concrete = path.replace(/\{(\w+)\}/g, (_, name: string) => {
        const parameter = parameters.find((candidate) => candidate.name === name);
        return String(sample(spec, normalize(spec, parameter?.schema ?? {}, `${where}.${name}`)));
    });
    const required = parameters.filter((parameter) => parameter.in === 'query' && parameter.required);
    const query = required.length
        ? `?${required.map((parameter) => `${parameter.name}=${sample(spec, normalize(spec, parameter.schema ?? {}, where))}`).join('&')}`
        : '';
    const url = `${baseUrl}${concrete}${query}`;
    const secured = (operation.security?.length ?? 0) > 0;
    const requestBody = requestNode(spec, operation, where);
    const body = requestBody && bodyExample(spec, requestBody, model);

    // HAR types ask for a body even on a GET, so the object is cast once.
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

    return [
        `<CodeGroup title="Request" tag="${method.toUpperCase()}" label="${concrete}">`,
        ...languages.flatMap((language) => ['', example(language)]),
        '',
        '</CodeGroup>',
    ].join('\n');
};

const responseExamples = (spec: OpenAPIObject, { method, path, operation }: Endpoint): string[] => {
    const where = `${method.toUpperCase()} ${path}`;
    const blocks: string[] = [];

    for (const status of Object.keys(operation.responses ?? {}).sort()) {
        const node = responseNode(spec, operation, status, where);
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
): string => {
    const { method, path, operation } = endpoint;
    const where = `${method.toUpperCase()} ${path}`;
    const parameters = (operation.parameters ?? []).map((parameter, index) =>
        parameterRow(spec, inline(parameter, `${where}.parameters[${index}]`), where),
    );
    const required = parameters.filter((row) => row.required);
    const optional = parameters.filter((row) => !row.required);

    const left: string[] = [escapeMdx(operation.description ?? '')];

    if (required.length) left.push('### Required parameters', propertyRows(required));
    if (optional.length) left.push('### Optional parameters', propertyRows(optional));

    const requestBody = requestNode(spec, operation, where);
    if (requestBody) {
        const attributes = rows(requestBody);
        const requiredAttributes = attributes.filter((row) => row.required);
        const optionalAttributes = attributes.filter((row) => !row.required);

        if (requiredAttributes.length) left.push('### Required attributes', propertyRows(requiredAttributes));
        if (optionalAttributes.length) left.push('### Optional attributes', propertyRows(optionalAttributes));
    }

    const status = successStatus(operation);
    const ok = status && responseNode(spec, operation, status, where);
    const data = ok && ok.kind === 'object' ? ok.properties?.find((property) => property.name === 'data') : undefined;
    if (ok && data) {
        const isList = data.node.kind === 'array';
        const row = isList ? data.node.items : data.node;

        // Link to the model only when `data` is the model. A response of
        // another shape, such as a playlist entry, lists its own attributes.
        if (model && row && sameProperties(row, model)) {
            const note = `${isList ? `The ${tag.toLowerCase()} on this page` : `The ${singular(tag)}`}. See [the ${singular(tag)} model](#${slugify(modelHeading(tag))}).`;

            left.push('### Response attributes', propertyRows(rows(ok, { collapse: new Map([['data', note]]) })));
        } else {
            left.push('### Response attributes', propertyRows(rows(ok)));
        }
    } else if (model) {
        left.push(`Returns [the ${singular(tag)} model](#${slugify(modelHeading(tag))}).`);
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
    if (errors.length) left.push('### Errors', propertyRows(errors));

    const right = [requestExamples(spec, endpoint, model, baseUrl), ...responseExamples(spec, endpoint)];

    return [
        `## ${escapeMdx(operation.summary ?? '')} {{ tag: '${method.toUpperCase()}', label: '${label(path)}' }}`,
        '',
        '<Row>',
        '  <Col>',
        '',
        indent(left.join('\n\n'), 4),
        '',
        '  </Col>',
        '  <Col sticky>',
        '',
        indent(right.join('\n\n'), 4),
        '',
        '  </Col>',
        '</Row>',
    ].join('\n');
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

    // A collection comes before the operations on one item, and the operations
    // on one path run in METHODS order.
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
    const model = modelOf(spec, endpoints);
    const name = singular(tag);

    const parts = [
        [
            'export const metadata = {',
            `  title: ${JSON.stringify(tag)},`,
            `  description: ${JSON.stringify(description)},`,
            '}',
        ].join('\n'),
        `# ${escapeMdx(tag)}`,
        `${escapeMdx(description)} {{ className: 'lead' }}`,
    ];

    if (model) {
        parts.push(
            `## ${modelHeading(tag)}`,
            `The ${name} model contains the following properties.`,
            '### Properties',
            propertyRows(rows(model)),
            '---',
        );
    }

    parts.push(endpoints.map((endpoint) => section(spec, endpoint, tag, model, baseUrl)).join('\n\n---\n\n'));

    return `${parts.join('\n\n')}\n`;
};
