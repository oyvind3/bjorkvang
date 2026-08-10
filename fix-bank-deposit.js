const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'booking.js');
let c = fs.readFileSync(file, 'utf8');

const NL = '\r\n';
const old = [
  `          const totalAmount = calculatePrice();`,
  `          bookingDetails.paymentMethod = 'bank';`,
  `          bookingDetails.paymentStatus = 'unpaid';`,
  `          bookingDetails.totalAmount = totalAmount;`,
  `          await submitBooking(bookingDetails);`,
].join(NL);

const rep = [
  `          const totalAmount = calculatePrice();`,
  `          const depositAmount = Math.round(totalAmount / 2);`,
  `          bookingDetails.paymentMethod = 'bank';`,
  `          bookingDetails.paymentStatus = 'unpaid';`,
  `          bookingDetails.totalAmount = totalAmount;`,
  `          bookingDetails.depositAmount = depositAmount;`,
  `          await submitBooking(bookingDetails);`,
].join(NL);

if (c.includes(old)) {
  c = c.replace(old, rep);
  console.log('OK - depositAmount inserted');
} else {
  console.log('NOT FOUND for block 1');
}

// Also fix success message to show 50% deposit info
const oldMsg = c.match(/showStatus\(\s*`Bookingforespørsel sendt[\s\S]*?'success'\s*\);/);
if (oldMsg) {
  const newMsg = `showStatus(
            \`Bookingforespørsel sendt! Styret vil bekrefte innen kort tid. \` +
            \`Betal 50\u00a0% Forhåndsbetaling\u00a0– kr \${depositAmount.toLocaleString('nb-NO')}\u00a0– til kontonr.\u00a01810.40.02508 \` +
            \`(eller Vipps\u00a0104631) innen 14 dager etter bekreftelse. \` +
            \`Restbeløp kr \${(totalAmount - depositAmount).toLocaleString('nb-NO')} faktureres etter arrangementet.\`,
            'success'
          );`;
  c = c.replace(oldMsg[0], newMsg);
  console.log('OK - success message updated');
} else {
  console.log('Success message not found - skipping');
}

fs.writeFileSync(file, c, 'utf8');
console.log('File saved.');
