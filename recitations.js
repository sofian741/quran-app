(() => {
  'use strict';
  const core = window.QuranAudio;
  const downloadsApi = window.QuranDownloads;
  const $ = id => document.getElementById(id);
  if (!core || !downloadsApi) return;

  const ui = {
    audio: $('recitation-audio'), list: $('reciter-list'), search: $('reciter-search'),
    completeOnly: $('complete-only'), moshaf: $('moshaf-select'), surah: $('surah-select'),
    play: $('play-pause'), playIcon: $('play-icon'), playLabel: $('play-label'),
    previous: $('previous'), next: $('next'), seek: $('seek'), speed: $('speed'), repeat: $('repeat'),
    status: $('player-status'), catalogStatus: $('catalog-status'), count: $('reader-count'),
    title: $('player-title'), subtitle: $('player-subtitle'), duration: $('duration'),
    current: $('current-time'), connection: $('connection-label'), reload: $('reload-catalog'),
    download: $('download-current')
  };
  if (Object.values(ui).some(value => !value)) return;

  const engine = new core.AudioEngine(ui.audio);
  const catalogService = new core.CatalogService();
  const downloads = new downloadsApi.DownloadManager();
  let catalog = [];
  let selectedReciter = null;
  let selectedMoshaf = null;
  let applying = false;
  window.quranAudioEngine = engine;

  function option(select, value, label) {
    const item = document.createElement('option');
    item.value = String(value); item.textContent = label; select.appendChild(item);
  }

  function fillMoshaf(reciter, preferredId) {
    selectedReciter = reciter;
    ui.moshaf.replaceChildren();
    reciter.moshaf.forEach(moshaf => option(ui.moshaf, moshaf.id,
      `${moshaf.name} (${core.arabicDigits(moshaf.surahs.length)} سورة${moshaf.complete ? ' • كامل' : ' • مختارات'})`));
    selectedMoshaf = reciter.moshaf.find(item => item.id === Number(preferredId)) || core.bestMoshaf(reciter);
    ui.moshaf.value = String(selectedMoshaf.id);
    fillSurahs(selectedMoshaf, engine.state.surah);
  }

  function fillSurahs(moshaf, selected) {
    ui.surah.replaceChildren();
    moshaf.surahs.forEach(number => option(ui.surah, number,
      `${core.arabicDigits(number)}. سورة ${core.SURAH_NAMES[number - 1]}`));
    ui.surah.value = String(moshaf.surahs.includes(Number(selected)) ? selected : moshaf.surahs[0]);
  }

  async function chooseReciter(reciter, preferredMoshaf, autoplay = false, position = 0) {
    if (!reciter) return;
    fillMoshaf(reciter, preferredMoshaf);
    await engine.selectMp3(reciter, selectedMoshaf, {
      surah: Number(ui.surah.value), autoplay, position
    });
    renderCatalog();
  }

  function renderCatalog() {
    const query = core.normalizeArabic(ui.search.value);
    const visible = catalog.filter(reciter =>
      (!ui.completeOnly.checked || reciter.moshaf.some(item => item.complete)) &&
      (!query || core.normalizeArabic(reciter.name).includes(query))
    );
    const fragment = document.createDocumentFragment();
    visible.forEach(reciter => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `reciter-card${selectedReciter?.id === reciter.id ? ' is-selected' : ''}`;
      button.setAttribute('aria-pressed', String(selectedReciter?.id === reciter.id));
      const name = document.createElement('strong'); name.textContent = reciter.name;
      const detail = document.createElement('small');
      const complete = reciter.moshaf.filter(item => item.complete).length;
      detail.textContent = complete
        ? `${core.arabicDigits(reciter.moshaf.length)} تسجيل • ${core.arabicDigits(complete)} مصحف كامل`
        : `${core.arabicDigits(reciter.moshaf.length)} تسجيل • تلاوات مختارة`;
      button.append(name, detail);
      button.addEventListener('click', async () => {
        await chooseReciter(reciter);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      fragment.appendChild(button);
    });
    ui.list.replaceChildren(fragment);
    ui.catalogStatus.textContent = visible.length
      ? `يظهر ${core.arabicDigits(visible.length)} قارئًا، مرتبين بالأكثر طلبًا ثم أبجديًا.`
      : 'لا توجد نتائج مطابقة. جرّب اسمًا آخر أو ألغِ فلتر المصاحف الكاملة.';
  }

  function setPlay(playing) {
    ui.play.setAttribute('aria-label', playing ? 'إيقاف مؤقت' : 'تشغيل');
    ui.playLabel.textContent = playing ? 'إيقاف مؤقت' : 'تشغيل';
    ui.playIcon.innerHTML = playing
      ? '<path d="M7 5h4v14H7zm6 0h4v14h-4z"/>'
      : '<path d="m8 5 12 7-12 7V5Z"/>';
  }

  function stateStatus(state) {
    if (state.error) return state.error;
    if (state.loading) return 'جاري تحميل التسجيل…';
    if (state.playing) return 'يتم تشغيل التلاوة';
    if (state.status === 'paused') return 'متوقف مؤقتًا';
    return navigator.onLine === false ? 'أنت غير متصل. التسجيلات المحفوظة فقط متاحة.' : 'جاهز للتشغيل.';
  }

  function applyState(state, full = true) {
    applying = true;
    ui.title.textContent = `سورة ${core.SURAH_NAMES[state.surah - 1]}`;
    ui.subtitle.textContent = `${state.reciterName} • ${state.moshafName}`;
    ui.current.textContent = core.timeText(state.currentTime);
    ui.duration.textContent = core.timeText(state.duration);
    ui.seek.disabled = state.duration <= 0;
    ui.seek.value = state.duration > 0 ? String(Math.round(state.currentTime / state.duration * 1000)) : '0';
    ui.status.textContent = stateStatus(state);
    ui.play.disabled = false;
    setPlay(state.playing);
    if (full) {
      ui.speed.value = String(state.speed);
      ui.repeat.checked = state.repeat.mode === 'surah';
      if (state.provider === 'mp3quran' && selectedMoshaf?.surahs.includes(state.surah)) ui.surah.value = String(state.surah);
    }
    applying = false;
  }

  const starterPlayer = $('offline-starter-player');
  starterPlayer?.addEventListener('play', () => engine.pause());
  engine.addEventListener('state', event => {
    if (event.detail.playing && starterPlayer && !starterPlayer.paused) starterPlayer.pause();
    applyState(event.detail, true);
  });
  engine.addEventListener('time', event => applyState(event.detail, false));
  ui.play.addEventListener('click', () => engine.toggle());
  ui.previous.addEventListener('click', () => engine.previous());
  ui.next.addEventListener('click', () => engine.next());
  ui.moshaf.addEventListener('change', async () => {
    if (applying || !selectedReciter) return;
    selectedMoshaf = selectedReciter.moshaf.find(item => item.id === Number(ui.moshaf.value));
    fillSurahs(selectedMoshaf, engine.state.surah);
    await engine.selectMp3(selectedReciter, selectedMoshaf, { surah: Number(ui.surah.value) });
  });
  ui.surah.addEventListener('change', () => { if (!applying) engine.goTo(Number(ui.surah.value), 1); });
  ui.speed.addEventListener('change', () => engine.setSpeed(ui.speed.value));
  ui.repeat.addEventListener('change', () => engine.setRepeat({
    mode: ui.repeat.checked ? 'surah' : 'off', start: 1, end: 1, count: 1, completed: 0
  }));
  ui.seek.addEventListener('input', () => {
    const state = engine.snapshot();
    if (state.duration > 0) ui.current.textContent = core.timeText(Number(ui.seek.value) / 1000 * state.duration);
  });
  ui.seek.addEventListener('change', () => {
    const state = engine.snapshot();
    if (state.duration > 0) engine.seek(Number(ui.seek.value) / 1000 * state.duration);
  });
  ui.search.addEventListener('input', renderCatalog);
  ui.completeOnly.addEventListener('change', renderCatalog);
  ui.reload.addEventListener('click', loadCatalog);

  ui.download.addEventListener('click', async () => {
    const state = engine.snapshot();
    const url = core.mp3Url({ server: state.server, surahs: state.availableSurahs }, state.surah);
    if (!url || state.provider !== 'mp3quran') {
      ui.status.textContent = 'اختر تسجيلًا من مكتبة MP3Quran لتنزيل السورة كاملة.';
      return;
    }
    ui.download.disabled = true;
    ui.status.textContent = 'جاري تنزيل السورة. لا تغلق الصفحة…';
    try {
      await downloads.downloadTrack({
        url, provider: state.provider, reciterId: state.reciterId, reciterName: state.reciterName,
        surah: state.surah, surahName: core.SURAH_NAMES[state.surah - 1]
      });
      ui.status.textContent = 'اكتمل تنزيل السورة للاستماع دون إنترنت.';
    } catch (error) { ui.status.textContent = error.message; }
    finally { ui.download.disabled = false; }
  });

  async function loadCatalog() {
    ui.reload.disabled = true;
    ui.connection.textContent = 'جاري تحديث المكتبة…';
    const cached = catalogService.cached();
    if (cached.length && !catalog.length) { catalog = cached; renderCatalog(); }
    try {
      catalog = await catalogService.load();
      ui.count.textContent = `${core.arabicDigits(catalog.length)} قارئًا متاحًا`;
      const saved = engine.state;
      const preferred = catalog.find(item => saved.provider === 'mp3quran' && item.id === Number(saved.reciterId)) || catalogService.preferred(catalog);
      if (saved.provider === 'mp3quran') {
        await chooseReciter(preferred, saved.moshafId, false, saved.position);
      } else {
        fillMoshaf(preferred);
        selectedReciter = null;
        renderCatalog();
        applyState(engine.snapshot(), true);
      }
      ui.connection.textContent = 'التشغيل عبر الإنترنت والتنزيل الاختياري';
      ui.catalogStatus.textContent = `تم تحديث القائمة من MP3Quran: ${core.arabicDigits(catalog.length)} قارئًا.`;
    } catch (_) {
      if (catalog.length) {
        ui.count.textContent = `${core.arabicDigits(catalog.length)} قارئًا في القائمة المحفوظة`;
        const preferred = catalog.find(item => engine.state.provider === 'mp3quran' &&
          item.id === Number(engine.state.reciterId)) || catalogService.preferred(catalog);
        if (engine.state.provider === 'mp3quran') {
          await chooseReciter(preferred, engine.state.moshafId, false, engine.state.position);
        } else {
          fillMoshaf(preferred);
          selectedReciter = null;
          renderCatalog();
          applyState(engine.snapshot(), true);
        }
        ui.catalogStatus.textContent = 'تعذّر التحديث؛ تُعرض آخر قائمة محفوظة.';
      } else {
        ui.count.textContent = 'المكتبة غير متاحة حاليًا';
        ui.catalogStatus.textContent = 'تعذّر جلب القرّاء. تحقق من الإنترنت ثم اضغط تحديث القائمة.';
      }
      ui.connection.textContent = 'تعذّر تحديث القائمة';
    } finally { ui.reload.disabled = false; }
  }

  window.addEventListener('online', () => { ui.connection.textContent = 'عاد الاتصال بالإنترنت'; });
  window.addEventListener('offline', () => { ui.connection.textContent = 'وضع عدم الاتصال'; });
  window.addEventListener('pagehide', () => engine.destroy());
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(() => {});
  applyState(engine.snapshot(), true);
  loadCatalog();
})();
