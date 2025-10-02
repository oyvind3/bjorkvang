const { app } = require('@azure/functions');
const { fetch } = require('undici');

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const BOOKING_NOTIFICATION_EMAIL = process.env.BOOKING_NOTIFICATION_EMAIL;
const BOOKING_FROM_EMAIL = process.env.BOOKING_FROM_EMAIL || BOOKING_NOTIFICATION_EMAIL;
const BOOKING_EMAIL_SUBJECT_PREFIX = process.env.BOOKING_EMAIL_SUBJECT_PREFIX || 'Ny bookingforespørsel';

const SENDGRID_ENDPOINT = 'https://api.sendgrid.com/v3/mail/send';

const REQUIRED_FIELDS = ['name', 'email', 'phone', 'date', 'time'];

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
        context.log('Kunne ikke lese forespørselstekst', error);
        return {};
    }

    if (!rawBody) {
        return {};
    }

    if (contentType.includes('application/json')) {
        try {
            return JSON.parse(rawBody);
        } catch (error) {
            context.log('Ugyldig JSON i forespørsel', error);
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

const normaliseList = (value, fallback = []) => {
    if (Array.isArray(value)) {
        return value.flatMap((entry) => normaliseList(entry)).filter(Boolean);
    }

    if (value === undefined || value === null) {
        return Array.isArray(fallback) ? fallback.filter(Boolean) : [];
    }

    if (typeof value === 'string') {
        return value
            .split(',')
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0);
    }

    return [String(value)].filter(Boolean);
};

const getQueryValue = (query, key) => {
    if (!query || typeof query.get !== 'function') {
        return undefined;
    }

    const value = query.get(key);
    if (value === null || value === undefined) {
        return undefined;
    }
    return value;
};

const getQueryValues = (query, key) => {
    if (!query || typeof query.getAll !== 'function') {
        const value = getQueryValue(query, key);
        return value === undefined ? [] : [value];
    }

    return query.getAll(key);
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

const parseOptionalNumber = (...candidates) => {
    for (const candidate of candidates) {
        if (candidate === undefined || candidate === null) {
            continue;
        }

        const numeric = typeof candidate === 'number' ? candidate : Number.parseFloat(String(candidate));
        if (!Number.isNaN(numeric)) {
            return numeric;
        }
    }

    return null;
};

const escapeHtml = (text) =>
    String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const buildEmailBodies = (fields) => {
    const listLine = (label, value) => `${label}: ${value || 'Ikke oppgitt'}`;

    const formattedSpaces = fields.spaces.length > 0 ? fields.spaces.join(', ') : 'Ikke oppgitt';
    const formattedServices = fields.services.length > 0 ? fields.services.join(', ') : 'Ingen valgt';
    const durationText = Number.isFinite(fields.duration) && fields.duration > 0 ? `${fields.duration} timer` : 'Ikke oppgitt';
    const attendeesText = Number.isFinite(fields.attendees) && fields.attendees > 0 ? `${fields.attendees}` : 'Ikke oppgitt';

    const textLines = [
        'Ny bookingforespørsel fra nettsiden:',
        listLine('Navn', fields.name),
        listLine('E-post', fields.email),
        listLine('Telefon', fields.phone),
        listLine('Arrangementstype', fields.eventType),
        listLine('Dato', fields.date),
        listLine('Starttid', fields.time),
        listLine('Varighet', durationText),
        listLine('Forventet antall deltakere', attendeesText),
        listLine('Ønskede rom', formattedSpaces),
        listLine('Tilleggstjenester', formattedServices),
        '',
        'Tilleggsinformasjon:',
        fields.message || '(ingen tilleggsinformasjon)',
        '',
        listLine('Registrert', fields.createdAt)
    ];

    const htmlItems = [
        `<li><strong>Navn:</strong> ${escapeHtml(fields.name || 'Ikke oppgitt')}</li>`,
        `<li><strong>E-post:</strong> ${escapeHtml(fields.email || 'Ikke oppgitt')}</li>`,
        `<li><strong>Telefon:</strong> ${escapeHtml(fields.phone || 'Ikke oppgitt')}</li>`,
        `<li><strong>Arrangementstype:</strong> ${escapeHtml(fields.eventType || 'Ikke oppgitt')}</li>`,
        `<li><strong>Dato:</strong> ${escapeHtml(fields.date || 'Ikke oppgitt')}</li>`,
        `<li><strong>Starttid:</strong> ${escapeHtml(fields.time || 'Ikke oppgitt')}</li>`,
        `<li><strong>Varighet:</strong> ${escapeHtml(durationText)}</li>`,
        `<li><strong>Forventet antall deltakere:</strong> ${escapeHtml(attendeesText)}</li>`,
        `<li><strong>Ønskede rom:</strong> ${escapeHtml(formattedSpaces)}</li>`,
        `<li><strong>Tilleggstjenester:</strong> ${escapeHtml(formattedServices)}</li>`,
        `<li><strong>Registrert:</strong> ${escapeHtml(fields.createdAt)}</li>`
    ];

    const messageHtml = fields.message
        ? `<p>${escapeHtml(fields.message).replace(/\n/g, '<br>')}</p>`
        : '<p><em>Ingen tilleggsinformasjon</em></p>';

    const html = `
        <h2>Ny bookingforespørsel</h2>
        <ul>
            ${htmlItems.join('\n            ')}
        </ul>
        <h3>Tilleggsinformasjon</h3>
        ${messageHtml}
    `;

    return {
        text: textLines.join('\n'),
        html
    };
};

const extractFields = (body, query) => {
    const spacesFromBody = body.spaces ?? body.space ?? body.rooms;
    const servicesFromBody = body.services ?? body.service ?? body.addons;

    const fields = {
        name: pickString(body.name, body.fullName, getQueryValue(query, 'name')),
        email: pickString(body.email, body.emailAddress, getQueryValue(query, 'email')),
        phone: pickString(body.phone, body.phoneNumber, getQueryValue(query, 'phone')),
        eventType: pickString(body.eventType, body.event_type, body.type, getQueryValue(query, 'eventType'), getQueryValue(query, 'event_type')),
        date: pickString(body.date, body.eventDate, getQueryValue(query, 'date')),
        time: pickString(body.time, body.startTime, getQueryValue(query, 'time')),
        duration: parseOptionalNumber(body.duration, body.durationHours, getQueryValue(query, 'duration')),
        spaces: normaliseList(spacesFromBody, getQueryValues(query, 'spaces')),
        services: normaliseList(servicesFromBody, getQueryValues(query, 'services')),
        attendees: parseOptionalNumber(body.attendees, body.attendeeCount, getQueryValue(query, 'attendees')),
        message: pickString(body.message, body.notes, body.additionalInfo, getQueryValue(query, 'message')),
        createdAt: pickString(body.createdAt, body.created_at, new Date().toISOString())
    };

    return fields;
};

const validateFields = (fields) => {
    const missing = REQUIRED_FIELDS.filter((field) => !fields[field] || fields[field].length === 0);
    return {
        isValid: missing.length === 0,
        missing
    };
};

const buildSubject = (fields) => {
    const parts = [BOOKING_EMAIL_SUBJECT_PREFIX];

    if (fields.eventType) {
        parts.push(fields.eventType);
    }

    if (fields.date) {
        parts.push(fields.date);
    }

    if (fields.time) {
        parts.push(`kl. ${fields.time}`);
    }

    return parts.join(' - ');
};

const sendEmail = async (fields, bodies, context) => {
    if (!SENDGRID_API_KEY || !BOOKING_NOTIFICATION_EMAIL || !BOOKING_FROM_EMAIL) {
        context.log('Manglende miljøvariabler for e-postutsending');
        throw new Error('EMAIL_CONFIGURATION_MISSING');
    }

    const recipients = BOOKING_NOTIFICATION_EMAIL.split(',').map((address) => address.trim()).filter(Boolean);

    if (recipients.length === 0) {
        throw new Error('EMAIL_RECIPIENTS_MISSING');
    }

    const personalization = {
        to: recipients.map((email) => ({ email }))
    };

    const payload = {
        personalizations: [personalization],
        from: {
            email: BOOKING_FROM_EMAIL,
            name: 'Bjørkvang Booking'
        },
        subject: buildSubject(fields),
        content: [
            { type: 'text/plain', value: bodies.text },
            { type: 'text/html', value: bodies.html }
        ]
    };

    if (fields.email) {
        payload.reply_to = {
            email: fields.email,
            name: fields.name || fields.email
        };
    }

    const response = await fetch(SENDGRID_ENDPOINT, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${SENDGRID_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorBody = await response.text();
        context.log('SendGrid feilet', response.status, errorBody);
        throw new Error(`SendGrid send failed with status ${response.status}`);
    }
};

app.http('emailHttpTriggerBooking', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log(`Http function processed request for url "${request.url}"`);
        if (request.method === 'GET') {
            return {
                status: 200,
                jsonBody: { message: 'Booking-endepunktet er aktivt.' }
            };
        }

        if (request.method !== 'POST') {
            return {
                status: 405,
                jsonBody: { error: 'Metode ikke tillatt.' }
            };
        }

        let body;
        try {
            body = await parseRequestBody(request, context);
        } catch (error) {
            if (error.message === 'INVALID_JSON') {
                return {
                    status: 400,
                    jsonBody: { error: 'Ugyldig JSON i forespørselen.' }
                };
            }

            context.log('Uventet feil ved parsing av forespørsel', error);
            return {
                status: 400,
                jsonBody: { error: 'Forespørselen kunne ikke tolkes.' }
            };
        }

        const fields = extractFields(body, request.query);
        const validation = validateFields(fields);

        if (!validation.isValid) {
            return {
                status: 400,
                jsonBody: {
                    error: 'Påkrevd informasjon mangler.',
                    missing: validation.missing
                }
            };
        }

        const bodies = buildEmailBodies(fields);

        try {
            await sendEmail(fields, bodies, context);
        } catch (error) {
            context.log('Klarte ikke å sende e-post', error);
            const status = error.message && error.message.startsWith('EMAIL_') ? 500 : 502;
            return {
                status,
                jsonBody: { error: 'Klarte ikke å sende e-post. Forsøk igjen senere.' }
            };
        }

        
        return {
            status: 202,
            jsonBody: { message: 'Bookingforespørselen er sendt til styret.' }
        };
    }
});