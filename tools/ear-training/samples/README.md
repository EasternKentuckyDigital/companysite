# Instrument recordings

All 45 bundled recordings are released under **CC0 1.0 Universal** (public-domain dedication). The original creators do not endorse this tool.

- **Piano:** Kawai grand piano, Versilian Community Sample Library by Versilian Studios / Sam Gossner. [Library and license](https://github.com/sgossner/VCSL/tree/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e). Eleven medium-forte recordings, C3–C5 in scientific notation. VCSL’s Kawai filenames label middle C as C3; the sample map corrects this convention.
- **Classical guitar:** Spanish Classical Guitar by Roberto Gordo Saez / FreePats, version 2019-06-18. [Publisher](https://freepats.zenvoid.org/Guitar/acoustic-guitar.html), [pinned source and license](https://github.com/freepats/spanish-classical-guitar/tree/6f4eb1b092acc88f5448cea1a0001bd07b971af8). Nineteen individually recorded notes.
- **Violin:** Solo Violin, Arco Vib, quiet layer, VSCO 2 Community Edition by Versilian Studios / Sam Gossner. [Library and license](https://github.com/sgossner/VSCO-2-CE/tree/440300901dfe9275fd84e0b7763af1f8443ae62e). Seven bowed notes, G3–C5.
- **Mandolin:** “mandolin-CDEFGABC.wav” by Taku19810729, published 2014-11-26 on Freesound under CC0. [Original recording and license](https://freesound.org/people/Taku19810729/sounds/255837/). Eight single plucks sliced from the public high-quality preview. Handling noise excluded; measured tuning corrected to A4 = 440 Hz. The recorded plucks have a short natural decay.

The recordings are calibrated to A4 = 440 Hz while preserving violin vibrato, mixed to mono, trimmed, high-pass filtered at 65 Hz to reduce rumble, peak-normalized with headroom, faded at the edges, and converted to 22.05 kHz / 16-bit PCM WAV with an anti-aliasing filter. This preserves the recorded attack and acoustic timbre. Total download size across all instruments is about 4 MB; the player fetches only the notes needed and caches decoded audio during the visit.

Intervals are assembled from recordings of individual notes. Nearby notes use the closest recording at the appropriate playback rate; no oscillator sound substitutes for an unavailable recording. The instrument you select controls both quiz and demonstration sound. Piano and violin use sparse sample maps; guitar is mostly chromatic. Mandolin notes below C4 transpose the recorded C4, by up to five semitones.

[sources.json](sources.json) records exact original URLs, source and output SHA-256 hashes, trimming, and tuning adjustments. [CC0-1.0.txt](CC0-1.0.txt) preserves the full dedication. `scripts/prepare-samples.py` reproduces preparation using Python, NumPy, and macOS `afconvert`; these are development tools only. The site itself has no runtime dependencies.
