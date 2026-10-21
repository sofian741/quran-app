#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const types = {
    '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2',
};
const pages = [
    ['index.html', '.home-brand-mark svg'],
    ['quran.html', '.icon-button svg'],
    ['adhkar.html', '.brand-mark svg'],
    ['recitations.html', '.brand-mark svg'],
    ['library.html', '.brand-mark svg'],
    ['licenses.html', '.legal-back svg'],
];

(async () => {
    const server = http.createServer((request, response) => {
        const url = new URL(request.url, 'http://lan.quran.test');
        if (url.pathname === '/favicon.ico') { response.statusCode = 204; response.end(); return; }
        // Match the Android preparation step: tafsir is copied from scripts/
        // into www/data/, but this browser test serves the checkout root.
        if (url.pathname === '/data/tafsir_muyassar.json') {
            response.setHeader('Content-Type', 'application/json; charset=utf-8');
            response.end(fs.readFileSync(path.join(root, 'scripts/tafsir_muyassar.json')));
            return;
        }
        // Web preview intentionally has no native bundled-audio manifest.
        // Return a valid disabled manifest instead of an artificial 404;
        // actual Android QA verifies the complete 114-track pack separately.
        if (url.pathname === '/offline/mishary/manifest.json' ||
            url.pathname === '/offline/huthaifi/manifest.json') {
            response.setHeader('Content-Type', 'application/json; charset=utf-8');
            response.end('{"schemaVersion":0}');
            return;
        }
        const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
        const filename = path.join(root, decodeURIComponent(pathname));
        try {
            response.setHeader('Content-Type', types[path.extname(filename)] || 'application/octet-stream');
            response.end(fs.readFileSync(filename));
        } catch (_) { response.statusCode = 404; response.end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const browser = await chromium.launch({
        headless: true,
        executablePath: process.env.QURAN_BROWSER_PATH || '/usr/bin/chromium',
        args: ['--no-sandbox', '--no-proxy-server', '--host-resolver-rules=MAP lan.quran.test 127.0.0.1'],
    });

    try {
        for (const viewport of [{ width: 390, height: 844 }, { width: 1365, height: 768 }]) {
            const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
            for (const [filename, iconSelector] of pages) {
                const page = await context.newPage();
                const failed = [];
                const localAssets = [];
                const pageErrors = [];
                const consoleErrors = [];
                page.on('requestfailed', request => {
                    const url = new URL(request.url());
                    // The standalone web build intentionally has no optional
                    // Android-only offline manifests, and requests may abort
                    // when the browser closes a page after navigation. Only
                    // fail on essential entry-page/style/script/font assets.
                    if (url.hostname === 'lan.quran.test' &&
                        /\.(?:html|css|js|woff2)$/.test(url.pathname)) {
                        failed.push(`${request.url()} ${request.failure()?.errorText || ''}`);
                    }
                });
                page.on('response', response => {
                    const url = new URL(response.url());
                    if (url.hostname === 'lan.quran.test' && /\.(?:css|js|woff2)$/.test(url.pathname)) {
                        localAssets.push({ url: response.url(), status: response.status() });
                    }
                });
                page.on('pageerror', error => pageErrors.push(error.message));
                page.on('console', message => {
                    if (message.type() === 'error') consoleErrors.push(message.text());
                });
                await page.goto(`http://lan.quran.test:${port}/${filename}`, { waitUntil: 'domcontentloaded' });
                if (filename === 'quran.html') {
                    await page.waitForSelector('#loading-screen', { state: 'detached' });
                } else {
                    await page.waitForTimeout(180);
                }

                const result = await page.evaluate(selector => {
                    const icon = document.querySelector(selector);
                    const rect = icon?.getBoundingClientRect();
                    return {
                        stylesheets: [...document.styleSheets].map(sheet => sheet.href).filter(Boolean),
                        icon: rect ? { width: rect.width, height: rect.height } : null,
                        horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
                    };
                }, iconSelector);
                assert.deepEqual(failed, [], `${filename} ${viewport.width}px failed local assets`);
                assert.deepEqual(pageErrors, [], `${filename} ${viewport.width}px page errors`);
                assert.deepEqual(consoleErrors, [], `${filename} ${viewport.width}px console errors`);
                assert.ok(result.stylesheets.length > 0, `${filename} has no applied CSS`);
                result.stylesheets.forEach(url => assert.match(url, /^http:\/\/lan\.quran\.test:/));
                assert.ok(localAssets.some(asset => /\.css$/.test(new URL(asset.url).pathname) && asset.status === 200),
                    `${filename} CSS did not return 200`);
                assert.ok(localAssets.some(asset => /\.js$/.test(new URL(asset.url).pathname) && asset.status === 200),
                    `${filename} JavaScript did not return 200`);
                assert.ok(result.icon && result.icon.width > 0 && result.icon.width < 100 &&
                    result.icon.height > 0 && result.icon.height < 100,
                `${filename} icon is unstyled: ${JSON.stringify(result.icon)}`);
                assert.equal(result.horizontalOverflow, false, `${filename} horizontal overflow`);
                await page.close();
            }
            await context.close();
        }
        console.log('PASS: six entry pages load HTTP CSS/JS on a non-loopback LAN origin at mobile and desktop sizes; SVG icons remain bounded.');
    } finally {
        await browser.close();
        server.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });

