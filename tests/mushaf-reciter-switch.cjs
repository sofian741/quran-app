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
        await page.waitForFunction(() => !!document.querySelector('#audio-reciter option[value="mp3:123"]'));
        const groupInfo = await page.evaluate(() => {
            const select = document.getElementById('audio-reciter');
            return {
                labels: [...select.querySelectorAll('optgroup')].map(group => group.label),
                mp3Options: [...select.options].filter(option => option.value.startsWith('mp3:')).length,
                alignedOptions: [...select.options].filter(option => option.value.startsWith('aligned:')).length
            };
        });
        assert.equal(groupInfo.labels.length, 2, 'two clearly separated reader groups');
        assert.equal(groupInfo.mp3Options, 2);
        assert.equal(groupInfo.alignedOptions, 23);
        assert.match(groupInfo.labels[0], /المتزامنون/);
        assert.match(groupInfo.labels[1], /تظليل الآيات حسب التسجيل/);

        // The Quran page can keep its reader loading overlay visible while
        // unrelated remote Quran text loads. Exercise the audio controls
        // directly without requiring the entire reader layout to finish.
        await page.evaluate(() => {
            document.getElementById('audio-open-options').click();
            document.getElementById('audio-reciter-trigger').click();
        });
        await page.waitForFunction(() => !!document.querySelector('.audio-picker-group-heading'));
        assert.equal(await page.locator('.audio-picker-group-heading').count(), 2);
        assert.match(await page.locator('.audio-picker-group-caption').textContent(), /لن يتغير القارئ تلقائيًا/);
        await page.evaluate(() => {
            const select = document.getElementById('audio-reciter');
            select.value = 'mp3:123';
            select.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await page.waitForFunction(() => window.quranAudioEngine.state.provider === 'mp3quran');
        assert.equal(await page.evaluate(() => window.quranAudioEngine.state.reciterName),
            'قارئ تجريبي غير متزامن');
        assert.match(await page.locator('#audio-sync-note').textContent(), /دون تحويل عشوائي/);
        // No saved recording + no internet: show a clear offline message,
        // keep the selected sheikh, and never force Mishary.
        await page.evaluate(() => {
            Object.defineProperty(navigator, 'onLine', { configurable:true, get:()=>false });
            window.mushafVerseActions = {
                getSelectedVerse: () => ({ surah: 1, ayah: 3, verseKey: '1:3' }),
                close() {}
            };
            document.querySelector('[data-verse-action="listen"]').click();
        });
        await page.waitForFunction(() =>
            !document.getElementById('audio-switch-notice').hidden &&
            /غير متصل بالإنترنت/.test(
                document.getElementById('audio-switch-notice-message').textContent));
        assert.equal(await page.evaluate(() => window.quranAudioEngine.state.reciterId), 123);
        assert.equal(await page.evaluate(() => window.quranAudioEngine.state.provider), 'mp3quran');
        assert.match(await page.locator('#audio-switch-notice-message').textContent(), /حمّل/);
        await page.evaluate(() => document.getElementById('audio-switch-notice-dismiss').click());

        // The user has now downloaded the exact Huthaifi MP3Quran recording.
        // QUD locally supplies word timings for the same recording URL.
        await page.evaluate(() => {
            const dm = window.QuranDownloads.DownloadManager.prototype;
            dm.list = () => [{
                url:'https://server9.mp3quran.net/hthfi/001.mp3',
                provider:'mp3quran',reciterId:9004,reciterName:'علي بن عبد الرحمن الحذيفي',
                surah:1,moshafId:9004,moshafName:'حفص',savedAt:100
            }];
            dm.has = async url => url === 'https://server9.mp3quran.net/hthfi/001.mp3';
            document.querySelector('[data-verse-action="listen"]').click();
        });
        await page.waitForFunction(() =>
            window.quranAudioEngine.state.provider === 'quran-foundation' &&
            window.quranAudioEngine.state.reciterId === 9004 &&
            window.quranAudioEngine.state.ayah === 3, { timeout: 30000 });
        assert.match(await page.locator('#audio-reader-name').textContent(), /الحذيفي/);
        assert.match(await page.locator('#audio-switch-notice-message').textContent(), /المحفوظ عندك/);
        assert.equal(await page.evaluate(() => window.quranAudioEngine.state.reciterId === 7),false);
        await page.evaluate(() => document.getElementById('audio-switch-notice-dismiss').click());
        assert.equal(await page.locator('#audio-switch-notice').isHidden(), true);
        assert.deepEqual(errors, [], 'no browser errors');
        await page.close();
        console.log('PASS: 23 synchronized + MP3Quran library, explicit offline notice, saved QUD word-timed verse playback, no forced Mishary');
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
