'use strict';
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base=process.env.LAB_BASE_URL||'http://127.0.0.1:4173',out=path.resolve(process.env.LAB_RESULTS||'/workspace/work/madinah-results');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.QURAN_BROWSER_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:900,height:1000},serviceWorkers:'block'});await page.route('https://**/*',r=>r.abort());await page.goto(base+'/quran.html');await page.waitForFunction(()=>window.madinahLab?.getGeometry());
  const pages=process.env.LAB_VISUAL_PAGES?process.env.LAB_VISUAL_PAGES.split(',').map(Number):Array.from({length:604},(_,i)=>i+1),results=[];
  for(const n of pages){
   const result=await page.evaluate(async({n,scale})=>{
    const {decodePage}=await import('./lab/runtime/vendor/lite.js'),id=String(n).padStart(3,'0');
    const data=await(await fetch('lab/pages/'+id+'.qvp')).arrayBuffer(),model=decodePage(data),w=345*scale,h=550*scale;
    const a=document.createElement('canvas'),b=document.createElement('canvas');a.width=b.width=w;a.height=b.height=h;
    const ac=a.getContext('2d'),bc=b.getContext('2d');
    ac.fillStyle=bc.fillStyle='white';ac.fillRect(0,0,w,h);bc.fillRect(0,0,w,h);
    model.draw(ac,{scale,ink:'#231f20'});
    const svg=await(await fetch('lab/reference/'+id+'.svg')).text(),url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
    const image=new Image();image.src=url;await image.decode();bc.drawImage(image,0,0,w,h);URL.revokeObjectURL(url);
    const aa=ac.getImageData(0,0,w,h).data,bb=bc.getImageData(0,0,w,h).data;let pixels=0,above16=0,total=0,max=0,inkPixels=0;
    for(let i=0;i<aa.length;i+=4){let diff=0;for(let c=0;c<3;c++){const d=Math.abs(aa[i+c]-bb[i+c]);total+=d;diff=Math.max(diff,d);}if(diff)pixels++;if(diff>16)above16++;if(Math.min(aa[i],bb[i])<240)inkPixels++;max=Math.max(max,diff);}
    return {page:n,scale,width:w,height:h,changedPixels:pixels,above16,maxChannelDifference:max,meanAbsoluteChannelDifference:total/(w*h*3),changedFraction:above16/(w*h),inkPixels,referenceSha256:madinahLab.getManifest().pages[n-1].svgSha256,comparison:'Canvas QVP versus independently loaded pinned upstream SVG; not an authorized paper scan'};
   },{n,scale:Number(process.env.LAB_VISUAL_SCALE||2)});
   results.push(result);if(n%50===0||pages.length<20)console.log(JSON.stringify(result));
  }
  const summary={pages:results.length,scale:Number(process.env.LAB_VISUAL_SCALE||2),tolerance:{maximumFractionAbove16:.005,reason:'Raster anti-aliasing differs between SVG and Canvas paths; this is a visible-difference gate, not byte identity'},failures:results.filter(r=>r.changedFraction>.005),maximumChangedFraction:Math.max(...results.map(r=>r.changedFraction)),maximumMeanAbsoluteChannelDifference:Math.max(...results.map(r=>r.meanAbsoluteChannelDifference)),exactPixelPages:results.filter(r=>r.changedPixels===0).length,results};
  fs.writeFileSync(path.join(out,'visual-'+summary.scale+'x.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify({...summary,results:undefined}));assert.deepEqual(summary.failures,[]);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
