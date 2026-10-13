(() => {
  'use strict';

  const API_URL = 'https://mp3quran.net/api/v3/reciters?language=ar';
  const CATALOG_KEY = 'quranRecitationCatalogV1';
  const PLAYER_KEY = 'quranRecitationPlayerV1';
  const $ = id => document.getElementById(id);
  const audio = $('recitation-audio');
  const list = $('reciter-list');
  const search = $('reciter-search');
  const completeOnly = $('complete-only');
  const moshafSelect = $('moshaf-select');
  const surahSelect = $('surah-select');
  const playButton = $('play-pause');
  const playIcon = $('play-icon');
  const playLabel = $('play-label');
  const previous = $('previous');
  const next = $('next');
  const seek = $('seek');
  const speed = $('speed');
  const repeat = $('repeat');
  const status = $('player-status');
  const catalogStatus = $('catalog-status');
  const count = $('reader-count');
  const title = $('player-title');
  const subtitle = $('player-subtitle');
  const duration = $('duration');
  const currentTime = $('current-time');
  const connectionLabel = $('connection-label');
  const reload = $('reload-catalog');

  const SURAH_NAMES = [
    'الفاتحة','البقرة','آل عمران','النساء','المائدة','الأنعام','الأعراف','الأنفال','التوبة','يونس',
    'هود','يوسف','الرعد','إبراهيم','الحجر','النحل','الإسراء','الكهف','مريم','طه',
    'الأنبياء','الحج','المؤمنون','النور','الفرقان','الشعراء','النمل','القصص','العنكبوت','الروم',
    'لقمان','السجدة','الأحزاب','سبأ','فاطر','يس','الصافات','ص','الزمر','غافر',
    'فصلت','الشورى','الزخرف','الدخان','الجاثية','الأحقاف','محمد','الفتح','الحجرات','ق',
    'الذاريات','الطور','النجم','القمر','الرحمن','الواقعة','الحديد','المجادلة','الحشر','الممتحنة',
    'الصف','الجمعة','المنافقون','التغابن','الطلاق','التحريم','الملك','القلم','الحاقة','المعارج',
    'نوح','الجن','المزمل','المدثر','القيامة','الإنسان','المرسلات','النبأ','النازعات','عبس',
    'التكوير','الانفطار','المطففين','الانشقاق','البروج','الطارق','الأعلى','الغاشية','الفجر',
    'البلد','الشمس','الليل','الضحى','الشرح','التين','العلق','القدر','البينة','الزلزلة',
    'العاديات','القارعة','التكاثر','العصر','الهمزة','الفيل','قريش','الماعون','الكوثر','الكافرون',
    'النصر','المسد','الإخلاص','الفلق','الناس'
  ];
  const DIGITS = '٠١٢٣٤٥٦٧٨٩';
  const arabic = value => String(value).replace(/\d/g, digit => DIGITS[Number(digit)]);
  const timeText = seconds => {
    if (!Number.isFinite(seconds) || seconds < 0) return '٠:٠٠';
    const s = Math.floor(seconds);
    return arabic(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
  };

  function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { return null; }
  }
  function store(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* private browsing */ }
  }

  // The API owns the server URLs. Never use arbitrary catalog values as audio sources.
  function validServer(server) {
    try {
      const url = new URL(server);
      return url.protocol === 'https:' &&
        (url.hostname === 'mp3quran.net' || url.hostname.endsWith('.mp3quran.net')) &&
        !url.username && !url.password;
    } catch (_) { return false; }
  }
  function normalizeCatalog(raw) {
    if (!raw || !Array.isArray(raw.reciters)) throw new Error('Invalid reciter catalog');
    const seen = new Set();
    return raw.reciters.map(item => {
      const id = Number(item.id);
      const name = typeof item.name === 'string' ? item.name.trim() : '';
      if (!Number.isInteger(id) || id <= 0 || !name || seen.has(id)) return null;
      seen.add(id);
      const moshaf = (Array.isArray(item.moshaf) ? item.moshaf : []).map(m => {
        const server = typeof m.server === 'string' ? m.server.trim() : '';
        if (!validServer(server)) return null;
        const id = Number(m.id);
        if (!Number.isInteger(id) || id <= 0) return null;
        const surahs = [...new Set(String(m.surah_list || '').split(',')
          .map(n => Number(n.trim()))
          .filter(n => Number.isInteger(n) && n >= 1 && n <= 114))].sort((a,b) => a-b);
        if (!surahs.length) return null;
        return { id, name: String(m.name || 'التلاوة').trim(), server, surahs };
      }).filter(Boolean);
      return moshaf.length ? { id, name, moshaf } : null;
    }).filter(Boolean).sort((a,b) => a.name.localeCompare(b.name, 'ar'));
  }

  let catalog = [];
  let chosen = null;
  let chosenMoshaf = null;
  let chosenSurah = 1;
  let trackUrl = '';
  let pendingResume = 0;
  let lastSavedAt = 0;
  const lastState = readJson(PLAYER_KEY) || {};
  if ([0.75, 1, 1.25, 1.5, 2].includes(Number(lastState.speed))) {
    speed.value = String(lastState.speed);
  }
  audio.playbackRate = Number(speed.value);
  repeat.checked = !!lastState.repeat;

  function setStatus(message) { status.textContent = message; }
  function setPlaying(isPlaying) {
    playButton.setAttribute('aria-label', isPlaying ? 'إيقاف مؤقت' : 'تشغيل');
    playLabel.textContent = isPlaying ? 'إيقاف مؤقت' : 'تشغيل';
    playIcon.innerHTML = isPlaying
      ? '<path d="M7 5h4v14H7zm6 0h4v14h-4z"/>'
      : '<path d="m8 5 12 7-12 7V5Z"/>';
  }
  function saveState() {
    if (!chosen || !chosenMoshaf) return;
    store(PLAYER_KEY, {
      reciter: chosen.id, moshaf: chosenMoshaf.id, surah: chosenSurah,
      position: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
      speed: Number(speed.value), repeat: repeat.checked
    });
  }

  function bestMoshaf(reciter) {
    return [...reciter.moshaf].sort((a,b) => {
      const score = m => m.surahs.length * 10 +
        (/حفص/.test(m.name) ? 2 : 0) + (/مرتل|مرتّل/.test(m.name) ? 1 : 0);
      return score(b) - score(a);
    })[0];
  }

  function chooseReciter(reciter, moshafId = null, surah = null, restorePosition = 0) {
    if (!reciter) return;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    trackUrl = '';
    pendingResume = Math.max(0, Number(restorePosition) || 0);
    chosen = reciter;
    chosenMoshaf = reciter.moshaf.find(m => m.id === Number(moshafId)) || bestMoshaf(reciter);
    chosenSurah = chosenMoshaf.surahs.includes(Number(surah)) ? Number(surah) : chosenMoshaf.surahs[0];
    moshafSelect.replaceChildren();
    reciter.moshaf.forEach(m => {
      const option = new Option(`${m.name} (${arabic(m.surahs.length)} سورة)`, String(m.id));
      moshafSelect.add(option);
    });
    moshafSelect.value = String(chosenMoshaf.id);
    fillSurahs();
    updateDisplay();
    renderList();
    saveState();
  }

  function fillSurahs() {
    surahSelect.replaceChildren();
    chosenMoshaf.surahs.forEach(n => {
      surahSelect.add(new Option(`${arabic(n)}. سورة ${SURAH_NAMES[n-1]}`, String(n)));
    });
    surahSelect.value = String(chosenSurah);
  }

  function updateDisplay() {
    title.textContent = `سورة ${SURAH_NAMES[chosenSurah-1]}`;
    subtitle.textContent = `${chosen.name} • ${chosenMoshaf.name}`;
    duration.textContent = '٠:٠٠';
    currentTime.textContent = '٠:٠٠';
    seek.value = '0';
    seek.disabled = true;
    playButton.disabled = false;
    setPlaying(false);
    setStatus('جاهز للتشغيل. اضغط تشغيل للاستماع.');
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: `سورة ${SURAH_NAMES[chosenSurah-1]}`,
          artist: chosen.name, album: 'القرآن الكريم'
        });
      } catch (_) { /* MediaSession is optional */ }
    }
  }

  function urlForTrack() {
    if (!chosenMoshaf || !chosenMoshaf.surahs.includes(chosenSurah)) return null;
    const base = chosenMoshaf.server.endsWith('/') ? chosenMoshaf.server : chosenMoshaf.server + '/';
    return base + String(chosenSurah).padStart(3,'0') + '.mp3';
  }

  function prepareTrack() {
    const url = urlForTrack();
    if (!url) return false;
    if (url !== trackUrl) {
      trackUrl = url;
      audio.src = url;
      audio.load();
    }
    return true;
  }

  async function play() {
    if (!chosen || !prepareTrack()) return;
    try {
      setStatus('جاري الاتصال بالتلاوة…');
      await audio.play();
      setStatus('يتم تشغيل التلاوة');
    } catch (error) {
      if (error?.name !== 'AbortError') {
        console.error('Recitation playback failed', error);
        setStatus('تعذّر تشغيل الصوت. تحقق من اتصال الإنترنت أو جرّب قارئًا آخر.');
      }
    }
  }

  function switchSurah(surah, autoplay = false) {
    if (!chosenMoshaf?.surahs.includes(surah)) return;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    trackUrl = '';
    pendingResume = 0;
    chosenSurah = surah;
    surahSelect.value = String(surah);
    updateDisplay();
    saveState();
    if (autoplay) play();
  }

  function adjacent(direction) {
    if (!chosenMoshaf) return;
    const surahs = chosenMoshaf.surahs;
    const i = surahs.indexOf(chosenSurah);
    const nextIndex = i + direction;
    if (nextIndex < 0 || nextIndex >= surahs.length) {
      setStatus('وصلت إلى آخر السور المتاحة لهذا القارئ.');
      return;
    }
    switchSurah(surahs[nextIndex], !audio.paused);
  }

  function renderList() {
    const query = search.value.trim().normalize('NFKC').replace(/[أإآ]/g, 'ا');
    const visible = catalog.filter(reciter =>
      (!completeOnly.checked || reciter.moshaf.some(m => m.surahs.length === 114)) &&
      (!query || reciter.name.normalize('NFKC').replace(/[أإآ]/g, 'ا').includes(query))
    );
    const fragment = document.createDocumentFragment();
    visible.forEach(reciter => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'reciter-card' + (chosen?.id === reciter.id ? ' is-selected' : '');
      button.setAttribute('aria-pressed', String(chosen?.id === reciter.id));
      const name = document.createElement('strong');
      name.textContent = reciter.name;
      const detail = document.createElement('small');
      const most = bestMoshaf(reciter);
      detail.textContent = `${arabic(reciter.moshaf.length)} تسجيل • ${arabic(most.surahs.length)} سورة في أكبر تسجيل`;
      button.append(name, detail);
      button.addEventListener('click', () => {
        chooseReciter(reciter);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      fragment.appendChild(button);
    });
    list.replaceChildren(fragment);
    catalogStatus.textContent = visible.length
      ? `يظهر ${arabic(visible.length)} قارئًا. اضغط على اسم القارئ لاختياره.`
      : 'لا توجد نتائج مطابقة. جرّب اسمًا آخر أو ألغِ فلتر المصاحف الكاملة.';
  }

  function applyCatalog(data, fromCache) {
    const normalized = normalizeCatalog(data);
    if (!normalized.length) throw new Error('Empty reciter catalog');
    catalog = normalized;
    count.textContent = `${arabic(catalog.length)} قارئًا متاحًا`;
    const preferred = catalog.find(r => r.id === Number(lastState.reciter)) ||
      catalog.find(r => /العفاسي/.test(r.name)) ||
      catalog.find(r => /المعيقلي/.test(r.name)) || catalog[0];
    chooseReciter(preferred, lastState.reciter === preferred.id ? lastState.moshaf : null,
      lastState.reciter === preferred.id ? lastState.surah : null,
      lastState.reciter === preferred.id ? lastState.position : 0);
    catalogStatus.textContent = fromCache ? 'تم عرض آخر قائمة محفوظة، جاري تحديثها…' : '';
  }

  async function loadCatalog() {
    reload.disabled = true;
    connectionLabel.textContent = 'جاري تحديث المكتبة…';
    try {
      const response = await fetch(API_URL, { cache: 'no-cache' });
      if (!response.ok) throw new Error('API HTTP ' + response.status);
      const data = await response.json();
      const normalized = normalizeCatalog(data);
      if (!normalized.length) throw new Error('No available reciters');
      const preserve = chosen ? {
        reciter: chosen.id, moshaf: chosenMoshaf?.id,
        surah: chosenSurah, position: audio.currentTime
      } : lastState;
      catalog = normalized;
      store(CATALOG_KEY, data);
      count.textContent = `${arabic(catalog.length)} قارئًا متاحًا`;
      // Do not interrupt playback when refreshing the catalog.
      if (!chosen) {
        const preferred = catalog.find(r => r.id === Number(preserve.reciter)) ||
          catalog.find(r => /العفاسي/.test(r.name)) ||
          catalog.find(r => /المعيقلي/.test(r.name)) || catalog[0];
        chooseReciter(preferred, preserve.moshaf, preserve.surah, preserve.position);
      } else {
        renderList();
      }
      connectionLabel.textContent = 'التشغيل عبر الإنترنت';
      catalogStatus.textContent = `تم تحديث القائمة من MP3Quran. ${arabic(catalog.length)} قارئًا متاحًا.`;
    } catch (error) {
      console.error('Reciter catalog request failed:', error);
      connectionLabel.textContent = 'تعذّر تحديث القائمة';
      catalogStatus.textContent = catalog.length
        ? 'تعذّر التحديث. يمكنك تصفح القائمة المحفوظة، لكن التشغيل يحتاج اتصالًا بالإنترنت.'
        : 'تعذّر جلب القرّاء. تأكد من الإنترنت ثم اضغط تحديث القائمة.';
      if (!catalog.length) count.textContent = 'المكتبة غير متاحة حاليًا';
    } finally {
      reload.disabled = false;
    }
  }

  playButton.addEventListener('click', () => {
    if (!chosen) return;
    if (audio.paused) play();
    else audio.pause();
  });
  previous.addEventListener('click', () => adjacent(-1));
  next.addEventListener('click', () => adjacent(1));
  moshafSelect.addEventListener('change', () => {
    if (!chosen) return;
    chooseReciter(chosen, Number(moshafSelect.value), chosenSurah);
  });
  surahSelect.addEventListener('change', () => switchSurah(Number(surahSelect.value), !audio.paused));
  search.addEventListener('input', renderList);
  completeOnly.addEventListener('change', renderList);
  reload.addEventListener('click', loadCatalog);
  speed.addEventListener('change', () => {
    audio.playbackRate = Number(speed.value);
    saveState();
  });
  repeat.addEventListener('change', saveState);
  seek.addEventListener('input', () => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      currentTime.textContent = timeText(Number(seek.value) / 1000 * audio.duration);
    }
  });
  seek.addEventListener('change', () => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      audio.currentTime = Number(seek.value) / 1000 * audio.duration;
      saveState();
    }
  });

  audio.addEventListener('loadedmetadata', () => {
    duration.textContent = timeText(audio.duration);
    seek.disabled = !Number.isFinite(audio.duration);
    if (pendingResume > 0 && Number.isFinite(audio.duration)) {
      audio.currentTime = Math.min(pendingResume, Math.max(0, audio.duration - 2));
      pendingResume = 0;
    }
  });
  audio.addEventListener('timeupdate', () => {
    currentTime.textContent = timeText(audio.currentTime);
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      seek.value = String(Math.round(audio.currentTime / audio.duration * 1000));
    }
    const now = Date.now();
    if (now - lastSavedAt > 4000) { lastSavedAt = now; saveState(); }
  });
  audio.addEventListener('play', () => setPlaying(true));
  audio.addEventListener('pause', () => { setPlaying(false); saveState(); });
  audio.addEventListener('waiting', () => setStatus('جاري تحميل الصوت…'));
  audio.addEventListener('playing', () => setStatus('يتم تشغيل التلاوة'));
  audio.addEventListener('error', () => {
    setPlaying(false);
    setStatus('تعذّر تحميل التسجيل. جرّب سورة أو قارئًا آخر، وتأكد من الإنترنت.');
  });
  audio.addEventListener('ended', () => {
    if (repeat.checked) { audio.currentTime = 0; play(); }
    else {
      const index = chosenMoshaf?.surahs.indexOf(chosenSurah) ?? -1;
      if (index >= 0 && index < chosenMoshaf.surahs.length - 1) {
        switchSurah(chosenMoshaf.surahs[index+1], true);
      } else setStatus('انتهت التلاوة. بارك الله فيك.');
    }
  });
  window.addEventListener('pagehide', saveState);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveState(); });

  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.setActionHandler('play', play);
      navigator.mediaSession.setActionHandler('pause', () => audio.pause());
      navigator.mediaSession.setActionHandler('previoustrack', () => adjacent(-1));
      navigator.mediaSession.setActionHandler('nexttrack', () => adjacent(1));
      navigator.mediaSession.setActionHandler('seekto', details => {
        if (Number.isFinite(details.seekTime)) audio.currentTime = details.seekTime;
      });
    } catch (_) { /* Some browsers expose only part of MediaSession. */ }
  }

  // A saved catalog works for browsing if the API is temporarily unavailable.
  const cached = readJson(CATALOG_KEY);
  if (cached) {
    try { applyCatalog(cached, true); } catch (_) { /* stale catalog */ }
  }
  loadCatalog();
})();
