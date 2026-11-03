// Same browser/viewport, repeated page-commit-to-next-paint measurements.
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const out=process.env.LAB_RESULTS||'/workspace/work/madinah-results';fs.mkdirSync(out,{recursive:true});
 const b=await chromium.launch({headless:true,executablePath:process.env.QURAN_BROWSER_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{const results={};for(const [name,file]of [['legacy','legacy-quran.html'],['qvp','quran.html']]){
  const p=await b.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});await p.route('https://**/*',r=>r.abort());await p.addInitScript(()=>{localStorage.setItem('ayat-tour-done-quran-v8','1');localStorage.setItem('ayat-tour-optout-quran-v8','1');});
  await p.goto((process.env.LAB_BASE_URL||'http://127.0.0.1:4173')+'/'+file);await p.waitForFunction(()=>window.mushafReader&&document.querySelector('#quran-text').dataset.layoutState==='ready');
  const data=await p.evaluate(async name=>{
   const pages=[1,4,48,77,187,208,262,282,428,451,602,604],times=[];
   for(let round=0;round<3;round++)for(const n of pages){const start=performance.now();if(name==='qvp')await madinahLab.navigate(n);else mushafReader.goToPage(n);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));times.push(performance.now()-start);}
   times.sort((a,b)=>a-b);return {samples:times.length,p50:times[Math.floor(times.length*.5)],p95:times[Math.floor(times.length*.95)],max:times.at(-1),jsHeapBytes:performance.memory?.usedJSHeapSize,notes:'Desktop Chromium heap excludes native Canvas/Path2D allocations; not Android memory or animation frame-time'};
  },name);results[name]=data;await p.close();
 }fs.writeFileSync(path.join(out,'benchmark.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));}finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
