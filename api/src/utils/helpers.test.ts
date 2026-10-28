/// <reference types="bun" />
import { describe, expect, it } from 'bun:test';
import { stripErrorDetails } from './helpers';

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
    new Response(JSON.stringify(body), {
        ...init,
        headers: { 'Content-Type': 'application/json', ...init.headers },
    });

const leaky = {
    code: 'FAILED_TO_CREATE_USER',
    message: 'Failed to create user',
    details: { query: 'insert into "users" (...) values ($1, default)', params: ['a@example.test'], cause: {} },
};

describe('stripErrorDetails', () => {
    it('removes details from a JSON error response and keeps everything else', async () => {
        const res = await stripErrorDetails(
            jsonResponse(leaky, {
                status: 422,
                statusText: 'Unprocessable Entity',
                headers: { 'X-Request-Id': 'abc' },
            }),
        );

        expect(res.status).toBe(422);
        expect(res.statusText).toBe('Unprocessable Entity');
        expect(res.headers.get('X-Request-Id')).toBe('abc');
        expect(res.headers.get('Content-Type')).toBe('application/json');
        expect(await res.json()).toEqual({ code: 'FAILED_TO_CREATE_USER', message: 'Failed to create user' });
    });

    it('keeps every Set-Cookie header', async () => {
        const headers = new Headers({ 'Content-Type': 'application/json' });
        headers.append('Set-Cookie', 'a=1; Path=/');
        headers.append('Set-Cookie', 'b=2; Path=/');

        const res = await stripErrorDetails(new Response(JSON.stringify(leaky), { status: 400, headers }));

        expect(res.headers.getSetCookie()).toEqual(['a=1; Path=/', 'b=2; Path=/']);
    });

    it('serves a body that matches its Content-Length', async () => {
        const res = await stripErrorDetails(
            jsonResponse(leaky, { status: 422, headers: { 'Content-Length': '1030' } }),
        );

        const text = await res.text();
        const length = res.headers.get('Content-Length');

        expect(length === null || Number(length) === new TextEncoder().encode(text).length).toBe(true);
    });

    it('leaves a successful response untouched, even if it has a details field', async () => {
        const original = jsonResponse({ ok: true, details: 'kept' }, { status: 200 });

        const res = await stripErrorDetails(original);

        expect(res).toBe(original);
        expect(await res.json()).toEqual({ ok: true, details: 'kept' });
    });

    it('leaves an error response without details untouched', async () => {
        const original = jsonResponse(
            { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' },
            { status: 401 },
        );

        expect(await stripErrorDetails(original)).toBe(original);
    });

    it('leaves a non-JSON error response untouched', async () => {
        const original = new Response('details: something', { status: 500, headers: { 'Content-Type': 'text/plain' } });

        expect(await stripErrorDetails(original)).toBe(original);
    });

    it('leaves a malformed JSON error body untouched', async () => {
        const original = new Response('{not json', { status: 500, headers: { 'Content-Type': 'application/json' } });

        const res = await stripErrorDetails(original);

        expect(res).toBe(original);
        expect(await res.text()).toBe('{not json');
    });
});
