// TC-14 to TC-18: Form submission, confirmation receipt and error handling
const { test, expect } = require('@playwright/test');

async function addTurnstileToken(page) {
  await page.evaluate(() => {
    const form = document.getElementById('booking-form');
    const token = document.createElement('input');
    token.type = 'hidden';
    token.name = 'cf-turnstile-response';
    token.value = 'test-turnstile-token';
    form.appendChild(token);
  });
}

async function mockTurnstileScript(page) {
  await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: 'window.turnstile = { reset() {} };',
    })
  );
}

/** Fill the booking form with valid data ready for submission */
async function fillValidForm(page, { paymentMethod = 'bank' } = {}) {
  await mockTurnstileScript(page);
  await page.route('**/api/booking/calendar', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ bookings: [] }),
    })
  );

  await page.goto('/booking.html');
  await page.waitForSelector('#booking-form', { state: 'visible' });
  await page.waitForSelector('#address', { state: 'visible', timeout: 5000 });

  await page.locator('#name').fill('Ole Nordmann');
  await page.locator('#email').fill('ole@example.com');
  await page.locator('#phone').fill('91234567');
  await page.locator('#address').fill('Testgate 1, 1234 Testby');
  // Set date via Flatpickr's API to ensure it registers the value
  await page.evaluate(() => {
    const el = document.getElementById('date');
    if (el._flatpickr) el._flatpickr.setDate('2027-09-20', true);
    else el.value = '2027-09-20';
  });
  await page.locator('#time').selectOption('14:00');
  await page.locator('#duration').fill('4');
  await page.locator('#event-type').selectOption('Familiefeiring');
  await page.locator('input[name="spaces"][value="Peisestue"]').check();
  await page.locator('#age-verified').check();
  await page.locator(`input[name="paymentMethod"][value="${paymentMethod}"]`).check();
  await addTurnstileToken(page);
}

test('booking form embeds Turnstile with the configured site key and action', async ({ page }) => {
  await fillValidForm(page);

  const widget = page.locator('#booking-turnstile');
  await expect(widget).toHaveAttribute('data-sitekey', '0x4AAAAAAEr2472ea15FgRMy');
  await expect(widget).toHaveAttribute('data-action', 'booking_request');
});

// ─────────────────────────────────────────────────────────────────────────────
test.describe('TC-14 · Happy path submission – bank transfer', () => {
  test('confirmation receipt appears with correct summary after bank submission', async ({
    page,
  }) => {
    await fillValidForm(page, { paymentMethod: 'bank' });

    await page.route('**/api/booking', (route) => {
      expect(route.request().postDataJSON()['cf-turnstile-response']).toBe('test-turnstile-token');
      return route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'booking-abc123', status: 'pending', paymentMethod: 'bank' }),
      });
    });

    await page.locator('#submit-btn').click();

    // Confirmation receipt shown
    await expect(page.locator('#booking-confirmation')).toBeVisible({ timeout: 8000 });

    // Form itself is hidden
    await expect(page.locator('#booking-form')).toBeHidden();

    // Receipt fields populated
    await expect(page.locator('#conf-name')).toContainText('Ole Nordmann');
    await expect(page.locator('#conf-email')).toContainText('ole@example.com');

    // Payment method label in receipt
    await expect(page.locator('#conf-payment')).toContainText('Bankinnbetaling');

    // Reference ID shown
    await expect(page.locator('#conf-id')).toContainText('booking-abc123');

    // "Send ny forespørsel" reset button is present and clickable
    const resetBtn = page.getByRole('button', { name: /Send ny forespørsel/i });
    await expect(resetBtn).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test.describe('TC-15 · Happy path submission – Vipps', () => {
  test('confirmation receipt shows Vipps as payment method', async ({ page }) => {
    await fillValidForm(page, { paymentMethod: 'vipps' });

    await page.route('**/api/booking', (route) =>
      route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'booking-xyz456', status: 'pending', paymentMethod: 'vipps' }),
      })
    );

    await page.locator('#submit-btn').click();

    await expect(page.locator('#booking-confirmation')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('#conf-payment')).toContainText('Vipps');
  });

  test('success status message appears for Vipps submission', async ({ page }) => {
    await fillValidForm(page, { paymentMethod: 'vipps' });

    await page.route('**/api/booking', (route) =>
      route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'booking-vipps01', status: 'pending', paymentMethod: 'vipps' }),
      })
    );

    await page.locator('#submit-btn').click();

    // Confirmation receipt appears (not an error)
    await expect(page.locator('#booking-confirmation')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('#booking-status')).not.toHaveClass(/is-error/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test.describe('TC-16 · Double-booking conflict (409)', () => {
  test('shows unavailable-slot error and keeps form filled', async ({ page }) => {
    await fillValidForm(page, { paymentMethod: 'bank' });

    await page.route('**/api/booking', (route) =>
      route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Conflict',
          message:
            'Det valgte tidspunktet er ikke tilgjengelig. Vennligst velg et annet tidspunkt.',
        }),
      })
    );

    await page.locator('#submit-btn').click();

    // Error message mentioning unavailability
    await expect(page.locator('#booking-status')).toContainText('ikke tilgjengelig');
    await expect(page.locator('#booking-status')).toHaveClass(/is-error/);

    // Confirmation receipt NOT shown
    await expect(page.locator('#booking-confirmation')).toBeHidden();

    // Form remains filled – user can correct the date without losing data
    await expect(page.locator('#name')).toHaveValue('Ole Nordmann');
    await expect(page.locator('#email')).toHaveValue('ole@example.com');
  });

  test('pending bookings do NOT show as conflict (form should be submittable)', async ({
    page,
  }) => {
    await mockTurnstileScript(page);
    // A pending event on the same date should NOT trigger a 409 from the backend.
    // From the frontend's perspective: the booking still goes through (submit is allowed).
    // We mock a 202 to verify the form submits normally alongside a pending booking.
    await page.route('**/api/booking/calendar', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          bookings: [
            { id: 'pending-1', date: '2027-09-20', time: '14:00', duration: 4, status: 'pending' },
          ],
        }),
      })
    );

    await page.goto('/booking.html');
    await page.waitForSelector('#booking-form', { state: 'visible' });

    await page.locator('#name').fill('Test Pending');
    await page.locator('#email').fill('pending@example.com');
    await page.locator('#phone').fill('12345678');
    await page.evaluate(() => {
      const el = document.getElementById('date');
      if (el._flatpickr) el._flatpickr.setDate('2027-09-20', true);
      else el.value = '2027-09-20';
    });
    await page.locator('#time').selectOption('14:00');
    await page.locator('#duration').fill('4');
    await page.locator('#event-type').selectOption('Familiefeiring');
    await page.locator('input[name="spaces"][value="Peisestue"]').check();
    await page.locator('#age-verified').check();
    await addTurnstileToken(page);

    await page.route('**/api/booking', (route) =>
      route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'booking-pend-ok', status: 'pending', paymentMethod: 'bank' }),
      })
    );

    await page.locator('#submit-btn').click();

    await expect(page.locator('#booking-confirmation')).toBeVisible({ timeout: 8000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test.describe('TC-17 · Server error (500)', () => {
  test('shows generic error and re-enables the submit button', async ({ page }) => {
    await fillValidForm(page, { paymentMethod: 'bank' });

    await page.route('**/api/booking', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' }),
      })
    );

    await page.locator('#submit-btn').click();

    await expect(page.locator('#booking-status')).toHaveClass(/is-error/);

    // Confirmation NOT shown
    await expect(page.locator('#booking-confirmation')).toBeHidden();

    // Submit button re-enabled so user can retry
    await expect(page.locator('#submit-btn')).not.toBeDisabled({ timeout: 5000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test.describe('TC-18 · Confirmation receipt reset', () => {
  test('"Send ny forespørsel" resets the form and hides the confirmation', async ({ page }) => {
    await fillValidForm(page, { paymentMethod: 'bank' });

    await page.route('**/api/booking', (route) =>
      route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'booking-reset-test', status: 'pending', paymentMethod: 'bank' }),
      })
    );

    await page.locator('#submit-btn').click();
    await expect(page.locator('#booking-confirmation')).toBeVisible({ timeout: 8000 });

    // Click the reset button
    await page.getByRole('button', { name: /Send ny forespørsel/i }).click();

    // Form should now be visible again, confirmation hidden
    await expect(page.locator('#booking-form')).toBeVisible();
    await expect(page.locator('#booking-confirmation')).toBeHidden();

    // Fields cleared
    await expect(page.locator('#name')).toHaveValue('');
  });
});
