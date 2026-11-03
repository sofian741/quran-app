#!/usr/bin/env python3
"""Fetch only pinned, verified research inputs. Never edits production assets."""
import argparse, hashlib, json, pathlib, shutil, tarfile, urllib.request
ROOT = pathlib.Path(__file__).resolve().parents[2]
PINS = json.loads((ROOT/'tests/madinah-engine/sources.json').read_text())
p = argparse.ArgumentParser()
p.add_argument('--cache', type=pathlib.Path, required=True)
a = p.parse_args(); a.cache.mkdir(parents=True, exist_ok=True)
for name in ('qvp', 'svg'):
    pin = PINS[name]; archive = a.cache/(name+'.tar.gz')
    if not archive.exists():
        with urllib.request.urlopen(pin['url'], timeout=120) as response, archive.with_suffix('.part').open('wb') as out:
            shutil.copyfileobj(response, out)
        archive.with_suffix('.part').replace(archive)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    if digest != pin['sha256']:
        raise SystemExit(f'{name}: checksum mismatch, refusing input')
    target = a.cache/name
    if not (target/pin['root']/'VERSION.json').exists():
        target.mkdir(exist_ok=True)
        with tarfile.open(archive) as tar:
            for member in tar.getmembers():
                path = pathlib.PurePosixPath(member.name)
                if path.is_absolute() or '..' in path.parts or member.issym() or member.islnk():
                    raise SystemExit('Unsafe archive member')
            tar.extractall(target, filter='data')
    print(f'{name}: {digest} verified')
