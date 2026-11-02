import { describe, expect, it } from 'bun:test';
import z from 'zod';
import { updateSchema } from '@/utils/schema/requestSchema';

const schema = updateSchema(z.object({ name: z.string().min(1), size: z.number() }));

describe('updateSchema', () => {
    it('takes any one field of the create schema', () => {
        expect(schema.safeParse({ name: 'Renamed' }).success).toBe(true);
        expect(schema.safeParse({ size: 2 }).success).toBe(true);
    });

    it('rejects an empty body, which would update nothing', () => {
        const result = schema.safeParse({});

        expect(result.success).toBe(false);
        expect(JSON.stringify(result.error?.issues)).toContain('At least one field is required.');
    });

    it('still rejects an unknown key and a value that is not valid', () => {
        expect(schema.safeParse({ colour: 'red' }).success).toBe(false);
        expect(schema.safeParse({ name: '' }).success).toBe(false);
    });
});
