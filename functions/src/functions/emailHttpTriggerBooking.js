const { app } = require('@azure/functions');
const { sendEmail } = require('./shared/email');
const { createJsonResponse, parseBody } = require('./shared/http');

app.http('emailHttpTriggerBooking', {
    methods: ['POST', 'OPTIONS'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        if (request.method === 'OPTIONS') {
            return createJsonResponse(204);
        }

        const body = await parseBody(request);
        const to = body.to || process.env.DEFAULT_TO_ADDRESS;
        const from = body.from || process.env.DEFAULT_FROM_ADDRESS;
        const subject = body.subject || 'Plunk is awesome!';
        const text = body.text || undefined;
        const html = body.html || 'Check it out at https://useplunk.com';

        if (!to || !from) {
            context.log.warn('Missing "to" or "from" in request body.');
            return createJsonResponse(400, { error: 'Missing "to" or "from" field.' });
        }

        try {
            const info = await sendEmail({
                to,
                from,
                subject,
                text,
                html,
            });

            context.log('Email sent', info.messageId);
            return createJsonResponse(202, { messageId: info.messageId });
        } catch (error) {
            context.log.error('Failed to send email', error);
            return createJsonResponse(500, { error: 'Failed to send email.' });
        }
    },
});
