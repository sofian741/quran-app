"""Create the QA build version info loaded by the in-app updater."""
import json
import os
from pathlib import Path

version = int(os.environ["QA_BUILD_NUMBER"])
url = os.environ.get("UPDATE_MANIFEST_URL", "").strip() or "https://api.github.com/repos/sofian741/quran-app/releases/latest"
if url and not url.startswith("https://"):
    raise SystemExit("Update manifest must use HTTPS")
Path("android-build-info.js").write_text(
    "window.NOOR_ANDROID_BUILD = " +
    json.dumps({"versionCode": version, "updateManifestUrl": url}) +
    ";\n",
    encoding="utf-8",
)
print("QA app update version:", version, "feed configured:", bool(url))
