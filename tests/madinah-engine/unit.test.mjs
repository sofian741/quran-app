import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {alignWords,parseTanzil,splitWords,mapTimingWord,timingRange} from './text-map.mjs';
import {decodeGeometry} from './vendor/lite.mjs';
const root=new URL('../../',import.meta.url);
test('all 200 production files remain byte identical to phase-zero baseline',()=>{
  const inventory=JSON.parse(fs.readFileSync(new URL('docs/MUSHAF_ENGINE_FILE_INVENTORY.json',root)));
  for(const item of inventory.files){const bytes=fs.readFileSync(new URL(item.path,root));const hash=crypto.createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');assert.equal(hash,item.blob,item.path);}
});
test('Tanzil stays the immutable copy/search source with all 6236 references',()=>{
  const raw=fs.readFileSync(new URL('data/quran-uthmani.txt',root),'utf8'),vs=parseTanzil(raw);
  assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),'aa0bf9278a177a12e6d9bef621ce37a1d24fa35168b5ae9c13ebcbe01e3686cf');assert.equal(vs.length,6236);assert.equal(new Set(vs.map(v=>v.key)).size,6236);
  assert.deepEqual(splitWords('قَوْل ۖ ۞ كَلِمَة'),['قَوْل\u202fۖ','۞كَلِمَة']);
});
test('equal counts alone cannot establish identity, and order cannot be changed',()=>{
  assert.equal(alignWords(['قال','الله'],['قال','رب']).status,'unresolved');
  assert.equal(alignWords(['قال','الله'],['الله','قال']).status,'unresolved');
});
test('split and fused word maps preserve explicit source and print identities',()=>{
  const match=alignWords(['لَّوْ','مَا','تَأْتِينَا'],['لَّوْمَا','تَأْتِينَا']);assert.equal(match.status,'exact-skeleton');assert.deepEqual(match.groups[0],{source:[0,2],printed:[0,1]});
  assert.equal(alignWords(['بعدما'],['بعد','ما']).status,'exact-skeleton');
});
test('mapping uses full verse ordinals, rejects unknown bases and preserves grouped segments',()=>{
  const v={status:'exact-skeleton',sourceToPrinted:[['15:7:1'],['15:7:1'],['15:7:2']]};
  assert.deepEqual(mapTimingWord(v,2),['15:7:1']);assert.deepEqual(mapTimingWord(v,3),['15:7:2']);
  assert.deepEqual(timingRange(v,{word:1,endWord:3}),['15:7:1','15:7:2']);
  assert.equal(mapTimingWord(v,4),null);assert.equal(mapTimingWord(v,1,'unverified-provider'),null);assert.throws(()=>mapTimingWord(v,0));assert.equal(timingRange(v,{word:2,endWord:1}),null);
});
test('QVP decoder fails closed on truncated/corrupt input',()=>{
  assert.throws(()=>decodeGeometry(new Uint8Array(10)),/Truncated/);assert.throws(()=>decodeGeometry(new Uint8Array(64)),/Expected/);
});
test('Android text zoom guard and production registration order remain intact',()=>{
  assert.match(fs.readFileSync(new URL('android-native/MushafTextScale.java',root),'utf8'),/settings\.setTextZoom\(100\)/);
  const script=fs.readFileSync(new URL('scripts/register-background-downloads.py',root),'utf8');assert.match(script,/registerPlugin\(MushafTextScale\.class\)/);
});
