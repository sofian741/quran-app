#!/usr/bin/env node
'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.QURAN_BASE_URL||'http://127.0.0.1:4173';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
 try {
  const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
  await page.goto(base+'/quran.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.QuranQud?.reciters?.length===22&&window.quranAudioEngine&&document.querySelector('#audio-reciter option[value="aligned:9000"]'),null,{timeout:30000});
  for(const id of [9000,9021]){
   await page.evaluate(id=>{
    const e=window.quranAudioEngine;
    e.pause();
    const picker=document.querySelector('#audio-reciter');
    picker.value='aligned:'+id;
    picker.dispatchEvent(new Event('change',{bubbles:true}));
   },id);
   await page.waitForFunction(id=>window.quranAudioEngine.state.reciterId===id&&['ready','error'].includes(window.quranAudioEngine.status),id,{timeout:35000});
   const before=await page.evaluate(()=>{const e=window.quranAudioEngine;return {name:e.state.reciterName,url:e.trackUrl,status:e.status,error:e.error,readyState:e.audio.readyState,networkState:e.audio.networkState}});
   console.log('REAL BEFORE '+id+' '+JSON.stringify(before));
   if(before.status==='error')continue;
   await page.locator('#audio-play').click();
   await page.waitForTimeout(9000);
   const after=await page.evaluate(()=>{const e=window.quranAudioEngine;return {status:e.status,error:e.error,time:e.audio.currentTime,paused:e.audio.paused,readyState:e.audio.readyState,networkState:e.audio.networkState,mediaError:e.audio.error?.code||null,src:e.audio.currentSrc}});
   console.log('REAL AFTER '+id+' '+JSON.stringify(after));
   if(id===9000)assert.ok(after.time>0.3&&!after.paused,'Maher actual MP3 must advance: '+JSON.stringify(after));
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
