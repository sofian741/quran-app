# Mishary offline audio: verified asset receipt

This receipt is written automatically only after all 114 recordings
pass validation and the audio-only GitHub Release upload succeeds.

- Chapter count: **114/114**
- Synchronized ayah count: **6236/6236**
- Timing source: cpfair/quran-align (CC BY 4.0)
- Original audio: EveryAyah Alafasy_128kbps
- Opus/WebM 32kbps size: **492.0 MiB**
- Release archive size: **493.9 MiB**
- Release ZIP SHA256: 061f752eb63f330bffe0d7f25c2fa37f4d6a76049c0e27016d3f75c2e1daf29b
- Release tag: assets-mishary-synced-v3-opus
- No Android APK was built by this workflow.
- Prepared at (UTC): 2026-10-18T21:34:53+00:00

## Android functional-stability QA build

The bundled Mishary audio receipt above is unchanged. Rebuild Android once with the
latest portrait/zoom, ornate-header, page-fit, synchronized-reciter, and resumable
download fixes on main. Validate installation over the preceding QA version on device.

## QA update verification (2026-10-21)

Build a fresh Ayat.apk from the latest main commit. Verify direct upgrade from an older installed QA build to this newest version, retaining user settings and offline audio. The latest GitHub Release must expose the stable asset name Ayat.apk.

## QA-53 Lite: audio and keyboard regression build (26 October 2026)

Build only from the isolated qa/test-stable-53 branch. The Android package intentionally contains no preinstalled Mishary recitations; 19 QUD word-timing datasets are decoded only in generated Android web assets so reciter playback does not depend on WebView gzip support. Preserve original mushaf typography and kashida; pin Quran page geometry while the software keyboard is visible. Publish the signed QA artifact as Ayat.apk for the in-app update tester, after automated verification.

## QA-53 Lite linked tutorials (2026-10-27)

Build and publish the isolated QA-53 Lite test APK with the linked walkthrough fix. Skipping the long-press lesson must reopen the genuine verse menu before explaining its actions; index, settings, and audio lessons must open their actual panels when a prior step was skipped. The Quran reciter lesson is informational and advances using Next, without forcing a reciter tap. No mushaf typography, audio timings, downloads, or kashida logic is changed by this tutorial patch.
## Unified Android and desktop walkthrough QA (27 October 2026)

Rebuild Ayat.apk from the synchronized QA-53 Lite code now shared by main and qa/test-stable-53. Bring over only the desktop's linked, real-surface tutorial behavior across Quran, recitations, home, and adhkar, without restoring older main-branch changes to mushaf/audio. Confirm Next-only reciter lesson and Skip/Back restoring genuine menus. The installed 1.83 build does not contain this synchronized tutorial until this new APK is installed. Both code branches must stay at the same commit.


## QA audio continuity and Mushaf index test (2026-10-27)

Build trigger after merging PR #26 to main. Test: synchronized-only Mushaf reciters (Adel excluded), offline message, surah index search, and recitations audio continuing through the movable reading overlay. Verify on Android before declaring release-ready.


## Rebuild after corrected QA-53 index-search hash guard

The approved app.js index-search change is now explicitly pinned in tests/qa53-stability.test.cjs; keep all typography, font, and 604-page layout checks. Trigger new main APK build for on-device verification.
