const { app } = require('@azure/functions');
const { createJsonResponse, parseBody, requireAdminKey } = require('../../../shared/http');
const { getBooking, updateBookingFields, listBookings } = require('../../../shared/cosmosDb');
const { checkForDoubleBooking } = require('../../../shared/conflictCheck');

const ALLOWED_SPACES = ['Peisestue', 'Salen', 'Hele lokalet', 'Bryllupspakke', 'Små møter'];
const ALLOWED_SERVICES = ['Projektor', 'Teknisk utstyr', 'Vask'];
const WHOLE_PREMISES = ['Hele lokalet', 'Bryllupspakke'];
const INDIVIDUAL_SPACES = ['Peisestue', 'Salen', 'Små møter'];

const cleanText = (value, maxLength) => String(value ?? '').trim().slice(0, maxLength);
const pad2 = (value) => String(value).padStart(2, '0');
const toLocalDateString = (value) =>
    `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
const toLocalTimeString = (value) => `${pad2(value.getHours())}:${pad2(value.getMinutes())}`;

const handler = async (request, context) => {
        if (request.method === 'OPTIONS') {
            return createJsonResponse(204, {}, request);
        }

        const authError = requireAdminKey(request);
        if (authError) return authError;

        try {
            const body = await parseBody(request);
            const id = cleanText(body.id, 200);

            if (!id) {
                return createJsonResponse(400, { error: 'Mangler booking-ID.' }, request);
            }

            const booking = await getBooking(id);
            if (!booking) {
                return createJsonResponse(404, { error: 'Booking ikke funnet.' }, request);
            }

            const requesterName = cleanText(body.requesterName, 100);
            const requesterEmail = cleanText(body.requesterEmail, 254).toLowerCase();
            const phone = cleanText(body.phone, 30).replace(/[\s-]/g, '').replace(/^(?:\+?47|0047)/, '');
            const address = cleanText(body.address, 200);
            const date = cleanText(body.date, 10);
            const time = cleanText(body.time, 5);
            const duration = Number(body.duration);
            const eventType = cleanText(body.eventType, 100);
            const message = cleanText(body.message, 2000);
            const attendees = body.attendees === '' || body.attendees == null ? null : Number(body.attendees);
            const spaces = Array.isArray(body.spaces)
                ? [...new Set(body.spaces.map((value) => cleanText(value, 50)))].filter((value) => ALLOWED_SPACES.includes(value))
                : [];
            const services = Array.isArray(body.services)
                ? [...new Set(body.services.map((value) => cleanText(value, 50)))].filter((value) => ALLOWED_SERVICES.includes(value))
                : [];

            if (!requesterName) {
                return createJsonResponse(400, { error: 'Navn er påkrevd.' }, request);
            }
            if (requesterEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requesterEmail)) {
                return createJsonResponse(400, { error: 'Ugyldig e-postadresse.' }, request);
            }
            const parsedDate = new Date(`${date}T00:00:00`);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
                Number.isNaN(parsedDate.getTime()) ||
                toLocalDateString(parsedDate) !== date) {
                return createJsonResponse(400, { error: 'Ugyldig dato. Bruk YYYY-MM-DD.' }, request);
            }
            if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
                return createJsonResponse(400, { error: 'Ugyldig tidspunkt. Bruk HH:MM.' }, request);
            }
            if (!Number.isFinite(duration) || duration < 1 || duration > 72) {
                return createJsonResponse(400, { error: 'Varighet må være mellom 1 og 72 timer.' }, request);
            }
            if (!eventType) {
                return createJsonResponse(400, { error: 'Formål er påkrevd.' }, request);
            }
            if (spaces.length === 0) {
                return createJsonResponse(400, { error: 'Velg minst ett lokale.' }, request);
            }
            if (spaces.some((space) => WHOLE_PREMISES.includes(space)) && spaces.length > 1) {
                return createJsonResponse(400, { error: 'Hele lokalet eller bryllupspakke kan ikke kombineres med andre lokaler.' }, request);
            }
            if (spaces.filter((space) => INDIVIDUAL_SPACES.includes(space)).length > 1) {
                return createJsonResponse(400, { error: 'Velg bare ett lokale om gangen.' }, request);
            }
            if (attendees !== null && (!Number.isInteger(attendees) || attendees < 1 || attendees > 500)) {
                return createJsonResponse(400, { error: 'Antall deltakere må være mellom 1 og 500.' }, request);
            }

            const newStart = new Date(`${date}T${time}`);
            const newEnd = new Date(newStart.getTime() + duration * 60 * 60 * 1000);
            const oldSpaces = Array.isArray(booking.spaces) ? booking.spaces : [booking.spaces].filter(Boolean);
            const logisticsChanged = booking.date !== date ||
                booking.time !== time ||
                Number(booking.duration) !== duration ||
                JSON.stringify([...oldSpaces].sort()) !== JSON.stringify([...spaces].sort());

            // A contact-only correction must always be possible. Check conflicts only
            // when an active or pending booking is actually moved or changes rooms.
            if (logisticsChanged && !['rejected', 'cancelled'].includes(booking.status)) {
                const lookbackStart = new Date(newStart);
                lookbackStart.setDate(lookbackStart.getDate() - 3);
                const existingBookings = await listBookings({
                    startDate: toLocalDateString(lookbackStart),
                    endDate: toLocalDateString(newEnd),
                });
                const { conflict, conflictingBooking } = checkForDoubleBooking(
                    { id, date, time, duration, spaces },
                    existingBookings
                );

                if (conflict) {
                    return createJsonResponse(409, {
                        error: `Lokalet er allerede booket ${conflictingBooking.date} kl. ${conflictingBooking.time}.`,
                        conflictingBookingId: conflictingBooking.id,
                    }, request);
                }
            }

            const fields = {
                requesterName,
                requesterEmail,
                phone: phone || null,
                address: address || null,
                date,
                time,
                endDate: toLocalDateString(newEnd),
                endTime: toLocalTimeString(newEnd),
                duration,
                eventType,
                spaces,
                services,
                attendees,
                message,
                lastEditedAt: new Date().toISOString(),
            };

            const updated = await updateBookingFields(id, booking.bjorkvang, fields);
            if (!updated) {
                return createJsonResponse(500, { error: 'Kunne ikke lagre endringene.' }, request);
            }

            context.info('editBooking: Booking updated', { id, fields: Object.keys(fields) });
            return createJsonResponse(200, {
                message: 'Booking oppdatert.',
                booking: updated,
            }, request);
        } catch (error) {
            context.error('editBooking error:', error);
            return createJsonResponse(500, { error: 'Kunne ikke oppdatere bookingen.' }, request);
        }
};

app.http('editBooking', {
    methods: ['POST', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'booking/edit',
    handler,
});

module.exports = { handler };
