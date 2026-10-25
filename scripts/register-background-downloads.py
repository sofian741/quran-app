from pathlib import Path
from shutil import copyfile

files = list(Path("android/app/src/main/java").rglob("MainActivity.java"))
if len(files) != 1:
    raise SystemExit("Expected one MainActivity.java")
main = files[0]
source = main.read_text()
needle = "super.onCreate(state);"
if needle not in source:
    raise SystemExit("MainActivity onCreate missing")
source = source.replace(needle, "registerPlugin(QuranBackgroundDownloads.class);\n    registerPlugin(QuranFloatingAudio.class);\n    " + needle, 1)
main.write_text(source)
copyfile("android-native/QuranBackgroundDownloads.java", main.parent / "QuranBackgroundDownloads.java")

copyfile("android-native/QuranFloatingAudio.java", main.parent / "QuranFloatingAudio.java")
copyfile("android-native/QuranPlaybackService.java", main.parent / "QuranPlaybackService.java")
manifest = Path("android/app/src/main/AndroidManifest.xml")
xml = manifest.read_text(encoding="utf-8")
for permission in ("android.permission.FOREGROUND_SERVICE", "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK"):
    line = f'<uses-permission android:name="{permission}" />'
    if line not in xml:
        xml = xml.replace("<application", line + "\n    <application", 1)
service = '<service android:name=".QuranPlaybackService" android:exported="false" android:foregroundServiceType="mediaPlayback" />'
if service not in xml:
    xml = xml.replace("</application>", "    " + service + "\n    </application>", 1)
manifest.write_text(xml, encoding="utf-8")
