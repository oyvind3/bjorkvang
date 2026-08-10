const { app } = require('@azure/functions');
const { createJsonResponse } = require('../../../shared/http');
const { getBooking, updateBookingFields } = require('../../../shared/cosmosDb');
const { sendEmail } = require('../../../shared/email');
const { sendSms, buildSmsMessage } = require('../../../shared/sms');
const { generateEmailHtml } = require('../../../shared/emailTemplate');
const vipps = require('../../../shared/vipps');

const escapeHtml = (str) => String(str || '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[m]);

/**
 * Send a deposit payment request to the booking requester.
 * POST /api/booking/send-deposit
 * Body: { id }
 *
 * - If booking.paymentMethod === 'vipps': creates a Vipps payment link and emails it.
 * - If 'bank': emails bank account details.
 * Idempotent: returns 200 if depositRequested is already true.
 */
app.http('sendDepositRequest', {
    methods: ['POST', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'booking/send-deposit',
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

        const booking = await getBooking(id.trim());
        if (!booking) {
            return createJsonResponse(404, { error: 'Booking not found.' }, request);
        }

        if (booking.status !== 'approved') {
            return createJsonResponse(409, {
                error: 'Booking must be approved before sending a deposit request.'
            }, request);
        }

        // Allow force resend via ?force=true or body.force
        const forceResend = body.force === true || request.query.get('force') === 'true';
        // skipEmail: just register the request internally without sending anything (for manual/admin bookings)
        const skipEmail = body.skipEmail === true;

        // If already sent and not forcing, return current state
        if (booking.depositRequested && !forceResend) {
            return createJsonResponse(200, {
                message: 'Forhåndsbetalingsforespørsel allerede sendt. Bruk force=true for å sende på nytt.',
                booking
            }, request);
        }

        // skipEmail path: mark depositRequested without sending anything
        if (skipEmail) {
            const totalNOK = booking.totalAmount || 0;
            const depositNOK = Math.round(totalNOK * 0.5);
            const now = new Date().toISOString();
            const updated = await updateBookingFields(id.trim(), null, {
                depositRequested: true,
                depositRequestedAt: now,
                depositAmount: depositNOK
            });
            context.info(`sendDepositRequest: registered (skipEmail) for booking ${id}`);
            return createJsonResponse(200, {
                message: 'Forhåndsbetalingsforespørsel registrert (ingen e-post sendt).',
                depositAmount: depositNOK,
                paymentMethod: booking.paymentMethod || 'bank',
                booking: updated || booking
            }, request);
        }

        const from = process.env.DEFAULT_FROM_ADDRESS;
        if (!from) {
            context.error('sendDepositRequest: DEFAULT_FROM_ADDRESS is not set');
            return createJsonResponse(500, { error: 'Manglende e-postkonfigurasjon.' }, request);
        }

        if (!booking.requesterEmail) {
            return createJsonResponse(400, { error: 'Booking mangler e-postadresse.' }, request);
        }

        const totalNOK = booking.totalAmount || 0;
        const depositNOK = Math.round(totalNOK * 0.5);
        const remainingNOK = totalNOK - depositNOK;
        const paymentMethod = booking.paymentMethod || 'bank';
        const bankAccount = process.env.BANK_ACCOUNT || '1810.40.02508';
        const websiteUrl = process.env.WEBSITE_URL || 'https://bjorkvang.org';
        const spaces = Array.isArray(booking.spaces) ? booking.spaces.join(', ') : (booking.spaces || '');
        const now = new Date().toISOString();

        const summaryTable = `
            <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:15px;">
                <tr style="border-bottom:1px solid #e5e7eb;">
                    <td style="padding:8px 0;color:#6b7280;">Arrangement</td>
                    <td style="padding:8px 0;text-align:right;">${escapeHtml(booking.eventType || '')}</td>
                </tr>
                <tr style="border-bottom:1px solid #e5e7eb;">
                    <td style="padding:8px 0;color:#6b7280;">Dato</td>
                    <td style="padding:8px 0;text-align:right;">${escapeHtml(booking.date || '')}</td>
                </tr>
                <tr style="border-bottom:1px solid #e5e7eb;">
                    <td style="padding:8px 0;color:#6b7280;">Lokaler</td>
                    <td style="padding:8px 0;text-align:right;">${escapeHtml(spaces)}</td>
                </tr>
                <tr style="border-bottom:1px solid #e5e7eb;">
                    <td style="padding:8px 0;color:#6b7280;">Estimert totalpris</td>
                    <td style="padding:8px 0;text-align:right;">kr ${totalNOK.toLocaleString('nb-NO')}</td>
                </tr>
                <tr>
                    <td style="padding:12px 0;font-weight:bold;font-size:17px;">Forhåndsbetaling å betale nå (50&nbsp;%)</td>
                    <td style="padding:12px 0;text-align:right;font-weight:bold;font-size:17px;">kr ${depositNOK.toLocaleString('nb-NO')}</td>
                </tr>
            </table>
            <p style="font-size:0.88rem;color:#6b7280;">
                Restbeløpet (kr ${remainingNOK.toLocaleString('nb-NO')}) faktureres etter arrangementet.
                Forhåndsbetaling er ikke refunderbart ved kansellering uten saklig grunn.
            </p>`;

        let depositVippsOrderId = null;
        let vippsUrl = null;
        let emailHtml, emailText, emailSubject;

        if (paymentMethod === 'vipps') {
            // Sanitise booking ID for Vipps reference (alphanumeric only, max 50 chars)
            const safeId = id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);
            const orderId = `dep-${safeId}-${Date.now().toString(36)}`.slice(0, 50);
            const returnUrl = `${websiteUrl}/booking?depositReturn=1&orderId=${encodeURIComponent(orderId)}`;

            try {
                const vippsResponse = await vipps.initiatePayment({
                    amount: depositNOK * 100, // øre
                    orderId,
                    returnUrl,
                    text: `Forhåndsbetaling – Bjørkvang (${booking.eventType || 'leie'})`,
                    phoneNumber: booking.phone || undefined
                });
                vippsUrl = vippsResponse.redirectUrl;
                depositVippsOrderId = orderId;
            } catch (err) {
                context.error('sendDepositRequest: Failed to create Vipps payment', err);
                return createJsonResponse(502, { error: 'Kunne ikke opprette Vipps-betaling.' }, request);
            }

            emailSubject = `Forhåndsbetalingsforespørsel – Bjørkvang leie (${booking.date || ''})`;
            emailText = [
                `Hei ${booking.requesterName},`,
                '',
                'Din bookingforespørsel er godkjent! For å sikre datoen ber vi deg betale 50 % Forhåndsbetaling via Vipps.',
                '',
                `Arrangement: ${booking.eventType || ''}`,
                `Dato: ${booking.date || ''}`,
                `Lokaler: ${spaces}`,
                `Estimert totalpris: kr ${totalNOK.toLocaleString('nb-NO')}`,
                `Forhåndsbetaling nå (50%): kr ${depositNOK.toLocaleString('nb-NO')}`,
                '',
                `Betal med Vipps: ${vippsUrl}`,
                '',
                `Restbeløpet (kr ${remainingNOK.toLocaleString('nb-NO')}) faktureres etter arrangementet.`,
                'Forhåndsbetaling er ikke refunderbart ved kansellering uten saklig grunn.',
                '',
                'Med vennlig hilsen,',
                'Styret ved Bjørkvang'
            ].join('\n');

            emailHtml = generateEmailHtml({
                title: 'Forhåndsbetalingsforespørsel – Bjørkvang',
                previewText: `Betal Forhåndsbetaling kr ${depositNOK.toLocaleString('nb-NO')} for din booking`,
                content: `
                    <p>Hei ${escapeHtml(booking.requesterName)},</p>
                    <p>🎉 Din bookingforespørsel er godkjent! For å sikre datoen ber vi deg betale
                    <strong>50&nbsp;% Forhåndsbetaling</strong> innen 5 dager.</p>
                    ${summaryTable}
                    <p>Har du spørsmål, ta kontakt med oss på
                    <a href="mailto:styret@bjorkvang.org">styret@bjorkvang.org</a>.</p>
                    <p>Med vennlig hilsen,<br>Styret ved Bjørkvang</p>`,
                action: { text: 'Betal kr ' + depositNOK.toLocaleString('nb-NO') + ' med Vipps', url: vippsUrl, color: '#ff5b24', rounded: true }
            });
        } else {
            // Bank transfer
            emailSubject = `Forhåndsbetalingsforespørsel – Bjørkvang leie (${booking.date || ''})`;
            emailText = [
                `Hei ${booking.requesterName},`,
                '',
                'Din bookingforespørsel er godkjent! For å sikre datoen ber vi deg betale 50 % Forhåndsbetaling via bankoverføring innen 5 dager.',
                '',
                `Arrangement: ${booking.eventType || ''}`,
                `Dato: ${booking.date || ''}`,
                `Lokaler: ${spaces}`,
                `Estimert totalpris: kr ${totalNOK.toLocaleString('nb-NO')}`,
                `Forhåndsbetaling nå (50%): kr ${depositNOK.toLocaleString('nb-NO')}`,
                '',
                `Kontonummer: ${bankAccount}`,
                `Merk betalingen med: ${id}`,
                'Betalingsfrist: 5 dager',
                '',
                `Restbeløpet (kr ${remainingNOK.toLocaleString('nb-NO')}) faktureres etter arrangementet.`,
                'Forhåndsbetaling er ikke refunderbart ved kansellering uten saklig grunn.',
                '',
                'Med vennlig hilsen,',
                'Styret ved Bjørkvang'
            ].join('\n');

            emailHtml = generateEmailHtml({
                title: 'Forhåndsbetalingsforespørsel – Bjørkvang',
                previewText: `Betal Forhåndsbetaling kr ${depositNOK.toLocaleString('nb-NO')} – kontonr. ${bankAccount}`,
                content: `
                    <p>Hei ${escapeHtml(booking.requesterName)},</p>
                    <p>🎉 Din bookingforespørsel er godkjent! For å sikre datoen ber vi deg betale
                    <strong>50&nbsp;% Forhåndsbetaling</strong> via bankoverføring innen 5 dager.</p>
                    ${summaryTable}
                    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin:16px 0;">
                        <p style="margin:0 0 8px;font-weight:bold;">Betalingsinformasjon</p>
                        <p style="margin:4px 0;">🏦 <strong>Kontonummer:</strong> ${escapeHtml(bankAccount)}</p>
                        <p style="margin:4px 0;">📋 <strong>Merk betalingen med:</strong> ${escapeHtml(id)}</p>
                        <p style="margin:4px 0;">📅 <strong>Betalingsfrist:</strong> 5 dager</p>
                    </div>
                    <p>Har du spørsmål, ta kontakt med oss på
                    <a href="mailto:styret@bjorkvang.org">styret@bjorkvang.org</a>.</p>
                    <p>Med vennlig hilsen,<br>Styret ved Bjørkvang</p>`
            });
        }

        try {
            await sendEmail({
                from,
                to: booking.requesterEmail,
                subject: emailSubject,
                html: emailHtml,
                text: emailText
            });
        } catch (err) {
            context.error('sendDepositRequest: Failed to send email', err);
            return createJsonResponse(500, { error: 'Kunne ikke sende e-post.' }, request);
        }

        // --- SMS med betalingslenke ---
        if (booking.phone) {
            let depositSmsBody;
            if (paymentMethod === 'vipps' && vippsUrl) {
                depositSmsBody = buildSmsMessage('customer.depositReadyVipps', {
                    requesterName: booking.requesterName,
                    date: booking.date,
                    amountNOK: depositNOK,
                });
            } else {
                depositSmsBody = buildSmsMessage('customer.depositReadyBank', {
                    requesterName: booking.requesterName,
                    date: booking.date,
                    amountNOK: depositNOK,
                    bankAccount,
                    bookingId: id,
                });
            }
            await sendSms({ to: booking.phone, body: depositSmsBody }, context);
        }

        const updateFields = {
            depositRequested: true,
            depositRequestedAt: now,
            depositAmount: depositNOK
        };
        if (depositVippsOrderId) {
            updateFields.depositVippsOrderId = depositVippsOrderId;
        }

        const updated = await updateBookingFields(id.trim(), null, updateFields);
        context.info(`sendDepositRequest: sent to ${booking.requesterEmail} for booking ${id} via ${paymentMethod}`);

        return createJsonResponse(200, {
            message: 'Forhåndsbetalingsforespørsel sendt.',
            sentTo: booking.requesterEmail,
            depositAmount: depositNOK,
            paymentMethod,
            ...(vippsUrl ? { vippsUrl } : {}),
            booking: updated || booking
        }, request);
    }
});
