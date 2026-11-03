import type { ProblemDetails } from '@/lib/problem-details';
import {
    problemExample,
    problemResponse,
    validationExample,
    validationProblemResponse,
} from '@/lib/problem-details/openapi';

export const invalidId = validationExample('/id', 'path', 'Invalid input: expected number, received NaN');

export const unauthorized = {
    ...problemResponse('Missing or invalid credentials.', problemExample(401, 'Missing or invalid credentials.')),
    headers: {
        'WWW-Authenticate': {
            description:
                'The scheme to authenticate with: `Bearer`, with `error="invalid_token"` when a bearer token was sent and failed.',
            schema: { type: 'string' as const },
        },
    },
};

export const forbidden = problemResponse(
    'The caller is signed in but is not an admin, or the request is a cookie write from an origin that is not allowed.',
    problemExample(403, 'This action requires the admin role.'),
    problemExample(403, 'The request comes from an origin that is not allowed.', { code: 'origin_not_allowed' }),
);

// "Media Types" -> "Media type not found.", the message the routes return, so
// each page shows its own resource.
const notFoundMessage = (tag: string) => {
    const name = tag.replace(/s$/, '').toLowerCase();

    return `${name.charAt(0).toUpperCase()}${name.slice(1)} not found.`;
};

export const notFound = (tag: string, message = notFoundMessage(tag)) =>
    problemResponse('No item has the requested id, or it has been deleted.', problemExample(404, message));

export const invalidBody = validationProblemResponse(
    'The body is not valid JSON, or a field is missing, unknown or of the wrong type.',
    validationExample('/name', 'body', 'Invalid input: expected string, received number'),
    problemExample(400, 'Malformed JSON in request body'),
);

export const unprocessable = problemResponse(
    'A field refers to a parent that does not exist or is deleted, or a value is too long.',
    problemExample(422, 'The row refers to a parent that does not exist.', { code: 'invalid_reference' }),
    problemExample(422, 'A value is too long for its column.', { code: 'value_too_long' }),
);

export const conflict = (description: string, ...examples: ProblemDetails[]) =>
    problemResponse(description, ...examples);

export const duplicate = conflict(
    'A unique value collides with an existing row.',
    problemExample(409, 'A row with that value already exists.', { code: 'duplicate_value' }),
);
