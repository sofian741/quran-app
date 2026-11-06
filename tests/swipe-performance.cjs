// QVP swipe regression: the already-painted adjacent page follows the finger.
'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..');

(async()=>{
 const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json'};
 const server=http.createServer((request,response)=>{const pathname=decodeURIComponent(new URL(request.url,'http://127.0.0.1').pathname),file=path.join(root,pathname==='/'?'quran.html':pathname);response.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).on('error',()=>response.writeHead(404).end()).pipe(response);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,...(process.env.QURAN_BROWSER_PATH||fs.existsSync('/usr/bin/chromium')?{executablePath:process.env.QURAN_BROWSER_PATH||'/usr/bin/chromium'}:{})});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
  await page.addInitScript(()=>{localStorage.setItem('ayat-tour-done-quran-v8','1');localStorage.setItem('ayat-tour-optout-quran-v8','1');HTMLElement.prototype.setPointerCapture=function(){};});
  await page.emulateMedia({reducedMotion:'no-preference'});const url=`http://127.0.0.1:${server.address().port}/quran.html`,timings=[];
  await page.goto(url);await page.waitForFunction(()=>window.mushafQvp?.metrics.ready);
  async function open(number){await page.evaluate(number=>mushafQvp.navigate(number),number);await page.waitForFunction(number=>mushafReader.getCurrentPage()===number,number);}
  async function drag(direction,target){
   await page.waitForFunction(target=>mushafQvp.getPreparedPages().includes(target),target);
   const held=await page.evaluate(({direction,target})=>{const stage=document.querySelector('#reader-stage'),rect=stage.getBoundingClientRect(),x=rect.left+rect.width/2,y=rect.top+rect.height/2,emit=(type,dx)=>stage.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:73,pointerType:'touch',clientX:x+dx,clientY:y,button:0}));
    emit('pointerdown',0);const start=performance.now();emit('pointermove',direction*130);const duration=performance.now()-start,current=document.querySelector('#mushaf-page').getBoundingClientRect(),preview=document.querySelector('.swipe-preview')?.getBoundingClientRect();return {duration,prepared:mushafQvp.getPreparedPages().includes(target),target:document.querySelector('.swipe-preview')?.dataset.target,seam:preview?Math.min(Math.abs(current.left-preview.right),Math.abs(current.right-preview.left)):Infinity};
   },{direction,target});
   assert.equal(held.prepared,true);assert.equal(held.target,String(target));assert.ok(held.seam<1);assert.ok(held.duration<12,`slow prepared pointermove: ${held.duration}ms`);timings.push(held.duration);
   await page.evaluate(direction=>{const stage=document.querySelector('#reader-stage'),rect=stage.getBoundingClientRect();stage.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true,pointerId:73,pointerType:'touch',clientX:rect.left+rect.width/2+direction*130,clientY:rect.top+rect.height/2,button:0}));},direction);
   await page.waitForFunction(target=>mushafReader.getCurrentPage()===target&&!document.querySelector('.swipe-preview'),target);
  }
  for(const [width,height,start]of [[390,844,223],[320,568,602]]){await page.setViewportSize({width,height});await open(start);await drag(1,start+1);await drag(-1,start);}
  assert.ok(Math.max(...timings)<12);console.log(`PASS: ${timings.length} QVP live-page drags; pointermove ${Math.max(...timings).toFixed(2)}ms max.`);
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
