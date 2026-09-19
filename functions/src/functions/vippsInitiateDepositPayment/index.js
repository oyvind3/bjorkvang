const { app } = require('@azure/functions');
const { createJsonResponse, parseBody } = require('../../../shared/http');
const { getBooking, updateBookingFields } = require('../../../shared/cosmosDb');
const { initiatePayment } = require('../../../shared/vipps');

/**
 * Create a fresh Vipps payment session for a previously requested deposit.
 * The link returned by Vipps is intentionally created on demand because it
 * expires after 10 minutes. The durable link sent by email points to the
 * complete-payment page instead of storing Vipps' short-lived redirect URL.
 */
app.http('vippsInitiateDepositPayment', {
    methods: ['POST', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'vipps/initiate-deposit-payment',
    handler: async (request, context) => {
        if (request.method === 'OPTIONS') {
            return createJsonResponse(204, {}, request);
        }

        try {
            const { bookingId } = await parseBody(request);

            if (!bookingId || typeof bookingId !== 'string') {
                return createJsonResponse(400, { error: 'bookingId is required' }, request);
            }

            const booking = await getBooking(bookingId.trim(), null);
            if (!booking) {
                return createJsonResponse(404, { error: 'Booking not found' }, request);
            }

            if (booking.paymentMethod !== 'vipps') {
                return createJsonResponse(400, { error: 'Denne bookingen er satt opp for bankbetaling.' }, request);
            }

            if (!booking.depositRequested) {
                return createJsonResponse(409, { error: 'Forhåndsbetalingen er ikke sendt ennå.' }, request);
            }

            if (booking.depositPaid) {
                return createJsonResponse(400, { error: 'Forhåndsbetalingen er allerede registrert.' }, request);
            }

            const totalNOK = Number(booking.totalAmount || (Number(booking.paymentAmount) || 0) / 100);
            const depositNOK = Number(booking.depositAmount || Math.round(totalNOK * 0.5));
            if (!Number.isFinite(depositNOK) || depositNOK <= 0) {
                return createJsonResponse(400, { error: 'Kunne ikke beregne forhåndsbetalingen.' }, request);
            }

            const safeId = bookingId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);
            const orderId = `dep-${safeId}-${Date.now().toString(36)}`.slice(0, 50);
            const websiteUrl = (process.env.WEBSITE_URL || 'https://bjorkvang.org').replace(/\/$/, '');
            const returnUrl = `${websiteUrl}/complete-payment.html?status=success&payment=deposit&bookingId=${encodeURIComponent(bookingId)}&orderId=${encodeURIComponent(orderId)}`;

            const paymentResponse = await initiatePayment({
                amount: Math.round(depositNOK * 100),
                orderId,
                returnUrl,
                text: `Forhåndsbetaling – Bjørkvang (${booking.eventType || 'leie'})`,
                phoneNumber: booking.phone || undefined
            });

            await updateBookingFields(bookingId, null, {
                depositVippsOrderId: orderId,
                depositPaymentLinkCreatedAt: new Date().toISOString()
            });

            return createJsonResponse(200, {
                url: paymentResponse.redirectUrl,
                orderId,
                amount: depositNOK,
                bookingId
            }, request);
        } catch (error) {
            context.error('vippsInitiateDepositPayment error:', error);
            return createJsonResponse(500, { error: 'Kunne ikke starte Vipps-betalingen.' }, request);
        }
    }
});
