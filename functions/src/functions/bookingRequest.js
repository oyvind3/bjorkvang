const { app } = require('@azure/functions');
const { sendEmail } = require('../shared/email');
const { createJsonResponse, parseBody, resolveBaseUrl } = require('../shared/http');
const { createBooking } = require('../shared/bookingStore');

/**
 * Handle incoming booking submissions from the public website.
 * Stores the booking and notifies the board for approval using the Plunk SMTP setup.
 */
app.http('bookingRequest', {
    methods: ['POST', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'booking',
    handler: async (request, context) => {
        if (request.method === 'OPTIONS') {
            return createJsonResponse(204);
        }

        const body = await parseBody(request);
        const { date, time, requesterName, requesterEmail, message } = body;

        if (!date || !time || !requesterName || !requesterEmail) {
            context.log.warn('Booking request missing required fields', body);
            return createJsonResponse(400, { error: 'Missing one of required fields: date, time, requesterName, requesterEmail.' });
        }

        try {
            const booking = createBooking({ date, time, requesterName, requesterEmail, message });
            const baseUrl = resolveBaseUrl(request);
            const approveLink = `${baseUrl}/api/booking/approve?id=${booking.id}`;
            const rejectLink = `${baseUrl}/api/booking/reject?id=${booking.id}`;

            const to = process.env.BOARD_TO_ADDRESS || process.env.DEFAULT_TO_ADDRESS;
            const from = process.env.DEFAULT_FROM_ADDRESS;

            if (!to || !from) {
                context.log.error('Missing board or default email addresses. to=%s from=%s', to, from);
                return createJsonResponse(500, { error: 'Email configuration missing. Please contact an administrator.' });
            }

            const html = `
                <p>Hei styret,</p>
                <p>Det har kommet en ny bookingforespørsel som venter på godkjenning:</p>
                <ul>
                    <li><strong>Dato:</strong> ${booking.date}</li>
                    <li><strong>Tid:</strong> ${booking.time}</li>
                    <li><strong>Navn:</strong> ${booking.requesterName}</li>
                    <li><strong>E-post:</strong> ${booking.requesterEmail}</li>
                    <li><strong>Melding:</strong> ${booking.message || 'Ingen melding oppgitt.'}</li>
                </ul>
                <p>Bruk knappene under for å godkjenne eller avvise:</p>
                <p>
                    <a href="${approveLink}" style="display:inline-block;padding:10px 16px;margin-right:12px;background:#1a823b;color:#ffffff;text-decoration:none;border-radius:4px;">Godkjenn booking</a>
                    <a href="${rejectLink}" style="display:inline-block;padding:10px 16px;background:#b3261e;color:#ffffff;text-decoration:none;border-radius:4px;">Avvis booking</a>
                </p>
                <p>Vennlig hilsen<br/>Bjorkvang.no</p>
            `;

            const text = `Ny bookingforespørsel:\nDato: ${booking.date}\nTid: ${booking.time}\nNavn: ${booking.requesterName}\nE-post: ${booking.requesterEmail}\nMelding: ${booking.message || 'Ingen melding'}\nGodkjenn: ${approveLink}\nAvvis: ${rejectLink}`;

            await sendEmail({
                to,
                from,
                subject: 'Ny bookingforespørsel – venter på godkjenning',
                text,
                html,
            });

            context.log(`Stored booking ${booking.id} and notified board.`);
            return createJsonResponse(202, {
                id: booking.id,
                status: booking.status,
            });
        } catch (error) {
            context.log.error('Failed to process booking request', error);
            return createJsonResponse(500, { error: 'Unable to process booking right now.' });
        }
    },
});
