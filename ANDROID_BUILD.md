# Noor Al Quran Android debug APK

The canonical workflow is `.github/workflows/build-android-apk.yml`. It uses Capacitor 8, Node 22, Java 21, Android SDK 36, and bundles local HTML/CSS/JS via `scripts/prepare-android-web.mjs`.

The **approved icon is already embedded in the repository** as split base64 chunks in `android-assets/icon-b64/`. The workflow reconstructs it, verifies SHA-256, and generates launcher icons and splash assets. Do not replace the icon with a generic default.

## Download and install

1. Go to GitHub Actions > **Build Android APK**.
2. Open the latest successful run on `main`.
3. Under **Artifacts**, download **Noor-Al-Quran-APK** (ZIP).
4. Extract **Noor-Al-Quran-debug.apk** and install on Android for testing.

This is a **debug APK**, not a signed Play Store release. Test Mushaf zoom/pan, word highlighting, offline content, audio playback/downloads, Adhkar, back navigation, and storage behavior on a real Android phone. Android WebView behavior may differ from Chrome.
