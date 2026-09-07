const { domainToASCII } = require('node:url');

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const MAX_TOKEN_LENGTH = 2048;

const normaliseHostname = (value) => {
    const hostname = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/\/$/, '')
        .split('/')[0]
        .split(':')[0];
    return domainToASCII(hostname);
};

const configuredHostnames = (value) => new Set(
    String(value || '')
        .split(',')
        .map(normaliseHostname)
        .filter(Boolean)
);

const getClientIp = (request) => {
    const forwarded = request?.headers?.get?.('x-forwarded-for') || '';
    return forwarded.split(',')[0].trim();
};

/**
 * Canonically redeem and validate one Cloudflare Turnstile token.
 * Tokens are single-use; callers must reset the frontend widget before retry.
 */
const verifyTurnstile = async ({
    token,
    expectedAction,
    request,
    context,
    fetchImpl = fetch,
    env = process.env,
}) => {
    const secret = String(env.TURNSTILE_SECRET || '').trim();
    const expectedHostnames = configuredHostnames(env.TURNSTILE_HOSTNAMES);

    if (
        typeof token !== 'string'
        || token.length === 0
        || token.length > MAX_TOKEN_LENGTH
        || !secret
        || expectedHostnames.size === 0
    ) {
        return { success: false, reason: 'invalid-configuration-or-token' };
    }

    const body = new URLSearchParams({
        secret,
        response: token,
    });
    const clientIp = getClientIp(request);
    if (clientIp) body.set('remoteip', clientIp);

    let result;
    try {
        const response = await fetchImpl(SITEVERIFY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            signal: AbortSignal.timeout(10_000),
            body,
        });
        if (!response.ok) throw new Error(`siteverify ${response.status}`);
        result = await response.json();
    } catch (error) {
        context?.warn?.('Turnstile Siteverify request failed', { error: error.message });
        return { success: false, reason: 'siteverify-request-failed' };
    }

    const hostname = normaliseHostname(result.hostname);
    if (
        result.success !== true
        || result.action !== expectedAction
        || !expectedHostnames.has(hostname)
    ) {
        return {
            success: false,
            reason: 'siteverify-validation-failed',
            errorCodes: Array.isArray(result['error-codes']) ? result['error-codes'] : [],
        };
    }

    return { success: true, hostname };
};

module.exports = {
    SITEVERIFY_URL,
    configuredHostnames,
    getClientIp,
    normaliseHostname,
    verifyTurnstile,
};
