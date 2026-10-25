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
      {selector:'@tour-verse',mode:'real-verse',group:'التعامل مع الآيات',title:'اضغط مطولًا على الآية المنوّرة',body:'اخترنا آية واضحة من الصفحة الحالية. اضغط بإصبعك على أي كلمة من الآية المنوّرة لمدة لحظة، وسيظهر شريط خيارات الآية الحقيقي.',gesture:'hold'},
      {selector:'#verse-actions-sheet',mode:'note',group:'خيارات الآية',title:'كل ما تحتاجه للآية',body:'هذه هي قائمة الآية الحقيقية: التفسير، والاستماع، والمفضلة، والنسخ، والمشاركة كصورة، وفاصلة الآية.'},
      {selector:'[data-verse-action="tafsir"]',mode:'note',group:'خيارات الآية',title:'التفسير الميسّر',body:'يفتح معنى الآية داخل المصحف، مع الانتقال للآية السابقة أو التالية من نافذة التفسير.'},
      {selector:'[data-verse-action="listen"]',mode:'note',group:'خيارات الآية',title:'ابدأ الاستماع من هنا',body:'زر الاستماع يبدأ من الآية المختارة بتوقيت دقيق. يفضّل القارئ الذي حمّلته، أو تسجيلًا آخر محمّلًا بتوقيتات مطابقة. لو ما فيش تسجيل مناسب ولا إنترنت، تظهر رسالة واضحة بدل تحويل القارئ تلقائيًا.'},
      {selector:'.verse-actions-grid',mode:'note',group:'خيارات الآية',title:'حفظ ونسخ ومشاركة',body:'يمكنك إضافة الآية للمفضلة، نسخ نصها، مشاركتها كصورة، أو وضع فاصلة آية. الجولة تشرح هذه الأدوات من غير تغيير محفوظاتك.'},
      {selector:'#open-index',mode:'real-open',opens:'#index-sheet',prepare:'close-verse',group:'الفهرس',title:'افتح الفهرس بنفسك',body:'اضغط زر الخطوط الحقيقي أعلى المصحف لفتح الفهرس.'},
      {selector:'#index-sheet',mode:'note',group:'الفهرس',title:'السور والأجزاء والآيات',body:'بدّل بين تبويب السور والأجزاء، وافتح سهم السورة لعرض آياتها والبحث داخلها ثم الانتقال للموضع المطلوب. لن تغيّر الجولة موضع قراءتك.'},
      {selector:'#toggle-page-marker',mode:'note',prepare:'close-index',group:'الفواصل',title:'فاصلة الصفحة',body:'هذا الزر يحفظ الصفحة الحالية لتعود إليها من المحفوظات. لن تضغطه الجولة حتى لا تستبدل فاصلتك الحالية.'},
      {selector:'#open-settings',mode:'real-open',opens:'#settings-sheet',group:'إعدادات المصحف',title:'افتح الإعدادات بنفسك',body:'اضغط زر الإعدادات الحقيقي لنرى البحث والمحفوظات وخيارات المظهر.'},
      {selector:'#open-saved',mode:'note',group:'إعدادات المصحف',title:'المحفوظات',body:'من هنا ترجع للمفضلة وفاصلة الآية وفاصلة الصفحة، وكل نوع موجود في تبويب مستقل.'},
      {selector:'#open-quran-search',mode:'note',group:'إعدادات المصحف',title:'البحث عن آية',body:'البحث يعمل بالكلمة أو بجزء من الآية، ويتجاهل التشكيل، ثم ينقلك للموضع أو يفتح التفسير. وهو متاح دون إنترنت.'},
      {selector:'#audio-open-options',mode:'real-open',opens:'#audio-options-sheet',prepare:'close-settings',audio:true,group:'التلاوة',title:'افتح خيارات التلاوة',body:'اضغط اسم القارئ الحقيقي أعلى المشغّل لفتح خيارات الاستماع.'},
      {selector:'#audio-reciter-field',mode:'note',audio:true,group:'خيارات التلاوة',title:'اختيار القارئ',body:'من هنا تختار القارئ اللي تحبه، وتقدر تبحث باسمه. مش لازم تختار قارئ أثناء الشرح، اضغط «التالي» عشان نكمل.'},
      {selector:'#audio-sync-note',fallback:'#audio-auto-follow',mode:'note',audio:true,group:'خيارات التلاوة',title:'تظليل الآية والكلمة',body:'التسجيلات المتزامنة تظلّل الآية والكلمة حسب توقيتات موثوقة لنفس التسجيل. بعض تلاوات MP3Quran تدعم تظليل الآية فقط. خيار المتابعة التلقائية ينقل الصفحة مع التلاوة ويمكنك إيقافه.'},
      {selector:'#audio-surah-field',mode:'note',audio:true,group:'خيارات التلاوة',title:'السورة وآية البداية',body:'اختر السورة من هنا. وللبدء من آية محددة، افتح خيارات الآية واضغط «الاستماع» كما رأيت في بداية الجولة.'},
      {selector:'.audio-download-actions',mode:'note',audio:true,group:'التحميل',title:'الاستماع دون إنترنت',body:'التطبيق لا يحمل مصحفًا صوتيًا ضمن ملف التثبيت لتوفير المساحة. اختر السور أو القارئ وحمّل التسجيلات من MP3Quran للاستماع دون إنترنت. لا تبدأ الجولة أي تنزيل، ويعرض التطبيق المساحة وحالة التقدم.'},
      {selector:'#audio-download-list',fallback:'#audio-storage-info',mode:'note',audio:true,group:'التحميل',title:'إدارة الملفات المحمّلة',body:'تظهر التسجيلات المحفوظة هنا في مجلدات حسب القارئ، ويمكن حذفها أو فتح مكتبة القرّاء الكاملة لإدارة ما نزلته.'}
    ],
    recitations: [
      {selector:'.intro',mode:'reveal',group:'ابدأ من هنا',title:'القرّاء موجودين تحت',body:'صفحة التلاوات فيها قرّاء كتير، لكن قائمتهم أسفل المشغّل. تابع حركة اليد لتعرف الاتجاه، وبعدها اضغط «اعرض القرّاء» عشان نوصل لهم مباشرة.'},
      {selector:'#reciter-list',mode:'pick-reciter',group:'اختيار القارئ',title:'اختار القارئ اللي تحبه',body:'دي القائمة الكاملة للقرّاء. اضغط على أي قارئ بنفسك، وهيظهر اختياره في المشغّل فوق. تقدر تبحث باسمه كمان.'},
      {selector:'#surah-select',mode:'note',group:'التلاوة',title:'اختيار السورة',body:'بعد اختيار القارئ، من القائمة دي تختار السورة اللي عايز تسمعها.'},
      {selector:'#play-pause',mode:'play',group:'الاستماع',title:'تشغيل التلاوة',body:'ده زر التشغيل والإيقاف المؤقت. تقدر تضغط عليه دلوقتي وتسمع القارئ اللي اخترته، أو تكمل الشرح من غير تشغيل.'},
      {selector:'#download-current',mode:'note',group:'التنزيل',title:'تنزيل سورة واحدة',body:'الزر ده بيحفظ السورة المختارة على جهازك عشان تسمعها لاحقًا بدون إنترنت. الشرح نفسه مش هيبدأ أي تنزيل.'},
      {selector:'#download-all',mode:'note',group:'التنزيل',title:'تنزيل مصحف القارئ',body:'لو عايز سور القارئ المتاحة كلها، الزر ده بيبدأ تنزيلها دفعة واحدة، حسب المساحة المتاحة. مش هننزّل ملفات أثناء الشرح.'},
      {selector:'.my-library-card',mode:'note',group:'ملفاتك المحفوظة',title:'مكتبتي',body:'أي سورة أو مصحف نزّلته هتلاقيه هنا مرتبًا حسب القارئ والسورة، وتقدر تشغّله من غير إنترنت.'}
    ],
    library: [
      {selector:'.hero',mode:'note',group:'مكتبتك الصوتية',title:'التلاوات المحفوظة',body:'هنا بتلاقي كل السور اللي حمّلتها من التلاوات، وتقدر تسمعها من غير إنترنت.'},
      {selector:'#library-search',mode:'note',group:'التنظيم',title:'البحث في المكتبة',body:'اكتب اسم القارئ أو السورة عشان توصل للتسجيل المطلوب بسرعة.'},
      {selector:'#sort-mode',mode:'note',group:'التنظيم',title:'ترتيب التلاوات',body:'رتّب الملفات حسب القارئ أو السورة أو الأحدث تنزيلًا، بالطريقة اللي تريحك.'},
      {selector:'#library-content',fallback:'#library-empty',mode:'note',group:'ملفاتك',title:'ملفاتك المحمّلة',body:'السور المحفوظة بتظهر هنا مرتبة، ولو المكتبة فاضية تقدر ترجع للتلاوات وتحمّل اللي تحبه.'},
      {selector:'#clear-library',mode:'note',group:'إدارة المساحة',title:'حذف التنزيلات',body:'من هنا تقدر تحذف التنزيلات كلها لو محتاج تفضّي مساحة. الشرح مش هيمسح أي ملف.'}
    ],
    adhkar: [
      {selector:'.hero',mode:'reveal',group:'دليل الأذكار',title:'باقي الأذكار موجودة تحت',body:'الاختصارات مجرد بداية. هتلاقي أسفلها أبواب حصن المسلم كلها مرتبة. اتبع حركة اليد لتحت، واضغط «اعرض الأبواب» عشان تشوفها.'},
      {selector:'#filters [data-filter="saved"]',mode:'note',group:'الأبواب والمفضلة',title:'المفضلة أولًا',body:'الزر ده بيعرض الأبواب اللي حفظتها بالقلب. لو لسه محفظتش أي باب، هتكون القائمة فاضية لحد ما تضيف أول مفضلة.'},
      {selector:'#open-index',mode:'note',group:'الانتقال السريع',title:'فهرس الأذكار',body:'الزر الصغير ده فوق جنب المظهر. بيفتح فهرس الأبواب المتقسم حسب الموضوع، وفيه بحث عشان توصل للذكر بسرعة.'},
      {selector:'.quick-card.morning',mode:'open-chapter',group:'الاختصارات',title:'افتح أذكار الصباح',body:'الاختصارات دي توصّلك لأكثر الأذكار استخدامًا. اضغط بنفسك على بطاقة «أذكار الصباح» المنوّرة عشان ندخل ونكمل الشرح هناك.'},
      {selector:'#dhikr-text',wait:'reader',mode:'note',group:'داخل الأذكار',title:'نص الذكر',body:'ده نص الذكر كاملًا. اقراه على مهلك، وفوقه هتشوف رقمه وعدد الأذكار الموجودة في الباب.'},
      {selector:'#tasbih',wait:'reader',mode:'note',group:'داخل الأذكار',title:'عداد التكرار',body:'اضغط على الدائرة بعد كل مرة تقرأ فيها الذكر. الرقم بيزيد لحد العدد المطلوب، ويحتفظ بتقدّمك. الشرح مش هيغيّر عدادك.'},
      {selector:'#dhikr-reference',wait:'reader',mode:'note',group:'داخل الأذكار',title:'مرجع الذكر',body:'تحت العداد هتلاقي مصدر الذكر ومرجعه، عشان تعرف النص منقول منين.'},
      {selector:'#reader-favorite',wait:'reader',mode:'note',group:'حفظ الأبواب',title:'القلب للمفضلة',body:'من هنا تحفظ باب الأذكار كله في المفضلة اللي شفتها في الفهرس. الشرح مش هيضيف أي مفضلة من نفسه.'},
      {selector:'#reader-viewport',wait:'reader',mode:'real-swipe',group:'حركة التقليب',title:'قلّب الذكر بإيدك',body:'اسحب على مساحة الذكر من الشمال لليمين عشان يفتح الذكر اللي بعده، زي حركة اليد قدامك. جرّبها بنفسك، والجولة هتخلص تلقائيًا بعد تقليب حقيقي.'}
    ]
  };
  const kind = PAGES[PAGE];
  if (!kind) return;
  const VERSIONS = {home:'v8',quran:'v7',recitations:'v7',library:'v7',adhkar:'v7'};
  const versionFor = k => VERSIONS[k] || 'v1';
  const DONE = k => 'ayat-tour-done-' + k + '-' + versionFor(k);
  const STEP = k => 'ayat-tour-step-' + k + '-' + versionFor(k);
  const LATER = k => 'ayat-tour-remind-at-' + k + '-' + versionFor(k);
  const LAST = k => 'ayat-tour-last-shown-' + k + '-' + versionFor(k);
  const OPT_OUT = k => 'ayat-tour-optout-' + k + '-' + versionFor(k);
  const REQUEST = 'ayat-tour-manual-request-v1';
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
  let active = null, modalOpen = false, busy = false, resizeTimer = 0, skillTimer = 0, skillStart = null, stepToken = 0, initialized = false, tourVerseKey = '';
  const root = document.createElement('div');
  root.id = 'ayat-tour-root';
  root.className = 'ayat-tour-root' + ((kind==='home'||kind==='recitations'||kind==='adhkar'||kind==='quran'||kind==='library')?' is-editorial':'') + (kind==='home'?' is-home':'') + (kind==='recitations'?' is-recitations':'') + (kind==='adhkar'?' is-adhkar':'')+(kind==='library'?' is-library':'') + (kind==='quran'?' is-quran':'');
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
  function clearTourVerse(){
    document.querySelectorAll('.mushaf-word.ayat-tour-verse-target').forEach(word=>word.classList.remove('ayat-tour-verse-target'));
    tourVerseKey='';
  }
  function rootOpen(forLesson=false){
    root.hidden=false;
    root.classList.toggle('under-splash',!!document.getElementById('ayat-welcome')&&!document.getElementById('ayat-welcome').hidden);
    document.documentElement.classList.remove('ayat-tour-boot');
    document.body.classList.toggle('ayat-tour-on',forLesson);
  }
  function close(){
    ++stepToken;clearTimeout(skillTimer);busy=false;modalOpen=false;active=null;
    clearTourVerse();
    root.hidden=true;
    root.classList.remove('is-verse-focused','is-choose-reciter','is-real-swipe','is-opening-chapter','is-quran-interactive');
    hand.classList.remove('is-adhkar-swipe');
    invite.hidden=shade.hidden=spot.hidden=hit.hidden=hand.hidden=modal.hidden=card.hidden=true;
    document.body.classList.remove('ayat-tour-on','ayat-tour-audio');
    document.documentElement.classList.remove('ayat-tour-boot');
  }
  function clearLayers(){
    invite.hidden=true;modal.hidden=true;card.hidden=true;
    shade.hidden=spot.hidden=hit.hidden=hand.hidden=true;
  }
  function showInvite(){
    if(active||modalOpen||storageRead(DONE(kind))==='1'||storageRead(OPT_OUT(kind))==='1'||Number(storageRead(LATER(kind))||0)>Date.now()||(kind!=='home' && kind!=='recitations' && kind!=='adhkar' && Number(storageRead(LAST(kind))||0)+REOFFER_AFTER>Date.now())){
      document.documentElement.classList.remove('ayat-tour-boot');return;
    }
    rootOpen(false);clearLayers();save(LAST(kind),Date.now());
    const pending=Math.min(TOURS[kind].length-1,Math.max(0,Number(storageRead(STEP(kind))||0)));
    invite.hidden=false;
    if(kind==='home'||kind==='recitations'||kind==='adhkar'||kind==='library'){
      invite.innerHTML=
        '<div class="ayat-tour-invite-icon" aria-hidden="true">✧</div>' +
        '<div class="ayat-tour-invite-copy"><strong>'+(kind==='home'?(pending?'نكمل شرح الرئيسية؟':'جولة هادئة في الرئيسية'):kind==='recitations'?(pending?'نكمل شرح التلاوات؟':'اكتشف قائمة القرّاء'):(kind==='library'?(pending?'نكمل شرح المكتبة؟':'دليل المكتبة الصوتية'):(pending?'نكمل شرح الأذكار؟':'اكتشف أبواب الأذكار')))+
        '</strong><span>'+(kind==='home'?'جولة مختصرة للقراءة والتدبّر وأزرار التنقّل':kind==='recitations'?'القرّاء موجودين أسفل المشغّل، والشرح هيوصلك لهم':(kind==='library'?'تعرّف على البحث والترتيب وملفاتك المحفوظة':'اعرف مكان الأبواب والمفضلة، وبعدها جرّب التقليب بنفسك'))+'</span></div>'+
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
  function quranResumeStep(index){
    // The tour now restores the real panel belonging to every step, so it
    // can resume exactly where the user stopped.
    return index;
  }
  function closeEditorialPanels(){
    if(kind==='adhkar'){
      if(!document.getElementById('reader')?.hidden)document.getElementById('close-reader')?.click();
      if(document.getElementById('index-sheet')?.getAttribute('aria-hidden')==='false')
        document.getElementById('close-index')?.click();
    }
    if(kind==='home'){
      modalOpen=false;
      modal.hidden=true;
    }
  }
  function closeQuranPanels(){
    if(kind!=='quran')return;
    for(const [sheet,button] of [
      ['#verse-actions-sheet.is-open','#close-verse-actions'],
      ['#index-sheet.is-open','#close-index'],
      ['#settings-sheet.is-open','#close-settings'],
      ['#audio-options-sheet.is-open','#audio-close-options']
    ]){
      if(document.querySelector(sheet))document.querySelector(button)?.click();
    }
  }
  // A Quran tour step is a pair: explanatory card + actual app panel.
  // Reconcile both on Next, Previous, Skip and resume. No step may depend
  // on a side effect from an earlier step.
  async function syncQuranStep(index,token){
    if(kind!=='quran')return;
    const verseSteps=index>=1&&index<=4;
    const indexStep=index===6;
    const settingsStep=index===9||index===10;
    const audioStep=index>=12;
    const closeIfOpen=(selector,button)=>{
      if(document.querySelector(selector)?.classList.contains('is-open'))
        document.querySelector(button)?.click();
    };
    closeIfOpen('#verse-actions-sheet','#close-verse-actions');
    if(indexStep){
      closeIfOpen('#settings-sheet','#close-settings');
      closeIfOpen('#audio-options-sheet','#audio-close-options');
      if(!document.querySelector('#index-sheet.is-open'))
        document.getElementById('open-index')?.click();
    }else if(settingsStep){
      closeIfOpen('#index-sheet','#close-index');
      closeIfOpen('#audio-options-sheet','#audio-close-options');
      if(!document.querySelector('#settings-sheet.is-open'))
        document.getElementById('open-settings')?.click();
    }else if(audioStep){
      closeIfOpen('#index-sheet','#close-index');
      closeIfOpen('#settings-sheet','#close-settings');
      if(!document.querySelector('#audio-options-sheet.is-open'))
        document.getElementById('audio-open-options')?.click();
    }else{
      closeIfOpen('#index-sheet','#close-index');
      closeIfOpen('#settings-sheet','#close-settings');
      closeIfOpen('#audio-options-sheet','#audio-close-options');
    }
    if(!verseSteps)return;
    // Wait for the genuine 604-page Mushaf words to be rendered before
    // opening the real verse-actions sheet after a skipped long press.
    for(let attempt=0;attempt<80;attempt++){
      if(token!==stepToken||!active||active.step!==index)return;
      const word=chooseTourVerse();
      if(word){
        const match=/^(\d+):(\d+)$/.exec(word.dataset.verse||'');
        if(match&&window.mushafVerseActions?.openForTour?.({
          surah:Number(match[1]),ayah:Number(match[2])
        }))return;
      }
      await delay(100);
    }
  }
  function start(replay=false){
    ++stepToken;modalOpen=false;
    remove(LATER(kind));remove(DONE(kind));remove(OPT_OUT(kind));
    const saved=Number(storageRead(STEP(kind))||0);
    const restored=!replay&&Number.isInteger(saved)?Math.min(Math.max(0,saved),TOURS[kind].length-1):0;
    const index=quranResumeStep(restored);
    active={kind,step:index};
    save(STEP(kind),index);
    document.getElementById('close-settings')?.click();
    clearLayers();rootOpen(true);
    return render();
  }
  function replay(k){
    if(!TOURS[k])return;
    remove(DONE(k));remove(LATER(k));remove(STEP(k));remove(OPT_OUT(k));
    if(k!==kind){
      // Persist the explicit request as well as carrying it in the URL. This
      // survives Android/WebView navigation and cannot be mistaken for an
      // automatic invitation on the destination page.
      const request={kind:k,token:Date.now().toString(36)+Math.random().toString(36).slice(2),at:Date.now()};
      save(REQUEST,JSON.stringify(request));
      const target=new URL(PAGE_FOR[k],location.href);
      target.searchParams.set('ayatHelp',k);
      target.searchParams.set('ayatRequest',request.token);
      location.assign(target.href);
      return;
    }
    start(true);
  }
  function finish(){
    save(DONE(kind),'1');
    save(LAST(kind),Date.now());
    remove(STEP(kind));
    remove(LATER(kind));
    closeQuranPanels();
    // The adhkar reader is a genuine reading surface. Keep it open after a
    // real swipe; otherwise close tour-owned sheets on early exits.
    if(!(kind==='adhkar'&&!document.getElementById('reader')?.hidden))
      closeEditorialPanels();
    close();
    // The guide closes quietly. No congratulations or completion toast.
  }
  function postpone(){
    if(active)save(STEP(kind),active.step);
    save(LATER(kind),Date.now()+24*60*60*1000);
    closeQuranPanels();
    closeEditorialPanels();
    close();
  }
  function never(){
    save(OPT_OUT(kind),'1');save(DONE(kind),'1');remove(STEP(kind));remove(LATER(kind));closeQuranPanels();closeEditorialPanels();close();
  }
  function chooseTourVerse(){
    if(kind!=='quran')return null;
    if(tourVerseKey){
      const existing=[...document.querySelectorAll('.mushaf-word[data-verse]')].filter(word=>word.dataset.verse===tourVerseKey);
      if(existing.length)return existing[Math.floor(existing.length/2)];
    }
    clearTourVerse();
    const page=document.getElementById('mushaf-page');
    const pageRect=page?.getBoundingClientRect();
    const groups=new Map();
    document.querySelectorAll('#quran-text .mushaf-word[data-verse]').forEach(word=>{
      const key=word.dataset.verse;
      if(!key)return;
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(word);
    });
    const centerY=pageRect?pageRect.top+pageRect.height*.5:innerHeight*.5;
    const candidates=[...groups.entries()].map(([key,words])=>{
      const rects=words.map(word=>word.getBoundingClientRect()).filter(rect=>rect.width&&rect.height);
      if(!rects.length)return null;
      const middle=rects.reduce((sum,rect)=>sum+(rect.top+rect.bottom)/2,0)/rects.length;
      return {key,words,middle,distance:Math.abs(middle-centerY)};
    }).filter(Boolean).sort((a,b)=>a.distance-b.distance);
    const chosen=candidates.find(item=>item.words.length>=3)||candidates[0];
    if(!chosen)return null;
    tourVerseKey=chosen.key;
    chosen.words.forEach(word=>word.classList.add('ayat-tour-verse-target'));
    return chosen.words[Math.floor(chosen.words.length/2)];
  }
  function targetFor(step){
    let t=step.selector==='@tour-verse'?chooseTourVerse():document.querySelector(step.selector);
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
    if(kind==='adhkar'&&s.mode==='real-swipe'){
      hit.hidden=true;hand.hidden=false;
      hand.classList.add('is-adhkar-swipe');
      const cw=Math.min(380,innerWidth-24),ch=card.offsetHeight||255;
      const cy=Math.max(12,innerHeight-ch-100);
      card.style.left=Math.max(12,(innerWidth-cw)/2)+'px';
      card.style.top=cy+'px';
      hand.style.left=Math.max(20,innerWidth*.23)+'px';
      hand.style.top=Math.max(135,Math.min(cy-70,top+height*.29))+'px';
      return;
    }
    const tapping=s.mode==='tap'||s.mode==='verse'||s.mode==='play'||s.mode==='open-chapter';
    hit.hidden=!tapping;
    if(tapping){
      Object.assign(hit.style,{left:left+'px',top:top+'px',width:width+'px',height:height+'px'});
      hit.classList.toggle('ayat-tour-verse-hit',s.mode==='verse');
      hit.classList.toggle('is-open-chapter',s.mode==='open-chapter');
      hit.setAttribute('aria-label',s.mode==='verse'?'افتح آية التدبّر للقراءة':s.mode==='open-chapter'?'اضغط لفتح أذكار الصباح':s.activate?'افتح العنصر المنوّر':'اكتشف '+s.title);
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
    const gesture=s.mode==='swipe'||s.mode==='hold'||s.gesture==='hold';
    hand.hidden=!gesture;
    if(gesture){
      hand.classList.toggle('is-swipe',s.mode==='swipe');
      hand.classList.toggle('is-hold',s.mode==='hold'||s.gesture==='hold');
      hand.style.left=Math.max(20,Math.min(innerWidth-55,left+width*.5))+'px';
      hand.style.top=Math.max(20,Math.min(innerHeight-75,top+height*.5))+'px';
    }
  }
  // Editorial tours have real UI state too: a dhikr reader, chapter index,
  // reciter list, and the home verse preview. Reconcile them on every render
  // so Previous, Next, resume and Skip never explain a missing surface.
  async function syncEditorialStep(index,token){
    if(kind==='home'){
      if(modalOpen){modalOpen=false;modal.hidden=true;}
      return true;
    }
    if(kind==='adhkar'){
      if(document.getElementById('index-sheet')?.getAttribute('aria-hidden')==='false')
        document.getElementById('close-index')?.click();
      const reader=document.getElementById('reader');
      if(index<=3){
        if(reader&&!reader.hidden)document.getElementById('close-reader')?.click();
        return true;
      }
      const isMorning=()=>{
        const title=(document.getElementById('reader-title')?.textContent||'')
          .normalize('NFKD').replace(/[\u064B-\u065F\u0670\u0640]/g,'')
          .replace(/[إأآٱ]/g,'ا').trim();
        return title.includes('اذكار الصباح');
      };
      if(reader&&!reader.hidden&&!isMorning())
        document.getElementById('close-reader')?.click();
      if(reader&&!reader.hidden&&isMorning())return true;
      const button=document.querySelector('.quick-card.morning');
      // The local adhkar dataset can finish loading after the tour opens.
      // Only click the real morning card once its actual chapter exists.
      for(let i=0;i<100;i++){
        if(token!==stepToken||!active||active.step!==index)return false;
        if(reader&&!reader.hidden&&isMorning())return true;
        if(button&&!document.getElementById('chapter-list')?.querySelector('.chapter')){
          await delay(100);continue;
        }
        if(button){button.click();await delay(70);}
        if(reader&&!reader.hidden&&isMorning())return true;
        await delay(100);
      }
      // Never show a lesson about a missing dhikr reader.
      if(token===stepToken&&active&&active.step===index){
        active.step=3;save(STEP(kind),3);
        render();
      }
      return false;
    }
    if(kind==='recitations'&&index===1){
      // The reciter catalog is the real surface; keep it visible when
      // returning from the player, even if offline catalog is empty.
      const list=document.getElementById('reciter-list');
      if(list&&list.getBoundingClientRect().top<0)
        document.getElementById('catalog')?.scrollIntoView({block:'start',behavior:'auto'});
    }
    return true;
  }
  async function prepare(s,token){
    if(kind!=='quran'){
      if(!(await syncEditorialStep(active.step,token)))return;
      if(token!==stepToken||!active)return;
    }
    if(kind==='quran'){
      await syncQuranStep(active.step,token);
      if(token!==stepToken)return;
      if(s.prepare==='close-verse')document.getElementById('close-verse-actions')?.click();
      else if(s.prepare==='close-index')document.getElementById('close-index')?.click();
      else if(s.prepare==='close-settings')document.getElementById('close-settings')?.click();
      if(s.selector==='@tour-verse'){
        for(let i=0;i<100&&!chooseTourVerse();i++){
          if(token!==stepToken)return;
          await delay(100);
        }
      }
    }
    if(s.wait==='reader'){
      for(let i=0;i<15 && document.getElementById('reader')?.hidden;i++){
        if(token!==stepToken)return;
        await delay(220);
      }
    }
    for(let i=0;i<60 && !targetFor(s);i++){
      if(token!==stepToken)return;
      await delay(100);
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
    root.classList.toggle('is-real-swipe',kind==='adhkar'&&step.mode==='real-swipe');
    root.classList.toggle('is-opening-chapter',kind==='adhkar'&&step.mode==='open-chapter');
    hand.classList.toggle('is-adhkar-swipe',kind==='adhkar'&&step.mode==='real-swipe');
    shade.hidden=false;shade.style.background='transparent';
    card.hidden=false;card.style.visibility='hidden';
    // User gestures pass through during actual reciter selection and dhikr swiping.
    card.setAttribute('aria-modal',String(step.mode!=='pick-reciter'&&step.mode!=='real-swipe'));
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
      '<div class="ayat-tour-home-progress" style="grid-template-columns:repeat('+total+',minmax(0,1fr))" aria-hidden="true">'+progress+'</div>'+
      '<h2 class="ayat-tour-title">'+html(step.title)+'</h2>'+
      '<p class="ayat-tour-body">'+html(step.body)+'</p>'+
      (step.mode==='verse'?'<button class="ayat-tour-home-read" type="button" data-tour-action="verse-open"><span aria-hidden="true">◈</span> اقرأ آية اليوم</button>':'')+
      (step.mode==='reveal'?'<div class="ayat-tour-reciter-guide" aria-label="حركة توضيحية للأسفل">'+
        '<div class="ayat-tour-reciter-guide-copy"><strong>كمّل لتحت</strong><small>'+(kind==='adhkar'?'هتلاقي أبواب حصن المسلم أسفل الاختصارات':'هتلاقي القرّاء أسفل مشغّل التلاوة')+'</small></div>'+
        '<div class="ayat-tour-reciter-motion" aria-hidden="true"><svg viewBox="0 0 48 64"><path d="M17 59c-6-9-14-19-12-24 2-5 8-3 13 4V12c0-9 10-9 10 0v20c2-5 9-6 11-1 5 0 7 5 6 10l-3 17Z"/></svg><span class="ayat-tour-reciter-down">↓</span></div></div>':'')+
      (step.mode==='pick-reciter'?'<div class="ayat-tour-picker-note">اضغط على أي اسم في القائمة. لو النت مش متاح، تقدر تكمّل الشرح بزر «التالي».</div>':'')+
      (step.mode==='open-chapter'?'<div class="ayat-tour-picker-note">المس بطاقة «أذكار الصباح» المضيئة عشان تفتحها بنفسك.</div>':'')+
      (step.mode==='real-swipe'?'<div class="ayat-tour-swipe-note" aria-live="polite"><span aria-hidden="true">← <strong>اسحب</strong> →</span> مرّر إصبعك على الذكر ناحية اليمين. مفيش زر «التالي» هنا.</div>':'')+
      '<div class="ayat-tour-home-foot">'+
      (current===1?'':'<button type="button" class="ayat-tour-secondary" data-tour-action="previous">السابق</button>')+
      (step.mode==='real-swipe'||step.mode==='open-chapter'?'':'<button class="ayat-tour-main" type="button" data-tour-action="'+(step.mode==='reveal'?(kind==='adhkar'?'adhkar-reveal':'recitations-reveal'):'home-next')+'">'+(step.mode==='reveal'?(kind==='adhkar'?'اعرض الأبواب':'اعرض القرّاء'):last?'إنهاء الشرح':'التالي')+' <span aria-hidden="true">'+(step.mode==='reveal'?'↓':'←')+'</span></button>')+
      ((step.mode==='open-chapter'||step.mode==='real-swipe')?'<button class="ayat-tour-secondary" type="button" data-tour-action="assist">'+(step.mode==='real-swipe'?'إنهاء بدون تقليب':'تخطي الخطوة')+'</button>':'')+
      '<button class="ayat-tour-text" type="button" data-tour-action="pause">خروج</button></div>';
    await prepare(step,token);
    if(token!==stepToken||!active||active.step!==TOURS[kind].indexOf(step))return;
    const target=targetFor(step);
    if(kind==='recitations'&&step.mode==='reveal'&&window.scrollY>80){
      window.scrollTo({top:0,behavior:'auto'});
    }
    if(target&&!step.selector.startsWith('.home-bottom-nav')&&step.mode!=='reveal'&&step.mode!=='real-swipe'){
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
    if(kind==='home'||kind==='recitations'||kind==='adhkar'||kind==='library')return renderEditorial();
    const token=++stepToken;
    const s=TOURS[kind][active.step];
    if(s.selector!=='@tour-verse')clearTourVerse();
    rootOpen(true);clearLayers();
    const realInteraction=s.mode==='real-verse'||s.mode==='real-open'||s.mode==='pick-quran-reciter';
    root.classList.toggle('is-quran-interactive',kind==='quran'&&realInteraction);
    document.body.classList.toggle('ayat-tour-audio',kind==='quran'&&!!s.audio);
    shade.hidden=false;shade.style.background='transparent';
    card.hidden=false;card.style.visibility='hidden';
    const count=active.step+1;
    const total=TOURS[kind].length;
    const quranGuide=kind==='quran';
    const instruction=s.mode==='real-verse'
      ? 'اضغط مطولًا على الآية المنوّرة نفسها عشان تفتح خياراتها.'
      : s.mode==='real-open'
      ? 'اضغط على الزر المنوّر في التطبيق عشان تفتحه بنفسك.'
      : s.mode==='pick-quran-reciter'
      ? 'اختار القارئ من القائمة بنفسك. الشرح مش هيشغّل الصوت.'
      : '';
    if(quranGuide){
      const progress=TOURS.quran.map((_,i)=>
        '<span class="'+(i<count?'is-reached ':'')+(i===active.step?'is-active':'')+'"></span>'
      ).join('');
      const interactive=s.mode==='real-verse'||s.mode==='real-open'||s.mode==='pick-quran-reciter';
      card.innerHTML=
        '<div class="ayat-tour-home-top">'+
          '<span class="ayat-tour-home-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5C9.2 3.6 6.5 3.7 3.5 4.8v14.1c3-1.1 5.7-1 8.5.6 2.8-1.6 5.5-1.7 8.5-.6V4.8c-3-1.1-5.7-1.2-8.5.2Z"/><path d="M12 5v14.5"/></svg></span>'+
          '<span class="ayat-tour-home-heading"><strong>دليل آيات</strong><small>'+html(s.group||'المصحف')+'</small></span>'+
          '<span class="ayat-tour-count">'+String(count).padStart(2,'0')+' <span aria-hidden="true">/</span> '+String(total).padStart(2,'0')+'</span>'+
        '</div>'+
        '<div class="ayat-tour-home-progress" aria-hidden="true">'+progress+'</div>'+
        '<h2 class="ayat-tour-title">'+html(s.title)+'</h2>'+
        '<p class="ayat-tour-body">'+html(s.body)+'</p>'+
        (instruction?'<div class="ayat-tour-quran-hint"><span aria-hidden="true">◎</span>'+html(instruction)+'</div>':'')+
        '<div class="ayat-tour-home-foot">'+
          (count===1?'':'<button type="button" class="ayat-tour-secondary" data-tour-action="previous">السابق</button>')+
          (!interactive?'<button type="button" class="ayat-tour-main" data-tour-action="quran-next">'+(count===total?'إنهاء الشرح':'التالي')+' <span aria-hidden="true">←</span></button>':'')+
          (interactive?'<button type="button" class="ayat-tour-secondary" data-tour-action="assist">تخطي الخطوة</button>':'')+
          '<button type="button" class="ayat-tour-text" data-tour-action="pause">خروج</button>'+
        '</div>';
    }else{
      const action=s.mode==='tap'
        ? '<p class="ayat-tour-mission">المس الجزء المضيء لاكتشافه</p>'
        : s.mode==='quiz'
        ? '<div class="ayat-tour-question">'+html(s.question)+'</div><div class="ayat-tour-quiz">'+s.choices.map((choice,i)=>'<button type="button" data-tour-answer="'+i+'">'+html(choice)+'</button>').join('')+'</div>'
        : '';
      card.innerHTML='<div class="ayat-tour-top"><span>دليل '+NAMES[kind]+'</span><span class="ayat-tour-count">'+count+' / '+total+'</span></div>' +
        '<div class="ayat-tour-progress"><span style="width:'+(count/total*100)+'%"></span></div>'+
        '<h2 class="ayat-tour-title">'+html(s.title)+'</h2><p class="ayat-tour-body">'+html(s.body)+'</p>'+
        action+'<p class="ayat-tour-feedback" aria-live="polite"></p>'+
        '<div class="ayat-tour-foot"><button class="ayat-tour-secondary" type="button" data-tour-action="previous" '+(count===1?'hidden':'')+'>السابق</button>'+
        (s.mode==='note'?'<button class="ayat-tour-main" type="button" data-tour-action="quran-next">'+(count===total?'إنهاء الشرح':'التالي ←')+'</button>':'')+
        '<button class="ayat-tour-text" type="button" data-tour-action="assist">تخطي الخطوة</button>'+
        '<button class="ayat-tour-text" type="button" data-tour-action="pause">خروج</button></div>';
    }
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
    if(kind==='home'||kind==='recitations'||kind==='adhkar'||kind==='library'){
      if(kind==='adhkar'&&['real-swipe','open-chapter'].includes(TOURS[kind][active.step]?.mode))return;
      const next=active.step+1;
      if(next>=TOURS[kind].length){finish();return;}
      active.step=next;save(STEP(kind),next);render();
      return;
    }
    if(kind==='quran'){
      const next=active.step+1;
      if(next>=TOURS[kind].length){finish();return;}
      active.step=next;save(STEP(kind),next);render();
      return;
    }
    const next=active.step+1;
    if(next>=TOURS[kind].length){finish();return;}
    active.step=next;
    save(STEP(kind),next);
    render();
  }
  hit.addEventListener('click',()=>{
    if(!active||busy)return;
    const s=TOURS[kind][active.step];
    if(kind==='home'&&s.mode==='verse'){openHomeVerse();return;}
    if(s.mode==='open-chapter'&&kind==='adhkar'){
      const target=targetFor(s);
      if(target)target.click();
      return;
    }
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
    else if(action==='home-next'&&(kind==='home'||kind==='recitations'||kind==='adhkar'||kind==='library'))advance();
    else if(action==='quran-next'&&kind==='quran')advance();
    else if(action==='adhkar-reveal'&&kind==='adhkar'){
      document.getElementById('library')?.scrollIntoView({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
      setTimeout(()=>{if(active&&kind==='adhkar'&&TOURS[kind][active.step]?.mode==='reveal')advance();},500);
    }
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
    else if(action==='assist'){
      const step=active&&TOURS[kind][active.step];
      if(kind==='adhkar'&&step?.mode==='open-chapter'){
        // Skipping the gesture must open the *real* reader. The existing
        // ayat:dhikr-opened event advances only after it actually appears.
        document.querySelector('.quick-card.morning')?.click();
      }else if(kind==='adhkar'&&step?.mode==='real-swipe'){
        // Skipping the gesture ends the tour without changing the dhikr.
        finish();
      }else advance();
    }
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
    if(active&&((kind==='recitations'&&TOURS[kind][active.step]?.mode==='pick-reciter')||(kind==='adhkar'&&TOURS[kind][active.step]?.mode==='real-swipe')))return;
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
  window.addEventListener('mushaf:verse-selected',event=>{
    if(kind!=='quran'||!active||busy||TOURS.quran[active.step]?.mode!=='real-verse')return;
    if(tourVerseKey&&event.detail?.verseKey!==tourVerseKey)return;
    setTimeout(()=>{
      if(active&&TOURS.quran[active.step]?.mode==='real-verse'&&document.getElementById('verse-actions-sheet')?.classList.contains('is-open'))advance();
    },120);
  });
  document.addEventListener('click',event=>{
    if(kind!=='quran'||!active||busy)return;
    const step=TOURS.quran[active.step];
    if(step?.mode!=='real-open'||!event.target.closest(step.selector))return;
    let attempts=0;
    const waitForPanel=()=>{
      if(!active||TOURS.quran[active.step]!==step)return;
      const panel=document.querySelector(step.opens);
      if(panel&&(panel.classList.contains('is-open')||panel.getAttribute('aria-hidden')==='false')){advance();return;}
      if(++attempts<20)setTimeout(waitForPanel,50);
    };
    setTimeout(waitForPanel,0);
  },true);
  // Changing a reader is optional during the Quran guide. The user advances
  // explicitly with Next, and a reader change never jumps tutorial steps.
  document.addEventListener('ayat:reciter-chosen',()=>{
    if(kind==='recitations'&&active&&TOURS[kind][active.step]?.mode==='pick-reciter'){
      setTimeout(()=>{if(active&&TOURS[kind][active.step]?.mode==='pick-reciter')advance();},380);
    }
  });
  document.addEventListener('ayat:dhikr-opened',event=>{
    if(kind!=='adhkar'||!active||TOURS.adhkar[active.step]?.mode!=='open-chapter')return;
    // Never advance until the real morning reader has opened. This avoids
    // explaining missing controls if the user tapped Next before loading.
    const reader=document.getElementById('reader');
    // Hisn Al-Muslim stores vocalized chapter titles, e.g. "أَذْكَارُ الصَّبَاحِ".
    // Compare the normalized real title instead of an unvocalized substring.
    const title=String(event.detail?.chapterTitle||'')
      .normalize('NFKD')
      .replace(/[\u064B-\u065F\u0670\u0640]/g,'')
      .replace(/[إأآٱ]/g,'ا')
      .replace(/\s+/g,' ')
      .trim();
    if(!reader||reader.hidden||!title.includes('اذكار الصباح'))return;
    active.step++;
    save(STEP(kind),active.step);
    render();
  });
  document.addEventListener('ayat:dhikr-swiped',event=>{
    if(kind!=='adhkar'||!active||TOURS.adhkar[active.step]?.mode!=='real-swipe'||event.detail?.direction!=='next')return;
    // Keep the newly opened dhikr on screen after the genuine reader transition.
    setTimeout(()=>{if(active&&TOURS.adhkar[active.step]?.mode==='real-swipe')finish();},410);
  });
  async function initialize(){
    if(initialized)return;
    initialized=true;
    const params=new URLSearchParams(location.search);
    let pending=null;
    try{pending=JSON.parse(storageRead(REQUEST)||'null');}catch(_){pending=null;}
    if(!pending||!TOURS[pending.kind]||!pending.token||Date.now()-Number(pending.at)>10*60*1000)pending=null;
    const queryKind=params.get('ayatHelp');
    const queryToken=params.get('ayatRequest');
    const requested=TOURS[queryKind]&&(!queryToken||!pending||pending.token===queryToken)?queryKind:(pending?.kind===kind?pending.kind:null);
    if(requested===kind){
      await start(true);
      remove(REQUEST);
      try{
        const url=new URL(location.href);url.searchParams.delete('ayatHelp');url.searchParams.delete('ayatRequest');
        history.replaceState(history.state,'',url.pathname+url.search+url.hash);
      }catch(_){}
      return;
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
