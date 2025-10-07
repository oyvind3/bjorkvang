const { app } = require('@azure/functions');
const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.useplunk.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = process.env.SMTP_SECURE === 'true' || SMTP_PORT === 465;
const SMTP_USER = process.env.SMTP_USER || 'plunk';
const SMTP_PASSWORD = process.env.SMTP_PASSWORD;
const ALLOW_ORIGIN = process.env.PLUNK_ALLOW_ORIGIN || '*';

let transporter;

const getTransporter = () => {
    if (!SMTP_PASSWORD) {
        throw new Error('SMTP_PASSWORD environment variable is not set.');
    }

    if (!transporter) {
        transporter = nodemailer.createTransport({
            host: SMTP_HOST,
            port: SMTP_PORT,
            secure: SMTP_SECURE,
            auth: {
                user: SMTP_USER,
                pass: SMTP_PASSWORD,
            },
        });
    }

    return transporter;
};

const createResponse = (status, body = {}) => ({
    status,
    jsonBody: body,
    headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': ALLOW_ORIGIN,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    },
});

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

app.http('emailHttpTriggerBooking', {
    methods: ['POST', 'OPTIONS'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        if (request.method === 'OPTIONS') {
            return createResponse(204);
        }

        const body = await parseBody(request);
        const to = body.to || process.env.DEFAULT_TO_ADDRESS;
        const from = body.from || process.env.DEFAULT_FROM_ADDRESS;
        const subject = body.subject || 'Plunk is awesome!';
        const text = body.text || undefined;
        const html = body.html || 'Check it out at https://useplunk.com';

        if (!to || !from) {
            context.log.warn('Missing "to" or "from" in request body.');
            return createResponse(400, { error: 'Missing "to" or "from" field.' });
        }

        try {
            const transporterInstance = getTransporter();
            const info = await transporterInstance.sendMail({
                to,
                from,
                subject,
                text,
                html,
            });

            context.log('Email sent', info.messageId);
            return createResponse(202, { messageId: info.messageId });
        } catch (error) {
            context.log.error('Failed to send email', error);
            return createResponse(500, { error: 'Failed to send email.' });
        }
    },
});
