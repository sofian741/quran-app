# Licensed offline Ali Al-Huthaifi corpus

Verified 114/114 chapters and matching QUD v3.2.0 word timing source.
Recording: MP3Quran server9/hthfi (https://www.mp3quran.net/ar/privacy).
Audio bundle: assets-huthaifi-mp3quran-word-v1 / huthaifi-licensed-word-v1.zip.
Avoid replacing the recording or QUD timing independently.

Validated at UTC: 2026-10-21T21:22:26+00:00

## Ayat Android QA regression build

The licensed audio archive above has been verified and is published. Build the Ayat.apk now from the complete source-rights integration, with permanent MP3Quran downloads, native file existence checks, an offline Huthaifi word-synced reader, web UI regression fixes, and Quran/adhkar integrity tests. This receipt update triggers the existing Android QA workflow; keep the archive and alignment fingerprints immutable.

## Build verification retry

The original Android QA run detected missing Playwright/Chromium setup before packaging; dependencies have now been added and the offline-shell regression uses current v63. This documentation update schedules a new build with the repaired browser verification gate.

## Offline tafsir regression build

Retry QA Android APK with fixed root/Android tafsir paths, service-worker cache fallback and a strict browser test for the actual tafsir. Source recordings and the already verified 114-chapter Huthaifi bundle remain unchanged.
