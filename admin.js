
const API_BASE_URL = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost' 
    ? 'http://localhost:7071/api' 
    : 'https://bjorkvang-duhsaxahgfe0btgv.westeurope-01.azurewebsites.net/api';

// Escape HTML utility for safe rendering
function escHtml(str) {
    return String(str).replace(/[&<>"']/g, (m) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[m]);
}

// Returns the stored admin API key (same value as the admin password)
function getAdminKey() {
    return sessionStorage.getItem('admin_api_key') || '';
}

// Notification links land on /admin?contract=<id>. Require admin login first,
// then continue to the requested contract in the same tab. The signing key
// stays in sessionStorage instead of being included in the notification URL.
function openContractFromNotification() {
    const id = new URLSearchParams(window.location.search).get('contract');
    if (!id) return false;

    window.location.replace(`/leieavtale?id=${encodeURIComponent(id)}&mode=admin`);
    return true;
}

// ---------- Reschedule modal ----------

function injectRescheduleModal() {
    if (document.getElementById('reschedule-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'reschedule-modal';
    modal.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:9000; align-items:center; justify-content:center;';
    const timeOpts = Array.from({length: 18}, (_, i) => {
        const h = String(i + 6).padStart(2, '0');
        return `<option value="${h}:00">${h}:00</option>`;
    }).join('');
    modal.innerHTML = `
        <div style="background:#fff; border-radius:10px; padding:2rem; max-width:420px; width:90%; box-shadow:0 20px 60px rgba(0,0,0,0.3);">
            <h3 style="margin:0 0 0.25rem; font-size:1.2rem;">Endre dato for booking</h3>
            <p id="reschedule-current" style="color:#6b7280; font-size:0.9rem; margin:0 0 1.25rem;"></p>
            <p id="reschedule-limit-warning" style="display:none; color:#b45309; font-size:0.85rem; background:#fef3c7; border:1px solid #fbbf24; border-radius:6px; padding:0.6rem 0.85rem; margin-bottom:1rem;">
                ⚠ Merk: Dette er siste tillatte ombooking for denne bestillingen (maks 1 gang iht. vilkår §5).
            </p>
            <label style="display:block; font-weight:600; margin-bottom:0.4rem;">Ny dato</label>
            <input id="reschedule-date" type="date" style="width:100%; padding:0.55rem; border:1px solid #d1d5db; border-radius:6px; font-size:1rem; margin-bottom:1rem; box-sizing:border-box;" />
            <label style="display:block; font-weight:600; margin-bottom:0.4rem;">Nytt tidspunkt</label>
            <select id="reschedule-time" style="width:100%; padding:0.55rem; border:1px solid #d1d5db; border-radius:6px; font-size:1rem; margin-bottom:1.5rem; box-sizing:border-box; background:#fff;">${timeOpts}</select>
            <div style="display:flex; gap:0.75rem; justify-content:flex-end;">
                <button onclick="closeRescheduleModal()" style="padding:0.55rem 1.2rem; border:1px solid #d1d5db; border-radius:6px; background:#fff; cursor:pointer; font-size:0.95rem;">Avbryt</button>
                <button id="reschedule-confirm-btn" onclick="confirmReschedule()" style="padding:0.55rem 1.4rem; border:none; border-radius:6px; background:#3b82f6; color:#fff; font-weight:600; cursor:pointer; font-size:0.95rem;">Bekreft flytt</button>
            </div>
            <p id="reschedule-error" style="display:none; color:#ef4444; font-size:0.85rem; margin-top:0.75rem;"></p>
        </div>
    `;
    modal.addEventListener('click', (e) => { if (e.target === modal) closeRescheduleModal(); });
    document.body.appendChild(modal);
}

let _rescheduleBookingId = null;

function openRescheduleModal(id, currentDate, currentTime, rescheduleCount) {
    injectRescheduleModal();
    _rescheduleBookingId = id;
    document.getElementById('reschedule-current').textContent =
        `Nåværende dato: ${currentDate} kl. ${currentTime}`;
    document.getElementById('reschedule-date').value = currentDate;
    document.getElementById('reschedule-time').value = currentTime || '12:00';
    document.getElementById('reschedule-error').style.display = 'none';
    // Warn if this will be the last allowed rebook
    const warning = document.getElementById('reschedule-limit-warning');
    warning.style.display = (rescheduleCount === 0) ? 'block' : 'none';
    const modal = document.getElementById('reschedule-modal');
    modal.style.display = 'flex';
    setTimeout(() => document.getElementById('reschedule-date').focus(), 50);
}

function closeRescheduleModal() {
    const modal = document.getElementById('reschedule-modal');
    if (modal) modal.style.display = 'none';
    _rescheduleBookingId = null;
}

async function confirmReschedule() {
    const newDate = document.getElementById('reschedule-date').value;
    const newTime = document.getElementById('reschedule-time').value;
    const errorEl = document.getElementById('reschedule-error');
    const btn = document.getElementById('reschedule-confirm-btn');

    if (!newDate || !newTime) {
        errorEl.textContent = 'Du må fylle inn både dato og tidspunkt.';
        errorEl.style.display = 'block';
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Lagrer...';
    errorEl.style.display = 'none';

    try {
        const res = await fetch(`${API_BASE_URL}/booking/reschedule`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-Admin-Key': getAdminKey() },
            body: JSON.stringify({ id: _rescheduleBookingId, newDate, newTime }),
        });

        const data = await res.json();

        if (!res.ok) {
            errorEl.textContent = data.error || 'Noe gikk galt.';
            errorEl.style.display = 'block';
            return;
        }

        closeRescheduleModal();
        alert(`✓ Booking flyttet til ${newDate} kl. ${newTime}. Bekreftelse er sendt til leietaker.`);
        loadDashboard();
    } catch (err) {
        console.error('confirmReschedule error:', err);
        errorEl.textContent = 'Nettverksfeil. Prøv igjen.';
        errorEl.style.display = 'block';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Bekreft flytt';
    }
}

async function checkLogin() {
    const input = document.getElementById('password-input').value;
    const btn = document.querySelector('#login-overlay button');
    const originalText = btn.textContent;
    
    btn.disabled = true;
    btn.textContent = 'Sjekker...';

    try {
        const response = await fetch(`${API_BASE_URL}/auth/verify-admin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: input })
        });

        if (response.ok) {
            document.getElementById('login-overlay').classList.add('hidden');
            document.getElementById('dashboard').classList.remove('hidden');
            sessionStorage.setItem('admin_auth', 'true');
            sessionStorage.setItem('admin_api_key', input);
            if (openContractFromNotification()) return;
            initFilterPanel();
            loadDashboard();
        } else {
            if (response.status === 404) {
                alert('Kunne ikke kontakte serveren (404). Er funksjonene deployet?');
            } else if (response.status === 401) {
                alert('Feil passord');
            } else {
                alert(`Noe gikk galt (Status: ${response.status})`);
            }
        }
    } catch (error) {
        console.error('Login error:', error);
        alert('Kunne ikke logge inn. Sjekk nettverkstilkoblingen.');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

function logout() {
    sessionStorage.removeItem('admin_auth');
    sessionStorage.removeItem('admin_api_key');
    location.reload();
}

// Check session on load
// Older sessions may have the UI flag without the API key. Force a fresh
// login in that case so a notification cannot continue with invalid auth.
if (sessionStorage.getItem('admin_auth') === 'true' && !getAdminKey()) {
    sessionStorage.removeItem('admin_auth');
}

if (sessionStorage.getItem('admin_auth') === 'true' && !openContractFromNotification()) {
    document.getElementById('login-overlay').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    initFilterPanel();
    loadDashboard();
    // Health panel must render even if the bookings fetch fails or is slow,
    // so kick it off independently from loadDashboard.
    setTimeout(() => {
        if (typeof loadSystemHealth === 'function') {
            loadSystemHealth().catch((err) => console.warn('System health init failed:', err));
            startSystemHealthPolling();
        }
    }, 0);
}

async function loadDashboard() {
    try {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 45000); // 45s — allow for Functions cold start
        let response;
        try {
            response = await fetch(`${API_BASE_URL}/booking/admin`, { signal: ctrl.signal, headers: { 'X-Admin-Key': getAdminKey() } });
        } finally {
            clearTimeout(timeout);
        }
        if (!response.ok) {
            const errBody = await response.json().catch(() => ({}));
            throw new Error(`Server svarte ${response.status}: ${errBody.error || response.statusText}`);
        }
        const data = await response.json();
        let bookings = data.bookings || [];

        _allBookings = bookings;
        applyFilters();
        renderVaskDashboard(bookings);

        // Fire Vipps status check in the background — don't block initial render.
        // It performs a second listBookings() + N serial Vipps API calls, so
        // awaiting it pre-render frequently pushed the total request past 20s.
        refreshVippsStatusesInBackground();

        // Kick off system-health check + polling (also fire-and-forget).
        // Guarded so a missed bookings render doesn't suppress the health panel.
        if (typeof loadSystemHealth === 'function') {
            loadSystemHealth().catch((err) => console.warn('System health init failed:', err));
            startSystemHealthPolling();
        }
    } catch (error) {
        const msg = error.name === 'AbortError'
            ? 'Forespørselen tok for lang tid (>45s). Funksjonen kan være under oppstart (cold start) — prøv på nytt om noen sekunder. Hvis problemet vedvarer, sjekk Cosmos DB i Azure Portal.'
            : (error.message || 'Ukjent feil');
        console.error('Error loading dashboard:', msg, error);
        document.getElementById('pending-list').innerHTML = `<p style="color:#ef4444;">⚠ Feil: ${msg}</p>`;
        alert('Kunne ikke laste bookinger: ' + msg);
    }
}

async function refreshVippsStatusesInBackground() {
    try {
        const vippsRes = await fetch(`${API_BASE_URL}/booking/check-vipps-statuses`, {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'X-Admin-Key': getAdminKey() }
        });
        if (!vippsRes.ok) return;
        const vippsData = await vippsRes.json();
        if (Array.isArray(vippsData.bookings) && vippsData.bookings.length > 0) {
            _allBookings = vippsData.bookings;
            applyFilters();
            renderVaskDashboard(vippsData.bookings);
        }
        if (vippsData.updatedCount > 0) {
            console.info(`Vipps status check: ${vippsData.updatedCount} booking(s) updated.`);
        }
    } catch (vippsErr) {
        console.warn('Vipps status check failed (non-fatal):', vippsErr);
    }
}

// ── System / Helse panel ──────────────────────────────────────────────────
const HEALTH_POLL_INTERVAL_MS = 60 * 1000;
const HEALTH_FETCH_TIMEOUT_MS = 10 * 1000;
const HEALTH_LAST_OK_KEY = 'bjorkvang_health_last_ok';

const PROBE_META = {
    cosmos: { label: 'Cosmos DB',          icon: '🗄️', link: 'https://portal.azure.com/' },
    plunk:  { label: 'Plunk (e-post)',      icon: '✉️',  link: 'https://app.useplunk.com/' },
    twilio: { label: 'Twilio (SMS)',        icon: '📱', link: 'https://console.twilio.com/' },
    vipps:  { label: 'Vipps',               icon: '💳', link: 'https://portal.vippsmobilepay.com/' },
    azure:  { label: 'Azure Service Health', icon: '☁️', link: 'https://status.azure.com/' },
    self:   { label: 'Function App',        icon: '⚙️', link: 'https://portal.azure.com/' }
};

const STATUS_TEXT = {
    ok: 'Oppe',
    degraded: 'Redusert',
    down: 'Nede',
    unknown: 'Ukjent'
};

let _healthData = null;
let _healthClientLatencyMs = null;
let _healthPollTimer = null;
let _healthInFlight = false;

function formatLatency(ms) {
    if (ms == null || Number.isNaN(ms)) return '—';
    if (ms < 1000) return `${Math.round(ms)} ms`;
    return `${(ms / 1000).toFixed(1)} s`;
}

function formatRelativeTime(iso) {
    if (!iso) return '—';
    const t = new Date(iso).getTime();
    if (!t || Number.isNaN(t)) return '—';
    const diff = Math.max(0, Date.now() - t);
    if (diff < 5_000) return 'akkurat nå';
    if (diff < 60_000) return `for ${Math.round(diff / 1000)} sek siden`;
    if (diff < 3_600_000) return `for ${Math.round(diff / 60_000)} min siden`;
    if (diff < 86_400_000) return `for ${Math.round(diff / 3_600_000)} t siden`;
    return new Date(iso).toLocaleString('nb-NO');
}

async function loadSystemHealth({ force = false } = {}) {
    if (_healthInFlight) return;
    _healthInFlight = true;

    const errEl = document.getElementById('health-error');
    if (errEl) { errEl.hidden = true; errEl.textContent = ''; }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), HEALTH_FETCH_TIMEOUT_MS);
    const startedAt = Date.now();
    const url = `${API_BASE_URL}/system/health${force ? '?fresh=1' : ''}`;

    try {
        const res = await fetch(url, {
            signal: ctrl.signal,
            headers: { 'X-Admin-Key': getAdminKey() }
        });
        _healthClientLatencyMs = Date.now() - startedAt;

        if (res.status === 401) {
            renderSystemHealthError('Ikke autorisert (401). Logg inn på nytt.');
            return;
        }
        if (!res.ok) {
            renderSystemHealthError(`Helse-endepunkt svarte ${res.status}.`);
            return;
        }

        const data = await res.json();
        _healthData = data;

        // Persist last-OK marker locally so we can show "Siste OK" even when
        // the next poll fails or the user returns later.
        if (data.status === 'ok') {
            try {
                localStorage.setItem(HEALTH_LAST_OK_KEY, data.generatedAt || new Date().toISOString());
            } catch (_) { /* localStorage may be disabled */ }
        }

        renderSystemHealth(data);
    } catch (err) {
        const msg = err && err.name === 'AbortError'
            ? `Helse-sjekken tok mer enn ${HEALTH_FETCH_TIMEOUT_MS / 1000}s (sannsynligvis kald-start).`
            : (err && err.message) || 'Ukjent feil ved helse-sjekk.';
        renderSystemHealthError(msg);
    } finally {
        clearTimeout(timer);
        _healthInFlight = false;
    }
}

function renderSystemHealthError(message) {
    const grid = document.getElementById('health-grid');
    const errEl = document.getElementById('health-error');
    const overall = document.getElementById('health-overall-badge');
    const updated = document.getElementById('health-updated');

    if (overall) {
        overall.textContent = STATUS_TEXT.down;
        overall.className = 'health-badge health-badge--down';
        overall.dataset.status = 'down';
    }
    if (errEl) {
        errEl.textContent = `⚠ ${message}`;
        errEl.hidden = false;
    }
    if (updated) {
        let lastOk = null;
        try { lastOk = localStorage.getItem(HEALTH_LAST_OK_KEY); } catch (_) { /* ignore */ }
        updated.textContent = lastOk ? `Siste OK: ${formatRelativeTime(lastOk)}` : '—';
    }
    if (grid && !grid.querySelector('.health-card')) {
        grid.replaceChildren();
        const empty = document.createElement('p');
        empty.className = 'health-empty';
        empty.textContent = 'Kunne ikke hente status. Prøv «Oppdater».';
        grid.appendChild(empty);
    }
}

function renderSystemHealth(data) {
    const grid = document.getElementById('health-grid');
    const overall = document.getElementById('health-overall-badge');
    const updated = document.getElementById('health-updated');
    if (!grid || !overall) return;

    overall.textContent = STATUS_TEXT[data.status] || data.status;
    overall.className = `health-badge health-badge--${data.status}`;
    overall.dataset.status = data.status;

    if (updated) {
        const cacheTag = data.cached ? ' · cached' : '';
        const clientTag = _healthClientLatencyMs != null ? ` · klient ${formatLatency(_healthClientLatencyMs)}` : '';
        updated.textContent = `Oppdatert ${formatRelativeTime(data.generatedAt)}${cacheTag}${clientTag}`;
    }

    grid.replaceChildren();
    const probes = Array.isArray(data.probes) ? data.probes : [];
    if (!probes.length) {
        const empty = document.createElement('p');
        empty.className = 'health-empty';
        empty.textContent = 'Ingen probes returnerte data.';
        grid.appendChild(empty);
        return;
    }

    probes.forEach((probe) => grid.appendChild(buildHealthCard(probe)));
}

function buildHealthCard(probe) {
    const meta = PROBE_META[probe.name] || { label: probe.name, icon: '•', link: null };
    const status = probe.status || 'unknown';

    const card = document.createElement('article');
    card.className = `health-card health-card--${status}`;
    card.dataset.probe = probe.name;

    // Header row: icon + label + status badge
    const header = document.createElement('div');
    header.className = 'health-card-header';
    const title = document.createElement('div');
    title.className = 'health-card-title';
    const icon = document.createElement('span');
    icon.className = 'health-card-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = meta.icon;
    const labelEl = document.createElement('span');
    labelEl.className = 'health-card-label';
    labelEl.textContent = meta.label;
    title.append(icon, labelEl);
    const badge = document.createElement('span');
    badge.className = `health-badge health-badge--${status}`;
    badge.textContent = STATUS_TEXT[status] || status;
    header.append(title, badge);
    card.appendChild(header);

    // Message
    const msg = document.createElement('p');
    msg.className = 'health-card-message';
    msg.textContent = probe.message || '—';
    card.appendChild(msg);

    // Latency line
    const latencyEl = document.createElement('p');
    latencyEl.className = 'health-card-latency';
    latencyEl.textContent = `Latency: ${formatLatency(probe.latencyMs)}`;
    card.appendChild(latencyEl);

    // Env-var presence chips (only relevant ones)
    const envEntries = probe.env ? Object.entries(probe.env) : [];
    if (envEntries.length) {
        const chips = document.createElement('div');
        chips.className = 'health-env-chips';
        envEntries.forEach(([key, present]) => {
            const chip = document.createElement('span');
            chip.className = `health-env-chip ${present ? 'is-present' : 'is-missing'}`;
            chip.textContent = `${key} ${present ? '✓' : '✗'}`;
            chip.title = present ? `${key} er satt` : `${key} mangler`;
            chips.appendChild(chip);
        });
        card.appendChild(chips);
    }

    // Probe-specific details (rendered as compact key/value rows)
    const detailEntries = probe.details ? Object.entries(probe.details).filter(([, v]) => v != null && v !== '') : [];
    if (detailEntries.length) {
        const dl = document.createElement('dl');
        dl.className = 'health-card-details';
        detailEntries.forEach(([k, v]) => {
            const dt = document.createElement('dt');
            dt.textContent = k;
            const dd = document.createElement('dd');
            if (Array.isArray(v)) {
                dd.textContent = v.map((item) => {
                    if (item && typeof item === 'object') return item.title || JSON.stringify(item);
                    return String(item);
                }).join(' • ');
            } else if (v && typeof v === 'object') {
                dd.textContent = JSON.stringify(v);
            } else {
                dd.textContent = String(v);
            }
            dl.append(dt, dd);
        });
        card.appendChild(dl);
    }

    // Deep link
    if (meta.link) {
        const link = document.createElement('a');
        link.className = 'health-card-link';
        link.href = meta.link;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'Åpne konsoll ↗';
        card.appendChild(link);
    }

    return card;
}

function startSystemHealthPolling() {
    if (_healthPollTimer) return;
    _healthPollTimer = setInterval(() => {
        if (document.hidden) return;
        loadSystemHealth().catch((err) => console.warn('System health poll failed:', err));
    }, HEALTH_POLL_INTERVAL_MS);

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            // Resume immediately when the tab becomes visible again.
            loadSystemHealth().catch(() => { /* already logged */ });
        }
    });
}

async function copyDiagnosticReport() {
    let lastOk = null;
    try { lastOk = localStorage.getItem(HEALTH_LAST_OK_KEY); } catch (_) { /* ignore */ }
    const report = {
        generatedAt: new Date().toISOString(),
        client: {
            url: window.location.href,
            userAgent: navigator.userAgent,
            online: navigator.onLine,
            apiBaseUrl: API_BASE_URL,
            healthFetchLatencyMs: _healthClientLatencyMs,
            lastSuccessfulProbeAt: lastOk
        },
        server: _healthData
    };
    const text = JSON.stringify(report, null, 2);
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
        } else {
            // Fallback for non-secure contexts (e.g. http://localhost over IP)
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
        }
        const btn = document.getElementById('health-copy-btn');
        if (btn) {
            const original = btn.textContent;
            btn.textContent = '✓ Kopiert';
            setTimeout(() => { btn.textContent = original; }, 2000);
        }
    } catch (err) {
        console.error('Copy diagnostic failed:', err);
        alert('Kunne ikke kopiere — sjekk konsollen for detaljer.');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const refreshBtn = document.getElementById('health-refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            refreshBtn.disabled = true;
            loadSystemHealth({ force: true }).finally(() => { refreshBtn.disabled = false; });
        });
    }
    const copyBtn = document.getElementById('health-copy-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', copyDiagnosticReport);
    }
});

let _allBookings = [];
let _activeStatusFilter = 'all';
let _activePeriod = 'all';
let _activeSpaceFilter = '';

// ── Filter panel wiring ─────────────────────────────────────────────────────
// All events are bound here via addEventListener (no inline onclick in HTML).
function initFilterPanel() {
    // Search input
    const queryInput = document.getElementById('filter-query');
    const clearSearchBtn = document.getElementById('filter-clear-search');
    if (queryInput) {
        queryInput.addEventListener('input', () => {
            if (clearSearchBtn) clearSearchBtn.classList.toggle('hidden', !queryInput.value);
            applyFilters();
        });
    }
    if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', () => {
            if (queryInput) queryInput.value = '';
            clearSearchBtn.classList.add('hidden');
            applyFilters();
        });
    }

    // Date inputs
    const dateFrom = document.getElementById('filter-date-from');
    const dateTo   = document.getElementById('filter-date-to');
    if (dateFrom) dateFrom.addEventListener('change', applyFilters);
    if (dateTo)   dateTo.addEventListener('change',   applyFilters);

    // Period buttons
    const periodsWrap = document.getElementById('filter-quick-periods');
    if (periodsWrap) {
        periodsWrap.addEventListener('click', (e) => {
            const btn = e.target.closest('.filter-period-btn');
            if (!btn) return;
            const period = btn.dataset.period;
            _activePeriod = period;
            periodsWrap.querySelectorAll('.filter-period-btn').forEach(b =>
                b.classList.toggle('active', b === btn)
            );
            const dateRow = document.getElementById('filter-date-row');
            if (period === 'custom') {
                dateRow.classList.remove('hidden');
            } else {
                dateRow.classList.add('hidden');
                if (dateFrom) dateFrom.value = '';
                if (dateTo)   dateTo.value   = '';
            }
            applyFilters();
        });
    }

    // Status chips
    const statusWrap = document.getElementById('filter-status-chips');
    if (statusWrap) {
        statusWrap.addEventListener('click', (e) => {
            const btn = e.target.closest('.filter-chip');
            if (!btn) return;
            _activeStatusFilter = btn.dataset.status;
            statusWrap.querySelectorAll('.filter-chip').forEach(b =>
                b.classList.toggle('active', b === btn)
            );
            applyFilters();
        });
    }

    // Space chips
    const spaceWrap = document.getElementById('filter-space-chips');
    if (spaceWrap) {
        spaceWrap.addEventListener('click', (e) => {
            const btn = e.target.closest('.filter-chip');
            if (!btn) return;
            _activeSpaceFilter = btn.dataset.space;
            spaceWrap.querySelectorAll('.filter-chip').forEach(b =>
                b.classList.toggle('active', b === btn)
            );
            applyFilters();
        });
    }

    // Clear all button
    const clearAllBtn = document.getElementById('clear-all-filters-btn');
    if (clearAllBtn) clearAllBtn.addEventListener('click', clearFilters);
}

function setSpaceFilter(space) {
    _activeSpaceFilter = space;
    document.querySelectorAll('.filter-chip[data-space]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.space === space);
    });
    applyFilters();
}

function setStatusFilter(status) {
    _activeStatusFilter = status;
    document.querySelectorAll('.filter-chip[data-status]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.status === status);
    });
    applyFilters();
}

function setQuickPeriod(period) {
    _activePeriod = period;
    document.querySelectorAll('.filter-period-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.period === period);
    });
    const dateRow = document.getElementById('filter-date-row');
    if (period === 'custom') {
        dateRow.classList.remove('hidden');
    } else {
        dateRow.classList.add('hidden');
        const df = document.getElementById('filter-date-from');
        const dt = document.getElementById('filter-date-to');
        if (df) df.value = '';
        if (dt) dt.value = '';
    }
    applyFilters();
}

function clearSearchField() {
    const q = document.getElementById('filter-query');
    if (q) q.value = '';
    const clearBtn = document.getElementById('filter-clear-search');
    if (clearBtn) clearBtn.classList.add('hidden');
    applyFilters();
}

function applyFilters() {
    const query = (document.getElementById('filter-query')?.value || '').toLowerCase().trim();

    // Show/hide inline clear button on search field
    const clearSearchBtn = document.getElementById('filter-clear-search');
    if (clearSearchBtn) clearSearchBtn.classList.toggle('hidden', !query);

    // Compute date range from quick period or custom inputs
    let effectiveDateFrom = null;
    let effectiveDateTo = null;
    const now = new Date();
    if (_activePeriod === 'today') {
        const today = now.toISOString().slice(0, 10);
        effectiveDateFrom = today;
        effectiveDateTo = today;
    } else if (_activePeriod === 'week') {
        const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1;
        const monday = new Date(now);
        monday.setDate(now.getDate() - dayOfWeek);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        effectiveDateFrom = monday.toISOString().slice(0, 10);
        effectiveDateTo = sunday.toISOString().slice(0, 10);
    } else if (_activePeriod === 'month') {
        effectiveDateFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        effectiveDateTo = lastDay.toISOString().slice(0, 10);
    } else if (_activePeriod === 'custom') {
        effectiveDateFrom = document.getElementById('filter-date-from')?.value || null;
        effectiveDateTo = document.getElementById('filter-date-to')?.value || null;
    }

    let filtered = _allBookings;
    if (query) {
        filtered = filtered.filter(b =>
            (b.requesterName || '').toLowerCase().includes(query) ||
            (b.requesterEmail || '').toLowerCase().includes(query)
        );
    }
    if (effectiveDateFrom) filtered = filtered.filter(b => b.date >= effectiveDateFrom);
    if (effectiveDateTo)   filtered = filtered.filter(b => b.date <= effectiveDateTo);
    if (_activeStatusFilter !== 'all') {
        filtered = filtered.filter(b => b.status === _activeStatusFilter);
    }
    if (_activeSpaceFilter) {
        filtered = filtered.filter(b => {
            const spaces = Array.isArray(b.spaces) ? b.spaces : [b.spaces];
            return spaces.some(s => s && s.includes(_activeSpaceFilter));
        });
    }

    const isFiltered = query || effectiveDateFrom || effectiveDateTo ||
                       _activeStatusFilter !== 'all' || _activeSpaceFilter;

    const countEl = document.getElementById('filter-count');
    if (countEl) {
        countEl.textContent = isFiltered
            ? `${filtered.length} av ${_allBookings.length} bookinger`
            : (_allBookings.length ? `${_allBookings.length} bookinger` : '');
    }

    const clearBtn = document.getElementById('clear-all-filters-btn');
    if (clearBtn) clearBtn.classList.toggle('hidden', !isFiltered);

    renderDashboard(filtered);
}

function clearFilters() {
    const q  = document.getElementById('filter-query');
    const df = document.getElementById('filter-date-from');
    const dt = document.getElementById('filter-date-to');
    if (q)  q.value  = '';
    if (df) df.value = '';
    if (dt) dt.value = '';

    _activeStatusFilter = 'all';
    _activePeriod = 'all';
    _activeSpaceFilter = '';

    document.querySelectorAll('.filter-chip[data-status]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.status === 'all');
    });
    document.querySelectorAll('.filter-chip[data-space]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.space === '');
    });
    document.querySelectorAll('.filter-period-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.period === 'all');
    });
    document.getElementById('filter-date-row')?.classList.add('hidden');
    document.getElementById('filter-clear-search')?.classList.add('hidden');
    document.getElementById('clear-all-filters-btn')?.classList.add('hidden');

    const countEl = document.getElementById('filter-count');
    if (countEl) countEl.textContent = _allBookings.length ? `${_allBookings.length} bookinger` : '';

    renderDashboard(_allBookings);
}

function renderDashboard(bookings) {
    const pendingList = document.getElementById('pending-list');
    const upcomingList = document.getElementById('upcoming-list');
    const historyList = document.getElementById('history-list');
    
    pendingList.innerHTML = '';
    upcomingList.innerHTML = '';
    historyList.innerHTML = '';

    const now = new Date();
    const currentYear = now.getFullYear();

    bookings.sort((a, b) => new Date(a.date) - new Date(b.date));

    let pendingCount = 0;
    let upcomingCount = 0;
    let totalYearCount = 0;

    bookings.forEach(booking => {
        const bookingDate = new Date(booking.date);
        const isPast = bookingDate < new Date(now.setHours(0,0,0,0));
        
        if (bookingDate.getFullYear() === currentYear) {
            totalYearCount++;
        }

        const card = createBookingCard(booking);

        if (booking.status === 'pending') {
            pendingCount++;
            pendingList.appendChild(card);
        } else if (booking.status === 'approved' && !isPast) {
            upcomingCount++;
            upcomingList.appendChild(card);
        } else {
            historyList.appendChild(card);
        }
    });

    if (pendingList.children.length === 0) pendingList.innerHTML = '<p>Ingen bookinger venter på godkjenning.</p>';
    if (upcomingList.children.length === 0) upcomingList.innerHTML = '<p>Ingen kommende bookinger.</p>';
    if (historyList.children.length === 0) historyList.innerHTML = '<p>Ingen historikk.</p>';

    document.getElementById('stat-pending').textContent = pendingCount;
    document.getElementById('stat-upcoming').textContent = upcomingCount;
    document.getElementById('stat-total').textContent = totalYearCount;

    renderVippsDashboard(bookings);

    // Scroll to and highlight booking from URL hash (e.g. /admin#booking-123)
    const hashId = decodeURIComponent(window.location.hash.slice(1));
    if (hashId) {
        const target = document.querySelector(`[data-booking-id="${CSS.escape(hashId)}"]`);
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            target.style.outline = '3px solid #1a6fa3';
            target.style.boxShadow = '0 0 0 6px rgba(26,111,163,0.15)';
            setTimeout(() => { target.style.outline = ''; target.style.boxShadow = ''; }, 4000);
        }
    }
}

function createBookingCard(booking) {
    const div = document.createElement('div');
    div.className = `booking-card ${booking.status}`;
    div.setAttribute('data-booking-id', booking.id);
    
    const spaces = Array.isArray(booking.spaces) ? booking.spaces.join(', ') : booking.spaces;
    const services = Array.isArray(booking.services) ? booking.services.join(', ') : booking.services;
    
    const contract = booking.contract || {};
    const isRequesterSigned = !!contract.signedAt;
    const isLandlordSigned = !!contract.landlordSignedAt;

    // --- Payment state ---
    const depositRequested = !!booking.depositRequested;
    const depositPaid = !!booking.depositPaid;
    const depositViaVipps = !!booking.depositVippsOrderId;
    const finalInvoiceSent = !!(booking.finalInvoiceSentAt || booking.invoiceSentAt);
    const finalInvoicePaid = !!booking.finalInvoicePaid;
    const finalViaVipps = !!booking.finalInvoiceVippsOrderId;
    const paymentMethod = booking.paymentMethod || 'bank';
    const totalNOK = booking.totalAmount || 0;
    const depositNOK = booking.depositAmount || (totalNOK ? Math.round(totalNOK * 0.5) : 0);

    // --- Signature badge ---
    let signatureBadge = '';
    if (booking.status === 'approved') {
        if (isLandlordSigned) {
            signatureBadge = `<span style="background:#d1fae5;color:#065f46;padding:2px 6px;border-radius:4px;font-size:0.8rem;margin-left:5px;">✓ Ferdig signert</span>`;
        } else if (isRequesterSigned) {
            signatureBadge = `<span style="background:#dbeafe;color:#1e40af;padding:2px 6px;border-radius:4px;font-size:0.8rem;margin-left:5px;">✎ Signert av leietaker</span>`;
        } else {
            signatureBadge = `<span style="background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:4px;font-size:0.8rem;margin-left:5px;">⚠ Venter på signering</span>`;
        }
    }

    // --- Deposit/invoice status badges ---
    let paymentBadges = '';
    let paymentTimeline = '';
    if (booking.status === 'approved') {
        // Compact badges for card header
        if (!depositRequested) {
            paymentBadges += `<span style="background:#fef3c7;color:#92400e;padding:2px 7px;border-radius:4px;font-size:0.8rem;margin-left:5px;">💰 Forhåndsbetaling ikke sendt</span>`;
        } else if (depositRequested && !depositPaid) {
            const sentDate = booking.depositRequestedAt ? new Date(booking.depositRequestedAt).toLocaleDateString('nb-NO') : '';
            const method = depositViaVipps ? 'Vipps' : 'bank';
            paymentBadges += `<span style="background:#e0f2fe;color:#075985;padding:2px 7px;border-radius:4px;font-size:0.8rem;margin-left:5px;">⏳ Venter forhåndsbetaling (${method})</span>`;
        } else if (depositPaid && !finalInvoiceSent) {
            paymentBadges += `<span style="background:#d1fae5;color:#065f46;padding:2px 7px;border-radius:4px;font-size:0.8rem;margin-left:5px;">✅ Forhåndsbetaling OK</span>`;
        } else if (finalInvoiceSent && !finalInvoicePaid) {
            paymentBadges += `<span style="background:#d1fae5;color:#065f46;padding:2px 7px;border-radius:4px;font-size:0.8rem;margin-left:5px;">✅ Dep.</span>`;
            paymentBadges += `<span style="background:#e0f2fe;color:#075985;padding:2px 7px;border-radius:4px;font-size:0.8rem;margin-left:3px;">⏳ Venter sluttoppgjør</span>`;
        } else if (finalInvoicePaid) {
            paymentBadges += `<span style="background:#d1fae5;color:#065f46;padding:2px 7px;border-radius:4px;font-size:0.8rem;margin-left:5px;">✅ Alt betalt</span>`;
        }

        // Detailed payment timeline section
        const timelineSteps = [];

        // Step 1: Deposit request
        if (depositRequested) {
            const sentDate = booking.depositRequestedAt ? new Date(booking.depositRequestedAt).toLocaleString('nb-NO') : '';
            const method = depositViaVipps ? 'Vipps' : 'Bank';
            timelineSteps.push({ icon: '✅', text: `Forhåndsbetalingsforespørsel sendt (${method})`, date: sentDate, color: '#059669' });
        } else {
            timelineSteps.push({ icon: '⏳', text: 'Forhåndsbetalingsforespørsel ikke sendt', date: '', color: '#92400e' });
        }

        // Step 2: Deposit paid
        if (depositPaid) {
            const paidDate = booking.depositPaidAt ? new Date(booking.depositPaidAt).toLocaleString('nb-NO') : '';
            timelineSteps.push({ icon: '✅', text: `Forhåndsbetaling mottatt${depositNOK ? ' – kr ' + depositNOK.toLocaleString('nb-NO') : ''}`, date: paidDate, color: '#059669' });
        } else if (depositRequested) {
            timelineSteps.push({ icon: '⏳', text: `Venter på forhåndsbetaling${depositNOK ? ' – kr ' + depositNOK.toLocaleString('nb-NO') : ''}`, date: '', color: '#075985' });
        }

        // Step 3: Final invoice
        if (finalInvoiceSent) {
            const sentDate = (booking.finalInvoiceSentAt || booking.invoiceSentAt) ? new Date(booking.finalInvoiceSentAt || booking.invoiceSentAt).toLocaleString('nb-NO') : '';
            const invoiceAmt = booking.finalInvoiceAmountNOK ? 'kr ' + booking.finalInvoiceAmountNOK.toLocaleString('nb-NO') : '';
            const method = finalViaVipps ? 'Vipps' : 'Bank';
            timelineSteps.push({ icon: '✅', text: `Sluttfaktura sendt (${method})${invoiceAmt ? ' – ' + invoiceAmt : ''}`, date: sentDate, color: '#059669' });
        } else if (depositPaid) {
            timelineSteps.push({ icon: '⏳', text: 'Sluttfaktura ikke sendt ennå', date: '', color: '#92400e' });
        }

        // Step 4: Final invoice paid
        if (finalInvoicePaid) {
            const paidDate = booking.finalInvoicePaidAt ? new Date(booking.finalInvoicePaidAt).toLocaleString('nb-NO') : '';
            timelineSteps.push({ icon: '✅', text: 'Sluttfaktura betalt', date: paidDate, color: '#059669' });
        } else if (finalInvoiceSent) {
            timelineSteps.push({ icon: '⏳', text: 'Venter på sluttbetaling', date: '', color: '#075985' });
        }

        if (timelineSteps.length > 0) {
            const stepsHtml = timelineSteps.map(s =>
                `<div style="display:flex;align-items:flex-start;gap:8px;padding:4px 0;">
                    <span style="flex-shrink:0;">${s.icon}</span>
                    <div>
                        <span style="color:${s.color};font-size:0.85rem;font-weight:500;">${s.text}</span>
                        ${s.date ? `<span style="color:#9ca3af;font-size:0.78rem;margin-left:6px;">${s.date}</span>` : ''}
                    </div>
                </div>`
            ).join('');
            paymentTimeline = `
                <div style="margin-top:8px;padding:10px 12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;">
                    <div style="font-weight:600;font-size:0.85rem;color:#374151;margin-bottom:4px;">Betalingsstatus</div>
                    ${stepsHtml}
                </div>`;
        }
    }

    let createdStr = 'Ukjent';
    if (booking.createdAt) {
        createdStr = new Date(booking.createdAt).toLocaleString('nb-NO', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    }

    // --- Action buttons for approved bookings ---
    let approvedActions = '';
    if (booking.status === 'approved') {
        approvedActions += `<button onclick="rejectBooking('${booking.id}')" class="btn-sm btn-reject">Kanseller</button>`;
        approvedActions += `<button onclick="openContract('${booking.id}')" class="btn-sm" style="background:${isLandlordSigned ? '#10b981' : '#3b82f6'};">
            ${isLandlordSigned ? 'Se avtale' : (isRequesterSigned ? 'Signer som utleier' : 'Kopier lenke')}
        </button>`;
        approvedActions += `<button onclick="printContract('${booking.id}')" class="btn-sm" style="background:#64748b;" title="Åpner utskriftsvennlig versjon">🖨 Skriv ut avtale</button>`;

        // Deposit flow
        const useManualDepositFlow = booking.adminCreated || !booking.requesterEmail;
        if (useManualDepositFlow) {
            // No email — just register internally without sending anything
            if (!depositRequested && !depositPaid) {
                approvedActions += `<button onclick="registerDepositRequestOnly('${booking.id}')" class="btn-sm" style="background:#0ea5e9;">💸 Registrer forhåndsbetalingsforespørsel</button>`;
                approvedActions += `<button onclick="markDepositPaid('${booking.id}')" class="btn-sm" style="background:#059669;">💰 Registrer forhåndsbetaling mottatt</button>`;
            } else if (depositRequested && !depositPaid) {
                approvedActions += `<button onclick="markDepositPaid('${booking.id}')" class="btn-sm" style="background:#059669;">💰 Registrer forhåndsbetaling mottatt</button>`;
            }
        } else {
            // Normal flow — send emails/Vipps
            if (!depositRequested) {
                approvedActions += `<button onclick="sendDepositRequest('${booking.id}')" class="btn-sm" style="background:#0ea5e9;">💸 Send forhåndsbetalingsforespørsel</button>`;
            } else if (depositRequested && !depositPaid) {
                if (paymentMethod === 'bank') {
                    approvedActions += `<button onclick="markDepositPaid('${booking.id}')" class="btn-sm" style="background:#0ea5e9;">💰 Forhåndsbetaling mottatt (bank)</button>`;
                }
                if (paymentMethod === 'vipps') {
                    if (booking.depositVippsOrderId) {
                        approvedActions += `<button onclick="checkVippsPayment('${booking.depositVippsOrderId}', '${booking.id}')" class="btn-sm" style="background:#ff5b24;color:#fff;">🔍 Sjekk Vipps-status</button>`;
                    }
                    approvedActions += `<button onclick="markDepositPaid('${booking.id}')" class="btn-sm" style="background:#64748b;font-size:0.75rem;">💰 Merk betalt (manuelt)</button>`;
                }
            }
        }

        // Final invoice — only available after deposit is paid
        if (depositPaid && !finalInvoiceSent) {
            const _hasVask = !!(Array.isArray(booking.services) && booking.services.includes('Vask'));
            approvedActions += `<button onclick="openFinalInvoiceModal('${booking.id}', ${totalNOK}, ${depositNOK}, ${_hasVask}, '${booking.eventType || ''}', ${booking.attendees || 0}, ${!!booking.requesterEmail}, ${!!booking.adminCreated})" class="btn-sm" style="background:#8b5cf6;">📋 Sluttoppgjør</button>`;
        } else if (finalInvoiceSent && !finalInvoicePaid) {
            if (finalViaVipps && booking.finalInvoiceVippsOrderId) {
                approvedActions += `<button onclick="checkVippsPayment('${booking.finalInvoiceVippsOrderId}', '${booking.id}')" class="btn-sm" style="background:#ff5b24;color:#fff;">🔍 Sjekk Vipps-status</button>`;
            }
            approvedActions += `<button onclick="markFinalInvoicePaid('${booking.id}')" class="btn-sm" style="background:#0ea5e9;">✅ Sluttfaktura betalt${paymentMethod === 'bank' ? ' (bank)' : ' (manuelt)'}</button>`;
        }

        // Contextual reminder — only shown when leietaker has a pending action
        const bookingDatePast = booking.date && new Date(booking.date + 'T23:59:59') < new Date();
        if (!isRequesterSigned && !bookingDatePast) {
            // Signing reminder only makes sense before the event date
            approvedActions += `<button onclick="sendReminder('${booking.id}', 'signing')" class="btn-sm" style="background:#f59e0b;color:black;" title="Send signaturpåminnelse til leietaker">📄 Signaturpåminnelse</button>`;
            if (booking.phone) {
                approvedActions += `<button onclick="sendReminder('${booking.id}', 'signing', 'sms')" class="btn-sm" style="background:#0f766e;color:white;" title="Send signaturpåminnelse som SMS med lenke til avtalen">📱 Signatur-SMS</button>`;
            }
        } else if (depositRequested && !depositPaid) {
            approvedActions += `<button onclick="sendReminder('${booking.id}', 'deposit')" class="btn-sm" style="background:#f59e0b;color:black;" title="Minn leietaker om å betale forhåndsbetalingen">💸 Betalingspåminnelse</button>`;
        } else if (finalInvoiceSent && !finalInvoicePaid) {
            approvedActions += `<button onclick="sendReminder('${booking.id}', 'finalInvoice')" class="btn-sm" style="background:#f59e0b;color:black;" title="Minn leietaker om å betale sluttfakturaen">💰 Sluttfakturapåminnelse</button>`;
        }

        if ((booking.rescheduleCount || 0) < 1) {
            approvedActions += `<button onclick="openRescheduleModal('${booking.id}', '${booking.date}', '${(booking.time || '').replace(/'/g, '')}', ${booking.rescheduleCount || 0})" class="btn-sm" style="background:#6366f1;" title="Flytt bookingen til ny dato (maks 1 gang iht. vilkår §5)">📅 Endre dato</button>`;
        } else {
            approvedActions += `<span style="font-size:0.78rem;color:#9ca3af;padding:4px 6px;display:inline-block;" title="Maks antall ombookinger er brukt (iht. vilkår §5)">↺ Ombooket (1/1)</span>`;
        }
    }

    div.innerHTML = `
        <div class="booking-details">
            <h3>${booking.eventType || 'Reservasjon'} – ${formatDate(booking.date)} ${signatureBadge} ${paymentBadges}</h3>
            <div class="booking-meta"><strong>Tid:</strong> ${booking.time} (${booking.duration} timer)</div>
            <div class="booking-meta"><strong>Navn:</strong> ${booking.requesterName}</div>
            <div class="booking-meta"><strong>E-post:</strong> <a href="mailto:${booking.requesterEmail}">${booking.requesterEmail}</a></div>
            <div class="booking-meta"><strong>Tlf:</strong> ${booking.phone || '-'}</div>
            <div class="booking-meta"><strong>Areal:</strong> ${spaces || 'Ikke spesifisert'}</div>
            ${services ? `<div class="booking-meta"><strong>Tillegg:</strong> ${services}</div>` : ''}
            ${booking.attendees ? `<div class="booking-meta"><strong>Antall:</strong> ${booking.attendees}</div>` : ''}
            <div class="booking-meta"><strong>Betalingsmetode:</strong> ${paymentMethod === 'vipps' ? 'Vipps' : 'Bank'}</div>
            ${totalNOK ? `<div class="booking-meta"><strong>Estimert total:</strong> kr ${totalNOK.toLocaleString('nb-NO')} &nbsp;|&nbsp; <strong>Forhåndsbetaling (50%):</strong> kr ${depositNOK.toLocaleString('nb-NO')} &nbsp;|&nbsp; <strong>Restbeløp:</strong> kr ${(totalNOK - depositNOK).toLocaleString('nb-NO')}</div>` : ''}
            ${booking.cateringContact ? `<div class="booking-meta" style="margin-top:5px;"><span style="background:#fef3c7;color:#92400e;padding:2px 7px;border-radius:4px;font-size:0.8rem;">🍽 Catering: Ønsker kontakt fra Næs Mat og Event</span></div>` : ''}
            ${booking.message ? `<div class="booking-meta" style="margin-top:5px;font-style:italic;">"${booking.message}"</div>` : ''}
            <div class="booking-meta" style="margin-top:5px;font-size:0.8rem;color:#999;">
                Sendt inn: ${createdStr}<br>
                ID: ${booking.id} | Status: ${translateStatus(booking.status)}
            </div>
            ${booking.adminCreated ? `<div class="booking-meta" style="margin-top:4px;"><span style="background:#e0e7ff;color:#3730a3;padding:2px 8px;border-radius:4px;font-size:0.78rem;font-weight:600;">🖊 Manuelt registrert av admin</span></div>` : ''}
            ${booking.externalContract ? `<div class="booking-meta" style="margin-top:3px;"><span style="background:#d1fae5;color:#065f46;padding:2px 8px;border-radius:4px;font-size:0.78rem;font-weight:600;">📄 Kontrakt signert på fysisk papir</span></div>` : ''}
            ${isRequesterSigned ? `<div class="booking-meta" style="color:#1e40af;font-size:0.8rem;">Leietaker signerte: ${new Date(contract.signedAt).toLocaleString('nb-NO')}</div>` : ''}
            ${isLandlordSigned ? `<div class="booking-meta" style="color:#059669;font-size:0.8rem;">Utleier signerte: ${new Date(contract.landlordSignedAt).toLocaleString('nb-NO')}</div>` : ''}
            ${booking.depositRequestedAt ? `<div class="booking-meta" style="color:#075985;font-size:0.8rem;">💸 Forhåndsbetalingsforespørsel sendt: ${new Date(booking.depositRequestedAt).toLocaleString('nb-NO')}</div>` : ''}
            ${booking.depositRequestedAt && !booking.depositPaidAt && (Date.now() - new Date(booking.depositRequestedAt).getTime()) > 5 * 24 * 60 * 60 * 1000
                ? `<div class="booking-meta" style="color:#b91c1c;font-size:0.8rem;font-weight:600;">⚠️ Forfalt – forhåndsbetalingsforespørsel sendt for mer enn 5 dager siden</div>` : ''}
            ${booking.depositPaidAt ? `<div class="booking-meta" style="color:#059669;font-size:0.8rem;">✅ Forhåndsbetaling mottatt: ${new Date(booking.depositPaidAt).toLocaleString('nb-NO')}</div>` : ''}
            ${booking.finalInvoiceSentAt ? `<div class="booking-meta" style="color:#059669;font-size:0.8rem;">📧 Sluttfaktura sendt: ${new Date(booking.finalInvoiceSentAt).toLocaleString('nb-NO')}</div>` : booking.invoiceSentAt ? `<div class="booking-meta" style="color:#059669;font-size:0.8rem;">📧 Sluttfaktura sendt: ${new Date(booking.invoiceSentAt).toLocaleString('nb-NO')}</div>` : ''}
            ${booking.finalInvoicePaidAt ? `<div class="booking-meta" style="color:#059669;font-size:0.8rem;">✅ Sluttfaktura betalt: ${new Date(booking.finalInvoicePaidAt).toLocaleString('nb-NO')}</div>` : ''}
            ${paymentTimeline}
            ${booking.previousDate ? `<div class="booking-meta" style="color:#6366f1;font-size:0.8rem;">↺ Ombooket fra: ${booking.previousDate}${booking.previousTime ? ' kl. ' + booking.previousTime : ''}</div>` : ''}
        </div>
        <div class="booking-actions">
            ${booking.status === 'pending' ? `
                <button onclick="approveBooking('${booking.id}')" class="btn-sm btn-approve">Godkjenn</button>
                <button onclick="rejectBooking('${booking.id}')" class="btn-sm btn-reject">Avvis</button>
            ` : ''}
            ${approvedActions}
            ${booking.phone ? `<button onclick="openSmsCenter('${booking.id}', '${booking.phone}', '${(booking.requesterName || '').replace(/'/g, "\\'")}'  )" class="btn-sm" style="background:#3b82f6;" title="Send SMS til leietaker">💬 SMS</button>` : ''}
            <button onclick="exportBookingCSV('${booking.id}')" class="btn-sm" style="background:#6b7280;" title="Last ned leiedetaljer som CSV">⬇ Eksporter</button>
        </div>
    `;
    return div;
}

function exportBookingCSV(id) {
    const booking = _allBookings.find(b => b.id === id);
    if (!booking) { alert('Fant ikke booking.'); return; }

    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const totalNOK = booking.totalAmount || 0;
    const depositNOK = Math.round(totalNOK * 0.5);
    const fields = [
        ['Booking-ID', booking.id],
        ['Navn', booking.requesterName],
        ['E-post', booking.requesterEmail],
        ['Telefon', booking.phone || ''],
        ['Dato', booking.date],
        ['Tidspunkt', booking.time || ''],
        ['Varighet (timer)', booking.duration || ''],
        ['Formål', booking.eventType || ''],
        ['Lokale', Array.isArray(booking.spaces) ? booking.spaces.join('; ') : (booking.spaces || '')],
        ['Tillegg', Array.isArray(booking.services) ? booking.services.join('; ') : (booking.services || '')],
        ['Antall gjester', booking.attendees || ''],
        ['Betalingsmetode', booking.paymentMethod || ''],
        ['Estimert total (kr)', totalNOK],
        ['Forhåndsbetaling 50% (kr)', depositNOK],
        ['Restbeløp (kr)', totalNOK - depositNOK],
        ['Status', booking.status || ''],
        ['Forhåndsbetaling sendt', booking.depositRequestedAt || ''],
        ['Forhåndsbetaling mottatt', booking.depositPaidAt || ''],
        ['Sluttfaktura sendt', booking.finalInvoiceSentAt || ''],
        ['Sluttfaktura betalt', booking.finalInvoicePaidAt || ''],
        ['Melding', booking.message || ''],
    ];

    const csv = 'sep=;\n' + fields.map(([k, v]) => `${esc(k)};${esc(v)}`).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `booking-${booking.date}-${(booking.requesterName || 'ukjent').replace(/\s+/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

function openContract(id) {
    const key = getAdminKey();
    const link = window.location.origin + '/leieavtale?id=' + id + '&mode=admin' + (key ? '&adminKey=' + encodeURIComponent(key) : '');
    window.open(link, '_blank');
}

function printContract(id) {
    const link = window.location.origin + '/leieavtale?id=' + id + '&print=1';
    window.open(link, '_blank');
}

function copyContractLink(id) {
    const link = window.location.origin + '/leieavtale?id=' + id;
    navigator.clipboard.writeText(link).then(() => alert('Lenke kopiert!'));
}

async function sendReminder(id, type, channel = 'both') {
    const typeLabels = {
        signing:      'Signaturpåminnelse – leietaker blir bedt om å signere leieavtalen.',
        deposit:      'Betalingspåminnelse – leietaker blir minnet om å betale forhåndsbetalingen.',
        finalInvoice: 'Sluttfakturapåminnelse – leietaker blir minnet om å betale sluttfakturaen.',
    };
    const description = typeLabels[type] || 'Generell påminnelse sendes til leietaker.';
    const isSmsOnly = channel === 'sms';
    const comment = isSmsOnly ? '' : prompt(`${description}\n\nVil du legge til en kommentar? (Valgfritt)`);
    if (!isSmsOnly && comment === null) return; // Cancelled

    try {
        const response = await fetch(`${API_BASE_URL}/booking/remind`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Admin-Key': getAdminKey()
            },
            body: JSON.stringify({ id, comment, channel })
        });
        const data = await response.json().catch(() => ({}));
        
        if (response.ok) {
            alert(channel === 'sms' ? 'Påminnelse sendt som SMS!' : 'Påminnelse sendt!');
        } else {
            alert(data.error || 'Noe gikk galt. Prøv igjen.');
        }
    } catch (error) {
        console.error(error);
        alert('Feil ved kommunikasjon med server.');
    }
}

async function markDepositPaid(id) {
    if (!confirm('Bekreft at forhåndsbetalingen er mottatt for denne bookingen?')) return;
    try {
        const response = await fetch(`${API_BASE_URL}/booking/deposit-paid?id=${id}`, {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'X-Admin-Key': getAdminKey() }
        });
        if (response.ok) {
            alert('Forhåndsbetaling markert som mottatt!');
            loadDashboard();
        } else {
            alert('Noe gikk galt. Prøv igjen.');
        }
    } catch (error) {
        console.error(error);
        alert('Nettverksfeil.');
    }
}

async function registerDepositRequestOnly(id) {
    if (!confirm('Registrer forhåndsbetalingsforespørsel internt (ingen e-post eller SMS sendes)?')) return;
    try {
        const res = await fetch(`${API_BASE_URL}/booking/send-deposit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-Admin-Key': getAdminKey() },
            body: JSON.stringify({ id, skipEmail: true })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
            alert(`Forhåndsbetalingsforespørsel registrert internt (kr ${(data.depositAmount || 0).toLocaleString('nb-NO')}).`);
            loadDashboard();
        } else {
            alert(`Feil: ${data.error || 'Kunne ikke registrere forhåndsbetalingsforespørsel.'}`);
        }
    } catch (err) {
        console.error(err);
        alert('Nettverksfeil.');
    }
}

async function sendDepositRequest(id) {
    if (!confirm('Send forhåndsbetalingsforespørsel til leietaker?')) return;
    try {
        const res = await fetch(`${API_BASE_URL}/booking/send-deposit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-Admin-Key': getAdminKey() },
            body: JSON.stringify({ id })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
            const method = data.paymentMethod === 'vipps' ? 'Vipps-lenke' : 'bankdetaljer';
            alert(`Forhåndsbetalingsforespørsel sendt til ${data.sentTo} (${method}, kr ${(data.depositAmount || 0).toLocaleString('nb-NO')})!`);
            loadDashboard();
        } else {
            alert(`Feil: ${data.error || 'Kunne ikke sende forhåndsbetalingsforespørsel.'}`);
        }
    } catch (err) {
        console.error(err);
        alert('Nettverksfeil.');
    }
}

// ---------- Final invoice modal ----------

let _finalInvoiceBookingId = null;
let _finalInvoiceTotalNOK = 0;
let _finalInvoiceDepositNOK = 0;
let _finalInvoiceCleaningFeeNOK = 1000;
let _isMinnestund = false;
let _minnestundEstimatedAttendees = 0;
let _hasEmail = false;
let _extraItemCount = 0;

function openFinalInvoiceModal(id, totalNOK, depositNOK, hasVask, eventType, estimatedAttendees, hasEmail, isAdminCreated) {
    _finalInvoiceBookingId = id;
    _finalInvoiceTotalNOK = totalNOK || 0;
    _finalInvoiceDepositNOK = depositNOK || 0;
    _finalInvoiceCleaningFeeNOK = 1000;
    _isMinnestund = eventType === 'Minnestund';
    _minnestundEstimatedAttendees = estimatedAttendees || 0;
    _hasEmail = !!hasEmail;
    _extraItemCount = 0;

    injectFinalInvoiceModal();

    // Minnesamvær: show per-person row, hide fixed leiesum row
    const baseRow = document.getElementById('fi-base-row');
    const minneRow = document.getElementById('fi-minnesamvaer-row');
    if (baseRow) baseRow.style.display = _isMinnestund ? 'none' : '';
    if (minneRow) minneRow.style.display = _isMinnestund ? '' : 'none';
    if (_isMinnestund) {
        const countEl = document.getElementById('fi-minne-count');
        if (countEl) countEl.value = _minnestundEstimatedAttendees || '';
    } else {
        document.getElementById('fi-base-total').textContent = totalNOK ? `kr ${totalNOK.toLocaleString('nb-NO')}` : '–';
    }

    document.getElementById('fi-deposit').textContent = depositNOK ? `− kr ${depositNOK.toLocaleString('nb-NO')}` : '–';
    const cleaningInput = document.getElementById('fi-cleaning-fee');
    if (cleaningInput) cleaningInput.value = _finalInvoiceCleaningFeeNOK;
    const cleaningNote = document.getElementById('fi-cleaning-note');
    if (cleaningNote) cleaningNote.textContent = '(normalt kr 1 000 – legges til etter arrangementet)';
    document.getElementById('fi-extra-rows').innerHTML = '';
    const sendEmailCb = document.getElementById('fi-send-email');
    if (sendEmailCb) sendEmailCb.checked = isAdminCreated ? false : _hasEmail;
    updateFinalInvoiceSubmitLabel();
    updateFinalInvoiceTotal();

    document.getElementById('final-invoice-modal').style.display = 'flex';
}

function injectFinalInvoiceModal() {
    if (document.getElementById('final-invoice-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'final-invoice-modal';
    modal.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:9000; align-items:flex-start; justify-content:center; padding:40px 16px; overflow-y:auto;';
    modal.innerHTML = `
        <div style="background:#fff; border-radius:10px; padding:2rem; max-width:560px; width:100%; box-shadow:0 20px 60px rgba(0,0,0,0.3);">
            <h3 style="margin:0 0 1rem; font-size:1.2rem;">� Sluttoppgjør</h3>

            <table style="width:100%;border-collapse:collapse;font-size:0.95rem;margin-bottom:1rem;">
                <tr id="fi-base-row">
                    <td style="padding:6px 0;color:#6b7280;">Leiesum (estimert total)</td>
                    <td id="fi-base-total" style="text-align:right;font-weight:600;">–</td>
                </tr>
                <tr id="fi-minnesamvaer-row" style="display:none;">
                    <td style="padding:6px 0;">
                        <span style="font-weight:500;">Minnesamvær</span>
                        <span style="font-size:0.85rem;color:#6b7280;margin-left:4px;">faktisk antall gjester</span><br>
                        <span style="font-size:0.88rem;">
                            <input id="fi-minne-count" type="number" min="1" placeholder="antall" oninput="updateFinalInvoiceTotal()"
                                style="width:70px;padding:3px 6px;border:1px solid #d1d5db;border-radius:5px;font:inherit;font-size:0.9rem;text-align:right;">
                            pers ×
                            <input id="fi-minne-rate" type="number" min="0" step="1" value="30" oninput="updateFinalInvoiceTotal()"
                                style="width:55px;padding:3px 6px;border:1px solid #d1d5db;border-radius:5px;font:inherit;font-size:0.9rem;text-align:right;">
                            kr/pers
                        </span>
                    </td>
                    <td id="fi-minne-total" style="text-align:right;font-weight:600;padding:6px 0;">–</td>
                </tr>
                <tr id="fi-extra-rows"></tr>
                <tr>
                    <td style="padding:6px 0;">
                        <span style="font-weight:500;">Vask / Rengjøring (obligatorisk)</span>
                        <span id="fi-cleaning-note" style="font-size:0.78rem;color:#b45309;margin-left:6px;"></span>
                    </td>
                    <td style="text-align:right;white-space:nowrap;padding:6px 0;">
                        kr <input id="fi-cleaning-fee" type="number" min="0" step="1" value="1000"
                            oninput="updateFinalInvoiceTotal()"
                            style="width:80px;padding:3px 6px;border:1px solid #d1d5db;border-radius:5px;font:inherit;font-size:0.9rem;text-align:right;">
                    </td>
                </tr>
                <tr>
                    <td style="padding:6px 0;color:#059669;">Forhåndsbetaling allerede mottatt (trekkes fra)</td>
                    <td id="fi-deposit" style="text-align:right;color:#059669;">–</td>
                </tr>
                <tr style="border-top:2px solid #e5e7eb;">
                    <td style="padding:10px 0;font-weight:bold;font-size:1.05rem;">Gjenstående å betale</td>
                    <td id="fi-remaining" style="text-align:right;font-weight:bold;font-size:1.05rem;">–</td>
                </tr>
            </table>

            <div style="margin-bottom:1rem;">
                <strong style="font-size:0.9rem;">Andre tilleggsbelastninger (f.eks. ekstra utstyr, skader)</strong>
                <div id="fi-extra-items-container" style="margin-top:8px;"></div>
                <button type="button" onclick="addExtraInvoiceItem()" style="margin-top:8px;padding:5px 12px;border:1px dashed #9ca3af;border-radius:6px;background:transparent;cursor:pointer;font-size:0.88rem;color:#6b7280;">+ Legg til rad</button>
            </div>

            <div style="margin-bottom:1.25rem;padding:12px 14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;">
                <label style="display:flex;align-items:center;gap:10px;cursor:pointer;margin:0;font-weight:normal;">
                    <input type="checkbox" id="fi-send-email" onchange="updateFinalInvoiceSubmitLabel()" style="width:16px;height:16px;">
                    <span>Send sluttfaktura til kunden på e-post / Vipps</span>
                </label>
                <p style="margin:6px 0 0 26px;font-size:0.8rem;color:#9ca3af;">Ikke avkrysset: beløpet registreres kun internt og markeres som betalt.</p>
            </div>

            <div style="display:flex; gap:0.75rem; justify-content:flex-end; margin-top:1.25rem;">
                <button onclick="closeFinalInvoiceModal()" style="padding:0.55rem 1.2rem; border:1px solid #d1d5db; border-radius:6px; background:#fff; cursor:pointer; font-size:0.95rem;">Avbryt</button>
                <button id="fi-submit-btn" onclick="submitFinalInvoice()" style="padding:0.55rem 1.4rem; border:none; border-radius:6px; background:#8b5cf6; color:#fff; font-weight:600; cursor:pointer; font-size:0.95rem;">Registrer og merk betalt</button>
            </div>
            <p id="fi-error" style="display:none; color:#ef4444; font-size:0.85rem; margin-top:0.75rem;"></p>
        </div>
    `;
    modal.addEventListener('click', (e) => { if (e.target === modal) closeFinalInvoiceModal(); });
    document.body.appendChild(modal);
}

function updateFinalInvoiceSubmitLabel() {
    const btn = document.getElementById('fi-submit-btn');
    const sendEmail = document.getElementById('fi-send-email')?.checked;
    if (btn) btn.textContent = sendEmail ? 'Send sluttfaktura' : 'Registrer og merk betalt';
}

function addExtraInvoiceItem() {
    const container = document.getElementById('fi-extra-items-container');
    const rowId = `fi-extra-${_extraItemCount++}`;
    const row = document.createElement('div');
    row.id = rowId;
    row.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:6px;';
    row.innerHTML = `
        <input type="text" placeholder="Beskrivelse (f.eks. ekstra utstyr)" oninput="updateFinalInvoiceTotal()"
            style="flex:1;padding:6px 8px;border:1px solid #d1d5db;border-radius:6px;font:inherit;font-size:0.9rem;"
            class="fi-desc">
        <input type="number" placeholder="kr" min="0" step="1" oninput="updateFinalInvoiceTotal()"
            style="width:90px;padding:6px 8px;border:1px solid #d1d5db;border-radius:6px;font:inherit;font-size:0.9rem;"
            class="fi-amount">
        <button type="button" onclick="document.getElementById('${rowId}').remove(); updateFinalInvoiceTotal();"
            style="background:none;border:none;cursor:pointer;color:#ef4444;font-size:1.1rem;padding:0 4px;">✕</button>
    `;
    container.appendChild(row);
}

function updateFinalInvoiceTotal() {
    const extraRows = document.querySelectorAll('#fi-extra-items-container > div');
    let extrasTotal = 0;
    extraRows.forEach(row => {
        const amt = parseFloat(row.querySelector('.fi-amount')?.value) || 0;
        extrasTotal += amt;
    });
    const cleaningFee = parseFloat(document.getElementById('fi-cleaning-fee')?.value) || 0;

    let baseNOK;
    if (_isMinnestund) {
        const count = parseFloat(document.getElementById('fi-minne-count')?.value) || 0;
        const rate = parseFloat(document.getElementById('fi-minne-rate')?.value) || 30;
        baseNOK = count * rate;
        const minneTotal = document.getElementById('fi-minne-total');
        if (minneTotal) minneTotal.textContent = baseNOK > 0 ? `kr ${baseNOK.toLocaleString('nb-NO')}` : '–';
    } else {
        baseNOK = _finalInvoiceTotalNOK;
    }

    const remaining = (baseNOK - _finalInvoiceDepositNOK) + cleaningFee + extrasTotal;
    const el = document.getElementById('fi-remaining');
    if (el) el.textContent = `kr ${remaining.toLocaleString('nb-NO')}`;
}

function closeFinalInvoiceModal() {
    const modal = document.getElementById('final-invoice-modal');
    if (modal) modal.style.display = 'none';
    _finalInvoiceBookingId = null;
}

async function submitFinalInvoice() {
    const btn = document.getElementById('fi-submit-btn');
    const errEl = document.getElementById('fi-error');
    errEl.style.display = 'none';

    // Collect cleaning fee
    const cleaningFeeNOK = parseFloat(document.getElementById('fi-cleaning-fee')?.value) || 0;

    // Collect minnesamvær per-person data if applicable
    let minnesamvaerActualCount = null;
    let minnesamvaerRate = null;
    if (_isMinnestund) {
        minnesamvaerActualCount = parseFloat(document.getElementById('fi-minne-count')?.value) || 0;
        minnesamvaerRate = parseFloat(document.getElementById('fi-minne-rate')?.value) || 30;
        if (!minnesamvaerActualCount) {
            errEl.textContent = 'Fyll inn faktisk antall gjester for minnesamvær.';
            errEl.style.display = 'block';
            return;
        }
    }

    // Collect extra items
    const extraItems = [];
    const extraRows = document.querySelectorAll('#fi-extra-items-container > div');
    for (const row of extraRows) {
        const desc = (row.querySelector('.fi-desc')?.value || '').trim();
        const amt = parseFloat(row.querySelector('.fi-amount')?.value) || 0;
        if (desc || amt) {
            if (!desc) { errEl.textContent = 'Fyll inn beskrivelse for alle tilleggsrader.'; errEl.style.display = 'block'; return; }
            if (amt < 0) { errEl.textContent = 'Beløp kan ikke være negativt.'; errEl.style.display = 'block'; return; }
            extraItems.push({ description: desc, amountNOK: amt });
        }
    }

    const skipEmail = !document.getElementById('fi-send-email')?.checked;
    btn.disabled = true;
    btn.textContent = skipEmail ? 'Registrerer...' : 'Sender...';

    try {
        const res = await fetch(`${API_BASE_URL}/booking/send-final-invoice`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-Admin-Key': getAdminKey() },
            body: JSON.stringify({ id: _finalInvoiceBookingId, cleaningFeeNOK, extraItems, skipEmail,
                ...(minnesamvaerActualCount !== null ? { minnesamvaerActualCount, minnesamvaerRate } : {}) })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
            closeFinalInvoiceModal();
            if (skipEmail) {
                alert(`Sluttoppgjør registrert og markert som betalt.\nBeløp: kr ${(data.remainingAmount || 0).toLocaleString('nb-NO')}`);
            } else {
                alert(`Sluttfaktura sendt til ${data.sentTo}!\nGjenstående beløp: kr ${(data.remainingAmount || 0).toLocaleString('nb-NO')}`);
            }
            loadDashboard();
        } else {
            errEl.textContent = data.error || 'Noe gikk galt.';
            errEl.style.display = 'block';
        }
    } catch (err) {
        console.error(err);
        errEl.textContent = 'Nettverksfeil. Prøv igjen.';
        errEl.style.display = 'block';
    } finally {
        btn.disabled = false;
        updateFinalInvoiceSubmitLabel();
    }
}

async function markFinalInvoicePaid(id) {
    if (!confirm('Bekreft at sluttfaktura er betalt (bankoverføring)?')) return;
    try {
        const res = await fetch(`${API_BASE_URL}/booking/final-invoice-paid?id=${id}`, {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'X-Admin-Key': getAdminKey() }
        });
        if (res.ok) {
            alert('Sluttfaktura markert som betalt! Kvittering sendt til leietaker.');
            loadDashboard();
        } else {
            const data = await res.json().catch(() => ({}));
            alert(data.error || 'Noe gikk galt.');
        }
    } catch (err) {
        console.error(err);
        alert('Nettverksfeil.');
    }
}

async function checkVippsPayment(orderId, bookingId) {
    const btn = event.target;
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Sjekker...';
    try {
        const res = await fetch(`${API_BASE_URL}/vipps/check-status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-Admin-Key': getAdminKey() },
            body: JSON.stringify({ orderId })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
            const status = data.status || 'UNKNOWN';
            const isDeposit = orderId.startsWith('dep-');
            const isInvoice = orderId.startsWith('inv-');
            const typeLabel = isDeposit ? 'forhåndsbetalingen' : isInvoice ? 'sluttfakturaen' : 'betalingen';

            if (status === 'AUTHORIZED' || status === 'CAPTURED') {
                alert(`✅ Betaling bekreftet!\n\nVipps har bekreftet betaling av ${typeLabel}. Siden oppdateres nå.`);
                loadDashboard();
            } else if (status === 'EXPIRED' || status === 'CANCELLED' || status === 'ABORTED') {
                const statusLabels = { EXPIRED: 'utløpt (leietaker åpnet ikke Vipps i tide)', CANCELLED: 'kansellert av leietaker', ABORTED: 'avbrutt' };
                const want = confirm(
                    `⚠️ Vipps-ordren er ${statusLabels[status] || status.toLowerCase()}.\n\n` +
                    `Leietaker har ikke fullført betaling av ${typeLabel}.\n\n` +
                    `Vil du sende en ny betalingsforespørsel?`
                );
                if (want) {
                    if (isDeposit) {
                        sendDepositRequest(bookingId);
                    } else if (isInvoice) {
                        const booking = _allBookings.find(b => b.id === bookingId);
                        if (booking) {
                            const totalNOK = booking.totalAmount || 0;
                            const depositNOK = booking.depositAmount || Math.round(totalNOK * 0.5);
                            const hasVask = !!(Array.isArray(booking.services) && booking.services.includes('Vask'));
                            openFinalInvoiceModal(bookingId, totalNOK, depositNOK, hasVask, booking.eventType || '', booking.attendees || 0, !!booking.requesterEmail);
                        }
                    }
                }
            } else if (status === 'CREATED') {
                alert(`⏳ Vipps-ordren er sendt, men leietaker har ikke betalt ${typeLabel} ennå.\n\nDu kan vente eller sende en betalingspåminnelse.`);
            } else if (status === 'FAILED') {
                alert(`❌ Betalingen av ${typeLabel} feilet i Vipps.\n\nSend en ny betalingsforespørsel eller be leietaker kontakte banken sin.`);
            } else {
                alert(`Vipps-status for ${typeLabel}: ${status}`);
            }
        } else {
            alert(`Feil ved sjekk: ${data.error || 'Ukjent feil'}`);
        }
    } catch (err) {
        console.error(err);
        alert('Nettverksfeil ved Vipps-statussjekk.');
    } finally {
        btn.disabled = false;
        btn.textContent = original;
    }
}

// ---------- Vipps payment dashboard ----------

function renderVippsDashboard(bookings) {
    const panel = document.getElementById('vipps-dashboard-panel');
    if (!panel) return;

    const vippsBookings = bookings.filter(b =>
        b.paymentMethod === 'vipps' ||
        b.depositVippsOrderId ||
        b.finalInvoiceVippsOrderId
    );

    const stats = {
        depositsSent: vippsBookings.filter(b => b.depositVippsOrderId).length,
        depositsPaid: vippsBookings.filter(b => b.depositPaid && b.depositVippsOrderId).length,
        invoicesSent: vippsBookings.filter(b => b.finalInvoiceVippsOrderId).length,
        invoicesPaid: vippsBookings.filter(b => b.finalInvoicePaid).length,
    };

    const statusBadge = (paid, sent) => {
        if (paid) return '<span style="background:#d1fae5;color:#065f46;padding:2px 7px;border-radius:4px;font-size:0.8rem;">✅ Betalt</span>';
        if (sent) return '<span style="background:#e0f2fe;color:#075985;padding:2px 7px;border-radius:4px;font-size:0.8rem;">⏳ Sendt</span>';
        return '<span style="background:#f3f4f6;color:#6b7280;padding:2px 7px;border-radius:4px;font-size:0.8rem;">– Ikke sendt</span>';
    };

    const rows = vippsBookings.map(b => {
        const depNOK = b.depositAmount || 0;
        const invNOK = b.finalInvoiceAmountNOK || 0;
        return `<tr style="border-bottom:1px solid #f3f4f6;">
            <td style="padding:8px 6px;font-weight:500;">${b.requesterName || '–'}</td>
            <td style="padding:8px 6px;color:#6b7280;">${b.date || '–'}</td>
            <td style="padding:8px 6px;">${b.eventType || '–'}</td>
            <td style="padding:8px 6px;">${statusBadge(b.depositPaid, b.depositVippsOrderId)}${depNOK ? ` <small style="color:#6b7280;">kr ${depNOK.toLocaleString('nb-NO')}</small>` : ''}</td>
            <td style="padding:8px 6px;">${statusBadge(b.finalInvoicePaid, b.finalInvoiceVippsOrderId)}${invNOK ? ` <small style="color:#6b7280;">kr ${invNOK.toLocaleString('nb-NO')}</small>` : ''}</td>
        </tr>`;
    }).join('');

    panel.innerHTML = `
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:1rem;">
            <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:12px 20px;min-width:130px;text-align:center;">
                <div style="font-size:1.6rem;font-weight:bold;color:#0369a1;">${stats.depositsSent}</div>
                <div style="font-size:0.8rem;color:#6b7280;">Forhåndsbetaling sendt</div>
            </div>
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 20px;min-width:130px;text-align:center;">
                <div style="font-size:1.6rem;font-weight:bold;color:#15803d;">${stats.depositsPaid}</div>
                <div style="font-size:0.8rem;color:#6b7280;">Forhåndsbetaling mottatt</div>
            </div>
            <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:12px 20px;min-width:130px;text-align:center;">
                <div style="font-size:1.6rem;font-weight:bold;color:#0369a1;">${stats.invoicesSent}</div>
                <div style="font-size:0.8rem;color:#6b7280;">Sluttfaktura sendt</div>
            </div>
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 20px;min-width:130px;text-align:center;">
                <div style="font-size:1.6rem;font-weight:bold;color:#15803d;">${stats.invoicesPaid}</div>
                <div style="font-size:0.8rem;color:#6b7280;">Fullt betalt</div>
            </div>
        </div>
        ${vippsBookings.length === 0
            ? '<p style="color:#9ca3af;font-size:0.9rem;">Ingen bookinger med Vipps-betaling ennå.</p>'
            : `<div style="overflow-x:auto;">
                <table style="width:100%;border-collapse:collapse;font-size:0.9rem;">
                    <thead>
                        <tr style="text-align:left;border-bottom:2px solid #e5e7eb;color:#6b7280;font-weight:600;">
                            <th style="padding:6px;">Navn</th>
                            <th style="padding:6px;">Dato</th>
                            <th style="padding:6px;">Arrangement</th>
                            <th style="padding:6px;">Forhåndsbetaling</th>
                            <th style="padding:6px;">Sluttfaktura</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
               </div>`
        }`;
}

function toggleVaskDashboard() {
    const section = document.getElementById('vask-dashboard-section');
    const toggle = document.getElementById('vask-dashboard-toggle');
    if (!section) return;
    const isHidden = section.classList.toggle('hidden');
    if (toggle) toggle.textContent = isHidden ? '▼' : '▲';
}

function renderVaskDashboard(bookings) {
    const panel = document.getElementById('vask-dashboard-panel');
    if (!panel) return;

    const vaskBookings = bookings.filter(b =>
        Array.isArray(b.services) && b.services.includes('Vask')
    );

    if (vaskBookings.length === 0) {
        panel.innerHTML = '<p style="color:#9ca3af;font-size:0.9rem;">Ingen bookinger med vask ennå.</p>';
        return;
    }

    // Group by month
    const byMonth = {};
    vaskBookings.forEach(b => {
        const key = b.date ? b.date.slice(0, 7) : 'Ukjent';
        if (!byMonth[key]) byMonth[key] = [];
        byMonth[key].push(b);
    });

    const rows = Object.keys(byMonth).sort().map(month => {
        const count = byMonth[month].length;
        const total = count * 1000;
        const label = byMonth[month][0].date
            ? new Date(month + '-01').toLocaleDateString('nb-NO', { month: 'long', year: 'numeric' })
            : month;
        return `<tr style="border-bottom:1px solid #f3f4f6;">
            <td style="padding:6px;">${label}</td>
            <td style="padding:6px;text-align:center;">${count}</td>
            <td style="padding:6px;text-align:right;">kr ${total.toLocaleString('nb-NO')}</td>
        </tr>`;
    }).join('');

    const totalCount = vaskBookings.length;
    const totalNOK = totalCount * 1000;

    panel.innerHTML = `
        <div style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:0.9rem;max-width:500px;">
                <thead>
                    <tr style="text-align:left;border-bottom:2px solid #e5e7eb;color:#6b7280;font-weight:600;">
                        <th style="padding:6px;">Måned</th>
                        <th style="padding:6px;text-align:center;">Antall</th>
                        <th style="padding:6px;text-align:right;">Vaskinntekt (est.)</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
                <tfoot>
                    <tr style="border-top:2px solid #e5e7eb;font-weight:700;">
                        <td style="padding:8px 6px;">Totalt</td>
                        <td style="padding:8px 6px;text-align:center;">${totalCount}</td>
                        <td style="padding:8px 6px;text-align:right;">kr ${totalNOK.toLocaleString('nb-NO')}</td>
                    </tr>
                </tfoot>
            </table>
        </div>
        <p style="font-size:0.8rem;color:#6b7280;margin-top:8px;">* Beløp er estimert (1&nbsp;000 kr/arrangement). Faktisk pris settes i sluttfaktura.</p>`;
}

async function sendInvoice(id) {
    if (!confirm('Send sluttfaktura med restbeløp til leietaker?')) return;
    try {
        const response = await fetch(`${API_BASE_URL}/booking/invoice`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-Admin-Key': getAdminKey() },
            body: JSON.stringify({ id })
        });
        if (response.ok) {
            alert('Sluttfaktura sendt!');
            loadDashboard();
        } else {
            const data = await response.json().catch(() => ({}));
            alert(`Feil: ${data.error || 'Kunne ikke sende faktura.'}`);
        }
    } catch (error) {
        console.error(error);
        alert('Nettverksfeil.');
    }
}

async function approveBooking(id) {
    if (!confirm('Er du sikker på at du vil godkjenne denne bookingen?')) return;
    
    const message = prompt('Melding til leietaker (valgfritt – sendes i godkjennings-e-posten):') || '';

    try {
        const response = await fetch(`${API_BASE_URL}/booking/approve?id=${id}`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Admin-Key': getAdminKey()
            },
            body: JSON.stringify({ message })
        });
        
        if (response.ok) {
            alert('Booking godkjent!');
            loadDashboard();
        } else {
            alert('Noe gikk galt. Prøv igjen.');
        }
    } catch (error) {
        console.error(error);
        alert('Feil ved kommunikasjon med server.');
    }
}

async function rejectBooking(id) {
    const reason = prompt('Vennligst oppgi årsak til avvisning/kansellering (sendes til kunden):');
    if (reason === null) return; // Cancelled

    try {
        const response = await fetch(`${API_BASE_URL}/booking/reject?id=${id}`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Admin-Key': getAdminKey()
            },
            body: JSON.stringify({ reason })
        });
        
        if (response.ok) {
            alert('Booking avvist/kansellert.');
            loadDashboard();
        } else {
            alert('Noe gikk galt. Prøv igjen.');
        }
    } catch (error) {
        console.error(error);
        alert('Feil ved kommunikasjon med server.');
    }
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function translateStatus(status) {
    const map = {
        'pending': 'Venter',
        'approved': 'Godkjent',
        'rejected': 'Avvist'
    };
    return map[status] || status;
}

function toggleHelp() {
    const panel = document.getElementById('help-panel');
    const icon  = document.getElementById('help-toggle-icon');
    if (!panel) return;
    const isHidden = panel.classList.toggle('hidden');
    if (icon) icon.textContent = isHidden ? '▼' : '▲';
}

function toggleHistory() {
    const el = document.getElementById('history-list');
    el.classList.toggle('hidden');
}

function toggleManualBooking() {
    const panel = document.getElementById('manual-booking-panel');
    const icon  = document.getElementById('manual-toggle-icon');
    const isHidden = panel.classList.toggle('hidden');
    icon.textContent = isHidden ? '▼' : '▲';
    if (!isHidden) panel.querySelector('input')?.focus();
}

const MB_WHOLE = ['Hele lokalet', 'Bryllupspakke'];
const MB_INDIVIDUAL = ['Peisestue', 'Salen', 'Små møter'];

function mbEnforceSpace(changed) {
    if (!changed.checked) return;
    const all = document.querySelectorAll('input[name="mb-spaces"]');
    if (MB_WHOLE.includes(changed.value)) {
        all.forEach(cb => { if (cb !== changed) cb.checked = false; });
    } else if (MB_INDIVIDUAL.includes(changed.value)) {
        all.forEach(cb => {
            if (cb !== changed && (MB_WHOLE.includes(cb.value) || MB_INDIVIDUAL.includes(cb.value)))
                cb.checked = false;
        });
    }
}

function mbExternalChanged() {
    // "Fullt betalt" implies forhåndsbetaling is also received
    if (document.getElementById('mb-fully-paid')?.checked) {
        const dep = document.getElementById('mb-deposit-paid');
        if (dep) dep.checked = true;
    }
}

async function createManualBooking(event) {
    event.preventDefault();
    const statusEl = document.getElementById('mb-status');
    const submitBtn = event.target.querySelector('button[type="submit"]');

    // Helper: show error, highlight field, scroll to it on mobile
    function mbError(msg, fieldEl) {
        statusEl.style.color = '#ef4444';
        statusEl.style.fontWeight = '600';
        statusEl.textContent = '⚠️ ' + msg;
        // Clear previous highlights
        document.querySelectorAll('.mb-invalid, .mb-invalid-group').forEach(el => {
            el.classList.remove('mb-invalid', 'mb-invalid-group');
        });
        if (fieldEl) {
            fieldEl.classList.add('mb-invalid');
            fieldEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            try { fieldEl.focus({ preventScroll: true }); } catch(e) {}
        }
        setTimeout(() => statusEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), fieldEl ? 350 : 0);
        isSubmitting = false;
    }

    let isSubmitting = false;

    const nameEl = document.getElementById('mb-name');
    const dateEl = document.getElementById('mb-date');
    const durationEl = document.getElementById('mb-duration');
    const eventTypeEl = document.getElementById('mb-eventtype');
    const spacesRow = document.getElementById('mb-spaces-row');

    if (!nameEl.value.trim()) { return mbError('Navn er påkrevd.', nameEl); }
    if (!dateEl.value) { return mbError('Dato er påkrevd.', dateEl); }
    if (!durationEl.value || parseFloat(durationEl.value) <= 0) { return mbError('Varighet er påkrevd.', durationEl); }
    if (!eventTypeEl.value) { return mbError('Formål er påkrevd.', eventTypeEl); }

    const spaces = Array.from(document.querySelectorAll('input[name="mb-spaces"]:checked')).map(cb => cb.value);
    if (spaces.length === 0) {
        statusEl.style.color = '#ef4444';
        statusEl.style.fontWeight = '600';
        statusEl.textContent = '⚠️ Velg minst ett lokale.';
        if (spacesRow) {
            spacesRow.classList.add('mb-invalid-group');
            spacesRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        setTimeout(() => statusEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 350);
        return;
    }

    const services = Array.from(document.querySelectorAll('input[name="mb-services"]:checked')).map(cb => cb.value);

    const payload = {
        requesterName:  document.getElementById('mb-name').value.trim(),
        requesterEmail: document.getElementById('mb-email').value.trim(),
        phone:          document.getElementById('mb-phone').value.trim(),
        date:           document.getElementById('mb-date').value,
        time:           document.getElementById('mb-time').value,
        duration:       parseFloat(document.getElementById('mb-duration').value),
        eventType:      document.getElementById('mb-eventtype').value,
        message:        document.getElementById('mb-message').value.trim(),
        attendees:      parseInt(document.getElementById('mb-attendees').value) || null,
        isMember:       document.getElementById('mb-member').checked,
        spaces,
        services,
        adminCreated:   true,
        paymentMethod:  document.getElementById('mb-payment-method')?.value || 'vipps',
        externalContract:   document.getElementById('mb-external-contract')?.checked || false,
        depositAlreadyPaid: document.getElementById('mb-deposit-paid')?.checked || false,
        fullyPaid:          document.getElementById('mb-fully-paid')?.checked || false,
        sendConfirmationEmail: document.getElementById('mb-send-emails')?.checked || false,
    };

    submitBtn.disabled = true;
    statusEl.style.color = '#555';
    statusEl.style.fontWeight = '';
    statusEl.textContent = 'Oppretter booking...';
    // Clear any leftover highlights
    document.querySelectorAll('.mb-invalid, .mb-invalid-group').forEach(el => {
        el.classList.remove('mb-invalid', 'mb-invalid-group');
    });

    try {
        const res = await fetch(`${API_BASE_URL}/booking`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (!res.ok) {
            statusEl.style.color = '#ef4444';
            statusEl.style.fontWeight = '600';
            statusEl.textContent = '⚠️ ' + (data.message || data.error || 'Noe gikk galt.');
            statusEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return;
        }

        // Auto-approve since admin is creating it
        const approveRes = await fetch(`${API_BASE_URL}/booking/approve?id=${encodeURIComponent(data.id)}`, {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'X-Admin-Key': getAdminKey() }
        });

        if (approveRes.ok) {
            statusEl.style.color = '#059669';
            statusEl.style.fontWeight = '600';
            statusEl.textContent = `✓ Booking opprettet og godkjent (ID: ${data.id})`;
            statusEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            event.target.reset();
            loadDashboard();
        } else {
            statusEl.style.color = '#f59e0b';
            statusEl.style.fontWeight = '600';
            statusEl.textContent = `Booking opprettet (ID: ${data.id}), men automatisk godkjenning feilet. Godkjenn manuelt i listen.`;
            statusEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            loadDashboard();
        }
    } catch (err) {
        console.error('createManualBooking failed', err);
        statusEl.style.color = '#ef4444';
        statusEl.style.fontWeight = '600';
        statusEl.textContent = '⚠️ Nettverksfeil. Sjekk konsollen.';
        statusEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } finally {
        submitBtn.disabled = false;
    }
}

// ——— SMS-senter ———

// ——— Admin contact group ———

async function loadAdminContacts() {
    const container = document.getElementById('admin-contacts-list');
    if (!container) return;
    try {
        const res = await fetch(`${API_BASE_URL}/notification-contacts`, {
            headers: { 'X-Admin-Key': getAdminKey() }
        });
        if (!res.ok) throw new Error(await res.text());
        const { contacts } = await res.json();
        if (!contacts.length) {
            container.innerHTML = '<p style="color:#9ca3af;font-size:.88rem;margin:0;">Ingen kontakter ennå.</p>';
            return;
        }
        container.innerHTML = `
            <table style="border-collapse:collapse;font-size:.9rem;width:100%;max-width:520px;">
                <thead><tr style="border-bottom:1px solid #e5e7eb;">
                    <th style="padding:6px 8px;text-align:left;color:#6b7280;font-weight:600;">Navn</th>
                    <th style="padding:6px 8px;text-align:left;color:#6b7280;font-weight:600;">Telefon</th>
                    <th style="padding:6px 8px;"></th>
                </tr></thead>
                <tbody>
                    ${contacts.map(c => `
                        <tr style="border-bottom:1px solid #f3f4f6;">
                            <td style="padding:6px 8px;">${escHtml(c.name)}</td>
                            <td style="padding:6px 8px;font-family:monospace;">${escHtml(c.phone)}</td>
                            <td style="padding:6px 8px;">
                                <button onclick="deleteAdminContact('${escHtml(c.id)}')"
                                    style="background:none;border:1px solid #fca5a5;color:#dc2626;border-radius:4px;padding:2px 10px;cursor:pointer;font-size:.82rem;">
                                    Fjern
                                </button>
                            </td>
                        </tr>`).join('')}
                </tbody>
            </table>`;
    } catch (err) {
        container.innerHTML = `<p style="color:#dc2626;font-size:.88rem;">Feil ved henting av kontakter: ${err.message}</p>`;
    }
}

async function addAdminContact(e) {
    e.preventDefault();
    const name = document.getElementById('admin-contact-name').value.trim();
    const phone = document.getElementById('admin-contact-phone').value.trim();
    const status = document.getElementById('admin-contact-status');
    status.textContent = 'Lagrer…';
    status.style.color = '#6b7280';
    try {
        const res = await fetch(`${API_BASE_URL}/notification-contacts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Admin-Key': getAdminKey() },
            body: JSON.stringify({ name, phone })
        });
        if (!res.ok) {
            let errMsg = res.statusText;
            try { const d = await res.json(); errMsg = d.error || errMsg; } catch (_) { errMsg = (await res.text()) || errMsg; }
            throw new Error(errMsg);
        }
        const data = await res.json();
        document.getElementById('admin-contact-name').value = '';
        document.getElementById('admin-contact-phone').value = '';
        status.textContent = '✓ Kontakt lagt til';
        status.style.color = '#059669';
        await loadAdminContacts();
        setTimeout(() => { status.textContent = ''; }, 3000);
    } catch (err) {
        status.textContent = `Feil: ${err.message}`;
        status.style.color = '#dc2626';
    }
}

async function deleteAdminContact(id) {
    if (!confirm('Fjerne denne kontakten fra varslingsgruppen?')) return;
    try {
        const res = await fetch(`${API_BASE_URL}/notification-contacts?id=${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: { 'X-Admin-Key': getAdminKey() }
        });
        if (!res.ok) throw new Error(await res.text());
        await loadAdminContacts();
    } catch (err) {
        alert(`Kunne ikke slette: ${err.message}`);
    }
}

function toggleSmsDashboard() {
    const panel = document.getElementById('sms-center-panel');
    const toggle = document.getElementById('sms-center-toggle');
    if (!panel) return;
    const isHidden = panel.classList.toggle('hidden');
    if (toggle) toggle.textContent = isHidden ? '▼' : '▲';
    if (!isHidden) { populateSmsBookingSelect(); loadAdminContacts(); }
}

function populateSmsBookingSelect() {
    const select = document.getElementById('sms-booking-select');
    if (!select) return;
    // Keep first placeholder option
    select.innerHTML = '<option value="">— Velg booking for å fylle inn nummer —</option>';
    const bookings = (_allBookings || []).filter(b => b.phone);
    bookings.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.id;
        opt.textContent = `${b.date} – ${b.requesterName} (${b.phone})`;
        select.appendChild(opt);
    });
}

function smsFillFromBooking() {
    const select = document.getElementById('sms-booking-select');
    const toInput = document.getElementById('sms-to');
    if (!select || !toInput) return;
    const booking = (_allBookings || []).find(b => b.id === select.value);
    if (booking && booking.phone) {
        toInput.value = booking.phone;
    }
}

function updateSmsCounter() {
    const body = document.getElementById('sms-body');
    const counter = document.getElementById('sms-char-counter');
    if (!body || !counter) return;
    const len = body.value.length;
    counter.textContent = `(${len}/160)`;
    counter.style.color = len > 140 ? '#ef4444' : '#9ca3af';
}

function openSmsCenter(bookingId, phone, name) {
    // Expand the SMS panel if collapsed
    const panel = document.getElementById('sms-center-panel');
    const toggle = document.getElementById('sms-center-toggle');
    if (panel && panel.classList.contains('hidden')) {
        panel.classList.remove('hidden');
        if (toggle) toggle.textContent = '▲';
        populateSmsBookingSelect();
    }
    // Fill in the fields
    const select = document.getElementById('sms-booking-select');
    const toInput = document.getElementById('sms-to');
    if (select) select.value = bookingId;
    if (toInput) toInput.value = phone;
    // Scroll into view
    document.getElementById('sms-center-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.getElementById('sms-body')?.focus();
}

async function sendManualSms() {
    const to = (document.getElementById('sms-to')?.value || '').trim();
    const body = (document.getElementById('sms-body')?.value || '').trim();
    const bookingId = document.getElementById('sms-booking-select')?.value || undefined;
    const statusEl = document.getElementById('sms-status');
    const btn = document.getElementById('sms-send-btn');

    if (!to) { statusEl.style.color = '#ef4444'; statusEl.textContent = 'Fyll inn telefonnummer.'; return; }
    if (!body) { statusEl.style.color = '#ef4444'; statusEl.textContent = 'Fyll inn melding.'; return; }
    if (!/^\d{8}$/.test(to)) { statusEl.style.color = '#ef4444'; statusEl.textContent = 'Nummeret må være nøyaktig 8 sifre (uten +47).'; return; }
    if (body.length > 160) { statusEl.style.color = '#ef4444'; statusEl.textContent = 'Meldingen er for lang. Maks 160 tegn.'; return; }

    btn.disabled = true;
    btn.textContent = 'Sender...';
    statusEl.textContent = '';

    try {
        const res = await fetch(`${API_BASE_URL}/sms/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-Admin-Key': getAdminKey() },
            body: JSON.stringify({ to, body, bookingId }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
            statusEl.style.color = '#059669';
            statusEl.textContent = `✓ SMS sendt til +47${to}!`;
            document.getElementById('sms-body').value = '';
            updateSmsCounter();
        } else {
            statusEl.style.color = '#ef4444';
            statusEl.textContent = `Feil: ${data.error || 'Ukjent feil.'}`;
        }
    } catch (err) {
        console.error('sendManualSms error:', err);
        statusEl.style.color = '#ef4444';
        statusEl.textContent = 'Nettverksfeil. Prøv igjen.';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Send SMS';
    }
}
