/* Keep the screen awake only while the Quran reader is foregrounded.
 * Screen Wake Lock is supported by current Chromium-based Android WebViews.
 * The OS automatically releases a lock when the app is hidden; reacquire it
 * on return because the old sentinel is no longer valid.
 */
(()=>{
 'use strict';
 let sentinel=null,requesting=false,disposed=false;
 const visible=()=>!document.hidden&&document.visibilityState==='visible';
 async function acquire(){
  if(disposed||!visible()||sentinel||requesting||!navigator.wakeLock?.request)return;
  requesting=true;
  try{
   const lock=await navigator.wakeLock.request('screen');
   if(disposed||!visible()){
    await lock.release();
    return;
   }
   sentinel=lock;
   lock.addEventListener('release',()=>{if(sentinel===lock)sentinel=null;},{once:true});
  }catch(error){
   // Unsupported contexts, low battery and system restrictions may deny it.
   // Never block Quran reading or show intrusive alerts.
   console.debug('Mushaf screen wake lock unavailable:',error?.name||error);
  }finally{requesting=false;}
 }
 async function release(){
  const lock=sentinel;sentinel=null;
  if(lock)try{await lock.release();}catch{}
 }
 function sync(){if(visible())void acquire();else void release();}
 document.addEventListener('visibilitychange',sync);
 window.addEventListener('pageshow',sync);
 window.addEventListener('pagehide',()=>{void release();});
 // Some WebViews require a foreground user interaction after returning.
 document.addEventListener('pointerdown',acquire,{passive:true});
 document.addEventListener('keydown',acquire);
 window.addEventListener('beforeunload',()=>{disposed=true;void release();},{once:true});
 sync();
})();
