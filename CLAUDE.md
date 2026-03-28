# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Hubi Time Tracker" -- a cat-themed PWA for tracking work hours. Pure vanilla JS, no build tools, no framework, no package manager. Static files served directly.

## Development

Open `index.html` in a browser. No build step, no dev server required. For service worker testing or the dev menu, use a local HTTP server (e.g., `python3 -m http.server 8000`). The dev menu auto-loads on localhost and provides buttons to trigger each pet animation state and the treat sequence.

## Deployment

Pushes to `main` auto-deploy to GitHub Pages via `.github/workflows/deploy.yml`. The workflow removes dev-only files (`dev.js`) then uploads the repo root as a static site.

## Architecture

- `index.html` -- shell with bottom nav (timer/history/stats/sync tabs), loads everything else
- `i18n.js` -- internationalization module. Detects browser locale, falls back to English. Exposes `I18n.t(key)`, `I18n.getLocale()`, and `I18n.lang`. Currently supports `en` and `de`.
- `app.js` -- all app logic: SPA routing, timer, session management, history, stats. Renders pages by replacing `#app` innerHTML. No framework, no components, just functions. All user-facing strings go through `t()` from `i18n.js`.
- `pet.js` -- `HubiPet` class: a roaming cat sprite that walks, sleeps, eats, and chases toys around the screen. Independent of app logic. On page load the pet starts sitting in the header mascot slot, then jumps down in a parabolic arc. It avoids UI elements by computing safe zones (left/right/below the `#app` content column). The cat is interactive -- clicking/tapping the sprite triggers a "petted" reaction (nuzzle, purr squish, heart float, ears perk up) and has a 50% chance of playing a random meow sound from `assets/meow{1,2,3}.mp3`.
- `styles.css` -- app styles
- `pet.css` -- CSS-only cat sprite and pet animations (idle, walking, sleeping, eating, chasing, petted, treat)
- `dev.js` -- dev menu for testing animations. Localhost-only (conditionally loaded via `index.html`), excluded from deploy by the GitHub Actions workflow. Floating draggable panel with buttons for each animation state + treat trigger/reset.
- `sync.js` -- cross-device sync module. Encrypts sessions with AES-256-GCM (Web Crypto API, PBKDF2 key derivation with random salt) using a 12-word cat-themed seed phrase (256-word vocabulary, 96 bits entropy). Current export format is HUBI2 (random per-export PBKDF2 salt); import still accepts legacy HUBI1 (static salt). Export generates a combined QR code (phrase + encrypted data) that the importing device scans in one shot. Manual fallback: copy phrase + encrypted blob separately. Also provides CSV export. Merge logic deduplicates sessions by ID, keeps later `endTime`. Imported sessions are sanitized (type-checked, fields whitelist-mapped) before storage.
- `qrcodegen.js` -- Project Nayuki's QR Code generator library v1.8.0 (MIT). Used by `qr.js`.
- `qr.js` -- thin SVG wrapper around `qrcodegen.js`. Exposes `QR.toSVG(text, size)`.
- `sw.js` -- service worker for offline caching. Bump `CACHE_NAME` version when changing cached assets.
- `manifest.json` -- PWA manifest

## Data layer

All data lives in `localStorage`:
- `hubi_sessions` -- array of completed session records (work/break durations, timestamps)
- `hubi_active_state` -- current in-progress timer state (survives page refresh)
- `hubi_treat_date` -- ISO date string of last treat given (prevents multiple treats per day)

`Storage` and `ActiveState` objects in `app.js` are the only access points for persisted data.

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
