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
    return d.toLocaleDateString('en-US', options);
}

function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
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
    return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short' });
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
                <div class="mascot-container">
                    ${window.getHubiCatHTML('idle')}
                    <span class="mascot-status">😴</span>
                </div>
                <h1 class="page-title">Ready to work?</h1>
                <p class="page-subtitle">Hubi is waiting for you!</p>
            </div>

            <div class="timer-display">
                <div class="timer-label">Elapsed Time</div>
                <div class="timer-time" id="timer-display">00:00:00</div>
                <div class="timer-date">${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
            </div>

            <div class="actions">
                <button class="btn btn-start" id="btn-start">
                    <span class="btn-icon">🐾</span>
                    Start Working
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
    const statusText = isBreak ? 'Taking a break...' : 'Working hard!';
    const subtitleText = isBreak ? 'Hubi is napping 😴' : 'Hubi is busy! 🐱';

    appEl.innerHTML = `
        <div class="page">
            <div class="page-header">
                <div class="mascot-container">
                    ${window.getHubiCatHTML(mascotClass)}
                    <span class="mascot-status">${statusEmoji}</span>
                </div>
                <h1 class="page-title">${statusText}</h1>
                <p class="page-subtitle">${subtitleText}</p>
            </div>

            <div class="timer-display ${statusClass}">
                <div class="timer-label ${statusClass}">${isBreak ? 'Break Time' : 'Work Time'}</div>
                <div class="timer-time" id="timer-display">00:00:00</div>
                <div class="timer-date">Started at ${formatTime(activeSession.startTime)}</div>
                <div class="timer-breakdown">
                    <div class="breakdown-item">
                        <div class="breakdown-label">Total Work</div>
                        <div class="breakdown-value" id="total-work">--:--</div>
                    </div>
                    <div class="breakdown-item">
                        <div class="breakdown-label">Total Break</div>
                        <div class="breakdown-value" id="total-break">--:--</div>
                    </div>
                </div>
            </div>

            <div class="actions">
                ${isBreak ? `
                    <button class="btn btn-resume" id="btn-resume">
                        <span class="btn-icon">🐾</span>
                        Resume Working
                    </button>
                ` : `
                    <button class="btn btn-break" id="btn-break">
                        <span class="btn-icon">☕</span>
                        Take a Break
                    </button>
                `}
                <button class="btn btn-finish" id="btn-finish">
                    <span class="btn-icon">🏁</span>
                    Finish Work
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
    showToast('🐾 Let\'s get to work!');
    renderActivePage();
}

function startBreak() {
    if (!activeSession) return;
    activeSession.status = 'on-break';
    activeSession.currentBreakStart = Date.now();
    ActiveState.set(activeSession);
    showToast('☕ Break time! Hubi is napping...');
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
    showToast('🐾 Back to work!');
    renderActivePage();
}

function confirmFinish() {
    showDialog(
        '🏁',
        'Finish work?',
        'Hubi will save this session to your history.',
        'Finish',
        'Cancel',
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
                <div class="summary-title">Great work today!</div>
                <div class="summary-stats">
                    <div class="summary-stat">
                        <div class="summary-stat-label">Work</div>
                        <div class="summary-stat-value">${formatHoursMinutes(session.totalWork)}</div>
                    </div>
                    <div class="summary-stat">
                        <div class="summary-stat-label">Breaks</div>
                        <div class="summary-stat-value">${formatHoursMinutes(session.totalBreak)}</div>
                    </div>
                    <div class="summary-stat">
                        <div class="summary-stat-label">Total</div>
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
                    ${window.getHubiCatHTML('idle sm', 'history-mascot')}
                </div>
                <h1 class="page-title">History</h1>
                <p class="page-subtitle">Your tracked sessions</p>
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
                'Delete session?',
                'This can\'t be undone. Hubi will forget this session forever!',
                'Delete',
                'Keep it',
                () => {
                    Storage.deleteSession(id);
                    showToast('🗑️ Session deleted');
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
            <div class="empty-state-text">No sessions yet!</div>
            <div class="empty-state-sub">Start tracking to see your history here</div>
        </div>
    `;
}

function renderSessionCard(session) {
    return `
        <div class="card">
            <button class="card-delete" data-id="${session.id}" title="Delete">✕</button>
            <div class="card-header">
                <div class="card-title">${formatDate(session.date)}</div>
                <div class="card-date">${formatTime(session.startTime)} – ${formatTime(session.endTime)}</div>
            </div>
            <div class="card-body">
                <div class="card-stat">
                    <div class="card-stat-label">Work</div>
                    <div class="card-stat-value work">${formatHoursMinutes(session.totalWork)}</div>
                </div>
                <div class="card-stat">
                    <div class="card-stat-label">Breaks</div>
                    <div class="card-stat-value break-val">${formatHoursMinutes(session.totalBreak)}</div>
                </div>
                <div class="card-stat">
                    <div class="card-stat-label">Total</div>
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
                    ${window.getHubiCatHTML('idle sm', 'stats-mascot')}
                </div>
                <h1 class="page-title">Statistics</h1>
                <p class="page-subtitle">How's your productivity?</p>
            </div>

            <div class="period-toggle">
                <button class="period-btn ${statsPeriod === 'week' ? 'active' : ''}" data-period="week">Week</button>
                <button class="period-btn ${statsPeriod === 'month' ? 'active' : ''}" data-period="month">Month</button>
                <button class="period-btn ${statsPeriod === 'all' ? 'active' : ''}" data-period="all">All Time</button>
            </div>

            <div class="hubi-insight">
                <div class="hubi-insight-img-wrapper" style="width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; transform: scale(0.6); margin-left: -10px;">
                    ${window.getHubiCatHTML('idle', 'insight-mascot')}
                </div>
                <div class="hubi-insight-text">${insight}</div>
            </div>

            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-card-icon">⏱️</div>
                    <div class="stat-card-value">${formatHoursMinutes(totalWorkMs)}</div>
                    <div class="stat-card-label">Total Work</div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-icon">☕</div>
                    <div class="stat-card-value">${formatHoursMinutes(totalBreakMs)}</div>
                    <div class="stat-card-label">Total Breaks</div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-icon">📅</div>
                    <div class="stat-card-value">${daysWorked}</div>
                    <div class="stat-card-label">Days Worked</div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-icon">📊</div>
                    <div class="stat-card-value">${formatHoursMinutes(avgWorkMs)}</div>
                    <div class="stat-card-label">Avg / Day</div>
                </div>
            </div>

            ${statsPeriod === 'week' ? renderWeekChart(sessions) : ''}

            ${sessions.length === 0 ? `
                <div class="empty-state">
                    <div class="empty-state-emoji">📊</div>
                    <div class="empty-state-text">No data for this period</div>
                    <div class="empty-state-sub">Start tracking to see your stats!</div>
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
                <div class="chart-bar break-bar" style="height: ${breakH}px;" title="Break: ${formatHoursMinutes(dailyBreak[date])}"></div>
                <div class="chart-bar work-bar" style="height: ${workH}px;" title="Work: ${formatHoursMinutes(dailyWork[date])}"></div>
                <span class="chart-bar-label" style="${isToday ? 'color: var(--orange-primary); font-weight: 900;' : ''}">${getDayLabel(date)}</span>
            </div>
        `;
    }).join('');

    return `
        <div class="chart-container">
            <div class="chart-title">This Week 🐾</div>
            <div class="chart-bars">
                ${barsHTML}
            </div>
        </div>
    `;
}

function getHubiInsight(totalWorkMs, daysWorked, period) {
    const totalHours = totalWorkMs / 3600000;

    if (daysWorked === 0) {
        const messages = [
            "Hubi is waiting for you to start tracking! 🐱",
            "No sessions yet — let's get started! 😺",
            "Hubi is bored... time to track some work! 🐾"
        ];
        return messages[Math.floor(Math.random() * messages.length)];
    }

    if (period === 'week') {
        if (totalHours >= 40) return `Wow! ${totalHours.toFixed(0)}h this week! Hubi is impressed! 😻 Don't forget to rest!`;
        if (totalHours >= 30) return `${totalHours.toFixed(0)}h this week — you're on fire! 🔥 Hubi approves!`;
        if (totalHours >= 20) return `${totalHours.toFixed(0)}h this week. Nice pace! Hubi is purring with pride! 😺`;
        return `${totalHours.toFixed(0)}h this week. Keep it up! Hubi believes in you! 💪🐱`;
    }

    if (period === 'month') {
        if (totalHours >= 160) return `${totalHours.toFixed(0)}h this month! That's a full-time cat! 😹`;
        if (totalHours >= 80) return `${totalHours.toFixed(0)}h this month — productive kitty! 🐱✨`;
        return `${totalHours.toFixed(0)}h this month. Hubi is tracking with you! 📋🐾`;
    }

    return `${totalHours.toFixed(0)} total hours tracked across ${daysWorked} days! Hubi is proud! 🏆🐱`;
}

// ---- Toast ----
let toastTimeout = null;
function showToast(message) {
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
    }, 2500);
}

// ---- Dialog ----
function showDialog(emoji, title, text, confirmLabel, cancelLabel, onConfirm) {
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
