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

## حقوق النشر: بناء QA آمن افتراضيًا — 2026-10-21

- لا تعني هذه الوصلة أن استخدام تسجيلات EveryAyah مرخص؛ الحزمة موقوفة افتراضيًا في بناء Android الجديد.
- هذا التحديث يشغّل بناء APK لا يحتوي صوت EveryAyah ضمن الحزمة ما لم يوثق المالك إذنًا خطيًا ثم يضبط متغير الموافقة صراحة.
- تظل تلاوة مشاري المباشرة ومزامنة Quran Foundation متاحة عند وجود الإنترنت، وتنزيل MP3Quran المباشر متاح وفق شروط مزوده.
- أبقِ الإصدارات السابقة في مراجعة منفصلة لأنها لا تتأثر بهذا التعديل.

- تصحيح أخير في 2026-10-21: منع تخزين HTTP الإجباري لباقي نقاط Quran Foundation الخاصة بملفات الآيات والاستكشاف، وتضمين هذا التصحيح في محاولة بناء QA الآمنة.

## QA rollback verification — 2026-10-26

Rebuild the Android QA APK from the restored 0406a1d5be0454e7262c8f191916098a05285e11 project snapshot. This documentation-only commit triggers the original Android build workflow. Preserve the old application code and do not include later audio/player changes. Test before release.

## QA playback fix verification — 2026-10-26

Trigger Android QA APK build with strict selected-reader exact-ayah playback. Regression tests cover a downloaded Maher surah never overriding selected Mishary, Android connectivity false negatives, accurate verse seek with matching MP3Quran timings, and no silent playback from surah start when timestamps are unavailable. Check the selected reciter, word highlighting only with authentic word segments, downloaded full-surah playback, and app upgrade on an actual device. This is a QA-only build; no unlicensed recordings may be bundled.
