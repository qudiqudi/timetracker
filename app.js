/* ============================================
   HUBI TIME TRACKER — App Logic
   ============================================ */

// ---- Service Worker Registration + Auto-Update ----
// PWAs (especially on Android) often stay open for days. Even though the
// service worker calls skipWaiting/clients.claim to activate new versions
// immediately, the running tab keeps executing the JS it loaded at startup
// — so users sit on stale code until they hard-refresh. The block below
// detects when a new SW takes over (controllerchange) and reloads, deferring
// to the next visibility=hidden moment so the user never sees a flash.
if ('serviceWorker' in navigator) {
    // Track whether we had a controller at page load. If not, the first
    // controllerchange is just the initial registration and we must NOT reload.
    const hadInitialController = !!navigator.serviceWorker.controller;
    let pendingReload = false;
    let reloading = false;

    function scheduleReload() {
        if (reloading) return;
        // If the page is already hidden, reload right away — user won't see
        // anything. Otherwise wait for them to look away.
        if (document.visibilityState === 'hidden') {
            reloading = true;
            window.location.reload();
        } else {
            pendingReload = true;
        }
    }

    document.addEventListener('visibilitychange', () => {
        if (pendingReload && document.visibilityState === 'hidden' && !reloading) {
            reloading = true;
            window.location.reload();
        }
        // When the user returns to the app, ask the SW to check for a new
        // version. Catches the "PWA open for days" case.
        if (document.visibilityState === 'visible') {
            navigator.serviceWorker.getRegistration().then(reg => {
                if (reg) reg.update().catch(() => {});
            });
        }
    });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadInitialController) return; // first install — nothing to reload
        scheduleReload();
    });

    navigator.serviceWorker.register('sw.js').then(reg => {
        // Periodic background check (hourly) for long-lived PWA sessions.
        setInterval(() => { reg.update().catch(() => {}); }, 60 * 60 * 1000);
    }).catch(() => {});
}

// ---- Storage Helper ----
const SNAPSHOT_PREFIX = 'hubi_snapshot_';
const MAX_SNAPSHOTS = 7;
const BACKUP_NUDGE_KEY = 'hubi_sessions_since_backup_v1';
const BACKUP_NUDGE_THRESHOLD = 30;

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
    // Hard guard: refuse to persist non-arrays or a full wipe of a non-empty
    // history. Returns true on success, false if blocked. Callers do not need
    // to react to false — the data is preserved either way; we just refuse
    // to overwrite with something that's clearly a bug.
    saveSessions(sessions) {
        if (!Array.isArray(sessions)) {
            console.error('Storage.saveSessions blocked: not an array', sessions);
            return false;
        }
        const current = this.getAllRaw();
        const currAlive = current.filter(s => !s.deletedAt).length;
        const newAlive = sessions.filter(s => !s.deletedAt).length;
        // Block a full wipe when there's existing data. There's no UI path
        // that should ever produce this; if we see it, it's a bug.
        if (sessions.length === 0 && current.length > 0) {
            console.error('Storage.saveSessions blocked: would wipe', current.length, 'sessions');
            try { showToast(t('saveBlocked') || 'Save blocked — please reload'); } catch {}
            return false;
        }
        try {
            localStorage.setItem(this.KEY, JSON.stringify(sessions));
        } catch (e) {
            if (e.name === 'QuotaExceededError') {
                showToast(t('storageFull') || 'Storage full — delete old sessions');
            }
            return false;
        }
        // If a sizeable shrink slipped through, surface a soft warning so the
        // user can act (visit Sync → Recover earlier history).
        const drop = currAlive - newAlive;
        if (currAlive > 0 && drop > 5 && drop / currAlive > 0.20) {
            try { showToast(t('shrinkWarning') || 'Some sessions are missing — check Sync to recover', 6000); } catch {}
        }
        return true;
    },
    addSession(session) {
        session.updatedAt = Date.now();
        const sessions = this.getAllRaw();
        sessions.unshift(session);
        if (this.saveSessions(sessions)) {
            const n = parseInt(localStorage.getItem(BACKUP_NUDGE_KEY) || '0', 10) || 0;
            try { localStorage.setItem(BACKUP_NUDGE_KEY, String(n + 1)); } catch {}
        }
    },
    deleteSession(id) {
        const sessions = this.getAllRaw();
        const target = sessions.find(s => s.id === id);
        if (target) {
            target.deletedAt = Date.now();
            target.updatedAt = Date.now();
            this.saveSessions(sessions);
        }
    },
    // Undo a soft-delete. Used by the undo toast on the history page.
    restoreSession(id) {
        const sessions = this.getAllRaw();
        const target = sessions.find(s => s.id === id);
        if (target && target.deletedAt) {
            delete target.deletedAt;
            target.updatedAt = Date.now();
            this.saveSessions(sessions);
            return true;
        }
        return false;
    },

    // ---- Snapshots ----
    // One per local day, keyed by YYYY-MM-DD. Used by the "Recover earlier
    // history" UI and the auto-recovery banner. Snapshots are local-only
    // and never sync'd.
    todayKey() {
        const d = new Date();
        const pad = n => String(n).padStart(2, '0');
        return SNAPSHOT_PREFIX + `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    },
    listSnapshotKeys() {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(SNAPSHOT_PREFIX)) keys.push(k);
        }
        return keys.sort(); // ascending date
    },
    readSnapshot(key) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : null;
        } catch {
            return null;
        }
    },
    snapshotToday() {
        const key = this.todayKey();
        const all = this.getAllRaw();
        // Don't snapshot empty state — first install or freshly cleared. A
        // recovery banner driven by an empty snapshot would be confusing.
        if (!all.length) return;
        if (localStorage.getItem(key)) return; // already snapped today
        try {
            localStorage.setItem(key, JSON.stringify(all));
        } catch (e) {
            if (e.name === 'QuotaExceededError') {
                // Free space by dropping the oldest snapshot, then retry once.
                const keys = this.listSnapshotKeys();
                if (keys.length) {
                    localStorage.removeItem(keys[0]);
                    try { localStorage.setItem(key, JSON.stringify(all)); } catch {}
                }
            }
        }
        // Prune to the most recent N.
        const keys = this.listSnapshotKeys();
        while (keys.length > MAX_SNAPSHOTS) {
            localStorage.removeItem(keys.shift());
        }
    },
    snapshotMeta() {
        return this.listSnapshotKeys().map(k => {
            const arr = this.readSnapshot(k) || [];
            return { key: k, date: k.slice(SNAPSHOT_PREFIX.length), count: arr.filter(s => !s.deletedAt).length };
        });
    },
    // Additive merge from a snapshot: bring back any session present in the
    // snapshot that's missing locally OR tombstoned locally but alive in the
    // snapshot. Never overwrite a healthy current entry. Returns the count
    // of sessions added or un-deleted.
    restoreFromSnapshot(key) {
        const snap = this.readSnapshot(key);
        if (!snap) return 0;
        const current = this.getAllRaw();
        const byId = new Map(current.map(s => [s.id, s]));
        let restored = 0;
        const now = Date.now();
        for (const s of snap) {
            if (!s || typeof s.id !== 'string') continue;
            const have = byId.get(s.id);
            if (!have) {
                const copy = { ...s };
                delete copy.deletedAt;
                copy.updatedAt = now;
                current.push(copy);
                byId.set(s.id, copy);
                restored++;
            } else if (have.deletedAt && !s.deletedAt) {
                delete have.deletedAt;
                have.updatedAt = now;
                restored++;
            }
        }
        if (restored > 0) this.saveSessions(current);
        return restored;
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

// ---- Task Categories ----
const TASK_CATEGORIES = [
    { key: 'arbeiten',   icon: '\u{1F4BC}' },
    { key: 'lernen',     icon: '\u{1F4DA}' },
    { key: 'putzen',     icon: '\u{1F9F9}' },
    { key: 'entspannen', icon: '\u{1F9D8}' },
    { key: 'kochen',     icon: '\u{1F373}' },
    { key: 'sport',      icon: '\u{1F3C3}' },
    { key: 'kreativ',    icon: '\u{1F3A8}' },
    { key: 'einkaufen',  icon: '\u{1F6D2}' },
];

const TASK_COLORS = {
    arbeiten:   'var(--orange-primary)',
    lernen:     '#7E57C2',
    putzen:     '#26A69A',
    entspannen: '#42A5F5',
    kochen:     '#EF5350',
    sport:      '#66BB6A',
    kreativ:    '#AB47BC',
    einkaufen:  '#FFA726',
};

function getTaskLabel(key) {
    const capKey = 'task' + key.charAt(0).toUpperCase() + key.slice(1);
    return t(capKey) || key;
}

function getTaskIcon(key) {
    const cat = TASK_CATEGORIES.find(c => c.key === key);
    return cat ? cat.icon : '\u{1F4BC}';
}

// ---- App State ----
let currentPage = 'timer';
let timerInterval = null;
let selectedTask = 'arbeiten';

// Active session fields (persisted via ActiveState)
let activeSession = null; // { id, startTime, breaks:[], currentBreakStart, status: 'working'|'on-break', task }

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

    // Hide/show cat when navigating while she's still in the mascot slot
    if (window.hubiPet && window.hubiPet.inMascotSlot) {
        if (page === 'timer') {
            window.hubiPet.container.style.display = '';
            window.hubiPet.repositionInSlot();
        } else {
            window.hubiPet.container.style.display = 'none';
        }
    }

    // Always clear any active bubble when navigating — prevents stale messages
    // from lingering when Hubi briefly disappears or the page context changes.
    if (window.hubiPet && typeof window.hubiPet.hideSpeechBubble === 'function') {
        window.hubiPet.hideSpeechBubble();
    }

    if (page === 'timer' && typeof HubiMessages !== 'undefined') {
        setTimeout(() => HubiMessages.trigger('navigate'), 1200);
    }
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
    const slotItemsHTML = TASK_CATEGORIES.map(cat =>
        `<div class="slot-item" data-task="${cat.key}"><span class="slot-item-icon">${cat.icon}</span> ${getTaskLabel(cat.key)}</div>`
    ).join('');

    appEl.innerHTML = `
        <div class="page">
            <div class="page-header">
                <div class="mascot-container" id="mascot-slot"></div>
                <h1 class="page-title slot-title">
                    <span class="slot-prefix">${t('readyToPrefix')}</span>
                    <span class="slot-machine" id="slot-window">
                        <span class="slot-viewport">
                            <span class="slot-reel" id="slot-reel">
                                ${slotItemsHTML}
                            </span>
                        </span>
                    </span><span class="slot-suffix">${t('readyToSuffix')}</span>
                </h1>
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
    initSlotDial();
}

function initSlotDial() {
    const reel = document.getElementById('slot-reel');
    const slotWindow = document.getElementById('slot-window');
    if (!reel || !slotWindow) return;

    const items = reel.querySelectorAll('.slot-item');
    if (items.length === 0) return;

    const ITEM_H = 36; // matches CSS .slot-item height
    const selectedIndex = TASK_CATEGORIES.findIndex(c => c.key === selectedTask);
    let currentIndex = selectedIndex;

    function reelOffset(idx) {
        // Center the item in the 3-row viewport (offset by 1 row)
        return idx * ITEM_H;
    }

    // Initial spin: start from last item, animate to selected
    reel.style.transition = 'none';
    reel.style.transform = `translateY(-${reelOffset(items.length - 1)}px)`;

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            reel.style.transition = 'transform 1.2s cubic-bezier(0.23, 1, 0.32, 1)';
            reel.style.transform = `translateY(-${reelOffset(selectedIndex)}px)`;
        });
    });

    function snapToIndex(idx) {
        currentIndex = idx;
        selectedTask = TASK_CATEGORIES[idx].key;
        reel.style.transition = 'transform 0.4s cubic-bezier(0.23, 1, 0.32, 1)';
        reel.style.transform = `translateY(-${reelOffset(idx)}px)`;
        items.forEach((item, i) => item.classList.toggle('slot-item-active', i === idx));

        // Preview the matching animation on Hubi
        if (window.hubiPet) window.hubiPet.setTaskPreview(selectedTask);
    }

    // Mark initial active
    items.forEach((item, i) => item.classList.toggle('slot-item-active', i === selectedIndex));

    // After the initial spin lands, preview the selected task on Hubi
    setTimeout(() => {
        if (window.hubiPet) window.hubiPet.setTaskPreview(selectedTask);
    }, 1300);

    // Touch drag
    let startY = 0;
    let isDragging = false;
    let touchedRecently = false;

    slotWindow.addEventListener('touchstart', (e) => {
        startY = e.touches[0].clientY;
        isDragging = true;
        touchedRecently = true;
        reel.style.transition = 'none';
    }, { passive: true });

    slotWindow.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        const dy = e.touches[0].clientY - startY;
        const offset = reelOffset(currentIndex) - dy;
        reel.style.transform = `translateY(-${offset}px)`;
    }, { passive: true });

    slotWindow.addEventListener('touchend', (e) => {
        if (!isDragging) return;
        isDragging = false;
        const dy = e.changedTouches[0].clientY - startY;
        const shift = Math.round(-dy / ITEM_H);
        if (shift === 0) {
            // Tap (no drag) -- cycle forward with wrap, same as click
            snapToIndex((currentIndex + 1) % items.length);
        } else {
            // Swipe -- clamp to valid range
            snapToIndex(Math.max(0, Math.min(items.length - 1, currentIndex + shift)));
        }
        // Suppress the synthetic click that fires after touchend
        setTimeout(() => { touchedRecently = false; }, 300);
    });

    // Mouse wheel -- debounced so trackpad doesn't fire too fast
    let wheelLocked = false;
    slotWindow.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (wheelLocked) return;
        wheelLocked = true;
        setTimeout(() => { wheelLocked = false; }, 200);

        const direction = e.deltaY > 0 ? 1 : -1;
        const newIdx = Math.max(0, Math.min(items.length - 1, currentIndex + direction));
        snapToIndex(newIdx);
    }, { passive: false });

    // Click to cycle (mouse only -- touch is handled above)
    slotWindow.addEventListener('click', () => {
        if (touchedRecently) return;
        snapToIndex((currentIndex + 1) % items.length);
    });
}

function renderActivePage() {
    const isBreak = activeSession.status === 'on-break';
    const taskKey = activeSession.task || 'arbeiten';
    const taskIcon = getTaskIcon(taskKey);
    const statusEmoji = isBreak ? '💤' : taskIcon;
    const statusClass = isBreak ? 'on-break' : 'working';
    const statusText = isBreak ? t('takingBreak') : t('hubiBusy');
    const subtitleText = isBreak ? t('hubiNapping') : '';

    appEl.innerHTML = `
        <div class="page">
            <div class="page-header">
                <div class="mascot-container">
                    <span class="mascot-status">${statusEmoji}</span>
                </div>
                <h1 class="page-title">${statusText}</h1>
                ${subtitleText ? `<p class="page-subtitle">${subtitleText}</p>` : ''}
            </div>

            <div class="timer-display ${statusClass}">
                <div class="timer-label ${statusClass}">${isBreak ? t('breakTime') : getTaskLabel(taskKey)}</div>
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
        status: 'working',
        task: selectedTask || 'arbeiten'
    };
    ActiveState.set(activeSession);

    // Hubi jumps down from mascot slot and starts roaming
    if (window.hubiPet) window.hubiPet.startCycle();

    // Reset per-session message memory and greet via speech bubble
    // (no toast — Hubi speaks instead). force=true bypasses the global
    // throttle since this is a deliberate user action.
    if (typeof HubiMessages !== 'undefined') {
        HubiMessages.clearSessionShown();
        setTimeout(() => HubiMessages.trigger('start', { force: true }), 2500);
    }

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

    // Hubi speaks via bubble — toast removed to avoid double-feedback
    if (typeof HubiMessages !== 'undefined') {
        setTimeout(() => HubiMessages.trigger('resume', { force: true }), 1500);
    }

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
        totalBreak: totalBreakMs,
        task: activeSession.task || 'arbeiten'
    };

    Storage.addSession(session);
    ActiveState.clear();
    activeSession = null;
    clearInterval(timerInterval);

    // Fire the finish trigger BEFORE clearing per-session memory so
    // the daily-goal-reached message can use the just-completed session.
    if (typeof HubiMessages !== 'undefined') {
        HubiMessages.trigger('finish', { force: true });
        HubiMessages.clearSessionShown();
    }

    showSessionSummary(session);
}

function showSessionSummary(session) {
    const taskKey = session.task || 'arbeiten';
    appEl.innerHTML = `
        <div class="page">
            <div class="summary-card">
                <div class="summary-emoji">${getTaskIcon(taskKey)}</div>
                <div class="summary-title">${t('greatWork')}</div>
                <div class="summary-task">${getTaskLabel(taskKey)}</div>
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

    // Delete listeners — immediate delete with an undo window. The actual
    // delete is a soft tombstone; undo just clears it. Both transitions stamp
    // updatedAt so they propagate via cloud sync.
    document.querySelectorAll('.card-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.dataset.id;
            Storage.deleteSession(id);
            renderHistoryPage();
            showActionToast(t('sessionDeleted'), t('undo'), () => {
                Storage.restoreSession(id);
                renderHistoryPage();
            });
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
    const taskKey = session.task || 'arbeiten';
    return `
        <div class="card">
            <button class="card-delete" data-id="${escapeAttr(session.id)}" title="${t('delete')}">✕</button>
            <button class="card-edit" data-id="${escapeAttr(session.id)}" title="${t('edit')}">✏️</button>
            <div class="card-header">
                <div class="card-title"><span class="card-task-icon">${getTaskIcon(taskKey)}</span> ${formatDate(session.date)}</div>
                <div class="card-date">${getTaskLabel(taskKey)} · ${formatTime(session.startTime)} – ${formatTime(session.endTime)}</div>
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
    const currentTask = session.task || 'arbeiten';
    const taskOptionsHTML = TASK_CATEGORIES.map(cat =>
        `<option value="${cat.key}" ${cat.key === currentTask ? 'selected' : ''}>${cat.icon} ${getTaskLabel(cat.key)}</option>`
    ).join('');

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
                <div class="time-picker-group">
                    <label>${t('selectTask')}</label>
                    <select class="task-select" id="edit-task-${session.id}">
                        ${taskOptionsHTML}
                    </select>
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
    session.updatedAt = Date.now();

    // Update task if changed
    const taskSelect = document.getElementById(`edit-task-${id}`);
    if (taskSelect) session.task = taskSelect.value;

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

            ${sessions.length > 0 ? renderTaskBreakdown(sessions) : ''}

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

function renderTaskBreakdown(sessions) {
    // Group by task
    const taskTotals = {};
    for (const s of sessions) {
        const key = s.task || 'arbeiten';
        taskTotals[key] = (taskTotals[key] || 0) + s.totalWork;
    }

    const entries = Object.entries(taskTotals).sort((a, b) => b[1] - a[1]);
    const maxMs = entries[0]?.[1] || 1;
    const totalMs = entries.reduce((sum, [, ms]) => sum + ms, 0);

    const barsHTML = entries.map(([key, ms]) => {
        const pct = totalMs > 0 ? Math.round((ms / totalMs) * 100) : 0;
        const barWidth = Math.max((ms / maxMs) * 100, 4);
        const color = TASK_COLORS[key] || 'var(--orange-primary)';
        return `
            <div class="task-breakdown-row">
                <div class="task-breakdown-label">
                    <span class="task-breakdown-icon">${getTaskIcon(key)}</span>
                    <span class="task-breakdown-name">${getTaskLabel(key)}</span>
                </div>
                <div class="task-breakdown-bar-wrap">
                    <div class="task-breakdown-bar" style="width: ${barWidth}%; background: ${color};"></div>
                </div>
                <div class="task-breakdown-value">${formatHoursMinutes(ms)} <span class="task-breakdown-pct">${pct}%</span></div>
            </div>
        `;
    }).join('');

    return `
        <div class="chart-container">
            <div class="chart-title">${t('taskBreakdown')}</div>
            ${barsHTML}
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

// Toast variant with a single action button (e.g. Undo). Calls onAction if
// the user taps the button before the toast disappears.
function showActionToast(message, actionLabel, onAction, duration = 8000) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    clearTimeout(toastTimeout);

    const toast = document.createElement('div');
    toast.className = 'toast toast-action';
    const text = document.createElement('span');
    text.className = 'toast-message';
    text.textContent = message;
    const btn = document.createElement('button');
    btn.className = 'toast-action-btn';
    btn.type = 'button';
    btn.textContent = actionLabel;
    toast.appendChild(text);
    toast.appendChild(btn);
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('visible'));

    let acted = false;
    btn.addEventListener('click', () => {
        if (acted) return;
        acted = true;
        clearTimeout(toastTimeout);
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 300);
        try { onAction(); } catch (e) { console.warn('toast action failed', e); }
    });

    toastTimeout = setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 400);
    }, duration);
}

// Persistent banner pinned to the top of the app. Used for the auto-recovery
// prompt and the backup nudge. Up to one banner shown at a time per slot.
function showBanner({ slot, message, primaryLabel, onPrimary, secondaryLabel, onSecondary }) {
    document.querySelectorAll(`.app-banner[data-slot="${slot}"]`).forEach(b => b.remove());

    const banner = document.createElement('div');
    banner.className = 'app-banner';
    banner.dataset.slot = slot;
    const msg = document.createElement('div');
    msg.className = 'app-banner-msg';
    msg.textContent = message;
    const actions = document.createElement('div');
    actions.className = 'app-banner-actions';

    if (secondaryLabel) {
        const sBtn = document.createElement('button');
        sBtn.type = 'button';
        sBtn.className = 'btn btn-secondary app-banner-btn';
        sBtn.textContent = secondaryLabel;
        sBtn.addEventListener('click', () => {
            banner.remove();
            try { onSecondary && onSecondary(); } catch {}
        });
        actions.appendChild(sBtn);
    }
    const pBtn = document.createElement('button');
    pBtn.type = 'button';
    pBtn.className = 'btn btn-start app-banner-btn';
    pBtn.textContent = primaryLabel;
    pBtn.addEventListener('click', () => {
        banner.remove();
        try { onPrimary && onPrimary(); } catch {}
    });
    actions.appendChild(pBtn);

    banner.appendChild(msg);
    banner.appendChild(actions);
    document.body.appendChild(banner);
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
const CHANGELOG_VERSION = 4;
const CHANGELOG_ENTRIES = [
    { emoji: '☁️', titleKey: 'whatsNewCloudSyncTitle', descKey: 'whatsNewCloudSyncDesc' },
    { emoji: '✏️', titleKey: 'whatsNewEditEntryTitle', descKey: 'whatsNewEditEntryDesc' },
    { emoji: '🛟', titleKey: 'whatsNewSafetyNetTitle', descKey: 'whatsNewSafetyNetDesc' },
    { emoji: '💬', titleKey: 'whatsNewBubblesTitle', descKey: 'whatsNewBubblesDesc' },
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
checkRecoveryBanner();
Storage.snapshotToday();

// ---- Hubi message triggers ----
// Page-load greeting on the timer page (slight delay so the pet is mounted)
setTimeout(() => {
    if (typeof HubiMessages === 'undefined') return;
    if (currentPage === 'timer') HubiMessages.trigger('navigate');
}, 2200);

// Returning to the tab after a gap → "welcome back" + maybe a milestone
let lastHiddenAt = 0;
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        lastHiddenAt = Date.now();
        if (window.hubiPet && typeof window.hubiPet.hideSpeechBubble === 'function') {
            window.hubiPet.hideSpeechBubble();
        }
        return;
    }
    if (typeof HubiMessages === 'undefined') return;
    const awayMs = lastHiddenAt ? Date.now() - lastHiddenAt : 0;
    // Only greet on real returns (away > 2 min) so quick tab switches don't trigger
    if (awayMs > 2 * 60000) {
        setTimeout(() => HubiMessages.trigger('visibility'), 800);
    }
});

// Periodic milestone tick — checks every 2 min so session-length thresholds
// (1h/2h/3h) are caught soon after they cross.
setInterval(() => {
    if (typeof HubiMessages === 'undefined') return;
    if (document.hidden) return;
    if (currentPage !== 'timer') return;
    if (!ActiveState.get()) return;
    HubiMessages.trigger('tick');
}, 2 * 60000);

// Auto-recovery: if local sessions look like they shrank dramatically since
// yesterday's (or a recent) snapshot, prompt the user to restore. Snapshots
// are only available from this update onwards — existing users have no prior
// snapshots, so the banner cannot fire on the first launch after the update.
const RECOVERY_DISMISS_KEY = 'hubi_recovery_dismissed_for';
function checkRecoveryBanner() {
    const meta = Storage.snapshotMeta();
    if (meta.length === 0) return;
    const currentAlive = Storage.getSessions().length;
    // Find the most recent snapshot whose count is materially higher.
    // Iterate newest → oldest.
    for (let i = meta.length - 1; i >= 0; i--) {
        const snap = meta[i];
        const drop = snap.count - currentAlive;
        if (drop > 10 && snap.count > 0 && drop / snap.count > 0.20) {
            // Don't re-prompt for the same snapshot once dismissed.
            const dismissed = localStorage.getItem(RECOVERY_DISMISS_KEY);
            if (dismissed === snap.key) return;
            const friendly = friendlySnapshotDate(snap.date);
            showBanner({
                slot: 'recovery',
                message: t('recoveryBanner')(snap.count, friendly),
                primaryLabel: t('recoveryRestore'),
                onPrimary: () => {
                    const restored = Storage.restoreFromSnapshot(snap.key);
                    showToast(t('recoveryRestored')(restored));
                    renderPage();
                },
                secondaryLabel: t('recoveryKeep'),
                onSecondary: () => {
                    localStorage.setItem(RECOVERY_DISMISS_KEY, snap.key);
                }
            });
            return;
        }
    }
}

function friendlySnapshotDate(dateStr) {
    // dateStr is YYYY-MM-DD. Return a relative phrase.
    const [y, m, d] = dateStr.split('-').map(n => parseInt(n, 10));
    const snap = new Date(y, m - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Math.round((today - snap) / 86400000);
    if (days <= 0) return t('today');
    if (days === 1) return t('yesterday');
    if (days < 7) return t('daysAgo')(days);
    return dateStr;
}
