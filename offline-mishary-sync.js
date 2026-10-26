(() => {
  'use strict';
  // Load AFTER qud-audio.js and BEFORE mushaf-audio.js. Reuse the existing
  // synchronized word/ayah highlighter, play controls, follow mode and repeat.
  // The audio and cpfair timestamps MUST originate from the same EveryAyah
  // verse recordings: no approximate alignment from another Mishary edition.
  const core = window.QuranAudio;
  const downloads = window.QuranDownloads;
  if (!core?.AudioEngine || !downloads?.syncedMisharyChapter) return;

  const proto = core.AudioEngine.prototype;
  const originalPrepare = proto.prepare;
  const originalGoTo = proto.goTo;
  const originalPreload = proto.preloadUpcomingVerse;
  const originalEnded = proto.handleEnded;
  const sourceReady = () => downloads.bundledReady;
  const isSynced = engine => engine.state.provider === 'quran-foundation' &&
    Number(engine.state.reciterId) === 7 && !!engine.__offlineMisharyChapter;

  async function chapterFor(engine) {
    if (engine.state.provider !== 'quran-foundation' || Number(engine.state.reciterId) !== 7) return null;
    if (!(await sourceReady())) return null;
    return downloads.syncedMisharyChapter(engine.state.surah);
  }

  function timeToAyah(verses, milliseconds) {
    let low = 0, high = verses.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (verses[mid].timestampFrom <= milliseconds) low = mid;
      else high = mid - 1;
    }
    return Math.min(verses.length - 1, low);
  }

  function placeAt(engine, seconds) {
    engine.__offlineSeekPending = true;
    const apply = () => {
      try {
        const duration = Number(engine.audio.duration);
        const max = Number.isFinite(duration) ? Math.max(0, duration - 0.02) : seconds;
        engine.audio.currentTime = Math.min(Math.max(0, seconds), max);
      } finally {
        engine.__offlineSeekPending = false;
      }
    };
    if (engine.audio.readyState >= 1) apply();
    else {
      const targetVersion = engine.prepareVersion;
      engine.audio.addEventListener('loadedmetadata', () => {
        if (engine.prepareVersion === targetVersion && isSynced(engine)) apply();
      }, { once: true });
    }
  }

  const previousContinuousSync = proto.__syncContinuousChapter;
  proto.__syncContinuousChapter = function() {
    // QUD and Foundation install their own continuous-verse cursor before
    // Mishary initializes. Preserve that cursor for every non-Mishary voice.
    if (!isSynced(this)) {
      previousContinuousSync?.call(this);
      return;
    }
    if (this.__offlineSyncBusy || this.__offlineSeekPending) return;
    const chapter = this.__offlineMisharyChapter;
    if (chapter.surah !== this.state.surah) return;
    const milliseconds = (Number(this.audio.currentTime) || 0) * 1000;
    const verse = chapter.byAyah.get(this.state.ayah);
    const repeat = this.state.repeat;
    if (verse && !this.audio.paused && milliseconds >= verse.timestampTo - 18) {
      if (repeat.mode === 'verse') {
        this.__offlineSyncBusy = true;
        repeat.completed++;
        if (repeat.completed < repeat.count) {
          placeAt(this, verse.timestampFrom / 1000);
        } else {
          repeat.completed = 0;
          repeat.mode = 'off';
        }
        this.persist();
        this.__offlineSyncBusy = false;
        if (repeat.mode === 'verse') return;
      }
      if (repeat.mode === 'range' && this.state.ayah === repeat.end) {
        this.__offlineSyncBusy = true;
        repeat.completed++;
        if (repeat.completed < repeat.count) {
          this.state.ayah = repeat.start;
          this.currentTiming = chapter.byAyah.get(repeat.start);
          placeAt(this, this.currentTiming.timestampFrom / 1000);
          this.persist(); this.emit();
          this.__offlineSyncBusy = false;
          return;
        }
        repeat.mode = 'off';
        repeat.completed = 0;
        this.persist();
        this.__offlineSyncBusy = false;
      }
    }
    const index = timeToAyah(chapter.verses, milliseconds);
    const selected = chapter.verses[index];
    if (selected?.ayah !== this.state.ayah) {
      this.state.ayah = selected.ayah;
      this.currentTiming = selected;
      this.persist();
      this.updateMediaMetadata();
      this.emit();
    }
  };

  proto.prepare = async function(options = {}) {
    if (this.state.provider !== 'quran-foundation' || Number(this.state.reciterId) !== 7) {
      this.__offlineMisharyChapter = null;
      return originalPrepare.call(this, options);
    }
    let chapter;
    try { chapter = await chapterFor(this); }
    catch (error) {
      if (!(await sourceReady())) return originalPrepare.call(this, options);
      this.status = 'error';
      this.error = 'بيانات تزامن مشاري المضمنة غير صالحة: ' + (error.message || 'خطأ قراءة');
      this.emit();
      return false;
    }
    if (!chapter) {
      this.__offlineMisharyChapter = null;
      return originalPrepare.call(this, options);
    }
    const version = ++this.prepareVersion;
    const autoplay = !!options.autoplay;
    if (autoplay) this.intentToPlay = true;
    this.status = 'loading'; this.error = ''; this.emit();
    const timing = chapter.byAyah.get(Number(this.state.ayah));
    if (!timing) throw new Error('توقيت الآية غير موجود.');
    const previousAudio = this.audio;
    try {
      const mediaUrl = await downloads.mediaFor(this, chapter.audioUrl);
      if (version !== this.prepareVersion || previousAudio !== this.audio) return false;
      const unchanged = this.trackUrl === chapter.audioUrl && this.audio.src === mediaUrl;
      this.__offlineMisharyChapter = chapter;
      this.currentTiming = timing;
      this.trackUrl = chapter.audioUrl;
      const savedTime = Number(this.state.position) || 0;
      const targetMs = savedTime * 1000 >= timing.timestampFrom && savedTime * 1000 < timing.timestampTo
        ? savedTime * 1000 : timing.timestampFrom;
      const target = targetMs / 1000;
      this.pendingResume = 0;
      if (!unchanged) {
        this.audio.preload = autoplay ? 'auto' : 'metadata';
        this.audio.src = mediaUrl;
        placeAt(this, target);
        this.audio.load();
      } else {
        placeAt(this, target);
      }
      this.audio.playbackRate = this.state.speed;
      this.state.position = target;
      this.status = this.audio.paused ? 'ready' : 'playing';
      this.updateMediaMetadata();
      this.emit();
      if (autoplay) return await this.play();
      return true;
    } catch (error) {
      if (version !== this.prepareVersion) return false;
      this.__offlineMisharyChapter = null;
      this.status = 'error';
      this.error = 'تعذر تشغيل تسجيل مشاري المضمن: ' + (error.message || 'خطأ التشغيل');
      this.emit();
      return false;
    }
  };

  // Navigation inside a single local 114-track chapter must seek within the
  // existing audio rather than reload the recording on every ayah selection.
  proto.goTo = async function(surah, ayah = 1, options = {}) {
    surah = Math.min(114, Math.max(1, Number(surah) || 1));
    ayah = Math.min(core.VERSE_COUNTS[surah - 1], Math.max(1, Number(ayah) || 1));
    if (isSynced(this) && Number(this.state.surah) === surah) {
      const verse = this.__offlineMisharyChapter.byAyah.get(ayah);
      if (!verse) return false;
      const autoplay = options.autoplay ?? (!this.audio.paused || this.intentToPlay);
      this.state.ayah = ayah;
      this.currentTiming = verse;
      this.state.position = verse.timestampFrom / 1000;
      if (!options.preserveRepeat) this.state.repeat.completed = 0;
      placeAt(this, this.state.position);
      this.persist(); this.updateMediaMetadata(); this.emit();
      // Never tell the verse button playback succeeded when Android rejected play().
      return autoplay ? !!(await this.play()) : true;
    }
    this.__offlineMisharyChapter = null;
    return originalGoTo.call(this, surah, ayah, options);
  };

  proto.preloadUpcomingVerse = function() {
    // QUD/Foundation already stream a whole chapter. Preloading the next
    // verse would issue a duplicate request for the same large MP3 file.
    if (isSynced(this) || (this.state.provider === 'quran-foundation' &&
        this.__continuousChapter && Number(this.state.reciterId) !== 7)) return Promise.resolve();
    return originalPreload.call(this);
  };

  proto.handleEnded = async function() {
    if (!isSynced(this)) return originalEnded.call(this);
    // The whole surah ended, not just the individual ayah.
    this.state.ayah = core.VERSE_COUNTS[this.state.surah - 1];
    this.currentTiming = this.__offlineMisharyChapter.byAyah.get(this.state.ayah);
    this.emit();
    return originalEnded.call(this);
  };

  // Ensure synchronization updates even while the options sheet is closed.
  // The frame-based mushaf highlighter also calls this exact method.
  const previousBind = proto.bindAudio;
  proto.bindAudio = function() {
    previousBind.call(this);
    const element = this.audio;
    element.addEventListener('timeupdate', () => {
      if (element === this.audio) this.__syncContinuousChapter?.();
    });
    element.addEventListener('seeked', () => {
      if (element === this.audio) this.__syncContinuousChapter?.();
    });
  };
})();
