# Ayat lightweight, download-first audio QA

This build intentionally contains **zero prerecorded Quran audio** in the APK.

- Remove the previously bundled 114-surah Ali al-Huthaifi MP3Quran/Opus corpus.
- Never include the older EveryAyah/Mishary corpus, even if an old GitHub variable is enabled.
- Keep all Quran text, 604-page Mushaf layout, tafsir, adhkar, QUD word-timing metadata, and the MP3Quran reciter catalog.
- Keep MP3Quran downloads persistent in app-owned Android storage across app restarts and install-over updates.
- For «الاستماع» on a verse, prefer the selected downloaded recording with **matching** verse/word timestamps; otherwise choose another saved exact-timed recording, and explain any change of reciter.
- If there is no compatible downloaded recording and the phone is offline, show a clear message asking the user to enable internet or download the surah.
- When online, use the selected synchronized reader without a silent switch to Mishary.
- Never invent a word/ayah timestamp for a recording with no verified timing source.

Release QA must pass:
1. All Quran, adhkar, tafsir, security and offline browser tests.
2. Download-first ayah listening and no-bundled-audio regressions.
3. The Android web asset inspection must find **zero** .mp3/.webm/.ogg/.opus/.wav/.aac/.m4a files.
4. Android APK must be built and uploaded as Ayat.apk.

This is a new QA build, not an authorization to publish on Google Play.

## Final regression build: preserve legacy QUD downloads

In addition to the audio-free APK, keep recordings downloaded under older synchronized-provider metadata visible in «مكتبتي» and the offline MP3Quran catalog. Their original app-owned Android audio files must remain usable after an install-over update. The latest browser test confirms that offline verse listening chooses a downloaded, exact-timed reader instead of switching to Mishary. This note triggers the final QA APK rebuild from the latest changes.

## Offline messages and Quran tutorial navigation QA

Verify airplane mode / Wi-Fi off on Android WebView for both «الاستماع» from an ayah and the main Play button. The user must see a clear Arabic no-internet message, never an English HTTP 404. The Quran guide's step and real app sheet must remain synchronized across Next, Previous, Skip, resume, and early exit; skipping the initial long press opens genuine verse actions, while the reciter-selection explanation uses Next without forcing a reader choice.

## Latest QA run

Rebuild after offline player notices, Arabic error normalization, and the focused browser test for real Quran guide sheets across Skip / Previous / Next. The audio corpus remains absent from the APK.

## Full five-page guided-tour state synchronization

QA rebuild requested after applying the same real-panel synchronization across all tours, not only the Mushaf. Quran remains on its previously fixed panel-aware flow. Adhkar now closes the actual morning reader on Previous and restores it on Next/resume, with a safe Skip that opens the real morning chapter only after the local dataset is ready; its optional final Skip never increments the tasbih or pretends to swipe. Recitations returns to the actual reciter list on Previous, and reader selection is optional. The Home verse preview is dismissed when moving back, and My Library's explanations do not alter downloaded files. All five page guides are re-versioned and the offline service-worker shell is refreshed. The Android QA gate must run both the Quran and editorial Back/Skip/resume browser regressions before publishing an APK.

## Listen-from-verse: downloaded highlighting priority and honest fallback

When the user taps "Listen" on a Mushaf verse, check downloaded MP3Quran recordings for that surah. Prefer exact QUD word-timed audio first, then official recording-matched MP3Quran verse timings. Select and play the best downloaded reader automatically at the requested ayah, without assuming a fixed Mishary reciter. If no saved recording has matching timestamps, play the selected downloaded recording from 00:00 with no fabricated verse/word highlighting and explain in Arabic that exact verse seeking is unavailable because this recording has no matching timing metadata. If there are no downloads, preserve the existing offline warning; when online, use the selected aligned reciter or start the selected unsynced MP3 recording at the beginning with the same explanation. Tests cover offline and online fallbacks, downloaded word-vs-verse priority, selected-reciter preference, and removal of stale highlighting. Keep all five guide flows intact.


## Persistent audio player QA
- Mushaf verse listening is online-only and limited to precisely aligned reciters. Full-surah readers remain in the recitations library.
- Android recitations now hand off to a foreground media playback service with notification transport controls, a movable collapsible mini player on other screens, and state restoration on return.
- No recitation audio is bundled in the APK; downloads remain optional and app-owned.

- QA follow-up: added draggable collapsed bubble, offline-preserving stop behavior, and open-current-surah deep link. Updated browser regressions and cache v68.

- Final Android follow-up: preserve audio with a wake lock during screen-off playback and dispatch mini-player commands on the service main thread; hide the recitations mini until first playback.
