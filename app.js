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
    getSessions() {
        try {
            return JSON.parse(localStorage.getItem(this.KEY)) || [];
        } catch {
            return [];
        }
    },
    saveSessions(sessions) {
        localStorage.setItem(this.KEY, JSON.stringify(sessions));
    },
    addSession(session) {
        const sessions = this.getSessions();
        sessions.unshift(session);
        this.saveSessions(sessions);
    },
    deleteSession(id) {
        const sessions = this.getSessions().filter(s => s.id !== id);
        this.saveSessions(sessions);
    }
};

// ---- Active Session State ----
const STATE_KEY = 'hubi_active_state';
const ActiveState = {
    get() {
        try {
            return JSON.parse(localStorage.getItem(STATE_KEY));
        } catch {
            return null;
        }
    },
    set(state) {
        localStorage.setItem(STATE_KEY, JSON.stringify(state));
    },
    clear() {
        localStorage.removeItem(STATE_KEY);
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

function navigateTo(page) {
    currentPage = page;
    navBtns.forEach(b => b.classList.toggle('active', b.dataset.page === page));
    renderPage();
}

function renderPage() {
    clearInterval(timerInterval);
    timerInterval = null;

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
let historyFilterFrom = '';
let historyFilterTo = '';

function renderHistoryPage() {
    let sessions = Storage.getSessions();

    // Apply filters
    if (historyFilterFrom) {
        sessions = sessions.filter(s => s.date >= historyFilterFrom);
    }
    if (historyFilterTo) {
        sessions = sessions.filter(s => s.date <= historyFilterTo);
    }

    const hasFilters = historyFilterFrom || historyFilterTo;

    appEl.innerHTML = `
        <div class="page">
            <div class="page-header">
                <div class="mascot-container">
                </div>
                <h1 class="page-title">${t('history')}</h1>
                <p class="page-subtitle">${t('yourSessions')}</p>
            </div>

            <div class="filter-bar">
                <input type="date" id="filter-from" value="${historyFilterFrom}" placeholder="From">
                <input type="date" id="filter-to" value="${historyFilterTo}" placeholder="To">
                ${hasFilters ? '<button class="filter-clear" id="filter-clear">✕</button>' : ''}
            </div>

            <div id="history-list">
                ${sessions.length === 0 ? renderEmptyHistory() : sessions.map(renderSessionCard).join('')}
            </div>
        </div>
    `;

    // Filter listeners
    document.getElementById('filter-from').addEventListener('change', (e) => {
        historyFilterFrom = e.target.value;
        renderHistoryPage();
    });
    document.getElementById('filter-to').addEventListener('change', (e) => {
        historyFilterTo = e.target.value;
        renderHistoryPage();
    });
    const clearBtn = document.getElementById('filter-clear');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            historyFilterFrom = '';
            historyFilterTo = '';
            renderHistoryPage();
        });
    }

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
                <div class="hubi-insight-img-wrapper" style="width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; margin-left: -10px;">
                </div>
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
            <div class="dialog-emoji">${emoji}</div>
            <div class="dialog-title">${title}</div>
            <div class="dialog-text">${text}</div>
            <div class="dialog-actions">
                <button class="btn btn-secondary" id="dialog-cancel">${cancelLabel}</button>
                <button class="btn btn-finish" id="dialog-confirm">${confirmLabel}</button>
            </div>
        </div>
    `;
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

// ---- Initialize ----
renderPage();
