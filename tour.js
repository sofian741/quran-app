/* Ayat guided tours. Real-page spotlight, resumable across navigation. */
(() => {
  'use strict';
  const VERSION = 'v2';
  const ACTIVE = 'ayat-tour-active-' + VERSION;
  const DONE = kind => 'ayat-tour-done-' + kind + '-' + VERSION;
  const SAVED = kind => 'ayat-tour-step-' + kind + '-' + VERSION;
  const LATER = kind => 'ayat-tour-remind-at-' + kind + '-' + VERSION;
  const GENERAL = [
    {page:'index.html',selector:'.home-reading',title:'كمّل القراءة من مكانك',body:'هنا هتلاقي آخر موضع وصلت له في المصحف. اضغط «متابعة القراءة» عشان ترجع له مباشرة.'},
    {page:'index.html',selector:'.home-verse-actions',title:'آية للتدبّر كل يوم',body:'تقدر تروح للآية في المصحف أو تفتح تفسيرها مباشرة. دي وقفتك اليومية مع معنى ينفعك.'},
    {page:'recitations.html',selector:'.catalog-heading',title:'اختار صوت القارئ اللي تحبه',body:'دي مكتبة القرّاء. اختر قارئًا منها، وبعدها تقدر تحدد الرواية والسورة اللي تحب تسمعها.'},
    {page:'recitations.html',selector:'.controls-fields',title:'القارئ والسورة',body:'من القائمتين دول اختار التسجيل والسورة، وبعدين استخدم زر التشغيل. تغيير القارئ لا يحتاج تنزيلًا.'},
    {page:'recitations.html',selector:'#download-current',title:'اسمع من غير إنترنت',body:'اضغط «تنزيل السورة» عشان تفضل محفوظة على الجهاز. ولو حابب تقدر تنزّل مصحف القارئ من الزر المجاور.'},
    {page:'recitations.html',selector:'.my-library-card',title:'فين التلاوات اللي نزلتها؟',body:'كل التنزيلات هتلاقيها في «مكتبتي»، مرتبة حسب القارئ والسورة. تقدر تسمعها حتى لو مفيش إنترنت.'},
    {page:'library.html',selector:'.tools',title:'رتّب مكتبتك بسهولة',body:'ابحث عن سورة أو قارئ، أو غيّر الترتيب. لو المكتبة فاضية، ارجع للتلاوات ونزّل سورة الأول.'},
    {page:'adhkar.html',selector:'.quick-card.morning',title:'اختار باب الأذكار',body:'ابدأ بأذكار الصباح أو المساء أو أي باب. هتشوف الأذكار واحدة واحدة بطريقة مريحة للقراءة.'},
    {page:'adhkar.html',selector:'#tasbih',prepare:'dhikr',title:'عداد الذكر مهم جدًا',body:'بعد قراءة الذكر، اضغط على الدائرة بعدد مرات التكرار. التطبيق هيتابع اللي خلصته من غير ما تحتاج تعد بنفسك.',gesture:'press'},
    {page:'adhkar.html',selector:'#reader-foot',prepare:'dhikr',title:'اتنقل وراجع اللي فاتك',body:'من أزرار التنقل تقدر تروح للذكر اللي بعده أو ترجع للسابق. وفي نهاية الباب هتشوف ملخص الجلسة والناقص منها.'},
    {page:'adhkar.html',selector:'#reader-favorite',prepare:'dhikr',title:'احفظ الأبواب المهمة',body:'علامة القلب بتضيف باب الأذكار إلى المفضلة عشان توصله بسرعة بعد كده.'}
  ];
  const QURAN = [
    {page:'quran.html',selector:'#mushaf-page',title:'قلّب صفحات المصحف بإصبعك',body:'اسحب الصفحة بإصبعك يمينًا أو يسارًا للتقليب. الحركة بتتبع إصبعك، مش محتاج تضغط زرار.',gesture:'swipe'},
    {page:'quran.html',selector:'#quran-text',fallback:'#mushaf-page',title:'اضغط مطولًا على الآية',body:'خليك ضاغط بإصبعك على أي آية لحظة بسيطة عشان تظهر خياراتها: التفسير، الاستماع، الحفظ والمشاركة.',gesture:'press'},
    {page:'quran.html',selector:'#open-index',title:'الفهرس: أسرع طريق لسورة',body:'من هنا اختار سورة أو جزء وانتقل له مباشرة، بدل ما تقلب صفحات كتيرة.'},
    {page:'quran.html',selector:'#toggle-page-marker',title:'احفظ مكانك في القراءة',body:'اضغط على علامة الفاصلة لحفظ الصفحة اللي واقف عندها. تقدر ترجع للمحفوظات من الإعدادات.'},
    {page:'quran.html',selector:'#mushaf-audio-player',title:'استمع وأنت بتقرأ',body:'ده مشغّل التلاوة داخل المصحف. تقدر تشغّل وتوقف وتتقدم في التسجيل، وتختار القارئ من اسمه.'},
    {page:'quran.html',selector:'#audio-quick-repeat',title:'كرر الآيات للحفظ والمراجعة',body:'من هنا حدد آية واحدة أو مجموعة آيات وعدد مرات تكرارها، وده مفيد جدًا في الحفظ.'},
    {page:'quran.html',selector:'#open-settings',title:'البحث والمحفوظات والألوان',body:'داخل إعدادات المصحف هتلاقي البحث، والمفضلة، وألوان الصفحات. وهتلاقي زر «شرح استخدام التطبيق» عشان تعيد أي جولة في أي وقت.'}
  ];
  const TOURS = {general: GENERAL, quran: QURAN};
  const PAGE = location.pathname.split('/').pop() || 'index.html';
  const read = (key, fallback = null) => {try {const value=localStorage.getItem(key);return value === null ? fallback : value;} catch (_) {return fallback;}};
  const write = (key,value) => {try {localStorage.setItem(key,String(value));} catch (_) {}};
  const erase = key => {try {localStorage.removeItem(key);} catch (_) {}};
  const pageOf = kind => kind === 'general' ? 'index.html' : 'quran.html';
  let active = null, dialog = null, spotlight = false, resizeTimer = 0, changing = false;
  const root = document.createElement('div');
  root.id='ayat-tour-root';
  root.className='ayat-tour-root';
  root.hidden = true;
  root.setAttribute('aria-label','دليل استخدام آيات');
  root.innerHTML = '<div class="ayat-tour-shade" hidden></div><div class="ayat-tour-spot" hidden></div><div class="ayat-tour-gesture" hidden aria-hidden="true"><svg viewBox="0 0 48 64"><path d="M17 59c-6-9-14-19-12-24 2-5 8-3 13 4V12c0-9 10-9 10 0v20c2-5 9-6 11-1 5 0 7 5 6 10l-3 17Z"/></svg></div><section class="ayat-tour-dialog" hidden></section><section class="ayat-tour-card" hidden role="dialog" aria-modal="true" aria-label="خطوة من شرح استخدام آيات" tabindex="-1"></section>';
  document.body.appendChild(root);
  const shade = root.querySelector('.ayat-tour-shade');
  const spot = root.querySelector('.ayat-tour-spot');
  const hand = root.querySelector('.ayat-tour-gesture');
  const modal = root.querySelector('.ayat-tour-dialog');
  const card = root.querySelector(':scope > .ayat-tour-card');
  const escapeHtml = v => String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const total = kind => TOURS[kind].length;
  const progress = kind => Math.max(0,Math.min(total(kind)-1,parseInt(read(SAVED(kind),'0'),10)||0));
  function openRoot(){root.hidden=false;root.classList.toggle('under-splash',!!document.getElementById('ayat-welcome')&&!document.getElementById('ayat-welcome').hidden);document.body.classList.add('ayat-tour-on');document.documentElement.classList.remove('ayat-tour-boot');}
  function closeRoot(){root.hidden=true;modal.hidden=card.hidden=shade.hidden=spot.hidden=hand.hidden=true;document.body.classList.remove('ayat-tour-on','ayat-tour-audio');document.documentElement.classList.remove('ayat-tour-boot');}
  function dialogView(kicker,title,description,actions) {
    openRoot();dialog='modal';spotlight=false;
    shade.hidden=true;spot.hidden=true;hand.hidden=true;card.hidden=true;modal.hidden=false;
    modal.innerHTML='<div class="ayat-tour-card" role="dialog" aria-modal="true" aria-label="'+escapeHtml(title)+'" tabindex="-1"><div class="ayat-tour-top"><span>'+escapeHtml(kicker)+'</span><span>آيات | Ayat</span></div><h2 class="ayat-tour-title">'+escapeHtml(title)+'</h2><p class="ayat-tour-body">'+escapeHtml(description)+'</p><div class="ayat-tour-choices">'+actions.map(a=>'<button type="button" class="'+(a.primary?'ayat-tour-main':'ayat-tour-secondary')+'" data-tour-action="'+a.action+'">'+escapeHtml(a.label)+(a.note?'<span class="ayat-tour-choice-note">'+escapeHtml(a.note)+'</span>':'')+'</button>').join('')+'</div></div>';
    modal.querySelector('[role="dialog"]')?.focus({preventScroll:true});
  }
  function offer(kind){
    if(active || read(DONE(kind))==='1' || Number(read(LATER(kind),'0'))>Date.now()) {document.documentElement.classList.remove('ayat-tour-boot');return;}
    const resume = progress(kind)>0;
    const name = kind==='general'?'التطبيق':'المصحف';
    dialogView(kind==='general'?'أهلًا بيك في آيات':'دليل المصحف',
      resume?'نكمل الشرح من مكاننا؟':'تحب أوريك أهم المميزات؟',
      kind==='general'?'هنمشي سوا خطوة خطوة فوق صفحات التطبيق الحقيقية، ونبدأ بالأهم. تقدر توقف الشرح وقت ما تحب.':'هنشرح تقليب الصفحات والضغط المطوّل والفهرس والصوت على المصحف نفسه. الشرح مش هيغيّر موضع قراءتك.',
      [{action:'begin-'+kind,label:resume?'متابعة الشرح':'ابدأ الآن',primary:true,note:resume?'هنكمّل من آخر خطوة وصلت لها':'شرح عملي خطوة بخطوة'},
       {action:'later-'+kind,label:'لاحقًا',note:'هنفكّرك في زيارة قادمة'},
       {action:'never-'+kind,label:'عدم العرض مجددًا',note:'تقدر تفتحه وقت ما تحب من الإعدادات'}]);
  }
  function chooser(){
    dialogView('دليل آيات','تحب نشرح إيه؟','اختار الجولة اللي تحب تعيدها. تقدر تبدأها من الأول حتى لو خلصتها قبل كده.',
      [{action:'replay-general',label:'شرح التطبيق',primary:true,note:'الرئيسية، التلاوات، المكتبة والأذكار'},
       {action:'replay-quran',label:'شرح المصحف',note:'التقليب، الضغط المطوّل، الفهرس، التلاوة والمحفوظات'},
       {action:'dismiss',label:'رجوع'}]);
  }
  function saveActive() {if(active)write(ACTIVE,JSON.stringify(active));}
  function newTour(kind,replay=false){
    if(!TOURS[kind])return;
    const from = replay ? 0 : progress(kind);
    if(replay)erase(DONE(kind));
    erase(LATER(kind));
    active={kind,step:from};
    write(SAVED(kind),from);saveActive();
    const s=TOURS[kind][from];
    if(s.page!==PAGE){location.href=s.page;return;}
    // Close reader settings if the tour was launched from its menu.
    document.getElementById('close-settings')?.click();
    renderStep();
  }
  function finish(){
    if(!active)return;
    const kind=active.kind;
    write(DONE(kind),'1');erase(SAVED(kind));erase(LATER(kind));erase(ACTIVE);active=null;
    closeRoot();
    if(kind==='general' && PAGE!=='index.html')location.href='index.html';
  }
  function postpone(kind){
    if(active&&active.kind===kind){write(SAVED(kind),active.step);erase(ACTIVE);active=null;}
    // Remind gently on another visit, not on each page transition.
    write(LATER(kind),Date.now()+24*60*60*1000);closeRoot();
  }
  function navigate(next){
    if(!active||changing)return;
    changing=true;
    const steps=TOURS[active.kind];
    const nextIndex=active.step+next;
    if(nextIndex>=steps.length){changing=false;finish();return;}
    if(nextIndex<0){changing=false;return;}
    active.step=nextIndex;write(SAVED(active.kind),nextIndex);saveActive();
    if(steps[nextIndex].page!==PAGE){location.href=steps[nextIndex].page;return;}
    changing=false;renderStep();
  }
  function findTarget(step) {
    let t=document.querySelector(step.selector);
    if(!t || t.hidden || !t.getClientRects().length || getComputedStyle(t).display==='none')
      t=step.fallback?document.querySelector(step.fallback):null;
    return t&&t.getClientRects().length?t:null;
  }
  function getRect(t){
    const r=t.getBoundingClientRect();
    const margin=5;
    const left=Math.max(7,r.left-margin),top=Math.max(8,r.top-margin);
    return {left,top,width:Math.min(innerWidth-left-7,r.width+margin*2),height:Math.min(innerHeight-top-7,r.height+margin*2)};
  }
  function position(){
    if(!active || !spotlight || card.hidden)return;
    const s=TOURS[active.kind][active.step];const t=findTarget(s);
    if(!t){spot.hidden=true;hand.hidden=true;card.style.left='15px';card.style.top=Math.max(12,(innerHeight-card.offsetHeight)/2)+'px';return;}
    const r=getRect(t);
    spot.hidden=false;spot.style.left=r.left+'px';spot.style.top=r.top+'px';spot.style.width=Math.max(12,r.width)+'px';spot.style.height=Math.max(12,r.height)+'px';
    const width=Math.min(380,innerWidth-30);
    card.style.width=width+'px';
    const height=card.offsetHeight || 220;
    const roomTop=r.top;
    const roomBottom=innerHeight-(r.top+r.height);
    let top;
    if(roomBottom>=height+20)top=r.top+r.height+12;
    else if(roomTop>=height+20)top=r.top-height-12;
    else top=roomBottom>roomTop?Math.min(innerHeight-height-12,r.top+r.height+8):Math.max(12,r.top-height-8);
    top=Math.max(9,Math.min(innerHeight-height-9,top));
    card.style.left=Math.max(15,(innerWidth-width)/2)+'px';
    card.style.top=top+'px';
    if(s.gesture){
      hand.hidden=false;
      hand.classList.toggle('is-hold',s.gesture==='press');
      hand.classList.toggle('is-swipe',s.gesture==='swipe');
      hand.style.left=Math.max(20,Math.min(innerWidth-55,r.left+r.width*.52))+'px';
      hand.style.top=Math.max(20,Math.min(innerHeight-75,r.top+r.height*.52))+'px';
    }else hand.hidden=true;
  }
  async function prepare(step){
    if(step.prepare==='dhikr' && document.getElementById('reader')?.hidden){
      // The adhkar catalogue is fetched asynchronously, so wait for its
      // click handler to have chapters rather than highlighting a hidden counter.
      for(let attempt=0;attempt<9 && document.getElementById('reader')?.hidden;attempt++){
        document.querySelector('.quick-card.morning')?.click();
        await new Promise(resolve=>setTimeout(resolve,280));
      }
    }
  }
  async function renderStep(){
    if(!active)return;
    const kind=active.kind,s=TOURS[kind][active.step];
    if(s.page!==PAGE){location.href=s.page;return;}
    openRoot();dialog=null;spotlight=true;modal.hidden=true;shade.hidden=true;spot.hidden=true;hand.hidden=true;
    document.body.classList.toggle('ayat-tour-audio',kind==='quran'&&(s.selector==='#mushaf-audio-player'||s.selector==='#audio-quick-repeat'));
    shade.hidden=false;shade.style.background='transparent';
    card.hidden=false;card.style.visibility='hidden';
    const count=active.step+1,all=total(kind);
    card.innerHTML='<div class="ayat-tour-top"><span>'+(kind==='general'?'جولة التطبيق':'جولة المصحف')+'</span><span class="ayat-tour-count">'+count+' / '+all+'</span></div><div class="ayat-tour-progress"><span style="width:'+(count/all*100)+'%"></span></div><h2 class="ayat-tour-title">'+escapeHtml(s.title)+'</h2><p class="ayat-tour-body">'+escapeHtml(s.body)+'</p><div class="ayat-tour-foot"><button class="ayat-tour-main" type="button" data-tour-action="next">'+(count===all?'إنهاء الجولة':'التالي ←')+'</button><button type="button" class="ayat-tour-secondary" data-tour-action="previous" '+(count===1?'hidden':'')+'>السابق</button><button class="ayat-tour-text" type="button" data-tour-action="pause">لاحقًا</button><button class="ayat-tour-text" type="button" data-tour-action="skip">تخطي الجولة</button></div>';
    await prepare(s);
    if(!active || active.kind!==kind || TOURS[kind][active.step]!==s)return;
    const t=findTarget(s);
    if(t){
      const r=t.getBoundingClientRect();
      if(PAGE!=='quran.html' && (r.bottom>innerHeight-90 || r.top<10)) t.scrollIntoView({block:'center',inline:'nearest',behavior:'auto'});
    }
    await new Promise(resolve=>setTimeout(resolve,110));
    if(!active||active.kind!==kind||TOURS[kind][active.step]!==s)return;
    card.style.visibility='visible';
    position();card.focus({preventScroll:true});
  }
  function restoreActive(){
    const raw=read(ACTIVE);
    if(!raw)return false;
    try {
      const state=JSON.parse(raw);
      if(!TOURS[state.kind]||!Number.isInteger(state.step)||state.step<0||state.step>=total(state.kind)){erase(ACTIVE);return false;}
      active=state;
      if(TOURS[state.kind][state.step].page!==PAGE){
        // An external/back navigation must never trap the user in a redirect loop.
        write(SAVED(state.kind),state.step);
        write(LATER(state.kind),Date.now()+24*60*60*1000);
        erase(ACTIVE);active=null;
        return false;
      }
      renderStep();
      return true;
    }catch(_){erase(ACTIVE);return false;}
  }
  root.addEventListener('click',event=>{
    const b=event.target.closest('[data-tour-action]');
    if(!b)return;
    const action=b.dataset.tourAction;
    if(action==='next')navigate(1);
    else if(action==='previous')navigate(-1);
    else if(action==='pause' && active)postpone(active.kind);
    else if(action==='skip' && active) {
      const kind=active.kind;
      dialogView('إنهاء الجولة','عايز توقف الشرح؟','ممكن نحتفظ بآخر خطوة ونكمل لاحقًا، أو نقفل التلميحات التلقائية تمامًا.',
        [{action:'stop-later-'+kind,label:'كمّل معايا لاحقًا',primary:true},{action:'stop-forever-'+kind,label:'عدم العرض مجددًا'},{action:'return-step',label:'الرجوع للشرح'}]);
    } else if(action==='return-step')renderStep();
    else if(action==='dismiss')closeRoot();
    else if(action.startsWith('begin-'))newTour(action.slice(6));
    else if(action.startsWith('replay-'))newTour(action.slice(7),true);
    else if(action.startsWith('later-'))postpone(action.slice(6));
    else if(action.startsWith('never-')){write(DONE(action.slice(6)),'1');erase(SAVED(action.slice(6)));closeRoot();}
    else if(action.startsWith('stop-later-'))postpone(action.slice(11));
    else if(action.startsWith('stop-forever-')){const k=action.slice(13);write(DONE(k),'1');erase(ACTIVE);erase(SAVED(k));active=null;closeRoot();}
  });
  // Keyboard and screen-reader users remain inside the open explanation.
  root.addEventListener('keydown',event=>{
    if(event.key!=='Tab')return;
    const panel=!modal.hidden?modal:card;
    const focusable=[...panel.querySelectorAll('button:not([disabled]):not([hidden])')].filter(el=>el.getClientRects().length);
    if(!focusable.length)return;
    const first=focusable[0],last=focusable[focusable.length-1];
    if(event.shiftKey && (document.activeElement===first || document.activeElement===panel.querySelector('[role="dialog"]') || document.activeElement===card)){
      event.preventDefault();last.focus();
    }else if(!event.shiftKey && (document.activeElement===last || document.activeElement===panel.querySelector('[role="dialog"]') || document.activeElement===card)){
      event.preventDefault();first.focus();
    }
  });
  window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(position,65)});
  window.addEventListener('scroll',()=>{if(spotlight)requestAnimationFrame(position)},true);
  document.addEventListener('keydown',e=>{if(root.hidden)return;if(e.key==='Escape'&&active){e.preventDefault();postpone(active.kind);}else if(e.key==='Escape'&&dialog){e.preventDefault();closeRoot();}});
  document.addEventListener('ayat:splash-finished',()=>root.classList.remove('under-splash'));
  const settingsTrigger=document.getElementById('ayat-tour-settings-button');
  settingsTrigger?.addEventListener('click',chooser);
  // Keep the initial logo intact and prepare the tour underneath its fade-out.
  let initialized=false;
  function initialize(){
    if(initialized)return;
    initialized=true;
    if(restoreActive())return;
    if(PAGE==='index.html')offer('general');
    else if(PAGE==='quran.html')offer('quran');
    else document.documentElement.classList.remove('ayat-tour-boot');
  }
  if(PAGE==='index.html'){
    const splash=document.getElementById('ayat-welcome');
    if(splash && (!splash.hidden || document.documentElement.classList.contains('ayat-splash-startup'))) {
      document.addEventListener('ayat:splash-leaving',initialize,{once:true});
      document.addEventListener('ayat:splash-finished',initialize,{once:true});
    } else initialize();
  } else setTimeout(initialize,PAGE==='quran.html'?240:0);
  // Capacitor replays the brand on Android resume. Re-offer only if the
  // postponement has actually expired, without interrupting an open tour.
  if(PAGE==='index.html') document.addEventListener('ayat:splash-leaving',()=>{
    if(initialized && root.hidden && !active)offer('general');
  });
})();
