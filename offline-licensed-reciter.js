(() => {
  'use strict';

  // Native Android builds may include one whole Mushaf whose SOURCE AUDIO
  // exactly matches the word/ayah timings already bundled with QUD v3.2.0.
  // This module is a no-op for web builds or when the pack is absent.
  const api = window.QuranDownloads;
  const core = window.QuranAudio;
  // The packaged 114-surah corpus lives only inside an installed Android
  // binary. Don't request nonexistent manifests from the website/PWA.
  if (!api || !core || !window.Capacitor?.isNativePlatform?.()) return;
  const base = new URL('./offline/huthaifi/', location.href);
  const files = new Map();
  let bundled = [];
  const reciterId = 9004;
  const oldList = api.DownloadManager.prototype.list;
  const oldHas = api.DownloadManager.prototype.has;
  const oldDownload = api.DownloadManager.prototype.downloadTrack;
  const oldRemove = api.DownloadManager.prototype.remove;
  const oldMedia = api.mediaFor;
  const oldCached = core.CatalogService.prototype.cached;
  const oldLoad = core.CatalogService.prototype.load;

  const ready = fetch(new URL('manifest.json', base), { cache: 'force-cache' })
    .then(async response => {
      if (!response.ok) return false;
      const manifest = await response.json();
      if (manifest.schemaVersion !== 1 || manifest.syncLevel !== 'word' ||
          manifest.audioCodec !== 'opus' || manifest.audioContainer !== 'webm' ||
          manifest.source !== 'MP3Quran / ali_al_huthaifi_mp3quran' ||
          manifest.timingSlug !== 'ali_al_huthaifi_mp3quran' ||
          Number(manifest.reciter?.id) !== reciterId ||
          !Array.isArray(manifest.tracks) || manifest.tracks.length !== 114) return false;
      if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
        const audio = document.createElement('audio');
        if (typeof audio.canPlayType === 'function' &&
            !audio.canPlayType('audio/webm; codecs="opus"')) return false;
      }
      const rows = [], unique = new Set();
      for (const item of manifest.tracks) {
        const surah = Number(item.surah);
        if (!Number.isInteger(surah) || surah < 1 || surah > 114 ||
            unique.has(surah) || item.file !== String(surah).padStart(3,'0') + '.webm' ||
            item.url !== 'https://server9.mp3quran.net/hthfi/' +
                String(surah).padStart(3,'0') + '.mp3' ||
            !Number.isSafeInteger(item.bytes) || item.bytes <= 1024 ||
            !/^[a-f0-9]{64}$/.test(item.sha256)) return false;
        unique.add(surah);
        rows.push(Object.freeze({
          url: item.url, provider: 'mp3quran', reciterId,
          reciterName: manifest.reciter.name, surah,
          surahName: core.SURAH_NAMES[surah-1],
          moshafId: reciterId, moshafName: 'حفص عن عاصم • مضمن بالتطبيق',
          bytes: item.bytes, savedAt: 0, bundled: true, file: item.file
        }));
      }
      if (unique.size !== 114) return false;
      bundled = rows;
      rows.forEach(item => files.set(item.url, item));
      window.dispatchEvent(new Event('quran-downloads:change'));
      return true;
    })
    .catch(error => { console.warn('Approved offline Huthaifi pack unavailable', error); return false; });

  function catalogWithPack(catalog) {
    if (!bundled.length) return catalog;
    const result = [...catalog];
    let row = result.find(item => Number(item.id) === reciterId);
    if (!row) {
      row = { id: reciterId, name: 'علي بن عبد الرحمن الحذيفي', moshaf: [] };
      result.push(row);
    } else {
      row = { ...row, moshaf: [...row.moshaf] };
      result[result.findIndex(item => Number(item.id) === reciterId)] = row;
    }
    const server = 'https://server9.mp3quran.net/hthfi/';
    if (!row.moshaf.some(item => item.server === server)) {
      row.moshaf.push({
        id: reciterId, name: 'حفص عن عاصم • مضمن بالتطبيق',
        server, surahs: Array.from({length:114},(_,index)=>index+1), complete:true
      });
    }
    return core.sortReciters(result);
  }

  api.DownloadManager.prototype.list = function() {
    const stored = oldList.call(this).filter(item => !files.has(item.url));
    return [...bundled, ...stored].sort((a,b)=>b.savedAt-a.savedAt);
  };
  api.DownloadManager.prototype.has = async function(url) {
    await ready;
    if (files.has(url)) return true;
    return oldHas.call(this,url);
  };
  api.DownloadManager.prototype.downloadTrack = async function(track) {
    await ready;
    if (files.has(track?.url)) return false;
    return oldDownload.call(this,track);
  };
  api.DownloadManager.prototype.remove = async function(url) {
    await ready;
    if (files.has(url)) return false;
    return oldRemove.call(this,url);
  };
  api.mediaFor = async function(owner, originalUrl) {
    await ready;
    const entry = files.get(originalUrl);
    if (!entry) return oldMedia(owner,originalUrl);
    const mediaUrl = new URL(entry.file,base).href;
    if (owner.__savedMedia?.originalUrl === originalUrl &&
        owner.__savedMedia.mediaUrl === mediaUrl) return mediaUrl;
    api.releaseMedia(owner);
    owner.__savedMedia = { originalUrl, mediaUrl };
    return mediaUrl;
  };
  core.CatalogService.prototype.cached = function() {
    return catalogWithPack(oldCached.call(this));
  };
  core.CatalogService.prototype.load = async function() {
    await ready;
    try { return catalogWithPack(await oldLoad.call(this)); }
    catch (error) {
      const cached = catalogWithPack(oldCached.call(this));
      if (cached.length) return cached;
      throw error;
    }
  };
  window.QuranLicensedHuthaifi = Object.freeze({
    ready, reciterId, isBundled: url => files.has(url)
  });
  ready.then(success => {
    if (success) window.dispatchEvent(new Event('quran-licensed-huthaifi:ready'));
  });
})();
