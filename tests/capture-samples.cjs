'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const output = path.join(root, 'artifacts', 'mushaf-screenshots');
const samples = [
    [207, 'page-207-before-yunus'],
    [208, 'page-208-yunus-start'],
    [223, 'page-223-long-surah'],
    [602, 'page-602-multiple-surahs'],
];

(async () => {
    fs.mkdirSync(output, { recursive: true });
    const server = http.createServer((request, response) => {
        const pathname = request.url.split('?')[0] === '/'
            ? '/index.html'
            : request.url.split('?')[0];
        try {
            response.end(fs.readFileSync(path.join(root, pathname)));
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
            : {}),
    });

    try {
        const page = await browser.newPage({
            reducedMotion: 'reduce',
            viewport: { width: 390, height: 844 },
            deviceScaleFactor: 1,
        });
        const url = `http://127.0.0.1:${server.address().port}/quran.html`;
        for (const [pageNumber, label] of samples) {
            await page.goto(url);
            await page.evaluate(number => localStorage.setItem(
                'quranReaderState',
                JSON.stringify({ displayPage: number }),
            ), pageNumber);
            await page.reload();
            await page.waitForSelector('#loading-screen', { state: 'detached' });
            await page.evaluate(() => document.fonts.ready);
            await page.waitForFunction(
                number => (
                    document.querySelector('#quran-text').dataset.layoutState === 'ready' &&
                    JSON.parse(localStorage.quranReaderState).displayPage === number
                ),
                pageNumber,
            );
            await page.screenshot({
                path: path.join(output, `${label}-390x844.png`),
                fullPage: true,
            });
        }
        console.log(`PASS: saved ${samples.length} screenshots in ${output}`);
    } finally {
        await browser.close();
        server.close();
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
