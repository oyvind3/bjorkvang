const { app } = require('@azure/functions');
const { getPlunkApiUrl } = require('../shared/email');

console.log(`Azure Functions runtime starting on Node ${process.version} with Plunk endpoint ${getPlunkApiUrl()}`);

app.setup({
    enableHttpStream: true,
});

require('./functions/approveBooking');
require('./functions/bookingRequest');
require('./functions/emailHttpTriggerBooking');
require('./functions/getAdminCalendar');
require('./functions/getCalendar');
require('./functions/rejectBooking');
