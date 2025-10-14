const https = require('https');

const DEFAULT_PLUNK_API_URL = 'https://api.useplunk.com/v1/send';

const getPlunkApiUrl = () => {
    const configured = process.env.PLUNK_API_URL && process.env.PLUNK_API_URL.trim();
    return configured || DEFAULT_PLUNK_API_URL;
};

const buildPayload = (options) => {
    const payload = {
        from: options.from,
        to: options.to,
        subject: options.subject,
        ...(options.text ? { text: options.text } : {}),
        ...(options.html ? { html: options.html } : {}),
    };

    if (options.replyTo) {
        payload.replyTo = options.replyTo;
    }

    return payload;
};

/**
 * Send an email using Plunk's REST API over HTTPS.
 * @param {{ from?: string; to?: string; subject?: string; text?: string; html?: string; replyTo?: string; }} options
 * @returns {Promise<{ messageId?: string; response?: any }>}
 */
const sendEmail = async (options) => {
    const token = process.env.PLUNK_API_TOKEN;

    if (!token) {
        throw new Error('PLUNK_API_TOKEN environment variable is not set.');
    }

    const urlString = getPlunkApiUrl();
    let url;

    try {
        url = new URL(urlString);
    } catch (error) {
        throw new Error(`Invalid PLUNK_API_URL provided: ${urlString}`);
    }

    if (url.protocol !== 'https:') {
        throw new Error(`PLUNK_API_URL must use HTTPS. Received protocol: ${url.protocol}`);
    }

    const payload = JSON.stringify(buildPayload(options));

    const requestOptions = {
        hostname: url.hostname,
        port: url.port ? Number(url.port) : 443,
        path: `${url.pathname}${url.search}`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            Authorization: `Bearer ${token}`,
        },
    };

    return new Promise((resolve, reject) => {
        const req = https.request(requestOptions, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                    let parsed;

                    try {
                        parsed = data ? JSON.parse(data) : undefined;
                    } catch (error) {
                        parsed = undefined;
                    }

                    const messageId = parsed?.data?.id || parsed?.id || parsed?.messageId;

                    resolve({
                        messageId,
                        response: parsed,
                    });
                } else {
                    const statusText = res.statusMessage || '';
                    const errorMessage = `Failed to send email. Status: ${res.statusCode} ${statusText}`.trim();
                    reject(new Error(`${errorMessage}. Body: ${data}`));
                }
            });
        });

        req.on('error', reject);

        req.write(payload);
        req.end();
    });
};

module.exports = {
    DEFAULT_PLUNK_API_URL,
    getPlunkApiUrl,
    sendEmail,
};
