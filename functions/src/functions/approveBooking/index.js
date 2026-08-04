const { app } = require('@azure/functions');
const { sendEmail } = require('../../../shared/email');
const { sendSms, buildSmsMessage, deriveSmsSigningToken } = require('../../../shared/sms');
const { createHtmlResponse, createJsonResponse, parseBody, requireAdminKey } = require('../../../shared/http');
const { getBooking, updateBookingStatus, updateBookingFields } = require('../../../shared/cosmosDb');
const { generateEmailHtml } = require('../../../shared/emailTemplate');

/**
 * Build the admin action page HTML (confirm before approving).
 */
function buildConfirmPage(booking, actionUrl) {
    const escapeHtml = (str) => String(str).replace(/[&<>"']/g, (m) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);

    const dateObj = new Date(`${booking.date}T00:00:00`);
    const formattedDate = !isNaN(dateObj)
        ? dateObj.toLocaleDateString('nb-NO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
        : booking.date;

    return `<!DOCTYPE html>
<html lang="nb"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Godkjenn booking – Bjørkvang</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f3f4f6;color:#1f2937;line-height:1.6}
.wrap{max-width:560px;margin:40px auto;background:#fff;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.1);overflow:hidden}
.hdr{background:#1a6fa3;color:#fff;padding:24px 28px}
.hdr h1{font-size:1.25rem;font-weight:700}
.hdr p{font-size:.85rem;opacity:.8;margin-top:4px}
.body{padding:28px}
table{width:100%;border-collapse:collapse;margin:12px 0 20px;font-size:.95rem}
td{padding:8px 0;border-bottom:1px solid #e5e7eb}
td:first-child{color:#6b7280}
td:last-child{text-align:right;font-weight:600}
label{display:block;font-weight:600;font-size:.9rem;margin-bottom:6px}
textarea{width:100%;padding:10px;border:1px solid #d1d5db;border-radius:6px;font-family:inherit;font-size:.9rem;resize:vertical;min-height:80px}
.hint{font-size:.8rem;color:#9ca3af;margin-top:4px}
.btns{display:flex;gap:12px;margin-top:24px}
.btn{padding:12px 24px;border:none;border-radius:6px;font-weight:700;font-size:1rem;cursor:pointer;text-decoration:none;text-align:center;flex:1}
.btn-approve{background:#10b981;color:#fff}
.btn-approve:hover{background:#059669}
.btn-cancel{background:#f3f4f6;color:#6b7280;border:1px solid #d1d5db}
.btn-cancel:hover{background:#e5e7eb}
.result{display:none;text-align:center;padding:40px 28px}
.result h2{margin-bottom:8px}
.result.ok h2{color:#059669}
.result.fail h2{color:#dc2626}
.spinner{display:none;margin:0 auto 12px;width:28px;height:28px;border:3px solid #e5e7eb;border-top-color:#10b981;border-radius:50%;animation:spin .6s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
</style></head><body>
<div class="wrap">
  <div class="hdr">
    <h1>Godkjenn booking</h1>
    <p>Bjørkvang forsamlingslokale – Helgøens Vel</p>
  </div>
  <div class="body" id="form-view">
    <table>
      <tr><td>Dato</td><td>${escapeHtml(formattedDate)}</td></tr>
      <tr><td>Tidspunkt</td><td>kl. ${escapeHtml(booking.time || '')}${booking.duration ? ` (${booking.duration} timer)` : ''}</td></tr>
      <tr><td>Formål</td><td>${escapeHtml(booking.eventType || 'Reservasjon')}</td></tr>
      <tr><td>Lokale</td><td>${escapeHtml(Array.isArray(booking.spaces) ? booking.spaces.join(', ') : (booking.spaces || ''))}</td></tr>
      <tr><td>Navn</td><td>${escapeHtml(booking.requesterName || '')}</td></tr>
      <tr><td>E-post</td><td>${escapeHtml(booking.requesterEmail || '')}</td></tr>
      ${booking.phone ? `<tr><td>Telefon</td><td>${escapeHtml(booking.phone)}</td></tr>` : ''}
    </table>
    <label for="msg">Melding til leietaker (valgfritt)</label>
    <textarea id="msg" placeholder="F.eks. «Velkommen! Nøkkel hentes hos…»"></textarea>
    <p class="hint">Meldingen inkluderes i godkjennings-e-posten som sendes til kunden.</p>
    <div class="btns">
      <button class="btn btn-approve" onclick="doApprove()">✓ Godkjenn booking</button>
      <a class="btn btn-cancel" href="javascript:history.back()">Avbryt</a>
    </div>
  </div>
  <div class="result" id="result-view">
    <div class="spinner" id="spinner"></div>
    <h2 id="result-title"></h2>
    <p id="result-text"></p>
  </div>
</div>
<script>
async function doApprove(){
  var formEl=document.getElementById('form-view');
  var resultEl=document.getElementById('result-view');
  var spin=document.getElementById('spinner');
  formEl.style.display='none';
  resultEl.style.display='block';
  spin.style.display='block';
  try{
    var res=await fetch('${escapeHtml(actionUrl)}',{
      method:'POST',
      headers:{'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify({message:document.getElementById('msg').value})
    });
    spin.style.display='none';
    var data=await res.json();
    if(res.ok){
      resultEl.className='result ok';
      document.getElementById('result-title').textContent='Booking godkjent ✓';
      document.getElementById('result-text').textContent='Bekreftelse med kontrakt- og betalingsinfo er sendt til leietaker.';
    }else{
      resultEl.className='result fail';
      document.getElementById('result-title').textContent='Noe gikk galt';
      document.getElementById('result-text').textContent=data.error||'Ukjent feil. Prøv igjen.';
    }
  }catch(e){
    spin.style.display='none';
    resultEl.className='result fail';
    document.getElementById('result-title').textContent='Nettverksfeil';
    document.getElementById('result-text').textContent='Kunne ikke nå serveren. Sjekk internettforbindelsen.';
  }
}
</script></body></html>`;
}

/**
 * Approve a booking via a direct link (GET = form, POST = execute).
 */
app.http('approveBooking', {
    methods: ['GET', 'POST', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'booking/approve',
    handler: async (request, context) => {
        if (request.method === 'OPTIONS') {
            return createJsonResponse(204, {}, request);
        }

        const id = request.query.get('id');
        const isApiRequest = request.headers.get('accept')?.includes('application/json');
        
        // Validate booking ID
        if (!id || typeof id !== 'string' || id.trim().length === 0) {
            context.warn('approveBooking called with invalid or missing ID');
            return createJsonResponse(400, { error: 'Missing booking id.' }, request);
        }

        const existingBooking = await getBooking(id.trim());
        if (!existingBooking) {
            context.warn(`approveBooking: Booking not found for ID: ${id}`);
            if (isApiRequest) return createJsonResponse(404, { error: 'Booking not found.' }, request);
            return createHtmlResponse(404, '<p>Bookingen ble ikke funnet.</p>', request);
        }

        if (existingBooking.status === 'approved') {
            context.info(`approveBooking: Booking ${id} was already approved`);
            if (isApiRequest) {
                return createJsonResponse(200, { message: 'Booking was already approved.' }, request);
            }
            return createHtmlResponse(200, '<p>Booking var allerede godkjent. Bekreftelse er tidligere sendt.</p>', request);
        }

        // --- GET: Show confirmation form ---
        if (request.method === 'GET') {
            const actionUrl = `${new URL(request.url).origin}/api/booking/approve?id=${encodeURIComponent(id.trim())}`;
            return createHtmlResponse(200, buildConfirmPage(existingBooking, actionUrl), request);
        }

        // --- POST: Execute approval ---
        const body = await parseBody(request);

        // Require admin key for API (JSON) approval requests
        if (isApiRequest) {
            const authError = requireAdminKey(request);
            if (authError) return authError;
        }

        const adminMessage = (body.message || '').trim().substring(0, 2000);

        const updatedBooking = await updateBookingStatus(id.trim(), null, 'approved');
        if (!updatedBooking) {
            context.error(`approveBooking: Failed to update booking status for ID: ${id}`);
            return createJsonResponse(500, { error: 'Failed to approve booking.' }, request);
        }

        // Store approval timestamp for reminder tracking
        await updateBookingFields(id.trim(), null, { approvedAt: new Date().toISOString() });
        
        context.info(`approveBooking: Successfully approved booking ${id} for ${existingBooking.requesterEmail}`);

        // Skip confirmation email for admin-seed bookings, or admin-created bookings where emails were suppressed
        if (existingBooking.source === 'admin-seed' || existingBooking.suppressEmails) {
            context.info('approveBooking: Skipping confirmation email (admin-seed or suppressEmails flag)');
            if (isApiRequest) return createJsonResponse(200, { message: 'Booking approved (no email sent).' }, request);
            return createHtmlResponse(200, '<p>Booking godkjent (ingen e-post sendt).</p>', request);
        }

        try {
            const from = process.env.DEFAULT_FROM_ADDRESS;
            if (!from) {
                context.warn('approveBooking: DEFAULT_FROM_ADDRESS is not set. Skipping confirmation email.');
            } else if (!existingBooking.requesterEmail || typeof existingBooking.requesterEmail !== 'string') {
                context.error('approveBooking: Invalid requester email in booking');
            } else {
                // Escape HTML to prevent XSS
                const escapeHtml = (str) => String(str).replace(/[&<>"']/g, (m) => ({
                    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
                })[m]);
                
                const safeName = escapeHtml(existingBooking.requesterName || 'Bruker');
                const safeDate = escapeHtml(existingBooking.date || '');
                const safeTime = escapeHtml(existingBooking.time || '');
                const safeEventType = escapeHtml(existingBooking.eventType || 'Reservasjon');
                const safeSpaces = escapeHtml(
                    Array.isArray(existingBooking.spaces)
                        ? existingBooking.spaces.join(', ')
                        : (existingBooking.spaces || 'Ikke oppgitt')
                );
                const safeDuration = Number(existingBooking.duration) || 0;

                // Format date nicely in Norwegian
                const dateObj = new Date(`${existingBooking.date}T00:00:00`);
                const formattedDate = !isNaN(dateObj)
                    ? dateObj.toLocaleDateString('nb-NO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
                    : safeDate;

                // Prices
                const totalNOK = existingBooking.totalAmount || (existingBooking.paymentAmount ? existingBooking.paymentAmount / 100 : 0);
                const depositNOK = existingBooking.depositAmount || (totalNOK ? Math.round(totalNOK * 0.5) : 0);
                const depositStr = depositNOK ? `kr\u00a0${depositNOK.toLocaleString('nb-NO')}` : '(beregnes av styret)';
                const totalStr = totalNOK ? `kr\u00a0${totalNOK.toLocaleString('nb-NO')}` : '(beregnes av styret)';

                const websiteUrl = (process.env.WEBSITE_URL || 'https://bj\u00f8rkvang.no').replace(/\/$/, '');
                const signingToken = existingBooking.signingToken || '';
                const contractLink = `${websiteUrl}/leieavtale.html?id=${existingBooking.id}${signingToken ? `&signingToken=${encodeURIComponent(signingToken)}` : ''}`;

                // Booking summary table
                const summaryTable = `
                    <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:15px;">
                        <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px 0;color:#6b7280;">Dato</td><td style="padding:8px 0;text-align:right;font-weight:600;">${formattedDate}</td></tr>
                        <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px 0;color:#6b7280;">Tidspunkt</td><td style="padding:8px 0;text-align:right;">kl.&nbsp;${safeTime}${safeDuration ? `&nbsp;(${safeDuration}&nbsp;timer)` : ''}</td></tr>
                        <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px 0;color:#6b7280;">Form\u00e5l</td><td style="padding:8px 0;text-align:right;">${safeEventType}</td></tr>
                        <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px 0;color:#6b7280;">Lokale</td><td style="padding:8px 0;text-align:right;">${safeSpaces}</td></tr>
                        <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px 0;color:#6b7280;">Estimert leiesum</td><td style="padding:8px 0;text-align:right;">${totalStr}</td></tr>
                        <tr><td style="padding:8px 0;color:#6b7280;">Forhåndsbetaling (50&nbsp;%)</td><td style="padding:8px 0;text-align:right;font-weight:700;color:#166534;">${depositStr}</td></tr>
                    </table>`;

                // Optional admin message block
                const adminMessageHtml = adminMessage
                    ? `<div style="background:#f0f7ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 18px;margin:16px 0;">
                           <strong>Melding fra styret:</strong><br>${escapeHtml(adminMessage)}
                       </div>`
                    : '';

                const htmlContent = `
                    <p>Hei ${safeName},</p>
                    <p>&#127881; Gode nyheter! Din bookingforesp\u00f8rsel er godkjent.</p>
                    ${adminMessageHtml}
                    ${summaryTable}

                    <h3 style="margin:20px 0 6px;font-size:1rem;">Neste steg &ndash; Signer leieavtalen</h3>
                    <p style="margin:0 0 4px;">Les gjennom og signer avtalen digitalt. N\u00e5r begge parter har signert, sender vi informasjon om Forhåndsbetalingsbetaling.</p>
                    <div style="background:#f0f7ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px 20px;margin:12px 0 16px;">
                        <a href="${contractLink}" style="display:inline-block;background:#1a56db;color:#fff;font-weight:700;padding:12px 24px;border-radius:6px;text-decoration:none;font-size:1rem;">&#128394; Signer leieavtalen</a>
                    </div>

                    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;margin:16px 0;">
                        <p style="margin:0 0 6px;font-weight:600;color:#374151;">Slik fungerer prosessen:</p>
                        <ol style="margin:0;padding-left:20px;color:#4b5563;font-size:0.9rem;">
                            <li>Signer leieavtalen digitalt (lenke over)</li>
                            <li>Styret signerer som utleier</li>
                            <li>Du mottar Forhåndsbetalingsforesp\u00f8rsel (${depositStr})</li>
                            <li>Etter arrangementet sendes sluttfaktura for restbel\u00f8pet</li>
                        </ol>
                    </div>

                    <p style="font-size:0.9em;color:#6b7280;">Sp\u00f8rsm\u00e5l? Ta kontakt p\u00e5 <a href="mailto:styret@bjorkvang.org" style="color:#1a823b;">styret@bjorkvang.org</a>.</p>
                `;

                const html = generateEmailHtml({
                    title: 'Din booking er godkjent &#127881;',
                    content: htmlContent,
                    action: { text: '&#128394; Signer leieavtalen', url: contractLink },
                    previewText: `Booking godkjent! Signer leieavtalen for ${formattedDate}.`
                });

                await sendEmail({
                    to: existingBooking.requesterEmail.trim(),
                    from,
                    subject: `Booking godkjent \u2013 ${formattedDate}`,
                    text: [
                        `Hei ${existingBooking.requesterName || 'Bruker'}!`,
                        '',
                        `Din booking for ${formattedDate} kl. ${safeTime} er godkjent.`,
                        ...(adminMessage ? ['', `Melding fra styret: ${adminMessage}`] : []),
                        '',
                        'Neste steg \u2013 Signer leieavtalen:',
                        contractLink,
                        '',
                        'N\u00e5r begge parter har signert, sender vi Forhåndsbetalingsforesp\u00f8rsel.',
                        '',
                        'Vennlig hilsen',
                        'Helg\u00f8ens Vel'
                    ].join('\n'),
                    html,
                });
                context.info(`approveBooking: Approval email sent to ${existingBooking.requesterEmail}`);

                // --- SMS til leietaker ved godkjenning ---
                if (existingBooking.phone) {
                    const smsSigningToken = existingBooking.smsSigningToken || deriveSmsSigningToken(existingBooking.signingToken);
                    const smsContractLink = smsSigningToken
                        ? `${websiteUrl}/leieavtale.html?id=${encodeURIComponent(existingBooking.id)}&signingToken=${encodeURIComponent(smsSigningToken)}`
                        : contractLink;
                    const approvalSmsBody = buildSmsMessage('customer.bookingApproved', {
                        requesterName: existingBooking.requesterName,
                        date: existingBooking.date,
                        contractLink: smsContractLink,
                    });
                    await sendSms({ to: existingBooking.phone, body: approvalSmsBody }, context);
                }
            }
        } catch (error) {
            context.error('approveBooking: Failed to send booking approval email', {
                error: error.message,
                stack: error.stack,
                bookingId: id
            });
        }

        if (isApiRequest) {
            return createJsonResponse(200, { message: 'Booking approved successfully.' }, request);
        }
        return createHtmlResponse(200, '<p>Booking er nå godkjent og bekreftelse med kontraktlenke er sendt til forespørrer.</p>', request);
    },
});
