import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {decodeGeometry} from '../mushaf-qvp/vendor/lite.js';
import {timingRange} from '../mushaf-qvp/text-map.js';
import {SUBWORDS,subwordBox} from '../mushaf-qvp/subwords.js';
import {sha256Fallback} from '../mushaf-qvp/integrity.js';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url));
const json=p=>JSON.parse(read(p));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
test('604 pinned pages, 6236 markers, 114 headings and 112 basmalas remain complete and ordered',()=>{
 const manifest=json('data/qvp/manifest.json'),maps=json('data/qvp/word-map.json');let words=0,markers=0,basmalas=0,headers=0;const seen=new Set();
 assert.equal(manifest.pages.length,604);assert.equal(Object.keys(maps).length,6236);
 for(let page=1;page<=604;page++){
  const name=String(page).padStart(3,'0')+'.qvp',bytes=read('data/qvp/pages/'+name);assert.equal(sha(bytes),manifest.files[name].sha256);
  assert.equal(sha256Fallback(bytes),manifest.files[name].sha256,'LAN hash '+name);
  const g=decodeGeometry(bytes);assert.equal(g.number,page);assert.equal(g.lines.length,page<=2?8:15);words+=g.words.length;
  for(const w of g.words){const key=w.surah+':'+w.ayah+':'+w.word;assert.ok(!seen.has(key));seen.add(key);assert.ok(maps[w.surah+':'+w.ayah].pages.includes(page));}
  for(const d of g.decorations){if(d.decoration===0)markers++;if(d.decoration===1)headers++;if(d.decoration===2){basmalas++;assert.ok(![1,9].includes(d.surah));assert.ok(g.lines[d.lineIndex]);}}
 }
 assert.deepEqual({words,markers,headers,basmalas},{words:77432,markers:6236,headers:114,basmalas:112});
});
test('portable SHA-256 handles empty, padding boundaries, UTF-8 and offset buffers',()=>{
 for(const size of [0,1,55,56,63,64,65,127,128,1000]){
  const data=crypto.randomBytes(size+17).subarray(17);assert.equal(sha256Fallback(data),sha(data));
 }
 const arabic=Buffer.from('القرآن الكريم');assert.equal(sha256Fallback(arabic),sha(arabic));
});
test('15:7 subword paths form an exhaustive, nonduplicated partition and keep later ordinals correct',()=>{
 const g=decodeGeometry(read('data/qvp/pages/262.qvp')),w=g.words.find(w=>w.surah===15&&w.ayah===7&&w.word===1),parts=SUBWORDS['15:7:1'];
 assert.equal(w.text,'لَّوْمَا');assert.deepEqual(parts.flatMap(p=>p.paths),Array.from({length:w.nPaths},(_,i)=>w.firstPath+i));
 assert.ok(subwordBox(g,parts[0])[0]>subwordBox(g,parts[1])[0]);
 const map=json('data/qvp/word-map.json')['15:7'];assert.equal(map.sourceCount,8);assert.equal(map.printedCount,7);
 assert.deepEqual(timingRange(map,{word:1}),['15:7:1~1']);assert.deepEqual(timingRange(map,{word:2}),['15:7:1~2']);assert.deepEqual(timingRange(map,{word:3}),['15:7:2']);
 assert.deepEqual(timingRange(map,{word:1,endWord:2}),['15:7:1~1','15:7:1~2']);assert.equal(timingRange(map,{word:9}),null);
});
test('Tanzil, timing corpora, app identity, QVP-only startup and Android text zoom are retained',()=>{
 assert.equal(sha(read('data/quran-uthmani.txt')),json('mushaf-qvp/sources.json').tanzilSha256);
 const report=json('data/qvp/validation-data.json');assert.equal(report.timing.length,19);assert.ok(report.timing.every(r=>r.ordinalRangeFailures.length===0));
 assert.equal(json('capacitor.config.json').appId,'com.sofian.nooralquran');
 assert.match(read('android-native/MushafTextScale.java').toString(),/settings\.setTextZoom\(100\)/);
 assert.match(read('quran.html').toString(),/mushaf-qvp\/boot\.js/);
 assert.match(read('mushaf-qvp/boot.js').toString(),/reader\.js/);
 for(const file of ['app.js','reader-enhancements.js','reader-layout-polish.js','mushaf-engine-loader.js','mushaf-layout-prewarm-worker.js','data/mushaf-layout.json'])assert.equal(fs.existsSync(new URL('../'+file,import.meta.url)),false,file+' obsolete');
});

// Ornamentation never replaces the fixed QVP Quran text or glyph geometry.
test('heritage surah frame is visual-only and ayah markers use original QVP paths',()=>{
 const source=read('mushaf-qvp/reader.js').toString();
 const art=read('mushaf-qvp/heritage-ornament.js').toString();
 assert.match(source,/createHeritageHeading/);
 assert.match(source,/g\.decorations\.filter\(d=>d\.decoration===1\)/);
 assert.match(source,/item\.geometry\.decorations\.filter\(d=>d\.decoration===0\)/);
 assert.match(art,/maskUnits="userSpaceOnUse"/);
 assert.match(art,/ornament-frame-outer/);
 assert.ok(!art.includes('surah-title-chapter'),'QVP surah text must not be replaced');
});
