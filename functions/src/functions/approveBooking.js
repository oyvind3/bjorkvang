const { app } = require('@azure/functions');
const { sendEmail } = require('../../shared/email');
const { createHtmlResponse, createJsonResponse } = require('../../shared/http');
const { getBooking, updateBookingStatus } = require('../../shared/bookingStore');

/**
 * Approve a booking via a direct link.
 */
app.http('approveBooking', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'booking/approve',
    handler: async (request, context) => {
        const id = request.query.get('id');
        if (!id) {
            return createJsonResponse(400, { error: 'Missing booking id.' });
        }

        const existingBooking = getBooking(id);
        if (!existingBooking) {
            return createJsonResponse(404, { error: 'Booking not found.' });
        }

        if (existingBooking.status === 'approved') {
            return createHtmlResponse(200, '<p>Booking var allerede godkjent. Bekreftelse er tidligere sendt.</p>');
        }

        updateBookingStatus(id, 'approved');

        try {
            const from = process.env.DEFAULT_FROM_ADDRESS;
            if (from) {
                await sendEmail({
                    to: existingBooking.requesterEmail,
                    from,
                    subject: 'Din booking er godkjent',
                    text: `Hei ${existingBooking.requesterName}! Booking ${existingBooking.date} kl. ${existingBooking.time} er godkjent. Vi sees!`,
                    html: `
                        <p>Hei ${existingBooking.requesterName}!</p>
                        <p>Booking for ${existingBooking.date} kl. ${existingBooking.time} er nå godkjent.</p>
                        <p>Vennlig hilsen<br/>Bjorkvang.no</p>
                    `,
                });
            } else {
                context.log.warn('DEFAULT_FROM_ADDRESS is not set. Skipping confirmation email.');
            }
        } catch (error) {
            context.log.error('Failed to send booking approval email', error);
        }

        return createHtmlResponse(200, '<p>Booking er nå godkjent og bekreftelse er sendt til forespørrer.</p>');
    },
});
