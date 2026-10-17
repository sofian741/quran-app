#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const base = process.env.QURAN_BASE_URL || 'http://127.0.0.1:4173';

(async () => {
    const browser = await chromium.launch({ headless: true, executablePath: process.env.QURAN_BROWSER_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
    await page.addInitScript(() => {
        HTMLElement.prototype.setPointerCapture = function setPointerCapture() {};
        HTMLElement.prototype.releasePointerCapture = function releasePointerCapture() {};
    });
    await page.goto(`${base}/quran.html`);
    await page.waitForFunction(() => document.querySelector('#quran-text')?.dataset.layoutState === 'ready');
    await page.evaluate(() => localStorage.setItem('quranReaderState', JSON.stringify({ displayPage: 223 })));
    await page.reload();
    await page.waitForFunction(() => window.mushafReader?.getCurrentPage() === 223 && document.querySelector('#quran-text')?.dataset.layoutState === 'ready');

    const drag = () => page.evaluate(() => {
        const stage = document.querySelector('#reader-stage');
        const rect = stage.getBoundingClientRect();
        const event = (type, x) => stage.dispatchEvent(new PointerEvent(type, {
            bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 9,
            clientX: x, clientY: rect.top + rect.height / 2, button: 0
        }));
        event('pointerdown', rect.left + rect.width * .25);
        event('pointermove', rect.left + rect.width * .75);
        event('pointerup', rect.left + rect.width * .75);
    });

    await page.evaluate(() => {
        Object.defineProperty(window.visualViewport, 'scale', { configurable: true, get: () => 1.5 });
        window.visualViewport.dispatchEvent(new Event('resize'));
    });
    await drag();
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => window.mushafReader.getCurrentPage()), 223, 'zoomed drag must pan, not turn the page');
    assert.equal(await page.locator('body').evaluate(body => body.classList.contains('is-pinch-panning')), true);

    await page.evaluate(() => {
        Object.defineProperty(window.visualViewport, 'scale', { configurable: true, get: () => 1 });
        window.visualViewport.dispatchEvent(new Event('resize'));
    });
    await drag();
    await page.waitForFunction(() => window.mushafReader.getCurrentPage() !== 223);
    assert.equal(await page.locator('body').evaluate(body => body.classList.contains('is-pinch-panning')), false);
    await browser.close();
    console.log('PASS: page turns are blocked above native zoom threshold and restored at scale 1.');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
