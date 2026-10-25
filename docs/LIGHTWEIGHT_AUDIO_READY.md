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
