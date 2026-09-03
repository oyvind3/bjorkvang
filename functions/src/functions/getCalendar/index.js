const { app } = require('@azure/functions');
const { createJsonResponse } = require('../../../shared/http');
const { listBookings } = require('../../../shared/cosmosDb');

// Only bookings explicitly listed here may expose a public event name.
// All ordinary customer bookings remain anonymised as reservations.
const PUBLIC_BOOKING_LABELS = new Map([
    ['booking-1780234276656-4zv4dv4', 'Basar'],
]);

/**
 * Public calendar endpoint. Masks requester details and only exposes availability.
 */
app.http('getCalendar', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'booking/calendar',
    handler: async (request, context) => {
        context.log('getCalendar: Handling public calendar request');
        
        try {
            const allBookings = await listBookings();
            
            // Exclude rejected and cancelled bookings — they don't block dates
            const activeBookings = allBookings.filter(
                b => b.status !== 'rejected' && b.status !== 'cancelled'
            );

            // Only expose minimal information for public calendar
            const bookings = activeBookings.map((booking) => {
                const publicLabel = PUBLIC_BOOKING_LABELS.get(booking.id);

                return {
                    id: booking.id,
                    date: booking.date,
                    time: booking.time,
                    duration: booking.duration,
                    status: booking.status === 'approved' ? 'confirmed' : booking.status,
                    ...(publicLabel ? { title: publicLabel, eventType: publicLabel } : {}),
                };
            });
            
            context.log(`getCalendar: Successfully retrieved ${bookings.length} bookings`);
            return createJsonResponse(200, { bookings }, request);
        } catch (error) {
            context.log.error('getCalendar: Failed to retrieve calendar bookings', {
                error: error.message,
                stack: error.stack
            });
            return createJsonResponse(500, {
                error: 'Kunne ikke hente kalenderdata. Vennligst prøv igjen senere.',
            }, request);
        }
    },
});
