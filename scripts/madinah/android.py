#!/usr/bin/env python3
"""Stage/configure a separate debug application. Never writes production config."""
import argparse,json,pathlib,shutil
ROOT=pathlib.Path(__file__).resolve().parents[2]
p=argparse.ArgumentParser();p.add_argument('--project',type=pathlib.Path,required=True);p.add_argument('--site',type=pathlib.Path);p.add_argument('--configure',action='store_true');a=p.parse_args()
project=a.project.resolve()
if '/work/' not in str(project) or project==ROOT: raise SystemExit('Use an isolated work/ project')
if not a.configure:
    project.mkdir(parents=True,exist_ok=True)
    if not a.site:raise SystemExit('--site required')
    shutil.copyfile(ROOT/'package.json',project/'package.json')
    config=json.loads((ROOT/'capacitor.config.json').read_text());config['appName']='آيات | مختبر 1441هـ';config['webDir']='www'
    (project/'capacitor.config.json').write_text(json.dumps(config,ensure_ascii=False,indent=2))
    if (project/'www').exists():shutil.rmtree(project/'www')
    shutil.copytree(a.site,project/'www',ignore=lambda directory,names: ['reference'] if pathlib.Path(directory).name=='lab' else [])
    if (project/'www/lab/reference').exists():raise SystemExit('Research reference SVGs must not inflate APK')
    for name in ('android-native','android-assets'):
        shutil.copytree(ROOT/name,project/name,dirs_exist_ok=True)
    # Reuse the original production key namespace only in Java, not app identity.
    print('Staged separate app; production configs untouched')
else:
    main=next((project/'android/app/src/main/java').rglob('MainActivity.java'))
    source=main.read_text()
    needle='public class MainActivity extends BridgeActivity {'
    if needle not in source:raise SystemExit('Unexpected MainActivity')
    source=source.replace(needle,needle+'''
  @Override public void onCreate(android.os.Bundle state) {
    registerPlugin(MushafTextScale.class);
    registerPlugin(QuranBackgroundDownloads.class);
    super.onCreate(state);
    getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    android.webkit.WebSettings ws = getBridge().getWebView().getSettings();
    ws.setSupportZoom(true);
    ws.setBuiltInZoomControls(true);
    ws.setDisplayZoomControls(false);
    ws.setUseWideViewPort(true);
    ws.setMediaPlaybackRequiresUserGesture(false);
  }
''',1)
    main.write_text(source)
    for name in ('MushafTextScale.java','QuranBackgroundDownloads.java'):shutil.copyfile(ROOT/'android-native'/name,main.parent/name)
    if source.index('registerPlugin(MushafTextScale.class)')>source.index('super.onCreate(state)'):raise SystemExit('Text scale must register first')
    gradle=project/'android/app/build.gradle';body=gradle.read_text();old='applicationId "com.sofian.nooralquran"'
    if old not in body:raise SystemExit('Unexpected applicationId')
    gradle.write_text(body.replace(old,'applicationId "com.sofian.nooralquran.madinahlab"'))
    manifest=project/'android/app/src/main/AndroidManifest.xml';body=manifest.read_text();body=body.replace('android:name=".MainActivity"','android:name=".MainActivity" android:screenOrientation="portrait"');manifest.write_text(body)
    print('Configured com.sofian.nooralquran.madinahlab; TextZoom(100); no release/update channel')
