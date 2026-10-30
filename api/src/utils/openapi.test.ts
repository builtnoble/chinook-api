/// <reference types="bun" />
import { describe, expect, it } from 'bun:test';
import z from 'zod';
import { describeCreate, describeDelete, describeUpdate } from '@/utils/openapi';

const schema = z.object({ id: z.number(), name: z.string() }).meta({ examples: [{ id: 1, name: 'Music' }] });
const body = z.object({ name: z.string() }).strict();

const common = { operationId: 'op', tag: 'Things', summary: 'Do it', description: 'Does it.', schema };

const statuses = (options: { responses?: unknown }) => Object.keys(options.responses as object);

describe('describeCreate', () => {
    const options = describeCreate({ ...common, body });

    it('documents a 201 and the write errors, with the bearer scheme', () => {
        expect(statuses(options)).toEqual(['201', '400', '401', '403', '409', '422']);
        expect(options.security).toEqual([{ bearerAuth: [] }]);
    });

    it('requires a JSON request body', () => {
        expect(options.requestBody).toMatchObject({ required: true });
        expect(Object.keys((options.requestBody as { content: object }).content)).toEqual(['application/json']);
    });

    it('carries the operation text through', () => {
        expect(options).toMatchObject({
            operationId: 'op',
            tags: ['Things'],
            summary: 'Do it',
            description: 'Does it.',
        });
    });
});

describe('describeUpdate', () => {
    const options = describeUpdate({ ...common, body });

    it('documents a 200 and adds the 404 for an unknown or deleted id', () => {
        expect(statuses(options)).toEqual(['200', '400', '401', '403', '404', '409', '422']);
    });

    it('requires a JSON request body', () => {
        expect(options.requestBody).toMatchObject({ required: true });
    });
});

describe('describeDelete', () => {
    it('documents a 200 and the 404, with no request body and no 409 by default', () => {
        const options = describeDelete(common);

        expect(statuses(options)).toEqual(['200', '400', '401', '403', '404']);
        expect(options.requestBody).toBeUndefined();
    });

    it('adds the 409 when something can block the delete', () => {
        const options = describeDelete({ ...common, blockedBy: 'The artist still has albums.' });

        expect(statuses(options)).toEqual(['200', '400', '401', '403', '404', '409']);
        expect((options.responses as Record<string, { description: string }>)[409].description).toBe(
            'The artist still has albums.',
        );
    });
});
