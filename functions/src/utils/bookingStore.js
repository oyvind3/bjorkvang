const { randomUUID } = require('crypto');

// In-memory booking storage shared across Azure Function executions.
const bookings = new Map();

const createBooking = ({ date, time, name, email, message }) => {
    const id = randomUUID();
    const booking = {
        id,
        date,
        time,
        name,
        email,
        message,
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };

    bookings.set(id, booking);
    return booking;
};

const updateBookingStatus = (id, status) => {
    const booking = bookings.get(id);

    if (!booking) {
        return null;
    }

    bookings.set(id, {
        ...booking,
        status,
        updatedAt: new Date().toISOString(),
    });

    return bookings.get(id);
};

const getBooking = (id) => bookings.get(id) || null;

const getAdminBookings = () => Array.from(bookings.values());

const getPublicBookings = () =>
    Array.from(bookings.values()).map(({ id, date, time, status }) => ({
        id,
        date,
        time,
        status: status === 'pending' ? 'pending' : 'booked',
    }));

module.exports = {
    createBooking,
    updateBookingStatus,
    getBooking,
    getAdminBookings,
    getPublicBookings,
};
