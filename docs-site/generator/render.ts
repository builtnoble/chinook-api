import { type Node, normalize, type Row, rows, sample, typeLabel, UnsupportedError, unwrapData } from './schema';
import type { Operation, Parameter, Schema, Spec } from './types';

export type Endpoint = { method: string; path: string; operation: Operation };

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

export const slugify = (text: string) =>
    text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

// "Media Types" -> "media type". Tag names are plural nouns, so dropping the
// final "s" is enough.
const singular = (tag: string) => tag.toLowerCase().replace(/s$/, '');

// Descriptions come from the API's source and land inside MDX, where `{`, `}`
// and `<` start expressions and tags. Backslash-escape them outside code spans,
// which MDX leaves alone.
export const escapeMdx = (text: string) =>
    text
        .replace(/\s+/g, ' ')
        .trim()
        .split(/(`[^`]*`)/)
        .map((part, index) => (index % 2 ? part : part.replace(/[{}<]/g, (char) => `\\${char}`)))
        .join('');

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

const parameterRow = (spec: Spec, parameter: Parameter, where: string): Row => {
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
const jsonSchemaOf = (content?: Record<string, { schema?: Schema }>): Schema | undefined => {
    const types = Object.keys(content ?? {});
    const type = types.find((name) => name === 'application/json') ?? types.find((name) => name.endsWith('+json'));

    return type ? content?.[type]?.schema : undefined;
};

const responseNode = (spec: Spec, operation: Operation, status: string, where: string): Node | undefined => {
    const schema = jsonSchemaOf(operation.responses?.[status]?.content);
    return schema ? normalize(spec, schema, `${where}.responses.${status}`) : undefined;
};

// A read answers 200 and a create 201, so the page documents whichever 2xx the
// operation declares.
const successStatus = (operation: Operation): string | undefined =>
    Object.keys(operation.responses ?? {})
        .sort()
        .find((status) => status.startsWith('2'));

const requestNode = (spec: Spec, operation: Operation, where: string): Node | undefined => {
    if (!operation.requestBody) return undefined;

    const schema = operation.requestBody.content?.['application/json']?.schema;
    if (!schema) {
        throw new UnsupportedError(`${where}: only a JSON request body is supported`);
    }

    return normalize(spec, schema, `${where}.requestBody`);
};

// The model comes from a read, since a write may answer with a different shape.
const modelOf = (spec: Spec, endpoints: Endpoint[]): Node | undefined => {
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

const exampleValue = (node: Node) => JSON.stringify(sample(node), null, 2);

// A body example in the model's own words ("AC/DC", not "string"), falling back
// to a synthesized value for a field the model does not have, such as the id of
// a playlist track.
const bodyExample = (body: Node, model: Node | undefined): unknown => {
    const known = model ? sample(model) : undefined;
    const values = known && typeof known === 'object' ? (known as Record<string, unknown>) : {};

    if (body.kind !== 'object') return sample(body);

    return Object.fromEntries(
        (body.properties ?? []).map(({ name, node }) => [name, name in values ? values[name] : sample(node)]),
    );
};

const jsString = (value: string) => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;

const jsKey = (key: string) => (/^[A-Za-z_$][\w$]*$/.test(key) ? key : jsString(key));

// A JSON value as a JavaScript literal: one line when short, one property per
// line otherwise.
const jsLiteral = (value: unknown, depth = 0): string => {
    if (typeof value === 'string') return jsString(value);
    if (Array.isArray(value)) return `[${value.map((item) => jsLiteral(item, depth + 1)).join(', ')}]`;
    if (value === null || typeof value !== 'object') return JSON.stringify(value);

    const entries = Object.entries(value).map(([key, item]) => `${jsKey(key)}: ${jsLiteral(item, depth + 1)}`);
    if (!entries.length) return '{}';

    const inline = `{ ${entries.join(', ')} }`;
    if (!inline.includes('\n') && inline.length + depth * 2 <= 60) return inline;

    const pad = '  '.repeat(depth + 1);
    return `{\n${entries.map((entry) => `${pad}${entry}`).join(',\n')},\n${'  '.repeat(depth)}}`;
};

// A shell single-quoted string: a quote inside it closes the string, adds an
// escaped quote and reopens it.
const shellQuote = (text: string) => `'${text.replace(/'/g, `'\\''`)}'`;

const requestExamples = (
    spec: Spec,
    { method, path, operation }: Endpoint,
    model: Node | undefined,
    baseUrl: string,
): string => {
    const where = `${method.toUpperCase()} ${path}`;
    const parameters = operation.parameters ?? [];
    const concrete = path.replace(/\{(\w+)\}/g, (_, name: string) => {
        const parameter = parameters.find((candidate) => candidate.name === name);
        return String(sample(normalize(spec, parameter?.schema ?? {}, `${where}.${name}`)));
    });
    const required = parameters.filter((parameter) => parameter.in === 'query' && parameter.required);
    const query = required.length
        ? `?${required.map((parameter) => `${parameter.name}=${sample(normalize(spec, parameter.schema ?? {}, where))}`).join('&')}`
        : '';
    const url = `${baseUrl}${concrete}${query}`;
    const secured = (operation.security?.length ?? 0) > 0;
    const requestBody = requestNode(spec, operation, where);
    const body = requestBody && bodyExample(requestBody, model);

    const compact = JSON.stringify(body);
    const prettyBody = JSON.stringify(body, null, 2);

    const curl = [
        `curl ${method === 'get' ? '' : `-X ${method.toUpperCase()} `}${url}`,
        ...(secured ? ['-H "Authorization: Bearer {token}"'] : []),
        ...(requestBody ? ['-H "Content-Type: application/json"'] : []),
        ...(requestBody ? [`-d ${shellQuote(compact.length <= 60 ? compact : prettyBody)}`] : []),
    ].join(' \\\n  ');

    const options = [
        ...(method === 'get' ? [] : [`  method: '${method.toUpperCase()}',`]),
        // biome-ignore lint/suspicious/noTemplateCurlyInString: `${token}` belongs to the generated example
        ...(secured && !requestBody ? ['  headers: { Authorization: `Bearer ${token}` },'] : []),
        ...(requestBody
            ? [
                  '  headers: {',
                  // biome-ignore lint/suspicious/noTemplateCurlyInString: `${token}` belongs to the generated example
                  ...(secured ? ['    Authorization: `Bearer ${token}`,'] : []),
                  "    'Content-Type': 'application/json',",
                  '  },',
                  `  body: JSON.stringify(${jsLiteral(body, 1)}),`,
              ]
            : []),
    ];

    const js = [
        `const response = await fetch('${url}'${options.length ? ', {' : ')'}`,
        ...(options.length ? [...options, '})'] : []),
        'const body = await response.json()',
    ].join('\n');

    return [
        `<CodeGroup title="Request" tag="${method.toUpperCase()}" label="${concrete}">`,
        '',
        fence('bash', 'cURL', curl),
        '',
        fence('js', undefined, js),
        '',
        '</CodeGroup>',
    ].join('\n');
};

const responseExamples = (spec: Spec, { method, path, operation }: Endpoint): string[] => {
    const where = `${method.toUpperCase()} ${path}`;
    const blocks: string[] = [];

    for (const status of Object.keys(operation.responses ?? {}).sort()) {
        const node = responseNode(spec, operation, status, where);
        if (!node) continue;

        const variants = node.kind === 'union' && node.variants ? node.variants : [node];
        for (const variant of variants) {
            const title = status.startsWith('2') ? 'Response' : `Error response (${status})`;
            blocks.push(fence('json', title, exampleValue(variant)));
        }
    }

    return blocks;
};

const section = (spec: Spec, endpoint: Endpoint, tag: string, model: Node | undefined, baseUrl: string): string => {
    const { method, path, operation } = endpoint;
    const where = `${method.toUpperCase()} ${path}`;
    const parameters = (operation.parameters ?? []).map((parameter) => parameterRow(spec, parameter, where));
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
            const note = `${isList ? `The ${tag.toLowerCase()} on this page` : `The ${singular(tag)}`}. See [the ${singular(tag)} model](#the-${slugify(singular(tag))}-model).`;

            left.push('### Response attributes', propertyRows(rows(ok, { collapse: new Map([['data', note]]) })));
        } else {
            left.push('### Response attributes', propertyRows(rows(ok)));
        }
    } else if (model) {
        left.push(`Returns [the ${singular(tag)} model](#the-${slugify(singular(tag))}-model).`);
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

export const endpointsByTag = (spec: Spec): Map<string, Endpoint[]> => {
    const declared = new Map((spec.tags ?? []).map((tag) => [tag.name, tag.description]));
    const byTag = new Map<string, Endpoint[]>((spec.tags ?? []).map((tag) => [tag.name, []]));

    for (const [path, methods] of Object.entries(spec.paths)) {
        for (const [method, operation] of Object.entries(methods)) {
            if (!METHODS.includes(method)) continue;

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

export const renderTagPage = (spec: Spec, tag: string, endpoints: Endpoint[], baseUrl: string): string => {
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
            `## The ${name} model`,
            `The ${name} model contains the following properties.`,
            '### Properties',
            propertyRows(rows(model)),
            '---',
        );
    }

    parts.push(endpoints.map((endpoint) => section(spec, endpoint, tag, model, baseUrl)).join('\n\n---\n\n'));

    return `${parts.join('\n\n')}\n`;
};
