const { app } = require('@azure/functions');
const { createJsonResponse } = require('../shared/http');
const { listBookings } = require('../shared/bookingStore');

/**
 * Admin calendar endpoint with full requester visibility.
 */
app.http('getAdminCalendar', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'get-admin-calendar',
    handler: async (request, context) => {
        context.log('Handling getAdminCalendar request');

        try {
            const bookings = await listBookings();
            context.log(`Successfully retrieved ${bookings.length} bookings for admin calendar.`);
            return createJsonResponse(200, { bookings });
        } catch (error) {
            context.log.error('Failed to retrieve admin calendar bookings', error);
            return createJsonResponse(500, {
                error: 'Kunne ikke hente booking-data. Vennligst prøv igjen senere.',
            });
        }
    },
});
