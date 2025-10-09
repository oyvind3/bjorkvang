const { app } = require('@azure/functions');
const { createJsonResponse } = require('./http');
const { listBookings } = require('./bookingStore');

/**
 * Admin calendar endpoint with full requester visibility.
 */
app.http('getAdminCalendar', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'booking/admin',
    handler: async () => {
        const bookings = listBookings();
        return createJsonResponse(200, { bookings });
    },
});
