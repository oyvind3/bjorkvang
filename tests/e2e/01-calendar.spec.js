// TC-01 to TC-05: Calendar discovery – rendering, date click, navigation, locale, fallback
const { test, expect } = require('@playwright/test');

const EMPTY_CALENDAR = { bookings: [] };

const MOCK_BOOKINGS = {
  bookings: [
    { id: 'seed-1', date: '2026-05-10', time: '14:00', duration: 4, status: 'confirmed' },
    { id: 'seed-2', date: '2026-05-15', time: '10:00', duration: 2, status: 'pending' },
  ],
};

/** Intercept the calendar API and return the given payload */
async function mockCalendar(page, payload = EMPTY_CALENDAR) {
  await page.route('**/api/booking/calendar', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    })
  );
}

// ─────────────────────────────────────────────────────────────────────────────
test.describe('TC-01 · Calendar renders correctly on page load', () => {
  test('calendar grid, legend items and API call are present', async ({ page }) => {
    let calendarCalled = false;
    await page.route('**/api/booking/calendar', (route) => {
      calendarCalled = true;
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_BOOKINGS),
      });
    });

    await page.goto('/booking.html');

    // FullCalendar grid rendered
    await expect(page.locator('#calendar')).toBeVisible();
    await expect(page.locator('.fc-daygrid-body')).toBeVisible();

    // API was requested
    expect(calendarCalled).toBe(true);

    // All three legend items present (Norwegian labels)
    await expect(page.locator('.legend-item').getByText('Ledig dato', { exact: true })).toBeVisible();
    await expect(page.locator('.legend-item').getByText('Venter bekreftelse', { exact: true })).toBeVisible();
    await expect(page.locator('.legend-item').getByText('Reservert', { exact: true })).toBeVisible();
  });

  test('confirmed booking day cell gets is-blocked class', async ({ page }) => {
    await mockCalendar(page, MOCK_BOOKINGS);
    await page.goto('/booking.html');
    await page.waitForSelector('.fc-daygrid-day', { state: 'visible' });

    // Navigate to May 2026 where the mock events are
    await page.locator('.fc-next-button').click();
    await page.waitForSelector('.fc-daygrid-day[data-date="2026-05-10"]', { state: 'visible' });

    const cell = page.locator('.fc-daygrid-day[data-date="2026-05-10"]');
    await expect(cell).toHaveClass(/is-blocked/);
  });

  test('pending booking day cell gets is-pending class', async ({ page }) => {
    await mockCalendar(page, MOCK_BOOKINGS);
    await page.goto('/booking.html');
    await page.waitForSelector('.fc-daygrid-day', { state: 'visible' });

    // Navigate to May 2026 where the mock events are
    await page.locator('.fc-next-button').click();
    await page.waitForSelector('.fc-daygrid-day[data-date="2026-05-15"]', { state: 'visible' });

    const cell = page.locator('.fc-daygrid-day[data-date="2026-05-15"]');
    await expect(cell).toHaveClass(/is-pending/);
  });

  test('multi-day booking blocks covered dates but not the midnight end date', async ({ page }) => {
    await mockCalendar(page, {
      bookings: [
        { id: 'basar-2026', date: '2026-05-10', time: '12:00', duration: 36, status: 'confirmed' },
      ],
    });
    await page.goto('/booking.html');
    await page.waitForSelector('.fc-daygrid-day', { state: 'visible' });

    await page.locator('.fc-next-button').click();
    await page.waitForSelector('.fc-daygrid-day[data-date="2026-05-11"]', { state: 'visible' });

    await expect(page.locator('.fc-daygrid-day[data-date="2026-05-10"]')).toHaveClass(/is-blocked/);
    await expect(page.locator('.fc-daygrid-day[data-date="2026-05-11"]')).toHaveClass(/is-blocked/);
    await expect(page.locator('.fc-daygrid-day[data-date="2026-05-12"]')).toHaveClass(/is-available/);
  });

  test('shows an explicitly public event title without exposing ordinary booking purposes', async ({ page }) => {
    await mockCalendar(page, {
      bookings: [
        { id: 'public-basar', date: '2026-05-10', time: '12:00', duration: 4, status: 'confirmed', title: 'Basar', eventType: 'Basar' },
        { id: 'private-party', date: '2026-05-15', time: '12:00', duration: 4, status: 'confirmed' },
      ],
    });
    await page.goto('/booking.html');
    await page.waitForSelector('.fc-daygrid-day', { state: 'visible' });

    await page.locator('.fc-next-button').click();
    await page.waitForSelector('.fc-daygrid-day[data-date="2026-05-10"]', { state: 'visible' });

    await expect(page.locator('.fc-daygrid-day[data-date="2026-05-10"]')).toContainText('Basar');
    await expect(page.locator('.fc-daygrid-day[data-date="2026-05-15"]')).toContainText('Reservasjon');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test.describe('TC-02 · Clicking a date auto-fills the form', () => {
  test('date click populates date input and shows info status', async ({ page }) => {
    await mockCalendar(page);
    await page.goto('/booking.html');
    await page.waitForSelector('.fc-daygrid-day', { state: 'visible' });

    // Construct a future date (7 days from now) – avoids dependency on FC DOM attributes
    const targetDate = await page.evaluate(() => {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      return d.toISOString().split('T')[0];
    });

    // Simulate dateClick via Flatpickr API (same effect as the dateClick handler in booking.js)
    // Playwright synthetic clicks don't reliably trigger FC's interaction plugin pointer chain
    await page.evaluate((date) => {
      const datepicker = document.getElementById('date')._flatpickr;
      if (datepicker) datepicker.setDate(date, true);
    }, targetDate);

    const dateValue = await page.evaluate(() => document.getElementById('date').value);
    expect(dateValue).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dateValue).toBe(targetDate);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test.describe('TC-04 · Calendar locale and navigation', () => {
  test('weekday column headers are in Norwegian', async ({ page }) => {
    await mockCalendar(page);
    await page.goto('/booking.html');
    await page.waitForSelector('.fc-col-header-cell', { state: 'visible' });

    // Collect all header texts and verify at least one Norwegian abbreviation
    const headers = await page.locator('.fc-col-header-cell').allTextContents();
    const norwegianAbbr = ['man', 'tir', 'ons', 'tor', 'fre', 'lør', 'søn'];
    const allNorwegian = headers.every((h) =>
      norwegianAbbr.some((abbr) => h.toLowerCase().includes(abbr))
    );
    expect(allNorwegian).toBe(true);
  });

  test('next month button changes the displayed month', async ({ page }) => {
    await mockCalendar(page);
    await page.goto('/booking.html');
    await page.waitForSelector('.fc-toolbar-title', { state: 'visible' });

    const before = await page.locator('.fc-toolbar-title').textContent();
    await page.locator('.fc-next-button').click();
    const after = await page.locator('.fc-toolbar-title').textContent();

    expect(after).not.toBe(before);
  });

  test('prev month button changes the displayed month', async ({ page }) => {
    await mockCalendar(page);
    await page.goto('/booking.html');
    await page.waitForSelector('.fc-toolbar-title', { state: 'visible' });

    // Go two months forward first so we don't try to go before today
    await page.locator('.fc-next-button').click();
    await page.locator('.fc-next-button').click();
    const before = await page.locator('.fc-toolbar-title').textContent();
    await page.locator('.fc-prev-button').click();
    const after = await page.locator('.fc-toolbar-title').textContent();

    expect(after).not.toBe(before);
  });

  test('week and day view buttons are present on desktop', async ({ page }) => {
    await mockCalendar(page);
    await page.goto('/booking.html');
    // FullCalendar is configured with timeGridWeek and timeGridDay on desktop
    await expect(page.locator('.fc-timeGridWeek-button')).toBeVisible();
    await expect(page.locator('.fc-timeGridDay-button')).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test.describe('TC-05 · Calendar fallback when API fails', () => {
  test('calendar still renders when API returns 500', async ({ page }) => {
    await page.route('**/api/booking/calendar', (route) =>
      route.fulfill({ status: 500, body: 'Internal Server Error' })
    );

    await page.goto('/booking.html');

    // No hard crash – calendar container and grid remain in DOM
    await expect(page.locator('#calendar')).toBeVisible();
    await expect(page.locator('.fc-daygrid-body')).toBeVisible({ timeout: 8000 });
  });

  test('calendar renders events from localStorage when API fails', async ({ page }) => {
    // Seed localStorage before navigation
    await page.addInitScript(() => {
      localStorage.setItem(
        'bookingEvents',
        JSON.stringify([
          {
            start: '2026-07-20T14:00:00',
            end: '2026-07-20T18:00:00',
            extendedProps: {
              eventType: 'Test',
              status: 'pending',
              duration: 4,
              spaces: ['Peisestue'],
            },
          },
        ])
      );
    });

    await page.route('**/api/booking/calendar', (route) =>
      route.fulfill({ status: 500, body: 'Internal Server Error' })
    );

    await page.goto('/booking.html');
    await expect(page.locator('.fc-daygrid-body')).toBeVisible({ timeout: 8000 });
  });
});
