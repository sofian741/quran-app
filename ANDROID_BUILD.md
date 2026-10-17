# Android APK (debug)

The Android build runs on GitHub Actions using Capacitor 8, Java 21 and the Android SDK. It packages local HTML/CSS/JS via `scripts/prepare-android-web.mjs`.

1. Open GitHub > Actions > Build Android APK > Run workflow (main).
2. Wait for a successful build and download the `Noor-Al-Quran-debug-APK` artifact.
3. Extract ZIP, transfer `app-debug.apk` to Android and install it for testing.

**Icon:** place the approved square icon image at `android-assets/icon.png` (PNG, 1024x1024 preferred) and rerun workflow. Without it the first debug build uses a temporary default icon; do not publish that build.

**Important:** This is a debug APK, not a signed Play Store release. Test Mushaf zoom/pan, word highlighting, offline content, audio playback/downloads, Adhkar, back navigation, and storage behavior on a real Android phone. Browser-only service workers and download mechanisms may require Android-specific fixes. Do not distribute publicly before those tests and licensing checks.
