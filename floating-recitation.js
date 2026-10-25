(() => {
  'use strict';
  // The Android foreground service survives full HTML page navigation.
  // Browser builds keep their existing HTMLAudioElement player unchanged.
  const capacitor = window.Capacitor;
  const native = capacitor?.isNativePlatform?.() &&
    capacitor.registerPlugin?.('QuranFloatingAudio');
  const KEY = 'ayatFloatingHandoffV1';
  const UI_KEY = 'ayatFloatingMiniUiV1';
  const isRecitations = /\/recitations\.html$/.test(location.pathname);
  const isMushaf = /\/quran\.html$/.test(location.pathname);
  const $ = id => document.getElementById(id);
  if (!native) {
    window.QuranFloatingRecitation = Object.freeze({
      supported:false, handoff:async()=>false, reclaim:async()=>null,
      stop:async()=>{}, status:async()=>({active:false})
    });
    return;
  }
  let engine = null, downloads = null, transfer = null;
  let mini = null, last = null, poll = null, moving = false;
  let uiState = (() => { try { return JSON.parse(localStorage.getItem(UI_KEY)||'{}'); } catch { return {}; } })();
  const storeUi = () => { try { localStorage.setItem(UI_KEY,JSON.stringify(uiState)); } catch {} };
  const store = data => { try { localStorage.setItem(KEY,JSON.stringify(data)); } catch {} };
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)||'null'); } catch { return null; } };
  const status = async () => {
    try { return await native.status(); }
    catch { return {active:false}; }
  };
  const stop = async () => {
    try { await native.stop(); } catch (e) { console.warn('Cannot stop native recitation',e); }
    last = null;
    if (mini) mini.hidden = true;
    try { localStorage.removeItem(KEY); } catch {}
  };
  async function handoff() {
    if (!engine || !engine.trackUrl) return false;
    if (transfer) return transfer;
    transfer = (async () => {
      const s = engine.snapshot();
      if (s.provider !== 'mp3quran' || !s.server || !s.availableSurahs?.length) return false;
      const playlist = s.availableSurahs.map(surah => ({
        surah, url:window.QuranAudio.mp3Url({server:s.server,surahs:s.availableSurahs},surah)
      })).filter(row=>row.url);
      const index = playlist.findIndex(row=>row.surah===s.surah);
      if (index < 0) return false;
      const saved = downloads?.list?.() || [];
      const urls = playlist.map(row => {
        const item = saved.find(x=>x.url===row.url && x.nativePath);
        return item ? 'file://' + item.nativePath : row.url;
      });
      const payload = {
        urls, titles:playlist.map(row=>'سورة '+window.QuranAudio.SURAH_NAMES[row.surah-1]),
        artist:s.reciterName||'', index,
        position:Math.round((engine.audio.currentTime||s.currentTime||0)*1000),
        speed:Number(s.speed)||1,repeat:s.repeat?.mode==='surah',
        autoplay:!engine.audio.paused
      };
      try {
        await native.start(payload);
        store({reciterId:s.reciterId,moshafId:s.moshafId,server:s.server,
          availableSurahs:playlist.map(row=>row.surah),repeat:s.repeat,speed:s.speed,
          reciterName:s.reciterName,moshafName:s.moshafName});
        engine.pause();
        return true;
      } catch (e) {
        console.warn('Could not transfer recitation to Android player',e);
        return false;
      }
    })().finally(()=>{transfer=null});
    return transfer;
  }
  async function reclaim(targetEngine) {
    const s = await status();
    const data = read();
    if (!s.active || !data || !targetEngine) return null;
    const surah = data.availableSurahs?.[Number(s.index)] || 1;
    targetEngine.state = window.QuranAudio.sanitizeState({
      ...targetEngine.state,provider:'mp3quran',
      reciterId:data.reciterId,moshafId:data.moshafId,
      reciterName:data.reciterName,moshafName:data.moshafName,
      server:data.server,availableSurahs:data.availableSurahs,
      surah,ayah:1,position:Math.max(0,Number(s.position)||0)/1000,
      repeat:data.repeat,speed:data.speed
    });
    targetEngine.pendingResume=targetEngine.state.position;
    targetEngine.persist();
    await stop();
    return {playing:!!s.playing,surah};
  }
  function attachEngine(target, downloadManager) {
    engine=target;downloads=downloadManager;
    document.addEventListener('click',event=>{
      const link=event.target.closest?.('a[href]');
      if (!link || event.defaultPrevented || event.button !== 0 ||
          event.ctrlKey || event.metaKey || event.shiftKey || event.altKey ||
          link.target && link.target !== '_self' || link.hasAttribute('download')) return;
      const href=link.getAttribute('href');
      if (!href || href.startsWith('#')) return;
      const url=new URL(link.href,location.href);
      if (url.origin !== location.origin || url.pathname===location.pathname) return;
      if (!engine.trackUrl) return;
      event.preventDefault();
      handoff().finally(()=>location.assign(url.href));
    },true);
    window.addEventListener('pagehide',()=>{
      // Fallback for Android Back or programmatic navigation. Link taps are
      // intercepted above so the foreground service starts before teardown.
      if (engine?.trackUrl && !transfer) handoff();
    });
  }
  function miniMarkup() {
    const node=document.createElement('aside');
    node.id='ayat-floating-audio';
    node.className='ayat-floating-audio';
    node.dir='rtl';
    node.hidden=true;
    node.setAttribute('aria-label','مشغل التلاوات المستمر');
    node.innerHTML=`
      <div class="ayat-floating-card">
        <button class="ayat-floating-handle" type="button" aria-label="اسحب لتحريك المشغل" title="اسحب لتحريك المشغل">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5v14M12 5v14M17 5v14"/></svg>
        </button>
        <button class="ayat-floating-info" type="button" aria-label="فتح مشغل التلاوات">
          <strong id="ayat-floating-title">التلاوة</strong>
          <small id="ayat-floating-artist">القرآن الكريم</small>
        </button>
        <button class="ayat-floating-control" data-floating="previous" type="button" aria-label="السورة السابقة">⏮</button>
        <button class="ayat-floating-control ayat-floating-primary" data-floating="toggle" type="button" aria-label="إيقاف مؤقت">⏸</button>
        <button class="ayat-floating-control" data-floating="next" type="button" aria-label="السورة التالية">⏭</button>
        <button class="ayat-floating-control ayat-floating-collapse" data-floating="collapse" type="button" aria-label="تصغير المشغل">⌄</button>
        <button class="ayat-floating-control ayat-floating-stop" data-floating="stop" type="button" aria-label="إغلاق التلاوة">×</button>
        <div class="ayat-floating-progress"><span id="ayat-floating-progress"></span></div>
      </div>
      <button class="ayat-floating-bubble" type="button" aria-label="إظهار مشغل التلاوة" title="إظهار المشغل">♫</button>
    `;
    document.body.append(node);
    mini=node;
    const open=()=>location.assign('recitations.html');
    node.querySelector('.ayat-floating-info').addEventListener('click',open);
    node.querySelector('.ayat-floating-bubble').addEventListener('click',()=>{
      uiState.collapsed=false;storeUi();renderMini(last);
    });
    node.querySelectorAll('[data-floating]').forEach(button=>button.addEventListener('click',async()=>{
      const action=button.dataset.floating;
      if(action==='collapse') {uiState.collapsed=true;storeUi();renderMini(last);return;}
      if(action==='stop') {await stop();return;}
      try {
        if(action==='toggle') await native[last?.playing?'pause':'play']();
        else await native[action]();
        await refresh();
      } catch(e) {console.warn('Audio action unavailable',e);}
    }));
    const handle=node.querySelector('.ayat-floating-handle');
    let drag=null;
    handle.addEventListener('pointerdown',e=>{
      if(e.button!==0)return;
      const rect=node.getBoundingClientRect();
      drag={x:e.clientX,y:e.clientY,left:rect.left,top:rect.top};
      moving=true;handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener('pointermove',e=>{
      if(!drag)return;
      const width=node.offsetWidth,height=node.offsetHeight;
      const left=Math.max(8,Math.min(innerWidth-width-8,drag.left+e.clientX-drag.x));
      const top=Math.max(54,Math.min(innerHeight-height-70,drag.top+e.clientY-drag.y));
      node.style.left=left+'px';node.style.top=top+'px';
      node.style.right='auto';node.style.bottom='auto';
    });
    const finish=()=>{
      if(!drag)return;
      drag=null;moving=false;
      const rect=node.getBoundingClientRect();
      uiState.left=Math.round(rect.left/innerWidth*1000)/1000;
      uiState.top=Math.round(rect.top/innerHeight*1000)/1000;
      storeUi();
    };
    handle.addEventListener('pointerup',finish);
    handle.addEventListener('pointercancel',finish);
    if(isMushaf && uiState.collapsed===undefined) uiState.collapsed=true;
    window.addEventListener('resize',()=>placeMini());
    placeMini();
  }
  function placeMini(){
    if(!mini || moving)return;
    if(Number.isFinite(uiState.left)&&Number.isFinite(uiState.top)){
      const width=mini.offsetWidth||260,height=mini.offsetHeight||60;
      mini.style.left=Math.max(8,Math.min(innerWidth-width-8,uiState.left*innerWidth))+'px';
      mini.style.top=Math.max(54,Math.min(innerHeight-height-70,uiState.top*innerHeight))+'px';
      mini.style.right='auto';mini.style.bottom='auto';
    }
  }
  function renderMini(s){
    if(!mini)return;
    mini.hidden=!s?.active;
    if(!s?.active)return;
    mini.classList.toggle('is-collapsed',!!uiState.collapsed);
    $('ayat-floating-title').textContent=s.title||'تلاوة القرآن الكريم';
    $('ayat-floating-artist').textContent=s.artist||'القرآن الكريم';
    const toggle=mini.querySelector('[data-floating="toggle"]');
    toggle.textContent=s.playing?'⏸':'▶';
    toggle.setAttribute('aria-label',s.playing?'إيقاف مؤقت':'تشغيل');
    $('ayat-floating-progress').style.width=s.duration>0
      ?Math.max(0,Math.min(100,100*s.position/s.duration))+'%':'0%';
    mini.querySelector('.ayat-floating-bubble').setAttribute('aria-label',
      (s.playing?'تلاوة جارية: ':'تلاوة متوقفة: ')+(s.title||'القرآن الكريم')+'. إظهار المشغل');
  }
  async function refresh(){
    last=await status();
    renderMini(last);
    return last;
  }
  // The mini player belongs to every screen except the full recitations page.
  if (!isRecitations) {
    const start=()=>{miniMarkup();refresh();poll=setInterval(refresh,1300);};
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
    else start();
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
    if(isMushaf)document.addEventListener('click',event=>{
      if(event.target.closest?.('#audio-play,[data-verse-action="listen"]'))stop();
    },true);
  }
  window.QuranFloatingRecitation=Object.freeze({
    supported:true,attachEngine,handoff,reclaim,stop,status
  });
})();
