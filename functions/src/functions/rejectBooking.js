const { app } = require('@azure/functions');
const { sendEmail } = require('./shared/email');
const { createHtmlResponse, createJsonResponse, parseBody } = require('./shared/http');
const { getBooking, updateBookingStatus } = require('./shared/bookingStore');

/**
 * Reject a booking via link or API call. Accepts optional message via POST.
 */
app.http('rejectBooking', {
    methods: ['GET', 'POST', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'booking/reject',
    handler: async (request, context) => {
        if (request.method === 'OPTIONS') {
            return createJsonResponse(204);
        }

        const id = request.query.get('id');
        if (!id) {
            return createJsonResponse(400, { error: 'Missing booking id.' });
        }

        const existingBooking = getBooking(id);
        if (!existingBooking) {
            return createJsonResponse(404, { error: 'Booking not found.' });
        }

        if (existingBooking.status === 'rejected') {
            return createHtmlResponse(200, '<p>Booking var allerede avvist. Forespørrer er informert.</p>');
        }

        let rejectionMessage = '';
        if (request.method === 'POST') {
            const body = await parseBody(request);
            rejectionMessage = body.reason || '';
        }

        updateBookingStatus(id, 'rejected');

        try {
            const from = process.env.DEFAULT_FROM_ADDRESS;
            if (from) {
                const htmlMessage = rejectionMessage
                    ? `<p>Årsak: ${rejectionMessage}</p>`
                    : '<p>Ta gjerne kontakt om du har spørsmål.</p>';

                await sendEmail({
                    to: existingBooking.requesterEmail,
                    from,
                    subject: 'Din booking ble dessverre avvist',
                    text: `Hei ${existingBooking.requesterName}. Booking ${existingBooking.date} kl. ${existingBooking.time} ble avvist. ${rejectionMessage}`.trim(),
                    html: `
                        <p>Hei ${existingBooking.requesterName},</p>
                        <p>Vi må dessverre avvise booking for ${existingBooking.date} kl. ${existingBooking.time}.</p>
                        ${htmlMessage}
                        <p>Vennlig hilsen<br/>Bjorkvang.no</p>
                    `,
                });
            } else {
                context.log.warn('DEFAULT_FROM_ADDRESS is not set. Skipping rejection email.');
            }
        } catch (error) {
            context.log.error('Failed to send booking rejection email', error);
        }

        return createHtmlResponse(200, '<p>Booking er nå avvist og forespørrer er informert.</p>');
    },
});
