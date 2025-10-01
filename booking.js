// booking.js
// Denne filen initialiserer en enkel kalender ved hjelp av FullCalendar
// og legger til funksjonalitet for å sende inn en bookingforespørsel.

document.addEventListener('DOMContentLoaded', function () {
  const calendarEl = document.getElementById('calendar');
  const form = document.getElementById('booking-form');
  const statusEl = document.getElementById('booking-status');
  const reservationListEl = document.getElementById('reservation-list');
  const reservationEmptyState = document.getElementById('reservation-empty');
  const dateInput = document.getElementById('date');
  const timeInput = document.getElementById('time');
  const durationInputEl = document.getElementById('duration');
  const eventTypeSelect = document.getElementById('event-type');

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
    statusEl.classList.remove('is-success', 'is-error', 'is-info', 'is-visible');
    statusEl.classList.add('is-visible');

    if (type === 'error') {
      statusEl.classList.add('is-error');
    } else if (type === 'info') {
      statusEl.classList.add('is-info');
    } else {
      statusEl.classList.add('is-success');
    }
  };

  const normaliseEvent = (event) => {
    if (!event || !event.start) {
      return null;
    }

    const startDate = new Date(event.start);
    if (Number.isNaN(startDate.getTime())) {
      return null;
    }

    const hasEnd = Boolean(event.end);
    const endDate = hasEnd ? new Date(event.end) : new Date(startDate.getTime() + 4 * 60 * 60 * 1000);
    const safeEnd = Number.isNaN(endDate.getTime()) ? new Date(startDate.getTime() + 4 * 60 * 60 * 1000) : endDate;

    const extended = { ...(event.extendedProps || {}) };
    const name = (extended.name || event.title?.replace(/^Reservert[:–-]?\s*/i, '').trim() || 'Reservert').trim();
    const eventType = extended.eventType || 'Reservasjon';
    const message = extended.message || '';
    const email = extended.email || '';
    const duration = extended.duration || Math.max(1, Math.round((safeEnd - startDate) / (60 * 60 * 1000)));

    return {
      title: `${eventType} – ${name}`,
      start: startDate.toISOString(),
      end: safeEnd.toISOString(),
      extendedProps: {
        ...extended,
        name,
        email,
        message,
        duration,
        eventType,
        createdAt: extended.createdAt || new Date().toISOString()
      }
    };
  };

  const loadEvents = () => {
    try {
      const stored = localStorage.getItem('bookingEvents');
      if (!stored) {
        return [];
      }
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.map(normaliseEvent).filter(Boolean);
    } catch (error) {
      console.error('Kunne ikke lese lagrede hendelser:', error);
      return [];
    }
  };

  let events = loadEvents();

  const updateReservationList = () => {
    if (!reservationListEl) {
      return;
    }

    const now = new Date();
    const upcoming = events
      .map((event) => {
        const startDate = new Date(event.start);
        const endDate = event.end ? new Date(event.end) : new Date(startDate.getTime() + event.extendedProps?.duration * 60 * 60 * 1000);
        return { event, startDate, endDate };
      })
      .filter(({ startDate, endDate }) => !Number.isNaN(startDate) && !Number.isNaN(endDate) && endDate >= now)
      .sort((a, b) => a.startDate - b.startDate);

    reservationListEl.innerHTML = '';

    if (reservationEmptyState) {
      reservationEmptyState.hidden = upcoming.length > 0;
    }

    if (upcoming.length === 0) {
      return;
    }

    upcoming.forEach(({ event, startDate, endDate }) => {
      const listItem = document.createElement('li');
      listItem.className = 'reservation-item';

      const header = document.createElement('div');
      header.className = 'reservation-header';

      const typeBadge = document.createElement('span');
      typeBadge.className = 'reservation-type';
      typeBadge.textContent = event.extendedProps?.eventType || 'Reservasjon';
      header.appendChild(typeBadge);

      const timeEl = document.createElement('time');
      timeEl.className = 'reservation-time';
      timeEl.dateTime = startDate.toISOString();
      const datePart = startDate.toLocaleDateString('nb-NO', {
        weekday: 'short',
        day: '2-digit',
        month: 'short'
      });
      const timePart = startDate.toLocaleTimeString('nb-NO', {
        hour: '2-digit',
        minute: '2-digit'
      });
      timeEl.textContent = `${datePart} kl. ${timePart}`;
      header.appendChild(timeEl);

      listItem.appendChild(header);

      const host = document.createElement('p');
      host.className = 'reservation-meta';
      host.textContent = `Ansvarlig: ${event.extendedProps?.name || 'Ukjent'}`;
      listItem.appendChild(host);

      const durationHours = event.extendedProps?.duration || Math.max(1, Math.round((endDate - startDate) / (60 * 60 * 1000)));
      const duration = document.createElement('p');
      duration.className = 'reservation-meta';
      duration.textContent = `Varighet: ${durationHours} ${durationHours === 1 ? 'time' : 'timer'}`;
      listItem.appendChild(duration);

      if (event.extendedProps?.message) {
        const note = document.createElement('p');
        note.className = 'reservation-notes';
        note.textContent = `Notat: ${event.extendedProps.message}`;
        listItem.appendChild(note);
      }

      reservationListEl.appendChild(listItem);
    });
  };

  let calendar;

  if (calendarEl) {
    calendar = new FullCalendar.Calendar(calendarEl, {
      initialView: 'dayGridMonth',
      height: 'auto',
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,timeGridDay'
      },
      locale: 'nb',
      selectable: true,
      selectMirror: true,
      dayMaxEvents: true,
      events: events,
      eventTimeFormat: {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      },
      dateClick: function (info) {
        if (dateInput) {
          dateInput.value = info.dateStr;
        }
        if (statusEl) {
          showStatus('Datoen er lagt inn i skjemaet. Fullfør feltene under for å sende forespørselen.', 'info');
        }
        if (form) {
          form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      },
      select: function (selectionInfo) {
        if (dateInput) {
          dateInput.value = selectionInfo.startStr.slice(0, 10);
        }
        if (timeInput && !selectionInfo.allDay) {
          timeInput.value = selectionInfo.startStr.slice(11, 16);
        }
        if (durationInputEl && selectionInfo.end) {
          const diff = (selectionInfo.end.getTime() - selectionInfo.start.getTime()) / (60 * 60 * 1000);
          if (!Number.isNaN(diff) && diff >= 1) {
            const clamped = Math.min(12, Math.round(diff));
            durationInputEl.value = String(clamped);
          }
        }
        if (statusEl) {
          showStatus('Tidspunktet er markert. Sjekk feltene under og send inn forespørselen.', 'info');
        }
        if (form) {
          form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        calendar.unselect();
      },
      eventMouseover: function (info) {
        const tooltip = document.createElement('div');
        tooltip.id = 'fc-tooltip';
        tooltip.style.position = 'absolute';
        tooltip.style.zIndex = '10001';
        tooltip.style.background = '#fff';
        tooltip.style.border = '1px solid #ccc';
        tooltip.style.padding = '6px 9px';
        tooltip.style.borderRadius = '8px';
        tooltip.style.boxShadow = '0 8px 18px rgba(24, 61, 44, 0.18)';
        tooltip.setAttribute('role', 'tooltip');

        const start = info.event.start ? new Date(info.event.start) : null;
        const end = info.event.end ? new Date(info.event.end) : null;
        const timeRange =
          start && end
            ? `${start.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString('nb-NO', {
                hour: '2-digit',
                minute: '2-digit'
              })}`
            : start
              ? start.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })
              : '';

        tooltip.innerHTML =
          `<strong>${info.event.extendedProps?.eventType || 'Reservasjon'}</strong><br>` +
          `${info.event.extendedProps?.name || ''}<br>` +
          `${start ? start.toLocaleDateString('nb-NO') : ''} ${timeRange}`;

        document.body.appendChild(tooltip);
        info.el.addEventListener('mousemove', function (e) {
          tooltip.style.left = e.pageX + 12 + 'px';
          tooltip.style.top = e.pageY + 12 + 'px';
        });
      },
      eventMouseout: function () {
        const tooltip = document.getElementById('fc-tooltip');
        if (tooltip) tooltip.remove();
      }
    });
    calendar.render();
  }

  updateReservationList();

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();

      if (statusEl) {
        statusEl.classList.remove('is-visible', 'is-success', 'is-error', 'is-info');
        statusEl.textContent = '';
      }

      const name = document.getElementById('name')?.value.trim();
      const email = document.getElementById('email')?.value.trim();
      const dateValue = dateInput?.value;
      const timeValue = timeInput?.value;
      const durationInput = durationInputEl?.value;
      const eventType = eventTypeSelect?.value || '';
      const message = document.getElementById('message')?.value.trim() || '';

      if (!name || !email || !dateValue || !timeValue || !durationInput || !eventType) {
        showStatus('Vennligst fyll ut alle obligatoriske felter.', 'error');
        return;
      }

      const duration = parseFloat(durationInput);
      if (!Number.isFinite(duration) || duration <= 0) {
        showStatus('Varighet må være minst én time.', 'error');
        return;
      }

      const startDate = new Date(`${dateValue}T${timeValue}`);
      if (Number.isNaN(startDate.getTime())) {
        showStatus('Ugyldig dato eller klokkeslett.', 'error');
        return;
      }

      const endDate = new Date(startDate.getTime() + duration * 60 * 60 * 1000);

      const conflictingEvent = events.find((event) => {
        const existingStart = new Date(event.start);
        const existingEnd = event.end ? new Date(event.end) : existingStart;
        if (Number.isNaN(existingStart) || Number.isNaN(existingEnd)) {
          return false;
        }
        return startDate < existingEnd && endDate > existingStart;
      });

      if (conflictingEvent) {
        const conflictStart = new Date(conflictingEvent.start).toLocaleString('nb-NO');
        showStatus(`Tidsrommet er allerede holdt av (${conflictStart}). Velg et annet tidspunkt.`, 'error');
        return;
      }

      const newEvent = {
        title: `${eventType} – ${name}`,
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        extendedProps: {
          name,
          email,
          message,
          duration,
          eventType,
          createdAt: new Date().toISOString()
        }
      };

      events.push(newEvent);
      events.sort((a, b) => new Date(a.start) - new Date(b.start));

      try {
        localStorage.setItem('bookingEvents', JSON.stringify(events));
      } catch (err) {
        console.error('Kunne ikke lagre hendelse:', err);
        showStatus('Forespørselen ble sendt, men kunne ikke lagres lokalt i nettleseren.', 'error');
      }

      if (calendar) {
        calendar.addEvent(newEvent);
      }

      updateReservationList();

      form.reset();
      if (durationInputEl) {
        durationInputEl.value = '4';
      }
      if (eventTypeSelect) {
        eventTypeSelect.selectedIndex = 0;
      }

      showStatus(
        'Din bookingforespørsel er mottatt og vises nå i kalenderen. Du blir kontaktet av styret for endelig bekreftelse.'
      );
    });
  }
});
