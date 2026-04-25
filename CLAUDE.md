# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Hubi Time Tracker" -- a cat-themed PWA for tracking work hours with task categories. Pure vanilla JS, no build tools, no framework, no package manager. Static files served directly.

## Development

Open `index.html` in a browser. No build step, no dev server required. For service worker testing or the dev menu, use a local HTTP server (e.g., `python3 -m http.server 8000`). The dev menu auto-loads on localhost and provides buttons to trigger each pet animation state and the treat sequence.

## Hosting & Deployment

The app is hosted at `https://hubi.work`. Domain is registered via Cloudflare Registrar, DNS points to GitHub Pages (A records, DNS-only / not proxied).

- **Frontend**: GitHub Pages. Pushes to `main` auto-deploy via `.github/workflows/deploy.yml`. The `pages` job removes dev-only files (`dev.js`) and the `worker/` directory, then uploads the repo root as a static site. The `CNAME` file in the repo root tells GitHub Pages to serve on `hubi.work`.
- **Sync API**: Cloudflare Worker at `sync.hubi.work` (custom domain on the worker). The `worker` job in the same workflow deploys via `cloudflare/wrangler-action`. Requires `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as GitHub repo secrets.

## Architecture

- `index.html` -- shell with bottom nav (timer/history/stats/sync tabs), loads everything else
- `i18n.js` -- internationalization module. Detects browser locale, falls back to English. Exposes `I18n.t(key)`, `I18n.getLocale()`, and `I18n.lang`. Currently supports `en` and `de`.
- `app.js` -- all app logic: SPA routing, timer, session management, history, stats, task categories. Renders pages by replacing `#app` innerHTML. No framework, no components, just functions. All user-facing strings go through `t()` from `i18n.js`. Defines `TASK_CATEGORIES` (arbeiten, lernen, putzen, entspannen, kochen, sport, kreativ, einkaufen) and `TASK_COLORS`. The idle timer page embeds a slot-machine reel in the title text for task selection (scroll/swipe/click to cycle). Stats page shows per-task time breakdown.
- `pet.js` -- `HubiPet` class: a roaming cat sprite that walks, sleeps, eats, and chases toys around the screen. On page load the pet starts sitting in the header mascot slot, then jumps down in a parabolic arc. It avoids UI elements by computing safe zones (left/right/below the `#app` content column). The cat is interactive -- clicking/tapping the sprite triggers a "petted" reaction (nuzzle, purr squish, heart float, ears perk up) and has a 50% chance of playing a random meow sound from `assets/meow{1,2,3}.mp3`. While in the mascot slot, Hubi reacts to task reel scrolling with per-task preview animations and props (e.g. book for lernen, chef hat for kochen, easel for kreativ, shopping cart for einkaufen). She hides from the mascot slot when navigating away from the timer page.
- `styles.css` -- app styles
- `pet.css` -- CSS-only cat sprite and pet animations (idle, walking, sleeping, eating, chasing, petted, treat, plus per-task preview poses with props)
- `dev.js` -- dev menu for testing animations. Localhost-only (conditionally loaded via `index.html`), excluded from deploy by the GitHub Actions workflow. Floating draggable panel with buttons for each animation state + treat trigger/reset.
- `sync.js` -- cross-device sync module. Two sync modes:
  - **Cloud Sync**: event-driven sync via Cloudflare Workers + KV. A `CloudSync` object manages pairing (phrase stored in localStorage) and sync triggers: monkey-patched `Storage.saveSessions`/`ActiveState.set`/`ActiveState.clear` set a dirty flag and schedule a debounced push; `visibilitychange` triggers a pull (push only if dirty); page load triggers an initial sync. No polling interval. The channel ID is derived as SHA-256("channel:" + phrase), separate from the encryption key derivation. The worker at `sync.hubi.work` is a dumb PUT/GET relay (30-day TTL, 512KB max). E2E encrypted -- the worker only sees opaque blobs. The active in-progress timer state is also sync'd, including a tombstone (`hubi_active_cleared_at`) so a clear on one device propagates instead of being resurrected by an older state from another device.
  - **QR/Manual Sync**: one-shot transfer. Export generates a combined QR code (phrase + encrypted data) that the importing device scans. Manual fallback: copy phrase + encrypted blob separately.
  - Encrypts sessions with AES-256-GCM (Web Crypto API, PBKDF2 key derivation with random salt) using a 12-word cat-themed seed phrase (256-word vocabulary, no prefix-ambiguous pairs, all 12 words unique per phrase). Export format is HUBI2 (random per-export PBKDF2 salt). Phrase inputs have wallet-style autocomplete (type a few chars, dropdown suggests matching words). Also provides CSV export. Merge logic deduplicates sessions by ID using `updatedAt` as the conflict tiebreaker (every mutation in `Storage.addSession`/`deleteSession`/edit stamps `updatedAt`); legacy sessions without `updatedAt` fall back to keeping the later `endTime`. Deletions are soft via a `deletedAt` tombstone so deletes propagate across devices. Imported sessions are sanitized (type-checked, fields whitelist-mapped including `task`, `updatedAt`, `deletedAt`) via `sanitizeSessions()` before storage.
- `worker/` -- Cloudflare Worker for cloud sync relay + metrics. `wrangler.toml` + `src/index.js`. Deployed to `sync.hubi.work`. KV namespace `SYNC_KV` stores encrypted blobs keyed by 64-char hex channel IDs. CORS restricted to `hubi.work` + localhost. Rate-limited at the edge via Cloudflare WAF rule (5 PUT/10s per IP). Validates PUT body starts with `HUBI2:` and enforces 512KB size limit.
  - **Metrics & analytics**: The worker tracks three types of metrics, all stored as daily KV buckets:
    - `_m:YYYY-MM-DD` -- sync request counters (GET/PUT, KV hits/misses, errors, bytes, unique channel prefixes). Updated via `ctx.waitUntil()` on each sync request.
    - `_b:YYYY-MM-DD` -- page view beacon data (total views, unique visitors via SHA-256 hashed IP rotated daily, per-tab view counts). Fed by `navigator.sendBeacon()` from the frontend on page load and tab navigation (skipped on localhost).
    - Cloudflare zone analytics -- fetched on demand from Cloudflare's GraphQL API (`httpRequests1dGroups`) for edge-level stats (total requests, status codes, bandwidth, WAF threats).
  - **Grafana integration**: Exposes `/grafana/api` (GET, API key auth via `METRICS_KEY` secret) returning flat JSON rows for the Infinity datasource. Query params: `metrics` (comma-separated metric names), `from`/`to` (YYYY-MM-DD). Also retains the `/grafana/search` and `/grafana/query` endpoints (Simple JSON protocol). Dashboard provisioned on a self-hosted Grafana instance.
  - **Worker secrets** (set via Cloudflare dashboard or `wrangler secret put`): `METRICS_KEY` (shared auth key for Grafana), `CF_API_TOKEN` (Cloudflare API token with Zone > Analytics > Read), `CF_ZONE_ID` (hubi.work zone ID). Local dev equivalents in `worker/.dev.vars` (gitignored), template in `worker/.dev.vars.example`.
- `qrcodegen.js` -- Project Nayuki's QR Code generator library v1.8.0 (MIT). Used by `qr.js`.
- `qr.js` -- thin SVG wrapper around `qrcodegen.js`. Exposes `QR.toSVG(text, size)`.
- `sw.js` -- service worker for offline caching. `CACHE_NAME` is auto-stamped with the commit SHA at deploy time (see `deploy.yml`), so no manual version bumps needed.
- `manifest.json` -- PWA manifest

## Data layer

All data lives in `localStorage`:
- `hubi_sessions` -- array of session records (work/break durations, timestamps, task category, `updatedAt`, optional `deletedAt` tombstone). `Storage.getSessions()` filters out tombstoned entries; `Storage.getAllRaw()` returns the full array (used by sync).
- `hubi_active_state` -- current in-progress timer state (survives page refresh, includes `updatedAt` for cross-device merge).
- `hubi_active_cleared_at` -- timestamp of the last `ActiveState.clear()`. Used as a tombstone so a stop on device A is not undone by an older active state pulled from device B.
- `hubi_treat_date` -- ISO date string of last treat given (prevents multiple treats per day).
- `hubi_sync_phrase` -- stored cloud sync phrase (present when paired).
- `hubi_sync_last` -- ISO timestamp of last successful cloud sync.

`Storage` and `ActiveState` objects in `app.js` are the only access points for session/timer data. Every mutating path stamps `updatedAt`; preserve that when adding new mutation sites or sync will silently lose the edit. Cloud sync keys are managed by the `CloudSync` object in `sync.js`.

Tombstones expire so they don't grow unboundedly: `pruneLocal()` in `sync.js` drops `deletedAt` sessions older than 60 days and clears `hubi_active_cleared_at` after 30 days (when no active state is set). It runs at startup, and `mergeSessions()` also drops stale tombstones from both sides during sync. The 30-day floor for `hubi_active_cleared_at` is tied to the worker's KV TTL — a peer that hasn't synced in 30+ days can't pull a stale active state to resurrect anyway.

## Internationalization

Language is auto-detected from `navigator.language` at page load. No user toggle -- follows the device/browser language. `i18n.js` loads before `app.js` and sets `<html lang>` dynamically. Static nav labels use `data-i18n` attributes. All other strings use `t('key')` calls in template literals.

To add a new language: add a translation object to the `translations` map in `i18n.js` keyed by ISO 639-1 code (e.g., `fr`). The fallback chain is: detected language -> `en`.

## Key patterns

- Pages render by replacing `appEl.innerHTML` with template literal HTML, then attaching event listeners imperatively. There is no virtual DOM or diffing. User-sourced data (e.g. imported session IDs) is escaped via `escapeAttr()` before insertion into attributes.
- The timer page has three render states: idle (with task reel selector), active (working/on-break), and session summary.
- `window.getHubiCatHTML()` generates the CSS cat markup. Only one cat instance exists at a time -- the roaming pet. Pages no longer render static mascot cats; they use an empty `#mascot-slot` div to reserve header space.
- The "Pawsome!" button text is always in English, never translated.
- A Content-Security-Policy meta tag in `index.html` restricts resource origins. The `script-src` includes a sha256 hash for the inline dev.js loader script (lines 51-57). If that inline script changes, the hash must be regenerated (`echo -n '<script content>' | openssl dgst -sha256 -binary | base64`) and updated in the CSP.
- Fonts are self-hosted in `assets/fonts/` (Nunito woff2). No external CDN dependencies.
- The CSP `connect-src` directive allows fetches to `https://sync.hubi.work` for cloud sync.
