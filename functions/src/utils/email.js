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

const sendEmail = async (mailOptions) => {
    const transporterInstance = getTransporter();
    return transporterInstance.sendMail(mailOptions);
};

const createResponse = (status, body = {}, extraHeaders = {}) => ({
    status,
    jsonBody: body,
    headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': ALLOW_ORIGIN,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        ...extraHeaders,
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

module.exports = {
    sendEmail,
    createResponse,
    parseBody,
};
