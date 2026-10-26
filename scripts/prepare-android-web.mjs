import { cp, mkdir, readdir, rm, readFile, writeFile } from 'node:fs/promises';
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

// QA-53 lightweight Android build: keep the reader, typography, kashida,
// tafsir, and online/on-demand reciters unchanged. Ship no preinstalled
// Mishary recordings or the interception scripts that redirect playback to them.
// This affects only generated www/, never the source HTML or existing downloads.
await rm(join(out, 'offline', 'mishary'), { recursive: true, force: true });
for (const script of ['offline-mishary.js', 'offline-mishary-sync.js']) {
  await rm(join(out, script), { force: true });
}
for (const page of ['quran.html', 'library.html', 'recitations.html']) {
  const path = join(out, page);
  const original = await readFile(path, 'utf8');
  const updated = original.split('\n').filter(line =>
    !/<script\\s+src=["']offline-mishary(?:-sync)?\\.js["']><\\/script>/.test(line)
  ).join('\n');
  if (original === updated || /<script\\s+src=["']offline-mishary(?:-sync)?\\.js["']><\\/script>/.test(updated)) {
    throw new Error('Failed to remove bundled-audio hook in ' + page);
  }
  await writeFile(path, updated);
}

// Tafsir is essential offline Quran content; scripts/ is excluded from the app bundle.
const tafsirSource = join(root, 'scripts', 'tafsir_muyassar.json');
const tafsirDest = join(out, 'data', 'tafsir_muyassar.json');
const tafsirRaw = await readFile(tafsirSource, 'utf8');
const tafsir = JSON.parse(tafsirRaw);
if (tafsir.api_key !== 'arabic_moyassar' || tafsir.total_verses !== 6236 ||
    !tafsir.verses || Object.keys(tafsir.verses).length !== 6236) {
  throw new Error('The offline tafsir dataset is incomplete');
}
await mkdir(join(out, 'data'), { recursive: true });
await writeFile(tafsirDest, tafsirRaw);

const names = new Set(await readdir(out));
if (!names.has('index.html')) {
  throw new Error('Android web bundle is missing index.html');
}

console.log('Prepared Android web bundle in www/');

// Historical QA-53 audio bundles are deliberately NOT inserted into www.
// Users can stream or download their chosen reciter on demand.
