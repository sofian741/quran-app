(() => {
  'use strict';
  const api = window.QuranDownloads;
  const capacitor = window.Capacitor;
  const plugin = capacitor?.registerPlugin?.('QuranBackgroundDownloads');
  if (!api || !plugin || !capacitor?.isNativePlatform?.()) return;

  const pendingKey = 'quranNativeAudioPendingV1';
  const pending = () => { try { return JSON.parse(localStorage.getItem(pendingKey) || '[]'); } catch { return []; } };
  const save = jobs => localStorage.setItem(pendingKey, JSON.stringify(jobs));
  const original = api.DownloadManager.prototype.downloadTrack;
  const originalHas = api.DownloadManager.prototype.has;
  const originalRemove = api.DownloadManager.prototype.remove;
  const originalClear = api.DownloadManager.prototype.clear;
  const originalMedia = api.mediaFor;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const statusOf = async job => plugin.status({ id: job.id });
  const emitChange = () => window.dispatchEvent(new Event('quran-downloads:change'));
  function finalize(job, bytes) {
    const items = JSON.parse(localStorage.getItem(api.INDEX_KEY) || '[]').filter(item => item.url !== job.track.url);
    items.push({ ...job.track, nativePath: job.path, nativeId: job.id, bytes, savedAt: Date.now() });
    localStorage.setItem(api.INDEX_KEY, JSON.stringify(items));
    save(pending().filter(item => item.id !== job.id));
    emitChange();
  }
  async function reconcile() {
    for (const job of pending()) {
      try {
        const state = await statusOf(job);
        if (state.status === 8) finalize(job, state.total > 0 ? state.total : state.received);
        else if (state.status === 16) {
          await plugin.remove({ id: job.id });
          save(pending().filter(item => item.id !== job.id));
          emitChange();
        }
      } catch (error) { console.warn('Background audio status unavailable', error); }
    }
  }
  api.DownloadManager.prototype.downloadTrack = async function(track) {
    if (this.active) throw new Error('يوجد تنزيل آخر قيد التنفيذ.');
    if (!api.canDownloadTrack(track)) {
      throw new Error('تنزيل هذا المصدر غير مصرح به. يمكنك الاستماع مباشرة أو اختيار تلاوة من MP3Quran.');
    }
    if (this.list().some(item => item.url === track.url)) return false;
    const existing = pending().find(item => item.track.url === track.url);
    // Reattach to the Android DownloadManager job after a lost connection
    // instead of queuing a duplicate file or blocking future attempts.
    if (existing) {
      try {
        const state = await statusOf(existing);
        if (state.status === 8) {
          finalize(existing, state.total > 0 ? state.total : state.received);
          return false;
        }
        if (state.status === 16) {
          await plugin.remove({ id: existing.id });
          save(pending().filter(item => item.id !== existing.id));
        }
      } catch (_) {
        save(pending().filter(item => item.id !== existing.id));
      }
    }
    this.active = true;
    this.emit({ status: 'starting', track, progress: 0 });
    let job;
    try {
      if (existing && pending().some(item => item.id === existing.id)) {
        job = existing;
      } else {
        const result = await plugin.enqueue({ url: track.url });
        job = { id: result.id, path: result.path, track };
        save([...pending(), job]);
      }
      while (true) {
        const state = await statusOf(job);
        if (state.status === 8) {
          const bytes = state.total > 0 ? state.total : state.received;
          finalize(job, bytes);
          this.emit({ status: 'done', track, bytes, progress: 1 });
          return true;
        }
        if (state.status === 16) {
          await plugin.remove({ id: job.id });
          save(pending().filter(item => item.id !== job.id));
          throw new Error('فشل تنزيل السورة. حاول مرة أخرى بعد التأكد من الاتصال.');
        }
        if (state.status === 4) {
          this.emit({ status: 'paused', track, reason: state.reason,
            received: state.received, total: state.total, progress: 0 });
          await sleep(1100);
          continue;
        }
        const received = Math.max(0, state.received);
        const total = Math.max(0, state.total);
        this.emit({ status: 'downloading', track, received, total, progress: total ? received / total : 0 });
        await sleep(950);
      }
    } catch (error) {
      this.emit({ status: 'error', track, error: error.message });
      throw error;
    } finally { this.active = false; }
  };
  api.DownloadManager.prototype.has = async function(url) {
    const saved = this.list().find(item => item.url === url && item.nativePath);
    if (saved) {
      try {
        const result = await plugin.exists({ path: saved.nativePath });
        if (result.exists) return true;
      } catch (error) { console.warn('Saved Android audio validation failed', error); }
      localStorage.setItem(api.INDEX_KEY, JSON.stringify(this.list().filter(row => row.url !== url)));
      emitChange();
    }
    return originalHas.call(this, url);
  };
  api.DownloadManager.prototype.remove = async function(url) {
    const item = this.list().find(item => item.url === url);
    if (item?.nativeId) {
      try { await plugin.remove({ id: item.nativeId }); }
      finally { await plugin.removeLocal({ path: item.nativePath }); }
      localStorage.setItem(api.INDEX_KEY, JSON.stringify(this.list().filter(row => row.url !== url)));
      this.emit({ status: 'removed', url });
      return true;
    }
    return originalRemove.call(this, url);
  };
  api.DownloadManager.prototype.clear = async function() {
    for (const item of this.list().filter(row => row.nativeId)) {
      try { await plugin.remove({ id: item.nativeId }); } catch (error) { console.warn(error); }
    }
    for (const job of pending()) {
      try { await plugin.remove({ id: job.id }); } catch (error) { console.warn(error); }
    }
    save([]);
    return originalClear.call(this);
  };
  api.mediaFor = async function(owner, url) {
    const item = new api.DownloadManager().list().find(row => row.url === url);
    if (item?.nativePath && (await plugin.exists({ path: item.nativePath })).exists) {
      api.releaseMedia(owner);
      const mediaUrl = capacitor.convertFileSrc(item.nativePath);
      owner.__savedMedia = { originalUrl: url, mediaUrl };
      return mediaUrl;
    }
    return originalMedia(owner, url);
  };
  reconcile();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) reconcile(); });
  window.addEventListener('pageshow', reconcile);
})();
