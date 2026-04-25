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
            readyToPrefix: 'Time for',
            readyToSuffix: '?',
            hubiWaiting: 'Hubi is waiting for you!',
            elapsedTime: 'Elapsed Time',
            startWorking: "Let's go!",

            // Timer - active
            takingBreak: 'Taking a break...',
            hubiBusy: 'Hubi is busy! 🐱',
            hubiNapping: 'Hubi is napping 😴',
            workTime: 'Active Time',
            breakTime: 'Break Time',
            startedAt: 'Started at',
            totalWork: 'Time Tracked',
            totalBreak: 'Total Break',
            resumeWorking: 'Resume',
            takeBreak: 'Take a Break',
            finishWork: 'Finish',

            // Timer - finish dialog
            finishQuestion: 'Finish session?',
            finishDescription: 'Hubi will save this session to your history.',
            finish: 'Finish',
            cancel: 'Cancel',

            // Session summary
            greatWork: 'Well done!',
            work: 'Active',
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
            edit: 'Edit',
            editSession: 'Edit Session',
            from: 'From',
            to: 'To',
            save: 'Save',
            sessionUpdated: '✏️ Session updated',
            sessionUpdatedBreaksReset: '✏️ Session updated (breaks were reset)',
            sessionUpdateFailed: 'Could not update session',
            sessionTooLong: 'Session cannot exceed 16 hours',
            breaksReset: 'Breaks were reset (shorter session)',

            // Stats
            statistics: 'Statistics',
            howProductivity: "How's it going?",
            week: 'Week',
            month: 'Month',
            allTime: 'All Time',
            totalBreaks: 'Total Breaks',
            daysWorked: 'Days Tracked',
            avgPerDay: 'Avg / Day',
            thisWeek: 'This Week 🐾',
            noDataPeriod: 'No data for this period',
            startTrackingStats: 'Start tracking to see your stats!',

            // Insights
            insightWaiting: 'Hubi is waiting for you to start tracking! 🐱',
            insightNoSessions: "No sessions yet — let's get started! 😺",
            insightBored: 'Hubi is bored... time to track something! 🐾',
            insightWeek40: (h) => `Wow! ${h}h this week! Hubi is impressed! 😻 Don't forget to rest!`,
            insightWeek30: (h) => `${h}h this week — you're on fire! 🔥 Hubi approves!`,
            insightWeek20: (h) => `${h}h this week. Nice pace! Hubi is purring with pride! 😺`,
            insightWeekLow: (h) => `${h}h this week. Keep it up! Hubi believes in you! 💪🐱`,
            insightMonth160: (h) => `${h}h this month! That's a full-time cat! 😹`,
            insightMonth80: (h) => `${h}h this month — busy kitty! 🐱✨`,
            insightMonthLow: (h) => `${h}h this month. Hubi is tracking with you! 📋🐾`,
            insightAll: (h, d) => `${h} total hours tracked across ${d} days! Hubi is proud! 🏆🐱`,

            // Toasts
            toastStartWork: "🐾 Let's go!",
            toastBreak: '☕ Break time! Hubi is napping...',
            toastResume: '🐾 Back at it!',
            toastTreat: '🎉 4 hours done! Hubi earned a treat — click the box!',

            // Sync
            navSync: 'Sync',
            syncTitle: 'Sync Data',
            syncSubtitle: 'Transfer your sessions between devices',
            exportData: 'Export Data',
            exportDesc: 'Share your sessions with another device',
            importData: 'Import Data',
            importDesc: 'Receive sessions from another device',
            exportCSV: 'Download as CSV',
            catPhrase: 'Your cat phrase',
            catPhraseHint: 'Enter this phrase on your other device to decrypt your data',
            copyPhrase: 'Copy phrase',
            copyData: 'Copy data',
            encryptedData: 'Encrypted data',
            back: 'Back',
            enterPhrase: 'Enter cat phrase',
            phrasePlaceholder: 'whisker purr meow nuzzle...',
            pasteData: 'Paste encrypted data here...',
            decryptImport: 'Decrypt & Import',
            scanQR: 'Scan QR',
            importSuccess: (n) => `Imported ${n} new session${n !== 1 ? 's' : ''}!`,
            importNoNew: 'No new sessions to import — already up to date!',
            invalidPhrase: 'Invalid cat phrase — must be 12 cat words',
            decryptFailed: 'Could not decrypt — check your phrase and data',
            noSessions: 'No sessions to export yet!',
            copied: 'Copied!',
            noData: 'No data pasted',
            qrScanNotSupported: 'QR scanning not supported in this browser. Type the phrase manually.',
            csvExported: 'CSV downloaded!',
            scanToImport: 'Scan this on your other device to import',
            manualPhraseHint: 'Or enter the 12-word phrase from the export screen',
            manualDataHint: 'Only needed if QR scan is not available',
            qrScanned: 'QR scanned!',
            closeCamera: 'Close camera',

            // Cloud Sync
            cloudSync: 'Cloud Sync',
            cloudSyncDesc: 'Keep devices in sync automatically',
            cloudConnected: 'Connected',
            cloudDisconnected: 'Not connected',
            generatePhrase: 'Generate new phrase',
            connectWithPhrase: 'Connect',
            enterExistingPhrase: 'Have a phrase from another device?',
            syncNow: 'Sync now',
            disconnect: 'Disconnect',
            lastSynced: 'Last synced',
            lastSyncedNever: 'Never',
            cloudSyncStarted: 'Cloud sync connected!',
            cloudSyncDisconnected: 'Cloud sync disconnected',
            cloudSyncing: 'Syncing...',
            cloudSyncDone: 'Synced!',
            cloudSyncFailed: 'Sync error',
            manualTransfer: 'Manual Transfer',
            disconnectConfirm: 'Disconnect cloud sync?',
            disconnectDesc: 'Your data stays on this device. You can reconnect anytime with the same phrase.',

            // Task categories
            taskArbeiten: 'Work',
            taskLernen: 'Study',
            taskPutzen: 'Cleaning',
            taskEntspannen: 'Relaxing',
            taskKochen: 'Cooking',
            taskSport: 'Sports',
            taskKreativ: 'Creativity',
            taskEinkaufen: 'Shopping',
            selectTask: 'What are you doing?',
            taskBreakdown: 'By Task',

            // Changelog
            whatsNew: "What's new",
            whatsNewCloudSyncTitle: "Cloud Sync",
            whatsNewCloudSyncDesc: "Your sessions now sync automatically across devices. Go to Sync, generate a phrase, enter it on your other device, and you're connected. Encrypted and zero-cost.",
            whatsNewEditEntryTitle: "Edit Time Entries",
            whatsNewEditEntryDesc: "You can now edit the start and end times of your tracking sessions directly from the history tab. Mistakes happen, and Hubi understands!",
            whatsNewSafetyNetTitle: "Safety net for your history",
            whatsNewSafetyNetDesc: "Hubi now keeps a 7-day local backup, lets you undo deletes, and warns before pairing. If sessions ever go missing, head to Sync to recover.",

            // Recovery & safety
            undo: 'Undo',
            today: 'today',
            yesterday: 'yesterday',
            daysAgo: (n) => `${n} days ago`,
            recoveryBanner: (count, when) => `Some sessions look missing — restore ${count} from ${when}?`,
            recoveryRestore: 'Restore',
            recoveryKeep: 'Keep current',
            recoveryRestored: (n) => n === 1 ? '1 session restored' : `${n} sessions restored`,
            recoveryNoChange: 'Nothing to restore — your history is already up to date',
            recoverHistory: 'Recover earlier history',
            recoverTitle: 'Recover earlier history',
            recoverHint: 'Hubi keeps a backup of your sessions for the last 7 days. Pick one to bring back any missing entries — current sessions are never replaced.',
            recoverEmpty: 'No backups yet. Hubi will start saving them from now on.',
            recoverRestoreBtn: 'Restore',
            recoverSessionsCount: (n) => n === 1 ? '1 session' : `${n} sessions`,
            backupNudgeMsg: 'Back up your sessions to a file?',
            backupNudgeAction: 'Download CSV',
            backupNudgeLater: 'Later',
            pairPreviewTitle: 'Combine with cloud data?',
            pairPreviewBoth: (cloud, local) => `Found ${cloud} sessions in the cloud. They will be combined with your ${local} on this device. Nothing is replaced.`,
            pairPreviewCloudOnly: (cloud) => `Found ${cloud} sessions in the cloud. They will be added to this device.`,
            pairPreviewLocalOnly: (local) => `No data in the cloud yet. Your ${local} sessions on this device will be uploaded.`,
            pairPreviewEmpty: 'No data on this device or in the cloud yet — connecting anyway.',
            pairPreviewContinue: 'Continue',
            pairPreviewCancel: 'Cancel',
            saveBlocked: 'Save blocked — please reload',
            shrinkWarning: 'Some sessions look missing — open Sync to recover',
            syncSafetyAbort: 'Sync looked wrong — no changes saved',
        },

        de: {
            // Nav
            navTimer: 'Timer',
            navHistory: 'Verlauf',
            navStats: 'Statistik',

            // Timer - idle
            readyToPrefix: 'Lust auf',
            readyToSuffix: '?',
            hubiWaiting: 'Hubi wartet auf dich!',
            elapsedTime: 'Vergangene Zeit',
            startWorking: 'Los geht\'s!',

            // Timer - active
            takingBreak: 'Pause machen...',
            hubiBusy: 'Hubi ist beschäftigt! 🐱',
            hubiNapping: 'Hubi macht ein Nickerchen 😴',
            workTime: 'Aktive Zeit',
            breakTime: 'Pausenzeit',
            startedAt: 'Gestartet um',
            totalWork: 'Erfasste Zeit',
            totalBreak: 'Gesamte Pause',
            resumeWorking: 'Weiter',
            takeBreak: 'Pause machen',
            finishWork: 'Beenden',

            // Timer - finish dialog
            finishQuestion: 'Sitzung beenden?',
            finishDescription: 'Hubi speichert diese Sitzung in deinem Verlauf.',
            finish: 'Beenden',
            cancel: 'Abbrechen',

            // Session summary
            greatWork: 'Gut gemacht!',
            work: 'Aktiv',
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
            edit: 'Bearbeiten',
            editSession: 'Sitzung bearbeiten',
            from: 'Von',
            to: 'Bis',
            save: 'Speichern',
            sessionUpdated: '✏️ Sitzung aktualisiert',
            sessionUpdatedBreaksReset: '✏️ Sitzung aktualisiert (Pausen zurückgesetzt)',
            sessionUpdateFailed: 'Sitzung konnte nicht aktualisiert werden',
            sessionTooLong: 'Sitzung darf nicht länger als 16 Stunden sein',
            breaksReset: 'Pausen wurden zurückgesetzt (kürzere Sitzung)',

            // Stats
            statistics: 'Statistik',
            howProductivity: "Wie läuft's?",
            week: 'Woche',
            month: 'Monat',
            allTime: 'Gesamt',
            totalBreaks: 'Gesamte Pausen',
            daysWorked: 'Aktive Tage',
            avgPerDay: 'Ø / Tag',
            thisWeek: 'Diese Woche 🐾',
            noDataPeriod: 'Keine Daten für diesen Zeitraum',
            startTrackingStats: 'Starte die Zeiterfassung, um deine Statistik zu sehen!',

            // Insights
            insightWaiting: 'Hubi wartet darauf, dass du anfängst! 🐱',
            insightNoSessions: 'Noch keine Sitzungen — lass uns loslegen! 😺',
            insightBored: 'Hubi langweilt sich... Zeit loszulegen! 🐾',
            insightWeek40: (h) => `Wow! ${h}h diese Woche! Hubi ist beeindruckt! 😻 Vergiss die Pausen nicht!`,
            insightWeek30: (h) => `${h}h diese Woche — du bist on fire! 🔥 Hubi ist stolz!`,
            insightWeek20: (h) => `${h}h diese Woche. Gutes Tempo! Hubi schnurrt vor Stolz! 😺`,
            insightWeekLow: (h) => `${h}h diese Woche. Weiter so! Hubi glaubt an dich! 💪🐱`,
            insightMonth160: (h) => `${h}h diesen Monat! Das ist eine Vollzeit-Katze! 😹`,
            insightMonth80: (h) => `${h}h diesen Monat — fleißiges Kätzchen! 🐱✨`,
            insightMonthLow: (h) => `${h}h diesen Monat. Hubi trackt mit dir! 📋🐾`,
            insightAll: (h, d) => `${h} Stunden insgesamt an ${d} Tagen erfasst! Hubi ist stolz! 🏆🐱`,

            // Toasts
            toastStartWork: '🐾 Auf geht\'s!',
            toastBreak: '☕ Pausenzeit! Hubi macht ein Nickerchen...',
            toastResume: '🐾 Weiter geht\'s!',
            toastTreat: '🎉 4 Stunden geschafft! Hubi hat sich ein Leckerli verdient — klick auf die Box!',

            // Sync
            navSync: 'Sync',
            syncTitle: 'Daten synchronisieren',
            syncSubtitle: 'Übertrage deine Sitzungen zwischen Geräten',
            exportData: 'Daten exportieren',
            exportDesc: 'Teile deine Sitzungen mit einem anderen Gerät',
            importData: 'Daten importieren',
            importDesc: 'Empfange Sitzungen von einem anderen Gerät',
            exportCSV: 'Als CSV herunterladen',
            catPhrase: 'Deine Katzenphrase',
            catPhraseHint: 'Gib diese Phrase auf deinem anderen Gerät ein, um die Daten zu entschlüsseln',
            copyPhrase: 'Phrase kopieren',
            copyData: 'Daten kopieren',
            encryptedData: 'Verschlüsselte Daten',
            back: 'Zurück',
            enterPhrase: 'Katzenphrase eingeben',
            phrasePlaceholder: 'whisker purr meow nuzzle...',
            pasteData: 'Verschlüsselte Daten hier einfügen...',
            decryptImport: 'Entschlüsseln & Importieren',
            scanQR: 'QR scannen',
            importSuccess: (n) => `${n} neue Sitzung${n !== 1 ? 'en' : ''} importiert!`,
            importNoNew: 'Keine neuen Sitzungen — bereits aktuell!',
            invalidPhrase: 'Ungültige Katzenphrase — muss 12 Katzenwörter enthalten',
            decryptFailed: 'Entschlüsselung fehlgeschlagen — überprüfe Phrase und Daten',
            noSessions: 'Noch keine Sitzungen zum Exportieren!',
            copied: 'Kopiert!',
            noData: 'Keine Daten eingefügt',
            qrScanNotSupported: 'QR-Scan wird in diesem Browser nicht unterstützt. Gib die Phrase manuell ein.',
            csvExported: 'CSV heruntergeladen!',
            scanToImport: 'Scanne dies auf deinem anderen Gerät zum Importieren',
            manualPhraseHint: 'Oder gib die 12-Wort-Phrase vom Export-Bildschirm ein',
            manualDataHint: 'Nur nötig, wenn QR-Scan nicht verfügbar ist',
            qrScanned: 'QR gescannt!',
            closeCamera: 'Kamera schließen',

            // Cloud Sync
            cloudSync: 'Cloud-Sync',
            cloudSyncDesc: 'Geräte automatisch synchron halten',
            cloudConnected: 'Verbunden',
            cloudDisconnected: 'Nicht verbunden',
            generatePhrase: 'Neue Phrase generieren',
            connectWithPhrase: 'Verbinden',
            enterExistingPhrase: 'Phrase von einem anderen Gerät?',
            syncNow: 'Jetzt synchronisieren',
            disconnect: 'Trennen',
            lastSynced: 'Zuletzt synchronisiert',
            lastSyncedNever: 'Nie',
            cloudSyncStarted: 'Cloud-Sync verbunden!',
            cloudSyncDisconnected: 'Cloud-Sync getrennt',
            cloudSyncing: 'Synchronisiere...',
            cloudSyncDone: 'Synchronisiert!',
            cloudSyncFailed: 'Sync-Fehler',
            manualTransfer: 'Manueller Transfer',
            disconnectConfirm: 'Cloud-Sync trennen?',
            disconnectDesc: 'Deine Daten bleiben auf diesem Gerät. Du kannst dich jederzeit mit derselben Phrase wieder verbinden.',

            // Task categories
            taskArbeiten: 'Arbeiten',
            taskLernen: 'Lernen',
            taskPutzen: 'Putzen',
            taskEntspannen: 'Entspannen',
            taskKochen: 'Kochen',
            taskSport: 'Sport',
            taskKreativ: 'Kreativität',
            taskEinkaufen: 'Einkaufen',
            selectTask: 'Was machst du?',
            taskBreakdown: 'Nach Aufgabe',

            // Changelog
            whatsNew: "Was gibt's Neues",
            whatsNewCloudSyncTitle: "Cloud-Sync",
            whatsNewCloudSyncDesc: "Deine Sitzungen werden jetzt automatisch zwischen Geräten synchronisiert. Geh zu Sync, generiere eine Phrase, gib sie auf deinem anderen Gerät ein, und fertig. Verschlüsselt und kostenlos.",
            whatsNewEditEntryTitle: "Zeiteinträge bearbeiten",
            whatsNewEditEntryDesc: "Du kannst jetzt die Start- und Endzeiten deiner erfassten Sitzungen direkt im Verlauf bearbeiten. Fehler passieren, und Hubi versteht das!",
            whatsNewSafetyNetTitle: "Sicherheitsnetz für deinen Verlauf",
            whatsNewSafetyNetDesc: "Hubi behält jetzt eine 7-Tage-Sicherung lokal, du kannst Löschungen rückgängig machen, und vor dem Verbinden gibt's eine Vorschau. Falls Sitzungen verschwinden, kannst du sie unter Sync wiederherstellen.",

            // Recovery & safety
            undo: 'Rückgängig',
            today: 'heute',
            yesterday: 'gestern',
            daysAgo: (n) => `vor ${n} Tagen`,
            recoveryBanner: (count, when) => `Es scheinen Sitzungen zu fehlen — ${count} von ${when} wiederherstellen?`,
            recoveryRestore: 'Wiederherstellen',
            recoveryKeep: 'Aktuelle behalten',
            recoveryRestored: (n) => n === 1 ? '1 Sitzung wiederhergestellt' : `${n} Sitzungen wiederhergestellt`,
            recoveryNoChange: 'Nichts wiederherzustellen — dein Verlauf ist bereits vollständig',
            recoverHistory: 'Älteren Verlauf wiederherstellen',
            recoverTitle: 'Älteren Verlauf wiederherstellen',
            recoverHint: 'Hubi sichert deine Sitzungen für die letzten 7 Tage. Wähle eine Sicherung, um fehlende Einträge zurückzuholen — bestehende Sitzungen werden nie ersetzt.',
            recoverEmpty: 'Noch keine Sicherungen. Hubi fängt jetzt damit an.',
            recoverRestoreBtn: 'Wiederherstellen',
            recoverSessionsCount: (n) => n === 1 ? '1 Sitzung' : `${n} Sitzungen`,
            backupNudgeMsg: 'Sitzungen als Datei sichern?',
            backupNudgeAction: 'CSV herunterladen',
            backupNudgeLater: 'Später',
            pairPreviewTitle: 'Mit Cloud-Daten zusammenführen?',
            pairPreviewBoth: (cloud, local) => `${cloud} Sitzungen in der Cloud gefunden. Sie werden mit deinen ${local} auf diesem Gerät zusammengeführt. Nichts wird ersetzt.`,
            pairPreviewCloudOnly: (cloud) => `${cloud} Sitzungen in der Cloud gefunden. Sie werden zu diesem Gerät hinzugefügt.`,
            pairPreviewLocalOnly: (local) => `Noch keine Daten in der Cloud. Deine ${local} Sitzungen auf diesem Gerät werden hochgeladen.`,
            pairPreviewEmpty: 'Noch keine Daten auf diesem Gerät oder in der Cloud — wird trotzdem verbunden.',
            pairPreviewContinue: 'Weiter',
            pairPreviewCancel: 'Abbrechen',
            saveBlocked: 'Speichern blockiert — bitte neu laden',
            shrinkWarning: 'Es scheinen Sitzungen zu fehlen — unter Sync wiederherstellbar',
            syncSafetyAbort: 'Sync sah falsch aus — keine Änderungen gespeichert',
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
