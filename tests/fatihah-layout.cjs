// Focused visual-geometry regression for the two authored opening pages.
'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..');

(async()=>{
 const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json'};
 const server=http.createServer((request,response)=>{
  const pathname=decodeURIComponent(new URL(request.url,'http://127.0.0.1').pathname),file=path.join(root,pathname==='/'?'quran.html':pathname);
  response.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).on('error',()=>response.writeHead(404).end()).pipe(response);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,...(process.env.QURAN_BROWSER_PATH||fs.existsSync('/usr/bin/chromium')?{executablePath:process.env.QURAN_BROWSER_PATH||'/usr/bin/chromium'}:{})});
 try{
  const page=await browser.newPage({reducedMotion:'reduce',serviceWorkers:'block'}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{localStorage.setItem('ayat-tour-done-quran-v8','1');localStorage.setItem('ayat-tour-optout-quran-v8','1');});
  const url=`http://127.0.0.1:${server.address().port}/quran.html`;
  await page.goto(url);await page.waitForFunction(()=>window.mushafQvp?.metrics.ready);
  async function open(number){
   await page.evaluate(number=>mushafQvp.navigate(number),number);
   try{await page.waitForFunction(number=>window.mushafQvp?.metrics.ready&&window.mushafReader?.getCurrentPage()===number,number);}
   catch(error){const state=await page.evaluate(()=>({ready:window.mushafQvp?.metrics.ready,current:window.mushafReader?.getCurrentPage(),saved:localStorage.getItem('quranReaderState')}));throw new Error(`${error.message}; page errors: ${errors.join(' | ')}; state: ${JSON.stringify(state)}`);}
   return page.evaluate(()=>{
    const g=mushafQvp.getGeometry(),text=document.querySelector('#quran-text').getBoundingClientRect(),frame=document.querySelector('.madinah-frame').getBoundingClientRect();
    return {page:g.number,zoom:g.layoutStats.zoom,words:g.words.length,wordNodes:document.querySelectorAll('.madinah-word:not(.madinah-basmala)').length,
     markers:g.decorations.filter(d=>d.decoration===0).length,markerNodes:document.querySelectorAll('.ayah-marker').length,
     frame:[frame.x,frame.y,frame.width,frame.height],inside:frame.left>=text.left-.1&&frame.right<=text.right+.1&&frame.top>=text.top-.1&&frame.bottom<=text.bottom+.1,
     axis:Math.max(frame.width/text.width,frame.height/text.height)};
   });
  }
  let checks=0;
  for(const [width,height]of [[393,852],[320,568]]){
   await page.setViewportSize({width,height});const fatihah=await open(1),baqarah=await open(2);
   assert.equal(fatihah.zoom,1.5);assert.equal(baqarah.zoom,1.5);
   assert.equal(fatihah.words,29);assert.equal(fatihah.wordNodes,fatihah.words);assert.equal(baqarah.wordNodes,baqarah.words);
   assert.equal(fatihah.markers,7);assert.equal(fatihah.markerNodes,fatihah.markers);assert.equal(baqarah.markerNodes,baqarah.markers);
   assert.equal(fatihah.inside,true);assert.equal(baqarah.inside,true);assert.ok(fatihah.axis>.995);assert.ok(baqarah.axis>.995);
   assert.ok(Math.abs(fatihah.frame[2]-baqarah.frame[2])<.1);assert.ok(Math.abs(fatihah.frame[3]-baqarah.frame[3])<.1);checks++;
  }
  assert.deepEqual(errors,[]);console.log(`PASS: ${checks} QVP Fatihah/Baqarah full-page geometry checks.`);
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
