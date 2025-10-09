const { app } = require('@azure/functions');

app.setup({
    enableHttpStream: true,
});

require('./approveBooking');
require('./bookingRequest');
require('./emailHttpTriggerBooking');
require('./getAdminCalendar');
require('./getCalendar');
require('./rejectBooking');
