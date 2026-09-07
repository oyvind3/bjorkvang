// booking.js
// Denne filen initialiserer en enkel kalender ved hjelp av FullCalendar
// og legger til funksjonalitet for å sende inn en bookingforespørsel.

document.addEventListener('DOMContentLoaded', function () {
  const calendarEl = document.getElementById('calendar');
  const form = document.getElementById('booking-form');
  const statusEl = document.getElementById('booking-status');
  const reservationListEl = document.getElementById('reservation-list');

  // Site notice dismiss handler
  const siteNotice = document.getElementById('site-notice-fullbooked');
  if (siteNotice) {
    if (localStorage.getItem('bjorkvangNoticeDismissed2026') === '1') {
      siteNotice.hidden = true;
    }
    const noticeCloseBtn = siteNotice.querySelector('.site-notice__close');
    if (noticeCloseBtn) {
      noticeCloseBtn.addEventListener('click', () => {
        siteNotice.classList.add('site-notice--dismissing');
        setTimeout(() => { siteNotice.hidden = true; }, 250);
        localStorage.setItem('bjorkvangNoticeDismissed2026', '1');
      });
    }
  }
  const reservationEmptyState = document.getElementById('reservation-empty');
  const dateInput = document.getElementById('date');
  const timeInput = document.getElementById('time');

  // Flatpickr date picker — Norwegian locale, no past dates
  let datepicker = null;
  if (dateInput && typeof flatpickr !== 'undefined') {
    datepicker = flatpickr(dateInput, {
      locale: 'no',
      dateFormat: 'Y-m-d',
      minDate: 'today',
      disableMobile: false,
      allowInput: true,
      nextArrow: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
      prevArrow: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
      onChange: (_selectedDates, dateStr) => { updateDateAvailability(dateStr); },
    });
  } else if (dateInput) {
    dateInput.addEventListener('change', (e) => { updateDateAvailability(e.target.value); });
  }
  const durationInputEl = document.getElementById('duration');
  const endDateInputEl = document.getElementById('end-date');
  const endTimeInputEl = document.getElementById('end-time');
  const durationFieldEl = document.getElementById('duration-field');
  const endDateFieldEl = document.getElementById('end-date-field');
  const endTimeFieldEl = document.getElementById('end-time-field');
  const normalDatetimeFieldsEl = document.getElementById('normal-datetime-fields');
  const weddingCardEl = document.getElementById('wedding-weekend-card');
  const weddingWeekendTextEl = document.getElementById('wedding-weekend-text');
  const weddingChangeBtnEl = document.getElementById('wedding-change-btn');
  const weddingDatePickerWrapEl = document.getElementById('wedding-date-picker-wrap');
  const weddingDatePickerEl = document.getElementById('wedding-date-picker');
  const eventTypeSelect = document.getElementById('event-type');
  const calculatedPriceEl = document.getElementById('calculated-price');
  const attendeesInput = document.getElementById('attendees');

  const STATUS_VALUES = ['pending', 'confirmed', 'blocked'];

  // Pricing structure
  const PRICING = {
    'Peisestue': 1500,
    'Salen': 3000,
    'Hele lokalet': 4000,
    'Bryllupspakke': 6000,
    'Små møter': 30, // per person
    'Projektor': 500
  };

  const SERVICE_PRICING = ['Projektor'];

  const MEMBER_DISCOUNT = 500;
  const MEMBER_ELIGIBLE_SPACES = ['Hele lokalet', 'Bryllupspakke'];

  const MINNESTUND_RATE = 30; // kr per person

  // Calculate total price based on selected spaces, services, attendees and member discount
  const calculatePrice = () => {
    const spacesCheckboxes = form.querySelectorAll('input[name="spaces"]:checked');
    const selectedSpaces = Array.from(spacesCheckboxes).map(cb => cb.value);
    const servicesCheckboxes = form.querySelectorAll('input[name="services"]:checked');
    const selectedServices = Array.from(servicesCheckboxes).map(cb => cb.value);
    const attendees = parseInt(attendeesInput?.value) || 10;
    const eventType = form.querySelector('#event-type')?.value;

    // Minnesamvær: override all space pricing — flat rate per person
    if (eventType === 'Minnestund') {
      return attendees * MINNESTUND_RATE;
    }

    let total = 0;
    selectedSpaces.forEach(space => {
      if (space === 'Små møter') {
        total += PRICING[space] * attendees;
      } else if (PRICING[space]) {
        total += PRICING[space];
      }
    });

    // Add priced services (e.g. Projektor)
    selectedServices.forEach(service => {
      if (SERVICE_PRICING.includes(service) && PRICING[service]) {
        total += PRICING[service];
      }
    });

    // Apply member discount if eligible space is selected and box is checked
    const memberCheckbox = form.querySelector('#is-member');
    const isEligible = selectedSpaces.some(s => MEMBER_ELIGIBLE_SPACES.includes(s));
    if (memberCheckbox?.checked && isEligible) {
      total = Math.max(0, total - MEMBER_DISCOUNT);
    }

    return total;
  };

  // Show/hide member discount section based on eligible space selection
  const WHOLE_PREMISES = ['Hele lokalet', 'Bryllupspakke'];
  const INDIVIDUAL_SPACES = ['Peisestue', 'Salen', 'Små møter'];

  /**
   * Enforce mutual exclusion between spaces:
   * - Whole-premises (Hele lokalet / Bryllupspakke) locks out everything else.
   * - Individual rooms lock out whole-premises options and each other
   *   (only one individual room at a time).
   */
  const enforceSpaceMutualExclusion = (changed) => {
    if (!changed.checked) return; // unchecking never triggers side-effects
    const allSpaces = Array.from(form.querySelectorAll('input[name="spaces"]'));
    const val = changed.value;

    if (WHOLE_PREMISES.includes(val)) {
      // Uncheck everything except the one just selected
      allSpaces.forEach(cb => { if (cb !== changed) cb.checked = false; });
    } else if (INDIVIDUAL_SPACES.includes(val)) {
      // Uncheck whole-premises options and sibling individual rooms
      allSpaces.forEach(cb => {
        if (cb !== changed && (WHOLE_PREMISES.includes(cb.value) || INDIVIDUAL_SPACES.includes(cb.value))) {
          cb.checked = false;
        }
      });
    }
  };

  const toggleMemberDiscount = () => {
    const section = document.getElementById('member-discount-section');
    if (!section) return;
    const spacesCheckboxes = form.querySelectorAll('input[name="spaces"]:checked');
    const selectedSpaces = Array.from(spacesCheckboxes).map(cb => cb.value);
    const eligible = selectedSpaces.some(s => MEMBER_ELIGIBLE_SPACES.includes(s));
    section.hidden = !eligible;
    if (!eligible) {
      const memberCheckbox = form.querySelector('#is-member');
      if (memberCheckbox) memberCheckbox.checked = false;
    }
  };

  // Update price display
  const updatePriceDisplay = () => {
    if (!calculatedPriceEl) return;

    const total = calculatePrice();
    if (total > 0) {
      calculatedPriceEl.textContent = `Estimert pris: ${total.toLocaleString('nb-NO')} kr`;
      calculatedPriceEl.style.fontWeight = 'bold';
    } else {
      calculatedPriceEl.textContent = 'Estimert pris: Velg lokaler';
      calculatedPriceEl.style.fontWeight = 'normal';
    }
  };

  // Watch for changes to spaces and attendees
  // Update submit button label when payment method changes
  if (form) {
    const submitBtn = document.getElementById('submit-btn');
    const paymentRadios = form.querySelectorAll('input[name="paymentMethod"]');
    const updateSubmitLabel = () => {
      if (submitBtn) {
        submitBtn.textContent = 'Send bookingforespørsel';
      }
    };
    paymentRadios.forEach(r => r.addEventListener('change', updateSubmitLabel));
  }

  if (form) {
    const spacesCheckboxes = form.querySelectorAll('input[name="spaces"]');
    spacesCheckboxes.forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        enforceSpaceMutualExclusion(checkbox);
        toggleMemberDiscount();
        updatePriceDisplay();
        // If Bryllupspakke was deselected (directly or via mutex), hide the card
        const bryllupStillChecked = !!form.querySelector('input[name="spaces"][value="Bryllupspakke"]:checked');
        if (!bryllupStillChecked) hideWeddingCard();
      });
    });

    const memberCheckbox = form.querySelector('#is-member');
    if (memberCheckbox) {
      memberCheckbox.addEventListener('change', updatePriceDisplay);
    }

    const servicesCheckboxes = form.querySelectorAll('input[name="services"]');
    servicesCheckboxes.forEach(checkbox => {
      checkbox.addEventListener('change', updatePriceDisplay);
    });

    if (attendeesInput) {
      attendeesInput.addEventListener('input', updatePriceDisplay);
    }

    if (eventTypeSelect) {
      eventTypeSelect.addEventListener('change', () => {
        const isMinnestund = eventTypeSelect.value === 'Minnestund';
        const hint = document.getElementById('minnestund-hint');
        if (hint) hint.style.display = isMinnestund ? '' : 'none';
        updatePriceDisplay();
      });
    }

    // Live "slutter ca." summary when time + duration are both filled
    const endTimeSummaryWrap = document.getElementById('end-time-summary');
    const endTimeSummaryEl = endTimeSummaryWrap ? endTimeSummaryWrap.querySelector('.end-time-summary') : null;
    const timeSelectEl = document.getElementById('time');

    const updateEndTimeSummary = () => {
      if (!endTimeSummaryWrap || !endTimeSummaryEl || !timeSelectEl || !durationInputEl) return;
      const timeVal = timeSelectEl.value;
      const durationVal = parseFloat(durationInputEl.value);
      if (!timeVal || !Number.isFinite(durationVal) || durationVal <= 0) {
        endTimeSummaryWrap.hidden = true;
        return;
      }
      const [hours, minutes] = timeVal.split(':').map(Number);
      const totalMinutes = hours * 60 + minutes + durationVal * 60;
      const endH = String(Math.floor((totalMinutes % (24 * 60)) / 60)).padStart(2, '0');
      const endM = String(totalMinutes % 60).padStart(2, '0');
      const overnight = totalMinutes >= 24 * 60 ? ' (neste dag)' : '';
      endTimeSummaryEl.textContent = `\u23F0 Slutter ca. ${endH}:${endM}${overnight}`;
      endTimeSummaryWrap.hidden = false;
    };

    if (timeSelectEl) timeSelectEl.addEventListener('change', updateEndTimeSummary);
    if (durationInputEl) durationInputEl.addEventListener('input', updateEndTimeSummary);
  }

  // Debounce utility to prevent excessive function calls
  const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  };

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

  const isValidEmail = (value) => {
    if (typeof value !== 'string') {
      return false;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return false;
    }
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
  };

  const isLocal = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
  const API_BASE_URL = isLocal 
    ? 'http://localhost:7071' 
    : 'https://bjorkvang-duhsaxahgfe0btgv.westeurope-01.azurewebsites.net';
  
  const BOOKING_API_ENDPOINT = `${API_BASE_URL}/api/booking`;
  const CALENDAR_API_ENDPOINT = `${API_BASE_URL}/api/booking/calendar`;

  async function submitBooking(bookingDetails) {
      // Valider at startDate eksisterer og er en gyldig dato
      if (!bookingDetails.startDate || !(bookingDetails.startDate instanceof Date) || Number.isNaN(bookingDetails.startDate.getTime())) {
          throw new Error('Ugyldig startdato. Vennligst velg en gyldig dato og klokkeslett.');
      }

      // Valider at endDate eksisterer og er en gyldig dato (hvis angitt)
      if (bookingDetails.endDate && (!(bookingDetails.endDate instanceof Date) || Number.isNaN(bookingDetails.endDate.getTime()))) {
          throw new Error('Ugyldig sluttdato. Vennligst velg en gyldig sluttdato og klokkeslett.');
      }

      const payload = {
          date: bookingDetails.startDate.toISOString().split('T')[0],
          time: bookingDetails.startDate.toTimeString().slice(0, 5),
          requesterName: bookingDetails.name,
          requesterEmail: bookingDetails.email,
          phone: bookingDetails.phone,
          address: bookingDetails.address,
          message: bookingDetails.message,
          duration: bookingDetails.duration,
          eventType: bookingDetails.eventType,
          spaces: bookingDetails.spaces,
          services: bookingDetails.services,
          attendees: bookingDetails.attendees,
          isMember: bookingDetails.isMember || false,
          cateringContact: bookingDetails.cateringContact || false,
          ageVerified: bookingDetails.ageVerified || false,
          paymentMethod: bookingDetails.paymentMethod || 'vipps',
          paymentStatus: 'unpaid',
          totalAmount: bookingDetails.totalAmount || null,
          'cf-turnstile-response': bookingDetails.turnstileResponse,
      };

      const response = await fetch(BOOKING_API_ENDPOINT, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
      });

      if (!response.ok) {
          const errorData = await response.json();
          // For 409 double-booking conflicts, prefer the detailed message over the short error code
          const errorMessage = response.status === 409
              ? (errorData.message || 'Det valgte tidspunktet er ikke tilgjengelig. Vennligst velg et annet tidspunkt.')
              : (errorData.error || 'Kunne ikke sende bookingforespørsel');
          throw new Error(errorMessage);
      }

      return await response.json();
  }
  

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

  const updateDateAvailability = (dateStr) => {
    const el = document.getElementById('date-availability');
    if (!el) return;

    if (!dateStr) {
      el.hidden = true;
      el.className = 'date-availability';
      return;
    }

    const date = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
      el.hidden = true;
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
      const end = event.end
        ? new Date(event.end)
        : new Date(start.getTime() + (event.extendedProps?.duration || 1) * 60 * 60 * 1000);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
      // Event end is exclusive: an event ending at 00:00 does not occupy that day.
      if (start <= dayEnd && end > dayStart) {
        const status = normaliseStatus(event.extendedProps?.status, 'pending');
        const priority = statusPriority[status] || 0;
        if (priority > strongestPriority) {
          strongestPriority = priority;
          strongestStatus = status;
        }
      }
    });

    el.className = 'date-availability';
    if (!strongestStatus) {
      el.classList.add('date-availability--available');
      el.textContent = '✓ Datoen ser ut til å være ledig';
    } else if (strongestStatus === 'pending') {
      el.classList.add('date-availability--pending');
      el.textContent = '⚠ Det finnes allerede en forespørsel for denne datoen';
    } else {
      el.classList.add('date-availability--booked');
      el.textContent = '✗ Datoen er opptatt';
    }
    el.hidden = false;
  };

  const highlightDayCells = () => {
    if (!calendarEl) {
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Use querySelectorAll once and cache the result
    const dayCells = calendarEl.querySelectorAll('.fc-daygrid-day');
    if (!dayCells.length) {
      return;
    }
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

        // Event end is exclusive: an event ending at 00:00 does not occupy that day.
        if (start <= dayEnd && end > dayStart) {
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

  const showStatus = (message, type = 'success', focusTarget = null) => {
    if (!statusEl) {
      if (type === 'error') {
        alert(message);
      }
      return;
    }

    // Clear previous invalid highlights
    form.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));

    statusEl.textContent = message;
    statusEl.classList.remove('is-success', 'is-error', 'is-info', 'is-visible');
    statusEl.classList.add('is-visible');

    if (type === 'error') {
      statusEl.classList.add('is-error');
      if (focusTarget) {
        focusTarget.classList.add('is-invalid');
        focusTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
        focusTarget.focus({ preventScroll: true });
      }
      // Always scroll the status message into view so it's visible on mobile
      setTimeout(() => statusEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), focusTarget ? 350 : 0);
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
    const suppliedDuration = Number(event.extendedProps?.duration);
    const durationHours = Number.isFinite(suppliedDuration) && suppliedDuration > 0
      ? suppliedDuration
      : 4;
    const endDate = hasEnd
      ? new Date(event.end)
      : new Date(startDate.getTime() + durationHours * 60 * 60 * 1000);
    const safeEnd = Number.isNaN(endDate.getTime()) ? new Date(startDate.getTime() + 4 * 60 * 60 * 1000) : endDate;

    const extended = { ...(event.extendedProps || {}) };
    const name = (extended.name || '').trim();
    const eventType = extended.eventType || 'Reservasjon';
    const message = extended.message || '';
    const email = extended.email || '';
    const phone = extended.phone || '';
    const duration = Number.isFinite(suppliedDuration) && suppliedDuration > 0
      ? suppliedDuration
      : Math.max(1, Math.round((safeEnd - startDate) / (60 * 60 * 1000)));
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
    
    // Add visual indicator for pending events in the title
    let title = event.title || eventType || 'Reservert';
    if (status === 'pending') {
        title = `${title} (Venter)`;
    }

    return {
      title: title,
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

  const getCompactEventLabel = (event, maxLength = 18) => {
    const rawTitle = (event?.title || '').replace(/\s*\(Venter\)\s*$/i, '').trim();
    const eventType = (event?.extendedProps?.eventType || '').trim();

    let label = rawTitle || eventType || 'Reservasjon';

    if (/^helg\s*[\u2013-]/i.test(label) || /^helg$/i.test(label)) {
      label = 'Helg';
    } else if (/^møte eller kurs$/i.test(eventType) && rawTitle) {
      label = rawTitle;
    } else if (/^reservasjon$/i.test(label) && eventType) {
      label = eventType;
    }

    if (label.length <= maxLength) {
      return label;
    }

    const shortened = label.slice(0, maxLength).trim();
    return `${shortened.replace(/[\s.,;:!-]+$/g, '')}…`;
  };

  const getEventTimeRangeLabel = (event) => {
    const start = event?.start ? new Date(event.start) : null;
    const end = event?.end ? new Date(event.end) : null;
    if (!start || Number.isNaN(start.getTime())) {
      return '';
    }
    const startTime = start.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
    if (!end || Number.isNaN(end.getTime())) {
      return startTime;
    }
    const endTime = end.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
    return `${startTime}-${endTime}`;
  };

  const getTooltipDetails = (event) => {
    const start = event?.start ? new Date(event.start) : null;
    const end = event?.end ? new Date(event.end) : null;
    const spaces = Array.isArray(event?.extendedProps?.spaces) && event.extendedProps.spaces.length
      ? event.extendedProps.spaces.join(', ')
      : '';
    const status = normaliseStatus(event?.extendedProps?.status, 'pending');
    const statusText = getStatusLabel(status);

    const dateText = start
      ? start.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : '';

    return {
      title: (event?.title || event?.extendedProps?.eventType || 'Reservasjon').replace(/\s*\(Venter\)\s*$/i, '').trim(),
      dateText,
      timeText: getEventTimeRangeLabel({ start, end }),
      spaces,
      statusText
    };
  };

  const removeCalendarTooltip = () => {
    const tooltip = document.getElementById('fc-tooltip');
    if (tooltip && tooltip.parentNode) {
      tooltip.remove();
    }
  };

  const positionCalendarTooltip = (clientX, clientY) => {
    const tooltip = document.getElementById('fc-tooltip');
    if (!tooltip) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const tw = tooltip.offsetWidth || 280;
    const th = tooltip.offsetHeight || 120;
    const gap = 14;
    let left = clientX + gap;
    let top = clientY + gap;
    if (left + tw > vw - 8) left = clientX - tw - gap;
    if (top + th > vh - 8) top = clientY - th - gap;
    tooltip.style.left = Math.max(4, left) + 'px';
    tooltip.style.top = Math.max(4, top) + 'px';
  };

  const buildCalendarTooltip = (event, clientX, clientY) => {
    removeCalendarTooltip();

    const tooltip = document.createElement('div');
    tooltip.id = 'fc-tooltip';
    tooltip.className = 'calendar-tooltip';
    tooltip.setAttribute('role', 'tooltip');

    const { title, dateText, timeText, spaces, statusText } = getTooltipDetails(event);

    const titleEl = document.createElement('div');
    titleEl.className = 'calendar-tooltip__title';
    titleEl.textContent = title;
    tooltip.appendChild(titleEl);

    if (dateText) {
      const dateEl = document.createElement('div');
      dateEl.className = 'calendar-tooltip__meta';
      dateEl.textContent = dateText;
      tooltip.appendChild(dateEl);
    }

    if (timeText) {
      const timeEl = document.createElement('div');
      timeEl.className = 'calendar-tooltip__meta';
      timeEl.textContent = timeText;
      tooltip.appendChild(timeEl);
    }

    if (spaces) {
      const spacesEl = document.createElement('div');
      spacesEl.className = 'calendar-tooltip__subtle';
      spacesEl.textContent = spaces;
      tooltip.appendChild(spacesEl);
    }

    const statusEl = document.createElement('div');
    statusEl.className = 'calendar-tooltip__status';
    statusEl.textContent = statusText;
    tooltip.appendChild(statusEl);

    document.body.appendChild(tooltip);
    positionCalendarTooltip(clientX, clientY);
  };

  const loadEvents = async () => {
    try {
      const response = await fetch(CALENDAR_API_ENDPOINT);
      if (!response.ok) {
        // Fallback to local storage if API fails (e.g. offline)
        console.warn('API request failed, falling back to local storage');
        throw new Error('API failed');
      }
      const data = await response.json();
      const serverEvents = data.bookings || [];
      
      return serverEvents.map(booking => {
          return normaliseEvent({
              title: booking.title || 'Reservasjon',
              start: `${booking.date}T${booking.time}`,
              extendedProps: {
                  ...booking,
                  eventType: booking.eventType || 'Reservasjon',
                  status: booking.status === 'approved' ? 'confirmed' : booking.status
              }
          });
      }).filter(Boolean);
    } catch (error) {
      console.warn('Kunne ikke laste kalender fra server, sjekker lokallager:', error);
      try {
        const stored = localStorage.getItem('bookingEvents');
        if (!stored) return [];
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed.map(normaliseEvent).filter(Boolean) : [];
      } catch (localError) {
        console.error('Kunne ikke lese lokallager:', localError);
        return [];
      }
    }
  };

  const ensureSeedEvents = (eventList) => {
    const seedEvents = [
      {
        title: 'Basar – hele lokalet',
        start: '2024-11-02T14:00:00',
        end: '2024-11-03T17:00:00',
        extendedProps: {
          eventType: 'Basar',
          message:
            'Helgøens Vel arrangerer åpen basar denne helgen. Åpningstider: 14.00–17.00 både lørdag og søndag. Trekningen starter søndag kl. 17.00, og hele salen er reservert til felles og offentlig arrangement.',
          spaces: ['Hele lokalet'],
          services: [],
          duration: 6,
          status: 'confirmed',
          createdAt: '2024-06-01T00:00:00.000Z'
        }
      },
      {
        title: 'Basar 1. november 2025',
        start: '2025-11-01T14:00:00',
        end: '2025-11-01T17:00:00',
        extendedProps: {
          eventType: 'Basar',
          message:
            'Åpen bygdebasar med aktiviteter, kafé og loddsalg. Åpent 14.00–17.00 lørdag, og hele lokalet er reservert til fellesarrangement.',
          spaces: ['Hele lokalet'],
          services: ['Frivillige'],
          duration: 3,
          status: 'confirmed',
          createdAt: '2025-05-15T00:00:00.000Z'
        }
      },
      {
        title: 'Basar 2. november 2025',
        start: '2025-11-02T14:00:00',
        end: '2025-11-02T17:00:00',
        extendedProps: {
          eventType: 'Basar',
          message:
            'Søndagsfinale for basarhelgen med trekninger, kaffekos og aktiviteter for alle generasjoner. Åpent 14.00–17.00, og trekningen starter søndag kl. 17.00.',
          spaces: ['Hele lokalet'],
          services: ['Frivillige'],
          duration: 3,
          status: 'confirmed',
          createdAt: '2025-05-15T00:00:00.000Z'
        }
      }
    ];

    // ── Gjentakende bookinger 2026 ──────────────────────────────────────────
    const _fmtDt = (d, time) => {
      const y = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const da = String(d.getDate()).padStart(2, '0');
      return `${y}-${mo}-${da}T${time}`;
    };
    const _weekdayDates = (start, end, wd) => {
      const dates = [], d = new Date(start);
      while (d.getDay() !== wd) d.setDate(d.getDate() + 1);
      while (d <= end) { dates.push(new Date(d)); d.setDate(d.getDate() + 7); }
      return dates;
    };
    const _nthWeekday = (year, month, wd, n) => {
      const d = new Date(year, month, 1); let cnt = 0;
      while (d.getMonth() === month) {
        if (d.getDay() === wd) { cnt++; if (cnt === n) return new Date(d); }
        d.setDate(d.getDate() + 1);
      }
      return null;
    };

    // 1. Helger opptatt (lør + søn) 18. april – 31. oktober 2026
    const _helgerStart = new Date(2026, 3, 18);
    const _helgerEnd   = new Date(2026, 9, 31);
    [..._weekdayDates(_helgerStart, _helgerEnd, 6),
     ..._weekdayDates(_helgerStart, _helgerEnd, 0)].forEach(d => {
      seedEvents.push({
        title: 'Helg – opptatt',
        start: _fmtDt(d, '10:00:00'),
        end:   _fmtDt(d, '22:00:00'),
        extendedProps: {
          eventType: 'Annet',
          message: 'Helgen er opptatt',
          spaces: ['Hele lokalet'],
          services: [],
          duration: 12,
          status: 'confirmed',
          createdAt: '2026-01-01T00:00:00.000Z'
        }
      });
    });

    // 2. Pensjonistforeningen – 2. onsdag i måneden (unntatt juli og august)
    [[2026,3],[2026,4],[2026,5],[2026,8],[2026,9],[2026,10],[2026,11]].forEach(([y,m]) => {
      const d = _nthWeekday(y, m, 3, 2); // 3 = onsdag, 2 = andre onsdag
      if (d) seedEvents.push({
        title: 'Pensjonistforeningen',
        start: _fmtDt(d, '17:00:00'),
        end:   _fmtDt(d, '20:00:00'),
        extendedProps: {
          eventType: 'Møte eller kurs',
          message: 'Fast booking – Pensjonistforeningen (2. onsdag i måneden)',
          spaces: ['Hele lokalet'],
          services: [],
          duration: 3,
          status: 'confirmed',
          createdAt: '2026-01-01T00:00:00.000Z'
        }
      });
    });

    // 3. Lions – 3. mandag per måned (unntatt juli og august)
    [[2026,3],[2026,4],[2026,5],[2026,8],[2026,9],[2026,10],[2026,11]].forEach(([y,m]) => {
      const d = _nthWeekday(y, m, 1, 3);
      if (d) seedEvents.push({
        title: 'Lions',
        start: _fmtDt(d, '19:00:00'),
        end:   _fmtDt(d, '22:00:00'),
        extendedProps: {
          eventType: 'Møte eller kurs',
          message: 'Fast booking – Lions (3. mandag per måned)',
          spaces: ['Hele lokalet'],
          services: [],
          duration: 3,
          status: 'confirmed',
          createdAt: '2026-01-01T00:00:00.000Z'
        }
      });
    });
    // ── Slutt gjentakende bookinger ─────────────────────────────────────────

    // Bekreftede datoer t.o.m. 2027. Behold én felles datakilde for både
    // kalenderen og produksjons-seedingen, og ikke legg inn en reservehendelse
    // når datoen allerede dekkes av en bekreftet booking fra API-et.
    const confirmedBookings = window.BjorkvangConfirmedBookings;
    if (confirmedBookings) {
      const knownEvents = [...eventList, ...seedEvents];
      confirmedBookings.dates.forEach((item) => {
        const alreadyCovered = knownEvents.some((event) =>
          confirmedBookings.bookingCoversDate(event, item.date)
        );
        if (!alreadyCovered) {
          const event = confirmedBookings.buildCalendarEvent(item);
          seedEvents.push(event);
          knownEvents.push(event);
        }
      });
    }

    const existingKeys = new Set(
      eventList.map((event) => {
        const startIso = new Date(event.start).toISOString();
        const endIso = event.end ? new Date(event.end).toISOString() : '';
        return `${startIso}|${endIso}`;
      })
    );

    seedEvents.forEach((seedEvent) => {
      const startIso = new Date(seedEvent.start).toISOString();
      const endIso = seedEvent.end ? new Date(seedEvent.end).toISOString() : '';
      const key = `${startIso}|${endIso}`;

      if (!existingKeys.has(key)) {
        const normalised = normaliseEvent(seedEvent);
        if (normalised) {
          eventList.push(normalised);
          existingKeys.add(key);
        }
      }
    });

    eventList.sort((a, b) => new Date(a.start) - new Date(b.start));
  };

  // Create debounced version to prevent excessive calls during calendar interactions
  const debouncedHighlightDayCells = debounce(highlightDayCells, 150);

  let events = [];

  const initializeEvents = async () => {
      try {
        const loaded = await loadEvents();
        // Clear and push to maintain reference if needed, or just reassign if we handle it right
        events.length = 0;
        events.push(...loaded);
        
        ensureSeedEvents(events);
        
        if (calendar) {
            calendar.removeAllEvents();
            calendar.addEventSource(events);
            highlightDayCells();
        }
        updateReservationList();
        if (dateInput && dateInput.value) {
          updateDateAvailability(dateInput.value);
        }
      } catch (error) {
          console.error('Feil ved initialisering av hendelser:', error);
      }


  };

  initializeEvents();

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
    try {
      const isMobile = window.innerWidth < 768;
      
      calendar = new FullCalendar.Calendar(calendarEl, {
      initialView: 'dayGridMonth',
      height: 'auto',
      headerToolbar: {
        left: isMobile ? 'prev,next' : 'prev,next today',
        center: 'title',
        right: isMobile ? 'dayGridMonth,listMonth' : 'dayGridMonth,timeGridWeek,timeGridDay'
      },
      views: {
        listMonth: { buttonText: 'Liste' }
      },
      windowResize: function () {
        const mobile = window.innerWidth < 768;
        calendar.setOption('headerToolbar', {
          left: mobile ? 'prev,next' : 'prev,next today',
          center: 'title',
          right: mobile ? 'dayGridMonth,listMonth' : 'dayGridMonth,timeGridWeek,timeGridDay'
        });
      },
      locale: 'nb',
      firstDay: 1,
      // A booking that continues after midnight must also be rendered on the
      // following date. FullCalendar otherwise uses a 09:00 threshold, which
      // can leave the day marked as reserved without showing the event bar.
      nextDayThreshold: '00:00:00',
      selectable: true,
      selectMirror: true,
      dayMaxEvents: true,
      validRange: { start: new Date().toISOString().slice(0, 10) },
      events: events,
      eventTimeFormat: {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      },
      slotLabelFormat: {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      },
      eventContent: function (arg) {
        if (arg.view.type !== 'dayGridMonth') {
          return undefined;
        }

        const wrap = document.createElement('div');
        wrap.className = 'calendar-event-compact';

        const time = document.createElement('span');
        time.className = 'calendar-event-compact__time';
        time.textContent = arg.event.start
          ? new Date(arg.event.start).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })
          : '';
        wrap.appendChild(time);

        const label = document.createElement('span');
        label.className = 'calendar-event-compact__label';
        label.textContent = getCompactEventLabel(arg.event, window.innerWidth < 768 ? 10 : 18);
        wrap.appendChild(label);

        return { domNodes: [wrap] };
      },
      eventClassNames: function (arg) {
        const status = normaliseStatus(arg.event.extendedProps?.status, 'pending');
        const classes = [`fc-event--${status}`];
        const eventType = (arg.event.extendedProps?.eventType || '').toLowerCase();
        if (eventType.includes('basar')) {
          classes.push('fc-event--basar');
        }
        return classes;
      },
      dateClick: function (info) {
        const clickedCell = calendarEl.querySelector(`.fc-daygrid-day[data-date="${info.dateStr}"]`);
        const isBlocked = clickedCell && clickedCell.classList.contains('is-blocked');

        if (isBlocked) {
          showStatus('Denne datoen er allerede reservert. Velg en annen ledig dato.', 'error');
          return;
        }

        const isWeddingActive = !!form?.querySelector('input[name="spaces"][value="Bryllupspakke"]:checked');
        if (isWeddingActive) {
          applyWeddingDates(new Date(info.dateStr + 'T00:00:00'));
        } else if (datepicker) {
          datepicker.setDate(info.dateStr, true);
        } else if (dateInput) {
          dateInput.value = info.dateStr;
        }

        const isPending = clickedCell && clickedCell.classList.contains('is-pending');
        if (isPending) {
          showStatus('Det finnes en forespørsel på denne datoen som ikke er godkjent ennå. Du kan fortsatt sende inn din forespørsel.', 'info');
        }

        if (form) {
          const formSection = document.getElementById('booking-form-section');
          form.scrollIntoView({ behavior: 'smooth', block: 'start' });
          if (formSection) {
            formSection.classList.add('form-section--highlight');
            setTimeout(() => formSection.classList.remove('form-section--highlight'), 1400);
          }
          if (dateInput) {
            dateInput.classList.add('input--date-highlight');
            setTimeout(() => dateInput.classList.remove('input--date-highlight'), 1400);
          }
        }
      },
      select: function (selectionInfo) {
        const isWeddingSelected = !!form?.querySelector('input[name="spaces"][value="Bryllupspakke"]:checked');
        if (isWeddingSelected) {
          applyWeddingDates(selectionInfo.start);
        } else {
          const selectedDate = selectionInfo.startStr.slice(0, 10);
          if (datepicker) {
            datepicker.setDate(selectedDate, true);
          } else if (dateInput) {
            dateInput.value = selectedDate;
          }
          if (timeInput && !selectionInfo.allDay) {
            // Snap to full hour (CET: startStr is local time from FullCalendar)
            timeInput.value = selectionInfo.startStr.slice(11, 13) + ':00';
          }
          if (selectionInfo.end && durationInputEl) {
            const diff = (selectionInfo.end.getTime() - selectionInfo.start.getTime()) / (60 * 60 * 1000);
            if (!Number.isNaN(diff) && diff >= 1) {
              durationInputEl.value = String(Math.min(72, Math.round(diff)));
            }
          }
        }
        if (form) {
          const formSection = document.getElementById('booking-form-section');
          form.scrollIntoView({ behavior: 'smooth', block: 'start' });
          if (formSection) {
            formSection.classList.add('form-section--highlight');
            setTimeout(() => formSection.classList.remove('form-section--highlight'), 1400);
          }
          if (dateInput) {
            dateInput.classList.add('input--date-highlight');
            setTimeout(() => dateInput.classList.remove('input--date-highlight'), 1400);
          }
        }
        calendar.unselect();
      },
      eventClick: function (info) {
        if (info.jsEvent) {
          info.jsEvent.preventDefault();
          info.jsEvent.stopPropagation();
        }

        const rect = info.el.getBoundingClientRect();
        buildCalendarTooltip(
          info.event,
          rect.left + Math.min(rect.width - 24, 36),
          rect.top + Math.min(rect.height, 24)
        );

        if (window.matchMedia('(pointer: coarse)').matches) {
          setTimeout(removeCalendarTooltip, 3200);
        }
      },
      eventDidMount: function (info) {
        const handleMouseMove = (event) => {
          positionCalendarTooltip(event.clientX, event.clientY);
        };

        const handleMouseEnter = (event) => {
          buildCalendarTooltip(info.event, event.clientX, event.clientY);
          info.el.addEventListener('mousemove', handleMouseMove);
        };

        const handleMouseLeave = () => {
          info.el.removeEventListener('mousemove', handleMouseMove);
          removeCalendarTooltip();
        };

        let touchTimer = null;
        const handleTouchStart = (event) => {
          if (event.touches.length !== 1) return;
          const touch = event.touches[0];
          buildCalendarTooltip(info.event, touch.clientX, touch.clientY);
          clearTimeout(touchTimer);
          touchTimer = setTimeout(removeCalendarTooltip, 3200);
        };

        const handleTouchEnd = () => {};

        info.el.addEventListener('mouseenter', handleMouseEnter);
        info.el.addEventListener('mouseleave', handleMouseLeave);
        info.el.addEventListener('touchstart', handleTouchStart, { passive: true });
        info.el.addEventListener('touchend', handleTouchEnd, { passive: true });

        info.el._bookingHandleMouseEnter = handleMouseEnter;
        info.el._bookingHandleMouseLeave = handleMouseLeave;
        info.el._bookingHandleMouseMove = handleMouseMove;
        info.el._bookingHandleTouchStart = handleTouchStart;
        info.el._bookingHandleTouchEnd = handleTouchEnd;
      },
      eventWillUnmount: function (info) {
        removeCalendarTooltip();

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

          if (info.el._bookingHandleTouchStart) {
            info.el.removeEventListener('touchstart', info.el._bookingHandleTouchStart);
            delete info.el._bookingHandleTouchStart;
          }

          if (info.el._bookingHandleTouchEnd) {
            info.el.removeEventListener('touchend', info.el._bookingHandleTouchEnd);
            delete info.el._bookingHandleTouchEnd;
          }
        }
      },
      datesSet: function () {
        debouncedHighlightDayCells();
      },
      eventsSet: function () {
        debouncedHighlightDayCells();
      }
    });
    calendar.render();
    highlightDayCells();

    // Update hint text for touch devices
    if ('ontouchstart' in window) {
      const hintTextEl = document.querySelector('.calendar-cta-hint span:not([aria-hidden])');
      if (hintTextEl) {
        hintTextEl.textContent = 'Trykk på en ledig dato for å åpne bookingskjemaet';
      }
    }
    } catch (error) {
      console.error('Kunne ikke initialisere kalender:', error);
      if (statusEl) {
        showStatus('Kunne ikke laste kalenderen. Pr\u00f8v \u00e5 laste siden p\u00e5 nytt.', 'error');
      }
    }
  }

  updateReservationList();
  highlightDayCells();

  // Prevent double submissions
  let isSubmitting = false;

  if (form) {
    form.addEventListener('submit', async function (e) {
      e.preventDefault();

      if (isSubmitting) {
        return;
      }
      isSubmitting = true;

      if (statusEl) {
        statusEl.classList.remove('is-visible', 'is-success', 'is-error', 'is-info');
        statusEl.textContent = '';
      }

      const formData = new FormData(form);
      const formValues = Object.fromEntries(formData.entries());

      const name = (formValues.name || '').trim();
      const email = (formValues.email || '').trim();
      const phone = (formValues.phone || '').trim().replace(/[\s\-]/g, '').replace(/^(?:\+?47|0047)/, '');
      const address = (formValues.address || '').trim();
      const dateValue = formValues.date || '';
      const timeValue = formValues.time || '';
      const endDateValue = formValues.endDate || '';
      const endTimeValue = formValues.endTime || '';
      const durationInput = formValues.duration || '';
      const eventType = (formValues.eventType || '').trim();
      const message = (formValues.message || '').trim();
      const attendeesValue = (formValues.attendees || '').trim();
      const selectedSpaces = Array.from(form.querySelectorAll('input[name="spaces"]:checked')).map((input) => input.value);
      const selectedServices = Array.from(form.querySelectorAll('input[name="services"]:checked')).map((input) => input.value);
      const isWedding = selectedSpaces.includes('Bryllupspakke');
      const paymentMethod = formValues.paymentMethod || 'vipps';
      const turnstileResponse = formValues['cf-turnstile-response'] || '';

      // --- Per-field inline error helper ---
      function fieldError(fieldEl, msg) {
        // Clear all previous inline errors and invalid states
        form.querySelectorAll('.field-error-hint').forEach(el => el.remove());
        form.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
        // Mark field invalid
        fieldEl.classList.add('is-invalid');
        // Insert inline hint right after the field
        const hint = document.createElement('span');
        hint.className = 'field-error-hint';
        hint.textContent = msg;
        hint.setAttribute('role', 'alert');
        fieldEl.insertAdjacentElement('afterend', hint);
        // Scroll field into view
        fieldEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        fieldEl.focus({ preventScroll: true });
        // Also update the global status for screen readers
        showStatus(msg, 'error');
        isSubmitting = false;
      }

      if (!name)  { return fieldError(form.querySelector('#name'), 'Navn er påkrevd.'); }
      if (!email) { return fieldError(form.querySelector('#email'), 'E-post er påkrevd.'); }
      if (!phone) { return fieldError(form.querySelector('#phone'), 'Telefonnummer er påkrevd.'); }
      if (!form.querySelector('#age-verified')?.checked) { return fieldError(form.querySelector('#age-verified'), 'Vennligst bekreft at du er 18 år eller eldre.'); }
      if (!dateValue) { return fieldError(form.querySelector('#date'), 'Dato er påkrevd.'); }
      if (!timeValue) { return fieldError(form.querySelector('#time'), 'Velg oppstartstid.'); }
      if (!eventType) { return fieldError(form.querySelector('#event-type'), 'Velg formål med leie.'); }
      if (!turnstileResponse) {
        showStatus('Fullfør sikkerhetskontrollen før du sender forespørselen.', 'error');
        form.querySelector('#booking-turnstile')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        isSubmitting = false;
        return;
      }

      // Clear any leftover inline errors before continuing
      form.querySelectorAll('.field-error-hint').forEach(el => el.remove());
      form.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));

      if (!selectedSpaces.length) {
        const spacesFieldset = form.querySelector('fieldset[aria-labelledby="spaces-label"]');
        spacesFieldset.classList.add('is-invalid');
        const hint = document.createElement('span');
        hint.className = 'field-error-hint';
        hint.textContent = 'Velg minst ett lokale.';
        hint.setAttribute('role', 'alert');
        spacesFieldset.querySelector('.option-grid').insertAdjacentElement('afterend', hint);
        spacesFieldset.scrollIntoView({ behavior: 'smooth', block: 'center' });
        showStatus('Velg minst ett lokale.', 'error');
        isSubmitting = false;
        return;
      }

      const startDate = new Date(`${dateValue}T${timeValue}`);
      if (Number.isNaN(startDate.getTime())) {
        fieldError(form.querySelector('#date'), 'Ugyldig dato eller klokkeslett.');
        return;
      }

      let endDate, duration;
      if (isWedding) {
        if (!endDateValue || !endTimeValue) {
          fieldError(form.querySelector('#end-date'), 'Angi sluttdato og slutttid for bryllupspakken.');
          return;
        }
        endDate = new Date(`${endDateValue}T${endTimeValue}`);
        if (Number.isNaN(endDate.getTime()) || endDate <= startDate) {
          fieldError(form.querySelector('#end-date'), 'Sluttidspunkt må være etter starttidspunkt.');
          return;
        }
        duration = (endDate.getTime() - startDate.getTime()) / (60 * 60 * 1000);
      } else {
        const durationParsed = parseFloat(durationInput);
        if (!Number.isFinite(durationParsed) || durationParsed <= 0) {
          fieldError(form.querySelector('#duration'), 'Varighet må være minst én time.');
          return;
        }
        // Begrens varighet til maksimum 23 timer for å unngå problemer med døgn-overganger
        if (durationParsed > 23) {
          fieldError(form.querySelector('#duration'), 'Varighet kan ikke overstige 23 timer. For lengre arrangementer, vennligst kontakt styret.');
          return;
        }
        duration = durationParsed;
        endDate = new Date(startDate.getTime() + duration * 60 * 60 * 1000);
        
        // Valider at slutt-datoen ble beregnet korrekt
        if (Number.isNaN(endDate.getTime())) {
          fieldError(form.querySelector('#duration'), 'Kunne ikke beregne sluttidspunkt. Vennligst velg en kortere varighet.');
          return;
        }
      }

      const conflictingEvent = events.find((event) => {
        const existingStart = new Date(event.start);
        const existingEnd = event.end ? new Date(event.end) : existingStart;
        if (Number.isNaN(existingStart) || Number.isNaN(existingEnd)) {
          return false;
        }
        
        // Only block if the existing event is confirmed/approved
        const status = normaliseStatus(event.extendedProps?.status, 'pending');
        if (status !== 'confirmed' && status !== 'approved') {
            return false;
        }

        return startDate < existingEnd && endDate > existingStart;
      });

      if (conflictingEvent) {
        const conflictStart = new Date(conflictingEvent.start).toLocaleString('nb-NO');
        showStatus(`Tidsrommet er allerede holdt av (${conflictStart}). Velg et annet tidspunkt.`, 'error');
        isSubmitting = false;
        return;
      }

      const attendeeCount = attendeesValue !== '' && Number.isFinite(Number.parseInt(attendeesValue, 10))
        ? Number.parseInt(attendeesValue, 10)
        : null;

      const status = computeSuggestedStatus(selectedSpaces, duration, '');

      const bookingDetails = {
        startDate,
        endDate,
        name,
        email,
        phone,
        address,
        message,
        duration,
        eventType,
        spaces: selectedSpaces,
        services: selectedServices,
        attendees: attendeeCount,
        isMember: form.querySelector('#is-member')?.checked ?? false,
        cateringContact: form.querySelector('#catering-contact')?.checked ?? false,
        ageVerified: form.querySelector('#age-verified')?.checked ?? false,
        turnstileResponse,
      };

      // --- Submit booking request (payment preference stored, no payment taken now) ---
      try {
        showStatus('Sender bookingforesp\u00f8rsel ...', 'info');
        const totalAmount = calculatePrice();
        bookingDetails.paymentMethod = paymentMethod;
        bookingDetails.totalAmount = totalAmount;
        const result = await submitBooking(bookingDetails);

        // --- Show confirmation receipt ---
        const confirmation = document.getElementById('booking-confirmation');
        const sectionHeading = document.querySelector('.booking-form-section .section-heading');
        if (confirmation) {
          const dateFormatted = startDate.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
          const timeFormatted = `kl. ${startDate.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })} (${Math.round(duration)} t)`;
          const deposit = Math.round(totalAmount / 2);
          const paymentLabel = paymentMethod === 'vipps' ? 'Vipps' : 'Bankinnbetaling';

          const setField = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
          setField('conf-date', dateFormatted);
          setField('conf-time', timeFormatted);
          setField('conf-eventtype', eventType || 'Ikke oppgitt');
          setField('conf-spaces', formatList(selectedSpaces));
          setField('conf-name', name);
          setField('conf-email', email);
          setField('conf-price', `${totalAmount.toLocaleString('nb-NO')} kr`);
          setField('conf-deposit', `${deposit.toLocaleString('nb-NO')} kr`);
          setField('conf-payment', paymentLabel);
          setField('conf-id', result.id || '—');
          setField('conf-email-sent', email);

          // Catering row — only show if checked
          const cateringRow = document.getElementById('conf-catering-row');
          const wantsCatering = form.querySelector('#catering-contact')?.checked;
          if (cateringRow && wantsCatering) {
            setField('conf-catering', 'Næs Mat og Event tar kontakt');
            cateringRow.hidden = false;
          }

          form.hidden = true;
          if (sectionHeading) sectionHeading.hidden = true;
          confirmation.hidden = false;
          confirmation.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        form.reset();
        // Clear any inline error hints left from previous attempts
        form.querySelectorAll('.field-error-hint').forEach(el => el.remove());
        form.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
        // Re-show duration field and hide wedding fields after reset
        if (durationFieldEl) durationFieldEl.hidden = false;
        if (endDateFieldEl) endDateFieldEl.hidden = true;
        if (endTimeFieldEl) endTimeFieldEl.hidden = true;
        if (durationInputEl) durationInputEl.required = true;
        if (endDateInputEl) endDateInputEl.required = false;
        if (endTimeInputEl) endTimeInputEl.required = false;
        if (eventTypeSelect) eventTypeSelect.selectedIndex = 0;

        const paymentNote = paymentMethod === 'vipps'
          ? 'Du vil motta en Vipps-betalingsforespørsel for Forhåndsbetaling (50 %) etter godkjenning.'
          : `Du vil motta en betalingsforespørsel for Forhåndsbetaling (50 % av ca. kr ${totalAmount.toLocaleString('nb-NO')}) etter godkjenning.`;

        showStatus(
          `Bookingforespørsel sendt! Styret vil vurdere forespørselen og ta kontakt innen kort tid. ${paymentNote}`,
          'success'
        );
      } catch (error) {
        console.error('Booking submit error:', error);
        showStatus(error.message || 'Kunne ikke sende bookingforesp\u00f8rsel. Pr\u00f8v igjen.', 'error');
        window.turnstile?.reset();
      }
      isSubmitting = false;
    });
  }

  // --- Handle Bryllupspakke auto-fill ---
  const toDateStr = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  // Given any reference date, return the Thursday of that weekend block:
  // Thu/Fri/Sat → same week's Thursday; Sun/Mon/Tue/Wed → upcoming Thursday.
  const getThursdayFrom = (referenceDate) => {
    const d = new Date(referenceDate);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    let offset;
    if (day === 4)      offset = 0;
    else if (day === 5) offset = -1;
    else if (day === 6) offset = -2;
    else                offset = (4 - day + 7) % 7;
    d.setDate(d.getDate() + offset);
    return d;
  };

  // Update the wedding card text with the current Thu–Sun dates.
  const updateWeddingCard = () => {
    if (!weddingWeekendTextEl || !dateInput?.value || !endDateInputEl?.value) return;
    const thuDate = new Date(dateInput.value + 'T00:00:00');
    const sunDate = new Date(endDateInputEl.value + 'T00:00:00');
    const fmt = (d) => d.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' });
    weddingWeekendTextEl.textContent =
      `${fmt(thuDate)} kl. 16:00 – ${fmt(sunDate)} kl. 11:00`;
  };

  // Fill all start/end fields and refresh the card.
  const applyWeddingDates = (referenceDate) => {
    const thursday = getThursdayFrom(referenceDate);
    const sunday = new Date(thursday);
    sunday.setDate(thursday.getDate() + 3);

    if (datepicker) {
      datepicker.setDate(toDateStr(thursday), true);
    } else if (dateInput) {
      dateInput.value = toDateStr(thursday);
    }
    if (timeInput) timeInput.value = '16:00';
    if (endDateInputEl) endDateInputEl.value = toDateStr(sunday);
    if (endTimeInputEl) endTimeInputEl.value = '11:00';

    updateWeddingCard();
    // Collapse the inline picker after a selection
    if (weddingDatePickerWrapEl) weddingDatePickerWrapEl.hidden = true;
  };

  const showWeddingCard = () => {
    if (normalDatetimeFieldsEl) normalDatetimeFieldsEl.hidden = true;
    if (weddingCardEl) weddingCardEl.hidden = false;
    // Underlying inputs still submit their values; exempt from HTML5 validation
    if (dateInput) dateInput.required = false;
    if (timeInput) timeInput.required = false;
    if (durationInputEl) durationInputEl.required = false;
    if (endDateInputEl) endDateInputEl.required = false;
    if (endTimeInputEl) endTimeInputEl.required = false;
  };

  const hideWeddingCard = () => {
    if (normalDatetimeFieldsEl) normalDatetimeFieldsEl.hidden = false;
    if (weddingCardEl) weddingCardEl.hidden = true;
    if (weddingDatePickerWrapEl) weddingDatePickerWrapEl.hidden = true;
    // Restore required on the normal fields
    if (dateInput) dateInput.required = true;
    if (timeInput) timeInput.required = true;
    if (durationFieldEl) durationFieldEl.hidden = false;
    if (endDateFieldEl) endDateFieldEl.hidden = true;
    if (endTimeFieldEl) endTimeFieldEl.hidden = true;
    if (durationInputEl) durationInputEl.required = true;
    if (endDateInputEl) endDateInputEl.required = false;
    if (endTimeInputEl) endTimeInputEl.required = false;
  };

  const weddingSpacesCheckboxes = document.querySelectorAll('input[name="spaces"]');
  weddingSpacesCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      if (e.target.value === 'Bryllupspakke') {
        if (e.target.checked) {
          const currentVal = dateInput?.value;
          const reference = currentVal ? new Date(currentVal + 'T00:00:00') : new Date();
          applyWeddingDates(reference);
          showWeddingCard();
          if (eventTypeSelect) eventTypeSelect.value = 'Bryllup';
          showStatus('Bryllupspakke valgt – klikk «Endre helg» for å velge en annen uke.', 'info');
        } else {
          hideWeddingCard();
        }
      }
    });
  });

  // Wedding date change – use flatpickr for a smooth picker experience
  let weddingFlatpickr = null;
  if (weddingDatePickerEl && typeof flatpickr !== 'undefined') {
    weddingFlatpickr = flatpickr(weddingDatePickerEl, {
      locale: 'no',
      dateFormat: 'Y-m-d',
      minDate: 'today',
      disableMobile: false,
      nextArrow: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
      prevArrow: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
      onChange: (selectedDates) => {
        if (selectedDates.length) {
          applyWeddingDates(selectedDates[0]);
        }
      },
    });
  }

  if (weddingChangeBtnEl) {
    weddingChangeBtnEl.addEventListener('click', () => {
      if (weddingFlatpickr) {
        weddingFlatpickr.open();
      } else if (weddingDatePickerWrapEl) {
        // Fallback: show native input
        weddingDatePickerWrapEl.hidden = !weddingDatePickerWrapEl.hidden;
        if (!weddingDatePickerWrapEl.hidden && weddingDatePickerEl) weddingDatePickerEl.focus();
      }
    });
  }

  // Fallback change handler for native input (when flatpickr not available)
  if (weddingDatePickerEl && !weddingFlatpickr) {
    weddingDatePickerEl.addEventListener('change', () => {
      if (weddingDatePickerEl.value) {
        applyWeddingDates(new Date(weddingDatePickerEl.value + 'T00:00:00'));
      }
    });
  }
  // ----------------------------------------

  // Resets the confirmation receipt and shows the form again
  window.resetBookingForm = function () {
    const formEl = document.getElementById('booking-form');
    const sectionHeading = document.querySelector('.booking-form-section .section-heading');
    const confirmation = document.getElementById('booking-confirmation');
    if (confirmation) confirmation.hidden = true;
    if (formEl) { formEl.hidden = false; }
    if (sectionHeading) sectionHeading.hidden = false;
    window.turnstile?.reset();
    // Scroll smoothly back to the form
    const target = sectionHeading || formEl;
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // --- Image gallery navigation ---
  window.changeImage = function(direction, galleryElement) {
    if (!galleryElement) return;
    
    const images = galleryElement.querySelectorAll('.gallery-image');
    const dots = galleryElement.querySelectorAll('.dot');
    
    if (images.length === 0) return;
    
    let currentIndex = 0;
    images.forEach((img, i) => {
      if (img.classList.contains('active')) {
        currentIndex = i;
      }
    });
    
    // Hide current
    images[currentIndex].classList.remove('active');
    images[currentIndex].style.display = 'none';
    dots[currentIndex].classList.remove('active');
    dots[currentIndex].style.background = 'rgba(255,255,255,0.5)';
    
    // Calculate new index
    let newIndex = currentIndex + direction;
    if (newIndex >= images.length) newIndex = 0;
    if (newIndex < 0) newIndex = images.length - 1;
    
    // Show new
    images[newIndex].classList.add('active');
    images[newIndex].style.display = 'block';
    dots[newIndex].classList.add('active');
    dots[newIndex].style.background = 'white';
  };

  window.showImage = function(index, galleryElement) {
    if (!galleryElement) return;
    
    const images = galleryElement.querySelectorAll('.gallery-image');
    const dots = galleryElement.querySelectorAll('.dot');
    
    if (index < 0 || index >= images.length) return;
    
    // Hide all
    images.forEach(img => {
      img.classList.remove('active');
      img.style.display = 'none';
    });
    dots.forEach(dot => {
      dot.classList.remove('active');
      dot.style.background = 'rgba(255,255,255,0.5)';
    });
    
    // Show selected
    images[index].classList.add('active');
    images[index].style.display = 'block';
    dots[index].classList.add('active');
    dots[index].style.background = 'white';
  };
  // ----------------------------------------
});
