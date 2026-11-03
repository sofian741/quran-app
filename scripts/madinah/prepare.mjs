// Build an isolated, entirely local research site. No production file is written.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {decodeGeometry} from '../../tests/madinah-engine/vendor/lite.mjs';
import {parseTanzil, splitWords, alignWords} from '../../tests/madinah-engine/text-map.mjs';
const root = path.resolve(import.meta.dirname, '../..');
const pins = JSON.parse(await fs.readFile(root+'/tests/madinah-engine/sources.json'));
const args = process.argv.slice(2), option = name => args[args.indexOf(name)+1];
if (!args.includes('--cache') || !args.includes('--out')) throw new Error('Usage: --cache DIR --out DIR');
const cache = path.resolve(option('--cache')), out = path.resolve(option('--out'));
if (out === root || !out.includes('/work/')) throw new Error('Output must be an isolated work/ directory');
const qvp = path.join(cache, 'qvp', pins.qvp.root), svg = path.join(cache, 'elements', pins.svg.root);
// fetch-assets.py uses svg/, while the initial research checkout used elements/.
const svgDir = await fs.access(svg).then(()=>svg).catch(()=>path.join(cache,'svg',pins.svg.root));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
for (const name of ['qvp','svg']) {
  const file = name === 'svg' ? await fs.access(cache+'/svg.tar.gz').then(()=>cache+'/svg.tar.gz').catch(()=>cache+'/elements.tar.gz') : cache+'/qvp.tar.gz';
  if (sha(await fs.readFile(file)) !== pins[name].sha256) throw new Error('Unverified '+name+' archive');
}
const raw = await fs.readFile(root+'/data/quran-uthmani.txt','utf8');
if (sha(raw)!==pins.tanzilSha256) throw new Error('Tanzil changed');
const verses = parseTanzil(raw), byVerse = new Map(), pages = [], files = {}, sizes = {qvp:0, svg:0, sidecars:0};
const version = JSON.parse(await fs.readFile(qvp+'/VERSION.json'));
if(version.source_version!=='v1.1.2'||version.pages!==604) throw new Error('Wrong data edition');
await fs.mkdir(out,{recursive:true});
// Copy the existing UI and its local collaborators. The lab replaces only renderer entry scripts.
for(const entry of await fs.readdir(root,{withFileTypes:true})) {
  if(entry.isFile() && /\.(html|js|css)$/.test(entry.name)) await fs.copyFile(root+'/'+entry.name,out+'/'+entry.name);
}
for(const dir of ['data','assets']) await fs.cp(root+'/'+dir,out+'/'+dir,{recursive:true});
await fs.copyFile(root+'/scripts/tafsir_muyassar.json',out+'/data/tafsir_muyassar.json');
const home=await fs.readFile(out+'/home.js','utf8');await fs.writeFile(out+'/home.js',home.replaceAll("'quranReaderState'","'madinahLabReaderStateV1'"));
// Match production Android's local QUD compatibility path without mutating original timings.
for(const name of await fs.readdir(out+'/data/qud')) if(name.endsWith('.gz')) {
  await fs.writeFile(out+'/data/qud/'+name.slice(0,-3),zlib.gunzipSync(await fs.readFile(out+'/data/qud/'+name)));
  await fs.rm(out+'/data/qud/'+name);
}
const registry=await fs.readFile(out+'/data/qud/registry.js','utf8');
await fs.writeFile(out+'/data/qud/registry.js',registry.replace(/\.word\.json\.gz/g,'.word.json'));
await fs.mkdir(out+'/lab/pages',{recursive:true});
await fs.mkdir(out+'/lab/reference',{recursive:true});
await fs.cp(root+'/tests/madinah-engine',out+'/lab/runtime',{recursive:true,filter:src=>!src.endsWith('.cjs')&&!src.endsWith('.test.mjs')});
// .js is recognized consistently by Android WebView's local MIME resolver.
async function portableModules(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){const file=dir+'/'+e.name;if(e.isDirectory())await portableModules(file);else if(e.name.endsWith('.mjs')){const source=await fs.readFile(file,'utf8');await fs.writeFile(file.slice(0,-4)+'.js',source.replaceAll('.mjs','.js'));}}}
await portableModules(out+'/lab/runtime');
let previousKey=[0,0,0], totalWords=0, fragments=0, markerCount=0, headers=0, basmalas=0;
const markerKeys = new Set(), counts = {};
for(let n=1;n<=604;n++) {
  const id=String(n).padStart(3,'0'), bytes=await fs.readFile(qvp+'/'+id+'.qvp');
  const sidecarBytes=await fs.readFile(qvp+'/'+id+'.words.json');
  if(sha(bytes)!==version.files[id+'.qvp'] || sha(sidecarBytes)!==version.files[id+'.words.json']) throw new Error('QVP file digest '+id);
  const g=decodeGeometry(bytes), words=JSON.parse(sidecarBytes);
  if(g.number!==n||g.width!==345||g.height!==550||g.lines.length!==(n<=2?8:15)) throw new Error('Page geometry '+id);
  const keys=[];
  for(const w of g.words) {
    const key=`${w.surah}:${w.ayah}:${w.word}`, ref=`${w.surah}:${w.ayah}`;
    if(!(key in words)||words[key].rasm_uthmani!==w.text) throw new Error('Text identity '+key);
    const tuple=[w.surah,w.ayah,w.word];
    if(tuple[0]<previousKey[0]||(tuple[0]===previousKey[0]&&(tuple[1]<previousKey[1]||(tuple[1]===previousKey[1]&&tuple[2]!==previousKey[2]+1)))) throw new Error('Word order '+key);
    if((tuple[0]!==previousKey[0]||tuple[1]!==previousKey[1])&&tuple[2]!==1) throw new Error('First ordinal '+key);
    previousKey=tuple;
    if(!byVerse.has(ref)) byVerse.set(ref,[]);
    byVerse.get(ref).push({key,text:w.text,page:n,line:g.lines[w.lineIndex].lineNumber});
    keys.push(key); totalWords++;
    if(w.box.some(x=>!Number.isFinite(x))) throw new Error('Bad word box');
  }
  if(keys.length!==Object.keys(words).length) throw new Error('Sidecar coverage '+id);
  for(const d of g.decorations) {
    counts[d.decoration]=(counts[d.decoration]||0)+1;
    if(d.decoration===0) {markerCount++; const key=d.surah+':'+d.ayah; if(markerKeys.has(key))throw new Error('Duplicate marker');markerKeys.add(key);}
    if(d.decoration===1) headers++;
    if(d.decoration===2) {basmalas++; if([1,9].includes(d.surah))throw new Error('Unexpected basmala');}
  }
  fragments+=g.ayahs.length;
  const source=await fs.readFile(svgDir+'/pages/'+id+'.svg');
  const index=JSON.parse(await fs.readFile(svgDir+'/index/by-page/'+id+'.json'));
  if(index.words.length!==g.words.length||index.words.some((w,i)=>w.word_key!==keys[i]||w.line!==g.lines[g.words[i].lineIndex].lineNumber)) throw new Error('SVG/QVP word or line disagreement '+id);
  const svgRows=(source.toString().match(/class="line"/g)||[]).length;
  if(svgRows!==g.lines.length)throw new Error('SVG/QVP rows '+id);
  sizes.qvp+=bytes.length;sizes.svg+=source.length;sizes.sidecars+=sidecarBytes.length;
  files[id+'.qvp']={sha256:sha(bytes),bytes:bytes.length};
  files[id+'.svg']={sha256:sha(source),bytes:source.length};
  pages.push({number:n,words:keys.length,lines:g.lines.length,first:keys[0],last:keys.at(-1),qvpSha256:sha(bytes),svgSha256:sha(source)});
  await fs.writeFile(out+'/lab/pages/'+id+'.qvp',bytes);
  await fs.writeFile(out+'/lab/reference/'+id+'.svg',source);
}
const mappings={}, changes=[];
for(const verse of verses) {
  const all=splitWords(verse.text), offset=verse.ayah===1&&verse.surah!==1&&verse.surah!==9?4:0;
  const source=all.slice(offset), printed=byVerse.get(verse.key);
  if(!printed)throw new Error('Missing verse '+verse.key);
  const match=alignWords(source,printed.map(w=>w.text));
  if(match.status!=='exact-skeleton')throw new Error('Unresolved text identity '+verse.key);
  const sourceToPrinted=source.map(()=>[]);
  for(const group of match.groups)for(let i=group.source[0];i<group.source[1];i++) sourceToPrinted[i]=printed.slice(...group.printed).map(w=>w.key);
  mappings[verse.key]={status:match.status,basmalaOffset:offset,sourceCount:source.length,printedCount:printed.length,sourceToPrinted,pages:[...new Set(printed.map(w=>w.page))]};
  if(source.length!==printed.length)changes.push({verse:verse.key,source,printed:printed.map(w=>w.text),groups:match.groups});
}
if(verses.length!==6236||totalWords!==77432||markerCount!==6236||headers!==114||basmalas!==112)throw new Error('Corpus counts '+JSON.stringify({totalWords,markerCount,headers,basmalas,counts}));
const timing=[];
for(const name of (await fs.readdir(root+'/data/qud')).filter(n=>n.endsWith('.gz'))) {
  const d=JSON.parse(zlib.gunzipSync(await fs.readFile(root+'/data/qud/'+name)));
  let checked=0; const failures=[];
  for(const row of d.rows.filter(r=>r[3])) {
    const map=mappings[row[0]];
    const ordinals=row[5].map(w=>w[0]);
    if(!map||Math.max(...ordinals)!==map.sourceCount||ordinals.some(i=>i<1||i>map.sourceCount))failures.push(row[0]);
    checked++;
  }
  timing.push({name,canonicalVerses:checked,ordinalRangeFailures:failures,lexicalTimingProof:false});
}
const report={edition:pins.edition,pages:604,verses:verses.length,words:totalWords,fragments,markers:markerCount,headers,basmalas,changes,sizes,timing,
  textValidation:'All verse letter skeletons aligned uniquely; not a diacritic or authoritative print certification',
  productionReady:false,blockers:['Independent authorized print comparison','15:7 needs reviewed ink partition for separate legacy word highlights','Provider lexical timing certification','Real Android/device parity and performance']};
await fs.writeFile(out+'/lab/word-map.json',JSON.stringify(mappings));
await fs.writeFile(out+'/lab/manifest.json',JSON.stringify({edition:pins.edition,pins,pages,files}));
await fs.writeFile(out+'/lab/validation-data.json',JSON.stringify(report,null,2));
for(const [name,dir] of [['SVG',svgDir],['QVP',qvp]]) for(const file of ['LICENSE','NOTICE.md','VERSION.json']) {
  const data=await fs.readFile(dir+'/'+file).catch(()=>null);if(data)await fs.writeFile(out+'/lab/'+name+'-'+file,data);
}
await fs.copyFile(root+'/tests/madinah-engine/vendor/LICENSE',out+'/lab/ENGINE-LICENSE');
let html=await fs.readFile(root+'/quran.html','utf8');
const legacy=html.replace('src="mushaf-audio.js"','src="lab/legacy-mushaf-audio.js"').split('\n').filter(l=>!l.includes('src="service-worker-register.js"')).join('\n');
await fs.writeFile(out+'/legacy-quran.html',legacy);
await fs.copyFile(root+'/mushaf-audio.js',out+'/lab/legacy-mushaf-audio.js');
for(const file of ['service-worker-register.js','app.js','reader-enhancements.js','reader-layout-polish.js','offline-mishary.js','offline-mishary-sync.js','app-update.js']) html=html.split('\n').filter(l=>!l.includes('src="'+file+'"')).join('\n');
html=html.replace('</head>','<link rel="stylesheet" href="lab/runtime/reader.css">\n</head>');
html=html.replace('</body>','<script type="module" src="lab/runtime/reader.js"></script>\n</body>');
html=html.replace('<title>','<title>مختبر 1441هـ — ');
await fs.writeFile(out+'/quran.html',html);
// Surgical generated-only bridge: every other audio UI/control/download byte is retained.
let audio=await fs.readFile(root+'/mushaf-audio.js','utf8');
const start=audio.indexOf('    function syncHighlight(state) {'), end=audio.indexOf('    // HTMLAudioElement timeupdate',start);
if(start<0||end<0)throw new Error('Audio adapter anchor changed');
audio=audio.slice(0,start)+'    function syncHighlight(state) { window.madinahLab?.syncAudio(state); }\n\n'+audio.slice(end);
const fstart=audio.indexOf('    function followVerse(state) {'), fend=audio.indexOf("    engine.addEventListener('state'",fstart);
if(fstart<0||fend<0)throw new Error('Follow adapter anchor changed');
audio=audio.slice(0,fstart)+'    function followVerse(state) { window.madinahLab?.follow(state); }\n\n'+audio.slice(fend);
await fs.writeFile(out+'/mushaf-audio.js',audio);
// The test package has no public updater. The production channel remains byte-identical.
await fs.writeFile(out+'/android-build-info.js','window.NOOR_ANDROID_BUILD={versionCode:1,updateManifestUrl:""};\n');
await fs.copyFile(root+'/tests/madinah-engine/sw.js',out+'/sw-lab.js');
await fs.writeFile(out+'/service-worker-register.js',"navigator.serviceWorker?.register('./sw-lab.js');\n");
const actions=await fs.readFile(root+'/verse-actions.js','utf8');
const needle='const verse = verseFromTarget(event.target);';
if(!actions.includes(needle))throw new Error('Long-press adapter anchor changed');
await fs.writeFile(out+'/verse-actions.js',actions.replace(needle,'const verse = verseFromTarget(window.madinahLab?.wordFromPoint(event.clientX, event.clientY) || event.target);'));
const offline=[];
async function walk(dir,prefix='') {for(const e of await fs.readdir(dir,{withFileTypes:true})){
 const rel=prefix+e.name;if(rel.startsWith('lab/reference')||rel==='legacy-quran.html'||rel==='sw.js')continue;
 if(e.isDirectory())await walk(dir+'/'+e.name,rel+'/');else offline.push(rel);
}}
await walk(out);await fs.writeFile(out+'/lab/offline-files.json',JSON.stringify(offline));
console.log(JSON.stringify({...report,timing:timing.map(x=>({name:x.name,failures:x.ordinalRangeFailures.length}))},null,2));
