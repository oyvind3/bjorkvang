const { app } = require('@azure/functions');
const { createJsonResponse } = require('../../../shared/http');
const { getBooking, updateBookingFields } = require('../../../shared/cosmosDb');
const { sendEmail } = require('../../../shared/email');
const { sendSms, buildSmsMessage } = require('../../../shared/sms');
const { generateEmailHtml } = require('../../../shared/emailTemplate');
const vipps = require('../../../shared/vipps');
const { buildFinalInvoice, generateInvoiceTableHtml, generateInvoiceText } = require('../../../shared/invoiceBuilder');

const escapeHtml = (str) => String(str || '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[m]);

/**
 * Send an itemised final invoice (sluttfaktura) to the booking requester.
 * POST /api/booking/send-final-invoice
 * Body: { id, cleaningFeeNOK?: number, extraItems?: [...], minnesamvaerActualCount?: number, minnesamvaerRate?: number }
 *
 * - Calculates remaining = (totalAmount - depositAmount) + cleaningFeeNOK + sum(extraItems)
 * - If paymentMethod === 'vipps': creates Vipps payment link, embeds in email
 * - If 'bank': includes bank account in email
 * - Returns 409 if invoice was already sent (prevents accidental duplicate)
 */
app.http('sendFinalInvoice', {
    methods: ['POST', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'booking/send-final-invoice',
    handler: async (request, context) => {
        if (request.method === 'OPTIONS') {
            return createJsonResponse(204, {}, request);
        }

        let body = {};
        try { body = await request.json(); } catch { /* also accept query param */ }

        const id = body.id || request.query.get('id');
        if (!id || typeof id !== 'string' || !id.trim()) {
            return createJsonResponse(400, { error: 'Missing booking id.' }, request);
        }

        const extraItems = Array.isArray(body.extraItems) ? body.extraItems : [];
        // Mandatory cleaning fee — default 1000 NOK, admin can adjust
        const cleaningFeeNOK = (typeof body.cleaningFeeNOK === 'number' && body.cleaningFeeNOK >= 0)
            ? body.cleaningFeeNOK
            : 1000;
        // Minnesamvær per-person pricing
        const minnesamvaerActualCount = (typeof body.minnesamvaerActualCount === 'number' && body.minnesamvaerActualCount > 0)
            ? Math.floor(body.minnesamvaerActualCount)
            : null;
        const minnesamvaerRate = (typeof body.minnesamvaerRate === 'number' && body.minnesamvaerRate >= 0)
            ? body.minnesamvaerRate
            : 30;
        // Skip sending email/Vipps — just record amounts and mark as paid
        const skipEmail = body.skipEmail === true;
        // Validate extra items
        for (const item of extraItems) {
            if (!item.description || typeof item.description !== 'string' || item.description.length > 200) {
                return createJsonResponse(400, { error: 'Extra item description is required and must be ≤200 chars.' }, request);
            }
            if (typeof item.amountNOK !== 'number' || item.amountNOK < 0) {
                return createJsonResponse(400, { error: 'Extra item amountNOK must be a non-negative number.' }, request);
            }
        }

        const booking = await getBooking(id.trim());
        if (!booking) {
            return createJsonResponse(404, { error: 'Booking not found.' }, request);
        }

        // Block duplicate sends unless explicitly forced
        if (booking.finalInvoiceSentAt && !body.force) {
            return createJsonResponse(409, {
                error: 'Sluttfaktura er allerede sendt. Bruk force: true for å sende på nytt.',
                sentAt: booking.finalInvoiceSentAt
            }, request);
        }

        const from = process.env.DEFAULT_FROM_ADDRESS;
        if (!from) {
            context.error('sendFinalInvoice: DEFAULT_FROM_ADDRESS is not set');
            return createJsonResponse(500, { error: 'Manglende e-postkonfigurasjon.' }, request);
        }

        if (!booking.requesterEmail && !skipEmail) {
            return createJsonResponse(400, { error: 'Booking mangler e-postadresse.' }, request);
        }

const depositNOK = booking.depositAmount || 0;

        // Use shared invoice builder for all calculations
        const invoiceData = buildFinalInvoice(booking, {
            cleaningFeeNOK,
            extraItems,
            minnesamvaerActualCount,
            minnesamvaerRate,
            dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        });

        const { baseTotalNOK, grandTotalNOK, remainingNOK, paymentMethod, bankAccount, lineItems, dueDateStr } = invoiceData;
        const websiteUrl = process.env.WEBSITE_URL || 'https://bjorkvang.org';
        const now = new Date().toISOString();

        // Build itemised rows for the email table using invoiceData.lineItems
        const itemRowsHtml = generateInvoiceTableHtml(invoiceData);
        const itemRowsText = generateInvoiceText(invoiceData);

        let finalInvoiceVippsOrderId = null;
        let vippsUrl = null;

        if (!skipEmail) {
            const tableHtml = `
            <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:15px;">
                <tr style="border-bottom:2px solid #e5e7eb;font-weight:600;">
                    <td style="padding:8px 0;">Beskrivelse</td>
                    <td style="padding:8px 0;text-align:right;">Beløp</td>
                </tr>
                ${itemRowsHtml}
                <tr style="border-top:2px solid #e5e7eb;">
                    <td style="padding:10px 0;font-weight:600;">Totalt for leieforholdet</td>
                    <td style="padding:10px 0;text-align:right;font-weight:600;">kr ${grandTotalNOK.toLocaleString('nb-NO')}</td>
                </tr>
                <tr>
                    <td style="padding:14px 0 0;font-weight:bold;font-size:18px;">Gjenstående å betale</td>
                    <td style="padding:14px 0 0;text-align:right;font-weight:bold;font-size:18px;">kr ${remainingNOK.toLocaleString('nb-NO')}</td>
                </tr>
            </table>`;

            const infoNote = `<p style="font-size:0.88rem;color:#6b7280;margin-top:8px;">
            Forhåndsbetaling (kr ${depositNOK.toLocaleString('nb-NO')}) er allerede betalt og er trukket fra totalbeløpet.
            Forhåndsbetalingen refunderes ikke. Har du spørsmål? Ta kontakt på
            <a href="mailto:styret@bjorkvang.org">styret@bjorkvang.org</a>.
            </p>`;

            if (paymentMethod === 'vipps' && remainingNOK > 0) {
                const safeId = id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);
                const orderId = `inv-${safeId}-${Date.now().toString(36)}`.slice(0, 50);
                const returnUrl = `${websiteUrl}/booking?invoiceReturn=1&orderId=${encodeURIComponent(orderId)}`;

                try {
                    const vippsResponse = await vipps.initiatePayment({
                        amount: remainingNOK * 100, // øre
                        orderId,
                        returnUrl,
                        text: `Sluttfaktura – Bjørkvang (${booking.eventType || 'leie'})`,
                        phoneNumber: booking.phone || undefined
                    });
                    vippsUrl = vippsResponse.redirectUrl;
                    finalInvoiceVippsOrderId = orderId;
                } catch (err) {
                    context.error('sendFinalInvoice: Failed to create Vipps payment', err);
                    return createJsonResponse(502, { error: 'Kunne ikke opprette Vipps-betaling.' }, request);
                }
            }

            const emailSubject = `Sluttfaktura – Bjørkvang (${booking.date || ''})`;

            const emailText = [
                `Hei ${booking.requesterName},`,
                '',
                'Takk for at du leide Bjørkvang! Vi håper arrangementet gikk bra.',
                '',
                `Arrangement: ${booking.eventType || ''}  |  Dato: ${booking.date || ''}`,
                '',
                itemRowsText,
                `Totalt for leieforholdet: kr ${grandTotalNOK.toLocaleString('nb-NO')}`,
                `Gjenstående å betale: kr ${remainingNOK.toLocaleString('nb-NO')}`,
                '',
                `Betalingsfrist: ${dueDateStr}`,
                vippsUrl ? `Betal med Vipps: ${vippsUrl}` : `Kontonummer: ${bankAccount}  |  Merk: ${id}`,
                '',
                'Forhåndsbetaling er allerede betalt og trukket fra beløpet.',
                '',
                'Med vennlig hilsen,',
                'Styret ved Bjørkvang'
            ].join('\n');

            const paymentInfoHtml = vippsUrl
                ? `<p>Bruk knappen under for å betale sikkert med Vipps:</p>`
                : `
                    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin:16px 0;">
                        <p style="margin:0 0 8px;font-weight:bold;">Betalingsinformasjon</p>
                        <p style="margin:4px 0;">🏦 <strong>Kontonummer:</strong> ${escapeHtml(bankAccount)}</p>
                        <p style="margin:4px 0;">📋 <strong>Merk betalingen med:</strong> ${escapeHtml(id)}</p>
                        <p style="margin:4px 0;">📅 <strong>Betalingsfrist:</strong> ${escapeHtml(dueDateStr)}</p>
                    </div>`;

            const emailHtml = generateEmailHtml({
                title: 'Sluttfaktura – Bjørkvang',
                previewText: `Restbeløp kr ${remainingNOK.toLocaleString('nb-NO')} – betalingsfrist ${dueDateStr}`,
                content: `
                    <p>Hei ${escapeHtml(booking.requesterName)},</p>
                    <p>Takk for at du leide Bjørkvang forsamlingslokale! Vi håper arrangementet gikk bra.</p>
                    <p>Her er sluttfakturaen med full oversikt over kostnader:</p>
                    ${tableHtml}
                    ${paymentInfoHtml}
                    ${infoNote}
                    <p>Med vennlig hilsen,<br>Styret ved Bjørkvang</p>`,
                ...(vippsUrl ? { action: { text: 'Betal kr ' + remainingNOK.toLocaleString('nb-NO') + ' med Vipps', url: vippsUrl, color: '#ff5b24', rounded: true } } : {})
            });

            try {
                await sendEmail({
                    from,
                    to: booking.requesterEmail,
                    subject: emailSubject,
                    html: emailHtml,
                    text: emailText
                });
                context.info(`sendFinalInvoice: Invoice sent to ${booking.requesterEmail} for booking ${id}`);
            } catch (err) {
                context.error(`sendFinalInvoice: Failed to send email for booking ${id}`, err);
                return createJsonResponse(500, { error: 'Kunne ikke sende faktura-e-post.' }, request);
            }

            // --- SMS med sluttfaktura og betalingslenke ---
            if (booking.phone) {
                let invoiceSmsBody;
                if (vippsUrl) {
                    invoiceSmsBody = buildSmsMessage('customer.finalInvoiceVipps', {
                        requesterName: booking.requesterName,
                        date: booking.date,
                        amountNOK: remainingNOK,
                    });
                } else {
                    invoiceSmsBody = buildSmsMessage('customer.finalInvoiceBank', {
                        requesterName: booking.requesterName,
                        date: booking.date,
                        amountNOK: remainingNOK,
                        bankAccount,
                        bookingId: id,
                    });
                }
                await sendSms({ to: booking.phone, body: invoiceSmsBody }, context);
            }
        } else {
            context.info(`sendFinalInvoice: skipEmail=true — recording amounts and marking as paid without sending email for booking ${id}`);
        }

        const updateFields = {
            finalInvoiceSentAt: now,
            finalInvoiceAmountNOK: remainingNOK,
            grandTotalNOK,
            dueDate: dueDateStr,
            cleaningFeeNOK,
            ...(minnesamvaerActualCount !== null ? { minnesamvaerActualCount, minnesamvaerRate } : {}),
            // When skipping email, mark as paid immediately since admin is registering a settled invoice
            ...(skipEmail ? { finalInvoicePaid: true, finalInvoicePaidAt: now } : {}),
            invoiceItems: [
                { description: 'Vask / Rengjøring', amountNOK: cleaningFeeNOK },
                ...extraItems,
                { description: 'Forhåndsbetaling trukket fra', amountNOK: -depositNOK }
            ]
        };
        if (finalInvoiceVippsOrderId) {
            updateFields.finalInvoiceVippsOrderId = finalInvoiceVippsOrderId;
        }

        // Also set legacy invoiceSentAt for backward compat with existing dashboard checks
        if (!booking.invoiceSentAt) {
            updateFields.invoiceSentAt = now;
        }

        const updated = await updateBookingFields(id.trim(), null, updateFields);

        return createJsonResponse(200, {
            message: skipEmail ? 'Sluttoppgjør registrert og markert som betalt.' : 'Sluttfaktura sendt.',
            sentTo: booking.requesterEmail || null,
            remainingAmount: remainingNOK,
            dueDate: dueDateStr,
            paymentMethod,
            ...(vippsUrl ? { vippsUrl } : {}),
            booking: updated || booking
        }, request);
    }
});
