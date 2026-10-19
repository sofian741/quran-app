#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const base = process.env.QURAN_BASE_URL || 'http://127.0.0.1:4173';
const executablePath = process.env.QURAN_BROWSER_PATH || '/usr/bin/chromium';

(async () => {
    const browser = await chromium.launch({ headless: true, executablePath, args: ['--no-sandbox'] });
    try {
        for (const { width, height, minFont } of [
            { width: 320, height: 640, minFont: 16 },
            { width: 390, height: 844, minFont: 20 },
            { width: 430, height: 932, minFont: 21 },
            { width: 768, height: 1024, minFont: 22 }
        ]) {
            const page = await browser.newPage({
                viewport: { width, height }, serviceWorkers: 'block'
            });
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.goto(base + '/quran.html', { waitUntil: 'domcontentloaded' });
            await page.waitForFunction(() =>
                !!window.mushafReader && document.querySelector('#quran-text .mushaf-word') &&
                document.querySelector('#quran-text').dataset.layoutState === 'ready', null, { timeout: 30000 });

            for (const number of [3, 100, 604]) {
                const changed = await page.evaluate(pageNumber => window.mushafReader.goToPage(pageNumber), number);
                assert.equal(changed, true, 'navigation to page ' + number);
                await page.waitForFunction(pageNumber =>
                    window.mushafReader.getCurrentPage() === pageNumber &&
                    document.querySelector('#quran-text').dataset.layoutState === 'ready' &&
                    document.querySelector('#quran-text').dataset.standardLayoutPage === String(pageNumber),
                    number, { timeout: 15000 });
                const metrics = await page.evaluate(() => {
                    const root = document.getElementById('quran-text');
                    const bounds = root.getBoundingClientRect();
                    const lines = [...root.querySelectorAll('.mushaf-line')];
                    const wordRects = [...root.querySelectorAll('.mushaf-word')].map(word => word.getBoundingClientRect());
                    const overflow = wordRects.reduce((max, rect) =>
                        Math.max(max, bounds.left - rect.left, rect.right - bounds.right), 0);
                    return {
                        font: parseFloat(getComputedStyle(root).fontSize),
                        lineCount: lines.length,
                        wordCount: wordRects.length,
                        overflow: Number(overflow.toFixed(2)),
                        width: bounds.width,
                        height: bounds.height
                    };
                });
                assert.ok(metrics.font >= minFont,
                    `font too small at ${width}px page ${number}: ${JSON.stringify(metrics)}`);
                assert.ok(metrics.wordCount > 15, 'Quran words must render');
                assert.ok(metrics.lineCount >= 5, 'Mushaf lines must render');
                assert.ok(metrics.overflow <= 6,
                    `Quran glyphs overflow at ${width}px page ${number}: ${JSON.stringify(metrics)}`);
                console.log('PASS', width + 'x' + height, 'page', number, JSON.stringify(metrics));
            }
            // Regression: the synchronized reciter's verse band cannot change
            // Quran glyph spacing or kashidas when the font is refitted.
            if (width === 390) {
                await page.evaluate(async () => {
                    window.mushafReader.goToPage(3);
                    await document.fonts.ready;
                    document.fonts.dispatchEvent(new Event('loadingdone'));
                });
                await page.waitForFunction(() => document.querySelector('#quran-text')?.dataset.standardLayoutPage === '3');
                const baseline = await page.evaluate(() =>
                    [...document.querySelectorAll('#quran-text .mushaf-line')].map(line => ({
                        gap: line.style.columnGap,
                        transform: line.style.transform,
                        text: [...line.querySelectorAll('.mushaf-word')].map(word => word.textContent).join('|')
                    })));
                await page.evaluate(() => {
                    const line = document.querySelector('#quran-text .mushaf-line');
                    const band = document.createElement('span');
                    band.className = 'audio-verse-band';
                    band.style.cssText = 'left:0;top:0;width:900px;height:20px';
                    line.appendChild(band);
                    document.fonts.dispatchEvent(new Event('loadingdone'));
                });
                await page.waitForFunction(() => document.querySelector('#quran-text')?.dataset.standardLayoutPage === '3');
                const withBand = await page.evaluate(() =>
                    [...document.querySelectorAll('#quran-text .mushaf-line')].map(line => ({
                        gap: line.style.columnGap,
                        transform: line.style.transform,
                        text: [...line.querySelectorAll('.mushaf-word')].map(word => word.textContent).join('|')
                    })));
                assert.deepEqual(withBand, baseline,
                    'reciter highlight band must never alter text, kashida or line geometry');
            }
            assert.deepEqual(errors, [], 'browser JavaScript errors');
            await page.close();
        }
        console.log('PASS: Quran glyphs visibly larger on phones with original 604-page layout intact');
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
