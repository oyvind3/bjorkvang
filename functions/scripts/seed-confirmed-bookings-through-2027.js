#!/usr/bin/env node

/**
 * Add the confirmed blocked dates through 2027 to the booking API.
 *
 * Dry run (reads the public calendar only):
 *   node functions/scripts/seed-confirmed-bookings-through-2027.js
 *
 * Write to production:
 *   ADMIN_KEY=... node functions/scripts/seed-confirmed-bookings-through-2027.js --post
 *
 * API_BASE can override the default production API root. The script is
 * idempotent: confirmed coverage is skipped, and an earlier matching pending
 * seed is approved instead of being created again.
 */

const {
  dates,
  bookingCoversDate,
  buildAdminPayload,
} = require('../../confirmed-blocked-dates');

const DEFAULT_API_BASE = 'https://bjorkvang-duhsaxahgfe0btgv.westeurope-01.azurewebsites.net/api';

const exactPendingSeed = (bookings, item) => bookings.find((booking) =>
  booking.status === 'pending'
  && booking.date === item.date
  && booking.time === '10:00'
  && Number(booking.duration) === 12
);

async function fetchCalendar(apiBase, fetchImpl = fetch) {
  const response = await fetchImpl(`${apiBase}/booking/calendar`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Kalender-API svarte ${response.status}.`);
  }
  const data = await response.json();
  return Array.isArray(data.bookings) ? data.bookings : [];
}

async function approveBooking(apiBase, id, adminKey, fetchImpl = fetch) {
  const response = await fetchImpl(`${apiBase}/booking/approve?id=${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Admin-Key': adminKey,
    },
    body: JSON.stringify({ message: '' }),
  });
  if (!response.ok) {
    throw new Error(`Godkjenning av ${id} feilet med ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
}

async function createBooking(apiBase, item, adminKey, fetchImpl = fetch) {
  const response = await fetchImpl(`${apiBase}/booking`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Admin-Key': adminKey,
    },
    body: JSON.stringify(buildAdminPayload(item)),
  });
  if (!response.ok) {
    throw new Error(`Oppretting av ${item.date} feilet med ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  const data = await response.json();
  if (!data.id) throw new Error(`Oppretting av ${item.date} returnerte ingen booking-ID.`);
  return data.id;
}

async function seed({ apiBase, adminKey, post, fetchImpl = fetch }) {
  const existing = await fetchCalendar(apiBase, fetchImpl);
  const result = { existing: [], created: [], resumed: [] };

  for (const item of dates) {
    if (existing.some((booking) => bookingCoversDate(booking, item.date))) {
      result.existing.push(item.date);
      continue;
    }

    const pendingSeed = exactPendingSeed(existing, item);
    if (!post) {
      (pendingSeed ? result.resumed : result.created).push(item.date);
      continue;
    }

    const id = pendingSeed?.id || await createBooking(apiBase, item, adminKey, fetchImpl);
    await approveBooking(apiBase, id, adminKey, fetchImpl);
    (pendingSeed ? result.resumed : result.created).push(item.date);

    existing.push({ id, date: item.date, time: '10:00', duration: 12, status: 'confirmed' });
  }

  return result;
}

const printResult = (result, post) => {
  console.log(`Allerede bekreftet/dekket (${result.existing.length}): ${result.existing.join(', ') || 'ingen'}`);
  console.log(`${post ? 'Opprettet og godkjent' : 'Vil opprette og godkjenne'} (${result.created.length}): ${result.created.join(', ') || 'ingen'}`);
  console.log(`${post ? 'Gjenopptatt og godkjent' : 'Vil gjenoppta og godkjenne'} (${result.resumed.length}): ${result.resumed.join(', ') || 'ingen'}`);
};

async function main() {
  const post = process.argv.includes('--post');
  const apiBase = (process.env.API_BASE || DEFAULT_API_BASE).replace(/\/$/, '');
  const adminKey = process.env.ADMIN_KEY || '';

  if (post && !adminKey) {
    throw new Error('ADMIN_KEY må være satt når --post brukes. Ingen endringer er utført.');
  }

  console.log(`${post ? 'POST' : 'DRY RUN'} mot ${apiBase}`);
  const result = await seed({ apiBase, adminKey, post });
  printResult(result, post);

  if (post) {
    const verified = await fetchCalendar(apiBase);
    const missing = dates.filter((item) => !verified.some((booking) => bookingCoversDate(booking, item.date)));
    if (missing.length) {
      throw new Error(`Verifisering feilet. Ikke bekreftet: ${missing.map(({ date }) => date).join(', ')}`);
    }
    console.log(`Verifisert: alle ${dates.length} datoer er dekket av bekreftede bookinger.`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`FEIL: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  exactPendingSeed,
  fetchCalendar,
  approveBooking,
  createBooking,
  seed,
};
