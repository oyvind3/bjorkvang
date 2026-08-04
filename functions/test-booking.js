const fetch = require('node-fetch');

async function testBooking() {
    console.log('📝 Testing Booking Request...');
    
    const payload = {
        date: new Date().toISOString().split('T')[0],
        time: '18:00',
        requesterName: 'Test User',
        requesterEmail: 'skype.oyvind@hotmail.com',
        message: 'This is a test booking from the integration test.',
        duration: 4,
        eventType: 'Møte',
        spaces: ['Peisestue'],
        services: ['Projektor'],
        attendees: 10
    };

    try {
        const response = await fetch('http://127.0.0.1:7071/api/booking', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.status === 202) {
            console.log('✅ Booking request accepted');
            const data = await response.json();
            console.log('   Response:', JSON.stringify(data, null, 2));
            return data.id;
        } else {
            console.log(`❌ Unexpected response: ${response.status}`);
            const text = await response.text();
            console.log('   Response:', text);
        }
    } catch (error) {
        console.log('❌ Request failed:', error.message);
    }
}

async function testCalendar() {
    console.log('\n📝 Testing Calendar Retrieval...');
    try {
        const response = await fetch('http://127.0.0.1:7071/api/booking/calendar');
        if (response.status === 200) {
            console.log('✅ Calendar retrieved');
            const data = await response.json();
            console.log(`   Found ${data.bookings.length} bookings`);
            console.log('   Bookings:', JSON.stringify(data.bookings, null, 2));
        } else {
            console.log(`❌ Unexpected response: ${response.status}`);
        }
    } catch (error) {
        console.log('❌ Request failed:', error.message);
    }
}

async function run() {
    await testBooking();
    // Wait a bit for blah the in-memory store to update (it's synchronous but good practice)
    await new Promise(resolve => setTimeout(resolve, 1000));
    await testCalendar();
}

run();
