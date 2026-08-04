const { app } = require('@azure/functions');
const { sendEmail } = require('../../../shared/email');
const { sendSms, buildSmsMessage, deriveSmsSigningToken } = require('../../../shared/sms');
const { createJsonResponse, parseBody } = require('../../../shared/http');
const { getBooking } = require('../../../shared/cosmosDb');
const { generateEmailHtml } = require('../../../shared/emailTemplate');

app.http('sendReminder', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'booking/remind',
    handler: async (request, context) => {
        try {
            const body = await parseBody(request);
            const { id, comment } = body;
            const requestedChannel = String(body?.channel || 'both').toLowerCase();
            const channel = ['email', 'sms', 'both'].includes(requestedChannel) ? requestedChannel : 'both';

            if (!id) {
                return createJsonResponse(400, { error: 'Missing booking id.' });
            }

            const booking = await getBooking(id);
            if (!booking) {
                return createJsonResponse(404, { error: 'Booking not found.' });
            }

            const contract = booking.contract || {};
            const isRequesterSigned = !!contract.signedAt;
            const depositRequested = !!booking.depositRequested;
            const depositPaid = !!booking.depositPaid;
            const finalInvoiceSent = !!(booking.finalInvoiceSentAt || booking.invoiceSentAt);
            const finalInvoicePaid = !!booking.finalInvoicePaid;
            const bookingDatePast = booking.date && new Date(booking.date + 'T23:59:59') < new Date();

            // Determine what we are reminding about
            let reminderType;
            if (!isRequesterSigned && !bookingDatePast) {
                reminderType = 'signing';
            } else if (depositRequested && !depositPaid) {
                reminderType = 'deposit';
            } else if (finalInvoiceSent && !finalInvoicePaid) {
                reminderType = 'finalInvoice';
            } else {
                return createJsonResponse(400, { error: 'Ingen aktiv påminnelse å sende for denne bookingen.' });
            }

            const websiteUrl = process.env.WEBSITE_URL || 'https://bjorkvang.org';
            const reminderToken = booking.smsSigningToken || deriveSmsSigningToken(booking.signingToken);
            const contractLink = `${websiteUrl}/leieavtale.html?id=${encodeURIComponent(booking.id)}${reminderToken ? `&signingToken=${encodeURIComponent(reminderToken)}` : ''}`;
            const bankAccount = process.env.BANK_ACCOUNT || '1822.40.12345';

            const escapeHtml = (str) => String(str).replace(/[&<>"']/g, (m) => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
            })[m]);

            const safeName = escapeHtml(booking.requesterName || 'Kunde');
            const safeComment = comment ? escapeHtml(comment) : null;

            const dateObj = new Date(`${booking.date}T00:00:00`);
            const formattedDate = !isNaN(dateObj)
                ? dateObj.toLocaleDateString('nb-NO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
                : (booking.date || '');
            const safeDate = escapeHtml(formattedDate);

            const depositNOK = booking.depositAmount || Math.round((booking.totalAmount || 0) * 0.5);
            const remainingNOK = booking.finalInvoiceAmountNOK || ((booking.totalAmount || 0) - depositNOK);

            const commentBlock = safeComment
                ? `<div style="background:#f0f7ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 18px;margin:16px 0;">
                       <strong>Melding fra styret:</strong><br>${safeComment}
                   </div>`
                : '';

            let subject, htmlContent, actionButton, smsBody, previewText;

            if (reminderType === 'signing') {
                subject = `Påminnelse: Signer leieavtalen – ${formattedDate}`;
                previewText = `Du har en usignert leieavtale for ${formattedDate}.`;
                actionButton = { text: '📄 Signer leieavtalen', url: contractLink };
                htmlContent = `
                    <p>Hei ${safeName},</p>
                    <p>Vi vil minne deg på at leieavtalen for din booking på Bjørkvang forsamlingslokale (<strong>${safeDate}</strong>) ennå ikke er signert.</p>
                    ${commentBlock}
                    <p>Vennligst signer avtalen for å bekrefte reservasjonen din. Forhåndsbetalingsforespørsel sendes automatisk når begge parter har signert.</p>
                    <div style="background:#f0f7ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px 20px;margin:12px 0 16px;">
                        <a href="${contractLink}" style="display:inline-block;background:#1a56db;color:#fff;font-weight:700;padding:12px 24px;border-radius:6px;text-decoration:none;font-size:1rem;">📄 Signer leieavtalen</a>
                    </div>
                    <p style="font-size:0.9em;color:#6b7280;">Spørsmål? Ta kontakt på <a href="mailto:styret@bjorkvang.org" style="color:#1a823b;">styret@bjorkvang.org</a>.</p>
                `;
                smsBody = buildSmsMessage('customer.reminderSigning', {
                    requesterName: booking.requesterName,
                    date: booking.date,
                    contractLink,
                });

            } else if (reminderType === 'deposit') {
                subject = `Påminnelse: Forhåndsbetaling forfaller – ${formattedDate}`;
                previewText = `Vi venter fortsatt på forhåndsbetalingen for ${formattedDate}.`;
                actionButton = { text: '📄 Se leieavtalen', url: contractLink };
                const depositStr = depositNOK ? `kr\u00a0${depositNOK.toLocaleString('nb-NO')}` : '(oppgitt beløp)';
                const paymentInfoHtml = booking.paymentMethod === 'vipps'
                    ? `<p>Sjekk e-posten du tidligere mottok med betalingslenke for Vipps, eller ta kontakt med styret.</p>`
                    : `<p>Betal til kontonummer <strong>${escapeHtml(bankAccount)}</strong> og merk betalingen med <strong>${escapeHtml(id.slice(0, 8))}</strong>.</p>`;
                htmlContent = `
                    <p>Hei ${safeName},</p>
                    <p>Vi venter fortsatt på forhåndsbetalingen (<strong>${depositStr}</strong>) for din booking på Bjørkvang forsamlingslokale den <strong>${safeDate}</strong>.</p>
                    ${commentBlock}
                    ${paymentInfoHtml}
                    <p style="font-size:0.9em;color:#6b7280;">Spørsmål? Ta kontakt på <a href="mailto:styret@bjorkvang.org" style="color:#1a823b;">styret@bjorkvang.org</a>.</p>
                `;
                smsBody = booking.paymentMethod === 'vipps'
                    ? buildSmsMessage('customer.reminderDepositVipps', {
                        requesterName: booking.requesterName,
                        date: booking.date,
                        amountNOK: depositNOK,
                    })
                    : buildSmsMessage('customer.reminderDepositBank', {
                        requesterName: booking.requesterName,
                        date: booking.date,
                        amountNOK: depositNOK,
                        bankAccount,
                        bookingId: id,
                    });

            } else { // finalInvoice
                subject = `Påminnelse: Sluttfaktura for ${formattedDate}`;
                previewText = `Vi venter fortsatt på betaling av sluttfakturaen for ${formattedDate}.`;
                actionButton = { text: '📄 Se leieavtalen', url: contractLink };
                const remainingStr = remainingNOK ? `kr\u00a0${remainingNOK.toLocaleString('nb-NO')}` : '(oppgitt beløp)';
                const paymentInfoHtml = booking.paymentMethod === 'vipps'
                    ? `<p>Sjekk e-posten du tidligere mottok med betalingslenke for Vipps, eller ta kontakt med styret.</p>`
                    : `<p>Betal til kontonummer <strong>${escapeHtml(bankAccount)}</strong> og merk betalingen med <strong>${escapeHtml(id.slice(0, 8))}</strong>.</p>`;
                htmlContent = `
                    <p>Hei ${safeName},</p>
                    <p>Vi venter fortsatt på betaling av sluttfakturaen (<strong>${remainingStr}</strong>) for din booking på Bjørkvang forsamlingslokale den <strong>${safeDate}</strong>.</p>
                    ${commentBlock}
                    ${paymentInfoHtml}
                    <p style="font-size:0.9em;color:#6b7280;">Spørsmål? Ta kontakt på <a href="mailto:styret@bjorkvang.org" style="color:#1a823b;">styret@bjorkvang.org</a>.</p>
                `;
                smsBody = booking.paymentMethod === 'vipps'
                    ? buildSmsMessage('customer.reminderFinalVipps', {
                        requesterName: booking.requesterName,
                        date: booking.date,
                        amountNOK: remainingNOK,
                    })
                    : buildSmsMessage('customer.reminderFinalBank', {
                        requesterName: booking.requesterName,
                        date: booking.date,
                        amountNOK: remainingNOK,
                        bankAccount,
                        bookingId: id,
                    });
            }

            const wantsEmail = channel !== 'sms';
            const wantsSms = channel !== 'email';
            const canEmail = Boolean(booking.requesterEmail && String(booking.requesterEmail).trim());
            const canSms = Boolean(booking.phone && String(booking.phone).trim());

            if (channel === 'sms' && !canSms) {
                return createJsonResponse(400, { error: 'Booking mangler telefonnummer for SMS-påminnelse.' });
            }

            if (channel === 'email' && !canEmail) {
                return createJsonResponse(400, { error: 'Booking mangler e-postadresse for e-postpåminnelse.' });
            }

            if (!canEmail && !canSms) {
                return createJsonResponse(400, { error: 'Booking mangler e-post og telefonnummer for påminnelse.' });
            }

            let emailSent = false;
            let smsSent = false;
            let emailError = null;
            let smsError = null;

            if (wantsEmail && canEmail) {
                try {
                    const html = generateEmailHtml({
                        title: subject,
                        content: htmlContent,
                        action: actionButton,
                        previewText
                    });

                    await sendEmail({
                        to: booking.requesterEmail,
                        from: process.env.DEFAULT_FROM_ADDRESS,
                        subject,
                        html,
                        text: smsBody,
                    });
                    emailSent = true;
                } catch (err) {
                    emailError = err.message;
                    context.error('sendReminder: Failed to send reminder email', {
                        bookingId: id,
                        reminderType,
                        error: err.message
                    });
                }
            }

            if (wantsSms && canSms) {
                try {
                    const smsResult = await sendSms({ to: booking.phone, body: smsBody }, context);
                    smsSent = Boolean(smsResult);
                    if (!smsSent) {
                        smsError = 'SMS kunne ikke sendes.';
                    }
                } catch (err) {
                    smsError = err.message;
                    context.error('sendReminder: Failed to send reminder SMS', {
                        bookingId: id,
                        reminderType,
                        error: err.message
                    });
                }
            }

            if (!emailSent && wantsEmail && !smsSent) {
                return createJsonResponse(502, {
                    error: 'Påminnelsen kunne ikke sendes.',
                    ...(emailError ? { emailError } : {}),
                    ...(smsError ? { smsError } : {})
                });
            }

            context.info(`sendReminder: type=${reminderType}, channel=${channel}, booking=${id}, emailSent=${emailSent}, smsSent=${smsSent}`);
            return createJsonResponse(200, {
                message: 'Reminder sent',
                type: reminderType,
                channel,
                emailSent,
                smsSent,
                ...(emailError ? { emailError } : {}),
                ...(smsError ? { smsError } : {})
            });

        } catch (error) {
            context.error('Error sending reminder:', error);
            return createJsonResponse(500, { error: error.message });
        }
    }
});
