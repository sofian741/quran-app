#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');

(async () => {
    const server = http.createServer((request, response) => {
        const pathname = new URL(request.url, 'http://localhost').pathname === '/'
            ? '/index.html' : new URL(request.url, 'http://localhost').pathname;
        try { response.end(fs.readFileSync(path.join(root, decodeURIComponent(pathname)))); }
        catch (_) { response.statusCode = 404; response.end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const browser = await chromium.launch({
        headless: true,
        ...(process.env.QURAN_BROWSER_PATH || fs.existsSync('/usr/bin/chromium')
            ? { executablePath: process.env.QURAN_BROWSER_PATH || '/usr/bin/chromium' } : {}),
    });
    try {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const origin = `http://127.0.0.1:${server.address().port}`;
        await page.goto(`${origin}/quran.html`);
        await page.waitForSelector('#loading-screen', { state: 'detached' });
        await page.evaluate(() => {
            localStorage.clear();
            localStorage.setItem('quranReaderState', JSON.stringify({ displayPage: 2 }));
        });
        await page.reload();
        await page.waitForFunction(() => window.mushafReader?.getCurrentPage() === 2 &&
            document.querySelector('#quran-text')?.dataset.layoutState === 'ready');

        await page.evaluate(() => document.querySelector('#open-index').click());
        await page.waitForSelector('#index-sheet.is-open');
        assert.equal(await page.locator('#index-list .index-entry').count(), 114);
        await page.evaluate(() => document.querySelector('#close-index').click());

        await page.evaluate(() => document.querySelector('#toggle-page-marker').click());
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.quranPageMarkerV1)), 2);
        assert.equal(await page.locator('#toggle-page-marker').getAttribute('aria-pressed'), 'true');

        const selectedKey = await page.locator('.mushaf-word[data-verse]').first().getAttribute('data-verse');
        await page.locator('.mushaf-word[data-verse]').first().dispatchEvent('pointerdown', {
            pointerId: 41, pointerType: 'mouse', button: 0, clientX: 200, clientY: 300,
        });
        await page.waitForSelector('#verse-actions-sheet.is-open');
        await page.evaluate(() => document.querySelector('[data-verse-action="bookmark"]').click());
        await page.evaluate(() => document.querySelector('[data-verse-action="reading-marker"]').click());
        assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.quranVerseFavoritesV1)), [selectedKey]);
        assert.equal(await page.evaluate(() => {
            const marker = JSON.parse(localStorage.quranReadingMarkerV1);
            return `${marker.surah}:${marker.ayah}`;
        }), selectedKey);

        await page.evaluate(() => document.querySelector('[data-verse-action="tafsir"]').click());
        await page.waitForSelector('#tafsir-sheet.is-open');
        await page.waitForFunction(() => {
            const node = document.querySelector('#tafsir-explanation');
            return node && !node.hidden && node.textContent.trim().length > 20;
        });
        await page.evaluate(() => document.querySelector('#close-tafsir').click());

        await page.evaluate(() => document.querySelector('#open-settings').click());
        await page.evaluate(() => document.querySelector('#open-quran-search').click());
        await page.waitForSelector('#quran-search-sheet.is-open');
        await page.locator('#quran-search-input').fill('الحمد لله');
        await page.waitForFunction(() => document.querySelectorAll('.quran-search-result').length > 0);
        assert.match(await page.locator('#quran-search-status').innerText(), /تم العثور/);
        await page.evaluate(() => document.querySelector('.quran-search-go').click());
        await page.waitForFunction(() => document.querySelectorAll('.mushaf-word.is-search-target').length > 0);

        await page.evaluate(() => document.querySelector('#open-settings').click());
        await page.evaluate(() => document.querySelector('[data-theme-choice="dark"]').click());
        assert.equal(await page.locator('body').getAttribute('data-theme'), 'dark');
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.quranReaderSettings).theme), 'dark');
        await page.evaluate(() => document.querySelector('#close-settings').click());
        await page.reload();
        await page.waitForSelector('#loading-screen', { state: 'detached' });
        assert.equal(await page.locator('body').getAttribute('data-theme'), 'dark');

        await page.evaluate(() => document.querySelector('#open-settings').click());
        await page.evaluate(() => document.querySelector('#open-saved').click());
        await page.waitForSelector('#saved-sheet.is-open');
        assert.equal(await page.locator('#saved-list .saved-item').count(), 1);
        await page.evaluate(() => document.querySelector('#saved-tab-marker').click());
        assert.equal(await page.locator('#saved-list .saved-item').count(), 1);
        await page.evaluate(() => document.querySelector('#saved-tab-page').click());
        assert.match(await page.locator('#saved-list').innerText(), /فاصلة الصفحة/);

        assert.deepEqual(errors, []);
        console.log('PASS: Quran index, search, tafsir, favorites, verse/page markers, and dark-theme persistence.');
    } finally {
        await browser.close();
        server.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });

