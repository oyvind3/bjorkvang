const { app } = require('@azure/functions');
const { sendEmail, createResponse, parseBody } = require('../utils/email');
const { createBooking } = require('../utils/bookingStore');

const BOARD_EMAIL = process.env.BOARD_APPROVER_EMAIL || process.env.DEFAULT_TO_ADDRESS;
const DEFAULT_FROM = process.env.DEFAULT_FROM_ADDRESS;
const ACTION_BASE_URL = (process.env.BOOKING_ACTION_BASE_URL || '').replace(/\/$/, '');

const buildActionLink = (action, bookingId) => {
    const path = `/api/booking/${action}?id=${bookingId}`;
    return `${ACTION_BASE_URL}${path}` || path;
};

const renderBoardEmail = (booking) => {
    const approveLink = buildActionLink('approve', booking.id);
    const rejectLink = buildActionLink('reject', booking.id);

    return {
        subject: 'Ny bookingforespørsel – venter på godkjenning',
        text: `Ny bookingforespørsel:\nDato: ${booking.date}\nTid: ${booking.time}\nNavn: ${booking.name}\nE-post: ${booking.email}\nMelding: ${booking.message || 'Ingen melding'}\n\nGodkjenn: ${approveLink}\nAvvis: ${rejectLink}`,
        html: `
            <h2>Ny bookingforespørsel – venter på godkjenning</h2>
            <p><strong>Dato:</strong> ${booking.date}</p>
            <p><strong>Tid:</strong> ${booking.time}</p>
            <p><strong>Navn:</strong> ${booking.name}</p>
            <p><strong>E-post:</strong> ${booking.email}</p>
            <p><strong>Melding:</strong> ${booking.message || 'Ingen melding gitt.'}</p>
            <p style="margin-top: 16px;">
                <a href="${approveLink}" style="padding: 10px 16px; background-color: #0f8c4d; color: #ffffff; text-decoration: none; margin-right: 8px;">Godkjenn booking</a>
                <a href="${rejectLink}" style="padding: 10px 16px; background-color: #c0392b; color: #ffffff; text-decoration: none;">Avvis booking</a>
            </p>
        `,
    };
};

const isBookingRequest = (body = {}) => {
    const date = body.date || body.bookingDate;
    const time = body.time || body.bookingTime;
    const name = body.name || body.requesterName;
    const email = body.email || body.requesterEmail;

    return Boolean(date && time && name && email);
};

app.http('emailHttpTriggerBooking', {
    methods: ['POST', 'OPTIONS'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        if (request.method === 'OPTIONS') {
            return createResponse(204);
        }

        const body = await parseBody(request);

        if (isBookingRequest(body)) {
            if (!BOARD_EMAIL || !DEFAULT_FROM) {
                context.log.error('Board email or default sender not configured.');
                return createResponse(500, { error: 'Booking approval email cannot be sent at this time.' });
            }

            const booking = createBooking({
                date: body.date || body.bookingDate,
                time: body.time || body.bookingTime,
                name: body.name || body.requesterName,
                email: body.email || body.requesterEmail,
                message: body.message || body.notes || '',
            });

            const boardEmail = renderBoardEmail(booking);

            try {
                await sendEmail({
                    to: BOARD_EMAIL,
                    from: DEFAULT_FROM,
                    subject: boardEmail.subject,
                    text: boardEmail.text,
                    html: boardEmail.html,
                });

                context.log(`Booking ${booking.id} stored and notification sent to board.`);
                return createResponse(202, { bookingId: booking.id, status: booking.status });
            } catch (error) {
                context.log.error('Failed to send booking notification email', error);
                return createResponse(500, { error: 'Failed to send booking notification.' });
            }
        }

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
            const info = await sendEmail({
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
