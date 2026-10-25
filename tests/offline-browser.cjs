#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain', '.woff2': 'font/woff2' };

(async () => {
    const server = http.createServer((request, response) => {
        const pathname = new URL(request.url, 'http://localhost').pathname === '/'
            ? '/index.html' : new URL(request.url, 'http://localhost').pathname;
        const filename = path.join(root, decodeURIComponent(pathname));
        try {
            response.setHeader('Content-Type', types[path.extname(filename)] || 'application/octet-stream');
            response.end(fs.readFileSync(filename));
        } catch (_) {
            response.statusCode = 404;
            response.end();
        }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const browser = await chromium.launch({ headless: true, executablePath: process.env.QURAN_BROWSER_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'allow' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const origin = `http://127.0.0.1:${server.address().port}`;

    try {
        await page.goto(`${origin}/index.html`);
        await page.evaluate(async () => {
            await window.quranServiceWorkerReady;
            await navigator.serviceWorker.ready;
        });
        await page.reload();
        await page.waitForFunction(() => !!navigator.serviceWorker.controller);
        const cached = await page.evaluate(async () => {
            const cache = await caches.open('quran-reader-shell-v68');
            return Promise.all([
                cache.match('./quran.html').then(Boolean),
                cache.match('./data/quran-uthmani.txt').then(Boolean),
                cache.match('./data/adhkar.json').then(Boolean),
                cache.match('./mushaf-layout-prewarm-worker.js').then(Boolean),
                cache.match('./licenses.html').then(Boolean),
                cache.match('./legal.css').then(Boolean)
            ]);
        });
        assert.deepEqual(cached, [true, true, true, true, true, true]);
        await page.evaluate(async () => {
            const cache = await caches.open('quran-recitation-audio-v1');
            await cache.put(new URL('./offline-test.mp3', location.href).href,
                new Response('0123456789', { headers: { 'content-type': 'audio/mpeg' } }));
        });

        await context.setOffline(true);
        const ranged = await page.evaluate(async () => {
            const response = await fetch('./offline-test.mp3', { headers: { Range: 'bytes=2-5' } });
            return { status: response.status, range: response.headers.get('content-range'), body: await response.text() };
        });
        assert.deepEqual(ranged, { status: 206, range: 'bytes 2-5/10', body: '2345' });
        await page.goto(`${origin}/index.html`);
        await page.waitForFunction(() => document.querySelector('.home-verse blockquote')?.textContent.trim().length > 10);

        await page.goto(`${origin}/quran.html`);
        await page.waitForFunction(() => document.querySelector('#quran-text')?.dataset.layoutState === 'ready');
        assert.ok(await page.locator('.mushaf-word').count() > 0);

        await page.goto(`${origin}/adhkar.html`);
        await page.waitForFunction(() => document.querySelectorAll('#chapter-list .chapter').length === 133);

        await page.goto(`${origin}/recitations.html`);
        await page.waitForFunction(() => !document.querySelector('#reload-catalog')?.disabled);
        assert.match(await page.locator('#catalog-status').innerText(), /تحقق من الإنترنت|محفوظة/);

        await page.goto(`${origin}/library.html`);
        await page.waitForSelector('#library-content', { state: 'attached' });
        assert.equal(await page.locator('#library-empty').isVisible(), true);

        await page.goto(`${origin}/licenses.html`);
        assert.match(await page.locator('h1').innerText(), /المصادر والتراخيص/);
        assert.deepEqual(errors, []);
        console.log('PASS: home, Quran, adhkar, recitations catalog, fonts/data, library, and legal notices reopen fully offline.');
    } finally {
        await context.setOffline(false).catch(() => {});
        await browser.close();
        server.close();
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
