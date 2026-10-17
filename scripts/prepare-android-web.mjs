import { cp, mkdir, readdir, rm } from 'node:fs/promises';
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
