/* Ayat page-by-page interactive discovery. Each lesson lives and finishes on its own page. */
(() => {
  'use strict';
  // Local, independent tutorial revisions for each redesigned page.
  const REOFFER_AFTER = 12 * 60 * 60 * 1000;
  const routeName = (location.pathname.split('/').filter(Boolean).pop() || 'index').toLowerCase();
  const PAGE = routeName === 'index' ? 'index.html' : (routeName.endsWith('.html') ? routeName : routeName + '.html');
  const PAGES = { 'index.html':'home', 'quran.html':'quran', 'recitations.html':'recitations', 'library.html':'library', 'adhkar.html':'adhkar' };
  const PAGE_FOR = {home:'index.html', quran:'quran.html', recitations:'recitations.html', library:'library.html', adhkar:'adhkar.html'};
  const NAMES = {home:'الرئيسية', quran:'المصحف', recitations:'التلاوات', library:'مكتبتي', adhkar:'الأذكار'};
  const TOURS = {
    home: [
      {selector:'.home-reading',mode:'note',group:'القراءة',title:'متابعة القراءة',body:'هنا بتلاقي آخر سورة وصفحة وصلت لها. زر «أكمل القراءة» يرجعك لنفس موضعك مباشرة.'},
      {selector:'.home-verse blockquote',fallback:'.home-verse',mode:'verse',group:'وقفة مع القرآن',title:'آية للتدبّر',body:'الآية دي بتتجدد كل يوم. اضغط على نص الآية المنوّر عشان تقراها كاملة وتتأمل معناها.'},
      {selector:'.home-verse-action.is-primary',mode:'note',group:'آية التدبّر',title:'الذهاب للآية',body:'يفتح الآية اللي قدامك في مكانها داخل المصحف، عشان تكمل القراءة من سياقها.'},
      {selector:'.home-verse-action:not(.is-primary)',mode:'note',group:'آية التدبّر',title:'التفسير',body:'بيفتح تفسير الآية مباشرة، عشان تعرف معناها وتفهمها بشكل أوضح.'},
      {selector:'.home-bottom-nav a[href="index.html"]',mode:'note',group:'شريط التنقل',title:'الرئيسية',body:'الزر ده بيرجعك للصفحة دي من أي مكان في التطبيق، وفيها متابعة القراءة وآية التدبّر.'},
      {selector:'.home-bottom-nav a[href="quran.html"]',mode:'note',group:'شريط التنقل',title:'المصحف',body:'من هنا تفتح المصحف للقراءة أو البحث أو الاستماع. وليه شرح مستقل لما تزوره.'},
      {selector:'.home-bottom-nav a[href="recitations.html"]',mode:'note',group:'شريط التنقل',title:'التلاوات',body:'اسمع القرّاء واختار السور وحمّل تلاواتك للاستماع من غير إنترنت.'},
      {selector:'.home-bottom-nav a[href="adhkar.html"]',mode:'note',group:'شريط التنقل',title:'الأذكار',body:'هنا أذكار الصباح والمساء والأدعية، متقسّمة لأبواب عشان توصل للي محتاجه بسهولة.'}
    ],
    quran: [
      {selector:'#mushaf-page',mode:'swipe',title:'جرّب تقليب الصفحة 👆',body:'حرّك إصبعك فوق بطاقة التدريب يمينًا أو شمالًا. دي تجربة آمنة للحركة، ومش هنغيّر صفحتك الحقيقية.'},
      {selector:'#quran-text',fallback:'#mushaf-page',mode:'hold',title:'سر الضغط المطوّل 🔍',body:'اضغط مطولًا على بطاقة التدريب لفتح خيارات الآية: التفسير والاستماع والمزيد.'},
      {selector:'#open-index',mode:'tap',title:'الفهرس في متناول إيدك',body:'هنا توصل لأي سورة أو جزء بسرعة. اكتشف مكان الفهرس من غير ما نفتح أي نافذة.'},
      {selector:'#toggle-page-marker',mode:'tap',title:'علّم الصفحة اللي بتحبها',body:'ده زر حفظ موضعك. التجربة هنا مش هتغيّر العلامة الحالية.'},
      {selector:'#mushaf-audio-player',fallback:'#audio-quick-repeat',mode:'quiz',title:'تلاوة مع القراءة 🎧',body:'المصحف فيه مشغّل تلاوة وتحكم في التكرار.',question:'إيه اللي يساعدك تحفظ آية بالتكرار؟',choices:['تكرار التلاوة','تغيير لون المصحف','الفهرس'],correct:0},
      {selector:'#audio-quick-repeat',mode:'tap',title:'ميزة الحفظ والمراجعة',body:'الزر ده بيفتح إعدادات تكرار الآيات. دلوقتي جرّب تكتشف مكانه بس.'},
      {selector:'#open-settings',mode:'tap',title:'الإعدادات والشرح في أي وقت',body:'من هنا هتلاقي خيارات العرض والبحث والمحفوظات، وكمان تقدر تعيد أي شرح.'}
    ],
    recitations: [
      {selector:'.intro',mode:'reveal',group:'ابدأ من هنا',title:'القرّاء موجودين تحت',body:'صفحة التلاوات فيها قرّاء كتير، لكن قائمتهم أسفل المشغّل. تابع حركة اليد لتعرف الاتجاه، وبعدها اضغط «اعرض القرّاء» عشان نوصل لهم مباشرة.'},
      {selector:'#reciter-list',mode:'pick-reciter',group:'اختيار القارئ',title:'اختار القارئ اللي تحبه',body:'دي القائمة الكاملة للقرّاء. اضغط على أي قارئ بنفسك، وهيظهر اختياره في المشغّل فوق. تقدر تبحث باسمه كمان.',wait:'catalog'},
      {selector:'#surah-select',mode:'note',group:'التلاوة',title:'اختيار السورة',body:'بعد اختيار القارئ، من القائمة دي تختار السورة اللي عايز تسمعها.'},
      {selector:'#play-pause',mode:'play',group:'الاستماع',title:'تشغيل التلاوة',body:'ده زر التشغيل والإيقاف المؤقت. تقدر تضغط عليه دلوقتي وتسمع القارئ اللي اخترته، أو تكمل الشرح من غير تشغيل.'},
      {selector:'#download-current',mode:'note',group:'التنزيل',title:'تنزيل سورة واحدة',body:'الزر ده بيحفظ السورة المختارة على جهازك عشان تسمعها لاحقًا بدون إنترنت. الشرح نفسه مش هيبدأ أي تنزيل.'},
      {selector:'#download-all',mode:'note',group:'التنزيل',title:'تنزيل مصحف القارئ',body:'لو عايز سور القارئ المتاحة كلها، الزر ده بيبدأ تنزيلها دفعة واحدة، حسب المساحة المتاحة. مش هننزّل ملفات أثناء الشرح.'},
      {selector:'.my-library-card',mode:'note',group:'ملفاتك المحفوظة',title:'مكتبتي',body:'أي سورة أو مصحف نزّلته هتلاقيه هنا مرتبًا حسب القارئ والسورة، وتقدر تشغّله من غير إنترنت.'}
    ],
    library: [
      {selector:'.tools',mode:'tap',title:'مكتبتك تحت السيطرة',body:'تقدر تبحث باسم قارئ أو سورة وتغيّر ترتيب التسجيلات. جرّب تكتشف أدوات التنظيم.'},
      {selector:'#library-content',fallback:'.summary-line',mode:'quiz',title:'تحدي المكتبة 🎯',body:'كل اللي بتنزلّه من التلاوات تلاقيه هنا.',question:'لو المكتبة فاضية، تعمل إيه؟',choices:['تنزّل سورة من التلاوات','تمسح التطبيق','تغيّر لون المصحف'],correct:0}
    ],
    adhkar: [
      {selector:'#filters',mode:'tap',title:'كل ذكر في مكانه 🌿',body:'الأبواب مترتبة حسب الموضوع. اكتشف أزرار التصنيف عشان توصل للذكر بسرعة.'},
      {selector:'.quick-card.morning',mode:'tap',activate:true,title:'افتح أذكار الصباح ☀️',body:'المرادي لمسة حقيقية! اضغط على البطاقة المنوّرة عشان نفتح باب أذكار الصباح سوا.'},
      {selector:'#tasbih',mode:'tap',wait:'reader',title:'العداد يفتكر بدل منك',body:'دي دائرة العد. في الشرح هنجرّب مكانها بس من غير ما نزود عداد ذكرك الحقيقي.'},
      {selector:'#reader-foot',mode:'tap',wait:'reader',title:'خطوة لقدّام أو لورا',body:'من هنا تنتقل للذكر التالي أو ترجع للسابق، وتتابع تقدمك.'},
      {selector:'#reader-favorite',mode:'tap',wait:'reader',title:'احتفظ باللي تحبه ❤️',body:'علامة القلب تحفظ باب الأذكار في المفضلة. مش هنغيّر مفضلتك أثناء التدريب.'}
    ]
  };
  const kind = PAGES[PAGE];
  if (!kind) return;
  const VERSION = kind==='home' ? 'v7' : kind==='recitations' ? 'v6' : 'v5';
  const DONE = k => 'ayat-tour-done-' + k + '-' + VERSION;
  const STEP = k => 'ayat-tour-step-' + k + '-' + VERSION;
  const LATER = k => 'ayat-tour-remind-at-' + k + '-' + VERSION;
  const LAST = k => 'ayat-tour-last-shown-' + k + '-' + VERSION;
  const OPT_OUT = k => 'ayat-tour-optout-' + k + '-' + VERSION;
  const storageRead = key => {
    try {const v=localStorage.getItem(key);if(v!==null)return v;}catch(_){}
    try {return sessionStorage.getItem(key);}catch(_){return null;}
  };
  const save = (key,value) => {
    try{localStorage.setItem(key,String(value));}catch(_){}
    try{sessionStorage.setItem(key,String(value));}catch(_){}
  };
  const remove = key => {
    try{localStorage.removeItem(key);}catch(_){}
    try{sessionStorage.removeItem(key);}catch(_){}
  };
  const html = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const delay = ms => new Promise(done=>setTimeout(done,ms));
  let active = null, modalOpen = false, busy = false, resizeTimer = 0, skillTimer = 0, skillStart = null, stepToken = 0, initialized = false;
  const root = document.createElement('div');
  root.id = 'ayat-tour-root';
  root.className = 'ayat-tour-root' + ((kind==='home'||kind==='recitations')?' is-editorial':'') + (kind==='home'?' is-home':'') + (kind==='recitations'?' is-recitations':'');
  root.hidden = true;
  root.setAttribute('aria-label','دليل استخدام آيات');
  root.innerHTML =
    '<div class="ayat-tour-shade" hidden></div><div class="ayat-tour-spot" hidden></div>' +
    '<button type="button" class="ayat-tour-hit" hidden aria-label="اكتشف العنصر المنوّر"></button>' +
    '<div class="ayat-tour-gesture" hidden aria-hidden="true"><svg viewBox="0 0 48 64"><path d="M17 59c-6-9-14-19-12-24 2-5 8-3 13 4V12c0-9 10-9 10 0v20c2-5 9-6 11-1 5 0 7 5 6 10l-3 17Z"/></svg></div>' +
    '<section class="ayat-tour-dialog" hidden></section><section class="ayat-tour-card" role="dialog" aria-modal="true" aria-label="درس تفاعلي" tabindex="-1" hidden></section>' +
    '<section class="ayat-tour-invite" hidden role="status" aria-live="polite"></section>';
  document.body.appendChild(root);
  const shade = root.querySelector('.ayat-tour-shade');
  const spot = root.querySelector('.ayat-tour-spot');
  const hit = root.querySelector('.ayat-tour-hit');
  const hand = root.querySelector('.ayat-tour-gesture');
  const modal = root.querySelector('.ayat-tour-dialog');
  const card = root.querySelector(':scope > .ayat-tour-card');
  const invite = root.querySelector('.ayat-tour-invite');
  function rootOpen(forLesson=false){
    root.hidden=false;
    root.classList.toggle('under-splash',!!document.getElementById('ayat-welcome')&&!document.getElementById('ayat-welcome').hidden);
    document.documentElement.classList.remove('ayat-tour-boot');
    document.body.classList.toggle('ayat-tour-on',forLesson);
  }
  function close(){
    ++stepToken;clearTimeout(skillTimer);busy=false;modalOpen=false;active=null;
    root.hidden=true;
    root.classList.remove('is-verse-focused','is-choose-reciter');
    invite.hidden=shade.hidden=spot.hidden=hit.hidden=hand.hidden=modal.hidden=card.hidden=true;
    document.body.classList.remove('ayat-tour-on','ayat-tour-audio');
    document.documentElement.classList.remove('ayat-tour-boot');
  }
  function clearLayers(){
    invite.hidden=true;modal.hidden=true;card.hidden=true;
    shade.hidden=spot.hidden=hit.hidden=hand.hidden=true;
  }
  function showInvite(){
    if(active||modalOpen||storageRead(DONE(kind))==='1'||storageRead(OPT_OUT(kind))==='1'||Number(storageRead(LATER(kind))||0)>Date.now()||(kind!=='home' && kind!=='recitations' && Number(storageRead(LAST(kind))||0)+REOFFER_AFTER>Date.now())){
      document.documentElement.classList.remove('ayat-tour-boot');return;
    }
    rootOpen(false);clearLayers();save(LAST(kind),Date.now());
    const pending=Math.min(TOURS[kind].length-1,Math.max(0,Number(storageRead(STEP(kind))||0)));
    invite.hidden=false;
    if(kind==='home'||kind==='recitations'){
      invite.innerHTML=
        '<div class="ayat-tour-invite-icon" aria-hidden="true">✧</div>' +
        '<div class="ayat-tour-invite-copy"><strong>'+(kind==='home'?(pending?'نكمل شرح الرئيسية؟':'جولة هادئة في الرئيسية'):(pending?'نكمل شرح التلاوات؟':'اكتشف قائمة القرّاء'))+
        '</strong><span>'+(kind==='home'?'جولة مختصرة للقراءة والتدبّر وأزرار التنقّل':'القرّاء موجودين أسفل المشغّل، والشرح هيوصلك لهم')+'</span></div>'+
        '<div class="ayat-tour-invite-actions"><button type="button" class="ayat-tour-main" data-tour-action="begin">ابدأ الشرح</button><button type="button" class="ayat-tour-text" data-tour-action="later">لاحقًا</button><button type="button" class="ayat-tour-text ayat-tour-never" data-tour-action="never">متظهرش تاني</button></div>';
    }else{
      invite.innerHTML=
        '<div class="ayat-tour-invite-icon" aria-hidden="true">✦</div>' +
        '<div class="ayat-tour-invite-copy"><strong>'+ (pending?'نكمل اكتشاف '+NAMES[kind]+'؟':'تحب نكتشف '+NAMES[kind]+'؟') +
        '</strong><span>شرح سريع للصفحة، من غير ما نخرج منها</span></div>' +
        '<div class="ayat-tour-invite-actions"><button type="button" class="ayat-tour-main" data-tour-action="begin">ابدأ الشرح</button><button type="button" class="ayat-tour-text" data-tour-action="later">لاحقًا</button><button type="button" class="ayat-tour-text ayat-tour-never" data-tour-action="never">متظهرش تاني</button></div>';
    }
  }
  function chooser(){
    ++stepToken;clearLayers();rootOpen(false);modalOpen=true;
    modal.hidden=false;
    modal.innerHTML='<div class="ayat-tour-card" role="dialog" aria-modal="true" aria-label="اختيار شرح آيات" tabindex="-1">' +
      '<div class="ayat-tour-top"><span>دليل آيات</span><span>اختر الصفحة</span></div>' +
      '<h2 class="ayat-tour-title">تحب تكتشف إيه؟</h2><p class="ayat-tour-body">كل صفحة ليها شرحها الخاص. تقدر تعيد أي شرح وقت ما تحب.</p>' +
      '<div class="ayat-tour-choices">' + Object.keys(PAGE_FOR).map(k=>'<button type="button" class="'+(k===kind?'ayat-tour-main':'ayat-tour-secondary')+'" data-tour-action="replay-'+k+'">'+html('شرح '+NAMES[k])+(k===kind?' · الصفحة الحالية':'')+'</button>').join('') +
      '<button type="button" class="ayat-tour-text" data-tour-action="dismiss">رجوع</button></div></div>';
    modal.querySelector('[role="dialog"]')?.focus({preventScroll:true});
  }
  function start(replay=false){
    ++stepToken;modalOpen=false;
    remove(LATER(kind));remove(DONE(kind));remove(OPT_OUT(kind));
    const saved=Number(storageRead(STEP(kind))||0);
    const index=!replay&&Number.isInteger(saved)?Math.min(Math.max(0,saved),TOURS[kind].length-1):0;
    active={kind,step:index};
    save(STEP(kind),index);
    document.getElementById('close-settings')?.click();
    clearLayers();rootOpen(true);
    render();
  }
  function replay(k){
    if(!TOURS[k])return;
    remove(DONE(k));remove(LATER(k));remove(STEP(k));remove(OPT_OUT(k));
    if(k!==kind){
      // This is an explicit choice from Settings, not a guided page hand-off.
      location.assign(PAGE_FOR[k]+'?ayatHelp='+encodeURIComponent(k));
      return;
    }
    start(true);
  }
  function finish(){
    save(DONE(kind),'1');save(LAST(kind),Date.now());remove(STEP(kind));remove(LATER(kind));
    close();
    // The redesigned editorial guides end quietly without a completion banner.
    if(kind==='home'||kind==='recitations')return;
    const toast=document.createElement('div');
    toast.className='ayat-tour-complete';
    toast.setAttribute('role','status');
    toast.textContent='اكتمل شرح '+NAMES[kind];
    document.body.appendChild(toast);
    setTimeout(()=>toast.remove(),3100);
  }
  function postpone(){
    if(active)save(STEP(kind),active.step);
    save(LATER(kind),Date.now()+24*60*60*1000);
    close();
  }
  function never(){
    save(OPT_OUT(kind),'1');save(DONE(kind),'1');remove(STEP(kind));remove(LATER(kind));close();
  }
  function targetFor(step){
    let t=document.querySelector(step.selector);
    const valid=el=>el&&!el.hidden&&el.getClientRects().length&&getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility!=='hidden';
    if(!valid(t))t=step.fallback?document.querySelector(step.fallback):null;
    return valid(t)?t:null;
  }
  function position(){
    if(!active||card.hidden)return;
    const s=TOURS[kind][active.step];
    const t=targetFor(s);
    if(!t){
      spot.hidden=true;hit.hidden=true;hand.hidden=true;
      card.style.left=Math.max(12,(innerWidth-Math.min(380,innerWidth-24))/2)+'px';
      card.style.top=Math.max(12,(innerHeight-card.offsetHeight)/2)+'px';
      return;
    }
    const r=t.getBoundingClientRect();
    const left=Math.max(7,r.left-5),top=Math.max(8,r.top-5);
    const width=Math.max(12,Math.min(innerWidth-left-7,r.width+10));
    const height=Math.max(12,Math.min(innerHeight-top-7,r.height+10));
    spot.hidden=false;Object.assign(spot.style,{left:left+'px',top:top+'px',width:width+'px',height:height+'px'});
    spot.classList.toggle('is-verse',kind==='home'&&s.mode==='verse');
    if(kind==='recitations'&&s.mode==='pick-reciter'){
      spot.hidden=true;hit.hidden=true;hand.hidden=true;
      const cw=Math.min(380,innerWidth-24),ch=card.offsetHeight||220;
      card.style.left=Math.max(12,(innerWidth-cw)/2)+'px';
      card.style.top=Math.max(15,innerHeight-ch-88)+'px';
      return;
    }
    const tapping=s.mode==='tap'||s.mode==='verse'||s.mode==='play';
    hit.hidden=!tapping;
    if(tapping){
      Object.assign(hit.style,{left:left+'px',top:top+'px',width:width+'px',height:height+'px'});
      hit.classList.toggle('ayat-tour-verse-hit',s.mode==='verse');
      hit.setAttribute('aria-label',s.mode==='verse'?'افتح آية التدبّر للقراءة':s.activate?'افتح العنصر المنوّر':'اكتشف '+s.title);
    }
    const cw=Math.min(380,innerWidth-24),ch=card.offsetHeight||220;
    const below=innerHeight-(top+height),above=top;
    let cy;
    if(below>=ch+16)cy=top+height+10;
    else if(above>=ch+16)cy=top-ch-10;
    else cy=below>above?top+height+8:top-ch-8;
    cy=Math.min(Math.max(9,cy),Math.max(9,innerHeight-ch-9));
    card.style.left=Math.max(12,(innerWidth-cw)/2)+'px';
    card.style.top=cy+'px';
    const gesture=s.mode==='swipe'||s.mode==='hold';
    hand.hidden=!gesture;
    if(gesture){
      hand.classList.toggle('is-swipe',s.mode==='swipe');
      hand.classList.toggle('is-hold',s.mode==='hold');
      hand.style.left=Math.max(20,Math.min(innerWidth-55,left+width*.5))+'px';
      hand.style.top=Math.max(20,Math.min(innerHeight-75,top+height*.5))+'px';
    }
  }
  async function prepare(s,token){
    if(s.wait==='catalog'){
      for(let i=0;i<32 && !document.querySelector('#reciter-list .reciter-card');i++){
        if(token!==stepToken)return;
        await delay(250);
      }
    }
    if(s.wait==='reader'){
      for(let i=0;i<15 && document.getElementById('reader')?.hidden;i++){
        if(token!==stepToken)return;
        await delay(220);
      }
    }
    for(let i=0;i<9 && !targetFor(s);i++){
      if(token!==stepToken)return;
      await delay(190);
    }
  }
    // Home tour: calm, guided explanations; interactive reading only where useful.
  // Home's editorial guide explains real controls without simulated quizzes.
  async function renderEditorial(){
    if(!active)return;
    const token=++stepToken;
    const step=TOURS[kind][active.step];
    rootOpen(true);clearLayers();
    root.classList.toggle('is-verse-focused',kind==='home'&&step.mode==='verse');
    root.classList.toggle('is-choose-reciter',kind==='recitations'&&step.mode==='pick-reciter');
    shade.hidden=false;shade.style.background='transparent';
    card.hidden=false;card.style.visibility='hidden';
    const current=active.step+1;
    const total=TOURS[kind].length;
    const last=current===total;
    const progress=TOURS[kind].map((_,i)=>
      '<span class="'+(i<current?'is-reached ':'')+(i===active.step?'is-active':'')+'"></span>'
    ).join('');
    card.innerHTML=
      '<div class="ayat-tour-home-top">'+
        '<span class="ayat-tour-home-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5C9.2 3.6 6.5 3.7 3.5 4.8v14.1c3-1.1 5.7-1 8.5.6 2.8-1.6 5.5-1.7 8.5-.6V4.8c-3-1.1-5.7-1.2-8.5.2Z"/><path d="M12 5v14.5"/></svg></span>'+
        '<span class="ayat-tour-home-heading"><strong>دليل آيات</strong><small>'+html(step.group||'الرئيسية')+'</small></span>'+
        '<span class="ayat-tour-count">'+String(current).padStart(2,'0')+' <span aria-hidden="true">/</span> '+String(total).padStart(2,'0')+'</span></div>'+
      '<div class="ayat-tour-home-progress" aria-hidden="true">'+progress+'</div>'+
      '<h2 class="ayat-tour-title">'+html(step.title)+'</h2>'+
      '<p class="ayat-tour-body">'+html(step.body)+'</p>'+
      (step.mode==='verse'?'<button class="ayat-tour-home-read" type="button" data-tour-action="verse-open"><span aria-hidden="true">◈</span> اقرأ آية اليوم</button>':'')+
      (step.mode==='reveal'?'<div class="ayat-tour-reciter-guide" aria-label="حركة توضيحية للأسفل">'+
        '<div class="ayat-tour-reciter-guide-copy"><strong>كمّل لتحت</strong><small>هتلاقي القرّاء أسفل مشغّل التلاوة</small></div>'+
        '<div class="ayat-tour-reciter-motion" aria-hidden="true"><svg viewBox="0 0 48 64"><path d="M17 59c-6-9-14-19-12-24 2-5 8-3 13 4V12c0-9 10-9 10 0v20c2-5 9-6 11-1 5 0 7 5 6 10l-3 17Z"/></svg><span class="ayat-tour-reciter-down">↓</span></div></div>':'')+
      (step.mode==='pick-reciter'?'<div class="ayat-tour-picker-note">اضغط على أي اسم في القائمة. لو النت مش متاح، تقدر تكمّل الشرح بزر «التالي».</div>':'')+
      '<div class="ayat-tour-home-foot">'+
      (current===1?'':'<button type="button" class="ayat-tour-secondary" data-tour-action="previous">السابق</button>')+
      '<button class="ayat-tour-main" type="button" data-tour-action="'+(step.mode==='reveal'?'recitations-reveal':'home-next')+'">'+(step.mode==='reveal'?'اعرض القرّاء':last?'إنهاء الشرح':'التالي')+' <span aria-hidden="true">'+(step.mode==='reveal'?'↓':'←')+'</span></button>'+
      '<button class="ayat-tour-text" type="button" data-tour-action="pause">خروج</button></div>';
    await prepare(step,token);
    if(token!==stepToken||!active)return;
    const target=targetFor(step);
    if(target&&!step.selector.startsWith('.home-bottom-nav')&&step.mode!=='reveal'){
      const rect=target.getBoundingClientRect();
      if(rect.bottom>innerHeight-110||rect.top<12){
        target.scrollIntoView({block:step.mode==='pick-reciter'?'start':'center',inline:'nearest',behavior:'auto'});
      }
    }
    await delay(90);
    if(token!==stepToken||!active)return;
    card.style.visibility='visible';
    position();
    card.focus({preventScroll:true});
  }
  function openHomeVerse(){
    if(kind!=='home'||!active||TOURS.home[active.step].mode!=='verse')return;
    const verse=document.querySelector('.home-verse blockquote')?.textContent?.trim();
    const reference=document.querySelector('.home-verse-reference')?.textContent?.trim();
    if(!verse)return;
    modalOpen=true;
    card.hidden=true;spot.hidden=true;hit.hidden=true;hand.hidden=true;
    modal.hidden=false;
    modal.innerHTML='<div class="ayat-tour-verse-sheet" role="dialog" aria-modal="true" aria-label="قراءة آية التدبّر" tabindex="-1">'+
      '<div class="ayat-tour-verse-eyebrow"><span aria-hidden="true">✦</span> آية اليوم للتدبّر</div>'+
      '<blockquote lang="ar">'+html(verse)+'</blockquote>'+
      '<p class="ayat-tour-verse-reference">'+html(reference||'')+'</p>'+
      '<div class="ayat-tour-verse-divider" aria-hidden="true"></div>'+
      '<div class="ayat-tour-verse-actions"><button class="ayat-tour-secondary" type="button" data-tour-action="verse-back">العودة</button>'+
      '<button class="ayat-tour-main" type="button" data-tour-action="verse-next">متابعة الشرح <span aria-hidden="true">←</span></button></div></div>';
    modal.querySelector('[role="dialog"]')?.focus({preventScroll:true});
  }
  function closeHomeVerse(){
    if(kind!=='home'||!modalOpen||!active||TOURS.home[active.step].mode!=='verse')return false;
    modalOpen=false;modal.hidden=true;card.hidden=false;
    position();card.focus({preventScroll:true});
    return true;
  }
  async function render(){
    if(!active)return;
    if(kind==='home'||kind==='recitations')return renderEditorial();
    const token=++stepToken;
    const s=TOURS[kind][active.step];
    rootOpen(true);clearLayers();
    document.body.classList.toggle('ayat-tour-audio',kind==='quran'&&(s.selector==='#mushaf-audio-player'||s.selector==='#audio-quick-repeat'));
    shade.hidden=false;shade.style.background='transparent';
    card.hidden=false;card.style.visibility='hidden';
    const count=active.step+1;
    const total=TOURS[kind].length;
    const action=s.mode==='tap'
      ? '<p class="ayat-tour-mission">👆 '+(s.activate?'المس البطاقة الذهبية لفتحها':'المس الجزء المضيء لاكتشافه، من غير انتقال أو تغيير بيانات')+'</p>'
      : s.mode==='quiz'
      ? '<div class="ayat-tour-question">'+html(s.question)+'</div><div class="ayat-tour-quiz">'+s.choices.map((choice,i)=>'<button type="button" data-tour-answer="'+i+'">'+html(choice)+'</button>').join('')+'</div>'
      : (s.mode==='swipe'||s.mode==='hold')
      ? '<div class="ayat-tour-playground" data-tour-skill="'+s.mode+'" role="button" tabindex="0" aria-label="'+(s.mode==='swipe'?'منطقة تجربة السحب':'منطقة تجربة الضغط المطوّل')+'"><span class="ayat-tour-play-icon">'+(s.mode==='swipe'?'↔':'◎')+'</span><strong>'+(s.mode==='swipe'?'اسحب هنا بإصبعك':'اضغط هنا لمدة ثانية')+'</strong><small>تدريب صغير من غير تغيير المصحف</small></div>'
      : '';
    card.innerHTML='<div class="ayat-tour-top"><span>✦ مغامرة '+NAMES[kind]+'</span><span class="ayat-tour-count">'+count+' / '+total+'</span></div>' +
      '<div class="ayat-tour-progress"><span style="width:'+(count/total*100)+'%"></span></div>'+
      '<h2 class="ayat-tour-title">'+html(s.title)+'</h2><p class="ayat-tour-body">'+html(s.body)+'</p>'+
      action+'<p class="ayat-tour-feedback" aria-live="polite"></p>'+
      '<div class="ayat-tour-foot"><button class="ayat-tour-secondary" type="button" data-tour-action="previous" '+(count===1?'hidden':'')+'>السابق</button>'+
      '<button class="ayat-tour-text" type="button" data-tour-action="assist">مش قادر؟ عدّي الخطوة</button>'+
      '<button class="ayat-tour-text" type="button" data-tour-action="pause">لاحقًا</button>'+
      '<button class="ayat-tour-text" type="button" data-tour-action="never">إنهاء الشرح</button></div>';
    await prepare(s,token);
    if(token!==stepToken || !active)return;
    const t=targetFor(s);
    if(t){
      const r=t.getBoundingClientRect();
      if(kind!=='quran'&&(r.bottom>innerHeight-95||r.top<10)){
        t.scrollIntoView({block:'center',inline:'nearest',behavior:'auto'});
      }
    }
    await delay(110);
    if(token!==stepToken||!active)return;
    card.style.visibility='visible';
    position();
    card.focus({preventScroll:true});
  }
  function feedback(message,success){
    const el=card.querySelector('.ayat-tour-feedback');
    if(el){el.textContent=message;el.classList.toggle('is-success',!!success);}
  }
  function advance(){
    if(!active||busy)return;
    if(kind==='home'||kind==='recitations'){
      const next=active.step+1;
      if(next>=TOURS[kind].length){finish();return;}
      active.step=next;save(STEP(kind),next);render();
      return;
    }
    busy=true;
    const s=TOURS[kind][active.step];
    feedback('✨ أحسنت! نجحت في التحدي',true);
    card.classList.add('ayat-tour-win');
    setTimeout(()=>{
      if(!active||TOURS[kind][active.step]!==s)return;
      busy=false;card.classList.remove('ayat-tour-win');
      const next=active.step+1;
      if(next>=TOURS[kind].length){finish();return;}
      active.step=next;save(STEP(kind),next);render();
    },580);
  }
  hit.addEventListener('click',()=>{
    if(!active||busy)return;
    const s=TOURS[kind][active.step];
    if(kind==='home'&&s.mode==='verse'){openHomeVerse();return;}
    if(s.mode==='play'&&kind==='recitations'){
      const player=targetFor(s);
      if(player&&!player.disabled)player.click();
      advance();return;
    }
    if(s.mode!=='tap')return;
    if(s.activate){
      const target=targetFor(s);
      if(!target){feedback('البطاقة لسه بتتحمّل، جرّب تاني بعد لحظة.',false);return;}
      target.click();
    }
    advance();
  });
  root.addEventListener('click',event=>{
    const answer=event.target.closest('[data-tour-answer]');
    if(answer&&active&&!busy){
      const s=TOURS[kind][active.step];
      if(s.mode!=='quiz')return;
      const index=Number(answer.getAttribute('data-tour-answer'));
      if(index===s.correct){
        answer.classList.add('correct');advance();
      } else {
        answer.classList.add('incorrect');
        feedback('قريب! جرّب إجابة تانية 😊',false);
      }
      return;
    }
    const button=event.target.closest('[data-tour-action]');
    if(!button)return;
    const action=button.getAttribute('data-tour-action');
    if(action==='begin')start();
    else if(action==='home-next'&&(kind==='home'||kind==='recitations'))advance();
    else if(action==='recitations-reveal'&&kind==='recitations'){
      const catalog=document.getElementById('catalog');
      if(catalog){catalog.scrollIntoView({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});}
      setTimeout(()=>{if(active&&kind==='recitations'&&TOURS[kind][active.step]?.mode==='reveal')advance();},500);
    }
    else if(action==='verse-open')openHomeVerse();
    else if(action==='verse-back'&&kind==='home')closeHomeVerse();
    else if(action==='verse-next'&&modalOpen&&kind==='home'){
      modalOpen=false;modal.hidden=true;card.hidden=false;advance();
    }
    else if(action==='later'||action==='pause')postpone();
    else if(action==='never')never();
    else if(action==='dismiss')close();
    else if(action==='assist')advance();
    else if(action==='previous'&&active&&!busy&&active.step>0){active.step--;save(STEP(kind),active.step);render();}
    else if(action.startsWith('replay-'))replay(action.slice(7));
  });
  const skillPoint=e=>({x:e.clientX,y:e.clientY});
  function clearSkill(){
    clearTimeout(skillTimer);
    skillTimer=0;skillStart=null;
  }
  root.addEventListener('pointerdown',e=>{
    const pad=e.target.closest('[data-tour-skill]');
    if(!pad||!active||busy)return;
    clearSkill();skillStart={...skillPoint(e),step:active.step};
    if(pad.dataset.tourSkill==='hold'){
      pad.classList.add('is-pressing');
      skillTimer=setTimeout(()=>{if(active&&skillStart&&skillStart.step===active.step){clearSkill();pad.classList.remove('is-pressing');advance();}},680);
    }
  });
  root.addEventListener('pointerup',e=>{
    const pad=e.target.closest('[data-tour-skill]');
    if(!pad||!skillStart||!active||busy){clearSkill();return;}
    const x=e.clientX-skillStart.x;
    const mode=pad.dataset.tourSkill;
    if(mode==='swipe'&&Math.abs(x)>=50){
      clearSkill();advance();
    }else if(mode==='swipe')feedback('اسحب مسافة أطول شوية ↔',false);
    else feedback('اثبت بإصبعك لحظة كمان 👆',false);
    pad.classList.remove('is-pressing');clearSkill();
  });
  root.addEventListener('pointercancel',clearSkill);
  root.addEventListener('keydown',e=>{
    const pad=e.target.closest('[data-tour-skill]');
    if(pad&&(e.key==='Enter'||e.key===' ')){
      e.preventDefault();
      if(!busy)advance();
      return;
    }
    if(e.key!=='Tab')return;
    const panel=!modal.hidden?modal:!card.hidden?card:invite;
    const focusable=[...(!hit.hidden?[hit]:[]),...panel.querySelectorAll('button:not(:disabled):not([hidden]),[tabindex="0"]')].filter(el=>el.getClientRects().length);
    if(!focusable.length)return;
    const first=focusable[0],last=focusable[focusable.length-1];
    if(e.shiftKey&&(document.activeElement===first||document.activeElement===card)){
      e.preventDefault();last.focus();
    }else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===card)){
      e.preventDefault();first.focus();
    }
  });
  document.addEventListener('keydown',e=>{
    if(e.key!=='Escape'||root.hidden)return;
    e.preventDefault();
    if(closeHomeVerse())return;
    active?postpone():close();
  });
  window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(position,75)});
  window.addEventListener('scroll',()=>{if(active)requestAnimationFrame(position)},true);
  document.addEventListener('ayat:splash-finished',()=>root.classList.remove('under-splash'));
  // Delegation survives settings DOM re-creation and handles WebView click routing.
  document.addEventListener('click',event=>{
    if(event.target.closest('#ayat-tour-settings-button')){
      event.preventDefault();
      event.stopPropagation();
      chooser();
    }
  },true);
  // Explicit user entry point is independent of invitation and completion state.
  window.ayatOpenTour = chooser;
  window.ayatStartHomeTour = () => { if(kind==='home')start(true); };
  document.addEventListener('ayat:reciter-chosen',()=>{
    if(kind==='recitations'&&active&&TOURS[kind][active.step]?.mode==='pick-reciter'){
      setTimeout(()=>{if(active&&TOURS[kind][active.step]?.mode==='pick-reciter')advance();},380);
    }
  });
  function initialize(){
    if(initialized)return;
    initialized=true;
    const requested=new URLSearchParams(location.search).get('ayatHelp');
    if(requested===kind){
      try{
        const url=new URL(location.href);url.searchParams.delete('ayatHelp');
        history.replaceState(history.state,'',url.pathname+url.search+url.hash);
      }catch(_){}
      start(true);return;
    }
    if(PAGE==='index.html'&&document.getElementById('ayat-guide')&&!document.getElementById('ayat-guide').hidden){
      document.addEventListener('ayat:guide-finished',showInvite,{once:true});return;
    }
    showInvite();
  }
  if(PAGE==='index.html'){
    const splash=document.getElementById('ayat-welcome');
    if(splash&&(!splash.hidden||document.documentElement.classList.contains('ayat-splash-startup'))){
      document.addEventListener('ayat:splash-finished',initialize,{once:true});
    }else initialize();
  }else setTimeout(initialize,PAGE==='quran.html'?340:100);
})();
