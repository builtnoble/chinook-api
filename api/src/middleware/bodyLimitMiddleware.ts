import { createMiddleware } from 'hono/factory';
import { problem } from '@/lib/problem-details';

// Catalog rows are a few short fields, so 100 KB is far more than a valid write
// needs.
export const maxBodyBytes = 100 * 1024;

const tooLarge = () => problem(413, 'The request body is too large.');

// A client that declares the length of its body is refused before the body is
// read. One that does not, such as a chunked upload, is counted as the body is
// read. Hono's own bodyLimit would answer 413 only if the handler let the
// failure through, and the JSON validator turns it into a 400 for malformed
// JSON, so the overflow is recorded here and answered once the handler is done.
const bodyLimitMiddleware = createMiddleware(async (c, next) => {
    const body = c.req.raw.body;

    if (!body) {
        return await next();
    }

    const declared = c.req.header('Content-Length');

    if (declared !== undefined) {
        if (Number.parseInt(declared, 10) > maxBodyBytes) {
            throw tooLarge();
        }

        return await next();
    }

    let size = 0;
    let exceeded = false;

    const counted = body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
                size += chunk.byteLength;

                if (size > maxBodyBytes) {
                    exceeded = true;
                    controller.error(new Error('The request body is too large.'));

                    return;
                }

                controller.enqueue(chunk);
            },
        }),
    );

    c.req.raw = new Request(c.req.raw, { body: counted, duplex: 'half' } as RequestInit);

    await next();

    if (exceeded) {
        c.res = tooLarge().getResponse();
    }
});

export default bodyLimitMiddleware;
