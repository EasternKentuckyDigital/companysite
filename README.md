# Eastern Kentucky Digital

Static website and public browser tools for Eastern Kentucky Digital. No build step, runtime dependencies, accounts, API keys, or backend services are required.

## Files

- `index.html` - main page
- `work.html` - selected work
- `tools/index.html` - public tools directory
- `tools/ear-training/` - interval ear trainer, audio engine, and instrument views
- `styles.css` - shared typography, layout, and light/dark colors
- `theme.js` - saved theme preference, with a system preference default
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
- Ascending, descending, mixed, and simultaneous playback; three speeds, a fixed lower note, volume, and optional auto advance.
- A playable two-octave piano with 25 keys (C3–C5). Notes stay hidden during the question and appear after a correct answer or an explicit reveal.
- Beta guitar, violin, and mandolin views in standard tuning. The same exact pitches appear across all views; guitar and mandolin show all available positions through fret 12. Violin uses semitone guides on a fretless fingerboard. Mandolin shows paired strings.
- First-try accuracy, streaks, session summaries, and focused practice on missed intervals. Wrong guesses allow another attempt; revealed answers count as missed.
- Settings stay in local storage on the current device. The quiz and its scores work without storage; there is no server tracking.
- Web Audio synthesizes piano-like reference tones locally. All instrument views use the same reference sound. Playback starts after a user gesture.

Questions use G3–C5 so both notes have playable positions in every instrument view. The piano displays the surrounding C3–C5 range. The keyboard uses chromatic sharp note labels; enharmonic spellings are equivalent in this equal-tempered exercise. The string views are diagrams rather than instrument-specific fingering lessons.

Keyboard shortcuts: **Space** starts practice or advances, **R** replays, and **1–9, 0, -, =** select the displayed choices. Native controls keep their usual keyboard behavior.

## Tests

Run `npm test` (Node.js 18 or later). The tests cover interval generation, pitch direction and ranges, instrument positions, saved-setting validation, and first-try scoring. There are no dependencies to install.

## Hosting

Publish this directory to any static host (for example GitHub Pages, Cloudflare Pages, or Netlify). Use the repository root as the publish directory and leave the build command empty. Keep the `tools/ear-training/` directory intact so its local module and stylesheet paths resolve correctly. No SPA rewrite rules are needed.

For a different domain, update the canonical URLs, `sitemap.xml`, and `robots.txt`, and remove or change the GitHub Pages `CNAME` file. The application itself has no domain or hosting-service dependency.
