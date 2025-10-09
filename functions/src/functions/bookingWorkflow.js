const { app } = require('@azure/functions');
const { sendEmail, createResponse } = require('../utils/email');
const {
    updateBookingStatus,
    getBooking,
    getAdminBookings,
    getPublicBookings,
} = require('../utils/bookingStore');

const DEFAULT_FROM = process.env.DEFAULT_FROM_ADDRESS;
const ALLOW_ORIGIN = process.env.PLUNK_ALLOW_ORIGIN || '*';

const createHtmlResponse = (status, html) => ({
    status,
    body: html,
    headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': ALLOW_ORIGIN,
    },
});

const sendRequesterEmail = async (booking, status) => {
    if (!DEFAULT_FROM) {
        throw new Error('DEFAULT_FROM_ADDRESS is not configured.');
    }

    const isApproved = status === 'approved';
    const subject = isApproved
        ? 'Booking bekreftet'
        : 'Booking avvist';

    const text = isApproved
        ? `Hei ${booking.name},\n\nDin booking ${booking.date} kl ${booking.time} er nå bekreftet.\n\nHilsen Bjørkvång.`
        : `Hei ${booking.name},\n\nVi kan dessverre ikke imøtekomme bookingen ${booking.date} kl ${booking.time}.\n\nHilsen Bjørkvång.`;

    const html = isApproved
        ? `
            <p>Hei ${booking.name},</p>
            <p>Bookingen din ${booking.date} kl ${booking.time} er nå <strong>bekreftet</strong>.</p>
            <p>Hilsen Bjørkvång.</p>
        `
        : `
            <p>Hei ${booking.name},</p>
            <p>Vi kan dessverre ikke imøtekomme bookingen ${booking.date} kl ${booking.time}. Bookingen er markert som <strong>avvist</strong>.</p>
            <p>Hilsen Bjørkvång.</p>
        `;

    await sendEmail({
        to: booking.email,
        from: DEFAULT_FROM,
        subject,
        text,
        html,
    });
};

const handleStatusChange = async (request, context, status) => {
    const id = request.query.get('id');

    if (!id) {
        return createHtmlResponse(400, '<h2>Mangler booking-ID.</h2>');
    }

    const booking = getBooking(id);

    if (!booking) {
        return createHtmlResponse(404, '<h2>Fant ikke booking.</h2>');
    }

    const updated = updateBookingStatus(id, status);

    try {
        await sendRequesterEmail(updated, status);
    } catch (error) {
        context.log.error(`Failed to send ${status} email`, error);
    }

    const message =
        status === 'approved'
            ? 'Bookingen er godkjent. Bekreftelse er sendt til forespørrer.'
            : 'Bookingen er avvist. Forespørrer er varslet.';

    return createHtmlResponse(200, `<h2>${message}</h2>`);
};

app.http('approveBooking', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'booking/approve',
    handler: async (request, context) => handleStatusChange(request, context, 'approved'),
});

app.http('rejectBooking', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'booking/reject',
    handler: async (request, context) => handleStatusChange(request, context, 'rejected'),
});

app.http('getCalendar', {
    methods: ['GET', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'booking/calendar',
    handler: async (request) => {
        if (request.method === 'OPTIONS') {
            return createResponse(204);
        }

        // Public calendar hides requester identity.
        return createResponse(200, { bookings: getPublicBookings() });
    },
});

app.http('getAdminCalendar', {
    methods: ['GET', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'booking/admin/calendar',
    handler: async (request) => {
        if (request.method === 'OPTIONS') {
            return createResponse(204);
        }

        // Admin calendar exposes the full booking details for follow-up.
        return createResponse(200, { bookings: getAdminBookings() });
    },
});
