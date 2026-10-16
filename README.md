# Eastern Kentucky Digital

Static website and public browser tools for Eastern Kentucky Digital. No build step, runtime dependencies, accounts, API keys, or backend services are required.

## Files

- `index.html` - main page
- `work.html` - selected work
- `tools/index.html` - public tools directory
- `tools/ear-training/` - interval ear trainer, audio engine, and instrument views
- `styles.css` - shared typography, layout, and light/dark colors
- `theme.js` - shared light/dark switch, with a saved preference and system detection
- `assets/fonts/` - locally hosted Manrope and Space Grotesk fonts and their open source licenses
- `contact.js` - email reveal after a visitor clicks, with an obfuscated address
- `favicon.svg` - local tab icon
- `sitemap.xml` - canonical page list for search engines
- `robots.txt` - crawler guidance and sitemap location

## Preview

Serve the repository over HTTP. The ear trainer uses JavaScript modules, so opening it through a `file://` URL will not work in most browsers.

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8000/` for the site, or `http://127.0.0.1:8000/tools/ear-training/` for the tool. `npm run preview` runs the same server.

## Ear training

- Twelve intervals, from minor second through octave, with starter, core, and custom interval sets.
- Ascending, descending, mixed, and simultaneous playback; three speeds, a selectable root note (middle C by default), volume (80% by default), and optional auto advance.
- A playable two-octave piano with 25 keys (C3–C5). Notes stay hidden during the question and appear after a correct answer or an explicit reveal.
- Guitar, violin, and mandolin views in standard tuning. The same exact pitches appear across all views; guitar and mandolin show all available positions through fret 12. Violin uses semitone guides on a fretless fingerboard. Mandolin shows paired strings.
- First-try accuracy, streaks, session summaries, and focused practice on missed intervals. Wrong guesses allow another attempt; revealed answers count as missed.
- Settings stay in local storage on the current device. The quiz and its scores work without storage; there is no server tracking.
- Web Audio plays locally hosted CC0 recordings of the selected piano, classical guitar, violin, or mandolin. The 45 WAV files total about 4 MB and load on demand. See `tools/ear-training/samples/README.md`, `sources.json`, and `CC0-1.0.txt` for creators, licenses, processing, and exact provenance. Playback starts after a user gesture.
- Choose the instrument above the playback controls. Preview its recorded middle C before a question, or follow its recording-source link. The same selected instrument plays the quiz, demonstrations, and individual notes; previews are disabled during a question.
- Answers trigger a slow demonstration synchronized with the notes. Solid fretboard markers show one suggested playable path; outlined markers preserve alternate positions. Click either note to hear it separately.

Questions use G3–C5 so both notes have playable positions in every instrument view. The piano displays the surrounding C3–C5 range. The keyboard uses chromatic sharp note labels; enharmonic spellings are equivalent in this equal-tempered exercise. The selected root anchors the lower note, so descending intervals begin on the upper note. Root choices run from G3 through middle C, or vary across the shared range. Suggested string positions are examples rather than instrument-specific fingering lessons.

Keyboard shortcuts: **Space** starts practice or advances, **R** replays, and **1–9, 0, -, =** select the displayed choices. Native controls keep their usual keyboard behavior.

## Tests

Run `npm test` (Node.js 18 or later). The tests cover interval generation, pitch direction and ranges, instrument positions, saved-setting validation, middle-C defaults and selectable roots, suggested string positions, sample provenance, audio scheduling and cancellation, and first-try scoring. There are no dependencies to install.

## Hosting

Publish this directory to any static host (for example GitHub Pages, Cloudflare Pages, or Netlify). Use the repository root as the publish directory and leave the build command empty. Keep the `tools/ear-training/` directory intact so its local module and stylesheet paths resolve correctly. No SPA rewrite rules are needed.

For a different domain, update the canonical URLs, `sitemap.xml`, and `robots.txt`, and remove or change the GitHub Pages `CNAME` file. The application itself has no domain or hosting-service dependency.

## Contact privacy

Contact links lead to the homepage contact section. The email address is absent from HTML, metadata, and initial DOM; `contact.js` reconstructs a clickable address only after the visitor requests it. This deters basic scrapers, but client-side obfuscation cannot prevent a determined crawler from executing the same interaction. A server-side contact form would be needed to keep the destination address entirely off the client. No backend or third-party form service is used.
