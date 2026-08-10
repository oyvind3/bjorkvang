const { app } = require('@azure/functions');
const { createJsonResponse } = require('../../../shared/http');
const { getBooking, updateBookingFields } = require('../../../shared/cosmosDb');
const { sendEmail } = require('../../../shared/email');
const { generateEmailHtml } = require('../../../shared/emailTemplate');

/**
 * Send a final invoice (sluttfaktura) to the booking requester.
 * POST /api/booking/invoice
 * Body: { id }
 */
app.http('sendInvoice', {
    methods: ['POST', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'booking/invoice',
    handler: async (request, context) => {
        if (request.method === 'OPTIONS') {
            return createJsonResponse(204, {}, request);
        }

        let body = {};
        try {
            body = await request.json();
        } catch {
            // Also accept id from query string
        }

        const id = body.id || request.query.get('id');

        if (!id || typeof id !== 'string' || id.trim().length === 0) {
            context.warn('sendInvoice called with missing or invalid ID');
            return createJsonResponse(400, { error: 'Missing booking id.' }, request);
        }

        const booking = await getBooking(id.trim());
        if (!booking) {
            context.warn(`sendInvoice: Booking not found for ID: ${id}`);
            return createJsonResponse(404, { error: 'Booking not found.' }, request);
        }

        const bankAccount = process.env.BANK_ACCOUNT || '1810.40.02508';
        const vippsNumber = process.env.VIPPS_NUMBER || '104631';
        const from = process.env.DEFAULT_FROM_ADDRESS;

        if (!from) {
            context.error('sendInvoice: DEFAULT_FROM_ADDRESS is not set');
            return createJsonResponse(500, { error: 'Manglende e-postkonfigurasjon.' }, request);
        }

        if (!booking.requesterEmail) {
            context.error(`sendInvoice: No requester email on booking ${id}`);
            return createJsonResponse(400, { error: 'Booking mangler e-postadresse.' }, request);
        }

        // Calculate amounts
        const depositNok = booking.depositAmount || 0;
        const totalNok = booking.totalAmount || depositNok * 2;
        const remainingNok = totalNok - depositNok;

        // Due date: 14 days from today
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 14);
        const dueDateStr = dueDate.toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' });

        const eventDate = booking.eventDate || booking.startDate || '';
        const spaces = Array.isArray(booking.spaces) ? booking.spaces.join(', ') : (booking.spaces || '');
        const eventType = booking.eventType || '';

        const escapeHtml = (str) => String(str || '').replace(/[&<>"']/g, (m) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[m]);

        const emailContent = `
            <p>Hei ${escapeHtml(booking.requesterName)},</p>
            <p>Takk for at du leide Bjørkvang! Vi håper arrangementet gikk bra.</p>
            <p>Her er sluttfakturaen for leieforholdet:</p>

            <table style="width:100%; border-collapse:collapse; margin:16px 0; font-size:15px;">
                <tr style="border-bottom:1px solid #e5e7eb;">
                    <td style="padding:8px 0; color:#6b7280;">Arrangement</td>
                    <td style="padding:8px 0; text-align:right;">${escapeHtml(eventType)}</td>
                </tr>
                <tr style="border-bottom:1px solid #e5e7eb;">
                    <td style="padding:8px 0; color:#6b7280;">Lokaler</td>
                    <td style="padding:8px 0; text-align:right;">${escapeHtml(spaces)}</td>
                </tr>
                <tr style="border-bottom:1px solid #e5e7eb;">
                    <td style="padding:8px 0; color:#6b7280;">Dato</td>
                    <td style="padding:8px 0; text-align:right;">${escapeHtml(eventDate)}</td>
                </tr>
                <tr style="border-bottom:1px solid #e5e7eb;">
                    <td style="padding:8px 0; color:#6b7280;">Totalbeløp</td>
                    <td style="padding:8px 0; text-align:right;">kr ${totalNok.toLocaleString('nb-NO')}</td>
                </tr>
                <tr style="border-bottom:1px solid #e5e7eb;">
                    <td style="padding:8px 0; color:#6b7280;">Allerede betalt (Forhåndsbetaling)</td>
                    <td style="padding:8px 0; text-align:right; color:#1a823b;">− kr ${depositNok.toLocaleString('nb-NO')}</td>
                </tr>
                <tr>
                    <td style="padding:12px 0; font-weight:bold; font-size:17px;">Restbeløp å betale</td>
                    <td style="padding:12px 0; text-align:right; font-weight:bold; font-size:17px;">kr ${remainingNok.toLocaleString('nb-NO')}</td>
                </tr>
            </table>

            <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:16px 20px; margin:16px 0;">
                <p style="margin:0 0 8px; font-weight:bold;">Betalingsinformasjon</p>
                <p style="margin:4px 0;">🏦 <strong>Kontonummer:</strong> ${escapeHtml(bankAccount)}</p>
                <p style="margin:4px 0;">📱 <strong>Vipps:</strong> ${escapeHtml(vippsNumber)}</p>
                <p style="margin:4px 0;">📅 <strong>Betalingsfrist:</strong> ${escapeHtml(dueDateStr)}</p>
                <p style="margin:8px 0 0; font-size:13px; color:#6b7280;">Merk betalingen med bestillingsnummer: <strong>${escapeHtml(id)}</strong></p>
            </div>

            <p>Har du spørsmål, ta kontakt med oss på styret@bjorkvang.org.</p>
            <p>Med vennlig hilsen,<br>Styret ved Bjørkvang</p>
        `;

        const html = generateEmailHtml({
            title: 'Sluttfaktura – Bjørkvang',
            previewText: `Restbeløp kr ${remainingNok.toLocaleString('nb-NO')} – betalingsfrist ${dueDateStr}`,
            content: emailContent
        });

        const textContent = `Sluttfaktura – Bjørkvang

Hei ${booking.requesterName || ''},

Arrangement: ${eventType}
Lokaler: ${spaces}
Dato: ${eventDate}

Totalbeløp: kr ${totalNok.toLocaleString('nb-NO')}
Allerede betalt (Forhåndsbetaling): kr ${depositNok.toLocaleString('nb-NO')}
Restbeløp å betale: kr ${remainingNok.toLocaleString('nb-NO')}

Betalingsinformasjon:
Kontonummer: ${bankAccount}
Vipps: ${vippsNumber}
Betalingsfrist: ${dueDateStr}
Merk betalingen med: ${id}

Med vennlig hilsen,
Styret ved Bjørkvang`;

        try {
            await sendEmail({
                from,
                to: booking.requesterEmail,
                subject: `Sluttfaktura – Bjørkvang (${eventDate})`,
                html,
                text: textContent
            });
            context.info(`sendInvoice: Invoice sent to ${booking.requesterEmail} for booking ${id}`);
        } catch (emailError) {
            context.error(`sendInvoice: Failed to send email for booking ${id}`, emailError);
            return createJsonResponse(500, { error: 'Kunne ikke sende faktura-e-post.' }, request);
        }

        // Mark invoice as sent
        const updated = await updateBookingFields(id.trim(), null, {
            invoiceSentAt: new Date().toISOString(),
            remainingAmount: remainingNok
        });

        if (!updated) {
            context.warn(`sendInvoice: Email sent but failed to update invoiceSentAt on booking ${id}`);
        }

        return createJsonResponse(200, {
            message: 'Sluttfaktura sendt.',
            sentTo: booking.requesterEmail,
            remainingAmount: remainingNok,
            dueDate: dueDateStr,
            booking: updated || booking
        }, request);
    }
});
