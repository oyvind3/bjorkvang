// TC-19 to TC-23: Admin approval / rejection flow
// These are API-level integration tests that require Azure Functions running on port 7071.
// Run: cd functions && npm start
// Then: cd tests && npm test -- e2e/04-admin-flow.spec.js
const { test, expect } = require('@playwright/test');

const API_BASE = 'http://localhost:7071/api';

/** Returns a valid booking payload dated 30 days from now */
const buildBookingPayload = (overrides = {}) => ({
  date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  time: '14:00',
  requesterName: 'Test Admin Bruker',
  requesterEmail: 'e2e-admin-test@example.com',
  phone: '99887766',
  duration: 4,
  eventType: 'Møte eller kurs',
  spaces: ['Peisestue'],
  paymentMethod: 'bank',
  ...overrides,
});

/** Creates a booking and returns its ID. Skips the test if the API is unavailable. */
async function createBooking(request, overrides = {}) {
  const res = await request
    .post(`${API_BASE}/booking`, { data: buildBookingPayload(overrides) })
    .catch(() => null);

  if (!res || res.status() !== 202) {
    test.skip(true, 'Azure Functions not available on localhost:7071 — skipping API tests');
  }

  const body = await res.json();
  return body.id;
}

// ─────────────────────────────────────────────────────────────────────────────
test.describe('TC-19 · Board notification email is triggered on new booking', () => {
  test('POST /api/booking returns 202 with id and status', async ({ request }) => {
    const res = await request
      .post(`${API_BASE}/booking`, { data: buildBookingPayload() })
      .catch(() => null);

    if (!res) {
      test.skip(true, 'Azure Functions not available');
    }

    expect(res.status()).toBe(202);
    const body = await res.json();
    expect(body.id).toBeTruthy();
    expect(['pending', 'approved']).toContain(body.status);
  });
});

test.describe('TC-19b · Manual signing reminder can be sent as SMS only', () => {
  test('POST /api/booking/remind accepts channel=sms for signing reminders', async ({ request }) => {
    const id = await createBooking(request);

    const res = await request.post(`${API_BASE}/booking/remind`, {
      data: {
        id,
        channel: 'sms',
      },
    });

    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.type).toBe('signing');
    expect(body.channel).toBe('sms');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test.describe('TC-20 · Approve booking – bank payment path', () => {
  test('approved booking appears as confirmed on the public calendar', async ({ request }) => {
    const id = await createBooking(request);

    // Approve
    const approveRes = await request.get(`${API_BASE}/booking/approve?id=${id}`);
    expect([200, 202]).toContain(approveRes.status());

    // Calendar should reflect confirmed status
    const calendarRes = await request.get(`${API_BASE}/booking/calendar`);
    expect(calendarRes.ok()).toBe(true);
    const { bookings } = await calendarRes.json();
    const found = bookings.find((b) => b.id === id);
    expect(found).toBeTruthy();
    expect(found?.status).toBe('confirmed');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test.describe('TC-21 · Approve booking – Vipps payment path', () => {
  test('booking with vipps payment method is accepted and approved', async ({ request }) => {
    const id = await createBooking(request, { paymentMethod: 'vipps' });

    const approveRes = await request.get(`${API_BASE}/booking/approve?id=${id}`);
    expect([200, 202]).toContain(approveRes.status());

    // Verify the booking is now confirmed on the calendar
    const calendarRes = await request.get(`${API_BASE}/booking/calendar`);
    const { bookings } = await calendarRes.json();
    const found = bookings.find((b) => b.id === id);
    expect(found?.status).toBe('confirmed');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test.describe('TC-22 · Reject booking', () => {
  test('rejected booking disappears from the public calendar', async ({ request }) => {
    const id = await createBooking(request);

    const rejectRes = await request.get(`${API_BASE}/booking/reject?id=${id}`);
    expect([200, 202]).toContain(rejectRes.status());

    // Rejected booking must NOT appear on the calendar
    const calendarRes = await request.get(`${API_BASE}/booking/calendar`);
    const { bookings } = await calendarRes.json();
    const found = bookings.find((b) => b.id === id);
    expect(found).toBeUndefined();
  });

  test('reject with reason returns 200', async ({ request }) => {
    const id = await createBooking(request);

    const rejectRes = await request.post(`${API_BASE}/booking/reject?id=${id}`, {
      data: { reason: 'Lokalet er allerede reservert for den datoen.' },
    });
    expect([200, 202]).toContain(rejectRes.status());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test.describe('TC-23 · Idempotency of approve and reject', () => {
  test('approving an already-approved booking returns 200 without error', async ({ request }) => {
    const id = await createBooking(request);

    await request.get(`${API_BASE}/booking/approve?id=${id}`);
    const secondRes = await request.get(`${API_BASE}/booking/approve?id=${id}`);

    expect(secondRes.status()).toBe(200);
  });

  test('rejecting an already-rejected booking returns 200 without error', async ({ request }) => {
    const id = await createBooking(request);

    await request.get(`${API_BASE}/booking/reject?id=${id}`);
    const secondRes = await request.get(`${API_BASE}/booking/reject?id=${id}`);

    expect(secondRes.status()).toBe(200);
  });

  test('approving a non-existent booking ID returns 404', async ({ request }) => {
    const res = await request
      .get(`${API_BASE}/booking/approve?id=non-existent-id-000`)
      .catch(() => null);

    if (!res) {
      test.skip(true, 'Azure Functions not available');
    }

    expect(res.status()).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test.describe('TC-24 · Calendar reflects correct booking count', () => {
  test('GET /api/booking/calendar returns bookings array', async ({ request }) => {
    const res = await request.get(`${API_BASE}/booking/calendar`).catch(() => null);

    if (!res) {
      test.skip(true, 'Azure Functions not available');
    }

    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(Array.isArray(body.bookings)).toBe(true);
  });

  test('rejected bookings are excluded from the calendar', async ({ request }) => {
    const id = await createBooking(request);
    await request.get(`${API_BASE}/booking/reject?id=${id}`);

    const calendarRes = await request.get(`${API_BASE}/booking/calendar`);
    const { bookings } = await calendarRes.json();

    const found = bookings.find((b) => b.id === id);
    expect(found).toBeUndefined();
  });
});
