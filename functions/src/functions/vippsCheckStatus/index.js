const { app } = require('@azure/functions');
const { createJsonResponse, parseBody } = require('../../../shared/http');
const { getPayment, capturePayment } = require('../../../shared/vipps');
const { getBooking, updateBookingStatus, updateBookingFields } = require('../../../shared/cosmosDb');
const { sendEmail } = require('../../../shared/email');
const { generateEmailHtml } = require('../../../shared/emailTemplate');
const { sendSmsToAdminGroup, buildSmsMessage } = require('../../../shared/sms');

app.http('vippsCheckStatus', {
    methods: ['POST', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'vipps/check-status',
    handler: async (request, context) => {
        try {
            const body = await parseBody(request);
            const { orderId, paymentType, bookingId } = body;

            if (!orderId) {
                return createJsonResponse(400, { error: 'Missing orderId' });
            }

            const payment = await getPayment(orderId);
            let status = payment.state; // e.g., 'CREATED', 'AUTHORIZED', 'TERMINATED'

            // If authorized, capture the payment to complete it
            if (status === 'AUTHORIZED') {
                try {
                    // Capture the full amount
                    await capturePayment(orderId, payment.amount.value);
                    status = 'CAPTURED';
                } catch (captureError) {
                    context.error('Capture failed:', captureError);
                    // If capture fails, we still report the authorized state, but log it.
                }
            }

            // If this is a contract payment and payment succeeded, update the booking
            if ((status === 'AUTHORIZED' || status === 'CAPTURED') && orderId.startsWith('contract-payment-')) {
                try {
                    // Extract booking ID from orderId format: "contract-payment-{bookingId}-{timestamp}"
                    const parts = orderId.split('-');
                    // orderId format: contract-payment-booking-{timestamp}-{random}-{timestamp}
                    // We need to reconstruct the booking ID
                    const bookingIdMatch = orderId.match(/contract-payment-(booking-\d+-[a-z0-9]+)/);

                    if (bookingIdMatch) {
                        const bookingId = bookingIdMatch[1];
                        context.info(`Contract payment successful for booking ${bookingId}, updating status`);

                        // Get the booking
                        const booking = await getBooking(bookingId, null);

                        if (booking) {
                            // Update booking with payment info
                            booking.paymentStatus = 'paid';
                            booking.paymentOrderId = orderId;
                            booking.paymentCompletedAt = new Date().toISOString();

                            // Use the updateBookingStatus or directly update - we need a function for this
                            // For now, we'll need to add this to cosmosDb.js or use the existing update
                            const { initCosmosClient } = require('../../../shared/cosmosDb');
                            const db = initCosmosClient();

                            if (db && db.container) {
                                await db.container.item(bookingId, booking.bjorkvang).replace(booking);
                                context.info(`Booking ${bookingId} marked as paid`);

                                // Send confirmation email
                                try {
                                    const emailHtml = generateEmailHtml({
                                        title: 'Betaling bekreftet',
                                        content: `
                                            <p>Hei ${booking.requesterName},</p>
                                            <p>Takk for betalingen! Din booking er nå fullstendig bekreftet og aktiv.</p>
                                            <div style="background: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
                                                <p style="margin: 0 0 10px 0;"><strong>Bookingdetaljer:</strong></p>
                                                <ul style="margin: 0; padding-left: 20px;">
                                                    <li>Booking ID: ${bookingId.replace('booking-', '').toUpperCase()}</li>
                                                    <li>Dato: ${booking.date}</li>
                                                    <li>Lokaler: ${Array.isArray(booking.spaces) ? booking.spaces.join(', ') : booking.spaces}</li>
                                                    <li>Betalt beløp: ${(booking.paymentAmount / 100).toLocaleString('nb-NO')} kr</li>
                                                </ul>
                                            </div>
                                            <p>Vi gleder oss til å se deg!</p>
                                        `,
                                        previewText: 'Betaling bekreftet'
                                    });

                                    await sendEmail({
                                        to: booking.requesterEmail,
                                        from: process.env.DEFAULT_FROM_ADDRESS || 'Bjorkvang <styret@bjorkvang.org>',
                                        subject: 'Betaling bekreftet – Booking aktiv',
                                        html: emailHtml,
                                        text: `Hei ${booking.requesterName},\n\nTakk for betalingen! Din booking for ${booking.date} er nå aktiv.`
                                    });

                                    context.info(`Payment confirmation email sent to ${booking.requesterEmail}`);
                                } catch (emailError) {
                                    context.error(`Failed to send payment confirmation email: ${emailError.message}`);
                                }
                                // Admin group SMS
                                try {
                                    const amountNOK = booking.paymentAmount ? Math.round(booking.paymentAmount / 100) : null;
                                    const adminSmsBody = buildSmsMessage('admin.paymentReceived', {
                                        requesterName: booking.requesterName,
                                        date: booking.date,
                                        amountNOK,
                                    });
                                    await sendSmsToAdminGroup(adminSmsBody, context);
                                } catch (smsError) {
                                    context.warn(`Failed to send admin payment SMS: ${smsError.message}`);
                                }
                            }
                        }
                    }
                } catch (updateError) {
                    context.error(`Failed to update booking after payment: ${updateError.message}`);
                    // Don't fail the request - payment was successful
                }
            }

            // Deposit links are created on demand and use the dep-* prefix.
            // The booking ID is supplied by the payment page because the
            // sanitized order reference cannot reliably reconstruct it.
            if ((status === 'AUTHORIZED' || status === 'CAPTURED') &&
                (paymentType === 'deposit' || orderId.startsWith('dep-')) && bookingId) {
                try {
                    const booking = await getBooking(bookingId, null);
                    if (booking && !booking.depositPaid) {
                        await updateBookingFields(bookingId, null, {
                            depositPaid: true,
                            depositPaidAt: new Date().toISOString(),
                            depositVippsOrderId: orderId
                        });
                        context.info(`Deposit payment successful for booking ${bookingId}`);
                    }
                } catch (updateError) {
                    context.error(`Failed to update deposit after payment: ${updateError.message}`);
                    // Do not turn a successful Vipps payment into a client error.
                }
            }

            return createJsonResponse(200, {
                status: status,
                details: payment
            });

        } catch (error) {
            context.error('Vipps check status error:', error);
            return createJsonResponse(500, { error: error.message });
        }
    }
});
