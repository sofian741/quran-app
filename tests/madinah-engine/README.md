# Madinah engine laboratory

Research-only reader for KFGQPC Hafs V4 1441H. Production remains unchanged.
`acceptance.json` blocks production integration. In particular, 15:7 has two
legacy timed words sharing one printed element: do not claim separate ink
highlighting is preserved until a reviewed subword map exists.

Inputs: checksum-pinned SVG Elements v1.1.2 and QVP data-v0.5.0. Vendored
Quran Engine lite files are unchanged; see vendor/LICENSE and sources.json.
No extra fonts, recitation recordings, DigitalKhatt databases or ornament sets
are shipped. The source/data licensing table is docs/MUSHAF_LICENSING.md.

Use Node 22+, Python 3.12+, Chromium, Playwright 1.56.1. Keep generated assets
outside the app repository so production's web bundler cannot include them:

```bash
TASK_WORK="$PWD/../work/madinah"
mkdir -p "$TASK_WORK"
python3 scripts/madinah/fetch-assets.py --cache "$TASK_WORK/assets"
node scripts/madinah/prepare.mjs --cache "$TASK_WORK/assets" --out "$TASK_WORK/site"
python3 -m http.server 4173 --bind 127.0.0.1 --directory "$TASK_WORK/site"
```

Open http://127.0.0.1:4173/quran.html . `legacy-quran.html` runs the existing
reader. No production updater is enabled for the new reader. Home reads the
laboratory position namespace in the generated copy only.

In another terminal, from the source repository:

```bash
node --test tests/madinah-engine/unit.test.mjs
LAB_RESULTS="$TASK_WORK/results" node tests/madinah-engine/browser.cjs
LAB_RESULTS="$TASK_WORK/results" node tests/madinah-engine/visual.cjs
LAB_VISUAL_PAGES=1,4,48,77,187,208,262,282,428,451,602,604 LAB_VISUAL_SCALE=4 LAB_RESULTS="$TASK_WORK/results" node tests/madinah-engine/visual.cjs
LAB_RESULTS="$TASK_WORK/results" node tests/madinah-engine/benchmark.cjs
```

The variables above are per shell; set TASK_WORK again in the second terminal.
Install Playwright as a test-only dependency if absent. Set QURAN_BROWSER_PATH
when Chromium is not at /usr/bin/chromium. LAB_BASE_URL selects a different server.
Browser tests intercept external HTTPS, simulate audio state and viewport zoom,
and separately install the complete local corpus before true network-offline
reloads. They do not claim real Android, real reciter audio or paper certification.

The visual gate compares against immutable upstream SVG at equal resolution;
it records exact differences and a 0.5% cap on pixels with channel differences
above 16/255. Passing that tolerance is not pixel identity or a print certificate.
The benchmark reports JS heap only, excluding native Path2D and graphics memory.

The separate `.github/workflows/madinah-engine-lab.yml` builds
`com.sofian.nooralquran.madinahlab`. It retains TextZoom(100) before content loading,
uses a debug signature, and uploads expiring Actions artifacts only. It has no
release-writing permission and cannot replace the existing application package.

## Bridge contracts

* The canonical copy/search verse comes from immutable Tanzil. Comparison
  normalization never becomes displayed/copied Quran text.
* Every QVP page is hashed before decoding. Navigation commits DOM/page/storage
  together after validation; failed or superseded loads retain prior accepted state.
* Printed `s:a:w` ordinals and legacy `tanzil-spoken` ordinals are separate spaces.
  Basmala offsets are explicit. Complete-verse maps work across page fragments.
* The generated audio script changes only syncHighlight/followVerse, and the
  generated verse-action script changes pointer-to-word resolution. Anchor checks
  fail the build if upstream source changes. All other controls reuse source code.
* The current fused 15:7 map is demonstrative and explicitly blocks acceptance.
* The generated `.js` modules retain the `.mjs` sources, with import suffixes
  rewritten for Android local MIME handling; production source files are untouched.
* Cache limit: 3 decoded pages. Adjacent previews share the same decoded objects,
  with their own bounded canvases; native graphics memory still needs device testing.
