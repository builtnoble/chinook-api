import { spyOn } from 'bun:test';
import db from '@/db';

type Call = [method: string, args: unknown[]];

// Stands in for the database in a route test. Every query is a chain, and awaiting one takes the next scripted result
// in order, so a test states what the database returns and the route's own logic decides the status. An `Error` in
// the script is thrown, as a driver error would be. Anything the script does not cover fails the test, so a route
// that runs more queries than expected cannot pass by accident.
//
// It cannot show that a query is right, only what the route does with its result. Foreign keys, locks and cascades
// need a real database.
export const stubDb = (...script: unknown[]) => {
    const results = [...script];
    const calls: Call[] = [];

    const chain: unknown = new Proxy(() => undefined, {
        get: (_, method) => {
            if (method === 'then') {
                return (resolve: (value: unknown) => void, reject: (reason: unknown) => void) => {
                    if (!results.length) {
                        return reject(new Error('The route ran more queries than the test scripted.'));
                    }

                    const next = results.shift();

                    return next instanceof Error ? reject(next) : resolve(next);
                };
            }

            return (...args: unknown[]) => {
                calls.push([String(method), args]);

                return chain;
            };
        },
    });

    // A call straight on `db` is recorded like one on a transaction, so a route can use either.
    const direct = (method: 'select' | 'insert' | 'update' | 'delete') =>
        spyOn(db, method).mockImplementation(((...args: unknown[]) => {
            calls.push([method, args]);

            return chain;
        }) as never);

    const stubs = [
        direct('select'),
        direct('insert'),
        direct('update'),
        direct('delete'),
        // The transaction callback gets the same chain, so its queries draw from the same script. Its relational reads
        // go through `db.query`, which is stubbed below.
        spyOn(db, 'transaction').mockImplementation(((callback: (tx: unknown) => unknown) =>
            callback(
                new Proxy({}, { get: (_, method) => (method === 'query' ? db.query : (chain as never)[method]) }),
            )) as never),
        ...Object.values(db.query).flatMap((table) =>
            (['findFirst', 'findMany'] as const).map((method) =>
                spyOn(table, method).mockImplementation(((...args: unknown[]) => {
                    calls.push([method, args]);

                    return chain;
                }) as never),
            ),
        ),
    ];

    return {
        calls,
        // The methods called, in order, for example ['select', 'from', 'where', 'for'].
        methods: () => calls.map(([method]) => method),
        // How many scripted results were never asked for.
        unused: () => results.length,
        restore: () => {
            for (const stub of stubs) {
                stub.mockRestore();
            }
        },
    };
};
