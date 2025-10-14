const { app } = require('@azure/functions');
const { createJsonResponse } = require('../../shared/http');
const { listBookings } = require('../../shared/bookingStore');

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
