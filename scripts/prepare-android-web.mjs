import { cp, mkdir, readdir, rm, stat, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const root = process.cwd();
const out = join(root, 'www');

const blockedDirs = new Set([
  '.git', '.github', 'android', 'ios', 'node_modules', 'www',
  'tests', 'scripts', 'artifacts', 'RELEASE_AUDIT', 'android-assets'
]);

const blockedFiles = new Set([
  '.gitignore', 'package.json', 'package-lock.json',
  'capacitor.config.json', 'capacitor.config.ts'
]);

const blockedExt = new Set([
  '.md', '.py', '.cjs', '.mjs', '.yml', '.yaml', '.sh', '.ps1'
]);

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const entry of await readdir(root, { withFileTypes: true })) {
  if (entry.name.startsWith('.') && entry.name !== '.well-known') continue;
  if (blockedFiles.has(entry.name)) continue;

  const src = join(root, entry.name);
  const dest = join(out, entry.name);

  if (entry.isDirectory()) {
    if (blockedDirs.has(entry.name)) continue;
    await cp(src, dest, { recursive: true });
    continue;
  }

  if (blockedExt.has(extname(entry.name).toLowerCase())) continue;
  await cp(src, dest);
}

const names = new Set(await readdir(out));
if (!names.has('index.html')) {
  throw new Error('Android web bundle is missing index.html');
}

console.log('Prepared Android web bundle in www/');

// Optional *authorized* full Mushary audio bundle. This folder is never
// downloaded automatically: supplying recordings and timing files requires
// explicit distribution rights from the respective rightsholders.
// 114 chapter MP3 files and 114 aligned chapter JSON responses are mandatory.
const licensedAudio = join(root, 'android-assets', 'mishary-authorized');
const licensedAudioInfo = await stat(licensedAudio).catch(() => null);
if (licensedAudioInfo?.isDirectory()) {
  for (let surah = 1; surah <= 114; surah++) {
    const filename = String(surah).padStart(3, '0');
    const audio = join(licensedAudio, filename + '.mp3');
    const metadata = join(licensedAudio, filename + '.json');
    const mp3Info = await stat(audio).catch(() => null);
    const metaInfo = await stat(metadata).catch(() => null);
    if (!mp3Info?.isFile() || mp3Info.size < 1024 ||
        !metaInfo?.isFile() || !metaInfo.size) {
      throw new Error('Licensed Mushary bundle must have all 114 MP3+JSON pairs; missing ' + filename);
    }
    const parsed = JSON.parse(await readFile(metadata, 'utf8'));
    if (Number(parsed?.audio_file?.chapter_id) !== surah ||
        !Array.isArray(parsed.audio_file.timestamps)) {
      throw new Error('Invalid Mushary timing metadata for surah ' + filename);
    }
  }
  await cp(licensedAudio, join(out, 'offline', 'mishary'), { recursive: true });
  console.log('Bundled all 114 authorized Mishary recordings and their alignment data.');
} else {
  console.log('No authorized Mishary bundle supplied. Existing online audio and user downloads remain available.');
}
