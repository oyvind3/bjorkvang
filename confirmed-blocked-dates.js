(function exposeConfirmedBlockedDates(root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.BjorkvangConfirmedBookings = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function createConfirmedBlockedDatesApi() {
  'use strict';

  const dates = Object.freeze([
    { date: '2026-11-07', group: 'Første helg i november' },
    { date: '2026-11-08', group: 'Første helg i november' },
    { date: '2026-11-14', group: 'Andre helg i november' },
    { date: '2026-11-15', group: 'Andre helg i november' },
    { date: '2026-12-26', group: '2. juledag' },
    { date: '2026-12-29', group: '5. juledag' },
    { date: '2027-03-06', group: 'Enkeltbooking' },
    { date: '2027-05-15', group: 'Enkeltbooking' },
    { date: '2027-05-29', group: 'Siste helg i mai' },
    { date: '2027-05-30', group: 'Siste helg i mai' },
    { date: '2027-06-05', group: 'Første helg i juni' },
    { date: '2027-06-06', group: 'Første helg i juni' },
    { date: '2027-07-06', group: 'Enkeltbooking' },
    { date: '2027-08-07', group: 'Enkeltbooking' },
    { date: '2027-11-06', group: 'Første helg i november' },
    { date: '2027-11-07', group: 'Første helg i november' },
    { date: '2027-11-13', group: 'Andre helg i november' },
    { date: '2027-11-14', group: 'Andre helg i november' },
    { date: '2027-12-26', group: '2. juledag' },
    { date: '2027-12-29', group: '5. juledag' },
  ]);

  const statusOf = (booking) => booking?.extendedProps?.status || booking?.status || '';

  const isConfirmed = (booking) => ['approved', 'confirmed', 'blocked'].includes(statusOf(booking));

  const startOf = (booking) => {
    if (booking?.start) return new Date(booking.start);
    if (booking?.date) return new Date(`${booking.date}T${booking.time || '00:00'}`);
    return new Date(NaN);
  };

  const endOf = (booking, start) => {
    if (booking?.end) return new Date(booking.end);
    const duration = Number(booking?.extendedProps?.duration ?? booking?.duration) || 1;
    return new Date(start.getTime() + duration * 60 * 60 * 1000);
  };

  const bookingCoversDate = (booking, date) => {
    if (!isConfirmed(booking)) return false;

    const start = startOf(booking);
    const end = endOf(booking, start);
    const dayStart = new Date(`${date}T00:00:00`);
    const nextDay = new Date(dayStart);
    nextDay.setDate(nextDay.getDate() + 1);

    return !Number.isNaN(start.getTime())
      && !Number.isNaN(end.getTime())
      && start < nextDay
      && end > dayStart;
  };

  const missingConfirmedDates = (bookings) => dates.filter(
    (item) => !bookings.some((booking) => bookingCoversDate(booking, item.date))
  );

  const buildCalendarEvent = (item) => ({
    title: 'Opptatt',
    start: `${item.date}T10:00:00`,
    end: `${item.date}T22:00:00`,
    extendedProps: {
      eventType: 'Annet',
      message: `Bekreftet opptatt – ${item.group}`,
      spaces: ['Hele lokalet'],
      services: [],
      duration: 12,
      status: 'confirmed',
      source: 'admin-seed',
      createdAt: '2026-09-05T00:00:00.000Z',
    },
  });

  const buildAdminPayload = (item) => ({
    date: item.date,
    time: '10:00',
    duration: 12,
    requesterName: 'Opptatt',
    requesterEmail: '',
    eventType: 'Annet',
    spaces: ['Hele lokalet'],
    services: [],
    paymentMethod: 'bank',
    message: `Bekreftet opptatt – ${item.group}`,
    source: 'admin-seed',
    adminCreated: true,
    sendConfirmationEmail: false,
  });

  return {
    dates,
    bookingCoversDate,
    missingConfirmedDates,
    buildCalendarEvent,
    buildAdminPayload,
  };
}));
