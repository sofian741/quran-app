# Mushaf small-screen diagnostic baseline

**Protected production branch:** `main` (do not merge experimental changes before visual verification).

**QA branch:** `qa/mushaf-small-screen-layout-20261028`.

## Why this exists
On an Infinix phone, screenshots of Madinah Mushaf pages 183 and 184 showed densely packed diacritics, almost no vertical clearance, and occasional text protruding from both horizontal edges. The phone model and its Android WebView build are not yet known. Do not assume that CSS-only emulation reproduces that exact renderer.

## Automated baseline
Run `node scripts/diagnose-mushaf-layout.cjs` with Playwright installed, or open the **Diagnose Mushaf Small Screens (QA only)** GitHub Action on the QA branch.

The script uses the app's *real* `quran.html`, existing fonts and layout scripts, and the real index/page-turn controls. It captures 16 cases: pages 1, 2, 183, 184 at 320×640, 360×720, 393×852 and 412×915. For each it saves a screenshot and JSON of actual bounding boxes, line overlaps, horizontal overflow and root scroll overflow. The summary identifies which cases need attention. Reports are uploaded as an Actions artifact.

## Important limitations
- A line's CSS rectangle may not reflect all Quranic glyph ink and combining marks; inspect screenshots visually for harakat collisions even when numeric overlap is zero.
- Desktop Chromium is not the same as Android WebView or the Infinix font renderer. Real-device confirmation remains necessary after any fix.
- Do not mask overflow with `overflow:hidden`, drop Quranic tokens, change 604-page mapping, or change the canonical Uthmani data to make tests pass.
- This phase does **not** modify production Mushaf layout, typography or data. It establishes evidence first.

## Next
1. Inspect the artifact's 183/184 PNGs and JSON measurements.
2. Identify whether the actual issue is vertical fit, horizontal justification, font shaping or a combination.
3. Add focused tests and make minimal changes **on the QA branch only**.
4. Verify across sizes and then ask for a single final check on the Infinix phone.
