# ChankArts Metronome — Web (PWA)

Browser version of the ChankArts Metronome Android app.
No app store, no Play Store, no ads — a plain static site that works offline.

**Live preview:** https://chanakyashukla.github.io/chankarts-metronome-web/
**Repository:** https://github.com/chanakyashukla/chankarts-metronome-web
**Production target:** https://chankarts.com/metronome

Built from the Flutter source in
`ChankArts Metronome App Backup / ChankArtsMetronome_ColdBox_2026_03_17 / Editable_Project_Snapshot`.

## What's inside

```
chankarts-metronome-web/
├── index.html            app markup (splash + metronome screens)
├── styles.css            styling mirrored 1:1 from the Flutter widgets
├── app.js                metronome logic (Web Audio lookahead scheduler)
├── manifest.webmanifest  PWA manifest (installable, standalone window)
├── sw.js                 service worker (full offline support)
└── assets/
    ├── sounds/           click_strong.wav, click_regular.wav (from the app)
    └── images/           logos + PWA icons (optimized from the app art)
```

## Feature parity with the Android app

- BPM 30–300 with ±1 / ±5 buttons and slider
- 6 time signatures with Carnatic & Hindustani names (Dadra, Teentaal, Jhaptal, Rupak…)
- Beat-dot row: red downbeat, white others, green ring + pop on the active beat
- Accent click on beat 1, regular click elsewhere (0.92 volume), same WAVs
- "ChankArts Digital Labs" splash (~1.4 s) fading into the metronome
- Buttons to return to the main ChankArts website (top-left chevron + outlined button → chankarts.com)
- Dark theme (#121212 / #1E88E5 / #E53935) matching the app
- Stops when the tab is hidden (the browser equivalent of app backgrounding)
- Banner ads intentionally removed

Timing uses the Web Audio clock with a 120 ms lookahead scheduler —
sample-accurate and drift-free (better than the mobile Timer approach,
which browsers do not handle as precisely).

## Run locally

```bash
cd chankarts-metronome-web
python3 -m http.server 8765
# open http://localhost:8765
```

(Audio needs localhost or HTTPS — browsers block sound on `file://`.)

## Deploy (any static host)

The whole folder is the site. Upload it as-is:

- **Netlify / Vercel / Cloudflare Pages** — drag-and-drop the folder or connect a repo
- **GitHub Pages** — push the folder contents to a branch, enable Pages
- **Any web host** — copy the folder into `public_html/`

### chankarts.com/metronome (sub-path on the main site)

Copy the folder contents into a `metronome/` directory on the main site's host.
Every reference in this project is relative (no leading slashes), so it works
unchanged at any sub-path — including `https://chankarts.com/metronome/`.
The service worker scopes itself to that directory only and never interferes
with the rest of the main site. From the main site, link to `/metronome/`
(ending slash matters for the service worker scope).

For a sub-path (e.g. `user.github.io/metronome/`) no base-href editing is
needed — all references are relative.

## Shipping updates

1. Bump `?v=` on the `styles.css` / `app.js` references in `index.html`.
2. Bump `CACHE_NAME` in `sw.js` when images or sounds change.
   (Code files are network-first anyway, so users get them on reload;
   the version bump defeats any intermediary caches.)

## Install on a phone/desktop

Open the site in the browser → **Share → Add to Home Screen** (iOS) or
**Install app** (Chrome/Edge). It installs without any store and runs offline.
