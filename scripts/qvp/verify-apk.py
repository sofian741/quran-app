"""Verify the actual APK assets, not just the staging directory."""
import hashlib, json, os, re, subprocess, sys, zipfile
from pathlib import Path
apk=Path(sys.argv[1])
with zipfile.ZipFile(apk) as z:
    config=json.loads(z.read('assets/capacitor.config.json'))
    assert config['appId']=='com.sofian.nooralquran'
    prefix='assets/public/'
    manifest=json.loads(z.read(prefix+'data/qvp/manifest.json'))
    pages=[x for x in z.namelist() if x.startswith(prefix+'data/qvp/pages/') and x.endswith('.qvp')]
    assert len(pages)==604
    for name,meta in manifest['files'].items():
        assert hashlib.sha256(z.read(prefix+'data/qvp/pages/'+name)).hexdigest()==meta['sha256'],name
    for name in ['index.html','library.html','adhkar.html','recitations.html','mushaf-qvp/boot.js','mushaf-qvp/reader.js']:
        assert prefix+name in z.namelist(),name
    assert b'mushaf-qvp/boot.js' in z.read(prefix+'quran.html')
    for old in ['app.js','reader-enhancements.js','reader-layout-polish.js','mushaf-engine-loader.js','mushaf-layout-prewarm-worker.js','data/mushaf-layout.json']:
        assert prefix+old not in z.namelist(),old
receipt={'appId':config['appId']}
if os.environ.get('ANDROID_HOME'):
    build=Path(os.environ['ANDROID_HOME'])/'build-tools/36.0.0'
    badging=subprocess.check_output([str(build/'aapt'),'dump','badging',str(apk)],text=True)
    match=re.search(r"package: name='([^']+)' versionCode='(\d+)'",badging)
    assert match and match[1]==config['appId'] and int(match[2])>94
    certificate=Path('/tmp/ayat-qa-cert.der')
    subprocess.run(['keytool','-exportcert','-keystore','android-assets/noor-qa-signing.p12','-storetype','PKCS12','-storepass','android','-alias','noor-qa','-file',str(certificate)],check=True,capture_output=True)
    expected=hashlib.sha256(certificate.read_bytes()).hexdigest()
    signature=subprocess.check_output([str(build/'apksigner'),'verify','--print-certs',str(apk)],text=True)
    assert 'Signer #1 certificate SHA-256 digest: '+expected in signature,'Unexpected APK signer'
    receipt.update(versionCode=int(match[2]),signerSha256=expected,stableQaSignatureVerified=True)
print(json.dumps({**receipt,'pages':604,'allPageHashesVerified':True,'legacyRetained':False,'bytes':apk.stat().st_size,'sha256':hashlib.sha256(apk.read_bytes()).hexdigest()},indent=2))
