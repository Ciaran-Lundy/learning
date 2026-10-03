# Build plan: "SecureDesk Study" — offline Android PWA

Hand this file and `days.json` to Claude Code. Put both in an empty repo first.

## Goal

An installable Android PWA for a 21-day study program. One 15-minute session per morning, often offline (travelling). Content comes from `days.json`; the app must not hardcode it.

## Hard constraints

- Vanilla HTML/CSS/JS. No framework, no bundler, no build step, no npm dependencies.
- Fully offline after first load. Target: Chrome on Android.
- Hosted on GitHub Pages (HTTPS). Must work under a repo subpath (`/<repo>/`), so use relative paths everywhere, including the manifest `start_url`/`scope` and the service worker registration.
- No accounts, no backend, no analytics, no network calls after install.
- Mobile-first, 360px width minimum, dark mode via `prefers-color-scheme`, large tap targets.

## Files

```
index.html
styles.css
app.js
sw.js
manifest.webmanifest
days.json          (provided — do not edit structure)
icons/icon-192.png, icons/icon-512.png, icons/icon-maskable-512.png
```

Generate simple icons yourself (e.g. a bold "SD" monogram on a solid colour) from an SVG via a one-off script. Do not commit the script.

## Features (in priority order — stop after 1–5 if time is short)

1. **Today screen (default view).** Shows the first day not marked done: day number, "Day X of 21", week title, Learn, Decide, Resource. A notes textarea under Decide, autosaved on input (debounced ~500ms). A "Mark done" button that advances to the next day.
2. **Progress.** Show a count of completed days and a thin progress bar. No streaks, no dates, no "you missed a day" messaging. Days are units, not calendar dates.
3. **All days view.** 21 days grouped by week, each with a done tick. Tap to open any day (read and edit notes). Allow un-marking done.
4. **Persistence.** localStorage, one key, JSON: `{ version: 1, done: {[day]: true}, notes: {[day]: string} }`. On first load call `navigator.storage.persist()`.
5. **Export / import.**
   - "Export notes" builds a Markdown file: one `## Day N — <learn>` section per day with its Decide prompt and notes. Use the Web Share API with a file if `navigator.canShare({files})` is true, otherwise trigger a download.
   - "Backup" and "Restore" do the same with the raw JSON state. Validate on restore and refuse bad JSON with a clear message.
6. **Bus-day mode.** A small "Next day" link on the Today screen after marking done, so several days can be done in one sitting.

Out of scope: push notifications or reminders. PWAs can't schedule local notifications without a push server. The user will use a phone alarm.

## Offline / service worker

- Precache every file listed above on `install`. Serve cache-first, with network fallback.
- Version the cache name (`sd-v1`). On `activate`, delete old caches.
- When a new service worker is waiting, show a small "Update available — reload" banner. Do not auto-reload, because it could lose typed notes. Flush pending note saves before reloading.

## Manifest

`name`, `short_name` ("SD Study"), `display: standalone`, `start_url: "./"`, `scope: "./"`, `theme_color`, `background_color`, and the three icons, with the maskable one marked `purpose: "maskable"`.

## Acceptance checks (run these, report results)

1. Serve locally (`python3 -m http.server`). Chrome DevTools → Application: the manifest has no errors, the service worker is activated, and the app is installable.
2. DevTools → Network → Offline, then hard reload: the app fully works.
3. Type notes, reload: the notes persist. Mark days done, reload: progress persists.
4. Export Markdown and Backup JSON, clear site data, Restore: the state is back.
5. Bump the cache to `sd-v2`, reload: the update banner appears, and accepting it doesn't lose an unsaved note.
6. Works when served from a subpath (`python3 -m http.server` from the parent folder, open `/<folder>/`).

## Deploy

1. Push to a GitHub repo.
2. Settings → Pages → deploy from `main`, root folder.
3. On the phone: open the Pages URL in Chrome → menu → **Install app**. Then open it once with signal, so it caches.

## Changing content later

Edit `days.json`, bump the cache version in `sw.js`, then push. The app shows the update banner on next open.
