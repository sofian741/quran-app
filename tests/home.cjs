// Optional browser smoke test for the home page and reflection deep links.
// npm install --no-save playwright
// QURAN_BROWSER_PATH=/usr/bin/chromium node tests/home.cjs
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
        ...(process.env.QURAN_BROWSER_PATH || fs.existsSync('/usr/bin/chromium')
            ? { executablePath: process.env.QURAN_BROWSER_PATH || '/usr/bin/chromium' }
            : {})
    });

    try {
        const page = await browser.newPage({
            reducedMotion: 'reduce',
            viewport: { width: 390, height: 844 }
        });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));

        const origin = `http://127.0.0.1:${server.address().port}`;
        await page.goto(`${origin}/index.html`);

        assert.equal(await page.locator('text=السلام عليكم').count(), 0);
        assert.equal(await page.locator('text=صدقة جارية').count(), 0);
        assert.equal(await page.locator('text=قريبًا').count(), 0);
        assert.match(await page.locator('#home-verse-title').innerText(), /آية للتدبّر/);
        assert.equal(await page.locator('.home-verse-action').count(), 2);
        await page.waitForFunction(() => /#verse=\d+:\d+$/.test(
            document.querySelector('.home-verse-action.is-primary')?.getAttribute('href') || ''
        ));
        const reflectionHref = await page.locator('.home-verse-action.is-primary').getAttribute('href');
        const reflectionMatch = /#verse=(\d+):(\d+)$/.exec(reflectionHref);
        assert.ok(reflectionMatch, 'daily reflection must link to one Quran verse');
        const reflectionKey = `${reflectionMatch[1]}:${reflectionMatch[2]}`;
        assert.equal(
            new URL(await page.locator('.home-verse-action').nth(1).getAttribute('href'), origin).hash,
            `#verse=${reflectionKey}&action=tafsir`
        );
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

        await page.locator('.home-verse-action.is-primary').click();
        await page.waitForSelector('#loading-screen', { state: 'detached' });
        await page.waitForFunction(() => document.querySelector('#quran-text')?.dataset.layoutState === 'ready');
        await page.waitForFunction(() => document.querySelectorAll('.mushaf-word.is-search-target').length > 0);
        const target = await page.evaluate(([surah, ayah]) => ({
            current: window.mushafReader.getCurrentPage(),
            expected: window.mushafReader.findVersePage(Number(surah), Number(ayah)),
            keys: [...document.querySelectorAll('.mushaf-word.is-search-target')]
                .map(word => word.dataset.verse),
            hash: window.location.hash
        }), reflectionKey.split(':'));
        assert.equal(target.current, target.expected);
        assert.ok(target.keys.length > 0);
        assert.equal(target.keys.every(key => key === reflectionKey), true);
        assert.equal(target.hash, '');

        await page.goto(`${origin}/index.html`);
        await page.locator('.home-verse-action').nth(1).click();
        await page.waitForSelector('#loading-screen', { state: 'detached' });
        await page.waitForSelector('#tafsir-sheet.is-open');
        await page.waitForFunction(() => {
            const explanation = document.querySelector('#tafsir-explanation');
            return explanation && !explanation.hidden && explanation.textContent.trim().length > 0;
        });
        assert.equal(
            (await page.locator('#tafsir-reference').innerText()).includes(
                String(reflectionMatch[2]).replace(/\d/g, digit => '٠١٢٣٤٥٦٧٨٩'[Number(digit)])
            ),
            true
        );
        assert.equal(await page.evaluate(() => window.location.hash), '');
        assert.deepEqual(errors, []);

        console.log('PASS: focused home UI, verse navigation and tafsir deep link.');
    } finally {
        await browser.close();
        server.close();
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
