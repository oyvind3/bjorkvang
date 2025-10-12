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

  const BOOKING_EMAIL_ENDPOINT =
    'https://bjorkvang-duhsaxahgfe0btgv.westeurope-01.azurewebsites.net/api/emailHttpTriggerBooking';

  const STATUS_VALUES = ['pending', 'confirmed', 'blocked'];

  const escapeHtml = (value) => {
    if (typeof value !== 'string') {
      return '';
    }

    const htmlEscapes = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };

    return value.replace(/[&<>"']/g, (match) => htmlEscapes[match] || match);
  };

  const formatList = (items) => (Array.isArray(items) && items.length ? items.join(', ') : 'Ikke oppgitt');

  const buildEmailPayload = (details) => {
    const {
      name,
      email,
      phone,
      message,
      eventType,
      duration,
      startDate,
      endDate,
      spaces,
      services,
      attendees
    } = details;

    const dateFormatter = new Intl.DateTimeFormat('nb-NO', {
      dateStyle: 'full',
      timeStyle: 'short'
    });

    const startLabel = dateFormatter.format(startDate);
    const endLabel = dateFormatter.format(endDate);

    const attendeesLabel = Number.isFinite(attendees) ? `${attendees} personer` : 'Ikke oppgitt';

    const textLines = [
      'Ny bookingforespørsel fra Bjørkvang-skjemaet:',
      `Navn: ${name}`,
      `E-post: ${email}`,
      `Telefon: ${phone}`,
      `Arrangementstype: ${eventType}`,
      `Start: ${startLabel}`,
      `Slutt: ${endLabel}`,
      `Varighet: ${duration} timer`,
      `Arealer: ${formatList(spaces)}`,
      `Tjenester: ${formatList(services)}`,
      `Forventet antall deltakere: ${attendeesLabel}`,
      '',
      'Tilleggsinformasjon:',
      message || 'Ingen tilleggsinformasjon.'
    ];

    const safeMessage = escapeHtml(message || '');

    const html = `
      <h1>Ny bookingforespørsel</h1>
      <p>Det har kommet en ny forespørsel via skjemaet på bjorkvang.no.</p>
      <table style="border-collapse:collapse;width:100%;max-width:600px" border="0" cellpadding="8">
        <tbody>
          <tr>
            <th align="left" style="text-align:left;border-bottom:1px solid #e2e8f0;">Navn</th>
            <td style="border-bottom:1px solid #e2e8f0;">${escapeHtml(name)}</td>
          </tr>
          <tr>
            <th align="left" style="text-align:left;border-bottom:1px solid #e2e8f0;">E-post</th>
            <td style="border-bottom:1px solid #e2e8f0;">${escapeHtml(email)}</td>
          </tr>
          <tr>
            <th align="left" style="text-align:left;border-bottom:1px solid #e2e8f0;">Telefon</th>
            <td style="border-bottom:1px solid #e2e8f0;">${escapeHtml(phone)}</td>
          </tr>
          <tr>
            <th align="left" style="text-align:left;border-bottom:1px solid #e2e8f0;">Arrangementstype</th>
            <td style="border-bottom:1px solid #e2e8f0;">${escapeHtml(eventType)}</td>
          </tr>
          <tr>
            <th align="left" style="text-align:left;border-bottom:1px solid #e2e8f0;">Start</th>
            <td style="border-bottom:1px solid #e2e8f0;">${escapeHtml(startLabel)}</td>
          </tr>
          <tr>
            <th align="left" style="text-align:left;border-bottom:1px solid #e2e8f0;">Slutt</th>
            <td style="border-bottom:1px solid #e2e8f0;">${escapeHtml(endLabel)}</td>
          </tr>
          <tr>
            <th align="left" style="text-align:left;border-bottom:1px solid #e2e8f0;">Varighet</th>
            <td style="border-bottom:1px solid #e2e8f0;">${escapeHtml(`${duration} timer`)}</td>
          </tr>
          <tr>
            <th align="left" style="text-align:left;border-bottom:1px solid #e2e8f0;">Arealer</th>
            <td style="border-bottom:1px solid #e2e8f0;">${escapeHtml(formatList(spaces))}</td>
          </tr>
          <tr>
            <th align="left" style="text-align:left;border-bottom:1px solid #e2e8f0;">Tjenester</th>
            <td style="border-bottom:1px solid #e2e8f0;">${escapeHtml(formatList(services))}</td>
          </tr>
          <tr>
            <th align="left" style="text-align:left;border-bottom:1px solid #e2e8f0;">Forventet antall</th>
            <td style="border-bottom:1px solid #e2e8f0;">${escapeHtml(attendeesLabel)}</td>
          </tr>
        </tbody>
      </table>
      <h2 style="margin-top:24px">Tilleggsinformasjon</h2>
      <p style="white-space:pre-line">${safeMessage || 'Ingen tilleggsinformasjon.'}</p>
    `;

    return {
      to: 'skype.oyvind@hotmail.com',
      from: 'booking@finsrud.cloud',
      subject: `Ny bookingforespørsel: ${eventType} – ${startLabel}`,
      text: textLines.join('\n'),
      html
    };
  };

  async function sendBookingEmail(formElement) {
    const data = Object.fromEntries(new FormData(formElement));
  
    // 👇 logg hva som faktisk sendes
    console.log("Sender bookingdata:", data);
  
    const payload = {
      to: "skype.oyvind@hotmail.com",
      from: "booking@finsrud.cloud",
      subject: "Ny bookingforespørsel fra nettsiden",
      html: `<h3>Ny forespørsel</h3>
             <p><strong>Navn:</strong> ${data.name || "(mangler)"}</p>
             <p><strong>E-post:</strong> ${data.email || "(mangler)"}</p>
             <p><strong>Tidspunkt:</strong> ${data.time || "(mangler)"}</p>`
    };
  
    console.log("Sender payload:", payload);
  
    const response = await fetch(
      "https://bjorkvang-duhsaxahgfe0btgv.westeurope-01.azurewebsites.net/api/emailHttpTriggerBooking",
      {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    );
  
    console.log("Respons status:", response.status);
    const text = await response.text();
    console.log("Respons body:", text);
  
    if (!response.ok) throw new Error("Kunne ikke sende bookingforespørselen.");
    return JSON.parse(text);
  };
  

  const normaliseStatus = (value, fallback = 'pending') => {
    if (typeof value !== 'string') {
      return fallback;
    }
    const trimmed = value.trim().toLowerCase();
    return STATUS_VALUES.includes(trimmed) ? trimmed : fallback;
  };

  const statusLabels = {
    pending: 'Venter bekreftelse',
    confirmed: 'Bekreftet',
    blocked: 'Ikke tilgjengelig'
  };

  const statusPriority = {
    pending: 1,
    confirmed: 2,
    blocked: 3
  };

  const getStatusLabel = (status) => statusLabels[status] || statusLabels.pending;

  const computeSuggestedStatus = (spaces, duration, existingStatus) => {
    if (existingStatus && STATUS_VALUES.includes(existingStatus)) {
      return existingStatus;
    }
    if (Array.isArray(spaces) && spaces.some((space) => space.toLowerCase() === 'hele lokalet')) {
      return 'confirmed';
    }
    if (Number.isFinite(duration) && duration >= 8) {
      return 'confirmed';
    }
    return 'pending';
  };

  const highlightDayCells = () => {
    if (!calendarEl) {
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dayCells = calendarEl.querySelectorAll('.fc-daygrid-day');
    dayCells.forEach((cell) => {
      const dateStr = cell.getAttribute('data-date');
      cell.classList.remove('is-available', 'is-pending', 'is-booked', 'is-blocked', 'is-past');
      if (!dateStr) {
        return;
      }

      const date = new Date(`${dateStr}T00:00:00`);
      if (Number.isNaN(date.getTime())) {
        return;
      }

      if (date < today) {
        cell.classList.add('is-past');
        return;
      }

      const dayStart = new Date(date);
      const dayEnd = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      dayEnd.setHours(23, 59, 59, 999);

      let strongestStatus = null;
      let strongestPriority = 0;

      events.forEach((event) => {
        const start = new Date(event.start);
        const end = event.end ? new Date(event.end) : new Date(start.getTime() + (event.extendedProps?.duration || 1) * 60 * 60 * 1000);

        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
          return;
        }

        if (start <= dayEnd && end >= dayStart) {
          const status = normaliseStatus(event.extendedProps?.status, 'pending');
          const priority = statusPriority[status] || 0;
          if (priority > strongestPriority) {
            strongestPriority = priority;
            strongestStatus = status;
          }
        }
      });

      if (!strongestStatus) {
        cell.classList.add('is-available');
        return;
      }

      if (strongestStatus === 'pending') {
        cell.classList.add('is-pending');
      } else {
        cell.classList.add('is-blocked');
      }
    });
  };

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
    const name = (extended.name || '').trim();
    const eventType = extended.eventType || 'Reservasjon';
    const message = extended.message || '';
    const email = extended.email || '';
    const phone = extended.phone || '';
    const duration = extended.duration || Math.max(1, Math.round((safeEnd - startDate) / (60 * 60 * 1000)));
    const spaces = Array.isArray(extended.spaces)
      ? extended.spaces
      : typeof extended.spaces === 'string' && extended.spaces.length > 0
        ? extended.spaces.split(',').map((value) => value.trim()).filter(Boolean)
        : [];
    const services = Array.isArray(extended.services)
      ? extended.services
      : typeof extended.services === 'string' && extended.services.length > 0
        ? extended.services.split(',').map((value) => value.trim()).filter(Boolean)
        : [];
    const attendees =
      typeof extended.attendees === 'number'
        ? extended.attendees
        : typeof extended.attendees === 'string' && extended.attendees.trim() !== ''
          ? Number.parseInt(extended.attendees, 10)
          : null;
    const status = computeSuggestedStatus(spaces, duration, normaliseStatus(extended.status, ''));

    return {
      title: eventType || 'Reservert',
      start: startDate.toISOString(),
      end: safeEnd.toISOString(),
      extendedProps: {
        ...extended,
        name,
        email,
        phone,
        message,
        duration,
        eventType,
        spaces,
        services,
        attendees: Number.isFinite(attendees) ? attendees : null,
        status,
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

      const status = normaliseStatus(event.extendedProps?.status, 'pending');
      const statusBadge = document.createElement('span');
      statusBadge.className = `reservation-status reservation-status--${status}`;
      statusBadge.textContent = getStatusLabel(status);
      header.appendChild(statusBadge);

      listItem.appendChild(header);

      const host = document.createElement('p');
      host.className = 'reservation-meta';
      host.textContent = 'Kontakt styret for detaljer om denne reservasjonen.';
      listItem.appendChild(host);

      const durationHours = event.extendedProps?.duration || Math.max(1, Math.round((endDate - startDate) / (60 * 60 * 1000)));
      const duration = document.createElement('p');
      duration.className = 'reservation-meta';
      duration.textContent = `Varighet: ${durationHours} ${durationHours === 1 ? 'time' : 'timer'}`;
      listItem.appendChild(duration);

      if (event.extendedProps?.spaces?.length) {
        const spaces = document.createElement('p');
        spaces.className = 'reservation-meta';
        spaces.textContent = `Omfang: ${event.extendedProps.spaces.join(', ')}`;
        listItem.appendChild(spaces);
      }

      if (Number.isFinite(event.extendedProps?.attendees) && event.extendedProps.attendees > 0) {
        const attendees = document.createElement('p');
        attendees.className = 'reservation-meta';
        attendees.textContent = `Antall deltakere (ca.): ${event.extendedProps.attendees}`;
        listItem.appendChild(attendees);
      }

      if (event.extendedProps?.services?.length) {
        const services = document.createElement('p');
        services.className = 'reservation-meta';
        services.textContent = `Tillegg: ${event.extendedProps.services.join(', ')}`;
        listItem.appendChild(services);
      }

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
      eventClassNames: function (arg) {
        const status = normaliseStatus(arg.event.extendedProps?.status, 'pending');
        return [`fc-event--${status}`];
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
      eventDidMount: function (info) {
        const removeTooltip = () => {
          const tooltip = document.getElementById('fc-tooltip');
          if (tooltip) {
            tooltip.remove();
          }
        };

        const handleMouseMove = (event) => {
          const tooltip = document.getElementById('fc-tooltip');
          if (!tooltip) {
            return;
          }
          tooltip.style.left = event.pageX + 12 + 'px';
          tooltip.style.top = event.pageY + 12 + 'px';
        };

        const handleMouseEnter = () => {
          removeTooltip();

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

          const spaces = Array.isArray(info.event.extendedProps?.spaces) && info.event.extendedProps.spaces.length
            ? `<br>${info.event.extendedProps.spaces.join(', ')}`
            : '';
          tooltip.innerHTML =
            `<strong>${info.event.extendedProps?.eventType || 'Reservasjon'}</strong><br>` +
            `${start ? start.toLocaleDateString('nb-NO') : ''} ${timeRange}` +
            (spaces ? `<br>${spaces.replace(/^<br>/, '')}` : '');

          document.body.appendChild(tooltip);
          info.el.addEventListener('mousemove', handleMouseMove);
        };

        const handleMouseLeave = () => {
          info.el.removeEventListener('mousemove', handleMouseMove);
          removeTooltip();
        };

        info.el.addEventListener('mouseenter', handleMouseEnter);
        info.el.addEventListener('mouseleave', handleMouseLeave);

        info.el._bookingHandleMouseEnter = handleMouseEnter;
        info.el._bookingHandleMouseLeave = handleMouseLeave;
        info.el._bookingHandleMouseMove = handleMouseMove;
      },
      eventWillUnmount: function (info) {
        const tooltip = document.getElementById('fc-tooltip');
        if (tooltip) {
          tooltip.remove();
        }

        if (info?.el) {
          if (info.el._bookingHandleMouseEnter) {
            info.el.removeEventListener('mouseenter', info.el._bookingHandleMouseEnter);
            delete info.el._bookingHandleMouseEnter;
          }

          if (info.el._bookingHandleMouseLeave) {
            info.el.removeEventListener('mouseleave', info.el._bookingHandleMouseLeave);
            delete info.el._bookingHandleMouseLeave;
          }

          if (info.el._bookingHandleMouseMove) {
            info.el.removeEventListener('mousemove', info.el._bookingHandleMouseMove);
            delete info.el._bookingHandleMouseMove;
          }
        }
      },
      datesSet: function () {
        requestAnimationFrame(() => {
          highlightDayCells();
        });
      },
      eventsSet: function () {
        requestAnimationFrame(() => {
          highlightDayCells();
        });
      }
    });
    calendar.render();
    highlightDayCells();
  }

  updateReservationList();
  highlightDayCells();

  if (form) {
    form.addEventListener('submit', async function (e) {
      e.preventDefault();

      if (statusEl) {
        statusEl.classList.remove('is-visible', 'is-success', 'is-error', 'is-info');
        statusEl.textContent = '';
      }

      const formData = new FormData(form);
      const formValues = Object.fromEntries(formData.entries());

      const name = (formValues.name || '').trim();
      const email = (formValues.email || '').trim();
      const phone = (formValues.phone || '').trim();
      const dateValue = formValues.date || '';
      const timeValue = formValues.time || '';
      const durationInput = formValues.duration || '';
      const eventType = (formValues.eventType || '').trim();
      const message = (formValues.message || '').trim();
      const attendeesValue = (formValues.attendees || '').trim();
      const selectedSpaces = Array.from(form.querySelectorAll('input[name="spaces"]:checked')).map((input) => input.value);
      const selectedServices = Array.from(form.querySelectorAll('input[name="services"]:checked')).map((input) => input.value);

      if (!name || !email || !phone || !dateValue || !timeValue || !durationInput || !eventType) {
        showStatus('Vennligst fyll ut alle obligatoriske felter.', 'error');
        return;
      }

      if (!selectedSpaces.length) {
        showStatus('Velg minst ett område du ønsker å leie.', 'error');
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

      const attendeeCount = attendeesValue !== '' && Number.isFinite(Number.parseInt(attendeesValue, 10))
        ? Number.parseInt(attendeesValue, 10)
        : null;

      const status = computeSuggestedStatus(selectedSpaces, duration, '');

      const bookingDetails = {
        name,
        email,
        phone,
        message,
        duration,
        eventType,
        spaces: selectedSpaces,
        services: selectedServices,
        attendees: attendeeCount,
        startDate,
        endDate
      };

      try {
        showStatus('Sender forespørselen ...', 'info');
        await sendBookingEmail(formData, bookingDetails);
      } catch (error) {
        console.error('Kunne ikke sende bookingforespørsel:', error);
        showStatus(
          'Kunne ikke sende bookingforespørselen. Sjekk nettforbindelsen og prøv igjen litt senere.',
          'error'
        );
        return;
      }

      const { startDate: startDateObj, endDate: endDateObj, ...restDetails } = bookingDetails;

      const newEvent = {
        title: eventType || 'Reservert',
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        extendedProps: {
          ...restDetails,
          startDate: startDateObj.toISOString(),
          endDate: endDateObj.toISOString(),
          status,
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
        highlightDayCells();
      }

      updateReservationList();
      highlightDayCells();

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
