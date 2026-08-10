const { app } = require('@azure/functions');
const { getPlunkApiUrl } = require('../shared/email');

// v1.2 — sendDepositRequest + checkVippsStatuses + sendFinalInvoice registrert
console.log(`Azure Functions runtime starting on Node ${process.version} with Plunk endpoint ${getPlunkApiUrl()}`);

const loadingErrors = {};
const loadedFunctions = [];

const loadFunction = (name, path) => {
    try {
        require(path);
        loadedFunctions.push(name);
        console.log(`Successfully registered function: ${name}`);
    } catch (error) {
        console.error(`Failed to register function: ${name}`, error);
        loadingErrors[name] = error.message + '\n' + error.stack;
    }
};

app.setup({
    enableHttpStream: true,
});

// Health check to verify the app is running even if other functions fail
app.http('healthCheck', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'health',
    handler: async (request, context) => {
        return { 
            body: JSON.stringify({
                status: 'OK',
                version: process.version,
                loadedFunctions,
                loadingErrors
            }, null, 2), 
            headers: {
                'Content-Type': 'application/json'
            },
            status: 200 
        };
    }
});

// Status endpoint — only exposes boolean presence of secrets, never their values
app.http('apiStatus', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'status',
    handler: async (request, context) => {
        const vippsBaseUrl = process.env.VIPPS_BASE_URL || 'https://apitest.vipps.no';
        return {
            body: JSON.stringify({
                vippsEnvironment: vippsBaseUrl.includes('apitest') ? 'test' : 'production',
                nodeVersion: process.version,
                timestamp: new Date().toISOString(),
                vars: {
                    VIPPS_CLIENT_ID:             !!process.env.VIPPS_CLIENT_ID,
                    VIPPS_CLIENT_SECRET:          !!process.env.VIPPS_CLIENT_SECRET,
                    VIPPS_SUBSCRIPTION_KEY:       !!process.env.VIPPS_SUBSCRIPTION_KEY,
                    VIPPS_MERCHANT_SERIAL_NUMBER: !!process.env.VIPPS_MERCHANT_SERIAL_NUMBER,
                    VIPPS_BASE_URL:               !!process.env.VIPPS_BASE_URL,
                    PLUNK_API_TOKEN:              !!process.env.PLUNK_API_TOKEN,
                    BOARD_TO_ADDRESS:             !!process.env.BOARD_TO_ADDRESS,
                    DEFAULT_FROM_ADDRESS:         !!process.env.DEFAULT_FROM_ADDRESS,
                    COSMOS_CONNECTION_STRING:     !!process.env.COSMOS_CONNECTION_STRING,
                    TWILIO_ACCOUNT_SID:           !!process.env.TWILIO_ACCOUNT_SID,
                    TWILIO_AUTH_TOKEN:            !!process.env.TWILIO_AUTH_TOKEN,
                    BOARD_PHONE_NUMBER:           !!process.env.BOARD_PHONE_NUMBER,
                },
                loadedFunctions,
                loadingErrors,
            }, null, 2),
            headers: { 'Content-Type': 'application/json' },
            status: 200
        };
    }
});

loadFunction('approveBooking', './functions/approveBooking');
loadFunction('bookingRequest', './functions/bookingRequest');
loadFunction('emailHttpTriggerBooking', './functions/emailHttpTriggerBooking');
loadFunction('sendSms', './functions/sendSms');
loadFunction('getAdminCalendar', './functions/getAdminCalendar');
loadFunction('getCalendar', './functions/getCalendar');
loadFunction('rejectBooking', './functions/rejectBooking');
loadFunction('getBooking', './functions/getBooking');
loadFunction('signBooking', './functions/signBooking');
loadFunction('verifyAdmin', './functions/verifyAdmin');
loadFunction('sendReminder', './functions/sendReminder');
loadFunction('vippsInitiate', './functions/vippsInitiate');
loadFunction('vippsInitiateMembership', './functions/vippsInitiateMembership');
loadFunction('vippsMembershipStatus', './functions/vippsMembershipStatus');
loadFunction('vippsDonate', './functions/vippsDonate');
loadFunction('vippsInitiateBooking', './functions/vippsInitiateBooking');
loadFunction('vippsInitiateContractPayment', './functions/vippsInitiateContractPayment');
loadFunction('vippsCheckStatus', './functions/vippsCheckStatus');
loadFunction('vippsCallback', './functions/vippsCallback');
loadFunction('depositPaid', './functions/depositPaid');
loadFunction('finalInvoicePaid', './functions/finalInvoicePaid');
loadFunction('sendInvoice', './functions/sendInvoice');
loadFunction('sendDepositRequest', './functions/sendDepositRequest');
loadFunction('checkVippsStatuses', './functions/checkVippsStatuses');
loadFunction('sendFinalInvoice', './functions/sendFinalInvoice');
loadFunction('rescheduleBooking', './functions/rescheduleBooking');
loadFunction('editBooking', './functions/editBooking');
loadFunction('getMembers', './functions/getMembers');
loadFunction('signingReminder', './functions/signingReminder');
loadFunction('adminContacts', './functions/adminContacts');
loadFunction('systemHealth', './functions/systemHealth');
