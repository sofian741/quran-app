#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const base = process.env.QURAN_BASE_URL || 'http://127.0.0.1:4173';
const browserPath = process.env.QURAN_BROWSER_PATH || '/usr/bin/chromium';
const catalog = { reciters: [
    { id: 123, name: 'قارئ تجريبي غير متزامن', moshaf: [
        { id: 321, name: 'حفص عن عاصم', server: 'https://server.mp3quran.net/afs/',
          surah_list: Array.from({ length: 114 }, (_, i) => i + 1).join(',') }
    ] },
    { id: 124, name: 'قارئ تجريبي آخر', moshaf: [
        { id: 322, name: 'حفص عن عاصم', server: 'https://server.mp3quran.net/afs/',
          surah_list: '1,2,3' }
    ] }
] };

(async () => {
    const browser = await chromium.launch({
        headless: true, executablePath: browserPath, args: ['--no-sandbox']
    });
    try {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(() => {
            localStorage.clear();
            const state = new WeakMap();
            const mediaState = el => {
                if (!state.has(el)) state.set(el, { paused: true, currentTime: 0, duration: 180 });
                return state.get(el);
            };
            Object.defineProperties(HTMLMediaElement.prototype, {
                paused: { configurable: true, get() { return mediaState(this).paused; } },
                currentTime: {
                    configurable: true,
                    get() { return mediaState(this).currentTime; },
                    set(value) { mediaState(this).currentTime = Number(value) || 0; }
                },
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
                const old = mediaState(this).paused;
                mediaState(this).paused = true;
                if (!old) this.dispatchEvent(new Event('pause'));
            };
        });
        await page.route('https://mp3quran.net/api/**', route => route.fulfill({
            status: 200, contentType: 'application/json', body: JSON.stringify(catalog)
        }));
        await page.route('https://api.quran.com/api/v4/recitations/7/by_chapter/**', route => {
            const match = /by_chapter\/(\d+)/.exec(route.request().url());
            const surah = Number(match?.[1] || 1);
            const total = surah === 1 ? 7 : 1;
            const audio_files = Array.from({ length: total }, (_, index) => ({
                verse_key: `${surah}:${index + 1}`,
                url: `https://verses.quran.com/test/${surah}-${index + 1}.mp3`,
                duration: 4000, segments: [[1, 0, 1000], [2, 1000, 2000]]
            }));
            return route.fulfill({
                status: 200, contentType: 'application/json', body: JSON.stringify({ audio_files })
            });
        });
        await page.goto(`${base}/quran.html`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.querySelectorAll('#audio-reciter option').length >= 1);
        const groupInfo = await page.evaluate(() => {
            const select = document.getElementById('audio-reciter');
            return {
                labels: [...select.querySelectorAll('optgroup')].map(group => group.label),
                mp3Options: [...select.options].filter(option => option.value.startsWith('mp3:')).length,
                alignedOptions: [...select.options].filter(option => option.value.startsWith('aligned:')).length
            };
        });
        assert.equal(groupInfo.labels.length, 1, 'mushaf offers only accurate verse-start readers');
        assert.equal(groupInfo.mp3Options, 0, 'untimed full-surah recordings belong to recitations');
        assert.ok(groupInfo.alignedOptions >= 1);
        assert.match(groupInfo.labels[0], /الاستماع من أي آية/);
        assert.equal(await page.locator('.audio-download-explanation').count(), 0);
        assert.equal(await page.locator('.audio-download-actions').isVisible(), false);
        await page.evaluate(() => {
            Object.defineProperty(navigator, 'onLine', { configurable:true, get:()=>false });
            window.mushafVerseActions = {
                getSelectedVerse: () => ({ surah:1,ayah:3,verseKey:'1:3' }),
                close() {}
            };
            document.querySelector('[data-verse-action="listen"]').click();
        });
        await page.waitForFunction(() =>
            document.getElementById('audio-mini-status').textContent === 'لا يوجد اتصال بالإنترنت.');
        assert.equal(await page.evaluate(() => window.quranAudioEngine.state.provider),'quran-foundation');
        assert.equal(await page.evaluate(() => window.quranAudioEngine.state.ayah),1);
        assert.equal(await page.locator('#audio-switch-notice').isHidden(),true);
        // The offline message must not switch to a downloaded sheikh or restart a surah.
        assert.equal(await page.locator('#audio-reciter option[value^="mp3:"]').count(),0);
        assert.deepEqual(errors, [], 'no browser errors');
        await page.close();
        console.log('PASS: only verse-aligned mushaf readers, concise offline notice, no download clutter or surah-start fallback');
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
