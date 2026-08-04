const { app } = require('@azure/functions');
const crypto = require('crypto');
const { sendEmail } = require('../../shared/email');
const { sendSms, sendSmsToAdminGroup, buildSmsMessage, deriveSmsSigningToken } = require('../../shared/sms');
const { createJsonResponse, parseBody, resolveBaseUrl } = require('../../shared/http');
const { saveBooking, listBookings } = require('../../shared/cosmosDb');
const { generateEmailHtml } = require('../../shared/emailTemplate');
const { checkForDoubleBooking } = require('../../shared/conflictCheck');

/**
 * Handle incoming booking submissions from the public website.
 * Stores the booking and notifies the board for approval using the Plunk SMTP setup.
 */
app.http('bookingRequest', {
    methods: ['POST', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'booking',
    handler: async (request, context) => {
        if (request.method === 'OPTIONS') {
            context.log('bookingRequest: Handled CORS preflight');
            return createJsonResponse(204, {}, request);
        }

        const body = await parseBody(request);
        const { date, time, requesterName, requesterEmail, message, duration, eventType, spaces, services, attendees, paymentOrderId, paymentStatus, isMember, paymentMethod, totalAmount, cateringContact, endDate, endTime, phone, address, source, adminCreated, externalContract, depositAlreadyPaid, fullyPaid, sendConfirmationEmail, ageVerified } = body;

        const isAdminBooking = adminCreated === true;
        // For admin bookings, emails are opt-in (require explicit sendConfirmationEmail flag)
        const suppressEmails = isAdminBooking && sendConfirmationEmail !== true;

        // Validate age verification (required for public bookings)
        if (!isAdminBooking && ageVerified !== true) {
            context.warn('bookingRequest: Age verification missing');
            return createJsonResponse(400, { error: 'Du må bekrefte at du er 18 år eller eldre for å sende en bookingforespørsel.' }, request);
        }

        // Validate required fields (email optional for admin bookings)
        if (!date || !time || !requesterName || (!requesterEmail && !isAdminBooking)) {
            context.warn('bookingRequest: Missing required fields', { 
                hasDate: Boolean(date),
                hasTime: Boolean(time),
                hasName: Boolean(requesterName),
                hasEmail: Boolean(requesterEmail)
            });
            return createJsonResponse(400, { error: 'Missing one of required fields: date, time, requesterName, requesterEmail.' }, request);
        }
        
        // Validate field types and formats
        if (typeof date !== 'string' || typeof time !== 'string' || 
            typeof requesterName !== 'string' || (requesterEmail && typeof requesterEmail !== 'string')) {
            context.warn('bookingRequest: Invalid field types');
            return createJsonResponse(400, { error: 'Invalid field types.' }, request);
        }
        
        // Validate email format (only when provided)
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (requesterEmail && !emailRegex.test(requesterEmail.trim())) {
            context.warn('bookingRequest: Invalid email format', { email: requesterEmail });
            return createJsonResponse(400, { error: 'Invalid email format.' }, request);
        }
        
        // Validate and sanitize inputs
        const trimmedDate = date.trim();
        const trimmedTime = time.trim();
        const trimmedName = requesterName.trim();
        const trimmedEmail = requesterEmail ? requesterEmail.trim() : '';
        const trimmedMessage = message ? String(message).trim() : '';
        const trimmedEventType = eventType ? String(eventType).trim() : 'Reservasjon';
        const safeDuration = Number(duration) || 4;
        const safeAttendees = Number(attendees) || 0;
        const safeSpaces = Array.isArray(spaces) ? spaces : (spaces ? [String(spaces)] : []);
        const safeServices = Array.isArray(services) ? services : (services ? [String(services)] : []);
        
        // Length validation
        if (trimmedName.length > 100) {
            context.warn('bookingRequest: Name too long');
            return createJsonResponse(400, { error: 'Name must be less than 100 characters.' }, request);
        }
        
        if (trimmedMessage.length > 2000) {
            context.warn('bookingRequest: Message too long');
            return createJsonResponse(400, { error: 'Message must be less than 2000 characters.' }, request);
        }
        
        // Date format validation (basic ISO date check)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
            context.warn('bookingRequest: Invalid date format', { date: trimmedDate });
            return createJsonResponse(400, { error: 'Invalid date format. Expected YYYY-MM-DD.' }, request);
        }

        // Validate that booking is not too far in the future (max 2 years)
        const bookingDateObj = new Date(trimmedDate);
        const maxDate = new Date();
        maxDate.setFullYear(maxDate.getFullYear() + 2);
        
        if (bookingDateObj > maxDate) {
            context.warn('bookingRequest: Date too far in future', { date: trimmedDate });
            return createJsonResponse(400, { error: 'Bookings can only be made up to 2 years in advance.' }, request);
        }
        
        // Time format validation (HH:MM)
        if (!/^\d{2}:\d{2}$/.test(trimmedTime)) {
            context.warn('bookingRequest: Invalid time format', { time: trimmedTime });
            return createJsonResponse(400, { error: 'Invalid time format. Expected HH:MM.' }, request);
        }

        context.info('bookingRequest: Validation passed, running double-booking check...');

        // --- Double-booking check ---
        try {
            // Fetch a wide window: 3 days before (to catch multi-day bookings already in progress)
            // through the new booking's end date (to catch future bookings that start before ours ends).
            const newStart = new Date(`${trimmedDate}T${trimmedTime}`);
            const newEnd   = new Date(newStart.getTime() + safeDuration * 60 * 60 * 1000);
            const lookbackStart = new Date(newStart);
            lookbackStart.setDate(lookbackStart.getDate() - 3);
            const checkStartStr = lookbackStart.toISOString().split('T')[0];
            const checkEndStr   = newEnd.toISOString().split('T')[0];

            const existingBookings = await listBookings({ startDate: checkStartStr, endDate: checkEndStr });
            const { conflict, conflictingBooking } = checkForDoubleBooking(
                { date: trimmedDate, time: trimmedTime, duration: safeDuration, spaces: safeSpaces },
                existingBookings
            );

            if (conflict) {
                context.warn('bookingRequest: Double-booking conflict detected', {
                    newDate: trimmedDate,
                    newTime: trimmedTime,
                    conflictingId: conflictingBooking?.id,
                    conflictingDate: conflictingBooking?.date,
                    conflictingTime: conflictingBooking?.time,
                });
                return createJsonResponse(409, {
                    error: 'Dobbeltbooking',
                    message: `Det valgte tidspunktet er ikke tilgjengelig — lokalet er allerede reservert (${conflictingBooking?.date} kl. ${conflictingBooking?.time}). Vennligst velg et annet tidspunkt.`,
                    conflictingBookingDate: conflictingBooking?.date,
                    conflictingBookingTime: conflictingBooking?.time,
                }, request);
            }
        } catch (checkError) {
            // Fail open: log the issue but allow the booking to proceed
            // rather than blocking valid submissions due to a lookup failure.
            context.warn('bookingRequest: Could not complete double-booking check — proceeding anyway', {
                error: checkError.message,
            });
        }

        context.info('bookingRequest: Attempting to save booking...');

        try {
            // Generate unique booking ID
            const bookingId = `booking-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

            context.info(`bookingRequest: Generated ID ${bookingId}, calling saveBooking...`);

            // Determine status: paid bookings are auto-approved
            const bookingStatus = paymentStatus === 'paid' ? 'approved' : 'pending';
            const isPaid = paymentStatus === 'paid';

            // Calculate payment amount and store it (in øre)
            const PRICING = {
                'Peisestue': 1500,
                'Salen': 3000,
                'Hele lokalet': 4000,
                'Bryllupspakke': 6000,
                'Små møter': 30 // per person
            };

            const MEMBER_ELIGIBLE_SPACES = ['Hele lokalet', 'Bryllupspakke'];
            const MINNESTUND_RATE = 30; // kr per person
            let paymentAmount = 0;

            // Minnesamvær: flat rate per person, overrides space pricing
            if (eventType === 'Minnestund') {
                paymentAmount = (safeAttendees || 10) * MINNESTUND_RATE;
            } else {
                safeSpaces.forEach(space => {
                    if (space === 'Små møter') {
                        paymentAmount += PRICING[space] * (safeAttendees || 10);
                    } else if (PRICING[space]) {
                        paymentAmount += PRICING[space];
                    }
                });

                const memberIsEligible = isMember === true && safeSpaces.some(s => MEMBER_ELIGIBLE_SPACES.includes(s));
                if (memberIsEligible) {
                    paymentAmount = Math.max(0, paymentAmount - 500);
                }
            }

            // Convert to øre for storage
            paymentAmount = paymentAmount * 100;

            const signingToken = crypto.randomBytes(32).toString('hex');

            // Create booking with sanitized inputs
            const booking = await saveBooking({
                id: bookingId,
                date: trimmedDate,
                time: trimmedTime,
                endDate: endDate ? String(endDate).trim() : null,
                endTime: endTime ? String(endTime).trim() : null,
                requesterName: trimmedName,
                requesterEmail: trimmedEmail,
                phone: phone ? String(phone).trim().replace(/[\s\-]/g, '').replace(/^(?:\+?47|0047)/, '') : null,
                address: address ? String(address).trim() : null,
                message: trimmedMessage,
                eventType: trimmedEventType,
                duration: safeDuration,
                attendees: safeAttendees,
                spaces: safeSpaces,
                services: safeServices,
                status: bookingStatus,
                paymentOrderId: paymentOrderId || null,
                paymentStatus: paymentStatus || 'unpaid',
                // Admin-created bookings default to Vipps; public bookings default to bank.
                paymentMethod: (paymentMethod && ['bank', 'vipps'].includes(paymentMethod))
                    ? paymentMethod
                    : (isAdminBooking ? 'vipps' : 'bank'),
                totalAmount: totalAmount || paymentAmount / 100,
                paymentAmount: paymentAmount,
                cateringContact: cateringContact === true || cateringContact === 'true',
                signingToken,
                smsSigningToken: deriveSmsSigningToken(signingToken),
                adminCreated: adminCreated === true,
                suppressEmails: suppressEmails || false,
                // External tracking: pre-set fields if admin indicated these were handled outside the system
                ...(adminCreated === true && externalContract === true ? {
                    contract: {
                        externallyHandled: true,
                        externalNote: 'Kontrakt signert utenfor systemet',
                        signedAt: new Date().toISOString(),
                        landlordSignedAt: new Date().toISOString(),
                    }
                } : {}),
                ...(adminCreated === true && (depositAlreadyPaid === true || fullyPaid === true) ? {
                    depositPaid: true,
                    depositPaidAt: new Date().toISOString(),
                    depositRequested: true,
                    depositRequestedAt: new Date().toISOString(),
                    depositAmount: Math.round((totalAmount || paymentAmount / 100) * 0.5),
                } : {}),
                ...(adminCreated === true && fullyPaid === true ? {
                    finalInvoicePaid: true,
                    finalInvoicePaidAt: new Date().toISOString(),
                    finalInvoiceSentAt: new Date().toISOString(),
                    finalInvoiceAmountNOK: 0,
                } : {}),
            });
            
            context.info('bookingRequest: Created booking', {
                id: booking.id,
                date: booking.date,
                email: booking.requesterEmail
            });
            
            const websiteUrl = (process.env.WEBSITE_URL || 'https://bjorkvang.org').replace(/\/$/, '');
            const adminLink = `${websiteUrl}/admin#${encodeURIComponent(booking.id)}`;
            const approveLink = `${resolveBaseUrl(request)}/api/booking/approve?id=${encodeURIComponent(booking.id)}`;
            const rejectLink = `${resolveBaseUrl(request)}/api/booking/reject?id=${encodeURIComponent(booking.id)}`;

            const to = process.env.BOARD_TO_ADDRESS || process.env.DEFAULT_TO_ADDRESS || 'skype.oyvind@hotmail.com';
            let from = process.env.DEFAULT_FROM_ADDRESS || 'Bjorkvang <styret@bjorkvang.org>';

            if (!to || !from) {
                context.error('bookingRequest: Missing email configuration', { 
                    hasTo: Boolean(to), 
                    hasFrom: Boolean(from) 
                });
                return createJsonResponse(500, { error: 'Email configuration missing. Please contact an administrator.' }, request);
            }
            
            // Escape HTML to prevent XSS
            const escapeHtml = (str) => String(str).replace(/[&<>"']/g, (m) => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
            })[m]);
            
            const safeName = escapeHtml(booking.requesterName);
            const safeEmail = escapeHtml(booking.requesterEmail);
            const safeDate = escapeHtml(booking.date);
            const safeTime = escapeHtml(booking.time);
            const safeMessage = escapeHtml(booking.message || 'Ingen melding oppgitt.');
            const safeEventType = escapeHtml(booking.eventType);
            const safeSpacesStr = escapeHtml(booking.spaces.join(', ') || 'Ingen valgt');
            const safeServicesStr = escapeHtml(booking.services.join(', ') || 'Ingen valgt');

            // Format dates for email
            const startDateObj = new Date(`${booking.date}T${booking.time}`);
            const formattedStartDate = !isNaN(startDateObj)
                ? startDateObj.toLocaleDateString('nb-NO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
                : safeDate;
            const formattedStartTime = booking.time || '';

            let formattedEnd = '';
            if (booking.endDate && booking.endTime) {
                const endDateObj = new Date(`${booking.endDate}T${booking.endTime}`);
                formattedEnd = !isNaN(endDateObj)
                    ? `${endDateObj.toLocaleDateString('nb-NO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} kl. ${booking.endTime}`
                    : `${booking.endDate} kl. ${booking.endTime}`;
            } else {
                const endMs = startDateObj.getTime() + (booking.duration || 4) * 60 * 60 * 1000;
                const endDateCalc = new Date(endMs);
                formattedEnd = !isNaN(endDateCalc)
                    ? `${escapeHtml(endDateCalc.toLocaleDateString('nb-NO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }))} kl. ${endDateCalc.toTimeString().slice(0, 5)}`
                    : '';
            }

            const totalNOK = booking.totalAmount || 0;
            const depositNOK = totalNOK ? Math.round(totalNOK * 0.5) : 0;
            const priceRow = totalNOK
                ? `<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px 0;color:#6b7280;">Estimert leiesum</td><td style="padding:8px 0;text-align:right;font-weight:600;">kr\u00a0${totalNOK.toLocaleString('nb-NO')}</td></tr>
                   <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px 0;color:#6b7280;">Vask / Rengj\u00f8ring (obligatorisk, faktureres etterpå)</td><td style="padding:8px 0;text-align:right;">~kr\u00a01\u00a0000</td></tr>
                   <tr><td style="padding:8px 0;color:#6b7280;">Forh\u00e5ndsbetaling (50\u00a0%)</td><td style="padding:8px 0;text-align:right;font-weight:700;color:#166534;">kr\u00a0${depositNOK.toLocaleString('nb-NO')}</td></tr>`
                : '';

            const cateringNote = booking.cateringContact
                ? `<div style="margin-top:16px;padding:12px 16px;background:#fef9ec;border:1px solid #fde68a;border-radius:8px;font-size:0.9rem;">
                       <strong>N\u00e6s Mat og Event:</strong> Kunden har bedt om \u00e5 bli kontaktet med tilbud p\u00e5 catering.
                   </div>`
                : '';

            // Booking summary table (reused in both emails)
            const summaryTable = `
                <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:15px;">
                    <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px 0;color:#6b7280;">Dato</td><td style="padding:8px 0;text-align:right;font-weight:600;">${formattedStartDate}</td></tr>
                    <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px 0;color:#6b7280;">Fra</td><td style="padding:8px 0;text-align:right;">kl.\u00a0${formattedStartTime}</td></tr>
                    <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px 0;color:#6b7280;">Til</td><td style="padding:8px 0;text-align:right;">${escapeHtml(formattedEnd)}</td></tr>
                    <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px 0;color:#6b7280;">Form\u00e5l</td><td style="padding:8px 0;text-align:right;">${safeEventType}</td></tr>
                    <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px 0;color:#6b7280;">Lokale</td><td style="padding:8px 0;text-align:right;">${safeSpacesStr}</td></tr>
                    <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px 0;color:#6b7280;">Antall gjester</td><td style="padding:8px 0;text-align:right;">${booking.attendees || 'Ikke oppgitt'}</td></tr>
                    ${priceRow}
                </table>`;

            // --- Board Notification Email ---
            const paymentInfo = isPaid
                ? `<li style="color: #1a823b;"><strong>Betaling: Betalt via Vipps (${paymentOrderId})</strong></li>`
                : '';

            const statusNote = isPaid
                ? '<p style="background-color: #d1fae5; padding: 12px; border-radius: 6px; color: #065f46;"><strong>✓ Betaling mottatt:</strong> Denne bookingen er allerede betalt via Vipps og kan godkjennes direkte.</p>'
                : '';

            const boardHtmlContent = `
                <p>Det har kommet en ny bookingforespørsel som venter på godkjenning.</p>
                ${statusNote}
                ${summaryTable}
                <ul class="info-list">
                    <li><span class="info-label">Navn</span> <span class="info-value">${safeName}</span></li>
                    <li><span class="info-label">E-post</span> <span class="info-value"><a href="mailto:${safeEmail}">${safeEmail}</a></span></li>
                    ${booking.phone ? `<li><span class="info-label">Telefon</span> <span class="info-value"><a href="tel:${escapeHtml(booking.phone)}">${escapeHtml(booking.phone)}</a></span></li>` : ''}
                    ${booking.address ? `<li><span class="info-label">Adresse</span> <span class="info-value">${escapeHtml(booking.address)}</span></li>` : ''}
                    <li><span class="info-label">Tjenester</span> <span class="info-value">${safeServicesStr}</span></li>
                    ${paymentInfo}
                </ul>
                ${cateringNote}
                <div style="background-color: #f9fafb; padding: 16px; border-radius: 6px; margin-top: 16px;">
                    <strong>Melding:</strong><br>
                    ${safeMessage}
                </div>
                <p style="margin-top: 24px;">Behandle forespørselen i admin-grensesnittet, eller bruk direktelenkene under:</p>
                <div style="margin-bottom:12px;">
                    <a href="${escapeHtml(adminLink)}" style="display:inline-block;padding:12px 24px;background:#1a6fa3;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;font-size:1rem;">&#128196; Åpne i admin</a>
                </div>
                <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                    <a href="${escapeHtml(approveLink)}" style="display:inline-block;padding:10px 20px;background:#1a823b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;">Godkjenn booking</a>
                    <a href="${escapeHtml(rejectLink)}" style="display:inline-block;padding:10px 20px;background:#b91c1c;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;">Avvis booking</a>
                </div>
            `;

            const boardHtml = generateEmailHtml({
                title: 'Ny bookingforespørsel',
                content: boardHtmlContent,
                previewText: `Ny forespørsel fra ${safeName} for ${safeDate}`
            });

            const text = `Ny bookingforespørsel:\nDato: ${booking.date}\nTid: ${booking.time}\nType: ${booking.eventType}\nNavn: ${booking.requesterName}\nE-post: ${booking.requesterEmail}${booking.phone ? `\nTelefon: ${booking.phone}` : ''}${booking.address ? `\nAdresse: ${booking.address}` : ''}\nMelding: ${booking.message || 'Ingen melding'}\n\nÅpne i admin: ${adminLink}\nGodkjenn: ${approveLink}\nAvvis: ${rejectLink}`;

            // Skip all emails for admin-seed bookings or admin-created bookings where emails were not requested
            if (source !== 'admin-seed' && !suppressEmails) {
            await sendEmail({
                to,
                from,
                subject: `Ny bookingforespørsel: ${booking.eventType} – ${booking.date}`,
                text,
                html: boardHtml,
            });
            
            context.info('bookingRequest: Board notification email sent');

            // --- Board SMS notification ---
            const boardSmsBody = buildSmsMessage('admin.newBooking', {
                requesterName: booking.requesterName,
                date: booking.date,
                eventType: booking.eventType,
                attendees: booking.attendees,
            });
            await sendSmsToAdminGroup(boardSmsBody, context);

            // --- Requester Confirmation Email ---
            const confirmationSubject = isPaid
                ? 'Booking bekreftet – betaling mottatt'
                : 'Vi har mottatt bookingforespørselen din';

            const paymentConfirmation = isPaid
                ? '<p style="background-color: #d1fae5; padding: 12px; border-radius: 6px; color: #065f46;"><strong>✓ Betaling bekreftet:</strong> Din betaling via Vipps er mottatt og booking er bekreftet.</p>'
                : '';

            const nextStepsText = isPaid
                ? '<p style="margin-top: 24px;"><strong>Hva skjer nå?</strong><br>Din booking er bekreftet! Du vil få en leieavtale til signering i nær framtid.</p>'
                : '<p style="margin-top: 24px;"><strong>Hva skjer nå?</strong><br>Styret vil se gjennom forespørselen din. Du vil motta en e-post så snart bookingen er behandlet (vanligvis innen 2-3 dager).</p>';

            const customerCateringNote = booking.cateringContact
                ? `<div style="margin-top:16px;padding:12px 16px;background:#fef9ec;border:1px solid #fde68a;border-radius:8px;font-size:0.9rem;">
                       🍽 <strong>Catering:</strong> Du har bedt om å bli kontaktet av Næs Mat og Event med tilbud på catering. De vil ta kontakt med deg direkte.
                   </div>`
                : '';

            const confirmationHtmlContent = `
                <p>Hei ${safeName},</p>
                <p>Takk for din forespørsel om å booke Bjørkvang forsamlingslokale. Her er en oppsummering av hva vi har mottatt:</p>
                ${paymentConfirmation}
                ${summaryTable}
                ${customerCateringNote}
                ${booking.message ? `<div style="background-color: #f9fafb; padding: 16px; border-radius: 6px; margin-top: 16px;"><strong>Din melding:</strong><br>${safeMessage}</div>` : ''}
                ${nextStepsText}
                <p style="margin-top: 16px; font-size: 0.9em; color: #6b7280;">Spørsmål? Ta kontakt på <a href="mailto:styret@bjorkvang.org" style="color:#1a6fa3;">styret@bjorkvang.org</a> eller ring oss på <a href="tel:+4748060273" style="color:#1a6fa3;">+47 480 60 273</a>.</p>
            `;

            const confirmationHtml = generateEmailHtml({
                title: 'Forespørsel mottatt ✅',
                content: confirmationHtmlContent,
                action: { text: 'Se kalender og tilgjengelighet', url: 'https://bjorkvang.org/booking' },
                previewText: `Forespørselen din for ${formattedStartDate} er mottatt – vi behandler den snarest.`
            });

            const confirmationText = `Hei ${booking.requesterName},\n\nTakk for din forespørsel om å booke Bjørkvang forsamlingslokale.\n\nOppsummering:\n- Dato: ${booking.date}\n- Fra: kl. ${booking.time}\n- Til: ${formattedEnd}\n- Formål: ${booking.eventType}\n- Lokale: ${booking.spaces.join(', ')}\n- Antall gjester: ${booking.attendees || 'Ikke oppgitt'}${totalNOK ? `\n- Estimert leiesum: kr ${totalNOK.toLocaleString('nb-NO')}\n- Forhåndsbetaling (50 %): kr ${depositNOK.toLocaleString('nb-NO')}` : ''}${booking.cateringContact ? '\n- Catering: Du har bedt om å bli kontaktet av Næs Mat og Event' : ''}\n\nStyret vil behandle forespørselen og ta kontakt innen 2\u20133 virkedager.\n\nVennlig hilsen\nHelgøens Vel\nstyret@bjorkvang.org | +47 480 60 273`;

            try {
                await sendEmail({
                    to: booking.requesterEmail,
                    from,
                    subject: confirmationSubject,
                    text: confirmationText,
                    html: confirmationHtml,
                });
                context.info('bookingRequest: Confirmation email sent to requester');

                // --- Requester SMS confirmation ---
                if (booking.phone) {
                    const requesterSmsBody = buildSmsMessage('customer.bookingReceived', {
                        requesterName: booking.requesterName,
                        date: booking.date,
                    });
                    await sendSms({ to: booking.phone, body: requesterSmsBody }, context);
                }
            } catch (error) {
                context.error('bookingRequest: Failed to send confirmation email to requester', {
                    error: error.message,
                    stack: error.stack,
                    bookingId: booking.id
                });
            }
            } else {
                context.info('bookingRequest: Skipping emails for admin-seed booking');
            }

            context.info(`bookingRequest: Successfully processed booking ${booking.id}`);
            return createJsonResponse(202, {
                id: booking.id,
                status: booking.status,
                paymentMethod: booking.paymentMethod,
            }, request);
        } catch (error) {
            context.error('bookingRequest: Failed to process booking request', {
                error: error.message,
                stack: error.stack,
                body: { date, time, requesterName, hasEmail: Boolean(requesterEmail) }
            });
            
            // Provide user-friendly error message
            // DEBUG: Exposing full error for troubleshooting
            const userMessage = error.message || 'Unable to process booking right now.';
                
            return createJsonResponse(500, { error: userMessage }, request);
        }
    },
});
