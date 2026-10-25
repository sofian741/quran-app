(() => {
'use strict';
const c=window.QuranAudio,d=window.QuranDownloads,e=window.quranAudioEngine,$=id=>document.getElementById(id);
if(!c||!d||!e||!$('download-all'))return;
const dm=new d.DownloadManager(),ui={all:$('download-all'),batch:$('batch-progress'),label:$('batch-label'),bar:$('batch-bar'),cancel:$('cancel-batch'),current:$('download-current'),status:$('player-status')};
let active=false,stop=false,total=0,done=0;
dm.addEventListener('change',ev=>{
 if(!active||ev.detail.status!=='downloading'||!ev.detail.total)return;
 ui.bar.value=Math.min(99,100*(done+ev.detail.progress)/total);
});
async function start(){
 if(active||dm.active)return;
 const s=e.snapshot();
 if(s.provider!=='mp3quran'||!s.server||!s.availableSurahs.length){ui.status.textContent='اختار قارئًا وتسجيلًا أولًا.';return;}
 const missing=[];
 for(const surah of [...s.availableSurahs].sort((a,b)=>a-b)){
  const url=c.mp3Url({server:s.server,surahs:s.availableSurahs},surah);
  if(url&&!(await dm.has(url)))missing.push({url,surah});
 }
 if(!missing.length){ui.status.textContent='كل سور هذا التسجيل محفوظة بالفعل.';return;}
 if(!confirm('تنزيل '+c.arabicDigits(missing.length)+' سورة بصوت '+s.reciterName+'؟\nقد يستهلك مساحة كبيرة وباقة إنترنت. يُفضّل Wi-Fi. يمكن الإيقاف بعد السورة الحالية.'))return;
 const lock=window.AyatDownloadLock;
 if(lock&&!lock.acquire('bulk')){ui.status.textContent='يوجد تنزيل آخر قيد التنفيذ. انتظر حتى ينتهي.';return;}
 active=true;stop=false;total=missing.length;done=0;
 ui.batch.hidden=false;ui.all.disabled=true;ui.current.disabled=true;ui.cancel.disabled=false;
 try{
  for(const t of missing){
   if(stop)break;
   ui.label.textContent='تنزيل سورة '+c.SURAH_NAMES[t.surah-1]+' • '+c.arabicDigits(done+1)+'/'+c.arabicDigits(total);
   ui.bar.value=100*done/total;
   await dm.downloadTrack({...t,provider:'mp3quran',reciterId:s.reciterId,reciterName:s.reciterName,
    moshafId:s.moshafId,moshafName:s.moshafName,surahName:c.SURAH_NAMES[t.surah-1]});
   done++;
  }
  ui.status.textContent=stop?'تم إيقاف التنزيل بعد حفظ '+c.arabicDigits(done)+' سورة. يمكن استكمال الباقي لاحقًا.':
   'اكتمل حفظ '+c.arabicDigits(done)+' سورة للاستماع دون إنترنت.';
 }catch(err){
  ui.status.textContent=(err.message||'تعذّر التنزيل')+' • المحفوظ: '+c.arabicDigits(done)+' سورة. يمكنك استكمال الباقي.';
 }finally{
  active=false;ui.batch.hidden=true;lock?.release('bulk');ui.all.disabled=false;
  // The regular download button checks its cache state when the audio engine emits.
  e.emit();window.dispatchEvent(new Event('quran-downloads:change'));
 }
}
ui.all.addEventListener('click',start);
ui.cancel.addEventListener('click',()=>{stop=true;ui.cancel.disabled=true;ui.label.textContent='سيتم الإيقاف بعد السورة الحالية…';});
window.addEventListener('ayat:download-lock',()=>{if(!active)ui.all.disabled=!!window.AyatDownloadLock?.owner;});
})();
