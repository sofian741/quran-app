// Focused visual-geometry regression for the opening page.
// QURAN_BROWSER_PATH=/usr/bin/chromium node tests/fatihah-layout.cjs
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
            ? '/quran.html'
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
        ...(process.env.QURAN_BROWSER_PATH || fs.existsSync('/usr/bin/chromium')
            ? { executablePath: process.env.QURAN_BROWSER_PATH || '/usr/bin/chromium' }
            : {}),
    });

    try {
        const page = await browser.newPage({ reducedMotion: 'reduce' });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const url = `http://127.0.0.1:${server.address().port}/quran.html`;

        async function openPage(pageNumber) {
            await page.goto(url);
            await page.evaluate(number => localStorage.setItem(
                'quranReaderState',
                JSON.stringify({ displayPage: number }),
            ), pageNumber);
            await page.reload();
            await page.waitForSelector('#loading-screen', { state: 'detached' });
            await page.evaluate(() => document.fonts.ready);
            await page.waitForFunction(() => (
                document.querySelector('#quran-text').dataset.layoutState === 'ready'
            ));
            return page.evaluate(() => {
                const text = document.querySelector('#quran-text');
                const bounds = text.getBoundingClientRect();
                const lines = [...text.querySelectorAll('.mushaf-line')];
                const heading = text.querySelector('.surah-heading').getBoundingClientRect();
                return {
                    fontSize: parseFloat(getComputedStyle(text).fontSize),
                    letterSpacing: getComputedStyle(text.querySelector('.mushaf-word')).letterSpacing,
                    containerGap: parseFloat(getComputedStyle(text).gap),
                    heading: [heading.x, heading.y, heading.width, heading.height],
                    words: [...text.querySelectorAll('.mushaf-word')].map(word => (
                        `${word.dataset.verse}:${word.dataset.word}`
                    )),
                    markerWidth: lines[0].querySelector('.ayah-marker')
                        ?.getBoundingClientRect().width,
                    ranges: lines.map(line => [
                        Number(line.dataset.start), Number(line.dataset.end),
                    ]),
                    lines: lines.map(line => {
                        const style = getComputedStyle(line);
                        const children = [...line.children].map(child => (
                            child.getBoundingClientRect()
                        ));
                        return {
                            fontSize: parseFloat(style.fontSize),
                            gap: parseFloat(style.columnGap),
                            justify: style.justifyContent,
                            transform: style.transform,
                            contentWidth: Math.max(...children.map(rect => rect.right)) -
                                Math.min(...children.map(rect => rect.left)),
                            outside: children.some(rect => (
                                rect.left < bounds.left - 1 || rect.right > bounds.right + 1
                            )),
                        };
                    }),
                };
            });
        }

        let checks = 0;
        for (const [width, height] of [[393, 852], [320, 568]]) {
            await page.setViewportSize({ width, height });
            const fatihah = await openPage(1);
            const baqarah = await openPage(2);
            const widths = fatihah.lines.map(line => line.contentWidth);

            assert.equal(fatihah.words.length, 29);
            assert.equal(new Set(fatihah.words).size, 29);
            assert.equal(fatihah.lines.length, 7);
            assert.ok(Math.abs(fatihah.fontSize - baqarah.fontSize) < 0.01);
            assert.equal(fatihah.letterSpacing, baqarah.letterSpacing);
            assert.equal(fatihah.letterSpacing, 'normal');
            assert.ok(Math.abs(fatihah.markerWidth - baqarah.markerWidth) < 0.01);
            assert.ok(Math.abs(fatihah.containerGap - baqarah.containerGap) < 0.01);
            assert.deepEqual(fatihah.heading, baqarah.heading);
            assert.ok(fatihah.lines.every(line => line.fontSize === fatihah.fontSize));
            assert.ok(fatihah.lines.every(line => line.justify === 'center'));
            assert.ok(fatihah.lines.every(line => line.transform === 'none'));
            assert.ok(fatihah.lines.every(line => !line.outside));
            assert.ok(fatihah.lines.every(line => (
                Math.abs(line.gap - baqarah.lines[0].gap) < 0.01
            )));
            assert.ok(widths[0] < widths[1] && widths[1] < widths[2]);
            assert.ok(Math.abs(widths[2] - widths[3]) < fatihah.fontSize * 0.5);
            assert.ok(widths[3] > widths[4] && widths[4] > widths[5] && widths[5] > widths[6]);
            assert.deepEqual(fatihah.ranges, [
                [0, 4], [4, 9], [9, 14], [14, 19], [19, 23], [23, 27], [27, 29],
            ]);
            checks++;
        }

        assert.deepEqual(errors, []);
        console.log(`PASS: ${checks} Fatihah/Baqarah responsive geometry checks.`);
    } finally {
        await browser.close();
        server.close();
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
