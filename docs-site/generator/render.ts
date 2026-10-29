import { type Node, normalize, type Row, rows, sample, typeLabel, UnsupportedError, unwrapData } from './schema';
import type { Operation, Parameter, Spec } from './types';

export type Endpoint = { method: string; path: string; operation: Operation };

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

export const slugify = (text: string) =>
    text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

// "Media Types" -> "media type". Tag names are plural nouns, so dropping the final "s" is enough.
const singular = (tag: string) => tag.toLowerCase().replace(/s$/, '');

// Descriptions come from the API's source and land inside MDX, where `{`, `}` and `<` start expressions and
// tags. Backslash-escape them outside code spans, which MDX leaves alone.
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

// A JSX attribute has no escape sequences, so a value with a quote or backslash goes in as an expression.
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

const responseNode = (spec: Spec, operation: Operation, status: string, where: string): Node | undefined => {
    const schema = operation.responses?.[status]?.content?.['application/json']?.schema;
    return schema ? normalize(spec, schema, `${where}.responses.${status}`) : undefined;
};

const modelOf = (spec: Spec, endpoints: Endpoint[]): Node | undefined => {
    const byID = endpoints.find((endpoint) => endpoint.path.includes('{'));
    const list = endpoints.find((endpoint) => !endpoint.path.includes('{'));

    for (const endpoint of [byID, list]) {
        const node =
            endpoint &&
            responseNode(spec, endpoint.operation, '200', `${endpoint.method.toUpperCase()} ${endpoint.path}`);
        if (!node) continue;

        const data = unwrapData(node);
        const model = data.kind === 'array' ? data.items : data;
        if (model?.kind === 'object') return model;
    }

    return undefined;
};

const exampleValue = (node: Node) => JSON.stringify(sample(node), null, 2);

const requestExamples = (spec: Spec, { method, path, operation }: Endpoint, baseUrl: string): string => {
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

    const curl = [
        `curl ${method === 'get' ? '' : `-X ${method.toUpperCase()} `}${url}${secured ? ' \\' : ''}`,
        ...(secured ? ['  -H "Authorization: Bearer {token}"'] : []),
    ].join('\n');

    const js = [
        `const response = await fetch('${url}'${secured ? ', {' : ')'}`,
        // biome-ignore lint/suspicious/noTemplateCurlyInString: `${token}` belongs to the generated example
        ...(secured ? ['  headers: { Authorization: `Bearer ${token}` },', '})'] : []),
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

    const ok = responseNode(spec, operation, '200', where);
    if (ok?.kind === 'object' && ok.properties?.some((property) => property.name === 'data')) {
        const isList = ok.properties.find((property) => property.name === 'data')?.node.kind === 'array';
        const note = `${isList ? `The ${tag.toLowerCase()} on this page` : `The ${singular(tag)}`}. See [the ${singular(tag)} model](#the-${slugify(singular(tag))}-model).`;

        left.push('### Response attributes', propertyRows(rows(ok, { collapse: new Map([['data', note]]) })));
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

    const right = [requestExamples(spec, endpoint, baseUrl), ...responseExamples(spec, endpoint)];

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

    // A collection comes before the operations on one item.
    for (const endpoints of byTag.values()) {
        endpoints.sort((a, b) => Number(a.path.includes('{')) - Number(b.path.includes('{')));
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
