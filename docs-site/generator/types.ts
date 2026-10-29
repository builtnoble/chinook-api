// The slice of OpenAPI 3.1 the generator reads. Anything outside it is rejected by `normalize`.
export type Schema = {
    $ref?: string;
    type?: string | string[];
    format?: string;
    description?: string;
    properties?: Record<string, Schema>;
    required?: string[];
    items?: Schema;
    anyOf?: Schema[];
    oneOf?: Schema[];
    allOf?: Schema[];
    const?: unknown;
    enum?: unknown[];
    example?: unknown;
    examples?: unknown[];
    additionalProperties?: boolean | Schema;
    [keyword: string]: unknown;
};

export type Parameter = {
    in: 'query' | 'path' | 'header' | 'cookie';
    name: string;
    required?: boolean;
    description?: string;
    schema?: Schema;
};

export type Response = {
    description?: string;
    content?: Record<string, { schema?: Schema }>;
};

export type Operation = {
    operationId?: string;
    tags?: string[];
    summary?: string;
    description?: string;
    parameters?: Parameter[];
    security?: unknown[];
    responses?: Record<string, Response>;
};

export type Spec = {
    info: { title: string; version: string; description?: string };
    servers?: { url: string }[];
    tags?: { name: string; description?: string }[];
    paths: Record<string, Record<string, Operation>>;
    components?: { schemas?: Record<string, Schema> };
};

export type Guide = {
    title: string;
    href: string;
    description?: string;
    source: string;
};
