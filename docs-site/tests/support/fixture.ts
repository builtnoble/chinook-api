import { readFileSync } from 'node:fs';
import type { OpenAPIObject as Spec } from 'openapi3-ts/oas31';

export const fixture = JSON.parse(readFileSync(new URL('../fixtures/openapi.json', import.meta.url), 'utf8')) as Spec;
export const contentDir = new URL('../fixtures/content', import.meta.url).pathname;
