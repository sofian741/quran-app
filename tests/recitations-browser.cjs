#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const browserPath = process.env.QURAN_BROWSER_PATH || '/usr/bin/chromium';
const base = process.env.QURAN_BASE_URL || 'http://127.0.0.1:4173';
const allSurahs = Array.from({ length: 114 }, (_, index) => index + 1).join(',');
const catalog = {
  reciters: [
    { id: 99, name: 'قارئ تجريبي', moshaf: [{ id: 991, name: 'مختارات', server: 'https://server.mp3quran.net/test/', surah_list: '1,2' }] },
    { id: 7, name: 'مشاري راشد العفاسي', moshaf: [{ id: 71, name: 'حفص مرتل', server: 'https://server.mp3quran.net/afs/', surah_list: allSurahs }] },
    { id: 3, name: 'عبد الرحمن السديس', moshaf: [{ id: 31, name: 'حفص', server: 'https://server.mp3quran.net/sds/', surah_list: allSurahs }] }
  ]
};

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: browserPath, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.clear();
    let paused = true;
    let currentTime = 0;
    Object.defineProperties(HTMLMediaElement.prototype, {
      paused: { configurable: true, get: () => paused },
      currentTime: { configurable: true, get: () => currentTime, set: value => { currentTime = Number(value) || 0; } },
      duration: { configurable: true, get: () => 120 }
    });
    HTMLMediaElement.prototype.load = function () {
      this.dispatchEvent(new Event('loadstart'));
      queueMicrotask(() => this.dispatchEvent(new Event('loadedmetadata')));
    };
    HTMLMediaElement.prototype.play = function () {
      paused = false; this.dispatchEvent(new Event('play')); this.dispatchEvent(new Event('playing'));
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function () {
      const changed = !paused; paused = true; if (changed) this.dispatchEvent(new Event('pause'));
    };
  });
  await page.route('https://mp3quran.net/api/**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(catalog)
  }));
  await page.goto(`${base}/recitations.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('.reciter-card').length === 3);

  const names = await page.locator('.reciter-card strong').allTextContents();
  assert.deepEqual(names, ['مشاري راشد العفاسي', 'عبد الرحمن السديس', 'قارئ تجريبي']);
  assert.match(await page.locator('#player-subtitle').textContent(), /مشاري راشد العفاسي/);
  assert.equal(await page.locator('#surah-select option').count(), 114);

  await page.getByRole('button', { name: /مشاري راشد العفاسي/ }).click();
  assert.equal(await page.evaluate(() => window.quranAudioEngine.state.provider), 'mp3quran');

  await page.getByRole('button', { name: /قارئ تجريبي/ }).click();
  assert.equal(await page.evaluate(() => window.quranAudioEngine.state.reciterId), 99);
  assert.equal(await page.locator('#surah-select option').count(), 2, 'partial recordings must keep their real chapter list');
  const savedPosition = await page.evaluate(() => {
    window.quranAudioEngine.seek(42);
    return JSON.parse(localStorage.getItem('quranAudioStateV2')).position;
  });
  assert.equal(savedPosition, 42, 'listening position must be persisted');
  await page.click('#play-pause');
  assert.equal(await page.getAttribute('#play-pause', 'aria-label'), 'إيقاف مؤقت');
  await page.selectOption('#speed', '1.5');
  assert.equal(await page.evaluate(() => window.quranAudioEngine.state.speed), 1.5);
  await page.check('#repeat');
  assert.equal(await page.evaluate(() => window.quranAudioEngine.state.repeat.mode), 'surah');

  await page.context().setOffline(true);
  await page.evaluate(() => document.getElementById('recitation-audio').dispatchEvent(new Event('error')));
  assert.match(await page.locator('#player-status').textContent(), /غير محفوظ|الإنترنت/);
  await page.context().setOffline(false);

  await page.check('#complete-only');
  assert.equal(await page.locator('.reciter-card').count(), 2);
  await page.fill('#reciter-search', 'السديس');
  assert.equal(await page.locator('.reciter-card').count(), 1);
  assert.deepEqual(errors, []);
  await browser.close();
  console.log('recitations-browser: ordering, reader switching, partial recordings, speed, repeat, and filters passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
