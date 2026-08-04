const { app } = require('@azure/functions');
const { addContractSignature, getBooking, updateBookingFields } = require('../../../shared/cosmosDb');
const { createJsonResponse, requireAdminKey } = require('../../../shared/http');
const { sendEmail } = require('../../../shared/email');
const { sendSms, sendSmsToAdminGroup, buildSmsMessage, deriveSmsSigningToken } = require('../../../shared/sms');
const { generateEmailHtml } = require('../../../shared/emailTemplate');
const vipps = require('../../../shared/vipps');

app.http('signBooking', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            const body = await request.json();
            const { id, role, signatureData, signerName } = body;

            if (!id) {
                return createJsonResponse(400, { message: 'Missing booking ID' }, request);
            }

            // Validate signing authorization
            const signingRole = role || 'requester';
            if (signingRole === 'requester') {
                // Tenant must supply the signing token from their approval email
                const { signingToken } = body;
                const existingBooking = await getBooking(id, null);
                if (!existingBooking) {
                    return createJsonResponse(404, { message: 'Booking not found' }, request);
                }
                // Only enforce token if one is stored (backward-compat with old bookings)
                const expectedTokens = [
                    existingBooking.signingToken,
                    existingBooking.smsSigningToken,
                    deriveSmsSigningToken(existingBooking.signingToken),
                ].filter(Boolean);
                if (expectedTokens.length > 0) {
                    if (!signingToken || !expectedTokens.includes(signingToken)) {
                        return createJsonResponse(403, { message: 'Ugyldig signeringstoken. Be om ny signeringslenke fra Bjørkvang.' }, request);
                    }
                }
            } else if (signingRole === 'landlord') {
                // Accept the key from the header (admin.js API calls) or from the JSON body
                // (kontrakt.js tab opened via URL with ?adminKey=...)
                const headerKey = (request.headers.get('x-admin-key') || '').trim();
                const bodyKey = String(body.adminKey || '').trim();
                const expectedKey = (process.env.ADMIN_PASSWORD || '').trim();
                if (expectedKey && headerKey !== expectedKey && bodyKey !== expectedKey) {
                    return createJsonResponse(403, { message: 'Unauthorized' }, request);
                }
            }
            const signatureMetadata = {
                role: role || 'requester', // Default to requester for backward compatibility
                signatureData: signatureData, // { type: 'draw'|'text', data: '...' }
                signerName: signerName, // Printed name
                signedAt: new Date().toISOString(),
                userAgent: request.headers.get('user-agent') || 'Unknown',
                ipAddress: request.headers.get('x-forwarded-for') || 'Unknown'
            };

            // Add the signature
            const updatedBooking = await addContractSignature(id, null, signatureMetadata);

            if (!updatedBooking) {
                return createJsonResponse(404, { message: 'Booking not found' }, request);
            }

            // Check if both parties have now signed
            const contract = updatedBooking.contract || {};
            const bothSigned = contract.signedAt && contract.landlordSignedAt;

            context.info(`Signature added for booking ${id}, role: ${role}, both signed: ${bothSigned}`);

            // Notify board when tenant signs (only if landlord hasn't already signed first)
            if ((role || 'requester') === 'requester' && !bothSigned) {
                try {
                    const boardTo = process.env.BOARD_TO_ADDRESS || process.env.DEFAULT_TO_ADDRESS;
                    const fromAddr = process.env.DEFAULT_FROM_ADDRESS || 'Bjorkvang <styret@bjorkvang.org>';
                    const websiteUrl = (process.env.WEBSITE_URL || 'https://bjorkvang.org').replace(/\/$/, '');
                    const adminLink = `${websiteUrl}/admin?contract=${encodeURIComponent(id)}`;

                    const escapeHtml = (str) => String(str).replace(/[&<>"']/g, (m) => ({
                        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
                    })[m]);

                    const safeName = escapeHtml(updatedBooking.requesterName);
                    const notifyDateObj = new Date(`${updatedBooking.date}T00:00:00`);
                    const safeDate = escapeHtml(!isNaN(notifyDateObj)
                        ? notifyDateObj.toLocaleDateString('nb-NO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
                        : updatedBooking.date);
                    const safeEventType = escapeHtml(updatedBooking.eventType || 'Reservasjon');

                    const notifyHtml = generateEmailHtml({
                        title: 'Leieavtale signert av leietaker',
                        content: `
                            <p><strong>${safeName}</strong> har signert leieavtalen for sin booking.</p>
                            <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:15px;">
                                <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px 0;color:#6b7280;">Dato</td><td style="padding:8px 0;text-align:right;font-weight:600;">${safeDate}</td></tr>
                                <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px 0;color:#6b7280;">Formål</td><td style="padding:8px 0;text-align:right;">${safeEventType}</td></tr>
                                <tr><td style="padding:8px 0;color:#6b7280;">Lokale</td><td style="padding:8px 0;text-align:right;">${escapeHtml(Array.isArray(updatedBooking.spaces) ? updatedBooking.spaces.join(', ') : (updatedBooking.spaces || ''))}</td></tr>
                            </table>
                            <p style="margin-top:24px;"><strong>Neste steg:</strong></p>
                            <p style="color:#374151;">Gå til leieavtalen og signer som utleier. Forhåndsbetalingsforespørsel sendes automatisk til leietaker når begge har signert.</p>
                            <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:20px;">
                                <a href="${escapeHtml(adminLink)}" style="display:inline-block;padding:12px 24px;background:#1a6fa3;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;">&#128394; Logg inn og signer som utleier</a>
                            </div>
                        `,
                        previewText: `${updatedBooking.requesterName} har signert leieavtalen for ${updatedBooking.date}`
                    });

                    if (boardTo) {
                        await sendEmail({
                            to: boardTo,
                            from: fromAddr,
                            subject: `Leieavtale signert: ${updatedBooking.requesterName} – ${updatedBooking.date}`,
                            html: notifyHtml,
                            text: `${updatedBooking.requesterName} har signert leieavtalen for booking ${updatedBooking.date} (${updatedBooking.eventType || 'Reservasjon'}).\n\nLogg inn og signer som utleier: ${adminLink}\n\nForhåndsbetalingsforespørsel sendes automatisk når begge har signert.`
                        });
                        context.info(`Board notification sent for tenant signature on ${id}`);
                    } else {
                        context.warn('No BOARD_TO_ADDRESS configured, skipping tenant signature notification');
                    }
                    // SMS to admin group
                    const adminSmsBody = buildSmsMessage('admin.tenantSigned', {
                        requesterName: updatedBooking.requesterName,
                        date: updatedBooking.date,
                        adminLink,
                    });
                    await sendSmsToAdminGroup(adminSmsBody, context);
                } catch (notifyError) {
                    context.error(`Failed to send board notification for tenant signature: ${notifyError.message}`);
                }
            }

            // If both have signed, auto-initiate deposit and notify
            if (bothSigned) {
                context.info(`Both signatures complete for ${id}, initiating deposit`);

                const websiteUrl = (process.env.WEBSITE_URL || 'https://bjorkvang.org').replace(/\/$/, '');
                const contractLink = `${websiteUrl}/leieavtale.html?id=${encodeURIComponent(id)}`;
                const fromAddr = process.env.DEFAULT_FROM_ADDRESS || 'Bjorkvang <styret@bjorkvang.org>';
                const bankAccount = process.env.BANK_ACCOUNT || '1822.40.12345';

                const escHtml = (str) => String(str).replace(/[&<>"']/g, (m) => ({
                    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
                })[m]);

                const safeName = escHtml(updatedBooking.requesterName);
                const safeEventType = escHtml(updatedBooking.eventType || 'Reservasjon');
                const safeSpaces = escHtml(Array.isArray(updatedBooking.spaces) ? updatedBooking.spaces.join(', ') : (updatedBooking.spaces || ''));

                // Format date nicely in Norwegian
                const dateObj = new Date(`${updatedBooking.date}T00:00:00`);
                const formattedDate = !isNaN(dateObj)
                    ? dateObj.toLocaleDateString('nb-NO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
                    : updatedBooking.date;
                const safeDate = escHtml(formattedDate);

                const totalNOK = updatedBooking.totalAmount || 0;
                const depositNOK = Math.round(totalNOK * 0.5);
                const remainingNOK = totalNOK - depositNOK;
                const depositStr = `kr ${depositNOK.toLocaleString('nb-NO')}`;
                const remainingStr = `kr ${remainingNOK.toLocaleString('nb-NO')}`;
                const paymentMethod = updatedBooking.paymentMethod || 'bank';

                context.info(`signBooking: both-signed deposit flow – paymentMethod=${paymentMethod}, totalNOK=${totalNOK}, depositNOK=${depositNOK}`);

                // --- Auto-initiate deposit payment ---
                let depositPaymentSection = '';
                let depositPaymentText = '';
                let depositVippsOrderId = null;

                if (paymentMethod === 'vipps' && depositNOK > 0) {
                    try {
                        const safeRef = id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);
                        const orderId = `dep-${safeRef}-${Date.now().toString(36)}`.slice(0, 50);
                        const returnUrl = `${websiteUrl}/booking?depositReturn=1&orderId=${encodeURIComponent(orderId)}`;

                        const vippsResp = await vipps.initiatePayment({
                            amount: depositNOK * 100,
                            orderId,
                            returnUrl,
                            text: `Forhåndsbetaling – Bjørkvang (${updatedBooking.eventType || 'leie'})`,
                            phoneNumber: updatedBooking.phone || undefined
                        });

                        depositVippsOrderId = orderId;

                        await updateBookingFields(id, null, {
                            depositRequested: true,
                            depositRequestedAt: new Date().toISOString(),
                            depositAmount: depositNOK,
                            depositVippsOrderId: orderId
                        });

                        depositPaymentSection = `
                            <h3 style="margin:24px 0 8px;font-size:1rem;">Neste steg: Betal forhåndsbetaling</h3>
                            <p>Forhåndsbetalingen må betales innen 5 dager for at bookingen skal være aktiv.</p>
                            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin:16px 0;">
                                <p style="margin:0 0 8px;font-weight:700;color:#166534;">Betal ${depositStr} med Vipps</p>
                                <p style="margin:0 0 10px;color:#4b5563;font-size:0.9rem;">Restbeløp (${remainingStr}) faktureres etter arrangementet.</p>
                                <a href="${vippsResp.redirectUrl}" style="display:inline-block;padding:12px 28px;background:#ff5b24;color:#fff;font-weight:700;border-radius:999px;text-decoration:none;font-size:1rem;">
                                    Betal ${depositStr} med Vipps
                                </a>
                            </div>`;
                        depositPaymentText = `\n\nNeste steg – Betal forhåndsbetaling (${depositStr}) med Vipps:\n${vippsResp.redirectUrl}`;

                        context.info(`signBooking: Vipps deposit initiated, orderId=${orderId}`);
                    } catch (vippsErr) {
                        context.error(`signBooking: Failed to initiate Vipps deposit: ${vippsErr.message}`, { stack: vippsErr.stack });
                        // Fallback: link to complete-payment page
                        const paymentLink = `${websiteUrl}/complete-payment.html?bookingId=${encodeURIComponent(id)}`;
                        depositPaymentSection = `
                            <h3 style="margin:24px 0 8px;font-size:1rem;">Neste steg: Betal forhåndsbetaling</h3>
                            <p>Vi kunne ikke opprette Vipps-betaling automatisk. Klikk lenken under for å betale forhåndsbetalingen.</p>
                            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin:16px 0;">
                                <p style="margin:0 0 8px;font-weight:700;color:#166534;">Forhåndsbetaling: ${depositStr}</p>
                                <p style="margin:0 0 10px;color:#4b5563;font-size:0.9rem;">Restbeløp (${remainingStr}) faktureres etter arrangementet.</p>
                                <div style="text-align:center;margin:10px 0;">
                                    <a href="${paymentLink}" style="display:inline-block;padding:14px 36px;background:#ff5b24;color:#fff;text-decoration:none;border-radius:999px;font-weight:bold;font-size:1.05rem;">
                                        Betal ${depositStr} med Vipps
                                    </a>
                                </div>
                            </div>`;
                        depositPaymentText = `\n\nBetal forhåndsbetaling (${depositStr}): ${paymentLink}`;
                    }
                } else if (paymentMethod === 'bank' && depositNOK > 0) {
                    // Bank transfer
                    await updateBookingFields(id, null, {
                        depositRequested: true,
                        depositRequestedAt: new Date().toISOString(),
                        depositAmount: depositNOK
                    });

                    depositPaymentSection = `
                        <h3 style="margin:24px 0 8px;font-size:1rem;">Neste steg: Betal forhåndsbetaling via bank</h3>
                        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin:16px 0;">
                            <p style="margin:0 0 8px;font-weight:700;color:#166534;">Betal ${depositStr} via bankoverføring</p>
                            <p style="margin:4px 0;">🏦 <strong>Kontonummer:</strong> ${escHtml(bankAccount)}</p>
                            <p style="margin:4px 0;">📋 <strong>Merk betalingen med:</strong> <code style="background:#e6f4ea;padding:2px 6px;border-radius:4px;">${escHtml(id)}</code></p>
                            <p style="margin:4px 0;">📅 <strong>Betalingsfrist:</strong> 5 dager</p>
                            <p style="margin:10px 0 0;font-size:0.85rem;color:#4b5563;">Restbeløp (${remainingStr}) faktureres etter arrangementet.</p>
                        </div>`;
                    depositPaymentText = `\n\nBetal forhåndsbetaling ${depositStr} til kontonummer ${bankAccount}. Merk betalingen med: ${id}. Frist: 5 dager.`;

                    context.info(`signBooking: Bank deposit request sent for ${id}`);
                }

                try {
                    // Send to tenant: contract download + deposit payment
                    const tenantHtml = generateEmailHtml({
                        title: 'Leieavtalen er ferdig signert',
                        content: `
                            <p>Hei ${safeName},</p>
                            <p>Leieavtalen for din booking er n&aring; signert av begge parter. &#127881;</p>
                            <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:15px;">
                                <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px 0;color:#6b7280;">Dato</td><td style="padding:8px 0;text-align:right;font-weight:600;">${safeDate}</td></tr>
                                <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px 0;color:#6b7280;">Form&aring;l</td><td style="padding:8px 0;text-align:right;">${safeEventType}</td></tr>
                                <tr><td style="padding:8px 0;color:#6b7280;">Lokale</td><td style="padding:8px 0;text-align:right;">${safeSpaces}</td></tr>
                            </table>
                            <p>Du kan se og laste ned den ferdig signerte avtalen:</p>
                            <div style="text-align:center;margin:20px 0;">
                                <a href="${escHtml(contractLink)}" style="display:inline-block;padding:14px 36px;background:#1a6fa3;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;font-size:1.05rem;">&#128196; Se og last ned leieavtalen</a>
                            </div>
                            ${depositPaymentSection}
                            <p style="font-size:0.9rem;color:#6b7280;margin-top:24px;">Sp&oslash;rsm&aring;l? Ta kontakt p&aring; <a href="mailto:styret@bjorkvang.org" style="color:#1a6fa3;">styret@bjorkvang.org</a>.</p>
                        `,
                        action: { text: 'Se og last ned leieavtalen', url: contractLink },
                        previewText: `Leieavtalen for ${updatedBooking.date} er ferdig signert – last ned her`
                    });

                    await sendEmail({
                        to: updatedBooking.requesterEmail,
                        from: fromAddr,
                        subject: `Leieavtale ferdig signert – ${updatedBooking.date}`,
                        html: tenantHtml,
                        text: `Hei ${updatedBooking.requesterName},\n\nLeieavtalen for din booking ${updatedBooking.date} (${updatedBooking.eventType || 'Reservasjon'}) er nå signert av begge parter.\n\nSe og last ned avtalen: ${contractLink}${depositPaymentText}`
                    });

                    context.info(`Final agreement + deposit email sent to ${updatedBooking.requesterEmail}`);

                    // --- SMS til leietaker: forhåndsbetaling klar for betaling ---
                    if (updatedBooking.phone) {
                        let depositSmsTxt;
                        if (paymentMethod === 'vipps' && depositNOK > 0) {
                            depositSmsTxt = buildSmsMessage('customer.depositReadyVipps', {
                                requesterName: updatedBooking.requesterName,
                                date: updatedBooking.date,
                                amountNOK: depositNOK,
                            });
                        } else if (paymentMethod === 'bank' && depositNOK > 0) {
                            depositSmsTxt = buildSmsMessage('customer.depositReadyBank', {
                                requesterName: updatedBooking.requesterName,
                                date: updatedBooking.date,
                                amountNOK: depositNOK,
                                bankAccount,
                                bookingId: id,
                            });
                        }
                        if (depositSmsTxt) {
                            await sendSms({ to: updatedBooking.phone, body: depositSmsTxt }, context);
                        }
                    }

                    // Also notify board
                    const boardTo = process.env.BOARD_TO_ADDRESS || process.env.DEFAULT_TO_ADDRESS;
                    if (boardTo) {
                        const adminLink = `${websiteUrl}/admin#${encodeURIComponent(id)}`;
                        const depositStatus = depositNOK > 0
                            ? `<p>Forhåndsbetalingsforespørsel (${depositStr}, ${paymentMethod === 'vipps' ? 'Vipps' : 'bank'}) er sendt til leietaker.</p>`
                            : '<p style="color:#166534;"><strong>&check; Ingen forhåndsbetaling kreves.</strong></p>';

                        const boardHtml = generateEmailHtml({
                            title: 'Leieavtale ferdig signert av begge parter',
                            content: `
                                <p>Leieavtalen for <strong>${safeName}</strong> (${safeDate}, ${safeEventType}) er n&aring; signert av begge parter.</p>
                                ${depositStatus}
                                <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:20px;">
                                    <a href="${escHtml(contractLink)}" style="display:inline-block;padding:12px 24px;background:#1a6fa3;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">&#128196; Se leieavtalen</a>
                                    <a href="${escHtml(adminLink)}" style="display:inline-block;padding:12px 24px;background:#6b7280;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">&Aring;pne i admin</a>
                                </div>
                            `,
                            previewText: `Leieavtalen for ${updatedBooking.date} er ferdig signert`
                        });

                        await sendEmail({
                            to: boardTo,
                            from: fromAddr,
                            subject: `Leieavtale ferdig signert: ${updatedBooking.requesterName} – ${updatedBooking.date}`,
                            html: boardHtml,
                                text: `${updatedBooking.requesterName} (${updatedBooking.date}) er signert av begge parter.\nForhåndsbetalingsforespørsel sendt (${paymentMethod}).\n\nSe avtalen: ${contractLink}\nAdmin: ${adminLink}`
                        });
                    }
                } catch (emailError) {
                    context.error(`Failed to send final agreement email: ${emailError.message}`);
                }
            }

            // Return the signature details
            return createJsonResponse(200, {
                message: 'Contract signed successfully',
                signedAt: signatureMetadata.signedAt,
                bothSigned: bothSigned,
                paymentRequired: bothSigned && updatedBooking.paymentStatus !== 'paid'
            }, request);

        } catch (error) {
            context.error(`Error signing booking:`, error);
            return createJsonResponse(500, { message: 'Internal server error' }, request);
        }
    }
});
