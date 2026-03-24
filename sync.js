/* ============================================
   HUBI TIME TRACKER — Sync Module
   ============================================ */

const Sync = (() => {

// ---- Cat Word List (256 words) ----
const WORDS = [
    'whisker', 'purr', 'meow', 'tabby', 'calico', 'kitten', 'nuzzle', 'pounce',
    'yarn', 'tuna', 'catnip', 'snooze', 'stretch', 'tumble', 'fluff', 'mittens',
    'siamese', 'bengal', 'ragdoll', 'sphynx', 'persian', 'claw', 'paw', 'tail',
    'fur', 'belly', 'nose', 'ear', 'scratch', 'groom', 'hiss', 'chirp',
    'trill', 'knead', 'loaf', 'zoomie', 'treat', 'kibble', 'litter', 'collar',
    'bell', 'mouse', 'feather', 'laser', 'box', 'basket', 'perch', 'windowsill',
    'sunbeam', 'cuddle', 'nap', 'prowl', 'stalk', 'leap', 'climb', 'hide',
    'peek', 'blink', 'wink', 'mew', 'mrow', 'yawn', 'arch', 'rub',
    'bump', 'chase', 'catch', 'bat', 'swat', 'roll', 'curl', 'tuck',
    'nestle', 'snuggle', 'cozy', 'warm', 'soft', 'gentle', 'playful', 'lazy',
    'sleepy', 'frisky', 'curious', 'fluffy', 'chonky', 'smol', 'beans', 'toe',
    'whiskers', 'stripe', 'spot', 'patch', 'ginger', 'orange', 'cream', 'smoke',
    'silver', 'marble', 'tortie', 'tuxedo', 'bicolor', 'tabitha', 'felix', 'garfield',
    'muffin', 'biscuit', 'cookie', 'waffle', 'pancake', 'donut', 'cupcake', 'sprinkle',
    'cheddar', 'nacho', 'pretzel', 'olive', 'peach', 'mango', 'lemon', 'clover',
    'daisy', 'poppy', 'luna', 'stella', 'nova', 'misty', 'shadow', 'midnight',
    'ember', 'maple', 'willow', 'sage', 'fern', 'moss', 'pebble', 'brook',
    'rain', 'cloud', 'thunder', 'breeze', 'sunset', 'dawn', 'dusk', 'twilight',
    'starlight', 'moonbeam', 'comet', 'wobble', 'pouncing', 'scamper', 'tumbling', 'prancing',
    'tiptoe', 'slinky', 'velvet', 'plush', 'fuzzy', 'downy', 'silky', 'dapple',
    'freckle', 'speckle', 'blaze', 'rusty', 'sandy', 'dusty', 'smoky', 'inky',
    'sooty', 'cocoa', 'mocha', 'latte', 'espresso', 'truffle', 'nutmeg', 'cinnamon',
    'paprika', 'saffron', 'pepper', 'basil', 'thyme', 'rosemary', 'clove', 'fennel',
    'bramble', 'thistle', 'ivy', 'juniper', 'cedar', 'aspen', 'birch', 'rowan',
    'hazel', 'acorn', 'chestnut', 'walnut', 'almond', 'cobalt', 'indigo', 'scarlet',
    'amber', 'coral', 'jade', 'pearl', 'opal', 'ruby', 'onyx', 'flint',
    'pudding', 'crumpet', 'scone', 'toffee', 'fudge', 'taffy', 'jellybean', 'gumdrop',
    'marzipan', 'nougat', 'caramel', 'butterscotch', 'licorice', 'marshmallow', 'bonbon', 'praline',
    'bobcat', 'lynx', 'ocelot', 'panther', 'cougar', 'cheetah', 'jaguar', 'leopard',
    'tiger', 'lion', 'caracal', 'serval', 'manx', 'birman', 'abyssinian', 'burmese',
    'chartreux', 'cymric', 'havana', 'korat', 'nebelung', 'ocicat', 'pixie', 'savannah',
    'snowshoe', 'tonkinese', 'sphinx', 'munchkin', 'bambino', 'lykoi', 'devon', 'siberian',
];

const SALT = new TextEncoder().encode('hubi-cat-sync');
const DATA_PREFIX = 'HUBI1:';

// ---- Crypto Helpers ----

async function deriveKey(phrase) {
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(phrase),
        'PBKDF2',
        false,
        ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: SALT, iterations: 100000, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
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
    const key = await deriveKey(phrase);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        new TextEncoder().encode(text)
    );
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), iv.length);
    return DATA_PREFIX + bytesToBase64(combined);
}

async function decryptData(blob, phrase) {
    if (!blob.startsWith(DATA_PREFIX)) throw new Error('Invalid data format');
    const raw = blob.slice(DATA_PREFIX.length);
    const bytes = base64ToBytes(raw);
    const iv = bytes.slice(0, 12);
    const ciphertext = bytes.slice(12);
    const key = await deriveKey(phrase);
    const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertext
    );
    return new TextDecoder().decode(plain);
}

// ---- Phrase Generation ----

function generatePhrase() {
    const indices = crypto.getRandomValues(new Uint8Array(12));
    return Array.from(indices, i => WORDS[i]).join(' ');
}

function validatePhrase(phrase) {
    const words = phrase.trim().toLowerCase().split(/\s+/);
    if (words.length !== 12) return false;
    return words.every(w => WORDS.includes(w));
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

    const rows = [['Date', 'Start Time', 'End Time', 'Work Duration', 'Break Duration', 'Total Duration']];

    for (const s of sessions) {
        const start = new Date(s.startTime);
        const end = new Date(s.endTime);
        const dateStr = `${start.getFullYear()}-${padTwo(start.getMonth() + 1)}-${padTwo(start.getDate())}`;
        const startTime = `${padTwo(start.getHours())}:${padTwo(start.getMinutes())}`;
        const endTime = `${padTwo(end.getHours())}:${padTwo(end.getMinutes())}`;
        const work = fmtDuration(s.totalWork || 0);
        const brk = fmtDuration(s.totalBreak || 0);
        const total = fmtDuration((s.totalWork || 0) + (s.totalBreak || 0));
        rows.push([dateStr, startTime, endTime, work, brk, total]);
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
    for (const s of incoming) {
        const have = map.get(s.id);
        if (!have) {
            map.set(s.id, s);
            newCount++;
        } else if (s.endTime && (!have.endTime || s.endTime > have.endTime)) {
            map.set(s.id, s);
        }
    }

    const merged = Array.from(map.values());
    merged.sort((a, b) => b.startTime - a.startTime);
    return { merged, newCount };
}

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
        <video autoplay playsinline style="width:100%;max-height:80vh;object-fit:cover;"></video>
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
        .catch(() => {
            cleanup();
            showToast(t('qrScanNotSupported'));
        });
}

// ---- Page Rendering ----

function renderSyncPage(appEl) {
    appEl.innerHTML = `
        <div class="page">
            <div class="page-header">
                <div class="mascot-container" id="mascot-slot"></div>
                <h1 class="page-title">${t('syncTitle')}</h1>
                <p class="page-subtitle">${t('syncSubtitle')}</p>
            </div>
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

    document.getElementById('sync-export').addEventListener('click', () => renderExportPage(appEl));
    document.getElementById('sync-import').addEventListener('click', () => renderImportPage(appEl));
    document.getElementById('sync-csv').addEventListener('click', exportCSV);
}

async function renderExportPage(appEl) {
    const sessions = Storage.getSessions();
    if (!sessions.length) {
        showToast(t('noSessions'));
        return;
    }

    const phrase = generatePhrase();
    let encrypted;
    try {
        encrypted = await encryptData(JSON.stringify(sessions), phrase);
    } catch {
        showToast(t('decryptFailed'));
        return;
    }

    const phraseWords = phrase.split(' ').map(w => `<span class="sync-phrase-word">${w}</span>`).join('');
    let qrPhrase = '';
    try { qrPhrase = QR.toSVG(phrase, 200); } catch {}
    let qrData = '';
    if (encrypted.length <= 250) {
        try { qrData = QR.toSVG(encrypted, 200); } catch {}
    }

    appEl.innerHTML = `
        <div class="page">
            <div class="page-header">
                <h1 class="page-title">${t('exportData')}</h1>
                <p class="page-subtitle">${t('catPhraseHint')}</p>
            </div>

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
                <div class="sync-qr">
                    ${qrPhrase}
                    <div class="sync-qr-label">${t('phraseQR')}</div>
                </div>
            </div>

            <div class="sync-section">
                <div class="sync-label">${t('encryptedData')}</div>
                <textarea class="sync-data-area" readonly id="encrypted-data">${encrypted}</textarea>
                <div class="sync-btn-row">
                    <button class="btn btn-secondary" id="copy-data">${t('copyData')}</button>
                </div>
            </div>

            ${qrData ? `
            <div class="sync-section">
                <div class="sync-qr">
                    ${qrData}
                    <div class="sync-qr-label">${t('dataQR')}</div>
                </div>
            </div>
            ` : ''}

            <button class="btn btn-secondary" id="export-back">
                <span class="btn-icon">←</span>
                ${t('back')}
            </button>
        </div>
    `;

    document.getElementById('copy-phrase').addEventListener('click', () => {
        navigator.clipboard.writeText(phrase).then(() => showToast(t('copied')));
    });
    document.getElementById('copy-data').addEventListener('click', () => {
        navigator.clipboard.writeText(encrypted).then(() => showToast(t('copied')));
    });
    document.getElementById('export-back').addEventListener('click', () => renderSyncPage(appEl));
}

function renderImportPage(appEl) {
    appEl.innerHTML = `
        <div class="page">
            <div class="page-header">
                <h1 class="page-title">${t('importData')}</h1>
                <p class="page-subtitle">${t('enterPhrase')}</p>
            </div>

            <div class="sync-section">
                <div class="sync-label">${t('catPhrase')}</div>
                <input class="sync-input" type="text" id="import-phrase"
                    placeholder="${t('phrasePlaceholder')}"
                    autocomplete="off" autocapitalize="none" spellcheck="false">
                <div class="sync-btn-row">
                    <button class="btn btn-secondary" id="scan-qr">
                        <span class="btn-icon">📷</span>
                        ${t('scanQR')}
                    </button>
                </div>
            </div>

            <div class="sync-section">
                <div class="sync-label">${t('encryptedData')}</div>
                <textarea class="sync-data-area" id="import-data" placeholder="${t('pasteData')}"></textarea>
                <div class="sync-btn-row">
                    <button class="btn btn-secondary" id="scan-data-qr">
                        <span class="btn-icon">📷</span>
                        ${t('scanQR')}
                    </button>
                </div>
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

    document.getElementById('scan-qr').addEventListener('click', () => {
        openScanner(value => {
            document.getElementById('import-phrase').value = value;
        });
    });

    document.getElementById('scan-data-qr').addEventListener('click', () => {
        openScanner(value => {
            document.getElementById('import-data').value = value;
        });
    });

    document.getElementById('do-import').addEventListener('click', async () => {
        const rawPhrase = document.getElementById('import-phrase').value.trim().toLowerCase();
        const phrase = rawPhrase.split(/\s+/).join(' ');
        const data = document.getElementById('import-data').value.replace(/\s/g, '');

        console.log('[sync] phrase words:', phrase.split(' ').length, '| data length:', data.length, '| data prefix:', data.substring(0, 10));

        if (!validatePhrase(phrase)) {
            showToast(t('invalidPhrase'));
            return;
        }
        if (!data) {
            showToast('No data pasted');
            return;
        }

        let decrypted;
        try {
            decrypted = await decryptData(data, phrase);
        } catch (e) {
            console.error('[sync] decrypt error:', e);
            showToast(t('decryptFailed'));
            return;
        }

        let incoming;
        try {
            incoming = JSON.parse(decrypted);
            if (!Array.isArray(incoming)) throw new Error('not an array');
        } catch (e) {
            console.error('[sync] parse error:', e);
            showToast(t('decryptFailed'));
            return;
        }

        const existing = Storage.getSessions();
        const { merged, newCount } = mergeSessions(existing, incoming);
        Storage.saveSessions(merged);

        if (newCount > 0) {
            showToast(t('importSuccess')(newCount));
        } else {
            showToast(t('importNoNew'));
        }
        renderSyncPage(appEl);
    });

    document.getElementById('import-back').addEventListener('click', () => renderSyncPage(appEl));
}

return { renderSyncPage };

})();
