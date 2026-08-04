// Max 11 chars, ASCII only (A-Za-z0-9) — Norwegian Ø/Æ/Å are not allowed in Twilio sender IDs
const SENDER_ID = process.env.SMS_SENDER_ID || 'Bjorkvang';
const SMS_MAX_LENGTH = 160;
const SMS_SIGNATURE = '– Bjorkvang';

const MONTHS_NB = ['januar','februar','mars','april','mai','juni','juli','august','september','oktober','november','desember'];

/**
 * Format a YYYY-MM-DD date string to a short Norwegian date, e.g. "30. mai".
 * Falls back to the raw string if parsing fails.
 * @param {string} dateStr
 * @returns {string}
 */
const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const parts = String(dateStr).split('-');
    if (parts.length < 3) return dateStr;
    const day = parseInt(parts[2], 10);
    const monthIdx = parseInt(parts[1], 10) - 1;
    if (isNaN(day) || isNaN(monthIdx) || monthIdx < 0 || monthIdx > 11) return dateStr;
    return `${day}. ${MONTHS_NB[monthIdx]}`;
};

const normalizeWhitespace = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const formatAmountNOK = (amountNOK) => {
    const amount = Number(amountNOK);
    if (!Number.isFinite(amount) || amount <= 0) return '';
    return `kr ${Math.round(amount).toLocaleString('nb-NO')}`;
};

const firstName = (fullName) => {
    const name = normalizeWhitespace(fullName);
    return name ? name.split(' ')[0] : 'deg';
};

const shortRef = (bookingId) => {
    const cleaned = String(bookingId || '').replace(/[^a-zA-Z0-9]/g, '');
    return cleaned ? cleaned.slice(0, 8).toUpperCase() : '';
};

const hardLimit = (text, maxLength = SMS_MAX_LENGTH) => {
    const normalized = normalizeWhitespace(text);
    if (normalized.length <= maxLength) return normalized;
    if (maxLength <= 1) return normalized.slice(0, maxLength);
    return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
};

/**
 * Keep SMS under 160 chars with deterministic fallbacks.
 * @param {string[]} candidates Ordered from best to shortest.
 * @param {number} [maxLength]
 */
const enforceSms160 = (candidates, maxLength = SMS_MAX_LENGTH) => {
    const list = Array.isArray(candidates) ? candidates : [candidates];
    for (const candidate of list) {
        const text = normalizeWhitespace(candidate);
        if (text.length <= maxLength) {
            return text;
        }
    }
    return hardLimit(list[list.length - 1] || '', maxLength);
};

/**
 * Centralized SMS copy with warm, professional Norwegian tone.
 * Every template is guaranteed <= 160 chars.
 */
const buildSmsMessage = (type, vars = {}) => {
    const fName = firstName(vars.firstName || vars.requesterName);
    const date = formatDate(vars.date || '');
    const amount = formatAmountNOK(vars.amountNOK);
    const ref = shortRef(vars.bookingId);
    const eventType = normalizeWhitespace(vars.eventType || 'Reservasjon');
    const requester = normalizeWhitespace(vars.requesterName || 'Kunde');
    const attendees = Number.isFinite(Number(vars.attendees)) ? Number(vars.attendees) : null;
    const contractLink = normalizeWhitespace(vars.contractLink || '');
    const adminLink = normalizeWhitespace(vars.adminLink || '');
    const bankAccount = normalizeWhitespace(vars.bankAccount || '');

    switch (type) {
        case 'admin.newBooking': {
            const c1 = `Ny forespørsel: ${requester}, ${date} (${eventType})${attendees != null ? `, ${attendees} gjester` : ''}. Godkjenn i admin. ${SMS_SIGNATURE}`;
            const c2 = `Ny forespørsel: ${requester}, ${date}. Godkjenn i admin. ${SMS_SIGNATURE}`;
            return enforceSms160([c1, c2]);
        }
        case 'admin.tenantSigned': {
            const c1 = adminLink
                ? `Leieavtale signert av ${requester}, ${date}. Signer som utleier: ${adminLink} ${SMS_SIGNATURE}`
                : `Leieavtale signert av ${requester}, ${date}. Sjekk admin for signering. ${SMS_SIGNATURE}`;
            const c2 = adminLink
                ? `Signer som utleier: ${adminLink} ${SMS_SIGNATURE}`
                : c1;
            const c3 = `Leieavtale signert av ${requester}, ${date}. Sjekk admin for signering. ${SMS_SIGNATURE}`;
            return enforceSms160([c1, c2, c3]);
        }
        case 'admin.depositPaid': {
            const amountPart = amount ? `, ${amount}` : '';
            return enforceSms160([`Depositum mottatt: ${requester}, ${date}${amountPart}. ${SMS_SIGNATURE}`]);
        }
        case 'admin.paymentReceived': {
            const amountPart = amount ? `, ${amount}` : '';
            return enforceSms160([`Betaling mottatt: ${requester}, ${date}${amountPart}. Booking aktiv. ${SMS_SIGNATURE}`]);
        }
        case 'customer.bookingReceived': {
            const c1 = `Hei ${fName}! Vi har mottatt leieforespørselen for ${date}. Vi svarer deg snart. ${SMS_SIGNATURE}`;
            const c2 = `Hei ${fName}! Forespørselen for ${date} er mottatt. Vi svarer snart. ${SMS_SIGNATURE}`;
            return enforceSms160([c1, c2]);
        }
        case 'customer.depositReadyVipps': {
            const amountPart = amount ? `${amount} ` : '';
            const c1 = `Hei ${fName}! Avtalen er signert. Forhåndsbetaling ${amountPart}for ${date} er klar. Sjekk e-post for Vipps-lenke. ${SMS_SIGNATURE}`;
            const c2 = `Hei ${fName}! Forhåndsbetaling ${amountPart}for ${date} er klar. Sjekk e-post for Vipps-lenke. ${SMS_SIGNATURE}`;
            return enforceSms160([c1, c2]);
        }
        case 'customer.depositReadyBank': {
            const amountPart = amount ? `${amount} ` : '';
            const refPart = ref ? ` Ref: ${ref}.` : '';
            const c1 = `Hei ${fName}! Betal forhåndsbetaling ${amountPart}for ${date} til ${bankAccount}.${refPart} ${SMS_SIGNATURE}`;
            const c2 = `Hei ${fName}! Betal forhåndsbetaling ${amountPart}for ${date}. Se e-post for kontonummer og referanse. ${SMS_SIGNATURE}`;
            return enforceSms160([c1, c2]);
        }
        case 'customer.bookingApproved': {
            const c1 = `Hei ${fName}! Bookingen ${date} er godkjent. Signer leieavtalen her: ${contractLink} ${SMS_SIGNATURE}`;
            const c2 = `Hei ${fName}! Bookingen ${date} er godkjent. Signer avtalen via lenken i e-posten. ${SMS_SIGNATURE}`;
            return enforceSms160([c1, c2]);
        }
        case 'customer.reminderSigning': {
            const c1 = `Hei ${fName}! Påminnelse: Leieavtalen for ${date} mangler signatur. Signer her: ${contractLink} ${SMS_SIGNATURE}`;
            const c2 = `Hei ${fName}! Påminnelse: Leieavtalen for ${date} mangler signatur. Bruk lenken i e-posten. ${SMS_SIGNATURE}`;
            return enforceSms160([c1, c2]);
        }
        case 'customer.reminderDepositVipps': {
            const amountPart = amount ? ` ${amount}` : '';
            return enforceSms160([
                `Hei ${fName}! Påminnelse: Forhåndsbetaling${amountPart} for ${date} er ikke betalt. Sjekk e-post for Vipps-lenke. ${SMS_SIGNATURE}`
            ]);
        }
        case 'customer.reminderDepositBank': {
            const amountPart = amount ? ` ${amount}` : '';
            const refPart = ref ? ` Ref: ${ref}.` : '';
            const c1 = `Hei ${fName}! Påminnelse: Betal forhåndsbetaling${amountPart} for ${date} til ${bankAccount}.${refPart} ${SMS_SIGNATURE}`;
            const c2 = `Hei ${fName}! Påminnelse: Forhåndsbetaling for ${date} mangler. Se betalingsinfo i e-post. ${SMS_SIGNATURE}`;
            return enforceSms160([c1, c2]);
        }
        case 'customer.reminderFinalVipps': {
            const amountPart = amount ? ` ${amount}` : '';
            return enforceSms160([
                `Hei ${fName}! Påminnelse: Sluttfaktura${amountPart} for ${date} er ikke betalt. Sjekk e-post for Vipps-lenke. ${SMS_SIGNATURE}`
            ]);
        }
        case 'customer.reminderFinalBank': {
            const amountPart = amount ? ` ${amount}` : '';
            const refPart = ref ? ` Ref: ${ref}.` : '';
            const c1 = `Hei ${fName}! Påminnelse: Betal sluttfaktura${amountPart} for ${date} til ${bankAccount}.${refPart} ${SMS_SIGNATURE}`;
            const c2 = `Hei ${fName}! Påminnelse: Sluttfaktura for ${date} mangler. Se betalingsinfo i e-post. ${SMS_SIGNATURE}`;
            return enforceSms160([c1, c2]);
        }
        case 'customer.finalInvoiceVipps': {
            return enforceSms160([
                `Hei ${fName}! Sluttfaktura for ${date}${amount ? `: ${amount}` : ''}. Sjekk e-post for Vipps-lenke. ${SMS_SIGNATURE}`
            ]);
        }
        case 'customer.finalInvoiceBank': {
            const refPart = ref ? ` Ref: ${ref}.` : '';
            const c1 = `Hei ${fName}! Sluttfaktura for ${date}${amount ? `: ${amount}` : ''}. Betal til ${bankAccount}.${refPart} ${SMS_SIGNATURE}`;
            const c2 = `Hei ${fName}! Sluttfaktura for ${date}${amount ? `: ${amount}` : ''}. Se betalingsinfo i e-post. ${SMS_SIGNATURE}`;
            return enforceSms160([c1, c2]);
        }
        case 'customer.rejected': {
            return enforceSms160([
                `Hei ${fName}. Leieforespørselen for ${date} ble dessverre ikke godkjent. Ta kontakt hvis du ønsker en ny dato. ${SMS_SIGNATURE}`
            ]);
        }
        default:
            return enforceSms160([normalizeWhitespace(vars.body || '')]);
    }
};

/**
 * Normalize a Norwegian phone number to E.164 (+47XXXXXXXX).
 * Cosmos DB stores phone numbers stripped of the country code.
 * @param {string} phone
 * @returns {string|null}
 */
const normalizeNorwegianPhone = (phone) => {
    if (!phone) return null;
    // Strip all whitespace and dashes
    const stripped = String(phone).replace(/[\s\-]/g, '');
    // Already in E.164 format
    if (/^\+47\d{8}$/.test(stripped)) return stripped;
    // Strip any existing country code prefix
    const digits = stripped.replace(/^(?:\+?47|0047)/, '');
    if (!/^\d{8}$/.test(digits)) return null;
    return `+47${digits}`;
};

/**
 * Send an SMS via Twilio.
 * Never throws — SMS failures are logged but must not block the booking flow.
 * @param {{ to: string; body: string; }} options
 * @param {object} [context] Azure Function context for logging
 * @returns {Promise<{ messageId: string }|null>}
 */
const sendSms = async (options, context = console) => {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
        context.warn('sendSms: TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN not set. Skipping SMS.');
        return null;
    }

    const to = normalizeNorwegianPhone(options.to);
    if (!to) {
        context.warn(`sendSms: Invalid phone number "${options.to}". Skipping SMS.`);
        return null;
    }

    if (!options.body || !options.body.trim()) {
        context.warn('sendSms: Empty body. Skipping SMS.');
        return null;
    }

    const body = normalizeWhitespace(options.body);

    try {
        const twilio = require('twilio');
        const client = twilio(accountSid, authToken);
        const message = await client.messages.create({
            from: SENDER_ID,
            to,
            body,
        });
        context.info(`sendSms: SMS sent to ${to}, SID ${message.sid}`);
        return { messageId: message.sid };
    } catch (error) {
        context.error('sendSms: Failed to send SMS', {
            to,
            error: error.message,
            code: error.code,
        });
        return null;
    }
};

module.exports = {
    SMS_MAX_LENGTH,
    buildSmsMessage,
    enforceSms160,
    sendSms,
    normalizeNorwegianPhone,
    formatDate,
    formatAmountNOK,
    sendSmsToAdminGroup
};

/**
 * Send an SMS to all active admin contacts stored in Cosmos DB.
 * Falls back to BOARD_PHONE_NUMBER env var if no contacts found (local dev).
 * Never throws — failures are logged per recipient.
 * @param {string} body  Message text
 * @param {object} [context]  Azure Function context for logging
 */
async function sendSmsToAdminGroup(body, context = console) {
    const { listAdminContacts } = require('./cosmosDb');
    let contacts = [];
    try {
        contacts = await listAdminContacts();
    } catch (err) {
        context.warn('sendSmsToAdminGroup: Failed to fetch admin contacts, falling back to BOARD_PHONE_NUMBER', { error: err.message });
    }

    if (!contacts.length) {
        const fallback = process.env.BOARD_PHONE_NUMBER;
        if (fallback) {
            context.info('sendSmsToAdminGroup: No DB contacts found, using BOARD_PHONE_NUMBER fallback');
            await sendSms({ to: fallback, body }, context);
        } else {
            context.warn('sendSmsToAdminGroup: No admin contacts and no BOARD_PHONE_NUMBER set. Skipping admin SMS.');
        }
        return;
    }

    context.info(`sendSmsToAdminGroup: Sending to ${contacts.length} admin contact(s)`);
    await Promise.allSettled(
        contacts.map((c) => sendSms({ to: c.phone, body }, context))
    );
}
