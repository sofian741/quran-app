(() => {
  'use strict';

  const core = window.QuranAudio;
  const api = window.QuranDownloads;
  const qud = window.QuranQud;
  const root = document.getElementById('synced-downloads');
  if (!root || !core || !api || !qud?.loadChapter) return;

  // Only the *exact* MP3Quran recordings that have matching QUD word timings
  // are eligible for permanent downloads. Do not silently substitute another
  // recording of the same sheikh: its timestamps may not match.
  const eligible = qud.reciters.filter(reader => reader.channel === 'mp3quran');
  const unavailable = qud.reciters.filter(reader => reader.channel !== 'mp3quran');
  const $ = id => document.getElementById(id);
  const ui = {
    list: $('synced-reader-list'), reader: $('synced-selected-reader'),
    surah: $('synced-surah'), one: $('synced-download-one'),
    all: $('synced-download-all'), cancel: $('synced-cancel-download'),
    status: $('synced-download-status'), progress: $('synced-progress'),
    progressWrap: $('synced-progress-wrap'), unavailable: $('synced-unavailable-list')
  };
  if (Object.values(ui).some(value => !value)) return;

  const downloads = new api.DownloadManager();
  const lock = window.AyatDownloadLock || (window.AyatDownloadLock = {
    owner: null,
    acquire(owner) {
      if (this.owner) return false;
      this.owner = owner;
      window.dispatchEvent(new Event('ayat:download-lock'));
      return true;
    },
    release(owner) {
      if (this.owner !== owner) return;
      this.owner = null;
      window.dispatchEvent(new Event('ayat:download-lock'));
    }
  });

  let selected = eligible.find(item => item.id === 9004) || eligible[0] || null;
  let active = false;
  let stop = false;
  let completed = 0;
  let total = 1;

  function status(message) { ui.status.textContent = message; }
  function storedCount(reader) {
    return new Set(downloads.list().filter(item =>
      Number(item.reciterId) === Number(reader.id) &&
      item.provider === 'mp3quran' && Number.isInteger(Number(item.surah))
    ).map(item => Number(item.surah))).size;
  }

  function renderReaders() {
    const fragment = document.createDocumentFragment();
    for (const reader of eligible) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'synced-reader-card' + (selected?.id === reader.id ? ' is-selected' : '');
      card.setAttribute('aria-pressed', String(selected?.id === reader.id));
      card.disabled = active;
      const name = document.createElement('strong');
      name.textContent = reader.name;
      const detail = document.createElement('span');
      detail.textContent = 'تظليل كلمات • ' + core.arabicDigits(storedCount(reader)) + ' / ١١٤ سورة محفوظة';
      card.append(name, detail);
      card.addEventListener('click', () => {
        selected = reader;
        ui.reader.textContent = reader.name;
        renderReaders();
        status('اختر السورة، ثم اضغط تنزيلها. التسجيل المحفوظ سيعمل بالتظليل داخل المصحف.');
      });
      fragment.append(card);
    }
    ui.list.replaceChildren(fragment);

    const unavailableNames = unavailable.map(item => item.name);
    ui.unavailable.textContent = unavailableNames.join('، ');
  }

  function updateButtons() {
    const blocked = active || !!lock.owner || !selected;
    ui.one.disabled = blocked;
    ui.all.disabled = blocked;
    ui.surah.disabled = active;
    ui.cancel.hidden = !active;
  }

  for (let surah = 1; surah <= 114; surah++) {
    const option = document.createElement('option');
    option.value = String(surah);
    option.textContent = core.arabicDigits(surah) + '. سورة ' + core.SURAH_NAMES[surah - 1];
    ui.surah.append(option);
  }
  ui.reader.textContent = selected?.name || 'لا توجد تلاوات قابلة للتنزيل';

  async function verifiedTrack(reader, surah) {
    const chapter = await qud.loadChapter(reader, surah);
    const url = chapter?.audioUrl;
    if (Number(chapter?.surah) !== surah || Number(chapter?.reciterId) !== Number(reader.id) ||
        chapter.verses?.length !== core.VERSE_COUNTS[surah - 1] ||
        !api.canDownloadTrack({provider:'mp3quran',url})) {
      throw new Error('لا يوجد لهذا القارئ تسجيل MP3Quran بتوقيتات كلمات مطابقة لهذه السورة.');
    }
    return {
      url, provider:'mp3quran', reciterId:Number(reader.id), reciterName:reader.name,
      moshafId:Number(reader.id), moshafName:'حفص عن عاصم • تظليل الكلمات',
      surah, surahName:core.SURAH_NAMES[surah - 1]
    };
  }

  downloads.addEventListener('change', event => {
    if (!active || event.detail.status !== 'downloading') return;
    const {progress, received, total: bytes} = event.detail;
    const part = Number.isFinite(progress) ? progress : 0;
    ui.progress.value = Math.min(100, Math.max(0, 100 * (completed + part) / total));
    const amount = bytes > 0 ? Math.round(part * 100) + '٪' :
      api.humanSize(received || 0);
    status('جارٍ تنزيل ' + core.SURAH_NAMES[Number(event.detail.track?.surah || 1) - 1] +
      ' • ' + amount + ' • محفوظ ' + core.arabicDigits(completed) + ' من ' + core.arabicDigits(total));
  });

  async function download(all = false) {
    if (!selected || active || !lock.acquire('synced')) return;
    const reader = selected;
    const surahs = all ? Array.from({length:114},(_,i)=>i+1) : [Number(ui.surah.value)];
    if (all && !window.confirm(
      'تنزيل المصحف الصوتي كاملًا بصوت ' + reader.name + ' (١١٤ سورة)؟\n' +
      'التنزيل قد يستهلك مساحة كبيرة وباقة إنترنت. يُفضّل Wi-Fi، ويمكن إيقافه بعد السورة الحالية.'
    )) {
      lock.release('synced');
      return;
    }
    active = true;
    stop = false;
    completed = 0;
    total = surahs.length;
    let skipped = 0;
    ui.progress.value = 0;
    ui.progressWrap.hidden = false;
    updateButtons();
    renderReaders();

    try {
      for (let i = 0; i < surahs.length; i++) {
        if (stop) break;
        const surah = surahs[i];
        status('التحقق من توقيتات سورة ' + core.SURAH_NAMES[surah - 1] +
          ' • ' + core.arabicDigits(i + 1) + '/' + core.arabicDigits(total));
        // The exact audio URL and complete word timing are verified together.
        const track = await verifiedTrack(reader, surah);
        if (stop) break;
        if (await downloads.has(track.url)) {
          skipped++;
        } else {
          await downloads.downloadTrack(track);
        }
        completed++;
        ui.progress.value = 100 * completed / total;
        renderReaders();
      }
      status((stop ? 'تم إيقاف التنزيل. ' : 'اكتمل التنزيل. ') +
        'المحفوظ الآن: ' + core.arabicDigits(completed - skipped) +
        ' سورة جديدة، والموجود مسبقًا: ' + core.arabicDigits(skipped) +
        '. ستظهر في «مكتبتي» ويعمل تظليلها في المصحف.');
    } catch (error) {
      status((error?.message || 'تعذّر التنزيل.') +
        ' • تم تجهيز ' + core.arabicDigits(completed) +
        ' سورة. يمكنك المحاولة مرة أخرى لاستكمال الناقص.');
    } finally {
      active = false;
      ui.progressWrap.hidden = true;
      lock.release('synced');
      updateButtons();
      renderReaders();
      window.dispatchEvent(new Event('quran-downloads:change'));
    }
  }

  ui.one.addEventListener('click', () => download(false));
  ui.all.addEventListener('click', () => download(true));
  ui.cancel.addEventListener('click', () => {
    stop = true;
    ui.cancel.disabled = true;
    status('سيتم إيقاف التنزيل بعد انتهاء السورة الحالية…');
  });
  window.addEventListener('quran-downloads:change', () => {
    if (!active) renderReaders();
  });
  window.addEventListener('ayat:download-lock', updateButtons);

  // If the reader opened this section from the Mushaf, preselect the same
  // synchronized MP3Quran sheikh without changing the currently playing audio.
  const requested = Number(new URL(location.href).searchParams.get('synced'));
  if (eligible.some(item => Number(item.id) === requested)) {
    selected = eligible.find(item => Number(item.id) === requested);
    ui.reader.textContent = selected.name;
  }
  renderReaders();
  updateButtons();
})();
