const { app } = require('@azure/functions');
const { listBookings } = require('../../../shared/cosmosDb');
const { updateBookingFields } = require('../../../shared/cosmosDb');
const { sendEmail } = require('../../../shared/email');
const { sendSms, buildSmsMessage } = require('../../../shared/sms');
const { generateEmailHtml } = require('../../../shared/emailTemplate');

/**
 * Timer-triggered function that runs once daily at 08:00 UTC.
 * Sends reminder emails when:
 * 1) A tenant hasn't signed their lease within 24h of admin approval.
 * 2) The landlord (board) hasn't counter-signed within 24h of tenant signing.
 *
 * Schedule: daily at 08:00 (0 0 8 * * *)
 */
app.timer('signingReminder', {
    schedule: '0 0 8 * * *',
    handler: async (timer, context) => {
        context.info('signingReminder: Running signing reminder check');

        const now = new Date();

        // Query bookings for the next 6 months
        const startDate = now.toISOString().split('T')[0];
        const endDate = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        let bookings;
        try {
            bookings = await listBookings({ startDate, endDate });
        } catch (err) {
            context.error('signingReminder: Failed to list bookings', { error: err.message });
            return;
        }

        // 1) Tenant hasn't signed within 24h of approval
        const tenantNeedsReminder = bookings.filter(b => {
            if (b.status !== 'approved') return false;
            if (!b.approvedAt) return false;
            if (b.contract && b.contract.signedAt) return false;
            if (b.signingReminderSentAt) return false;

            const approvedAt = new Date(b.approvedAt);
            const hoursSinceApproval = (now - approvedAt) / (1000 * 60 * 60);
            return hoursSinceApproval >= 24;
        });

        // 2) Landlord hasn't counter-signed within 24h of tenant signing
        const landlordNeedsReminder = bookings.filter(b => {
            if (b.status !== 'approved') return false;
            if (!b.contract || !b.contract.signedAt) return false; // tenant must have signed
            if (b.contract.landlordSignedAt) return false; // landlord already signed
            if (b.landlordSigningReminderSentAt) return false; // already reminded

            const tenantSignedAt = new Date(b.contract.signedAt);
            const hoursSinceTenantSigned = (now - tenantSignedAt) / (1000 * 60 * 60);
            return hoursSinceTenantSigned >= 24;
        });

        if (tenantNeedsReminder.length === 0 && landlordNeedsReminder.length === 0) {
            context.info('signingReminder: No bookings need a signing reminder');
            return;
        }

        context.info(`signingReminder: ${tenantNeedsReminder.length} tenant reminder(s), ${landlordNeedsReminder.length} landlord reminder(s)`);

        const boardTo = process.env.BOARD_TO_ADDRESS || process.env.DEFAULT_TO_ADDRESS;
        const from = process.env.DEFAULT_FROM_ADDRESS || 'Bjorkvang <styret@bjorkvang.org>';
        const websiteUrl = (process.env.WEBSITE_URL || 'https://bjorkvang.org').replace(/\/$/, '');

        const escapeHtml = (str) => String(str).replace(/[&<>"']/g, (m) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[m]);

        // --- Tenant signing reminders ---
        for (const booking of tenantNeedsReminder) {
            try {
                const contractLink = `${websiteUrl}/leieavtale.html?id=${encodeURIComponent(booking.id)}`;
                const safeName = escapeHtml(booking.requesterName);
                const safeEmail = escapeHtml(booking.requesterEmail);
                const safeDate = escapeHtml(booking.date);
                const safeEventType = escapeHtml(booking.eventType || 'Reservasjon');

                // 1) Send reminder to tenant
                const tenantHtml = generateEmailHtml({
                    title: 'Påminnelse: Signer leieavtalen',
                    content: `
                        <p>Hei ${safeName},</p>
                        <p>Vi minner om at leieavtalen for din booking <strong>${safeDate}</strong> (${safeEventType}) fortsatt ikke er signert.</p>
                        <p>Vennligst signer avtalen så snart som mulig slik at vi kan ferdigstille bookingen.</p>
                    `,
                    action: { text: 'Signer leieavtalen', url: contractLink },
                    previewText: `Påminnelse: Signer leieavtalen for ${booking.date}`
                });

                await sendEmail({
                    to: booking.requesterEmail,
                    from,
                    subject: `Påminnelse: Signer leieavtalen – ${booking.date}`,
                    html: tenantHtml,
                    text: `Hei ${booking.requesterName},\n\nVi minner om at leieavtalen for din booking ${booking.date} (${booking.eventType || 'Reservasjon'}) fortsatt ikke er signert.\n\nSigner her: ${contractLink}`
                });

                context.info(`signingReminder: Tenant reminder sent to ${booking.requesterEmail} for ${booking.id}`);

                // --- SMS-påminnelse til leietaker ---
                if (booking.phone) {
                    const tenantSms = buildSmsMessage('customer.reminderSigning', {
                        requesterName: booking.requesterName,
                        date: booking.date,
                        contractLink,
                    });
                    await sendSms({ to: booking.phone, body: tenantSms }, context);
                }

                // 2) Notify board
                if (boardTo) {
                    const adminLink = `${websiteUrl}/admin#${encodeURIComponent(booking.id)}`;

                    const boardHtml = generateEmailHtml({
                        title: 'Leieavtale ikke signert',
                        content: `
                            <p>Leietaker <strong>${safeName}</strong> (<a href="mailto:${safeEmail}">${safeEmail}</a>) har ikke signert leieavtalen innen 24 timer etter godkjenning.</p>
                            <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:15px;">
                                <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px 0;color:#6b7280;">Dato</td><td style="padding:8px 0;text-align:right;font-weight:600;">${safeDate}</td></tr>
                                <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px 0;color:#6b7280;">Formål</td><td style="padding:8px 0;text-align:right;">${safeEventType}</td></tr>
                                <tr><td style="padding:8px 0;color:#6b7280;">Godkjent</td><td style="padding:8px 0;text-align:right;">${escapeHtml(new Date(booking.approvedAt).toLocaleString('nb-NO'))}</td></tr>
                            </table>
                            <p>En påminnelse er automatisk sendt til leietaker.</p>
                        `,
                        action: { text: 'Åpne i admin', url: adminLink },
                        previewText: `${booking.requesterName} har ikke signert leieavtalen for ${booking.date}`
                    });

                    await sendEmail({
                        to: boardTo,
                        from,
                        subject: `Leieavtale ikke signert: ${booking.requesterName} – ${booking.date}`,
                        html: boardHtml,
                        text: `${booking.requesterName} (${booking.requesterEmail}) har ikke signert leieavtalen for booking ${booking.date} innen 24 timer etter godkjenning.\n\nEn påminnelse er sendt til leietaker.\n\nAdmin: ${adminLink}`
                    });

                    context.info(`signingReminder: Board notification sent for ${booking.id}`);
                }

                // Mark as reminded so we don't send again
                await updateBookingFields(booking.id, null, {
                    signingReminderSentAt: now.toISOString()
                });

            } catch (err) {
                context.error(`signingReminder: Failed for booking ${booking.id}`, { error: err.message });
            }
        }

        // --- Landlord signing reminders ---
        for (const booking of landlordNeedsReminder) {
            try {
                const adminLink = `${websiteUrl}/admin?contract=${encodeURIComponent(booking.id)}`;
                const safeName = escapeHtml(booking.requesterName);
                const safeDate = escapeHtml(booking.date);
                const safeEventType = escapeHtml(booking.eventType || 'Reservasjon');
                const tenantSignedDate = escapeHtml(new Date(booking.contract.signedAt).toLocaleString('nb-NO'));

                if (boardTo) {
                    const boardHtml = generateEmailHtml({
                        title: 'Påminnelse: Signer leieavtalen som utleier',
                        content: `
                            <p>Leietaker <strong>${safeName}</strong> signerte leieavtalen for <strong>${safeDate}</strong> (${safeEventType}) den ${tenantSignedDate}, men avtalen mangler fortsatt utleiers signatur.</p>
                            <p>Vennligst signer avtalen. Forhåndsbetalingsforespørsel sendes automatisk når begge har signert.</p>
                            <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:20px;">
                                <a href="${escapeHtml(adminLink)}" style="display:inline-block;padding:12px 24px;background:#1a6fa3;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;">&#128394; Logg inn og signer som utleier</a>
                            </div>
                        `,
                        previewText: `Påminnelse: Signer leieavtalen for ${booking.date} som utleier`
                    });

                    await sendEmail({
                        to: boardTo,
                        from,
                        subject: `Påminnelse: Signer leieavtalen – ${booking.requesterName} – ${booking.date}`,
                        html: boardHtml,
                        text: `Leietaker ${booking.requesterName} signerte leieavtalen for ${booking.date} den ${new Date(booking.contract.signedAt).toLocaleString('nb-NO')}, men utleiers signatur mangler.\n\nLogg inn og signer som utleier: ${adminLink}`
                    });

                    context.info(`signingReminder: Landlord reminder sent for ${booking.id}`);
                }

                await updateBookingFields(booking.id, null, {
                    landlordSigningReminderSentAt: now.toISOString()
                });

            } catch (err) {
                context.error(`signingReminder: Landlord reminder failed for ${booking.id}`, { error: err.message });
            }
        }

        context.info(`signingReminder: Completed. Tenant: ${tenantNeedsReminder.length}, Landlord: ${landlordNeedsReminder.length}`);
    }
});
