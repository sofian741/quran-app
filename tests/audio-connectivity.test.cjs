'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('audio-connectivity.js','utf8');
function setup({online=true,reachable=true}={}){
  const window={};
  const requests=[];
  vm.runInNewContext(source,{
    window,navigator:{onLine:online},
    fetch:async(url)=>{requests.push(url);if(!reachable)throw Error('Network unreachable');return {type:'opaque'};},
    AbortController,Date,Number,Promise,setTimeout,clearTimeout
  });
  return {api:window.QuranAudioConnectivity,requests};
}
test('offline indicator immediately reports no internet',async()=>{
  const {api,requests}=setup({online:false});
  assert.equal(await api.isOffline(),true);
  assert.equal(requests.length,0);
});
test('WebView online flag is unreliable: both failed external probes mean offline',async()=>{
  const {api,requests}=setup({online:true,reachable:false});
  assert.equal(await api.isOffline(),true);
  assert.equal(requests.length,2);
  assert.match(api.OFFLINE_MESSAGE,/لا يوجد اتصال بالإنترنت/);
});
test('reachable remote source is online',async()=>{
  const {api,requests}=setup({online:true,reachable:true});
  assert.equal(await api.isOffline(),false);
  assert.equal(requests.length,1);
});
test('HTTP 404 and English fetch errors never appear in player text',()=>{
  const {api}=setup();
  for(const raw of ['Quran audio HTTP 404','Failed to fetch','HTTP 503','NetworkError when attempting to fetch resource']){
    assert.doesNotMatch(api.safeError(raw),/404|503|Failed|NetworkError/i);
    assert.match(api.safeError(raw),/تعذّر/);
  }
});
