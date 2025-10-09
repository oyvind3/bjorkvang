const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.useplunk.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = process.env.SMTP_SECURE === 'true' || SMTP_PORT === 465;
const SMTP_USER = process.env.SMTP_USER || 'plunk';
const SMTP_PASSWORD = process.env.SMTP_PASSWORD;

let transporter;

/**
 * Lazily create the Nodemailer transporter used for every Plunk email.
 * Reuses the same instance between function executions when the worker stays warm.
 */
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

/**
 * Send an email using the shared Plunk transporter.
 * @param {import('nodemailer').SendMailOptions} options
 * @returns {Promise<import('nodemailer/lib/smtp-transport').SentMessageInfo>}
 */
const sendEmail = async (options) => {
    const transporterInstance = getTransporter();
    return transporterInstance.sendMail(options);
};

module.exports = {
    sendEmail,
};
