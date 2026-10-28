'use strict';
// Diagnostic only: never changes Mushaf CSS, page data, or reader scripts.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const { chromium }=require('playwright');
const root=path.resolve(__dirname,'..');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const file=path.resolve(root,'.'+pathname);
 if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 fs.readFile(file,(err,bytes)=>{if(err){res.writeHead(404);return res.end('Not found');}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(bytes);});
});
const sizes=[{width:320,height:640},{width:360,height:720},{width:393,height:852},{width:412,height:915}];
const pages=[1,2,183,184];
const reportDir=path.join(root,'artifacts','mushaf-layout');
const round=n=>Math.round(n*100)/100;
async function inspect(page){
 return page.evaluate(()=>{
  const root=document.querySelector('#quran-text'),frame=document.querySelector('#mushaf-page');
  const rect=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
  const lines=[...root.querySelectorAll('.mushaf-line')];
  const bounds=rect(root),tolerance=1;
  const metrics=lines.map((el,i)=>{
   const b=rect(el);
   const descendants=[...el.querySelectorAll('*')].filter(x=>x.getClientRects().length);
   const children=descendants.map(x=>({tag:x.tagName,cls:String(x.className||'').slice(0,90),box:rect(x)}));
   const outside=children.filter(x=>x.box.left<bounds.left-tolerance||x.box.right>bounds.right+tolerance);
   return {index:i+1,box:b,overflowX:outside.slice(0,8),childCount:children.length};
  });
  const collisions=[];
  for(let i=1;i<metrics.length;i++){
   const gap=metrics[i].box.top-metrics[i-1].box.bottom;
   if(gap< -1)collisions.push({first:i,second:i+1,overlapPx:Math.round(-gap*100)/100});
  }
  const horizontal=metrics.filter(x=>x.overflowX.length);
  const css=getComputedStyle(root);
  return {pageNumber:document.querySelector('#display-page-number')?.textContent,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},frame:rect(frame),text:bounds,fontFamily:css.fontFamily,fontSize:css.fontSize,lineHeight:css.lineHeight,lines:metrics.length,verticalCollisions:collisions,horizontalOverflow:horizontal,rootScroll:{height:root.scrollHeight,clientHeight:root.clientHeight,width:root.scrollWidth,clientWidth:root.clientWidth},lineBoxes:metrics.map(x=>x.box)};
 });
}
async function main(){
 fs.mkdirSync(reportDir,{recursive:true});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const results=[];
 try{
  for(const size of sizes){
   const context=await browser.newContext({viewport:size,deviceScaleFactor:1,reducedMotion:'reduce',locale:'ar-EG'});
   const tab=await context.newPage();
   const errors=[];tab.on('pageerror',e=>errors.push(e.message));
   await tab.goto('http://127.0.0.1:'+server.address().port+'/quran.html',{waitUntil:'domcontentloaded'});
   await tab.locator('.mushaf-line').first().waitFor({timeout:30000});
   for(const target of pages){
    if(target!==1 && target!==2){
     // The public index supports Juz navigation; juz 10 begins near pages 182-183.
     // Use the actual reader's swipe/keyboard navigation rather than mutating page data.
     await tab.locator('#open-index').click();
     await tab.locator('[data-index-tab="juz"]').click();
     const rows=tab.locator('#index-list button.index-entry');
     await rows.nth(9).click();
     await tab.waitForTimeout(300);
     for(let attempt=0;attempt<12;attempt++){
      const current=await tab.locator('#display-page-number').innerText();
      const num=Number(current.replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))));
      if(num===target)break;
      if(Math.abs(target-num)>10)throw Error('Juz 10 starts too far from '+target+': '+num);
      await tab.keyboard.press(target>num?'ArrowLeft':'ArrowRight');
      await tab.waitForTimeout(80);
     }
    } else if(target===2){
     await tab.keyboard.press('ArrowLeft');
    }
    await tab.waitForTimeout(250);
    const data=await inspect(tab);
    data.requestedPage=target;data.screen=size;data.errors=errors.slice();
    const actual=Number(String(data.pageNumber).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))));
    data.reachedRequestedPage=actual===target;
    const name=size.width+'x'+size.height+'-page-'+target;
    await tab.screenshot({path:path.join(reportDir,name+'.png')});
    fs.writeFileSync(path.join(reportDir,name+'.json'),JSON.stringify(data,null,2));
    results.push({screen:size.width+'x'+size.height,page:target,actual,lines:data.lines,verticalCollisions:data.verticalCollisions.length,horizontalOverflow:data.horizontalOverflow.length,scrollOverflow:data.rootScroll.height>data.rootScroll.clientHeight+2,errors:errors.length});
   }
   await context.close();
  }
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
 fs.writeFileSync(path.join(reportDir,'summary.json'),JSON.stringify(results,null,2));
 console.table(results);
 const failed=results.filter(x=>x.page!==x.actual||x.verticalCollisions||x.horizontalOverflow||x.scrollOverflow||x.errors);
 console.log('Diagnostic findings:',failed.length,'of',results.length,'cases. Results and screenshots:',reportDir);
 if(results.some(x=>x.page!==x.actual||x.errors))process.exitCode=1;
}
main().catch(e=>{console.error(e);server.close();process.exitCode=1});
