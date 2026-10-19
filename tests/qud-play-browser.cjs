#!/usr/bin/env node
'use strict';
// This verifies the *real* main-branch QUD metadata and the Play button in
// Chromium. Media elements are mocked: external stream host uptime is not.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = process.env.QURAN_BASE_URL || 'http://127.0.0.1:4173';
const executablePath = process.env.QURAN_BROWSER_PATH || '/usr/bin/chromium';

(async () => {
    const browser = await chromium.launch({ headless: true, executablePath, args: ['--no-sandbox'] });
    try {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(() => {
            localStorage.clear();
            const states = new WeakMap();
            const getState = el => {
                if (!states.has(el)) states.set(el, { paused: true, time: 0 });
                return states.get(el);
            };
            Object.defineProperties(HTMLMediaElement.prototype, {
                paused: { configurable: true, get() { return getState(this).paused; } },
                currentTime: {
                    configurable: true,
                    get() { return getState(this).time; },
                    set(value) { getState(this).time = Number(value) || 0; }
                },
                duration: { configurable: true, get() { return 190; } },
                readyState: { configurable: true, get() { return 4; } }
            });
            HTMLMediaElement.prototype.load = function() {
                this.dispatchEvent(new Event('loadstart'));
                queueMicrotask(() => this.dispatchEvent(new Event('loadedmetadata')));
            };
            HTMLMediaElement.prototype.play = function() {
                getState(this).paused = false;
                this.dispatchEvent(new Event('play'));
                this.dispatchEvent(new Event('playing'));
                return Promise.resolve();
            };
            HTMLMediaElement.prototype.pause = function() {
                const state = getState(this);
                const wasPaused = state.paused;
                state.paused = true;
                if (!wasPaused) this.dispatchEvent(new Event('pause'));
            };
        });
        await page.route('https://mp3quran.net/api/**', route => route.fulfill({
            status: 200, contentType: 'application/json', body: JSON.stringify({ reciters: [] })
        }));
        await page.goto(base + '/quran.html', { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.QuranQud?.reciters?.length === 22 &&
            window.quranAudioEngine && document.querySelector('#audio-reciter option[value="aligned:9000"]'),
            null, { timeout: 30000 });

        // Different recordings/providers: quranicaudio, tarteel, TVQuran, archive.org.
        for (const id of [9000, 9001, 9016, 9017]) {
            await page.evaluate(id => {
                window.quranAudioEngine.pause();
                const picker = document.getElementById('audio-reciter');
                picker.value = 'aligned:' + id;
                picker.dispatchEvent(new Event('change', { bubbles: true }));
            }, id);
            await page.waitForFunction(id => {
                const e = window.quranAudioEngine;
                return e.state.reciterId === id &&
                    ['ready', 'error'].includes(e.status);
            }, id, { timeout: 35000 });
            const prepared = await page.evaluate(() => {
                const e = window.quranAudioEngine;
                return { id: e.state.reciterId, status: e.status,
                    error: e.error, track: e.trackUrl, reciter: e.state.reciterName };
            });
            assert.equal(prepared.status, 'ready',
                'Metadata for ' + id + ': ' + JSON.stringify(prepared));
            assert.ok(/^https:\/\//.test(prepared.track), 'real chapter stream URL available: ' + id);
            await page.evaluate(() => document.getElementById('audio-play').click());
            await page.waitForFunction(() =>
                window.quranAudioEngine.status === 'playing', null, { timeout: 10000 });
            assert.equal(await page.locator('#audio-play').getAttribute('aria-label'), 'إيقاف مؤقت');
            console.log('PASS Chrome Play button for', id, prepared.reciter);
        }
        assert.deepEqual(errors, [], 'browser JavaScript errors during QUD switch/play');
        await page.close();
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
