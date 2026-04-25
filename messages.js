/* ============================================
   HUBI MESSAGES — motivational speech bubbles
   ============================================
   Picks a contextual message for Hubi to "say" via a speech bubble.
   Messages are filtered by trigger + context, then picked by priority
   with cooldowns to avoid repetition.

   Loaded after i18n.js, before pet.js. Depends on Storage and ActiveState
   from app.js (which loads after this file — accessed lazily at call time).
*/

const HubiMessages = (() => {
    const HISTORY_KEY = 'hubi_msg_history';
    const LAST_SHOWN_KEY = 'hubi_msg_last_shown';
    const SESSION_SHOWN_KEY = 'hubi_msg_session_shown';
    const GLOBAL_COOLDOWN_MS = 8 * 60 * 1000;

    function loadHistory() {
        try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || {}; }
        catch { return {}; }
    }

    function saveShown(id) {
        const hist = loadHistory();
        hist[id] = Date.now();
        try {
            localStorage.setItem(HISTORY_KEY, JSON.stringify(hist));
            localStorage.setItem(LAST_SHOWN_KEY, String(Date.now()));
        } catch {}

        // Per-session memory (cleared by app.js on startWork/finishWork)
        try {
            const sess = JSON.parse(localStorage.getItem(SESSION_SHOWN_KEY)) || [];
            if (!sess.includes(id)) {
                sess.push(id);
                localStorage.setItem(SESSION_SHOWN_KEY, JSON.stringify(sess));
            }
        } catch {}
    }

    function clearSessionShown() {
        try { localStorage.removeItem(SESSION_SHOWN_KEY); } catch {}
    }

    function shownThisSession(id) {
        try {
            const sess = JSON.parse(localStorage.getItem(SESSION_SHOWN_KEY)) || [];
            return sess.includes(id);
        } catch { return false; }
    }

    function lastShownAt(id) {
        return loadHistory()[id] || 0;
    }

    function withinGlobalCooldown() {
        const last = Number(localStorage.getItem(LAST_SHOWN_KEY)) || 0;
        return (Date.now() - last) < GLOBAL_COOLDOWN_MS;
    }

    // ---- Workday target from history ----
    // Mean of completed days in the last 30 days, ignoring days under 30min
    // (avoids dragging the average down with tiny test sessions). Defaults to 8h.
    function estimateDailyTargetMs() {
        if (typeof Storage === 'undefined') return 8 * 3600000;
        const sessions = Storage.getSessions();
        const now = Date.now();
        const cutoff = now - 30 * 86400000;
        const today = new Date().toISOString().split('T')[0];

        const perDay = {};
        for (const s of sessions) {
            if (!s.date || s.date === today) continue; // exclude today
            if (s.startTime && s.startTime < cutoff) continue;
            perDay[s.date] = (perDay[s.date] || 0) + (s.totalWork || 0);
        }

        const totals = Object.values(perDay).filter(ms => ms >= 30 * 60000);
        if (totals.length === 0) return 8 * 3600000;

        const sum = totals.reduce((a, b) => a + b, 0);
        return Math.round(sum / totals.length);
    }

    // ---- Today's total work (completed + active) ----
    function getTodayWorkMs() {
        if (typeof Storage === 'undefined') return 0;
        const today = new Date().toISOString().split('T')[0];
        let total = 0;
        for (const s of Storage.getSessions()) {
            if (s.date === today) total += (s.totalWork || 0);
        }
        if (typeof ActiveState !== 'undefined') {
            const active = ActiveState.get();
            if (active && active.startTime) {
                const elapsed = Date.now() - active.startTime;
                let breakMs = 0;
                if (active.breaks) {
                    for (const b of active.breaks) breakMs += (b.end || Date.now()) - b.start;
                }
                if (active.currentBreakStart) breakMs += Date.now() - active.currentBreakStart;
                total += Math.max(0, elapsed - breakMs);
            }
        }
        return total;
    }

    function getActiveSessionMs() {
        if (typeof ActiveState === 'undefined') return 0;
        const active = ActiveState.get();
        if (!active || !active.startTime) return 0;
        const elapsed = Date.now() - active.startTime;
        let breakMs = 0;
        if (active.breaks) {
            for (const b of active.breaks) breakMs += (b.end || Date.now()) - b.start;
        }
        if (active.currentBreakStart) breakMs += Date.now() - active.currentBreakStart;
        return Math.max(0, elapsed - breakMs);
    }

    function buildContext(trigger) {
        const now = new Date();
        const targetMs = estimateDailyTargetMs();
        const dayMs = getTodayWorkMs();
        const sessionMs = getActiveSessionMs();
        const active = (typeof ActiveState !== 'undefined') ? ActiveState.get() : null;
        return {
            trigger,
            hour: now.getHours(),
            dayOfWeek: now.getDay(), // 0 = Sunday
            isWeekend: now.getDay() === 0 || now.getDay() === 6,
            isActive: !!active,
            isOnBreak: !!(active && active.status === 'on-break'),
            task: active ? active.task : null,
            dayWorkMs: dayMs,
            targetWorkMs: targetMs,
            remainingMs: targetMs - dayMs,
            progressPct: targetMs > 0 ? dayMs / targetMs : 0,
            sessionMs,
        };
    }

    // ---- Helpers for message text formatting ----
    function fmtHours(ms) {
        const h = ms / 3600000;
        if (h >= 1) {
            const rounded = Math.round(h * 10) / 10;
            return `${rounded}h`;
        }
        const m = Math.round(ms / 60000);
        return `${m}m`;
    }

    function pickFromKey(key) {
        const val = t(key);
        if (Array.isArray(val)) return val[Math.floor(Math.random() * val.length)];
        return val;
    }

    // Per-task message keys (matches TASK_CATEGORIES in app.js)
    const TASK_MSG_KEYS = {
        arbeiten: 'msgTaskArbeiten',
        lernen: 'msgTaskLernen',
        putzen: 'msgTaskPutzen',
        entspannen: 'msgTaskEntspannen',
        kochen: 'msgTaskKochen',
        sport: 'msgTaskSport',
        kreativ: 'msgTaskKreativ',
        einkaufen: 'msgTaskEinkaufen',
    };

    // ---- Message catalog ----
    // Each message: { id, when(ctx), text(ctx), cooldown, priority }
    // cooldown: 'session' | 'day' | 'hours:N' | 'none'
    // priority: higher wins; tie-break random
    const MESSAGES = [
        // --- Day of week ---
        { id: 'monday_morning', priority: 7, cooldown: 'day',
            when: c => c.dayOfWeek === 1 && c.hour < 12,
            text: () => t('msgMondayMorning') },
        { id: 'wednesday_hump', priority: 6, cooldown: 'day',
            when: c => c.dayOfWeek === 3,
            text: () => t('msgWednesdayHump') },
        { id: 'thursday_almost', priority: 6, cooldown: 'day',
            when: c => c.dayOfWeek === 4 && c.hour >= 14,
            text: () => t('msgThursdayAlmost') },
        { id: 'friday_morning', priority: 7, cooldown: 'day',
            when: c => c.dayOfWeek === 5 && c.hour < 12,
            text: () => t('msgFridayMorning') },
        { id: 'friday_afternoon', priority: 8, cooldown: 'day',
            when: c => c.dayOfWeek === 5 && c.hour >= 14,
            text: () => t('msgFridayAfternoon') },
        { id: 'weekend_chill', priority: 6, cooldown: 'day',
            when: c => c.isWeekend,
            text: () => t('msgWeekendChill') },

        // --- Time of day ---
        { id: 'early_bird', priority: 5, cooldown: 'day',
            when: c => c.hour >= 5 && c.hour < 8,
            text: () => t('msgEarlyBird') },
        { id: 'good_morning', priority: 4, cooldown: 'day',
            when: c => c.hour >= 8 && c.hour < 11,
            text: () => t('msgGoodMorning') },
        { id: 'lunch_time', priority: 5, cooldown: 'day',
            when: c => c.hour >= 12 && c.hour < 14 && c.isActive,
            text: () => t('msgLunchTime') },
        { id: 'evening_wind_down', priority: 5, cooldown: 'day',
            when: c => c.hour >= 19 && c.hour < 22 && c.isActive,
            text: () => t('msgEveningWindDown') },
        { id: 'late_night', priority: 9, cooldown: 'hours:6',
            when: c => (c.hour >= 22 || c.hour < 4) && c.isActive,
            text: () => t('msgLateNight') },

        // --- Daily progress (require active session + reasonable target) ---
        { id: 'daily_25', priority: 6, cooldown: 'day',
            when: c => c.isActive && c.progressPct >= 0.25 && c.progressPct < 0.5,
            text: () => t('msgDaily25') },
        { id: 'daily_50', priority: 7, cooldown: 'day',
            when: c => c.isActive && c.progressPct >= 0.5 && c.progressPct < 0.75,
            text: () => t('msgDaily50') },
        { id: 'daily_75', priority: 8, cooldown: 'day',
            when: c => c.isActive && c.progressPct >= 0.75 && c.progressPct < 0.95,
            text: c => t('msgDaily75')(fmtHours(Math.max(0, c.remainingMs))) },
        { id: 'daily_90', priority: 9, cooldown: 'day',
            when: c => c.isActive && c.progressPct >= 0.95 && c.progressPct < 1.0,
            text: () => t('msgDaily90') },
        { id: 'daily_done', priority: 10, cooldown: 'day',
            when: c => c.isActive && c.progressPct >= 1.0 && c.progressPct < 1.2,
            text: () => t('msgDailyDone') },
        { id: 'daily_overtime', priority: 9, cooldown: 'hours:3',
            when: c => c.isActive && c.progressPct >= 1.2,
            text: () => t('msgDailyOvertime') },

        // --- Session length (current sitting) ---
        { id: 'session_1h', priority: 6, cooldown: 'session',
            when: c => c.isActive && !c.isOnBreak && c.sessionMs >= 3600000 && c.sessionMs < 5400000,
            text: () => t('msgSession1h') },
        { id: 'session_2h_stretch', priority: 8, cooldown: 'session',
            when: c => c.isActive && !c.isOnBreak && c.sessionMs >= 2 * 3600000 && c.sessionMs < 3 * 3600000,
            text: () => t('msgSession2h') },
        { id: 'session_3h_break', priority: 9, cooldown: 'session',
            when: c => c.isActive && !c.isOnBreak && c.sessionMs >= 3 * 3600000,
            text: () => t('msgSession3h') },

        // --- Triggers (start / resume / welcome back / finish) ---
        { id: 'session_start_cheer', priority: 4, cooldown: 'hours:4',
            when: c => c.trigger === 'start',
            text: () => pickFromKey('msgStartCheers') },
        { id: 'session_start_task', priority: 5, cooldown: 'session',
            when: c => c.trigger === 'start' && !!TASK_MSG_KEYS[c.task],
            text: c => pickFromKey(TASK_MSG_KEYS[c.task]) },
        { id: 'resume_after_break', priority: 6, cooldown: 'hours:1',
            when: c => c.trigger === 'resume',
            text: () => pickFromKey('msgResumeCheers') },
        { id: 'welcome_back', priority: 5, cooldown: 'hours:2',
            when: c => c.trigger === 'visibility',
            text: () => t('msgWelcomeBack') },
        { id: 'finish_goal_hit', priority: 11, cooldown: 'day',
            // Fired post-finishWork; uses the just-completed session via dayWorkMs
            when: c => c.trigger === 'finish' && c.progressPct >= 1.0,
            text: () => t('msgFinishGoal') },

        // --- Cute filler / generic encouragement ---
        { id: 'purrfect', priority: 2, cooldown: 'hours:6',
            when: c => c.isActive, text: () => t('msgPurrfect') },
        { id: 'rooting', priority: 2, cooldown: 'hours:6',
            when: c => c.isActive, text: () => t('msgRooting') },
        { id: 'you_got_this', priority: 2, cooldown: 'hours:6',
            when: c => c.isActive, text: () => t('msgYouGotThis') },
        { id: 'idle_nudge', priority: 3, cooldown: 'hours:4',
            when: c => !c.isActive && c.trigger === 'navigate',
            text: () => t('msgIdleNudge') },
    ];

    function isInCooldown(msg) {
        if (msg.cooldown === 'session') return shownThisSession(msg.id);
        if (msg.cooldown === 'none') return false;
        const last = lastShownAt(msg.id);
        if (!last) return false;
        const since = Date.now() - last;
        if (msg.cooldown === 'day') return since < 24 * 3600000;
        if (msg.cooldown && msg.cooldown.startsWith('hours:')) {
            const h = Number(msg.cooldown.split(':')[1]) || 1;
            return since < h * 3600000;
        }
        return since < 24 * 3600000;
    }

    // Pick a message for the given trigger. Returns { id, text } or null.
    // `force` skips the global throttle (used by dev menu).
    function pick(trigger, force = false) {
        if (!force && withinGlobalCooldown()) return null;
        const ctx = buildContext(trigger);

        const eligible = MESSAGES.filter(m => {
            try { return m.when(ctx) && !isInCooldown(m); }
            catch { return false; }
        });
        if (eligible.length === 0) return null;

        // Pick the highest priority; among ties, random
        const maxP = Math.max(...eligible.map(m => m.priority));
        const top = eligible.filter(m => m.priority === maxP);
        const choice = top[Math.floor(Math.random() * top.length)];

        let text;
        try { text = choice.text(ctx); } catch { return null; }
        if (!text) return null;
        return { id: choice.id, text };
    }

    // Convenience: pick + show on the pet, if available.
    function trigger(triggerName, opts = {}) {
        if (!window.hubiPet || typeof window.hubiPet.showSpeechBubble !== 'function') return null;
        const picked = pick(triggerName, opts.force);
        if (!picked) return null;
        window.hubiPet.showSpeechBubble(picked.text);
        saveShown(picked.id);
        return picked;
    }

    return { pick, trigger, clearSessionShown, estimateDailyTargetMs, _buildContext: buildContext };
})();
