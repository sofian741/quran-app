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
source = source.replace(needle, "registerPlugin(QuranBackgroundDownloads.class);\n    " + needle, 1)
main.write_text(source)
copyfile("android-native/QuranBackgroundDownloads.java", main.parent / "QuranBackgroundDownloads.java")
