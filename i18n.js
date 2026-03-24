/* ============================================
   HUBI TIME TRACKER — Internationalization
   ============================================ */

const I18n = (() => {
    const translations = {
        en: {
            // Nav
            navTimer: 'Timer',
            navHistory: 'History',
            navStats: 'Stats',

            // Timer - idle
            readyToWork: 'Ready to work?',
            hubiWaiting: 'Hubi is waiting for you!',
            elapsedTime: 'Elapsed Time',
            startWorking: 'Start Working',

            // Timer - active
            workingHard: 'Working hard!',
            takingBreak: 'Taking a break...',
            hubiBusy: 'Hubi is busy! 🐱',
            hubiNapping: 'Hubi is napping 😴',
            workTime: 'Work Time',
            breakTime: 'Break Time',
            startedAt: 'Started at',
            totalWork: 'Total Work',
            totalBreak: 'Total Break',
            resumeWorking: 'Resume Working',
            takeBreak: 'Take a Break',
            finishWork: 'Finish Work',

            // Timer - finish dialog
            finishQuestion: 'Finish work?',
            finishDescription: 'Hubi will save this session to your history.',
            finish: 'Finish',
            cancel: 'Cancel',

            // Session summary
            greatWork: 'Great work today!',
            work: 'Work',
            breaks: 'Breaks',
            total: 'Total',
            pawsome: 'Pawsome!',

            // History
            history: 'History',
            yourSessions: 'Your tracked sessions',
            noSessionsYet: 'No sessions yet!',
            startTrackingHistory: 'Start tracking to see your history here',
            deleteSession: 'Delete session?',
            deleteDescription: "This can't be undone. Hubi will forget this session forever!",
            delete: 'Delete',
            keepIt: 'Keep it',
            sessionDeleted: '🗑️ Session deleted',

            // Stats
            statistics: 'Statistics',
            howProductivity: "How's your productivity?",
            week: 'Week',
            month: 'Month',
            allTime: 'All Time',
            totalBreaks: 'Total Breaks',
            daysWorked: 'Days Worked',
            avgPerDay: 'Avg / Day',
            thisWeek: 'This Week 🐾',
            noDataPeriod: 'No data for this period',
            startTrackingStats: 'Start tracking to see your stats!',

            // Insights
            insightWaiting: 'Hubi is waiting for you to start tracking! 🐱',
            insightNoSessions: "No sessions yet — let's get started! 😺",
            insightBored: 'Hubi is bored... time to track some work! 🐾',
            insightWeek40: (h) => `Wow! ${h}h this week! Hubi is impressed! 😻 Don't forget to rest!`,
            insightWeek30: (h) => `${h}h this week — you're on fire! 🔥 Hubi approves!`,
            insightWeek20: (h) => `${h}h this week. Nice pace! Hubi is purring with pride! 😺`,
            insightWeekLow: (h) => `${h}h this week. Keep it up! Hubi believes in you! 💪🐱`,
            insightMonth160: (h) => `${h}h this month! That's a full-time cat! 😹`,
            insightMonth80: (h) => `${h}h this month — productive kitty! 🐱✨`,
            insightMonthLow: (h) => `${h}h this month. Hubi is tracking with you! 📋🐾`,
            insightAll: (h, d) => `${h} total hours tracked across ${d} days! Hubi is proud! 🏆🐱`,

            // Toasts
            toastStartWork: "🐾 Let's get to work!",
            toastBreak: '☕ Break time! Hubi is napping...',
            toastResume: '🐾 Back to work!',
        },

        de: {
            // Nav
            navTimer: 'Timer',
            navHistory: 'Verlauf',
            navStats: 'Statistik',

            // Timer - idle
            readyToWork: 'Bereit zu arbeiten?',
            hubiWaiting: 'Hubi wartet auf dich!',
            elapsedTime: 'Vergangene Zeit',
            startWorking: 'Arbeit starten',

            // Timer - active
            workingHard: 'Fleißig am Arbeiten!',
            takingBreak: 'Pause machen...',
            hubiBusy: 'Hubi ist beschäftigt! 🐱',
            hubiNapping: 'Hubi macht ein Nickerchen 😴',
            workTime: 'Arbeitszeit',
            breakTime: 'Pausenzeit',
            startedAt: 'Gestartet um',
            totalWork: 'Gesamte Arbeit',
            totalBreak: 'Gesamte Pause',
            resumeWorking: 'Weiterarbeiten',
            takeBreak: 'Pause machen',
            finishWork: 'Arbeit beenden',

            // Timer - finish dialog
            finishQuestion: 'Arbeit beenden?',
            finishDescription: 'Hubi speichert diese Sitzung in deinem Verlauf.',
            finish: 'Beenden',
            cancel: 'Abbrechen',

            // Session summary
            greatWork: 'Tolle Arbeit heute!',
            work: 'Arbeit',
            breaks: 'Pausen',
            total: 'Gesamt',
            pawsome: 'Pfotastisch!',

            // History
            history: 'Verlauf',
            yourSessions: 'Deine erfassten Sitzungen',
            noSessionsYet: 'Noch keine Sitzungen!',
            startTrackingHistory: 'Starte die Zeiterfassung, um deinen Verlauf zu sehen',
            deleteSession: 'Sitzung löschen?',
            deleteDescription: 'Das kann nicht rückgängig gemacht werden. Hubi wird diese Sitzung für immer vergessen!',
            delete: 'Löschen',
            keepIt: 'Behalten',
            sessionDeleted: '🗑️ Sitzung gelöscht',

            // Stats
            statistics: 'Statistik',
            howProductivity: 'Wie läuft deine Produktivität?',
            week: 'Woche',
            month: 'Monat',
            allTime: 'Gesamt',
            totalBreaks: 'Gesamte Pausen',
            daysWorked: 'Arbeitstage',
            avgPerDay: 'Ø / Tag',
            thisWeek: 'Diese Woche 🐾',
            noDataPeriod: 'Keine Daten für diesen Zeitraum',
            startTrackingStats: 'Starte die Zeiterfassung, um deine Statistik zu sehen!',

            // Insights
            insightWaiting: 'Hubi wartet darauf, dass du anfängst! 🐱',
            insightNoSessions: 'Noch keine Sitzungen — lass uns loslegen! 😺',
            insightBored: 'Hubi langweilt sich... Zeit für Arbeit! 🐾',
            insightWeek40: (h) => `Wow! ${h}h diese Woche! Hubi ist beeindruckt! 😻 Vergiss die Pausen nicht!`,
            insightWeek30: (h) => `${h}h diese Woche — du bist on fire! 🔥 Hubi ist stolz!`,
            insightWeek20: (h) => `${h}h diese Woche. Gutes Tempo! Hubi schnurrt vor Stolz! 😺`,
            insightWeekLow: (h) => `${h}h diese Woche. Weiter so! Hubi glaubt an dich! 💪🐱`,
            insightMonth160: (h) => `${h}h diesen Monat! Das ist eine Vollzeit-Katze! 😹`,
            insightMonth80: (h) => `${h}h diesen Monat — produktives Kätzchen! 🐱✨`,
            insightMonthLow: (h) => `${h}h diesen Monat. Hubi trackt mit dir! 📋🐾`,
            insightAll: (h, d) => `${h} Stunden insgesamt an ${d} Tagen erfasst! Hubi ist stolz! 🏆🐱`,

            // Toasts
            toastStartWork: '🐾 Auf geht\'s!',
            toastBreak: '☕ Pausenzeit! Hubi macht ein Nickerchen...',
            toastResume: '🐾 Zurück an die Arbeit!',
        }
    };

    // Detect language from browser locale
    const browserLang = (navigator.language || navigator.languages?.[0] || 'en').split('-')[0].toLowerCase();
    const lang = translations[browserLang] ? browserLang : 'en';

    // Set document lang attribute
    document.documentElement.lang = lang;

    function t(key) {
        return translations[lang]?.[key] ?? translations.en[key] ?? key;
    }

    function getLocale() {
        return lang === 'de' ? 'de-DE' : 'en-US';
    }

    return { t, lang, getLocale };
})();

const t = I18n.t;

// Translate static HTML elements with data-i18n attributes
document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const val = t(key);
    if (val && typeof val === 'string') el.textContent = val;
});
