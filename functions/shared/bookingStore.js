const crypto = require('crypto');

const bookings = new Map();

/**
 * Create a unique, non-sequential identifier for a booking.
 */
const createBookingId = () => crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');

/**
 * Persist a booking in memory.
 */
const createBooking = (bookingData) => {
    const { date, time, requesterName, requesterEmail, message, duration, eventType, spaces, services, attendees, status } = bookingData;

    // Validate required fields
    if (!date || typeof date !== 'string') {
        throw new Error('Invalid or missing date');
    }
    if (!time || typeof time !== 'string') {
        throw new Error('Invalid or missing time');
    }
    if (!requesterName || typeof requesterName !== 'string') {
        throw new Error('Invalid or missing requesterName');
    }
    if ((!requesterEmail && bookingData.adminCreated !== true)
        || (requesterEmail && typeof requesterEmail !== 'string')) {
        throw new Error('Invalid or missing requesterEmail');
    }
    
    const now = new Date().toISOString();
    const booking = {
        id: bookingData.id || createBookingId(),
        date: date.trim(),
        time: time.trim(),
        requesterName: requesterName.trim(),
        requesterEmail: requesterEmail ? requesterEmail.trim() : '',
        message: (message || '').trim(),
        duration: duration,
        eventType: eventType,
        spaces: Array.isArray(spaces) ? spaces : [],
        services: Array.isArray(services) ? services : [],
        attendees: attendees,
        status: status || 'pending',
        createdAt: now,
        updatedAt: now,
    };

    bookings.set(booking.id, booking);
    return booking;
};

/**
 * Look up a single booking by id.
 */
const getBooking = (id) => {
    if (!id || typeof id !== 'string') {
        return null;
    }
    return bookings.get(id) || null;
};

/**
 * Update the booking status and timestamp.
 */
const updateBookingStatus = (id, status) => {
    if (!id || typeof id !== 'string') {
        return null;
    }
    
    const validStatuses = ['pending', 'approved', 'rejected'];
    if (!validStatuses.includes(status)) {
        throw new Error(`Invalid status: ${status}. Must be one of: ${validStatuses.join(', ')}`);
    }
    
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
 * Delete a booking by id.
 */
const deleteBooking = (id) => {
    if (!id || typeof id !== 'string') {
        return false;
    }
    return bookings.delete(id);
};

/**
 * Return every booking in a stable array.
 */
const listBookings = () => {
    try {
        return Array.from(bookings.values())
            .filter(booking => booking && booking.date && booking.time)
            .sort((a, b) => {
                const dateComparison = new Date(a.date) - new Date(b.date);
                return dateComparison !== 0 ? dateComparison : a.time.localeCompare(b.time);
            });
    } catch (error) {
        console.error('Error in listBookings:', error);
        return [];
    }
};

module.exports = {
    createBooking,
    getBooking,
    listBookings,
    updateBookingStatus,
    deleteBooking,
};
