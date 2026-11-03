// Browser origins allowed to call the API: a comma-separated list in
// CORS_ORIGINS.
export const getAllowedOrigins = (): string[] =>
    (process.env.CORS_ORIGINS ?? '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);

// The address clients use for the API, which Better Auth and the Origin guard
// both trust.
export const getBaseUrl = (): string => process.env.BETTER_AUTH_URL || 'http://localhost:3000';
