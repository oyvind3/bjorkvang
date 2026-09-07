const test = require('node:test');
const assert = require('node:assert/strict');

const {
    SITEVERIFY_URL,
    configuredHostnames,
    normaliseHostname,
    verifyTurnstile,
} = require('../shared/turnstile');

const env = {
    TURNSTILE_SECRET: 'test-secret',
    TURNSTILE_HOSTNAMES: 'bjørkvang.no,bjorkvang.org',
};

const request = {
    headers: new Headers({ 'x-forwarded-for': '203.0.113.10, 10.0.0.1' }),
};

test('normalises configured international hostnames to ASCII', () => {
    assert.equal(normaliseHostname('https://Bjørkvang.no/'), 'xn--bjrkvang-64a.no');
    assert.deepEqual(
        [...configuredHostnames(env.TURNSTILE_HOSTNAMES)],
        ['xn--bjrkvang-64a.no', 'bjorkvang.org'],
    );
});

test('accepts success only for the expected action and hostname', async () => {
    let submitted;
    const fetchImpl = async (url, options) => {
        assert.equal(url, SITEVERIFY_URL);
        submitted = options.body;
        return {
            ok: true,
            json: async () => ({
                success: true,
                action: 'booking_request',
                hostname: 'xn--bjrkvang-64a.no',
            }),
        };
    };

    const result = await verifyTurnstile({
        token: 'fresh-token',
        expectedAction: 'booking_request',
        request,
        fetchImpl,
        env,
    });

    assert.equal(result.success, true);
    assert.equal(submitted.get('secret'), 'test-secret');
    assert.equal(submitted.get('response'), 'fresh-token');
    assert.equal(submitted.get('remoteip'), '203.0.113.10');
});

test('rejects missing tokens without calling Siteverify', async () => {
    const result = await verifyTurnstile({
        token: '',
        expectedAction: 'booking_request',
        request,
        fetchImpl: async () => assert.fail('Siteverify must not be called'),
        env,
    });

    assert.equal(result.success, false);
});

test('rejects an unexpected action or hostname', async () => {
    for (const response of [
        { success: true, action: 'donation', hostname: 'xn--bjrkvang-64a.no' },
        { success: true, action: 'booking_request', hostname: 'evil.example' },
    ]) {
        const result = await verifyTurnstile({
            token: 'fresh-token',
            expectedAction: 'booking_request',
            request,
            fetchImpl: async () => ({ ok: true, json: async () => response }),
            env,
        });
        assert.equal(result.success, false);
    }
});
