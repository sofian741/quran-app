(() => {
  'use strict';
  // The Android build bundles these recordings. This module is intentionally a
  // no-op in the website/development build when the manifest is absent.
  const api = window.QuranDownloads;
  const core = window.QuranAudio;
  if (!api || !core) return;
  const base = new URL('./offline/mishary/', location.href);
  const fileList = new Map();
  let packagedTracks = [];
  let bundledReader = null;
  const chapterCache = new Map();
  const oldList = api.DownloadManager.prototype.list;
  const oldHas = api.DownloadManager.prototype.has;
  const oldDownload = api.DownloadManager.prototype.downloadTrack;
  const oldRemove = api.DownloadManager.prototype.remove;
  const oldMediaFor = api.mediaFor;
  const oldCached = core.CatalogService.prototype.cached;
  const oldLoad = core.CatalogService.prototype.load;

  function combineCatalog(catalog) {
    if (!bundledReader) return catalog;
    const result = [...catalog];
    let existing = result.find(row => row.id === bundledReader.id);
    if (!existing) {
      existing = { id: bundledReader.id, name: bundledReader.name, moshaf: [] };
      result.push(existing);
    } else {
      existing = { ...existing, moshaf: [...existing.moshaf] };
      result[result.findIndex(row => row.id === existing.id)] = existing;
    }
    if (!existing.moshaf.some(row => row.server === bundledReader.moshaf[0].server)) {
      existing.moshaf.push(bundledReader.moshaf[0]);
    }
    return core.sortReciters(result);
  }

  const ready = fetch(new URL('manifest.json', base), { cache: 'force-cache' })
    .then(async response => {
      if (!response.ok) return false;
      const data = await response.json();
      if (data.schemaVersion !== 2 || data.syncLevel !== 'word' ||
          data.recordingSource !== 'EveryAyah/Alafasy_128kbps' || data.reciter?.name !== 'مشاري راشد العفاسي' ||
          !Array.isArray(data.tracks) || data.tracks.length !== 114 ||
          !data.tracks.every(row => row.timing === row.file.replace('.mp3', '.json'))) return false;
      const numbers = new Set();
      const tracks = [];
      for (const item of data.tracks) {
        const number = Number(item.surah);
        if (!Number.isInteger(number) || number < 1 || number > 114 ||
            numbers.has(number) || !/^\d{3}\.mp3$/.test(item.file) ||
            item.file !== String(number).padStart(3, '0') + '.mp3' ||
            !/^https:\/\/[^?#]+\.mp3$/.test(item.url) ||
            !Number.isSafeInteger(item.bytes) || item.bytes < 1024) return false;
        numbers.add(number);
        tracks.push(Object.freeze({
          url: item.url, provider: 'mp3quran',
          reciterId: Number(data.reciter.id), reciterName: data.reciter.name,
          moshafId: Number(data.moshaf.id), moshafName: data.moshaf.name,
          surah: number, surahName: core.SURAH_NAMES[number - 1],
          bytes: item.bytes, savedAt: 0, bundled: true, file: item.file
        }));
      }
      const server = data.moshaf.server;
      if (typeof server !== 'string' || !server.startsWith('https://') ||
          !tracks.every(track => track.url === server + String(track.surah).padStart(3, '0') + '.mp3')) {
        return false;
      }
      packagedTracks = tracks;
      tracks.forEach(track => fileList.set(track.url, track));
      bundledReader = {
        id: Number(data.reciter.id), name: data.reciter.name,
        moshaf: [{
          id: Number(data.moshaf.id), name: data.moshaf.name,
          server, surahs: Array.from({ length: 114 }, (_, index) => index + 1),
          complete: true
        }]
      };
      window.dispatchEvent(new Event('quran-downloads:change'));
      return true;
    })
    .catch(error => { console.warn('Bundled Mushary audio is unavailable', error); return false; });

  // Every synchronized chapter uses the *same* EveryAyah audio clips that
  // generated its word timings. Never combine timings with MP3Quran's other
  // Alafasy recording, even though its URL is the offline catalog key.
  async function syncedChapter(surah) {
    await ready;
    surah = Number(surah);
    if (!bundledReader || !Number.isInteger(surah) || surah < 1 || surah > 114) return null;
    if (chapterCache.has(surah)) return chapterCache.get(surah);
    const promise = (async () => {
      const file = String(surah).padStart(3, '0') + '.json';
      const response = await fetch(new URL(file, base), { cache: 'force-cache' });
      if (!response.ok) throw new Error('بيانات تزامن سورة ' + surah + ' غير موجودة.');
      const doc = await response.json();
      const expected = core.VERSE_COUNTS[surah - 1];
      if (doc.schemaVersion !== 2 || doc.surah !== surah ||
          !Array.isArray(doc.verses) || doc.verses.length !== expected) {
        throw new Error('بيانات سورة ' + surah + ' غير مكتملة.');
      }
      const track = fileList.get(bundledReader.moshaf[0].server + String(surah).padStart(3, '0') + '.mp3');
      if (!track) throw new Error('صوت السورة غير موجود.');
      let previousEnd = -1;
      const verses = doc.verses.map((item, index) => {
        const start = Number(item.start);
        const end = Number(item.end);
        if (Number(item.ayah) !== index + 1 || !Number.isFinite(start) ||
            !Number.isFinite(end) || start < 0 || end <= start || start < previousEnd - 20 ||
            !Array.isArray(item.words)) {
          throw new Error('خطأ توقيت سورة ' + surah + ':' + (index + 1));
        }
        previousEnd = end;
        const segments = item.words.map(span => {
          if (!Array.isArray(span) || span.length !== 4) throw new Error('بيانات كلمة غير صالحة.');
          const [first, last, from, to] = span.map(Number);
          if (!Number.isInteger(first) || !Number.isInteger(last) ||
              first < 1 || last < first || !Number.isFinite(from) ||
              !Number.isFinite(to) || from < start - 100 || to > end + 100 ||
              to <= from) throw new Error('توقيت كلمة غير صالح.');
          return { word: first, endWord: last, start: from, end: to };
        });
        return Object.freeze({
          surah, ayah: index + 1, audioUrl: track.url,
          timestampFrom: start, timestampTo: end, duration: end - start,
          segments, source: 'EveryAyah / cpfair quran-align (CC BY 4.0)'
        });
      });
      return Object.freeze({
        reciterId: 7, surah, audioUrl: track.url,
        verses, byAyah: new Map(verses.map(verse => [verse.ayah, verse]))
      });
    })().catch(error => { chapterCache.delete(surah); throw error; });
    chapterCache.set(surah, promise);
    return promise;
  }
  api.syncedMisharyChapter = syncedChapter;
  api.bundledMisharyReader = () => bundledReader;
  api.bundledReady = ready;
  api.isBundled = url => fileList.has(url);
  api.DownloadManager.prototype.list = function() {
    const downloaded = oldList.call(this).filter(track => !fileList.has(track.url));
    return [...packagedTracks, ...downloaded].sort((a, b) => b.savedAt - a.savedAt);
  };
  api.DownloadManager.prototype.has = async function(url) {
    await ready;
    if (fileList.has(url)) return true;
    return oldHas.call(this, url);
  };
  api.DownloadManager.prototype.downloadTrack = async function(track) {
    await ready;
    if (fileList.has(track?.url)) return false;
    return oldDownload.call(this, track);
  };
  api.DownloadManager.prototype.remove = async function(url) {
    await ready;
    if (fileList.has(url)) return false;
    return oldRemove.call(this, url);
  };
  api.mediaFor = async function(owner, url) {
    await ready;
    const track = fileList.get(url);
    if (!track) return oldMediaFor(owner, url);
    const mediaUrl = new URL(track.file, base).href;
    if (owner.__savedMedia?.originalUrl === url) return mediaUrl;
    api.releaseMedia(owner);
    owner.__savedMedia = { originalUrl: url, mediaUrl };
    return mediaUrl;
  };
  core.CatalogService.prototype.cached = function() {
    return combineCatalog(oldCached.call(this));
  };
  core.CatalogService.prototype.load = async function() {
    await ready;
    try { return combineCatalog(await oldLoad.call(this)); }
    catch (error) {
      const cached = combineCatalog(oldCached.call(this));
      if (cached.length) return cached;
      throw error;
    }
  };
  ready.then(ok => { if (ok) window.dispatchEvent(new Event('quran-bundled-mishary:ready')); });
})();
