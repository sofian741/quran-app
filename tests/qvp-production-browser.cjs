'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.env.QURAN_BASE_URL||'http://127.0.0.1:4181';
const out=path.resolve(process.env.QVP_RESULTS||'artifacts/qvp');fs.mkdirSync(out,{recursive:true});
const report={browser:'Chromium desktop; Android behavior simulated only',results:[],screenshots:[],failures:[],pageErrors:[]};
let browser,server;
if(!process.env.QURAN_BASE_URL){
 const http=require('node:http'),root=path.resolve(__dirname,'..');
 server=http.createServer((req,res)=>{try{
  const file=path.join(root,decodeURIComponent(new URL(req.url,base).pathname)==='/'?'index.html':decodeURIComponent(new URL(req.url,base).pathname));
  const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json'};
  res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).on('error',()=>res.writeHead(404).end()).pipe(res);
 }catch{res.writeHead(404).end();}}).listen(4181,'127.0.0.1');
}

(async()=>{
 browser=await chromium.launch({headless:true,executablePath:process.env.QURAN_BROWSER_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'});
 await context.route('https://**/*',r=>r.abort());
 const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>report.pageErrors.push(e.message));
 await page.addInitScript(()=>{if(!localStorage.getItem('quranReaderState'))localStorage.setItem('quranReaderState',JSON.stringify({displayPage:4,surah:2,ayah:17}));localStorage.setItem('quranReaderSettings',JSON.stringify({theme:'mint',fontSize:34,lineHeight:1.42}));localStorage.setItem('qvp-upgrade-sentinel','unchanged');localStorage.setItem('ayat-tour-done-quran-v8','1');localStorage.setItem('ayat-tour-optout-quran-v8','1');HTMLElement.prototype.setPointerCapture=function(){};});
 async function check(name,fn){try{const detail=await fn();report.results.push({name,pass:true,detail});fs.writeFileSync(path.join(out,'browser-progress.json'),JSON.stringify(report,null,2));console.log('PASS',name);}catch(e){report.failures.push({name,error:e.message});console.log('FAIL',name,e.message);}}
 await page.goto(base+'/quran.html');await page.waitForFunction(()=>window.mushafQvp?.metrics.ready);
 assert.equal(await page.evaluate(()=>mushafReader.getCurrentPage()),4);assert.equal(await page.locator('body').getAttribute('data-theme'),'mint');
 await check('all 604 pages load, word hit boxes match pinned geometry and cache stays bounded',async()=>{
  const result=await page.evaluate(async()=>{
   const errors=[],times=[];let words=0;
   for(let n=1;n<=604;n++){
    const begin=performance.now(),ok=await mushafQvp.navigate(n);times.push(performance.now()-begin);
    const g=mushafQvp.getGeometry(),nodes=[...document.querySelectorAll('.madinah-word:not(.madinah-basmala)')];words+=nodes.length;
    if(!ok||g.number!==n||nodes.length!==g.words.length||mushafQvp.metrics.cachePages>3)errors.push(n);
    const frame=document.querySelector('.madinah-frame').getBoundingClientRect(),scale=frame.width/g.width;
    for(let i=0;i<nodes.length;i++){const r=nodes[i].getBoundingClientRect(),w=g.words[i];if(Math.abs(r.left-(frame.left+w.box[0]*scale))>.15||Math.abs(r.top-(frame.top+w.box[1]*scale))>.15)errors.push(n+':'+i);}
   }
   times.sort((a,b)=>a-b);return {errors,words,p50:times[302],p95:times[573],max:times.at(-1),cache:mushafQvp.metrics.cachePages,heap:performance.memory?.usedJSHeapSize};
  });assert.deepEqual(result.errors,[]);assert.equal(result.words,77432);return result;
 });
 await check('plain pages share the same row grid and actual bottom-row touch uses the taller coordinate space',async()=>{
  const grids=await page.evaluate(async()=>{
   const result=[];for(const n of [3,4,48,100]){await mushafQvp.navigate(n);const g=mushafQvp.getGeometry(),f=document.querySelector('.madinah-frame').getBoundingClientRect();result.push({height:g.height,centres:g.layoutStats.centres.map(y=>f.top+y*f.height/g.height)});}return result;
  });assert.ok(grids.every(g=>g.height===760));for(const g of grids)assert.deepEqual(g.centres,grids[0].centres);
  await page.evaluate(()=>mushafQvp.navigate(604));
  const word=page.locator('.madinah-word[data-word-key="114:6:1"]'),box=await word.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.waitForTimeout(620);await page.mouse.up();
  await page.waitForFunction(()=>mushafVerseActions.getSelectedVerse()?.verseKey==='114:6');await page.evaluate(()=>mushafVerseActions.close());
 });
 await check('surah frames have a visible palette, fit all three headings and remain readable in dark mode',async()=>{
  await page.evaluate(()=>mushafQvp.navigate(604));
  assert.equal(await page.locator('.madinah-heritage-heading').count(),3);
  const palette=await page.locator('.ornament-frame-outer').evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n).fill));assert.ok(palette.every(c=>c!=='none'&&c!=='rgba(0, 0, 0, 0)'));
  await page.locator('#open-settings').evaluate(n=>n.click());await page.locator('[data-theme-choice="dark"]').click();
  assert.equal(await page.locator('.ornament-cartouche').first().evaluate(n=>getComputedStyle(n).fill),'rgb(32, 46, 41)');
  await page.locator('[data-theme-choice="paper"]').click();await page.locator('#close-settings').click();
 });
 await check('five viewports retain exact printed geometry on varied pages',async()=>{
  const sizes=[[320,568],[390,844],[430,932],[768,1024],[1024,1366]], samples=[1,2,3,4,48,77,187,208,262,282,428,451,602,604];let cases=0;
  for(const [width,height]of sizes){await page.setViewportSize({width,height});for(const n of samples){await page.evaluate(n=>mushafQvp.navigate(n),n);await page.waitForTimeout(20);const r=await page.evaluate(()=>{const t=document.querySelector('#quran-text').getBoundingClientRect(),f=document.querySelector('.madinah-frame').getBoundingClientRect();return {inside:f.left>=t.left-.1&&f.right<=t.right+.1&&f.top>=t.top-.1&&f.bottom<=t.bottom+.1,pixels:mushafQvp.metrics.canvasPixels};});assert.ok(r.inside,'page '+n+' '+width);assert.ok(r.pixels<=3010000);cases++;}}
  return {cases};
 });
 await page.setViewportSize({width:390,height:844});
 await check('word tap and genuine long-press menu, favorites, copy, tafsir and sharing',async()=>{
  await page.evaluate(()=>mushafQvp.navigate(4));
  const target=page.locator('.madinah-word[data-word-key="2:17:1"]');await target.click();
  assert.ok(await page.evaluate(()=>mushafQvp.metrics.wordTaps)>0);
  const box=await target.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.waitForTimeout(620);await page.mouse.up();
  await page.waitForFunction(()=>mushafVerseActions.getSelectedVerse()?.verseKey==='2:17');
  assert.ok(await page.locator('.verse-highlight-band').count()>0);
  await page.locator('[data-verse-action="bookmark"]').click();assert.ok((await page.evaluate(()=>JSON.parse(localStorage.quranVerseFavoritesV1))).includes('2:17'));
  await page.evaluate(()=>{window.__copied='';Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async t=>window.__copied=t}});});
  await page.locator('[data-verse-action="copy"]').click();assert.ok((await page.evaluate(()=>window.__copied)).startsWith('مَثَلُهُمْ'));
  await page.evaluate(()=>mushafVerseActions.openForVerse(2,17));await page.locator('[data-verse-action="tafsir"]').click();await page.waitForFunction(()=>!document.getElementById('tafsir-explanation').hidden);await page.locator('#close-tafsir').click();
  await page.evaluate(()=>mushafVerseActions.openForVerse(2,17));await page.locator('[data-verse-action="share"]').click();await page.waitForFunction(()=>document.getElementById('share-preview').src.startsWith('blob:'));await page.locator('#close-share').click();
 });
 await check('word and verse highlighting use timed words, fused mapping, gaps and multi-line verses',async()=>{
  const result=await page.evaluate(async()=>{
   await mushafQvp.navigate(262);const state={playing:true,provider:'quran-foundation',reciterId:9000,surah:15,ayah:7,currentTime:1.5,timing:{timestampFrom:0,timestampTo:6000,segments:[{word:1,start:0,end:1000},{word:2,start:1000,end:2000},{word:3,start:2500,end:3500}]}};
   mushafQvp.syncAudio(state);const first=[...document.querySelectorAll('.is-audio-word')].map(w=>w.dataset.wordKey);
   state.currentTime=2.2;mushafQvp.syncAudio(state);const gap=document.querySelectorAll('.is-audio-word').length;
   state.currentTime=3;mushafQvp.syncAudio(state);const third=[...document.querySelectorAll('.is-audio-word')].map(w=>w.dataset.wordKey);
   state.playing=false;mushafQvp.syncAudio(state);const stopped=document.querySelectorAll('.is-audio-word,.audio-verse-band').length;
   await mushafQvp.navigate(48);mushafQvp.syncAudio({playing:true,provider:'quran-foundation',reciterId:9000,surah:2,ayah:282,currentTime:1,timing:{timestampFrom:0,timestampTo:3000,segments:[{word:1,start:0,end:3000}]}});
   return {first,gap,third,stopped,bands:document.querySelectorAll('.audio-verse-band').length};
  });assert.deepEqual(result.first,['15:7:1~2']);assert.equal(result.gap,0);assert.deepEqual(result.third,['15:7:2']);assert.equal(result.stopped,0);assert.ok(result.bands>=10);return result;
 });
 await check('active word recolors its QVP ink in emerald without a box or outline',async()=>{
  const result=await page.evaluate(async()=>{
   await mushafQvp.navigate(4);const canvas=document.querySelector('.madinah-frame canvas'),ctx=canvas.getContext('2d');
   const before=ctx.getImageData(0,0,canvas.width,canvas.height).data;
   mushafQvp.syncAudio({playing:true,provider:'quran-foundation',reciterId:9000,surah:2,ayah:17,currentTime:1,timing:{timestampFrom:0,timestampTo:3000,segments:[{word:1,start:0,end:3000}]}});
   const after=ctx.getImageData(0,0,canvas.width,canvas.height).data,node=document.querySelector('.is-audio-word[data-word-key="2:17:1"]'),style=getComputedStyle(node);
   let changed=0,emerald=0;for(let i=0;i<after.length;i+=4)if(before[i]!==after[i]||before[i+1]!==after[i+1]||before[i+2]!==after[i+2]){changed++;if(after[i]<60&&after[i+1]>75&&after[i+2]>65)emerald++;}
   return {changed,emerald,background:style.backgroundColor,outline:style.outlineStyle};
  });assert.ok(result.changed>20);assert.ok(result.emerald>20);assert.equal(result.background,'rgba(0, 0, 0, 0)');assert.equal(result.outline,'none');return result;
 });
 await check('basmala selection targets verse 1 without shifting audio ordinals; Tawba has no basmala',async()=>{
  await page.evaluate(()=>mushafQvp.navigate(2));
  const basmala=page.locator('.madinah-basmala');assert.equal(await basmala.count(),1);
  const box=await basmala.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.waitForTimeout(620);await page.mouse.up();
  await page.waitForFunction(()=>mushafVerseActions.getSelectedVerse()?.verseKey==='2:1');await page.evaluate(()=>mushafVerseActions.close());
  await page.evaluate(()=>mushafQvp.navigate(187));assert.equal(await page.locator('.madinah-basmala').count(),0);
 });
 await check('15:7 first two source tokens have separate contours, timing cues, and hit targets',async()=>{
  const result=await page.evaluate(async()=>{
   await mushafQvp.navigate(262);const state={playing:true,provider:'quran-foundation',reciterId:9000,surah:15,ayah:7,currentTime:.5,timing:{timestampFrom:0,timestampTo:3000,segments:[{word:1,start:0,end:1000},{word:2,start:1000,end:2000}]}};
   mushafQvp.syncAudio(state);const a=[...document.querySelectorAll('.is-audio-word')].map(n=>n.dataset.wordKey);state.currentTime=1.5;mushafQvp.syncAudio(state);const b=[...document.querySelectorAll('.is-audio-word')].map(n=>n.dataset.wordKey);state.playing=false;mushafQvp.syncAudio(state);return {a,b};
  });assert.deepEqual(result,{a:['15:7:1~1'],b:['15:7:1~2']});
 });
 await check('real AudioEngine event pipeline produces word cues with local mocked media',async()=>{
  // This exercises the existing UI/event subscriber. No real reciter audio claim.
  await page.evaluate(async()=>{await mushafQvp.navigate(4);const snapshot=quranAudioEngine.snapshot();const fake={...snapshot,playing:true,provider:'quran-foundation',reciterId:9000,surah:2,ayah:17,currentTime:1,timing:{timestampFrom:0,timestampTo:3000,segments:[{word:1,start:0,end:3000}]}};quranAudioEngine.snapshot=()=>fake;quranAudioEngine.dispatchEvent(new CustomEvent('time',{detail:fake}));});
  await page.waitForFunction(()=>document.querySelector('.is-audio-word[data-word-key="2:17:1"]'));
 });
 await check('index, offline search, marker and restore after reload',async()=>{
  await page.locator('#open-index').evaluate(n=>n.click());await page.locator('#index-surah-search').fill('البقرة');assert.equal(await page.locator('#index-list .index-entry').count(),1);await page.locator('#close-index').click();
  await page.locator('#open-quran-search').evaluate(n=>n.click());await page.locator('#quran-search-input').fill('الحمد');await page.waitForFunction(()=>document.querySelectorAll('.quran-search-result').length>0);await page.locator('#close-quran-search').click();
  await page.evaluate(()=>mushafQvp.navigate(208));await page.locator('#toggle-page-marker').evaluate(n=>n.click());assert.equal(await page.evaluate(()=>JSON.parse(localStorage.quranPageMarkerV1)),208);
  await page.reload();await page.waitForFunction(()=>window.mushafReader?.getCurrentPage()===208&&window.mushafQvp?.metrics.ready&&window.mushafQvp?.getGeometry()?.number===208);
  assert.equal(await page.evaluate(()=>localStorage.getItem('qvp-upgrade-sentinel')),'unchanged');
 });
 await check('zoom simulation suppresses page turns and supports reverse navigation',async()=>{
  await page.evaluate(()=>mushafQvp.navigate(4));
  const drag=()=>page.evaluate(()=>{const stage=document.querySelector('#reader-stage');for(const [type,x]of [['pointerdown',50],['pointermove',250],['pointerup',250]])stage.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerType:'touch',pointerId:12,clientX:x,clientY:350,button:0}));});
  await page.evaluate(()=>{Object.defineProperty(visualViewport,'scale',{configurable:true,get:()=>1.5});visualViewport.dispatchEvent(new Event('resize'));});await drag();assert.equal(await page.evaluate(()=>mushafReader.getCurrentPage()),4);
  await page.evaluate(()=>{Object.defineProperty(visualViewport,'scale',{configurable:true,get:()=>1});visualViewport.dispatchEvent(new Event('resize'));});await drag();await page.waitForFunction(()=>mushafReader.getCurrentPage()===5);await page.evaluate(()=>mushafQvp.navigate(4));
 });
 await check('adjacent page preview, themes, verse marker, saved panel and normalized index search',async()=>{
  await page.evaluate(()=>mushafQvp.navigate(4));await page.waitForFunction(()=>mushafQvp.getPreparedPages().includes(5));
  const preview=await page.evaluate(()=>{const s=document.querySelector('#reader-stage');for(const [type,x]of [['pointerdown',50],['pointermove',110]])s.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerType:'touch',pointerId:15,clientX:x,clientY:350,button:0}));const shown=!!document.querySelector('.swipe-preview canvas');s.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerType:'touch',pointerId:15}));return shown;});assert.equal(preview,true);
  await page.locator('#open-settings').evaluate(n=>n.click());await page.locator('[data-theme-choice="dark"]').click();assert.equal(await page.locator('body').getAttribute('data-theme'),'dark');await page.locator('[data-theme-choice="paper"]').click();await page.locator('#close-settings').click();
  await page.evaluate(()=>mushafVerseActions.openForVerse(2,17));await page.locator('[data-verse-action="reading-marker"]').click();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.quranReadingMarkerV1).ayah),17);await page.evaluate(()=>mushafVerseActions.close());
  await page.locator('#open-saved').evaluate(n=>n.click());assert.ok(await page.locator('#saved-list').textContent());await page.locator('#close-saved').click();
  await page.locator('#open-index').evaluate(n=>n.click());await page.locator('#index-surah-search').fill('البقرة');await page.locator('.index-ayah-toggle').click();await page.locator('.index-ayah-search').fill('مثلهم');assert.equal(await page.locator('.index-ayah-result').count(),1);await page.locator('#close-index').click();
 });
 await check('failed and out-of-order page loads preserve last accepted position',async()=>{
  await page.evaluate(()=>mushafQvp.navigate(4));await page.route('**/data/qvp/pages/050.qvp',r=>r.fulfill({status:503,body:'unavailable'}));
  const result=await page.evaluate(async()=>({ok:await mushafQvp.navigate(50),current:mushafReader.getCurrentPage(),saved:JSON.parse(localStorage.quranReaderState).displayPage}));assert.equal(result.ok,false);assert.equal(result.current,4);assert.equal(result.saved,4);await page.unroute('**/data/qvp/pages/050.qvp');
  await page.evaluate(async()=>{await Promise.all([mushafQvp.navigate(48),mushafQvp.navigate(602)]);});assert.equal(await page.evaluate(()=>mushafReader.getCurrentPage()),602);
 });
 for(const n of [1,2,3,4,48,77,187,208,262,282,428,451,602,604]){await page.evaluate(n=>mushafQvp.navigate(n),n);const file='page-'+String(n).padStart(3,'0')+'-390x844.png';await page.screenshot({path:path.join(out,file)});report.screenshots.push(file);}
 await context.close();
 await check('complete local shell and all 604 pages reopen with browser network offline',async()=>{
  const c=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'allow'});await c.route('https://**/*',r=>r.abort());const p=await c.newPage();await p.goto(base+'/quran.html');await p.waitForFunction(()=>window.mushafQvp?.metrics.ready);await p.evaluate(()=>navigator.serviceWorker.ready);const installed={pages:604};
  await p.reload();await p.waitForFunction(()=>navigator.serviceWorker.controller&&window.mushafQvp?.getGeometry());await c.setOffline(true);await p.reload();await p.waitForFunction(()=>window.mushafQvp?.metrics.ready);
  const all=await p.evaluate(async()=>{let count=0;for(let n=1;n<=604;n++)if(await mushafQvp.navigate(n))count++;return count;});assert.equal(all,604);await c.close();return {...installed,offlinePages:all};
 });
 await browser.close();server?.close();report.completed=true;fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(report,null,2));assert.deepEqual(report.failures,[]);assert.deepEqual(report.pageErrors,[]);
})().catch(async e=>{report.error=e.stack;fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(report,null,2));await browser?.close();server?.close();console.error(e);process.exitCode=1;});
