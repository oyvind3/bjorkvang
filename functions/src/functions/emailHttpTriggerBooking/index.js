const { app } = require('@azure/functions');
const { sendEmail } = require('../../../shared/email');
const { createJsonResponse, parseBody } = require('../../../shared/http');

const maskEmailForLog = (value) => {
    if (!value) {
        return value;
    }

    const [localPart, domain] = String(value).split('@');

    if (!domain || localPart.length <= 2) {
        return `${localPart ? localPart[0] : ''}***`;
    }

    return `${localPart.slice(0, 2)}***@${domain}`;
};

app.http('emailHttpTriggerBooking', {
    methods: ['POST', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'emailHttpTriggerBooking',
    handler: async (request, context) => {
        context.log('emailHttpTriggerBooking invoked', {
            method: request.method,
            url: request.url,
        });

        if (request.method === 'OPTIONS') {
            context.log('emailHttpTriggerBooking handled CORS preflight');
            return createJsonResponse(204);
        }

        const body = await parseBody(request);
        context.log('emailHttpTriggerBooking payload received', {
            hasTo: Boolean(body?.to),
            hasFrom: Boolean(body?.from),
            subject: body?.subject || null,
        });

        const defaultToAddress =
            (process.env.BOARD_TO_ADDRESS && process.env.BOARD_TO_ADDRESS.trim()) ||
            (process.env.DEFAULT_TO_ADDRESS && process.env.DEFAULT_TO_ADDRESS.trim()) ||
            'helgoens.vel@example.com';
        const defaultFromAddress =
            (process.env.DEFAULT_FROM_ADDRESS && process.env.DEFAULT_FROM_ADDRESS.trim()) ||
            'booking@finsrud.cloud';

        const to = (body?.to && String(body.to).trim()) || defaultToAddress;
        const from = (body?.from && String(body.from).trim()) || defaultFromAddress;
        const subject = body?.subject || 'Plunk test';
        const html = body?.html || '<p>Hei fra Azure Function via Plunk!</p>';
        const text = body?.text || 'Hei fra Azure Function via Plunk!';
        const replyTo = (body?.replyTo && String(body.replyTo).trim()) || undefined;

        if (!to || !from) {
            context.log.warn('emailHttpTriggerBooking missing required addresses', {
                hasTo: Boolean(to),
                hasFrom: Boolean(from),
            });
            return createJsonResponse(400, { error: 'Missing "to" or "from" field.' });
        }

        try {
            const result = await sendEmail({
                to,
                from,
                subject,
                text,
                html,
                replyTo,
            });

            context.log('emailHttpTriggerBooking succeeded', {
                messageId: result.messageId || null,
                to: maskEmailForLog(to),
                from: maskEmailForLog(from),
            });

            return createJsonResponse(202, {
                success: true,
                response: result,
            });
        } catch (error) {
            context.log.error('emailHttpTriggerBooking failed to send email', {
                error: error.message,
                to: maskEmailForLog(to),
                from: maskEmailForLog(from),
            });
            return createJsonResponse(500, { error: 'Failed to send email.' });
        }
    },
});
