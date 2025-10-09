const fetch = require('node-fetch');

const PLUNK_API_URL = 'https://api.useplunk.com/v1/send';

/**
 * Send an email using Plunk's REST API.
 * @param {{ from?: string; to?: string; subject?: string; text?: string; html?: string; }} options
 * @returns {Promise<{ messageId?: string; response?: any }>}
 */
const sendEmail = async (options) => {
    const token = process.env.PLUNK_API_TOKEN;

    if (!token) {
        throw new Error('PLUNK_API_TOKEN environment variable is not set.');
    }

    const response = await fetch(PLUNK_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
            from: options.from,
            to: options.to,
            subject: options.subject,
            text: options.text,
            html: options.html,
        }),
    });

    if (!response.ok) {
        const errorBody = await response.text().catch(() => undefined);
        throw new Error(`Failed to send email. Status: ${response.status} ${response.statusText}. Body: ${errorBody}`);
    }

    let payload;
    try {
        payload = await response.json();
    } catch (error) {
        payload = undefined;
    }

    const messageId = payload?.data?.id || payload?.id || payload?.messageId;

    return {
        messageId,
        response: payload,
    };
};

module.exports = {
    sendEmail,
};
