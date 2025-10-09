const ALLOW_ORIGIN = process.env.PLUNK_ALLOW_ORIGIN || '*';
const PUBLIC_BASE_URL = (process.env.PUBLIC_FUNCTION_BASE_URL || '').replace(/\/$/, '');

/**
 * Create a JSON Azure Function response with shared CORS headers.
 */
const createJsonResponse = (status, body = {}, extraHeaders = {}) => ({
    status,
    jsonBody: body,
    headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': ALLOW_ORIGIN,
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        ...extraHeaders,
    },
});

/**
 * Create a HTML response while still sending back the CORS headers for consistency.
 */
const createHtmlResponse = (status, html) => ({
    status,
    body: html,
    headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': ALLOW_ORIGIN,
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    },
});

/**
 * Attempt to parse the incoming body from JSON or urlencoded form data.
 */
const parseBody = async (request) => {
    try {
        const contentType = request.headers.get('content-type') || '';

        if (contentType.includes('application/json')) {
            return await request.json();
        }

        if (contentType.includes('application/x-www-form-urlencoded')) {
            const formData = await request.text();
            return Object.fromEntries(new URLSearchParams(formData));
        }

        return await request.json();
    } catch (_) {
        return {};
    }
};

/**
 * Resolve the base URL that should be used inside emails.
 * Defaults to the incoming request origin unless PUBLIC_FUNCTION_BASE_URL is set.
 */
const resolveBaseUrl = (request) => {
    if (PUBLIC_BASE_URL) {
        return PUBLIC_BASE_URL;
    }

    try {
        const url = new URL(request.url);
        return `${url.protocol}//${url.host}`;
    } catch (_) {
        return '';
    }
};

module.exports = {
    ALLOW_ORIGIN,
    createHtmlResponse,
    createJsonResponse,
    parseBody,
    resolveBaseUrl,
};
