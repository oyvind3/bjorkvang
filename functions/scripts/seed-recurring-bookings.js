/**
 * Seed recurring and blocked bookings into the system.
 *
 * Groups:
 *  1. Helger opptatt – alle lørdager og søndager fra 18. april 2026 til 31. oktober 2026
 *  2. Pensjonistforeningen – annenhver onsdag (2., 4. onsdag i måneden) unntatt juli og august
 *  3. Lions – mandagen i uke 3 (3. mandag) per måned unntatt juli og august
 *
 * Usage:
 *   node functions/scripts/seed-recurring-bookings.js           (dry-run, lister datoer)
 *   node functions/scripts/seed-recurring-bookings.js --post    (poster til API)
 *
 * Requires API_BASE and ADMIN_KEY environment variables when posting.
 */

const API_BASE = process.env.API_BASE || 'http://localhost:7071/api';
const ADMIN_KEY = process.env.ADMIN_KEY || process.env.ADMIN_TOKEN || '';
const DRY_RUN = !process.argv.includes('--post');

// ─── Helper: format date as YYYY-MM-DD (local time) ─────────────────────────
function fmt(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ─── Helper: get all dates matching a weekday between start and end (inclusive)
// weekday: 0=Sun, 1=Mon, ..., 6=Sat
function datesForWeekday(start, end, weekday) {
    const dates = [];
    const d = new Date(start);
    // Advance to the first matching weekday
    while (d.getDay() !== weekday) d.setDate(d.getDate() + 1);
    while (d <= end) {
        dates.push(new Date(d));
        d.setDate(d.getDate() + 7);
    }
    return dates;
}

// ─── Helper: get the Nth weekday of a given month/year
function nthWeekdayOfMonth(year, month, weekday, n) {
    // month is 0-indexed
    const d = new Date(year, month, 1);
    let count = 0;
    while (d.getMonth() === month) {
        if (d.getDay() === weekday) {
            count++;
            if (count === n) return new Date(d);
        }
        d.setDate(d.getDate() + 1);
    }
    return null;
}

// ─── Helper: get every 2nd Wednesday in a month (2nd and 4th Wednesday)
function evenWednesdaysInMonth(year, month) {
    const results = [];
    const d = new Date(year, month, 1);
    let count = 0;
    while (d.getMonth() === month) {
        if (d.getDay() === 3) { // Wednesday
            count++;
            if (count % 2 === 0) results.push(new Date(d)); // 2nd, 4th
        }
        d.setDate(d.getDate() + 1);
    }
    return results;
}

// ─── Build booking list ───────────────────────────────────────────────────────

const bookings = [];

// 1. Helger opptatt (lørdager + søndager) fra 18. april t.o.m 31. oktober 2026
const helgerStart = new Date('2026-04-18');
const helgerEnd = new Date('2026-10-31');

const saturdays = datesForWeekday(helgerStart, helgerEnd, 6); // Saturday
const sundays = datesForWeekday(helgerStart, helgerEnd, 0);   // Sunday

[...saturdays, ...sundays].forEach(d => {
    bookings.push({
        date: fmt(d),
        time: '10:00',
        duration: 12,
        requesterName: 'Opptatt (blokkert)',
        requesterEmail: 'styret@bjorkvang.org',
        phone: '00000000',
        eventType: 'Annet',
        spaces: ['Hele lokalet'],
        services: [],
        paymentMethod: 'bank',
        message: 'Automatisk blokkert – helg opptatt',
        source: 'admin-seed',
        status: 'approved',
    });
});

// 2. Pensjonistforeningen – 2. og 4. onsdag per måned, unntatt juli (6) og august (7)
// Aktive måneder: april–juni, september–desember 2026
const pensjonistMåneder = [
    [2026, 3],  // April
    [2026, 4],  // May
    [2026, 5],  // June
    [2026, 8],  // September
    [2026, 9],  // October
    [2026, 10], // November
    [2026, 11], // December
];

pensjonistMåneder.forEach(([year, month]) => {
    evenWednesdaysInMonth(year, month).forEach(d => {
        bookings.push({
            date: fmt(d),
            time: '17:00',
            duration: 3,
            requesterName: 'Pensjonistforeningen',
            requesterEmail: 'styret@bjorkvang.org',
            phone: '00000000',
            eventType: 'Møte eller kurs',
            spaces: ['Hele lokalet'],
            services: [],
            paymentMethod: 'bank',
            message: 'Fast booking – Pensjonistforeningen (annenhver onsdag)',
            source: 'admin-seed',
            status: 'approved',
        });
    });
});

// 3. Lions – 3. mandag per måned, unntatt juli og august
const lionsMåneder = pensjonistMåneder; // Same active months

lionsMåneder.forEach(([year, month]) => {
    const d = nthWeekdayOfMonth(year, month, 1, 3); // 3rd Monday
    if (d) {
        bookings.push({
            date: fmt(d),
            time: '19:00',
            duration: 3,
            requesterName: 'Lions',
            requesterEmail: 'styret@bjorkvang.org',
            phone: '00000000',
            eventType: 'Møte eller kurs',
            spaces: ['Hele lokalet'],
            services: [],
            paymentMethod: 'bank',
            message: 'Fast booking – Lions (3. mandag per måned)',
            source: 'admin-seed',
            status: 'approved',
        });
    }
});

// Sort by date
bookings.sort((a, b) => a.date.localeCompare(b.date));

// ─── Output / Post ────────────────────────────────────────────────────────────

if (DRY_RUN) {
    console.log(`\n=== DRY RUN – ${bookings.length} bookinger vil bli opprettet ===\n`);

    const groups = {
        helger: bookings.filter(b => b.message.includes('helg opptatt')),
        pensjonist: bookings.filter(b => b.message.includes('Pensjonistforeningen')),
        lions: bookings.filter(b => b.message.includes('Lions')),
    };

    console.log(`Helger (lør+søn):        ${groups.helger.length} datoer`);
    groups.helger.forEach(b => console.log(`  ${b.date}`));

    console.log(`\nPensjonistforeningen:    ${groups.pensjonist.length} onsdager`);
    groups.pensjonist.forEach(b => console.log(`  ${b.date}`));

    console.log(`\nLions:                   ${groups.lions.length} mandager`);
    groups.lions.forEach(b => console.log(`  ${b.date}`));

    console.log('\nKjør med --post for å sende til API.');
} else {
    (async () => {
        if (!ADMIN_KEY) {
            throw new Error('ADMIN_KEY må være satt når --post brukes. Ingen endringer er utført.');
        }

        console.log(`Poster ${bookings.length} bookinger til ${API_BASE} ...`);
        let ok = 0, fail = 0;
        for (const b of bookings) {
            try {
                // Step 1: Create booking (will be 'pending' from the API)
                const res = await fetch(`${API_BASE}/booking`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'X-Admin-Key': ADMIN_KEY,
                    },
                    body: JSON.stringify({
                        ...b,
                        adminCreated: true,
                        sendConfirmationEmail: false,
                    }),
                });
                if (!res.ok) {
                    const err = await res.text();
                    console.warn(`\nFEIL oppretting ${b.date}: ${res.status} – ${err.slice(0, 120)}`);
                    fail++;
                    continue;
                }
                const created = await res.json();
                const bookingId = created.id || created.booking?.id;
                if (!bookingId) {
                    console.warn(`\nFEIL ${b.date}: Ingen ID i svar – ${JSON.stringify(created).slice(0, 120)}`);
                    fail++;
                    continue;
                }

                // Step 2: Immediately approve so it shows as 'Reservert' in calendar
                const approveRes = await fetch(`${API_BASE}/booking/approve?id=${encodeURIComponent(bookingId)}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'X-Admin-Key': ADMIN_KEY,
                    },
                    body: JSON.stringify({ message: '' }),
                });
                if (approveRes.ok) {
                    ok++;
                    process.stdout.write('.');
                } else {
                    const err = await approveRes.text();
                    console.warn(`\nFEIL godkjenning ${b.date} (id=${bookingId}): ${approveRes.status} – ${err.slice(0, 120)}`);
                    fail++;
                }
            } catch (e) {
                console.warn(`\nFEIL ${b.date}: ${e.message}`);
                fail++;
            }
        }
        console.log(`\n\nFerdig: ${ok} OK, ${fail} feil.`);
    })();
}
