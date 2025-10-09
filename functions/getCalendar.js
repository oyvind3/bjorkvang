const { app } = require('@azure/functions');
const { createJsonResponse } = require('./http');
const { listBookings } = require('./bookingStore');

/**
 * Public calendar endpoint. Masks requester details and only exposes availability.
 */
app.http('getCalendar', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'booking/calendar',
    handler: async () => {
        const bookings = listBookings().map((booking) => ({
            id: booking.id,
            date: booking.date,
            time: booking.time,
            status: booking.status === 'approved' ? 'booked' : booking.status,
        }));

        return createJsonResponse(200, { bookings });
    },
});
