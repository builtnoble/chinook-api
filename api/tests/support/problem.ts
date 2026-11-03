import { statusTitle } from '@/lib/problem-details';

// The problem document an error answers with. The code is the snake_case of the
// title unless the error sets its own.
export const problemBody = (status: number, detail: string, code?: string) => ({
    type: 'about:blank',
    title: statusTitle(status),
    status,
    detail,
    code: code ?? statusTitle(status).toLowerCase().replace(/\W+/g, '_'),
});
