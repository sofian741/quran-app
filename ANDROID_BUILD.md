# Noor Al Quran Android debug APK

The canonical workflow is `.github/workflows/build-android-apk.yml`. It uses Capacitor 8, Node 22, Java 21, Android SDK 36, and bundles local HTML/CSS/JS via `scripts/prepare-android-web.mjs`.

The **approved icon is already embedded in the repository** as split base64 chunks in `android-assets/icon-b64/`. The workflow reconstructs it, verifies SHA-256, and generates launcher icons and splash assets. Do not replace the icon with a generic default.

## Download and install

1. Go to GitHub Actions > **Build Android APK**.
2. Open the latest successful run on `main`.
3. Under **Artifacts**, download **Noor-Al-Quran-APK** (ZIP).
4. Extract **Noor-Al-Quran-debug.apk** and install on Android for testing.

This is a **QA debug APK**, not a signed Play Store release. Test Mushaf zoom/pan, word highlighting, offline content, audio playback/downloads, Adhkar, back navigation, and storage behavior on a real Android phone. Android WebView behavior may differ from Chrome.

## Updating over an existing APK

Each Actions run uses a permanently fixed **test-only** signing certificate stored in `android-assets/noor-qa-signing.p12.b64`, and uses its Actions run number for an increasing Android `versionCode`. This is **NOT** the Google Play release key: it has a publicly documented test password. NEVER use this certificate for an uploaded release or user production data.

On the phone, open the downloaded new APK and select **Update**. The Android package ID `com.sofian.nooralquran` stays fixed. App settings and previously downloaded recitations should survive normal install-over updates, subject to device storage reliability.

**One-time migration:** Previous workflow-generated debug APKs (built before fixed QA signing) had different ephemeral signing keys. Android rejects installing these new QA APKs over those. Uninstall the older debug app once, then install the first QA-signed APK. This one uninstall may remove local app data/downloads. After that, new QA APKs update in place without uninstalling. Any Play Store build must have a properly protected, separate release signing key and Play-compatible versioning.

## Recitations offline

MP3Quran downloads are stored in Cache Storage. Playback now opens the cached audio directly using a temporary `blob:` URL, avoiding Android WebView reliance on service-worker interception of audio/range requests. Quran Foundation chapter metadata is also read from its existing local cache when offline. Verify in airplane mode on a real device. Note that a downloaded MP3Quran surah is separate from Quran Foundation's synchronized Mishary recitation; saving one does not automatically save the other.

### Bundling the full synchronized Mishary recitation (only with distribution authorization)

The Android packaging script now accepts an **optional** licensed corpus in `android-assets/mishary-authorized/` with exactly 114 pairs: `001.mp3` + `001.json` through `114.mp3` + `114.json`. The JSON for each surah must be the matching Quran Foundation chapter-recitation payload with complete original verse/word timestamps. Audio must match these precise timestamps; do not substitute a different Mishary release.

When a complete authorized corpus is supplied, `npm run android:prepare` validates and copies it into `www/offline/mishary/`; native Android automatically uses this package for Mushary's synchronized recitation. Without the corpus, the app keeps normal network/cache playback instead of pretending that the entire recitation is bundled.

**Do not add or distribute third-party recitation audio or timing datasets without reviewing the applicable rights and obtaining permission where required.** Quran.com says its recitations belong to the respective rightsholders and it cannot grant redistribution permission. Official developer terms also restrict re-distributing Quran Foundation API content. Bundling support is implemented; the recordings themselves are not bundled in the current builds.
