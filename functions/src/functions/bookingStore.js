const crypto = require('crypto');

const bookings = new Map();

/**
 * Create a unique, non-sequential identifier for a booking.
 */
const createBookingId = () => crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');

/**
 * Persist a booking in memory.
 */
const createBooking = ({ date, time, requesterName, requesterEmail, message }) => {
    const now = new Date().toISOString();
    const booking = {
        id: createBookingId(),
        date,
        time,
        requesterName,
        requesterEmail,
        message: message || '',
        status: 'pending',
        createdAt: now,
        updatedAt: now,
    };

    bookings.set(booking.id, booking);
    return booking;
};

/**
 * Look up a single booking by id.
 */
const getBooking = (id) => bookings.get(id);

/**
 * Update the booking status and timestamp.
 */
const updateBookingStatus = (id, status) => {
    const booking = bookings.get(id);
    if (!booking) {
        return null;
    }

    booking.status = status;
    booking.updatedAt = new Date().toISOString();
    bookings.set(id, booking);
    return booking;
};

/**
 * Return every booking in a stable array.
 */
const listBookings = () => Array.from(bookings.values()).sort((a, b) => new Date(a.date) - new Date(b.date) || a.time.localeCompare(b.time));

module.exports = {
    createBooking,
    getBooking,
    listBookings,
    updateBookingStatus,
};
