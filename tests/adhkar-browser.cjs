#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const base = process.env.QURAN_BASE_URL || 'http://127.0.0.1:4173';

(async () => {
    const browser = await chromium.launch({ headless: true, executablePath: process.env.QURAN_BROWSER_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/adhkar.html`);
    await page.waitForFunction(() => document.querySelectorAll('#chapter-list .chapter').length === 133);
    assert.match(await page.locator('#stat-items').innerText(), /٣٠٢/);

    await page.fill('#search', 'الصباح');
    assert.ok(await page.locator('#chapter-list .chapter').count() > 0);
    await page.fill('#search', '');
    await page.locator('[data-open-title="أذكار الصباح"]').click();
    await page.waitForSelector('#reader:not([hidden])');
    assert.ok((await page.locator('#dhikr-text').innerText()).trim().length > 10);
    const before = await page.locator('#tasbih-current').innerText();
    await page.click('#tasbih');
    const after = await page.locator('#tasbih-current').innerText();
    assert.notEqual(after, before);
    assert.ok(await page.evaluate(() => JSON.parse(localStorage.adhkarProgressV2).values));

    await page.click('#reader-favorite');
    assert.equal(await page.getAttribute('#reader-favorite', 'aria-pressed'), 'true');
    await page.click('#close-reader');
    await page.click('[data-filter="saved"]');
    assert.ok(await page.locator('#chapter-list .chapter').count() >= 1);

    await page.click('#theme');
    assert.equal(await page.locator('body').evaluate(body => body.classList.contains('dark')), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    await browser.close();
    console.log('PASS: adhkar search, chapter reader, counter persistence, favorites, dark mode, and mobile width.');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
