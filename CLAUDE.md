# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Hubi Time Tracker" -- a cat-themed PWA for tracking work hours. Pure vanilla JS, no build tools, no framework, no package manager. Static files served directly.

## Development

Open `index.html` in a browser. No build step, no dev server required. For service worker testing or the dev menu, use a local HTTP server (e.g., `python3 -m http.server 8000`). The dev menu auto-loads on localhost and provides buttons to trigger each pet animation state and the treat sequence.

## Hosting & Deployment

The app is hosted at `https://hubi.work`. Domain is registered via Cloudflare Registrar, DNS points to GitHub Pages (A records, DNS-only / not proxied).

- **Frontend**: GitHub Pages. Pushes to `main` auto-deploy via `.github/workflows/deploy.yml`. The workflow removes dev-only files (`dev.js`) and the `worker/` directory, then uploads the repo root as a static site. The `CNAME` file in the repo root tells GitHub Pages to serve on `hubi.work`.
- **Sync API**: Cloudflare Worker at `sync.hubi.work` (custom domain on the worker). Deployed separately via `wrangler deploy` from the `worker/` directory.

## Architecture

- `index.html` -- shell with bottom nav (timer/history/stats/sync tabs), loads everything else
- `i18n.js` -- internationalization module. Detects browser locale, falls back to English. Exposes `I18n.t(key)`, `I18n.getLocale()`, and `I18n.lang`. Currently supports `en` and `de`.
- `app.js` -- all app logic: SPA routing, timer, session management, history, stats. Renders pages by replacing `#app` innerHTML. No framework, no components, just functions. All user-facing strings go through `t()` from `i18n.js`.
- `pet.js` -- `HubiPet` class: a roaming cat sprite that walks, sleeps, eats, and chases toys around the screen. Independent of app logic. On page load the pet starts sitting in the header mascot slot, then jumps down in a parabolic arc. It avoids UI elements by computing safe zones (left/right/below the `#app` content column). The cat is interactive -- clicking/tapping the sprite triggers a "petted" reaction (nuzzle, purr squish, heart float, ears perk up) and has a 50% chance of playing a random meow sound from `assets/meow{1,2,3}.mp3`.
- `styles.css` -- app styles
- `pet.css` -- CSS-only cat sprite and pet animations (idle, walking, sleeping, eating, chasing, petted, treat)
- `dev.js` -- dev menu for testing animations. Localhost-only (conditionally loaded via `index.html`), excluded from deploy by the GitHub Actions workflow. Floating draggable panel with buttons for each animation state + treat trigger/reset.
- `sync.js` -- cross-device sync module. Two sync modes:
  - **Cloud Sync**: event-driven sync via Cloudflare Workers + KV. A `CloudSync` object manages pairing (phrase stored in localStorage) and sync triggers: monkey-patched `Storage.saveSessions`/`ActiveState.set`/`ActiveState.clear` set a dirty flag and schedule a debounced push; `visibilitychange` triggers a pull (push only if dirty); page load triggers an initial sync. No polling interval. The channel ID is derived as SHA-256("channel:" + phrase), separate from the encryption key derivation. The worker at `sync.hubi.work` is a dumb PUT/GET relay (30-day TTL, 512KB max). E2E encrypted -- the worker only sees opaque blobs.
  - **QR/Manual Sync**: one-shot transfer. Export generates a combined QR code (phrase + encrypted data) that the importing device scans. Manual fallback: copy phrase + encrypted blob separately.
  - Encrypts sessions with AES-256-GCM (Web Crypto API, PBKDF2 key derivation with random salt) using a 12-word cat-themed seed phrase (256-word vocabulary, no prefix-ambiguous pairs, 96 bits entropy). Export format is HUBI2 (random per-export PBKDF2 salt). Phrase inputs have wallet-style autocomplete (type a few chars, dropdown suggests matching words). Also provides CSV export. Merge logic deduplicates sessions by ID, keeps later `endTime`. Imported sessions are sanitized (type-checked, fields whitelist-mapped) via `sanitizeSessions()` before storage.
- `worker/` -- Cloudflare Worker for cloud sync relay. `wrangler.toml` + `src/index.js`. Deployed to `sync.hubi.work`. KV namespace `SYNC_KV` stores encrypted blobs keyed by 64-char hex channel IDs. CORS restricted to `hubi.work` + localhost. Rate-limited (10 writes/min per channel). Validates PUT body starts with `HUBI2:` and enforces 512KB size limit.
- `qrcodegen.js` -- Project Nayuki's QR Code generator library v1.8.0 (MIT). Used by `qr.js`.
- `qr.js` -- thin SVG wrapper around `qrcodegen.js`. Exposes `QR.toSVG(text, size)`.
- `sw.js` -- service worker for offline caching. Bump `CACHE_NAME` version when changing cached assets.
- `manifest.json` -- PWA manifest

## Data layer

All data lives in `localStorage`:
- `hubi_sessions` -- array of completed session records (work/break durations, timestamps)
- `hubi_active_state` -- current in-progress timer state (survives page refresh)
- `hubi_treat_date` -- ISO date string of last treat given (prevents multiple treats per day)
- `hubi_sync_phrase` -- stored cloud sync phrase (present when paired)
- `hubi_sync_last` -- ISO timestamp of last successful cloud sync

`Storage` and `ActiveState` objects in `app.js` are the only access points for session/timer data. Cloud sync keys are managed by the `CloudSync` object in `sync.js`.

## Internationalization

Language is auto-detected from `navigator.language` at page load. No user toggle -- follows the device/browser language. `i18n.js` loads before `app.js` and sets `<html lang>` dynamically. Static nav labels use `data-i18n` attributes. All other strings use `t('key')` calls in template literals.

To add a new language: add a translation object to the `translations` map in `i18n.js` keyed by ISO 639-1 code (e.g., `fr`). The fallback chain is: detected language -> `en`.

## Key patterns

- Pages render by replacing `appEl.innerHTML` with template literal HTML, then attaching event listeners imperatively. There is no virtual DOM or diffing. User-sourced data (e.g. imported session IDs) is escaped via `escapeAttr()` before insertion into attributes.
- The timer page has three render states: idle, active (working/on-break), and session summary.
- `window.getHubiCatHTML()` generates the CSS cat markup. Only one cat instance exists at a time -- the roaming pet. Pages no longer render static mascot cats; they use an empty `#mascot-slot` div to reserve header space.
- The "Pawsome!" button text is always in English, never translated.
- A Content-Security-Policy meta tag in `index.html` restricts resource origins. The `script-src` includes a sha256 hash for the inline dev.js loader script (lines 51-57). If that inline script changes, the hash must be regenerated (`echo -n '<script content>' | openssl dgst -sha256 -binary | base64`) and updated in the CSP.
- Fonts are self-hosted in `assets/fonts/` (Nunito woff2). No external CDN dependencies.
- The CSP `connect-src` directive allows fetches to `https://sync.hubi.work` for cloud sync.
