# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Hubi Time Tracker" -- a cat-themed PWA for tracking work hours. Pure vanilla JS, no build tools, no framework, no package manager. Static files served directly.

## Development

Open `index.html` in a browser. No build step, no dev server required. For service worker testing, use a local HTTP server (e.g., `python3 -m http.server 8000`).

## Deployment

Pushes to `main` auto-deploy to GitHub Pages via `.github/workflows/deploy.yml`. The workflow uploads the entire repo root as a static site.

## Architecture

- `index.html` -- shell with bottom nav (timer/history/stats tabs), loads everything else
- `i18n.js` -- internationalization module. Detects browser locale, falls back to English. Exposes `I18n.t(key)`, `I18n.getLocale()`, and `I18n.lang`. Currently supports `en` and `de`.
- `app.js` -- all app logic: SPA routing, timer, session management, history, stats. Renders pages by replacing `#app` innerHTML. No framework, no components, just functions. All user-facing strings go through `t()` from `i18n.js`.
- `pet.js` -- `HubiPet` class: a roaming cat sprite that walks, sleeps, eats, and chases toys around the screen. Independent of app logic. On page load the pet starts sitting in the header mascot slot, then jumps down in a parabolic arc. It avoids UI elements by computing safe zones (left/right/below the `#app` content column).
- `styles.css` -- app styles
- `pet.css` -- CSS-only cat sprite and pet animations
- `sw.js` -- service worker for offline caching. Bump `CACHE_NAME` version when changing cached assets.
- `manifest.json` -- PWA manifest

## Data layer

All data lives in `localStorage`:
- `hubi_sessions` -- array of completed session records (work/break durations, timestamps)
- `hubi_active_state` -- current in-progress timer state (survives page refresh)

`Storage` and `ActiveState` objects in `app.js` are the only access points for persisted data.

## Internationalization

Language is auto-detected from `navigator.language` at page load. No user toggle -- follows the device/browser language. `i18n.js` loads before `app.js` and sets `<html lang>` dynamically. Static nav labels use `data-i18n` attributes. All other strings use `t('key')` calls in template literals.

To add a new language: add a translation object to the `translations` map in `i18n.js` keyed by ISO 639-1 code (e.g., `fr`). The fallback chain is: detected language -> `en`.

## Key patterns

- Pages render by replacing `appEl.innerHTML` with template literal HTML, then attaching event listeners imperatively. There is no virtual DOM or diffing.
- The timer page has three render states: idle, active (working/on-break), and session summary.
- `window.getHubiCatHTML()` generates the CSS cat markup. Only one cat instance exists at a time -- the roaming pet. Pages no longer render static mascot cats; they use an empty `#mascot-slot` div to reserve header space.
- The "Pawsome!" button text is always in English, never translated.
