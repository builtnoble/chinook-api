// The query a page link keeps: every parameter the request set but the page, in
// name order and URL-encoded, so a link to another page keeps the filters and
// the limit.
const keptQuery = (query: Record<string, unknown>) =>
    Object.keys(query)
        .filter((key) => key !== 'page' && query[key] !== undefined && query[key] !== '')
        .sort()
        .map((key) => [key, String(query[key])]);

export const getPageUrls = (
    path: string,
    currPage: number,
    totalPages: number,
    query: Record<string, unknown> = {},
): { prevPageUrl: string | null; nextPageUrl: string | null } => {
    const pageUrl = (page: number) => `${path}?${new URLSearchParams([...keptQuery(query), ['page', String(page)]])}`;

    const prevPageNum = currPage - 1;
    const prevPageUrl = prevPageNum === 0 ? null : pageUrl(prevPageNum);

    const nextPageNum = currPage + 1;
    const nextPageUrl = currPage >= totalPages ? null : pageUrl(nextPageNum);

    return { prevPageUrl, nextPageUrl };
};
