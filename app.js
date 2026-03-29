/* ============================================
   HUBI TIME TRACKER — App Logic
   ============================================ */

// ---- Service Worker Registration ----
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ---- Storage Helper ----
const Storage = {
    KEY: 'hubi_sessions',
    getAllRaw() {
        try {
            return JSON.parse(localStorage.getItem(this.KEY)) || [];
        } catch {
            return [];
        }
    },
    getSessions() {
        return this.getAllRaw().filter(s => !s.deletedAt);
    },
    saveSessions(sessions) {
        try {
            localStorage.setItem(this.KEY, JSON.stringify(sessions));
        } catch (e) {
            if (e.name === 'QuotaExceededError') {
                showToast(t('storageFull') || 'Storage full — delete old sessions');
            }
        }
    },
    addSession(session) {
        session.updatedAt = Date.now();
        const sessions = this.getAllRaw();
        sessions.unshift(session);
        this.saveSessions(sessions);
    },
    deleteSession(id) {
        const sessions = this.getAllRaw();
        const target = sessions.find(s => s.id === id);
        if (target) {
            target.deletedAt = Date.now();
            target.updatedAt = Date.now();
            this.saveSessions(sessions);
        }
    }
};

// ---- Active Session State ----
const STATE_KEY = 'hubi_active_state';
const STATE_CLEARED_KEY = 'hubi_active_cleared_at';
const ActiveState = {
    get() {
        try {
            return JSON.parse(localStorage.getItem(STATE_KEY));
        } catch {
            return null;
        }
    },
    set(state) {
        try {
            state.updatedAt = Date.now();
            localStorage.setItem(STATE_KEY, JSON.stringify(state));
        } catch {
            // Quota exceeded — active state won't persist across refresh
        }
    },
    clear() {
        localStorage.removeItem(STATE_KEY);
        localStorage.setItem(STATE_CLEARED_KEY, String(Date.now()));
    },
    getForSync() {
        const state = this.get();
        const clearedAt = Number(localStorage.getItem(STATE_CLEARED_KEY)) || 0;
        const updatedAt = state ? (state.updatedAt || 0) : clearedAt;
        return { state, updatedAt };
    },
    applyFromSync(remote) {
        if (!remote || !remote.updatedAt) return false;
        const local = this.getForSync();
        if (remote.updatedAt > local.updatedAt) {
            if (remote.state) {
                localStorage.setItem(STATE_KEY, JSON.stringify(remote.state));
            } else {
                localStorage.removeItem(STATE_KEY);
                localStorage.setItem(STATE_CLEARED_KEY, String(remote.updatedAt));
            }
            return true;
        }
        return false;
    }
};

// ---- Utility Functions ----
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function escapeAttr(str) {
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatDuration(ms) {
    if (ms < 0) ms = 0;
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatHoursMinutes(ms) {
    const totalMinutes = Math.floor(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0) return `${minutes}m`;
    if (minutes === 0) return `${hours}h`;
    return `${hours}h ${minutes}m`;
}

function formatDate(dateStr) {
    const d = new Date(dateStr);
    const options = { weekday: 'short', month: 'short', day: 'numeric' };
    return d.toLocaleDateString(I18n.getLocale(), options);
}

function formatFilterDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString(I18n.getLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString(I18n.getLocale(), { hour: '2-digit', minute: '2-digit' });
}

function todayStr() {
    return new Date().toISOString().split('T')[0];
}

function getWeekDates() {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    const dates = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        dates.push(d.toISOString().split('T')[0]);
    }
    return dates;
}

function getDayLabel(dateStr) {
    return new Date(dateStr).toLocaleDateString(I18n.getLocale(), { weekday: 'short' });
}

window.getHubiCatHTML = function(classes = '', id = 'mascot') {
    return `
        <div class="hubi-cat ${classes}" id="${id}">
            <div class="cat-tail"></div>
            <div class="cat-body">
                <div class="cat-leg back left"></div>
                <div class="cat-leg front left"></div>
                <div class="cat-leg back right"></div>
                <div class="cat-leg front right"></div>
                <div class="cat-head">
                    <div class="cat-ear left"></div>
                    <div class="cat-ear right"></div>
                    <div class="cat-face">
                        <div class="cat-eye left"></div>
                        <div class="cat-eye right"></div>
                        <div class="cat-nose"></div>
                        <div class="cat-mouth"></div>
                        <div class="cat-whiskers left"></div>
                        <div class="cat-whiskers right"></div>
                    </div>
                </div>
                <div class="cat-chest"></div>
            </div>
        </div>
    `;
};

// ---- App State ----
let currentPage = 'timer';
let timerInterval = null;

// Active session fields (persisted via ActiveState)
let activeSession = null; // { id, startTime, breaks:[], currentBreakStart, status: 'working'|'on-break' }

// ---- DOM ----
const appEl = document.getElementById('app');
const navBtns = document.querySelectorAll('.nav-btn');

// ---- Navigation ----
navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const page = btn.dataset.page;
        if (page !== currentPage) {
            navigateTo(page);
        }
    });
});

// ---- Page View Beacon ----
function sendBeacon(page) {
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return;
    try { navigator.sendBeacon('https://sync.hubi.work/beacon', JSON.stringify({ page })); } catch {}
}

function navigateTo(page) {
    currentPage = page;
    navBtns.forEach(b => b.classList.toggle('active', b.dataset.page === page));
    sendBeacon(page);
    renderPage();
}

let currentWatchPicker = null;
let currentWatchPickerCleanup = null;
let editingSessionId = null;

function cleanupWatchPicker() {
    if (currentWatchPickerCleanup) currentWatchPickerCleanup();
    if (currentWatchPicker) currentWatchPicker.remove();
    currentWatchPicker = null;
    currentWatchPickerCleanup = null;
}

function renderPage() {
    clearInterval(timerInterval);
    timerInterval = null;
    cleanupWatchPicker();
    editingSessionId = null;

    switch (currentPage) {
        case 'timer':
            renderTimerPage();
            break;
        case 'history':
            renderHistoryPage();
            break;
        case 'stats':
            renderStatsPage();
            break;
        case 'sync':
            Sync.renderSyncPage(appEl);
            break;
    }
}

// ---- Timer Page ----
function renderTimerPage() {
    activeSession = ActiveState.get();

    if (!activeSession) {
        renderIdlePage();
    } else {
        renderActivePage();
    }
}

function renderIdlePage() {
    appEl.innerHTML = `
        <div class="page">
            <div class="page-header">
                <div class="mascot-container" id="mascot-slot"></div>
                <h1 class="page-title">${t('readyToWork')}</h1>
                <p class="page-subtitle">${t('hubiWaiting')}</p>
            </div>

            <div class="timer-display">
                <div class="timer-label">${t('elapsedTime')}</div>
                <div class="timer-time" id="timer-display">00:00:00</div>
                <div class="timer-date">${new Date().toLocaleDateString(I18n.getLocale(), { weekday: 'long', month: 'long', day: 'numeric' })}</div>
            </div>

            <div class="actions">
                <button class="btn btn-start" id="btn-start">
                    <span class="btn-icon">🐾</span>
                    ${t('startWorking')}
                </button>
            </div>
        </div>
    `;

    document.getElementById('btn-start').addEventListener('click', startWork);
}

function renderActivePage() {
    const isBreak = activeSession.status === 'on-break';
    const statusEmoji = isBreak ? '💤' : '⚡';
    const statusClass = isBreak ? 'on-break' : 'working';
    const mascotClass = isBreak ? 'on-break' : 'working';
    const statusText = isBreak ? t('takingBreak') : t('workingHard');
    const subtitleText = isBreak ? t('hubiNapping') : t('hubiBusy');

    appEl.innerHTML = `
        <div class="page">
            <div class="page-header">
                <div class="mascot-container">
                    <span class="mascot-status">${statusEmoji}</span>
                </div>
                <h1 class="page-title">${statusText}</h1>
                <p class="page-subtitle">${subtitleText}</p>
            </div>

            <div class="timer-display ${statusClass}">
                <div class="timer-label ${statusClass}">${isBreak ? t('breakTime') : t('workTime')}</div>
                <div class="timer-time" id="timer-display">00:00:00</div>
                <div class="timer-date">${t('startedAt')} ${formatTime(activeSession.startTime)}</div>
                <div class="timer-breakdown">
                    <div class="breakdown-item">
                        <div class="breakdown-label">${t('totalWork')}</div>
                        <div class="breakdown-value" id="total-work">--:--</div>
                    </div>
                    <div class="breakdown-item">
                        <div class="breakdown-label">${t('totalBreak')}</div>
                        <div class="breakdown-value" id="total-break">--:--</div>
                    </div>
                </div>
            </div>

            <div class="actions">
                ${isBreak ? `
                    <button class="btn btn-resume" id="btn-resume">
                        <span class="btn-icon">🐾</span>
                        ${t('resumeWorking')}
                    </button>
                ` : `
                    <button class="btn btn-break" id="btn-break">
                        <span class="btn-icon">☕</span>
                        ${t('takeBreak')}
                    </button>
                `}
                <button class="btn btn-finish" id="btn-finish">
                    <span class="btn-icon">🏁</span>
                    ${t('finishWork')}
                </button>
            </div>
        </div>
    `;

    if (isBreak) {
        document.getElementById('btn-resume').addEventListener('click', resumeWork);
    } else {
        document.getElementById('btn-break').addEventListener('click', startBreak);
    }
    document.getElementById('btn-finish').addEventListener('click', confirmFinish);

    updateTimerDisplay();
    timerInterval = setInterval(updateTimerDisplay, 1000);
}

function updateTimerDisplay() {
    if (!activeSession) return;
    const now = Date.now();
    const isBreak = activeSession.status === 'on-break';

    // Calculate total break time
    let totalBreakMs = 0;
    for (const b of activeSession.breaks) {
        if (b.end) {
            totalBreakMs += b.end - b.start;
        }
    }
    // Current break in progress
    let currentBreakMs = 0;
    if (isBreak && activeSession.currentBreakStart) {
        currentBreakMs = now - activeSession.currentBreakStart;
        totalBreakMs += currentBreakMs;
    }

    const totalElapsed = now - activeSession.startTime;
    const totalWorkMs = totalElapsed - totalBreakMs;

    // Main timer shows work or break time
    const timerEl = document.getElementById('timer-display');
    if (timerEl) {
        if (isBreak) {
            timerEl.textContent = formatDuration(currentBreakMs);
        } else {
            timerEl.textContent = formatDuration(totalWorkMs);
        }
    }

    const totalWorkEl = document.getElementById('total-work');
    const totalBreakEl = document.getElementById('total-break');
    if (totalWorkEl) totalWorkEl.textContent = formatHoursMinutes(totalWorkMs);
    if (totalBreakEl) totalBreakEl.textContent = formatHoursMinutes(totalBreakMs);
}

// ---- Timer Actions ----
function startWork() {
    activeSession = {
        id: generateId(),
        startTime: Date.now(),
        breaks: [],
        currentBreakStart: null,
        status: 'working'
    };
    ActiveState.set(activeSession);
    showToast(t('toastStartWork'));
    renderActivePage();
}

function startBreak() {
    if (!activeSession) return;
    activeSession.status = 'on-break';
    activeSession.currentBreakStart = Date.now();
    ActiveState.set(activeSession);
    showToast(t('toastBreak'));
    renderActivePage();
}

function resumeWork() {
    if (!activeSession) return;
    // End current break
    if (activeSession.currentBreakStart) {
        activeSession.breaks.push({
            start: activeSession.currentBreakStart,
            end: Date.now()
        });
    }
    activeSession.currentBreakStart = null;
    activeSession.status = 'working';
    ActiveState.set(activeSession);
    showToast(t('toastResume'));
    renderActivePage();
}

function confirmFinish() {
    showDialog(
        '🏁',
        t('finishQuestion'),
        t('finishDescription'),
        t('finish'),
        t('cancel'),
        finishWork
    );
}

function finishWork() {
    if (!activeSession) return;
    const endTime = Date.now();

    // End any ongoing break
    if (activeSession.status === 'on-break' && activeSession.currentBreakStart) {
        activeSession.breaks.push({
            start: activeSession.currentBreakStart,
            end: endTime
        });
    }

    // Calculate totals
    let totalBreakMs = 0;
    for (const b of activeSession.breaks) {
        totalBreakMs += (b.end - b.start);
    }
    const totalElapsed = endTime - activeSession.startTime;
    const totalWorkMs = totalElapsed - totalBreakMs;

    // Build session record
    const session = {
        id: activeSession.id,
        date: new Date(activeSession.startTime).toISOString().split('T')[0],
        startTime: activeSession.startTime,
        endTime: endTime,
        breaks: activeSession.breaks,
        totalWork: totalWorkMs,
        totalBreak: totalBreakMs
    };

    Storage.addSession(session);
    ActiveState.clear();
    activeSession = null;
    clearInterval(timerInterval);

    showSessionSummary(session);
}

function showSessionSummary(session) {
    appEl.innerHTML = `
        <div class="page">
            <div class="summary-card">
                <div class="summary-emoji">🎉</div>
                <div class="summary-title">${t('greatWork')}</div>
                <div class="summary-stats">
                    <div class="summary-stat">
                        <div class="summary-stat-label">${t('work')}</div>
                        <div class="summary-stat-value">${formatHoursMinutes(session.totalWork)}</div>
                    </div>
                    <div class="summary-stat">
                        <div class="summary-stat-label">${t('breaks')}</div>
                        <div class="summary-stat-value">${formatHoursMinutes(session.totalBreak)}</div>
                    </div>
                    <div class="summary-stat">
                        <div class="summary-stat-label">${t('total')}</div>
                        <div class="summary-stat-value">${formatHoursMinutes(session.endTime - session.startTime)}</div>
                    </div>
                </div>
                <button class="btn btn-start" id="btn-done">
                    <span class="btn-icon">🐱</span>
                    Pawsome!
                </button>
            </div>
        </div>
    `;

    document.getElementById('btn-done').addEventListener('click', () => {
        renderTimerPage();
    });
}

// ---- History Page ----
function getCurrentMonthRange() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
    return { from: `${y}-${m}-01`, to: `${y}-${m}-${String(lastDay).padStart(2, '0')}` };
}
const defaultRange = getCurrentMonthRange();
let historyFilterFrom = defaultRange.from;
let historyFilterTo = defaultRange.to;

function renderHistoryPage() {
    let sessions = Storage.getSessions();

    // Apply filters
    if (historyFilterFrom) {
        sessions = sessions.filter(s => s.date >= historyFilterFrom);
    }
    if (historyFilterTo) {
        sessions = sessions.filter(s => s.date <= historyFilterTo);
    }

    const defRange = getCurrentMonthRange();
    const hasFilters = historyFilterFrom !== defRange.from || historyFilterTo !== defRange.to;

    appEl.innerHTML = `
        <div class="page">
            <div class="page-header">
                <div class="mascot-container">
                </div>
                <h1 class="page-title">${t('history')}</h1>
                <p class="page-subtitle">${t('yourSessions')}</p>
            </div>

            <div class="filter-bar">
                <div class="filter-date-wrap">
                    <button type="button" class="filter-date-btn" id="filter-from-btn">${formatFilterDate(historyFilterFrom)}</button>
                    <input type="date" id="filter-from" value="${historyFilterFrom}" class="filter-date-hidden">
                </div>
                <div class="filter-date-wrap">
                    <button type="button" class="filter-date-btn" id="filter-to-btn">${formatFilterDate(historyFilterTo)}</button>
                    <input type="date" id="filter-to" value="${historyFilterTo}" class="filter-date-hidden">
                </div>
                ${hasFilters ? '<button class="filter-clear" id="filter-clear">✕</button>' : ''}
            </div>

            <div id="history-list">
                ${sessions.length === 0 ? renderEmptyHistory() : sessions.map(s => s.id === editingSessionId ? renderEditSessionCard(s) : renderSessionCard(s)).join('')}
            </div>
        </div>
    `;

    // Filter listeners
    const fromInput = document.getElementById('filter-from');
    const toInput = document.getElementById('filter-to');
    document.getElementById('filter-from-btn').addEventListener('click', () => {
        if (fromInput.showPicker) fromInput.showPicker(); else fromInput.click();
    });
    document.getElementById('filter-to-btn').addEventListener('click', () => {
        if (toInput.showPicker) toInput.showPicker(); else toInput.click();
    });
    fromInput.addEventListener('change', (e) => {
        historyFilterFrom = e.target.value;
        renderHistoryPage();
    });
    toInput.addEventListener('change', (e) => {
        historyFilterTo = e.target.value;
        renderHistoryPage();
    });
    const clearBtn = document.getElementById('filter-clear');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            const r = getCurrentMonthRange();
            historyFilterFrom = r.from;
            historyFilterTo = r.to;
            renderHistoryPage();
        });
    }

    // Edit listeners
    document.querySelectorAll('.card-edit').forEach(btn => {
        btn.addEventListener('click', (e) => {
            editingSessionId = e.currentTarget.dataset.id;
            renderHistoryPage();
        });
    });

    document.querySelectorAll('.card-cancel-edit').forEach(btn => {
        btn.addEventListener('click', () => {
            editingSessionId = null;
            renderHistoryPage();
        });
    });

    document.querySelectorAll('.card-save-edit').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.dataset.id;
            const fromValue = getCustomTimePickerValue(`edit-from-${id}`);
            const toValue = getCustomTimePickerValue(`edit-to-${id}`);
            if (fromValue && toValue) {
                saveSessionEdit(id, fromValue, toValue);
            }
        });
    });

    // Watch picker trigger listeners
    document.querySelectorAll('.wp-trigger').forEach(btn => {
        btn.addEventListener('click', () => {
            const pickerId = btn.dataset.pickerId;
            const is24h = btn.dataset.is24h === 'true';
            openWatchPickerFor(pickerId, is24h);
        });
    });

    // Delete listeners
    document.querySelectorAll('.card-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.dataset.id;
            showDialog(
                '🗑️',
                t('deleteSession'),
                t('deleteDescription'),
                t('delete'),
                t('keepIt'),
                () => {
                    Storage.deleteSession(id);
                    showToast(t('sessionDeleted'));
                    renderHistoryPage();
                }
            );
        });
    });
}

function renderEmptyHistory() {
    return `
        <div class="empty-state">
            <div class="empty-state-emoji">😿</div>
            <div class="empty-state-text">${t('noSessionsYet')}</div>
            <div class="empty-state-sub">${t('startTrackingHistory')}</div>
        </div>
    `;
}

function renderSessionCard(session) {
    return `
        <div class="card">
            <button class="card-delete" data-id="${escapeAttr(session.id)}" title="${t('delete')}">✕</button>
            <button class="card-edit" data-id="${escapeAttr(session.id)}" title="${t('edit')}">✏️</button>
            <div class="card-header">
                <div class="card-title">${formatDate(session.date)}</div>
                <div class="card-date">${formatTime(session.startTime)} – ${formatTime(session.endTime)}</div>
            </div>
            <div class="card-body">
                <div class="card-stat">
                    <div class="card-stat-label">${t('work')}</div>
                    <div class="card-stat-value work">${formatHoursMinutes(session.totalWork)}</div>
                </div>
                <div class="card-stat">
                    <div class="card-stat-label">${t('breaks')}</div>
                    <div class="card-stat-value break-val">${formatHoursMinutes(session.totalBreak)}</div>
                </div>
                <div class="card-stat">
                    <div class="card-stat-label">${t('total')}</div>
                    <div class="card-stat-value">${formatHoursMinutes(session.endTime - session.startTime)}</div>
                </div>
            </div>
        </div>
    `;
}

function detectIs24h() {
    const formatted = new Intl.DateTimeFormat(I18n.getLocale(), { hour: 'numeric' }).format(new Date(2000, 0, 1, 13));
    return formatted.includes('13');
}

function formatTimeDisplay(timeString, is24h) {
    if (is24h) return timeString;
    const [hh, mm] = timeString.split(':').map(Number);
    const ampm = hh >= 12 ? 'PM' : 'AM';
    const h12 = hh % 12 || 12;
    return `${String(h12).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${ampm}`;
}

function createCustomTimePicker(id, timeString, is24h) {
    return `
        <div class="watch-picker-wrapper">
            <button type="button" class="native-time-picker wp-trigger" id="btn-${id}" data-picker-id="${id}" data-is24h="${is24h}">${formatTimeDisplay(timeString, is24h)}</button>
            <input type="hidden" id="${id}" value="${timeString}">
        </div>
    `;
}

function getCustomTimePickerValue(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    return el.value;
}

function openWatchPickerFor(pickerId, is24h) {
    const hiddenInput = document.getElementById(pickerId);
    const btn = document.getElementById(`btn-${pickerId}`);
    if (!hiddenInput) return;

    showWatchPicker(hiddenInput.value, is24h, (newTime) => {
        hiddenInput.value = newTime;
        btn.textContent = formatTimeDisplay(newTime, is24h);
    });
}

function showWatchPicker(initialTime, is24h, onSave) {
    if (currentWatchPicker) {
        if (currentWatchPickerCleanup) currentWatchPickerCleanup();
        currentWatchPicker.remove();
    }

    let [h, m] = initialTime.split(':').map(Number);
    let ampm = 'AM';

    if (!is24h) {
        ampm = (h >= 12) ? 'PM' : 'AM';
        h = h % 12 || 12;
    }

    let mode = 'hour';
    let isDragging = false;
    let hasDragged = false;

    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay wp-overlay';

    overlay.innerHTML = `
        <div class="watch-picker-modal dialog">
            <div class="wp-header">
                <div class="wp-time-display">
                    <span id="wp-h-disp" class="wp-segment wp-segment-active">${is24h ? String(h).padStart(2, '0') : String(h)}</span>:<span id="wp-m-disp" class="wp-segment wp-segment-dim">${String(m).padStart(2, '0')}</span>
                </div>
                ${!is24h ? `
                <div class="wp-ampm-switch">
                    <button id="wp-am-btn" class="wp-ampm-btn ${ampm === 'AM' ? 'wp-ampm-active' : 'wp-ampm-dim'}">AM</button>
                    <button id="wp-pm-btn" class="wp-ampm-btn ${ampm === 'PM' ? 'wp-ampm-active' : 'wp-ampm-dim'}">PM</button>
                </div>
                ` : ''}
            </div>
            <div class="wp-body">
                <div class="wp-dial-container" id="wp-dial">
                    <div class="wp-center-dot"></div>
                    <div class="wp-hand" id="wp-hand"></div>
                    <div class="wp-numbers" id="wp-numbers"></div>
                </div>
            </div>
            <div class="dialog-actions wp-actions">
                <button class="btn btn-secondary wp-action-btn" id="wp-cancel">${t('cancel')}</button>
                <button class="btn btn-start wp-action-btn" id="wp-ok">${t('save')}</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    currentWatchPicker = overlay;
    currentWatchPickerCleanup = null;

    const hDisp = overlay.querySelector('#wp-h-disp');
    const mDisp = overlay.querySelector('#wp-m-disp');
    const numbersContainer = overlay.querySelector('#wp-numbers');
    const hand = overlay.querySelector('#wp-hand');
    const dial = overlay.querySelector('#wp-dial');

    if (!is24h) {
        overlay.querySelector('#wp-am-btn').addEventListener('click', () => {
            ampm = 'AM';
            overlay.querySelector('#wp-am-btn').className = 'wp-ampm-btn wp-ampm-active';
            overlay.querySelector('#wp-pm-btn').className = 'wp-ampm-btn wp-ampm-dim';
        });
        overlay.querySelector('#wp-pm-btn').addEventListener('click', () => {
            ampm = 'PM';
            overlay.querySelector('#wp-pm-btn').className = 'wp-ampm-btn wp-ampm-active';
            overlay.querySelector('#wp-am-btn').className = 'wp-ampm-btn wp-ampm-dim';
        });
    }

    function setHand(angle, radiusOffset = 0) {
        hand.style.transform = `rotate(${angle}deg)`;
        hand.style.height = `calc(50% - ${radiusOffset + 14}px)`;
    }

    function getAngleFromEvent(e) {
        const rect = dial.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        let angle = Math.atan2(clientX - cx, -(clientY - cy)) * (180 / Math.PI);
        if (angle < 0) angle += 360;
        return angle;
    }

    function updateActiveHighlight() {
        numbersContainer.querySelectorAll('.wp-number').forEach(el => {
            const val = Number(el.dataset.val);
            const isActive = mode === 'hour' ? val === h : val === (Math.floor(m / 5) * 5);
            el.classList.toggle('wp-number-active', isActive);
        });
    }

    function handleDragMove(e) {
        if (!isDragging) return;
        e.preventDefault();
        hand.style.transition = 'none';
        const angle = getAngleFromEvent(e);

        if (mode === 'minute') {
            m = Math.round(angle / 6) % 60;
            mDisp.textContent = String(m).padStart(2, '0');
            setHand(m * 6, 0);
        } else {
            let val = Math.round(angle / 30) % 12;
            if (is24h) {
                const rect = dial.getBoundingClientRect();
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                const clientY = e.touches ? e.touches[0].clientY : e.clientY;
                const dist = Math.sqrt((clientX - cx) ** 2 + (clientY - cy) ** 2);
                const scale = rect.width / 2 / DIAL_RADIUS;
                const midpoint = (DIAL_RADIUS + (DIAL_RADIUS - INNER_RING_OFFSET)) / 2;
                const isInner = dist < midpoint * scale;
                if (isInner) {
                    val = val === 0 ? 0 : val + 12;
                    if (val > 23) val = 0;
                }
                h = val;
                hDisp.textContent = String(h).padStart(2, '0');
                setHand((h % 12) * 30, (h === 0 || h > 12) ? INNER_RING_OFFSET : 0);
            } else {
                h = val === 0 ? 12 : val;
                hDisp.textContent = String(h);
                setHand((h % 12) * 30, 0);
            }
        }
        updateActiveHighlight();
    }

    function handleDragEnd() {
        if (!isDragging) return;
        isDragging = false;
        hand.style.transition = '';
        if (mode === 'hour' && hasDragged) {
            mode = 'minute';
            hDisp.className = 'wp-segment wp-segment-dim';
            mDisp.className = 'wp-segment wp-segment-active';
            setTimeout(() => renderDialNumbers(), 50);
        }
    }

    function handleMouseMove(e) { if (isDragging) { hasDragged = true; handleDragMove(e); } }
    function handleTouchMove(e) { if (isDragging) { hasDragged = true; handleDragMove(e); } }

    dial.addEventListener('mousedown', () => { isDragging = true; hasDragged = false; });
    dial.addEventListener('touchstart', () => { isDragging = true; hasDragged = false; }, { passive: false });
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('mouseup', handleDragEnd);
    document.addEventListener('touchend', handleDragEnd);

    function cleanupDragListeners() {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('mouseup', handleDragEnd);
        document.removeEventListener('touchend', handleDragEnd);
    }
    currentWatchPickerCleanup = cleanupDragListeners;

    const DIAL_RADIUS = 95;
    const INNER_RING_OFFSET = 35;
    const INNER_RING_THRESHOLD = DIAL_RADIUS - INNER_RING_OFFSET;

    function renderDialNumbers() {
        numbersContainer.innerHTML = '';
        const items = mode === 'hour' ? (is24h ? 24 : 12) : 12;

        for (let i = 0; i < items; i++) {
            let label, val;
            let currentRadius = DIAL_RADIUS;

            if (mode === 'hour') {
                if (is24h) {
                    val = i;
                    label = i === 0 ? '00' : String(i);
                    if (val === 0 || val > 12) currentRadius = DIAL_RADIUS - INNER_RING_OFFSET;
                } else {
                    val = i === 0 ? 12 : i;
                    label = String(val);
                }
            } else {
                val = i * 5;
                label = String(val).padStart(2, '0');
            }

            let angleDeg;
            if (mode === 'hour') {
                angleDeg = (val % 12) * 30;
            } else {
                angleDeg = (val / 5) * 30;
            }

            const isInner = is24h && mode === 'hour' && (val === 0 || val > 12);
            const isActive = mode === 'hour' ? val === h : val === (Math.floor(m / 5) * 5);

            const numEl = document.createElement('div');
            numEl.className = 'wp-number' +
                (isInner ? ' wp-number-inner' : ' wp-number-outer') +
                (isActive ? ' wp-number-active' : '');

            if (isActive) {
                setHand(angleDeg, DIAL_RADIUS - currentRadius);
            }

            numEl.textContent = label;
            numEl.dataset.val = val;

            const rad = (angleDeg - 90) * (Math.PI / 180);
            const x = Math.round(currentRadius * Math.cos(rad));
            const y = Math.round(currentRadius * Math.sin(rad));
            numEl.style.left = `calc(50% + ${x}px)`;
            numEl.style.top = `calc(50% + ${y}px)`;

            numEl.addEventListener('click', (e) => {
                e.stopPropagation();
                if (mode === 'hour') {
                    h = val;
                    hDisp.textContent = is24h ? String(h).padStart(2, '0') : String(h);
                    mode = 'minute';
                    hDisp.className = 'wp-segment wp-segment-dim';
                    mDisp.className = 'wp-segment wp-segment-active';
                    setTimeout(() => renderDialNumbers(), 50);
                } else {
                    m = val;
                    mDisp.textContent = String(m).padStart(2, '0');
                    renderDialNumbers();
                }
            });

            numbersContainer.appendChild(numEl);
        }

        // In minute mode, show the exact minute marker if not on a 5-min label
        if (mode === 'minute' && m % 5 !== 0) {
            setHand(m * 6, 0);
        }
    }

    hDisp.addEventListener('click', () => {
        mode = 'hour';
        mDisp.className = 'wp-segment wp-segment-dim';
        hDisp.className = 'wp-segment wp-segment-active';
        renderDialNumbers();
    });
    mDisp.addEventListener('click', () => {
        mode = 'minute';
        hDisp.className = 'wp-segment wp-segment-dim';
        mDisp.className = 'wp-segment wp-segment-active';
        renderDialNumbers();
    });

    overlay.querySelector('#wp-cancel').addEventListener('click', () => {
        cleanupDragListeners();
        overlay.remove();
        currentWatchPicker = null;
    });

    overlay.querySelector('#wp-ok').addEventListener('click', () => {
        let finalH = h;
        if (!is24h) {
            if (ampm === 'PM' && finalH < 12) finalH += 12;
            if (ampm === 'AM' && finalH === 12) finalH = 0;
        }
        const timeVal = `${String(finalH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        cleanupDragListeners();
        overlay.remove();
        currentWatchPicker = null;
        onSave(timeVal);
    });

    renderDialNumbers();
}

function renderEditSessionCard(session) {
    const fromTime = new Date(session.startTime).toTimeString().slice(0, 5);
    const toTime = new Date(session.endTime).toTimeString().slice(0, 5);
    const is24h = detectIs24h();

    return `
        <div class="card edit-card" id="session-edit-${session.id}">
            <div class="card-header">
                <div class="card-title">${t('editSession')} - ${formatDate(session.date)}</div>
            </div>
            <div class="card-body">
                <div class="time-picker-group">
                    <label>${t('from')}</label>
                    ${createCustomTimePicker(`edit-from-${session.id}`, fromTime, is24h)}
                </div>
                <div class="time-picker-group">
                    <label>${t('to')}</label>
                    ${createCustomTimePicker(`edit-to-${session.id}`, toTime, is24h)}
                </div>
            </div>
            <div class="card-actions">
                <button class="btn btn-secondary card-cancel-edit card-action-btn">${t('cancel')}</button>
                <button class="btn btn-start card-save-edit card-action-btn card-action-btn-save" data-id="${escapeAttr(session.id)}">${t('save')}</button>
            </div>
        </div>
    `;
}

function saveSessionEdit(id, fromValue, toValue) {
    let sessions = Storage.getSessions();
    const sessionIndex = sessions.findIndex(s => s.id === id);
    if (sessionIndex === -1) {
        editingSessionId = null;
        renderHistoryPage();
        return;
    }

    const session = sessions[sessionIndex];
    const dateStr = session.date;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        showToast(t('sessionUpdateFailed'));
        editingSessionId = null;
        renderHistoryPage();
        return;
    }

    const newStartTs = new Date(`${dateStr}T${fromValue}:00`).getTime();
    let newEndTs = new Date(`${dateStr}T${toValue}:00`).getTime();

    if (isNaN(newStartTs) || isNaN(newEndTs)) {
        showToast(t('sessionUpdateFailed'));
        editingSessionId = null;
        renderHistoryPage();
        return;
    }

    if (newEndTs <= newStartTs) {
        newEndTs += 24 * 60 * 60 * 1000;
    }

    const totalElapsed = newEndTs - newStartTs;
    const MAX_SESSION_MS = 16 * 60 * 60 * 1000;
    if (totalElapsed > MAX_SESSION_MS) {
        showToast(t('sessionTooLong'));
        return;
    }

    session.startTime = newStartTs;
    session.endTime = newEndTs;

    let breaksWereReset = false;
    if (session.totalBreak > totalElapsed) {
        session.totalBreak = 0;
        session.breaks = [];
        breaksWereReset = true;
    }
    session.totalWork = totalElapsed - session.totalBreak;

    sessions[sessionIndex] = session;
    Storage.saveSessions(sessions);
    showToast(breaksWereReset ? t('sessionUpdatedBreaksReset') : t('sessionUpdated'));

    editingSessionId = null;
    renderHistoryPage();
}

// ---- Statistics Page ----
let statsPeriod = 'week'; // 'week' | 'month' | 'all'

function renderStatsPage() {
    const allSessions = Storage.getSessions();
    const now = new Date();

    // Filter by period
    let sessions;
    if (statsPeriod === 'week') {
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
        weekStart.setHours(0, 0, 0, 0);
        sessions = allSessions.filter(s => new Date(s.date) >= weekStart);
    } else if (statsPeriod === 'month') {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        sessions = allSessions.filter(s => new Date(s.date) >= monthStart);
    } else {
        sessions = allSessions;
    }

    // Compute stats
    const totalWorkMs = sessions.reduce((sum, s) => sum + s.totalWork, 0);
    const totalBreakMs = sessions.reduce((sum, s) => sum + s.totalBreak, 0);
    const daysWorked = new Set(sessions.map(s => s.date)).size;
    const avgWorkMs = daysWorked > 0 ? totalWorkMs / daysWorked : 0;

    // Hubi insight
    const insight = getHubiInsight(totalWorkMs, daysWorked, statsPeriod);

    appEl.innerHTML = `
        <div class="page">
            <div class="page-header">
                <div class="mascot-container">
                </div>
                <h1 class="page-title">${t('statistics')}</h1>
                <p class="page-subtitle">${t('howProductivity')}</p>
            </div>

            <div class="period-toggle">
                <button class="period-btn ${statsPeriod === 'week' ? 'active' : ''}" data-period="week">${t('week')}</button>
                <button class="period-btn ${statsPeriod === 'month' ? 'active' : ''}" data-period="month">${t('month')}</button>
                <button class="period-btn ${statsPeriod === 'all' ? 'active' : ''}" data-period="all">${t('allTime')}</button>
            </div>

            <div class="hubi-insight">
                <div class="hubi-insight-text">${insight}</div>
            </div>

            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-card-icon">⏱️</div>
                    <div class="stat-card-value">${formatHoursMinutes(totalWorkMs)}</div>
                    <div class="stat-card-label">${t('totalWork')}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-icon">☕</div>
                    <div class="stat-card-value">${formatHoursMinutes(totalBreakMs)}</div>
                    <div class="stat-card-label">${t('totalBreaks')}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-icon">📅</div>
                    <div class="stat-card-value">${daysWorked}</div>
                    <div class="stat-card-label">${t('daysWorked')}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-icon">📊</div>
                    <div class="stat-card-value">${formatHoursMinutes(avgWorkMs)}</div>
                    <div class="stat-card-label">${t('avgPerDay')}</div>
                </div>
            </div>

            ${statsPeriod === 'week' ? renderWeekChart(sessions) : ''}

            ${sessions.length === 0 ? `
                <div class="empty-state">
                    <div class="empty-state-emoji">📊</div>
                    <div class="empty-state-text">${t('noDataPeriod')}</div>
                    <div class="empty-state-sub">${t('startTrackingStats')}</div>
                </div>
            ` : ''}
        </div>
    `;

    // Period toggle listeners
    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            statsPeriod = btn.dataset.period;
            renderStatsPage();
        });
    });
}

function renderWeekChart(sessions) {
    const weekDates = getWeekDates();
    const dailyWork = {};
    const dailyBreak = {};

    for (const date of weekDates) {
        dailyWork[date] = 0;
        dailyBreak[date] = 0;
    }

    for (const s of sessions) {
        if (dailyWork[s.date] !== undefined) {
            dailyWork[s.date] += s.totalWork;
            dailyBreak[s.date] += s.totalBreak;
        }
    }

    // Find max for scaling
    const allValues = weekDates.map(d => dailyWork[d] + dailyBreak[d]);
    const maxVal = Math.max(...allValues, 1);

    const barsHTML = weekDates.map(date => {
        const workH = Math.max((dailyWork[date] / maxVal) * 120, dailyWork[date] > 0 ? 8 : 0);
        const breakH = Math.max((dailyBreak[date] / maxVal) * 120, dailyBreak[date] > 0 ? 4 : 0);
        const isToday = date === todayStr();
        return `
            <div class="chart-bar-group">
                <div class="chart-bar break-bar" style="height: ${breakH}px;" title="${t('breakTime')}: ${formatHoursMinutes(dailyBreak[date])}"></div>
                <div class="chart-bar work-bar" style="height: ${workH}px;" title="${t('workTime')}: ${formatHoursMinutes(dailyWork[date])}"></div>
                <span class="chart-bar-label" style="${isToday ? 'color: var(--orange-primary); font-weight: 900;' : ''}">${getDayLabel(date)}</span>
            </div>
        `;
    }).join('');

    return `
        <div class="chart-container">
            <div class="chart-title">${t('thisWeek')}</div>
            <div class="chart-bars">
                ${barsHTML}
            </div>
        </div>
    `;
}

function getHubiInsight(totalWorkMs, daysWorked, period) {
    const totalHours = totalWorkMs / 3600000;
    const h = totalHours.toFixed(0);

    if (daysWorked === 0 || totalHours < 0.5) {
        const messages = [
            t('insightWaiting'),
            t('insightNoSessions'),
            t('insightBored')
        ];
        return messages[Math.floor(Math.random() * messages.length)];
    }

    if (period === 'week') {
        if (totalHours >= 40) return t('insightWeek40')(h);
        if (totalHours >= 30) return t('insightWeek30')(h);
        if (totalHours >= 20) return t('insightWeek20')(h);
        return t('insightWeekLow')(h);
    }

    if (period === 'month') {
        if (totalHours >= 160) return t('insightMonth160')(h);
        if (totalHours >= 80) return t('insightMonth80')(h);
        return t('insightMonthLow')(h);
    }

    return t('insightAll')(h, daysWorked);
}

// ---- Treat notification ----
window.addEventListener('hubi-treat-unlocked', () => {
    showToast(t('toastTreat'), 8000);
});

// ---- Toast ----
let toastTimeout = null;
function showToast(message, duration = 2500) {
    // Remove existing toast
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    clearTimeout(toastTimeout);

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add('visible');
    });

    toastTimeout = setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 400);
    }, duration);
}

// ---- Dialog ----
function showDialog(emoji, title, text, confirmLabel, cancelLabel, onConfirm) {
    const existing = document.querySelector('.dialog-overlay');
    if (existing) return;
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = `
        <div class="dialog">
            <div class="dialog-emoji"></div>
            <div class="dialog-title"></div>
            <div class="dialog-text"></div>
            <div class="dialog-actions">
                <button class="btn btn-secondary" id="dialog-cancel"></button>
                <button class="btn btn-finish" id="dialog-confirm"></button>
            </div>
        </div>
    `;
    overlay.querySelector('.dialog-emoji').textContent = emoji;
    overlay.querySelector('.dialog-title').textContent = title;
    overlay.querySelector('.dialog-text').textContent = text;
    overlay.querySelector('#dialog-cancel').textContent = cancelLabel;
    overlay.querySelector('#dialog-confirm').textContent = confirmLabel;
    document.body.appendChild(overlay);

    document.getElementById('dialog-cancel').addEventListener('click', () => overlay.remove());
    document.getElementById('dialog-confirm').addEventListener('click', () => {
        overlay.remove();
        onConfirm();
    });
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });
}

// ---- Changelog ----
const CHANGELOG_VERSION = 2;
const CHANGELOG_ENTRIES = [
    { emoji: '☁️', titleKey: 'whatsNewCloudSyncTitle', descKey: 'whatsNewCloudSyncDesc' },
    { emoji: '✏️', titleKey: 'whatsNewEditEntryTitle', descKey: 'whatsNewEditEntryDesc' },
];

function showChangelog() {
    const CHANGELOG_KEY = 'hubi_changelog_seen';
    // Migrate from old v1 key
    if (localStorage.getItem('hubi_changelog_v1_seen')) {
        localStorage.setItem(CHANGELOG_KEY, '1');
        localStorage.removeItem('hubi_changelog_v1_seen');
    }
    const seen = parseInt(localStorage.getItem(CHANGELOG_KEY) || '0', 10);
    if (seen >= CHANGELOG_VERSION) return;

    if (document.querySelector('.dialog-overlay')) return;

    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = `
        <div class="dialog changelog-dialog">
            <div class="dialog-emoji">✨</div>
            <div class="dialog-title">${t('whatsNew')}</div>
            <div class="changelog-list">
                ${CHANGELOG_ENTRIES.map(e => `
                    <div class="changelog-item">
                        <div class="changelog-title">${e.emoji} ${t(e.titleKey)}</div>
                        <div class="changelog-desc">${t(e.descKey)}</div>
                    </div>
                `).join('')}
            </div>
            <div class="dialog-actions">
                <button class="btn btn-start" style="width: 100%;" id="changelog-awesome">Awesome!</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const closeBtn = document.getElementById('changelog-awesome');
    closeBtn.addEventListener('click', () => {
        localStorage.setItem(CHANGELOG_KEY, String(CHANGELOG_VERSION));
        overlay.remove();
    });
}

// ---- Initialize ----
renderPage();
sendBeacon(currentPage);
showChangelog();
