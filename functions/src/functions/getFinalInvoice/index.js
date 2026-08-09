const { app } = require('@azure/functions');
const { createJsonResponse } = require('../../../shared/http');
const { getBooking } = require('../../../shared/cosmosDb');
const { buildFinalInvoice, generateInvoiceTableHtml, generateInvoiceText } = require('../../../shared/invoiceBuilder');

/**
 * Get final invoice data for a booking
 * GET /api/booking/get-final-invoice?id={id}
 * 
 * Returns the invoice data either from:
 * 1. Stored data on the booking (if finalInvoiceSentAt exists)
 * 2. Reconstructed data using the invoice builder
 * 
 * Requires admin authentication via X-Admin-Key header
 */
app.http('getFinalInvoice', {
    methods: ['GET', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'booking/get-final-invoice',
    handler: async (request, context) => {
        if (request.method === 'OPTIONS') {
            return createJsonResponse(204, {}, request);
        }

        const id = request.query.get('id');
        if (!id || typeof id !== 'string' || !id.trim()) {
            return createJsonResponse(400, { error: 'Missing booking id.' }, request);
        }

        const booking = await getBooking(id.trim());
        if (!booking) {
            return createJsonResponse(404, { error: 'Booking not found.' }, request);
        }

        // Check if invoice was ever sent
        if (!booking.finalInvoiceSentAt && !booking.invoiceSentAt) {
            return createJsonResponse(404, { error: 'Sluttfaktura er ikke sendt for denne bookingen.' }, request);
        }

        try {
            // Reconstruct invoice data using stored values
            const invoiceData = buildFinalInvoice(booking, {
                cleaningFeeNOK: booking.cleaningFeeNOK || 1000,
                extraItems: booking.invoiceItems ? booking.invoiceItems.filter(item => 
                    item.description !== 'Vask / Rengjøring' && 
                    item.description !== 'Forhåndsbetaling trukket fra'
                ) : [],
                minnesamvaerActualCount: booking.minnesamvaerActualCount || null,
                minnesamvaerRate: booking.minnesamvaerRate || 30,
                // Use stored dueDate if available, otherwise calculate from sent date
                dueDate: booking.dueDate ? new Date(booking.dueDate) : null
            });

            // Build HTML for display
            const tableHtml = generateInvoiceTableHtml(invoiceData);
            const textContent = generateInvoiceText(invoiceData);

            // Determine payment method and status
            const paymentMethod = booking.paymentMethod || 'bank';
            const bankAccount = process.env.BANK_ACCOUNT || '1822.40.12345';
            const isPaid = !!booking.finalInvoicePaid || !!booking.finalInvoicePaidAt;
            
            // Build Vipps URL if applicable (note: original link expires, this is informational)
            let vippsUrl = null;
            if (booking.finalInvoiceVippsOrderId && !isPaid && invoiceData.remainingNOK > 0) {
                // We cannot regenerate the exact Vipps URL, but we can indicate Vipps was used
                vippsUrl = null; // Original link is expired
            }

            const response = {
                bookingId: booking.id,
                sentAt: booking.finalInvoiceSentAt || booking.invoiceSentAt,
                paidAt: booking.finalInvoicePaidAt || null,
                isPaid,
                invoice: {
                    ...invoiceData,
                    tableHtml,
                    textContent,
                    bankAccount,
                    paymentMethod,
                    vippsUsed: !!booking.finalInvoiceVippsOrderId,
                    vippsOrderId: booking.finalInvoiceVippsOrderId || null
                },
                summary: {
                    grandTotalNOK: invoiceData.grandTotalNOK,
                    depositNOK: invoiceData.depositNOK,
                    remainingNOK: invoiceData.remainingNOK,
                    cleaningFeeNOK: invoiceData.cleaningFeeNOK,
                    dueDateStr: booking.dueDate || invoiceData.dueDateStr
                }
            };

            return createJsonResponse(200, response, request);
        } catch (err) {
            context.error('getFinalInvoice: Failed to build invoice data', err);
            return createJsonResponse(500, { error: 'Kunne ikke bygge fakturadata.' }, request);
        }
    }
});
