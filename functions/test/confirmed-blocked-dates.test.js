const test = require('node:test');
const assert = require('node:assert/strict');

const confirmedBookings = require('../../confirmed-blocked-dates');
const bookingStore = require('../shared/bookingStore');

test('confirmed blocked dates are unique, sorted and end in 2027', () => {
  const values = confirmedBookings.dates.map(({ date }) => date);

  assert.equal(values.length, 20);
  assert.deepEqual(values, [...new Set(values)]);
  assert.deepEqual(values, [...values].sort());
  assert.ok(values.every((date) => date <= '2027-12-31'));
});

test('existing multi-day Basar covers both 7 and 8 November 2026', () => {
  const existing = [{
    date: '2026-11-07',
    time: '12:00',
    duration: 36,
    status: 'confirmed',
  }];

  const missing = confirmedBookings.missingConfirmedDates(existing).map(({ date }) => date);

  assert.equal(missing.length, 18);
  assert.ok(!missing.includes('2026-11-07'));
  assert.ok(!missing.includes('2026-11-08'));
});

test('a pending booking does not replace a newly confirmed blocked date', () => {
  const pending = [{
    date: '2027-05-28',
    time: '15:00',
    duration: 23,
    status: 'pending',
  }];

  assert.equal(confirmedBookings.bookingCoversDate(pending[0], '2027-05-29'), false);
});

test('admin blocked booking can be stored without contact information', () => {
  const item = confirmedBookings.dates.find(({ date }) => date === '2027-03-06');
  const payload = confirmedBookings.buildAdminPayload(item);
  const stored = bookingStore.createBooking(payload);

  assert.equal(stored.requesterName, 'Opptatt');
  assert.equal(stored.requesterEmail, '');
  assert.equal(stored.phone, undefined);
  assert.equal(stored.date, '2027-03-06');
});
