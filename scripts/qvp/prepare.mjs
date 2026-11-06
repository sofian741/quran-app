// Deterministic production assets, verified against pinned release digests.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {decodeGeometry} from '../../mushaf-qvp/vendor/lite.js';
import {layoutGeometry, maxSafeMarkerScale, GRID} from '../../mushaf-qvp/line-layout.js';
import {parseTanzil, splitWords, alignWords} from '../../mushaf-qvp/text-map.js';
const root = path.resolve(import.meta.dirname, '../..');
const pins = JSON.parse(await fs.readFile(root+'/mushaf-qvp/sources.json'));
const cache = path.resolve(process.env.QVP_CACHE_DIR || root+'/.cache/qvp');
const out = root+'/data/qvp', qvp=path.join(cache,'qvp',pins.qvp.root);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
if(sha(await fs.readFile(cache+'/qvp.tar.gz'))!==pins.qvp.sha256)throw new Error('Unverified QVP archive');
const raw = await fs.readFile(root+'/data/quran-uthmani.txt','utf8');
if (sha(raw)!==pins.tanzilSha256) throw new Error('Tanzil changed');
const verses = parseTanzil(raw), byVerse = new Map(), pages = [], files = {}, sizes = {qvp:0, svg:0, sidecars:0};
const qvpVersion=await fs.readFile(qvp+'/VERSION.json');
if(sha(qvpVersion)!==pins.qvp.versionSha256)throw new Error('Untrusted extracted manifest');
const version = JSON.parse(qvpVersion);
if(version.source_version!=='v1.1.2'||version.pages!==604) throw new Error('Wrong data edition');
await fs.mkdir(out,{recursive:true});
await fs.mkdir(out+'/pages',{recursive:true});
let previousKey=[0,0,0], totalWords=0, fragments=0, markerCount=0, headers=0, basmalas=0;
let uniformInkScale=GRID.maxInkScale,limitingPage=0;
const markerKeys = new Set(), counts = {};
for(let n=1;n<=604;n++) {
  const id=String(n).padStart(3,'0'), bytes=await fs.readFile(qvp+'/'+id+'.qvp');
  const sidecarBytes=await fs.readFile(qvp+'/'+id+'.words.json');
  if(sha(bytes)!==version.files[id+'.qvp'] || sha(sidecarBytes)!==version.files[id+'.words.json']) throw new Error('QVP file digest '+id);
  const g=decodeGeometry(bytes), words=JSON.parse(sidecarBytes);
  if(g.number!==n||g.width!==345||g.height!==550||g.lines.length!==(n<=2?8:15)) throw new Error('Page geometry '+id);
  if(n>=3){
    const fitted=layoutGeometry(decodeGeometry(bytes),{calibrate:true}).layoutStats.inkScale;
    if(fitted<uniformInkScale){uniformInkScale=fitted;limitingPage=n;}
  }
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
  sizes.qvp+=bytes.length;sizes.sidecars+=sidecarBytes.length;
  files[id+'.qvp']={sha256:sha(bytes),bytes:bytes.length};
  pages.push({number:n,words:keys.length,lines:g.lines.length,first:keys[0],last:keys.at(-1),qvpSha256:sha(bytes)});
  await fs.writeFile(out+'/pages/'+id+'.qvp',bytes);
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
if(timing.some(t=>t.ordinalRangeFailures.length))throw new Error('Timing ordinal mismatch');
mappings['15:7'].sourceToTiming=mappings['15:7'].sourceToPrinted.map((keys,i)=>i<2?['15:7:1~'+(i+1)]:keys);
const report={edition:pins.edition,pages:604,verses:verses.length,words:totalWords,fragments,markers:markerCount,headers,basmalas,changes,sizes,timing,
  textValidation:'All verse letter skeletons aligned uniquely; not a diacritic or authoritative print certification',
  productionReady:false,blockers:['Independent authorized print comparison','Provider lexical timing certification','Real Android/device parity and performance']};
await fs.writeFile(out+'/word-map.json',JSON.stringify(mappings));
// A second pass fits verse-number cartouches after the shared text scale is known.
let uniformMarkerScale=1.5,markerLimitingPage=0;
for(let n=3;n<=604;n++){
 const id=String(n).padStart(3,'0');
 const geometry=decodeGeometry(await fs.readFile(out+'/pages/'+id+'.qvp'));
 layoutGeometry(geometry,{uniformInkScale});
 const maximum=maxSafeMarkerScale(geometry);
 if(maximum<uniformMarkerScale){uniformMarkerScale=maximum;markerLimitingPage=n;}
}
uniformMarkerScale=Math.floor(uniformMarkerScale*1000)/1000;
if(uniformMarkerScale<1)throw new Error('Invalid shared marker scale');
// Round down once, and use this exact uniform value for every standard page.
uniformInkScale=Math.floor(uniformInkScale*1000)/1000;
if(!Number.isFinite(uniformInkScale)||uniformInkScale<GRID.inkScale)throw new Error('Invalid shared glyph scale');
await fs.writeFile(out+'/manifest.json',JSON.stringify({edition:pins.edition,pins,pages,files,uniformInkScale,limitingPage,uniformMarkerScale,markerLimitingPage,inkStroke:GRID.inkStroke,markerStroke:GRID.markerStroke}));
await fs.writeFile(out+'/validation-data.json',JSON.stringify(report,null,2));

for(const file of ['NOTICE.txt','VERSION.json']) {
 await fs.copyFile(qvp+'/'+file,out+'/'+file);
}
await fs.copyFile(root+'/mushaf-qvp/vendor/LICENSE',out+'/ENGINE-LICENSE');
console.log(JSON.stringify({edition:pins.edition,pages:pages.length,verses:verses.length,words:totalWords,basmalas,uniformInkScale,limitingPage,uniformMarkerScale,markerLimitingPage,timingFailures:timing.reduce((n,t)=>n+t.ordinalRangeFailures.length,0),changes:changes.map(c=>c.verse)},null,2));
