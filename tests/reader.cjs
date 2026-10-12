// Optional browser smoke test.
// npm install --no-save playwright
// QURAN_BROWSER_PATH=/usr/bin/chromium node tests/reader.cjs
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');

(async () => {
    const server = http.createServer((request, response) => {
        const pathname = request.url.split('?')[0] === '/'
            ? '/index.html'
            : request.url.split('?')[0];
        const filename = path.join(root, pathname);

        try {
            response.end(fs.readFileSync(filename));
        } catch (_) {
            response.statusCode = 404;
            response.end();
        }
    });

    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const browser = await chromium.launch({
        headless: true,
        ...(process.env.QURAN_BROWSER_PATH
            ? { executablePath: process.env.QURAN_BROWSER_PATH }
            : {})
    });

    try {
        const page = await browser.newPage({ reducedMotion: 'reduce' });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const url = `http://127.0.0.1:${server.address().port}/quran.html`;
        const samples = [1, 2, 50, 77, 223, 586, 587, 604];
        let checks = 0;

        for (const [width, height] of [[320, 568], [390, 844], [430, 932]]) {
            await page.setViewportSize({ width, height });

            for (const pageNumber of samples) {
                await page.goto(url);
                await page.evaluate(number => {
                    localStorage.setItem(
                        'quranReaderState',
                        JSON.stringify({ displayPage: number }),
                    );
                }, pageNumber);
                await page.reload();
                await page.waitForSelector('#loading-screen', { state: 'detached' });
                await page.evaluate(() => document.fonts.ready);
                await page.waitForTimeout(80);

                const result = await page.evaluate(() => {
                    const text = document.querySelector('#quran-text');
                    const bounds = text.getBoundingClientRect();
                    const words = [...text.querySelectorAll('.mushaf-word')];
                    return {
                        rows: text.children.length,
                        words: words.length,
                        markers: text.querySelectorAll('.ayah-marker').length,
                        outside: words.filter(word => {
                            const rect = word.getBoundingClientRect();
                            return rect.left < bounds.left - 1 || rect.right > bounds.right + 1;
                        }).length,
                        overflowX: getComputedStyle(text).overflowX,
                    };
                });

                assert.ok(result.rows >= 8 && result.rows <= 16);
                assert.ok(result.words > 0 && result.markers > 0);
                assert.equal(result.outside, 0);
                assert.equal(result.overflowX, 'hidden');
                checks++;
            }
        }

        await page.evaluate(() => {
            localStorage.setItem('quranReaderState', JSON.stringify({ displayPage: 2 }));
        });
        await page.reload();
        await page.waitForSelector('#loading-screen', { state: 'detached' });
        await page.evaluate(() => window.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowLeft' }),
        ));
        assert.equal(
            await page.evaluate(() => JSON.parse(localStorage.quranReaderState).displayPage),
            3,
        );
        assert.deepEqual(errors, []);
        console.log(`PASS: ${checks} responsive page checks; navigation persistence; no page errors.`);
    } finally {
        await browser.close();
        server.close();
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
