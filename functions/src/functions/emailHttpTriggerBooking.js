const { app } = require('@azure/functions');

let nodemailer = null;
let nodemailerLoadError = null;
try {
    nodemailer = require('nodemailer');
} catch (error) {
    nodemailerLoadError = error;
}

let plunkTransportFactory = null;
let plunkTransportLoadError = null;
try {
    const plunkTransportModule = require('@plunk/nodemailer');
    if (typeof plunkTransportModule === 'function') {
        plunkTransportFactory = plunkTransportModule;
    } else if (plunkTransportModule && typeof plunkTransportModule.default === 'function') {
        plunkTransportFactory = plunkTransportModule.default;
    } else if (plunkTransportModule && typeof plunkTransportModule.PlunkTransport === 'function') {
        plunkTransportFactory = plunkTransportModule.PlunkTransport;
    } else if (plunkTransportModule && typeof plunkTransportModule.Plunk === 'function') {
        plunkTransportFactory = plunkTransportModule.Plunk;
    }

    if (typeof plunkTransportFactory !== 'function') {
        plunkTransportLoadError = new Error('Fant ikke en gyldig transportfabrikk i @plunk/nodemailer.');
        plunkTransportFactory = null;
    }
} catch (error) {
    plunkTransportLoadError = error;
}

const PLUNK_API_TOKEN = process.env.PLUNK_API_TOKEN;
const PLUNK_DEFAULT_EVENT = process.env.PLUNK_DEFAULT_EVENT || 'bjorkvang-signup';
const PLUNK_ALLOW_ORIGIN = process.env.PLUNK_ALLOW_ORIGIN || '*';

let cachedTransporter = null;

const createError = (code, message) => {
    const error = new Error(message);
    error.code = code;
    return error;
};

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

const uniqueList = (values) => {
    if (!Array.isArray(values)) {
        return [];
    }

    return [...new Set(values.filter((value) => typeof value === 'string' && value.trim().length > 0))];
};

const getRecipients = () => {
    const combined = [
        ...normaliseList(process.env.PLUNK_BOOKING_TO),
        ...normaliseList(process.env.PLUNK_TO_EMAILS),
        ...normaliseList(process.env.BOOKING_NOTIFICATION_RECIPIENTS),
    ];

    return uniqueList(combined);
};

const getCcRecipients = () =>
    uniqueList([
        ...normaliseList(process.env.PLUNK_BOOKING_CC),
        ...normaliseList(process.env.PLUNK_CC_EMAILS),
    ]);

const getBccRecipients = () =>
    uniqueList([
        ...normaliseList(process.env.PLUNK_BOOKING_BCC),
        ...normaliseList(process.env.PLUNK_BCC_EMAILS),
    ]);

const getFromAddress = () =>
    pickString(process.env.PLUNK_BOOKING_FROM, process.env.PLUNK_FROM_EMAIL, process.env.BOOKING_FROM_EMAIL);

const getReplyToAddress = (details) =>
    pickString(process.env.PLUNK_BOOKING_REPLY_TO, process.env.PLUNK_REPLY_TO_EMAIL, details?.email);

const escapeHtml = (value) =>
    String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const stringifyValue = (value, fallback = 'Ikke oppgitt') => {
    if (Array.isArray(value)) {
        const filtered = value
            .map((entry) => (typeof entry === 'string' ? entry.trim() : String(entry)))
            .filter((entry) => entry.length > 0);
        return filtered.length > 0 ? filtered.join(', ') : fallback;
    }

    if (typeof value === 'boolean') {
        return value ? 'Ja' : 'Nei';
    }

    if (value === undefined || value === null) {
        return fallback;
    }

    const stringValue = String(value).trim();
    return stringValue.length > 0 ? stringValue : fallback;
};

const toTextValue = (value, fallback) => stringifyValue(value, fallback);

const toHtmlValue = (value, fallback, { preserveLineBreaks = false } = {}) => {
    const textValue = stringifyValue(value, fallback);
    const escaped = escapeHtml(textValue);
    return preserveLineBreaks ? escaped.replace(/\n/g, '<br>') : escaped;
};

const buildEmailContent = (details) => {
    const fullName = details.name || [details.firstName, details.lastName].filter(Boolean).join(' ');

    const infoRows = [
        { label: 'Navn', value: fullName },
        { label: 'E-post', value: details.email },
        { label: 'Telefon', value: details.phone },
        { label: 'Selskap eller organisasjon', value: details.company },
        { label: 'Arrangementstype', value: details.eventType || details.eventName },
        { label: 'Dato', value: details.preferredDate },
        { label: 'Starttid', value: details.preferredTime },
        {
            label: 'Varighet (timer)',
            value: Number.isFinite(details.durationHours) ? details.durationHours : details.durationRaw,
        },
        { label: 'Ønskede rom', value: details.spaces, fallback: 'Ingen' },
        { label: 'Tilleggsbehov', value: details.services, fallback: 'Ingen' },
        {
            label: 'Antall deltakere',
            value: Number.isFinite(details.attendeeCount) ? details.attendeeCount : details.attendeesRaw,
        },
        { label: 'Etiketter', value: details.tags, fallback: 'Ingen' },
        {
            label: 'Markedsføringssamtykke',
            value: typeof details.consent === 'boolean' ? details.consent : null,
        },
        {
            label: 'Tilleggsinformasjon',
            value: details.message,
            fallback: 'Ingen opplysninger',
            preserveLineBreaks: true,
        },
        { label: 'Metadata – kilde', value: details.metadata?.source },
        { label: 'Metadata – side', value: details.metadata?.page },
    ];

    const subjectParts = ['Ny bookingforespørsel'];
    if (details.eventType) {
        subjectParts.push(details.eventType);
    } else if (details.eventName) {
        subjectParts.push(details.eventName);
    }

    const schedule = [details.preferredDate, details.preferredTime].filter(Boolean).join(' ');
    if (schedule) {
        subjectParts.push(schedule);
    }

    const subject = subjectParts.join(' – ');

    const textBody = [
        'En ny bookingforespørsel har blitt sendt inn via bjorkvang.no.',
        '',
        ...infoRows.map((row) => `${row.label}: ${toTextValue(row.value, row.fallback ?? 'Ikke oppgitt')}`),
        '',
        'Denne meldingen ble sendt automatisk fra booking-skjemaet på bjorkvang.no.',
    ].join('\n');

    const htmlBody = `
        <div style="font-family: Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.5; color: #183d2c;">
            <p>En ny bookingforespørsel har blitt sendt inn via bjorkvang.no.</p>
            <dl style="margin: 0; padding: 0;">
                ${infoRows
                    .map(
                        (row) => `
                            <dt style="font-weight: 600; margin-top: 12px;">${escapeHtml(row.label)}</dt>
                            <dd style="margin: 0;">${toHtmlValue(row.value, row.fallback ?? 'Ikke oppgitt', {
                            preserveLineBreaks: Boolean(row.preserveLineBreaks),
                        })}</dd>
                        `
                    )
                    .join('')}
            </dl>
            <p style="margin-top: 16px;">Denne meldingen ble sendt automatisk fra booking-skjemaet på bjorkvang.no.</p>
        </div>
    `;

    return {
        subject,
        text: textBody,
        html: htmlBody,
    };
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

const getTransporter = (context) => {
    if (cachedTransporter) {
        return cachedTransporter;
    }

    if (!nodemailer) {
        context.log('nodemailer-modulen kunne ikke lastes', nodemailerLoadError);
        throw createError('PLUNK_TRANSPORT_NOT_AVAILABLE', 'E-posttransporten er ikke tilgjengelig.');
    }

    if (!plunkTransportFactory) {
        context.log('Kunne ikke laste @plunk/nodemailer-modulen', plunkTransportLoadError);
        throw createError('PLUNK_TRANSPORT_NOT_AVAILABLE', 'Plunk nodemailer-transporten er ikke tilgjengelig.');
    }

    try {
        cachedTransporter = nodemailer.createTransport(
            plunkTransportFactory({
                token: PLUNK_API_TOKEN,
                apiKey: PLUNK_API_TOKEN,
            })
        );
    } catch (error) {
        context.log('Kunne ikke initialisere Plunk-transporter', error);
        throw createError('PLUNK_TRANSPORT_NOT_AVAILABLE', 'Kunne ikke initialisere e-posttransporten.');
    }

    return cachedTransporter;
};

const sendBookingEmail = async (details, context) => {
    if (!PLUNK_API_TOKEN) {
        context.log('Plunk API-token mangler');
        throw createError('PLUNK_CONFIGURATION_MISSING', 'Plunk API-token mangler.');
    }

    const fromAddress = getFromAddress();
    if (!fromAddress) {
        context.log('Ingen avsenderadresse er konfigurert for bookingmeldinger');
        throw createError('PLUNK_SENDER_MISSING', 'Avsenderadresse mangler.');
    }

    const recipients = getRecipients();
    if (recipients.length === 0) {
        context.log('Ingen mottakere er konfigurert for bookingmeldinger');
        throw createError('PLUNK_RECIPIENTS_MISSING', 'Mottakeradresse mangler.');
    }

    let transporter;
    try {
        transporter = getTransporter(context);
    } catch (error) {
        throw error;
    }

    const { subject, text, html } = buildEmailContent(details);

    const mailOptions = {
        from: fromAddress,
        to: recipients.join(', '),
        subject,
        text,
        html,
    };

    const replyTo = getReplyToAddress(details);
    if (replyTo) {
        mailOptions.replyTo = replyTo;
    }

    const ccRecipients = getCcRecipients();
    if (ccRecipients.length > 0) {
        mailOptions.cc = ccRecipients.join(', ');
    }

    const bccRecipients = getBccRecipients();
    if (bccRecipients.length > 0) {
        mailOptions.bcc = bccRecipients.join(', ');
    }

    try {
        await transporter.sendMail(mailOptions);
    } catch (error) {
        context.log('Klarte ikke å sende e-post via Plunk', error);
        throw createError('PLUNK_SEND_FAILED', 'Klarte ikke å sende e-post via Plunk.');
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

        const firstName = pickString(body.firstName, body.firstname, body.fornavn, getQueryValue(query, 'firstName'));
        const lastName = pickString(body.lastName, body.lastname, body.etternavn, getQueryValue(query, 'lastName'));
        const name = pickString(
            body.name,
            [firstName, lastName].filter(Boolean).join(' '),
            getQueryValue(query, 'name')
        );

        const phone = pickString(body.phone, body.phoneNumber, body.telefon, getQueryValue(query, 'phone'));
        const company = pickString(body.company, body.organisation, body.organization, getQueryValue(query, 'company'));

        const eventType = pickString(
            body.eventType,
            body.event_type,
            body.arrangement,
            getQueryValue(query, 'eventType')
        );
        const eventName = pickString(body.eventName, body.event, getQueryValue(query, 'event'), PLUNK_DEFAULT_EVENT);

        const preferredDate = pickString(body.date, body.preferredDate, getQueryValue(query, 'date'));
        const preferredTime = pickString(body.time, body.preferredTime, getQueryValue(query, 'time'));

        const durationRaw = pickString(body.duration, body.durationHours, body.hours, getQueryValue(query, 'duration'));
        const parsedDuration = Number.parseFloat(durationRaw);
        const durationHours = Number.isFinite(parsedDuration) ? parsedDuration : null;

        const spaces = normaliseList([
            body.spaces,
            body.space,
            getQueryValues(query, 'spaces'),
            getQueryValues(query, 'space'),
        ]);

        const services = normaliseList([
            body.services,
            body.service,
            getQueryValues(query, 'services'),
            getQueryValues(query, 'service'),
        ]);

        const attendeesRaw = pickString(
            body.attendees,
            body.attendeeCount,
            body.participants,
            getQueryValue(query, 'attendees')
        );
        const parsedAttendees = Number.parseInt(attendeesRaw, 10);
        const attendeeCount = Number.isFinite(parsedAttendees) ? parsedAttendees : null;

        const message = pickString(body.message, body.notes, getQueryValue(query, 'message'));

        const tags = normaliseList([body.tags, body.tag, getQueryValues(query, 'tag')]);
        const consent = parseBoolean(body.consent, body.marketingConsent, getQueryValue(query, 'consent'));

        const metadata = cleanObject({
            source: pickString(body.source, body.origin, request.headers.get('origin')),
            page: pickString(body.page, body.pageUrl, request.headers.get('referer')),
        });

        const bookingDetails = {
            email,
            name,
            firstName,
            lastName,
            phone,
            company,
            eventType,
            eventName,
            preferredDate,
            preferredTime,
            durationHours,
            durationRaw,
            spaces,
            services,
            attendeeCount,
            attendeesRaw,
            message,
            tags,
            consent,
            metadata,
        };

        try {
            await sendBookingEmail(bookingDetails, context);
        } catch (error) {
            if (
                error.code === 'PLUNK_CONFIGURATION_MISSING' ||
                error.code === 'PLUNK_SENDER_MISSING' ||
                error.code === 'PLUNK_RECIPIENTS_MISSING'
            ) {
                return jsonResponse(500, { error: 'Plunk-integrasjonen er ikke konfigurert.' });
            }

            if (error.code === 'PLUNK_TRANSPORT_NOT_AVAILABLE') {
                return jsonResponse(500, { error: 'E-posttransporten er ikke tilgjengelig.' });
            }

            context.log('Plunk-integrasjonen returnerte feil', error);
            return jsonResponse(502, { error: 'Klarte ikke å sende e-post via Plunk.' });
        }

        return jsonResponse(202, { message: 'Bookingforespørselen ble sendt via Plunk.' });
    },
});
