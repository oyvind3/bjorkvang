// booking.js
// Denne filen initialiserer en enkel kalender ved hjelp av FullCalendar
// og legger til funksjonalitet for å sende inn en bookingforespørsel.

document.addEventListener('DOMContentLoaded', function () {
  // Hent eksisterende hendelser fra localStorage eller bruk tom array
  let events = [];
  try {
    const stored = localStorage.getItem('bookingEvents');
    if (stored) {
      events = JSON.parse(stored);
    }
  } catch (e) {
    console.error('Kunne ikke lese lagrede hendelser:', e);
    events = [];
  }

  // Sett opp kalenderen
  const calendarEl = document.getElementById('calendar');
  const calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: 'dayGridMonth',
    height: 'auto',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek,timeGridDay'
    },
    locale: 'nb',
    selectable: false,
    events: events,
    eventMouseover: function (info) {
      const tooltip = document.createElement('div');
      tooltip.id = 'fc-tooltip';
      tooltip.style.position = 'absolute';
      tooltip.style.zIndex = '10001';
      tooltip.style.background = '#fff';
      tooltip.style.border = '1px solid #ccc';
      tooltip.style.padding = '5px';
      tooltip.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
      tooltip.innerHTML =
        '<strong>' +
        info.event.title +
        '</strong><br>' +
        new Date(info.event.start).toLocaleString('nb-NO');
      document.body.appendChild(tooltip);
      info.el.addEventListener('mousemove', function (e) {
        tooltip.style.left = e.pageX + 10 + 'px';
        tooltip.style.top = e.pageY + 10 + 'px';
      });
    },
    eventMouseout: function (info) {
      const tooltip = document.getElementById('fc-tooltip');
      if (tooltip) tooltip.remove();
    }
  });
  calendar.render();

  // Håndter skjema
  const form = document.getElementById('booking-form');
  const statusEl = document.getElementById('booking-status');

  const showStatus = (message, type = 'success') => {
    if (!statusEl) {
      if (type === 'error') {
        alert(message);
      } else {
        console.log(message);
      }
      return;
    }

    statusEl.textContent = message;
    statusEl.classList.remove('is-success', 'is-error', 'is-visible');
    statusEl.classList.add('is-visible');
    statusEl.classList.add(type === 'error' ? 'is-error' : 'is-success');
  };

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (statusEl) {
        statusEl.classList.remove('is-visible', 'is-success', 'is-error');
        statusEl.textContent = '';
      }
      // Hent felter
      const name = document.getElementById('name').value.trim();
      const email = document.getElementById('email').value.trim();
      const date = document.getElementById('date').value;
      const time = document.getElementById('time').value;
      const durationInput = document.getElementById('duration').value;
      const message = document.getElementById('message').value.trim();

      if (!name || !email || !date || !time || !durationInput) {
        showStatus('Vennligst fyll ut alle obligatoriske felter.', 'error');
        return;
      }
      const duration = parseFloat(durationInput);
      const startStr = date + 'T' + time;
      const startDate = new Date(startStr);
      if (isNaN(startDate.getTime())) {
        showStatus('Ugyldig dato eller klokkeslett.', 'error');
        return;
      }
      const endDate = new Date(startDate.getTime() + duration * 60 * 60 * 1000);
      // Konstruer ny hendelse
      const newEvent = {
        title: 'Reservert: ' + name,
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        extendedProps: {
          name: name,
          email: email,
          message: message,
          duration: duration
        }
      };

      // Legg til i array og localStorage
      events.push(newEvent);
      try {
        localStorage.setItem('bookingEvents', JSON.stringify(events));
      } catch (err) {
        console.error('Kunne ikke lagre hendelse:', err);
        showStatus('Forespørselen ble sendt, men kunne ikke lagres lokalt i nettleseren.', 'error');
      }

      // Legg til i kalenderen
      calendar.addEvent(newEvent);

      // Nullstill skjema
      form.reset();
      showStatus(
        'Din bookingforespørsel er mottatt og vises nå i kalenderen. Du blir kontaktet av styret for endelig bekreftelse.'
      );
    });
  }
});
