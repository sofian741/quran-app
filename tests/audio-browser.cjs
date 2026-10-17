#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const browserPath = process.env.QURAN_BROWSER_PATH || '/usr/bin/chromium';
const base = process.env.QURAN_BASE_URL || 'http://127.0.0.1:4173';

const catalog = {
  reciters: [{
    id: 1, name: 'مشاري راشد العفاسي',
    moshaf: [{ id: 11, name: 'حفص عن عاصم', server: 'https://server.mp3quran.net/afs/', surah_list: Array.from({ length: 114 }, (_, i) => i + 1).join(',') }]
  }]
};

function audioFiles(surah) {
  if (surah === 2) {
    return [{
      verse_key: '2:2', url: 'mock/002002.mp3', duration: 4000,
      segments: [[1, 0, 1000]]
    }];
  }
  const count = surah === 1 ? 7 : 1;
  return Array.from({ length: count }, (_, index) => ({
    verse_key: `${surah}:${index + 1}`,
    url: `mock/${String(surah).padStart(3, '0')}${String(index + 1).padStart(3, '0')}.mp3`,
    duration: 4000,
    segments: surah === 1 && index === 0
      ? [[1, 0, 500], [2, 500, 1000], [3, 1000, 1500], [4, 1500, 2000]]
      : [[1, 0, 1000]]
  }));
}

function chapterAudio(surah) {
  return {
    audio_file: {
      chapter_id: surah,
      audio_url: `https://verses.quran.com/continuous-${surah}.mp3`,
      file_size: 9,
      format: 'mp3',
      timestamps: Array.from({ length: surah === 1 ? 7 : 1 }, (_, index) => ({
        verse_key: `${surah}:${index + 1}`,
        timestamp_from: index * 4000,
        timestamp_to: (index + 1) * 4000,
        segments: index === 0
          ? [[1, index * 4000, index * 4000 + 500], [2, index * 4000 + 500, index * 4000 + 1000], [3, index * 4000 + 1000, index * 4000 + 1500], [4, index * 4000 + 1500, index * 4000 + 2000]]
          : [[1, index * 4000, index * 4000 + 1000]]
      }))
    }
  };
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: browserPath, args: ['--no-sandbox'] });
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport, serviceWorkers: 'block' });
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.addInitScript(() => {
      localStorage.clear();
      const state = new WeakMap();
      const mediaState = element => {
        if (!state.has(element)) state.set(element, { paused: true, currentTime: 0, duration: 4 });
        return state.get(element);
      };
      Object.defineProperties(HTMLMediaElement.prototype, {
        paused: { configurable: true, get() { return mediaState(this).paused; } },
        currentTime: { configurable: true, get() { return mediaState(this).currentTime; }, set(value) { mediaState(this).currentTime = Number(value) || 0; } },
        duration: { configurable: true, get() { return mediaState(this).duration; } }
      });
      HTMLMediaElement.prototype.load = function () {
        this.dispatchEvent(new Event('loadstart'));
        queueMicrotask(() => this.dispatchEvent(new Event('loadedmetadata')));
      };
      HTMLMediaElement.prototype.play = function () {
        mediaState(this).paused = false;
        this.dispatchEvent(new Event('play'));
        this.dispatchEvent(new Event('playing'));
        return Promise.resolve();
      };
      HTMLMediaElement.prototype.pause = function () {
        const wasPaused = mediaState(this).paused;
        mediaState(this).paused = true;
        if (!wasPaused) this.dispatchEvent(new Event('pause'));
      };
    });
    await page.route('https://mp3quran.net/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(catalog) }));
    await page.route('https://api.quran.com/api/v4/recitations/7/by_chapter/*', route => {
      const match = /by_chapter\/(\d+)/.exec(route.request().url());
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ audio_files: audioFiles(Number(match[1])) }) });
    });
    await page.route('https://api.quran.com/api/v4/chapter_recitations/7/*', route => {
      const match = /chapter_recitations\/7\/(\d+)/.exec(route.request().url());
      if (Number(match?.[1]) !== 1) return route.abort();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(chapterAudio(1)) });
    });
    await page.route('https://verses.quran.com/continuous-1.mp3', route => route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*', 'content-type': 'audio/mpeg', 'content-length': '9' },
      body: 'chapter01'
    }));
    await page.route('https://verses.quran.com/offline-test.mp3', route => route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*', 'content-type': 'audio/mpeg', 'content-length': '8' },
      body: 'audiodata'
    }));
    await page.goto(`${base}/quran.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#quran-text[data-layout-state="ready"]');

    const geometry = await page.evaluate(() => {
      const stage = document.querySelector('.reader-stage').getBoundingClientRect();
      const player = document.querySelector('.mushaf-audio-player').getBoundingClientRect();
      return { stageBottom: stage.bottom, playerTop: player.top, width: document.documentElement.scrollWidth, client: document.documentElement.clientWidth };
    });
    assert.ok(geometry.stageBottom <= geometry.playerTop + .5, `${viewport.width}px player must not cover the mushaf`);
    assert.equal(geometry.width, geometry.client, `${viewport.width}px must not scroll horizontally`);

    const before = await page.locator('.mushaf-line').evaluateAll(lines => lines.map(line => [line.offsetWidth, line.offsetHeight]));
    await page.evaluate(async () => window.quranAudioEngine.goTo(1, 1, { autoplay: true }));
    await page.waitForFunction(() => document.querySelectorAll('.audio-verse-band').length > 0);
    await page.evaluate(() => {
      const audio = document.getElementById('mushaf-recitation-audio');
      audio.currentTime = .2;
      audio.dispatchEvent(new Event('timeupdate'));
    });
    assert.equal(await page.locator('.mushaf-word.is-audio-word').count(), 1, 'trusted matching segments must highlight one word');
    assert.equal(await page.evaluate(() => !!window.quranAudioEngine.__continuousChapter), true,
      'aligned playback must use one continuous chapter recording');
    const after = await page.locator('.mushaf-line').evaluateAll(lines => lines.map(line => [line.offsetWidth, line.offsetHeight]));
    assert.deepEqual(after, before, 'audio highlighting must not change line geometry');

    await page.evaluate(() => document.querySelector('#audio-download').click());
    await page.waitForFunction(() => {
      const items = JSON.parse(localStorage.getItem('quranAudioDownloadsV1') || '[]');
      return items.some(item => item.url === 'https://verses.quran.com/continuous-1.mp3');
    });
    const continuousDownload = await page.evaluate(async () => {
      const items = JSON.parse(localStorage.getItem('quranAudioDownloadsV1') || '[]');
      const item = items.find(entry => entry.url === 'https://verses.quran.com/continuous-1.mp3');
      const manager = new window.QuranDownloads.DownloadManager();
      const result = { ayah: item?.ayah ?? null, cached: await manager.has(item?.url) };
      await manager.remove(item.url);
      return result;
    });
    assert.deepEqual(continuousDownload, { ayah: null, cached: true },
      'offline download must store the same continuous chapter file used for playback');

    await page.evaluate(async () => window.quranAudioEngine.goTo(2, 2, { autoplay: true }));
    await page.waitForFunction(() => window.mushafReader?.getCurrentPage() === 2);
    await page.evaluate(() => {
      const audio = document.getElementById('mushaf-recitation-audio');
      audio.currentTime = .2; audio.dispatchEvent(new Event('timeupdate'));
    });
    assert.ok(await page.locator('.audio-verse-band').count() > 0, 'current verse must stay highlighted');
    assert.equal(await page.locator('.mushaf-word.is-audio-word').count(), 0, 'mismatched word counts must disable word highlighting');

    await page.evaluate(() => window.quranAudioEngine.setRepeat({
      mode: 'range', start: 1, end: 3, count: 4, completed: 0
    }));
    const repeat = await page.evaluate(() => window.quranAudioEngine.state.repeat);
    assert.deepEqual(repeat, { mode: 'range', start: 1, end: 3, count: 4, completed: 0 });

    const cached = await page.evaluate(async () => {
      const manager = new window.QuranDownloads.DownloadManager();
      const track = {
        url: 'https://verses.quran.com/offline-test.mp3', provider: 'quran-foundation',
        reciterId: 7, reciterName: 'مشاري راشد العفاسي', surah: 1, surahName: 'الفاتحة', ayah: 1
      };
      await manager.downloadTrack(track);
      const before = { has: await manager.has(track.url), count: manager.list().length };
      await manager.remove(track.url);
      return { before, after: await manager.has(track.url) };
    });
    assert.deepEqual(cached, { before: { has: true, count: 1 }, after: false }, 'downloaded audio must be manageable offline');

    await page.unroute('https://api.quran.com/api/v4/recitations/7/by_chapter/*');
    await page.route('https://api.quran.com/api/v4/recitations/7/by_chapter/3?segments=true', route => route.abort());
    const failed = await page.evaluate(async () => {
      window.quranAudioEngine.timing.cache.clear();
      return window.quranAudioEngine.goTo(3, 1, { autoplay: true });
    });
    assert.equal(failed, false, 'network loss must fail without fabricated timing');
    assert.equal(await page.locator('.mushaf-word.is-audio-word').count(), 0);
    assert.match(await page.locator('#audio-mini-status').textContent(), /تعذّر|الاتصال/);
    assert.deepEqual(pageErrors, [], `browser errors at ${viewport.width}px`);
    await page.close();
  }
  await browser.close();
  console.log('audio-browser: player, synchronization, repeat, and 2 mobile viewports passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
