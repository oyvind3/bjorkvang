const { app } = require('@azure/functions');
const { fetch } = require('undici');

const PLUNK_API_TOKEN = process.env.PLUNK_API_TOKEN;
const PLUNK_FORM_ID = process.env.PLUNK_FORM_ID;
const PLUNK_DEFAULT_EVENT = process.env.PLUNK_DEFAULT_EVENT || 'bjorkvang-signup';
const PLUNK_API_BASE_URL = (process.env.PLUNK_API_BASE_URL || 'https://api.useplunk.com/v1').replace(/\/?$/, '');
const PLUNK_ALLOW_ORIGIN = process.env.PLUNK_ALLOW_ORIGIN || '*';

const parseUrlEncoded = (text) => {
    const params = new URLSearchParams(text);
    const result = {};

    for (const [key, value] of params.entries()) {
        if (Object.prototype.hasOwnProperty.call(result, key)) {
            if (Array.isArray(result[key])) {
                result[key].push(value);
            } else {
                result[key] = [result[key], value];
            }
        } else {
            result[key] = value;
        }
    }

    return result;
};

const parseRequestBody = async (request, context) => {
    const contentType = (request.headers.get('content-type') || '').toLowerCase();

    let rawBody = '';
    try {
        rawBody = await request.text();
    } catch (error) {
        context.log('Kunne ikke lese forespørselskropp', error);
        return {};
    }

    if (!rawBody) {
        return {};
    }

    if (contentType.includes('application/json')) {
        try {
            return JSON.parse(rawBody);
        } catch (error) {
            context.log('Ugyldig JSON levert til Plunk-endepunktet', error);
            throw new Error('INVALID_JSON');
        }
    }

    if (contentType.includes('application/x-www-form-urlencoded')) {
        return parseUrlEncoded(rawBody);
    }

    try {
        return JSON.parse(rawBody);
    } catch (_) {
        if (rawBody.includes('=')) {
            return parseUrlEncoded(rawBody);
        }
    }

    return { message: rawBody };
};

const pickString = (...candidates) => {
    for (const candidate of candidates) {
        if (candidate === undefined || candidate === null) {
            continue;
        }

        if (typeof candidate === 'string') {
            const trimmed = candidate.trim();
            if (trimmed.length > 0) {
                return trimmed;
            }
        } else if (typeof candidate === 'number' || typeof candidate === 'boolean') {
            return String(candidate);
        }
    }

    return '';
};

const parseBoolean = (...candidates) => {
    for (const candidate of candidates) {
        if (candidate === undefined || candidate === null) {
            continue;
        }

        if (typeof candidate === 'boolean') {
            return candidate;
        }

        if (typeof candidate === 'string') {
            const normalized = candidate.trim().toLowerCase();
            if (['true', '1', 'yes', 'on', 'ja'].includes(normalized)) {
                return true;
            }
            if (['false', '0', 'no', 'off', 'nei'].includes(normalized)) {
                return false;
            }
        }

        if (typeof candidate === 'number') {
            return candidate !== 0;
        }
    }

    return null;
};

const normaliseList = (value) => {
    if (Array.isArray(value)) {
        return value.flatMap((entry) => normaliseList(entry)).filter(Boolean);
    }

    if (value === undefined || value === null) {
        return [];
    }

    if (typeof value === 'string') {
        return value
            .split(',')
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0);
    }

    return [String(value)].filter(Boolean);
};

const cleanObject = (input) =>
    Object.entries(input)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});

const getQueryValue = (query, key) => {
    if (!query || typeof query.get !== 'function') {
        return undefined;
    }

    const value = query.get(key);
    return value === null ? undefined : value;
};

const getQueryValues = (query, key) => {
    if (!query || typeof query.getAll !== 'function') {
        const single = getQueryValue(query, key);
        return single === undefined ? [] : [single];
    }

    return query.getAll(key);
};

const buildCorsHeaders = () => ({
    'Access-Control-Allow-Origin': PLUNK_ALLOW_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
});

const jsonResponse = (status, body = {}) => ({
    status,
    headers: {
        ...buildCorsHeaders(),
        'Content-Type': 'application/json',
    },
    jsonBody: body,
});

const submitToPlunk = async (payload, context) => {
    if (!PLUNK_API_TOKEN || !PLUNK_FORM_ID) {
        context.log('Plunk-konfigurasjon mangler');
        throw new Error('PLUNK_CONFIGURATION_MISSING');
    }

    const endpoint = `${PLUNK_API_BASE_URL}/forms/${encodeURIComponent(PLUNK_FORM_ID)}/submit`;

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${PLUNK_API_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        context.log('Plunk-forespørsel feilet', response.status, errorBody);
        throw new Error(`PLUNK_REQUEST_FAILED_${response.status}`);
    }
};

app.http('plunkHttpTrigger', {
    methods: ['OPTIONS', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        if (request.method === 'OPTIONS') {
            return {
                status: 204,
                headers: buildCorsHeaders(),
            };
        }

        if (request.method !== 'POST') {
            return jsonResponse(405, { error: 'Metode ikke tillatt.' });
        }

        let body;
        try {
            body = await parseRequestBody(request, context);
        } catch (error) {
            if (error.message === 'INVALID_JSON') {
                return jsonResponse(400, { error: 'Ugyldig JSON i forespørselen.' });
            }

            context.log('Klarte ikke å tolke forespørsel til Plunk-endepunktet', error);
            return jsonResponse(400, { error: 'Forespørselen kunne ikke tolkes.' });
        }

        const query = request.query;
        const email = pickString(body.email, body.emailAddress, getQueryValue(query, 'email'));

        if (!email) {
            return jsonResponse(400, { error: 'E-postadresse er påkrevd.' });
        }

        const eventName = pickString(
            body.eventName,
            body.event,
            getQueryValue(query, 'event'),
            PLUNK_DEFAULT_EVENT
        );

        const tags = normaliseList(body.tags ?? body.tag ?? getQueryValues(query, 'tag'));
        const consent = parseBoolean(body.consent, body.marketingConsent, getQueryValue(query, 'consent'));

        const fields = cleanObject({
            firstName: pickString(body.firstName, body.firstname, body.fornavn, getQueryValue(query, 'firstName')),
            lastName: pickString(body.lastName, body.lastname, body.etternavn, getQueryValue(query, 'lastName')),
            phone: pickString(body.phone, body.phoneNumber, getQueryValue(query, 'phone')),
            company: pickString(body.company, body.organisation, getQueryValue(query, 'company')),
            message: pickString(body.message, body.notes, getQueryValue(query, 'message')),
            preferredDate: pickString(body.date, body.preferredDate, getQueryValue(query, 'date')),
            preferredTime: pickString(body.time, body.preferredTime, getQueryValue(query, 'time')),
        });

        if (consent !== null) {
            fields.marketingConsent = consent;
        }

        const payload = cleanObject({
            email,
            event: eventName,
            fields: Object.keys(fields).length > 0 ? fields : undefined,
            tags: tags.length > 0 ? tags : undefined,
            metadata: cleanObject({
                source: pickString(body.source, body.origin, request.headers.get('origin')),
                page: pickString(body.page, body.pageUrl, request.headers.get('referer')),
            }),
        });

        try {
            await submitToPlunk(payload, context);
        } catch (error) {
            if (error.message === 'PLUNK_CONFIGURATION_MISSING') {
                return jsonResponse(500, { error: 'Plunk-integrasjonen er ikke konfigurert.' });
            }

            context.log('Plunk-integrasjonen returnerte feil', error);
            return jsonResponse(502, { error: 'Klarte ikke å sende data til Plunk.' });
        }

        return jsonResponse(202, { message: 'Data ble sendt til Plunk.' });
    },
});