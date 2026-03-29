/* ============================================
   HUBI TIME TRACKER — Sync Module
   ============================================ */

const Sync = (() => {

// ---- Cat Word List (256 words) ----
const WORDS = [
    'whisker', 'purr', 'meow', 'tabby', 'calico', 'kitten', 'nuzzle', 'pounce',
    'yarn', 'sardine', 'catnip', 'snooze', 'stretch', 'tumble', 'fluff', 'mittens',
    'siamese', 'bengal', 'ragdoll', 'sphynx', 'persian', 'claw', 'paw', 'tail',
    'fur', 'belly', 'nose', 'ear', 'scratch', 'groom', 'hiss', 'chirp',
    'trill', 'knead', 'loaf', 'zoomie', 'treat', 'kibble', 'litter', 'collar',
    'jingle', 'mouse', 'feather', 'laser', 'box', 'basket', 'perch', 'windowsill',
    'sunbeam', 'cuddle', 'nap', 'prowl', 'stalk', 'leap', 'climb', 'hide',
    'peek', 'blink', 'wink', 'wiggle', 'trot', 'fidget', 'arch', 'rub',
    'bump', 'chase', 'frolic', 'bat', 'swat', 'roll', 'curl', 'tuck',
    'nestle', 'snuggle', 'cozy', 'warm', 'soft', 'gentle', 'playful', 'lazy',
    'sleepy', 'frisky', 'curious', 'plump', 'chonky', 'smol', 'beans', 'toe',
    'tabletop', 'stripe', 'spot', 'patch', 'ginger', 'orange', 'cream', 'smoke',
    'silver', 'marble', 'tortie', 'tuxedo', 'bicolor', 'tabitha', 'felix', 'garfield',
    'muffin', 'biscuit', 'cookie', 'waffle', 'pancake', 'donut', 'cupcake', 'sprinkle',
    'pumpkin', 'nacho', 'pretzel', 'olive', 'apricot', 'mango', 'lemon', 'clover',
    'daisy', 'poppy', 'luna', 'stella', 'nova', 'misty', 'shadow', 'midnight',
    'solstice', 'maple', 'willow', 'sage', 'fern', 'moss', 'pebble', 'brook',
    'rain', 'cloud', 'thunder', 'breeze', 'sunset', 'dawn', 'dusk', 'twilight',
    'starlight', 'moonbeam', 'comet', 'wobble', 'scurry', 'scamper', 'gallop', 'prancing',
    'tiptoe', 'nimble', 'velvet', 'plush', 'fuzzy', 'downy', 'silky', 'dapple',
    'ripple', 'shimmer', 'blaze', 'rusty', 'sandy', 'brindle', 'stormy', 'inky',
    'sooty', 'cocoa', 'mocha', 'latte', 'espresso', 'truffle', 'nutmeg', 'cinnamon',
    'paprika', 'saffron', 'pepper', 'basil', 'thyme', 'rosemary', 'cardamom', 'fennel',
    'bramble', 'thistle', 'ivy', 'juniper', 'cedar', 'aspen', 'birch', 'rowan',
    'hazel', 'acorn', 'chestnut', 'walnut', 'almond', 'cobalt', 'indigo', 'scarlet',
    'amber', 'coral', 'jade', 'pearl', 'opal', 'garnet', 'onyx', 'flint',
    'pudding', 'crumpet', 'scone', 'toffee', 'fudge', 'sorbet', 'jellybean', 'gumdrop',
    'marzipan', 'nougat', 'caramel', 'butterscotch', 'licorice', 'marshmallow', 'bonbon', 'praline',
    'bobcat', 'lynx', 'ocelot', 'panther', 'cougar', 'cheetah', 'jaguar', 'leopard',
    'tiger', 'lion', 'caracal', 'serval', 'manx', 'birman', 'abyssinian', 'burmese',
    'chartreux', 'cymric', 'havana', 'korat', 'nebelung', 'ocicat', 'pixie', 'savannah',
    'snowshoe', 'tonkinese', 'peterbald', 'munchkin', 'bambino', 'lykoi', 'devon', 'siberian',
];

const DATA_PREFIX = 'HUBI2:';

// ---- Cloud Sync Config ----
const SYNC_API = 'https://sync.hubi.work';
const SYNC_PHRASE_KEY = 'hubi_sync_phrase';
const SYNC_LAST_KEY = 'hubi_sync_last';

// ---- Crypto Helpers ----

async function deriveKey(phrase, salt) {
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(phrase),
        'PBKDF2',
        false,
        ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

async function phraseToChannel(phrase) {
    const data = new TextEncoder().encode('channel:' + phrase);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}

function bytesToBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}

function base64ToBytes(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

async function encryptData(text, phrase) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(phrase, salt);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        new TextEncoder().encode(text)
    );
    // Format: salt (16) + iv (12) + ciphertext
    const combined = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
    combined.set(salt);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(ciphertext), salt.length + iv.length);
    return DATA_PREFIX + bytesToBase64(combined);
}

async function decryptData(blob, phrase) {
    if (!blob.startsWith(DATA_PREFIX)) throw new Error('Invalid data format');
    const raw = blob.slice(DATA_PREFIX.length);
    const bytes = base64ToBytes(raw);
    const salt = bytes.slice(0, 16);
    const iv = bytes.slice(16, 28);
    const ciphertext = bytes.slice(28);
    const key = await deriveKey(phrase, salt);
    const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertext
    );
    return new TextDecoder().decode(plain);
}

// ---- Phrase Generation ----

function generatePhrase() {
    const picked = new Set();
    const result = [];
    while (result.length < 12) {
        const [idx] = crypto.getRandomValues(new Uint8Array(1));
        if (!picked.has(idx)) {
            picked.add(idx);
            result.push(WORDS[idx]);
        }
    }
    return result.join(' ');
}

function validatePhrase(phrase) {
    const words = phrase.trim().toLowerCase().split(/\s+/);
    if (words.length !== 12) return false;
    return words.every(w => WORDS.includes(w));
}

// ---- Session Sanitization ----

function sanitizeSessions(incoming) {
    if (!Array.isArray(incoming)) throw new Error('not an array');
    return incoming.filter(s =>
        s && typeof s.id === 'string' &&
        typeof s.startTime === 'number' &&
        typeof s.endTime === 'number'
    ).map(s => {
        const out = {
            id: String(s.id).replace(/[^a-z0-9]/gi, '').slice(0, 30),
            date: typeof s.date === 'string' ? s.date.replace(/[^0-9-]/g, '').slice(0, 10) : new Date(s.startTime).toISOString().split('T')[0],
            startTime: Number(s.startTime),
            endTime: Number(s.endTime),
            breaks: Array.isArray(s.breaks) ? s.breaks.filter(b => typeof b.start === 'number' && typeof b.end === 'number').map(b => ({ start: Number(b.start), end: Number(b.end) })) : [],
            totalWork: typeof s.totalWork === 'number' ? Number(s.totalWork) : 0,
            totalBreak: typeof s.totalBreak === 'number' ? Number(s.totalBreak) : 0,
        };
        if (typeof s.task === 'string') out.task = s.task.replace(/[^a-z0-9äöü]/gi, '').slice(0, 30);
        if (typeof s.updatedAt === 'number') out.updatedAt = s.updatedAt;
        if (typeof s.deletedAt === 'number') out.deletedAt = s.deletedAt;
        return out;
    });
}

// ---- CSV Export ----

function padTwo(n) { return String(n).padStart(2, '0'); }

function fmtDuration(ms) {
    if (ms < 0) ms = 0;
    const s = Math.floor(ms / 1000);
    return `${padTwo(Math.floor(s / 3600))}:${padTwo(Math.floor((s % 3600) / 60))}:${padTwo(s % 60)}`;
}

function exportCSV() {
    const sessions = Storage.getSessions();
    if (!sessions.length) {
        showToast(t('noSessions'));
        return;
    }

    const rows = [['Date', 'Start Time', 'End Time', 'Work Duration', 'Break Duration', 'Total Duration', 'Task']];

    for (const s of sessions) {
        const start = new Date(s.startTime);
        const end = new Date(s.endTime);
        const dateStr = `${start.getFullYear()}-${padTwo(start.getMonth() + 1)}-${padTwo(start.getDate())}`;
        const startTime = `${padTwo(start.getHours())}:${padTwo(start.getMinutes())}`;
        const endTime = `${padTwo(end.getHours())}:${padTwo(end.getMinutes())}`;
        const work = fmtDuration(s.totalWork || 0);
        const brk = fmtDuration(s.totalBreak || 0);
        const total = fmtDuration((s.totalWork || 0) + (s.totalBreak || 0));
        const taskKey = s.task || 'arbeiten';
        const taskLabel = t('task' + taskKey.charAt(0).toUpperCase() + taskKey.slice(1)) || taskKey;
        rows.push([dateStr, startTime, endTime, work, brk, total, taskLabel]);
    }

    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const today = new Date();
    a.download = `hubi-sessions-${today.getFullYear()}-${padTwo(today.getMonth() + 1)}-${padTwo(today.getDate())}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(t('csvExported'));
}

// ---- Merge Logic ----

function mergeSessions(existing, incoming) {
    const map = new Map();
    for (const s of existing) map.set(s.id, s);

    let newCount = 0;
    let changed = false;
    for (const s of incoming) {
        const have = map.get(s.id);
        if (!have) {
            map.set(s.id, s);
            if (!s.deletedAt) newCount++;
            changed = true;
        } else if ((s.updatedAt || 0) > (have.updatedAt || 0)) {
            map.set(s.id, s);
            changed = true;
        } else if (!s.updatedAt && !have.updatedAt) {
            // Legacy sessions without updatedAt: keep later endTime
            if (s.endTime && (!have.endTime || s.endTime > have.endTime)) {
                map.set(s.id, s);
                changed = true;
            }
        }
    }

    const merged = Array.from(map.values());
    merged.sort((a, b) => b.startTime - a.startTime);
    return { merged, newCount, changed };
}

// ---- Cloud Sync ----

const CloudSync = {
    _pushDebounce: null,
    _syncing: false,
    _pendingSync: false,
    _lastError: null,
    _dirty: false,

    getPhrase() {
        return localStorage.getItem(SYNC_PHRASE_KEY) || null;
    },

    setPhrase(phrase) {
        localStorage.setItem(SYNC_PHRASE_KEY, phrase);
    },

    clearPhrase() {
        localStorage.removeItem(SYNC_PHRASE_KEY);
        localStorage.removeItem(SYNC_LAST_KEY);
        clearTimeout(this._pushDebounce);
    },

    isPaired() {
        return !!this.getPhrase();
    },

    getLastSync() {
        return localStorage.getItem(SYNC_LAST_KEY) || null;
    },

    async push(phrase) {
        const sessions = Storage.getAllRaw();
        const active = ActiveState.getForSync();
        if (!sessions.length && !active.state) return;
        const channelId = await phraseToChannel(phrase);
        const payload = { sessions, active };
        const encrypted = await encryptData(JSON.stringify(payload), phrase);
        const res = await fetch(`${SYNC_API}/sync/${channelId}`, {
            method: 'PUT',
            body: encrypted,
        });
        if (!res.ok) throw new Error(`Push failed: ${res.status}`);
    },

    async pull(phrase) {
        const channelId = await phraseToChannel(phrase);
        const res = await fetch(`${SYNC_API}/sync/${channelId}`, { cache: 'no-store' });
        if (res.status === 404) return 0;
        if (!res.ok) throw new Error(`Pull failed: ${res.status}`);
        const blob = await res.text();
        if (!blob) return 0;
        const decrypted = await decryptData(blob, phrase);
        const parsed = JSON.parse(decrypted);
        // Backwards compat: old blobs are plain arrays
        const incomingSessions = Array.isArray(parsed) ? parsed : (parsed.sessions || []);
        const incomingActive = Array.isArray(parsed) ? null : (parsed.active || null);
        const incoming = sanitizeSessions(incomingSessions);
        const existing = Storage.getAllRaw();
        const { merged, newCount, changed } = mergeSessions(existing, incoming);
        if (changed) _origSave(merged);
        if (incomingActive && ActiveState.applyFromSync(incomingActive)) {
            try {
                if (typeof currentPage !== 'undefined' && currentPage === 'timer') {
                    renderTimerPage();
                }
            } catch (e) {
                console.warn('Failed to re-render timer after sync:', e);
            }
        }
        return newCount;
    },

    async sync() {
        if (this._syncing) {
            this._pendingSync = true;
            return;
        }
        const phrase = this.getPhrase();
        if (!phrase) return;
        this._syncing = true;
        try {
            await this.pull(phrase);
            if (this._dirty) {
                this._dirty = false;
                try { await this.push(phrase); }
                catch (e) { this._dirty = true; throw e; }
            }
            localStorage.setItem(SYNC_LAST_KEY, new Date().toISOString());
            this._lastError = null;
        } catch (e) {
            console.warn('Cloud sync failed:', e.message);
            this._lastError = e.message;
        } finally {
            this._syncing = false;
            if (this._pendingSync) {
                this._pendingSync = false;
                this.schedulePush();
            }
            if (typeof currentPage !== 'undefined' && currentPage === 'sync') {
                renderSyncPage(document.getElementById('app'));
            }
        }
    },

    initialSync() {
        if (!this.isPaired()) return;
        return this.sync();
    },

    schedulePush() {
        if (!this.isPaired()) return;
        clearTimeout(this._pushDebounce);
        this._pushDebounce = setTimeout(() => this.sync(), 2000);
    }
};

// Monkey-patch Storage.saveSessions to trigger cloud sync on save
const _origSave = Storage.saveSessions.bind(Storage);
Storage.saveSessions = function(sessions) {
    _origSave(sessions);
    CloudSync._dirty = true;
    CloudSync.schedulePush();
};

// Monkey-patch ActiveState to trigger cloud sync on timer changes
const _origActiveSet = ActiveState.set.bind(ActiveState);
ActiveState.set = function(state) {
    _origActiveSet(state);
    CloudSync._dirty = true;
    CloudSync.schedulePush();
};
const _origActiveClear = ActiveState.clear.bind(ActiveState);
ActiveState.clear = function() {
    _origActiveClear();
    CloudSync._dirty = true;
    CloudSync.schedulePush();
};

// ---- QR Scanner ----

function openScanner(onResult) {
    if (!('BarcodeDetector' in window)) {
        showToast(t('qrScanNotSupported'));
        return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'sync-camera';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:300;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;';
    overlay.innerHTML = `
        <video autoplay playsinline muted style="width:100%;max-height:80vh;object-fit:cover;"></video>
        <button class="btn btn-secondary" style="margin-top:16px;">${t('closeCamera')}</button>
    `;
    document.body.appendChild(overlay);

    const video = overlay.querySelector('video');
    const closeBtn = overlay.querySelector('button');
    let stream = null;
    let scanning = true;

    function cleanup() {
        scanning = false;
        if (stream) stream.getTracks().forEach(track => track.stop());
        overlay.remove();
    }

    closeBtn.addEventListener('click', cleanup);

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then(s => {
            stream = s;
            video.srcObject = s;
            const detector = new BarcodeDetector({ formats: ['qr_code'] });

            function scan() {
                if (!scanning) return;
                if (video.readyState >= 2) {
                    detector.detect(video).then(codes => {
                        if (codes.length > 0) {
                            onResult(codes[0].rawValue);
                            cleanup();
                            return;
                        }
                        requestAnimationFrame(scan);
                    }).catch(() => requestAnimationFrame(scan));
                } else {
                    requestAnimationFrame(scan);
                }
            }
            scan();
        })
        .catch(err => {
            cleanup();
            if (err.name === 'NotAllowedError') {
                showToast(t('cameraPermissionDenied') || 'Camera permission denied');
            } else {
                showToast(t('qrScanNotSupported'));
            }
        });
}

// ---- Phrase Autocomplete ----

function attachPhraseAutocomplete(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;

    // Wrap input in a relative container for positioning the dropdown
    const wrapper = document.createElement('div');
    wrapper.className = 'phrase-ac-wrapper';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const dropdown = document.createElement('div');
    dropdown.className = 'phrase-ac-dropdown';
    wrapper.appendChild(dropdown);

    let selectedIdx = -1;

    function getCurrentWord() {
        const val = input.value.toLowerCase();
        const words = val.split(/\s/);
        return words[words.length - 1] || '';
    }

    function showSuggestions() {
        const partial = getCurrentWord();
        dropdown.innerHTML = '';
        selectedIdx = -1;
        if (partial.length < 1) { dropdown.classList.remove('visible'); return; }

        const matches = WORDS.filter(w => w.startsWith(partial)).slice(0, 6);
        if (!matches.length || (matches.length === 1 && matches[0] === partial)) {
            dropdown.classList.remove('visible');
            return;
        }

        for (let i = 0; i < matches.length; i++) {
            const item = document.createElement('div');
            item.className = 'phrase-ac-item';
            item.textContent = matches[i];
            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                acceptSuggestion(matches[i]);
            });
            dropdown.appendChild(item);
        }
        dropdown.classList.add('visible');
    }

    function acceptSuggestion(word) {
        const val = input.value;
        const words = val.split(/\s/);
        words[words.length - 1] = word;
        const count = words.filter(w => WORDS.includes(w.toLowerCase())).length;
        input.value = words.join(' ') + (count < 12 ? ' ' : '');
        dropdown.classList.remove('visible');
        input.focus();
        const len = input.value.length;
        input.setSelectionRange(len, len);
    }

    function highlightItem(idx) {
        const items = dropdown.querySelectorAll('.phrase-ac-item');
        items.forEach((el, i) => el.classList.toggle('active', i === idx));
    }

    input.addEventListener('input', showSuggestions);
    input.addEventListener('blur', () => {
        setTimeout(() => dropdown.classList.remove('visible'), 150);
    });
    input.addEventListener('focus', showSuggestions);

    input.addEventListener('keydown', (e) => {
        const items = dropdown.querySelectorAll('.phrase-ac-item');
        if (!items.length || !dropdown.classList.contains('visible')) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIdx = Math.min(selectedIdx + 1, items.length - 1);
            highlightItem(selectedIdx);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIdx = Math.max(selectedIdx - 1, 0);
            highlightItem(selectedIdx);
        } else if (e.key === 'Tab' || e.key === 'Enter') {
            if (selectedIdx >= 0) {
                e.preventDefault();
                acceptSuggestion(items[selectedIdx].textContent);
            } else if (items.length > 0) {
                e.preventDefault();
                acceptSuggestion(items[0].textContent);
            }
        }
    });
}

// ---- Relative Time Helper ----

function relativeTime(isoStr) {
    if (!isoStr) return t('lastSyncedNever');
    const diff = Date.now() - new Date(isoStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t('cloudSyncDone');
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

// ---- Page Rendering ----

function renderCloudSyncSection() {
    const paired = CloudSync.isPaired();

    if (!paired) {
        return `
            <div class="cloud-sync-card">
                <div class="sync-label">${t('cloudSync')}</div>
                <p class="sync-hint" style="margin-bottom:12px">${t('cloudSyncDesc')}</p>
                <div class="sync-btn-row" style="margin-bottom:16px">
                    <button class="btn btn-start" id="cloud-generate">${t('generatePhrase')}</button>
                </div>
                <div class="sync-label" style="font-size:0.8rem">${t('enterExistingPhrase')}</div>
                <input class="sync-input" type="text" id="cloud-phrase-input"
                    placeholder="${t('phrasePlaceholder')}"
                    autocomplete="off" autocapitalize="none" spellcheck="false">
                <div class="sync-btn-row" style="margin-top:8px">
                    <button class="btn btn-secondary" id="cloud-connect">${t('connectWithPhrase')}</button>
                </div>
            </div>
        `;
    }

    const phrase = CloudSync.getPhrase();
    const phraseWords = phrase.split(' ').map(w => `<span class="sync-phrase-word">${w}</span>`).join('');
    const lastSync = relativeTime(CloudSync.getLastSync());
    const hasError = !!CloudSync._lastError;

    return `
        <div class="cloud-sync-card">
            <div class="sync-label">${t('cloudSync')}</div>
            <div class="cloud-sync-status">
                <span class="cloud-sync-dot ${hasError ? 'error' : 'connected'}"></span>
                <span>${hasError ? t('cloudSyncFailed') : t('cloudConnected')}</span>
            </div>
            <div class="sync-phrase">
                <div class="sync-phrase-words">${phraseWords}</div>
            </div>
            <div class="cloud-sync-last">${t('lastSynced')}: ${lastSync}</div>
            <div class="sync-btn-row">
                <button class="btn btn-start" id="cloud-sync-now">${t('syncNow')}</button>
                <button class="btn btn-secondary" id="cloud-disconnect">${t('disconnect')}</button>
            </div>
        </div>
    `;
}

function attachCloudSyncListeners(appEl) {
    const paired = CloudSync.isPaired();

    if (!paired) {
        document.getElementById('cloud-generate')?.addEventListener('click', async () => {
            const phrase = generatePhrase();
            CloudSync.setPhrase(phrase);
            await CloudSync.initialSync();
            showToast(t('cloudSyncStarted'));
            renderSyncPage(appEl);
        });

        document.getElementById('cloud-connect')?.addEventListener('click', async () => {
            const input = document.getElementById('cloud-phrase-input').value.trim().toLowerCase();
            const phrase = input.split(/\s+/).join(' ');
            if (!validatePhrase(phrase)) {
                showToast(t('invalidPhrase'));
                return;
            }
            CloudSync.setPhrase(phrase);
            await CloudSync.initialSync();
            showToast(t('cloudSyncStarted'));
            renderSyncPage(appEl);
        });
    } else {
        document.getElementById('cloud-sync-now')?.addEventListener('click', async () => {
            const btn = document.getElementById('cloud-sync-now');
            btn.disabled = true;
            btn.textContent = t('cloudSyncing');
            try {
                await CloudSync.sync();
                showToast(t('cloudSyncDone'));
            } catch {
                showToast(t('cloudSyncFailed'));
            }
            renderSyncPage(appEl);
        });

        document.getElementById('cloud-disconnect')?.addEventListener('click', () => {
            CloudSync.clearPhrase();
            showToast(t('cloudSyncDisconnected'));
            renderSyncPage(appEl);
        });
    }
}

function renderSyncPage(appEl) {
    appEl.innerHTML = `
        <div class="page">
            <div class="page-header">
                <div class="mascot-container" id="mascot-slot"></div>
                <h1 class="page-title">${t('syncTitle')}</h1>
                <p class="page-subtitle">${t('syncSubtitle')}</p>
            </div>

            ${renderCloudSyncSection()}

            <hr class="cloud-sync-divider">
            <div class="sync-label" style="margin-bottom:12px">${t('manualTransfer')}</div>

            <div class="sync-actions">
                <button class="sync-card" id="sync-export">
                    <span class="sync-card-icon">📤</span>
                    <span class="sync-card-title">${t('exportData')}</span>
                    <span class="sync-card-desc">${t('exportDesc')}</span>
                </button>
                <button class="sync-card" id="sync-import">
                    <span class="sync-card-icon">📥</span>
                    <span class="sync-card-title">${t('importData')}</span>
                    <span class="sync-card-desc">${t('importDesc')}</span>
                </button>
            </div>
            <button class="btn btn-secondary" id="sync-csv">
                <span class="btn-icon">📋</span>
                ${t('exportCSV')}
            </button>
        </div>
    `;

    attachCloudSyncListeners(appEl);
    attachPhraseAutocomplete('cloud-phrase-input');
    document.getElementById('sync-export').addEventListener('click', () => renderExportPage(appEl));
    document.getElementById('sync-import').addEventListener('click', () => renderImportPage(appEl));
    document.getElementById('sync-csv').addEventListener('click', exportCSV);
}

async function renderExportPage(appEl) {
    const sessions = Storage.getAllRaw();
    if (!sessions.filter(s => !s.deletedAt).length) {
        showToast(t('noSessions'));
        return;
    }

    const phrase = generatePhrase();
    let encrypted;
    try {
        const payload = { sessions, active: ActiveState.getForSync() };
        encrypted = await encryptData(JSON.stringify(payload), phrase);
    } catch {
        showToast(t('decryptFailed'));
        return;
    }

    const phraseWords = phrase.split(' ').map(w => `<span class="sync-phrase-word">${w}</span>`).join('');
    const combined = phrase + '|' + encrypted;
    let qrCombined = '';
    try { qrCombined = QR.toSVG(combined, 240); } catch {}

    appEl.innerHTML = `
        <div class="page">
            <div class="page-header">
                <h1 class="page-title">${t('exportData')}</h1>
                <p class="page-subtitle">${t('catPhraseHint')}</p>
            </div>

            ${qrCombined ? `
            <div class="sync-section">
                <div class="sync-qr">
                    ${qrCombined}
                    <div class="sync-qr-label">${t('scanToImport')}</div>
                </div>
            </div>
            ` : ''}

            <div class="sync-section">
                <div class="sync-label">${t('catPhrase')}</div>
                <div class="sync-phrase">
                    <div class="sync-phrase-words">${phraseWords}</div>
                </div>
                <div class="sync-btn-row">
                    <button class="btn btn-secondary" id="copy-phrase">${t('copyPhrase')}</button>
                </div>
            </div>

            <div class="sync-section">
                <div class="sync-label">${t('encryptedData')}</div>
                <textarea class="sync-data-area" readonly id="encrypted-data"></textarea>
                <div class="sync-btn-row">
                    <button class="btn btn-secondary" id="copy-data">${t('copyData')}</button>
                </div>
                <p class="sync-hint">${t('manualDataHint')}</p>
            </div>

            <button class="btn btn-secondary" id="export-back">
                <span class="btn-icon">←</span>
                ${t('back')}
            </button>
        </div>
    `;

    document.getElementById('encrypted-data').value = encrypted;

    document.getElementById('copy-phrase').addEventListener('click', () => {
        navigator.clipboard.writeText(phrase).then(() => showToast(t('copied'))).catch(() => {});
    });
    document.getElementById('copy-data').addEventListener('click', () => {
        navigator.clipboard.writeText(encrypted).then(() => showToast(t('copied'))).catch(() => {});
    });
    document.getElementById('export-back').addEventListener('click', () => renderSyncPage(appEl));
}

function renderImportPage(appEl) {
    // Hidden state — filled by QR scan or manual phrase entry
    let scannedData = '';

    appEl.innerHTML = `
        <div class="page">
            <div class="page-header">
                <h1 class="page-title">${t('importData')}</h1>
                <p class="page-subtitle">${t('enterPhrase')}</p>
            </div>

            <div class="sync-section">
                <div class="sync-btn-row">
                    <button class="btn btn-start" id="scan-qr">
                        <span class="btn-icon">📷</span>
                        ${t('scanQR')}
                    </button>
                </div>
            </div>

            <div class="sync-section">
                <div class="sync-label">${t('catPhrase')}</div>
                <input class="sync-input" type="text" id="import-phrase"
                    placeholder="${t('phrasePlaceholder')}"
                    autocomplete="off" autocapitalize="none" spellcheck="false">
                <p class="sync-hint">${t('manualPhraseHint')}</p>
            </div>

            <div class="sync-section">
                <div class="sync-label">${t('encryptedData')}</div>
                <textarea class="sync-data-area" id="import-data" placeholder="${t('pasteData')}"></textarea>
                <p class="sync-hint">${t('manualDataHint')}</p>
            </div>

            <div class="actions">
                <button class="btn btn-start" id="do-import">
                    <span class="btn-icon">📥</span>
                    ${t('decryptImport')}
                </button>
                <button class="btn btn-secondary" id="import-back">
                    <span class="btn-icon">←</span>
                    ${t('back')}
                </button>
            </div>
        </div>
    `;

    attachPhraseAutocomplete('import-phrase');

    document.getElementById('scan-qr').addEventListener('click', () => {
        openScanner(value => {
            const dataIdx = value.indexOf(DATA_PREFIX);
            if (dataIdx > 0) {
                const phrase = value.substring(0, dataIdx).replace(/[||\n]/g, '').trim();
                const data = value.substring(dataIdx);
                document.getElementById('import-phrase').value = phrase;
                scannedData = data;
                document.getElementById('import-data').value = data;
                showToast(t('qrScanned'));
            } else {
                document.getElementById('import-phrase').value = value;
            }
        });
    });

    document.getElementById('do-import').addEventListener('click', async () => {
        let rawInput = document.getElementById('import-phrase').value.trim();
        let data = scannedData || document.getElementById('import-data').value.replace(/\s/g, '');

        // Handle combined QR content landing in the phrase field
        const lowerInput = rawInput.toLowerCase();
        const hubiIdx = lowerInput.indexOf('hubi2:');
        let rawPhrase;
        if (hubiIdx > 0 && !data) {
            data = rawInput.substring(hubiIdx).replace(/\s/g, '');
            // Normalize prefix to uppercase (e.g. "hubi2:" -> "HUBI2:"), preserve base64 case
            const colonIdx = data.indexOf(':');
            data = data.substring(0, colonIdx).toUpperCase() + data.substring(colonIdx);
            rawPhrase = rawInput.substring(0, hubiIdx).replace(/[|]/g, '').trim().toLowerCase();
        } else {
            rawPhrase = rawInput.toLowerCase();
        }

        const phrase = rawPhrase.split(/\s+/).join(' ');

        if (!validatePhrase(phrase)) {
            showToast(t('invalidPhrase'));
            return;
        }
        if (!data) {
            showToast(t('noData'));
            return;
        }

        let decrypted;
        try {
            decrypted = await decryptData(data, phrase);
        } catch {
            showToast(t('decryptFailed'));
            return;
        }

        let incomingSessions, incomingActive;
        try {
            const parsed = JSON.parse(decrypted);
            // Backwards compat: old exports are plain arrays
            incomingSessions = sanitizeSessions(Array.isArray(parsed) ? parsed : (parsed.sessions || []));
            incomingActive = Array.isArray(parsed) ? null : (parsed.active || null);
        } catch {
            showToast(t('decryptFailed'));
            return;
        }

        const existing = Storage.getAllRaw();
        const { merged, newCount } = mergeSessions(existing, incomingSessions);
        Storage.saveSessions(merged);
        if (incomingActive) ActiveState.applyFromSync(incomingActive);

        if (newCount > 0) {
            showToast(t('importSuccess')(newCount));
        } else {
            showToast(t('importNoNew'));
        }
        renderSyncPage(appEl);
    });

    document.getElementById('import-back').addEventListener('click', () => renderSyncPage(appEl));
}

// Initial sync if previously paired
CloudSync.initialSync();

// Sync when app returns to foreground (covers both tab switches and window focus)
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && CloudSync.isPaired()) {
        CloudSync.sync();
    }
});

return { renderSyncPage, CloudSync };

})();
