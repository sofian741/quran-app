const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

let chromium;
try {
    ({ chromium } = require('playwright'));
} catch (_) {
    ({ chromium } = require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
}

const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2' };
const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        response.writeHead(404).end('Not found');
        return;
    }
    response.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(response);
});

const visibleStep = async page => {
    await page.waitForSelector('#ayat-tour-root:not([hidden]) > .ayat-tour-card:not([hidden])');
    return page.locator('#ayat-tour-root > .ayat-tour-card .ayat-tour-title').textContent();
};

async function testFullJourney(browser, origin) {
    const context = await browser.newContext({ viewport: { width: 393, height: 852 } });
    const page = await context.newPage();
    await page.goto(`${origin}/index.html?ayatTour=general&ayatStep=2`);
    assert.equal(await visibleStep(page), 'فين تلاقي التلاوات؟');

    await page.locator('.ayat-tour-hit').click();
    await page.waitForURL(/recitations\.html/);
    assert.equal(await visibleStep(page), 'اختار صوت القارئ اللي تحبه');

    for (const title of ['القارئ والسورة', 'اسمع من غير إنترنت', 'ادخل مكتبتك الصوتية']) {
        await page.locator('#ayat-tour-root > .ayat-tour-card [data-tour-action="next"]').click();
        assert.equal(await visibleStep(page), title);
    }
    await page.locator('.ayat-tour-hit').click();
    await page.waitForURL(/library\.html/);
    assert.equal(await visibleStep(page), 'رتّب مكتبتك بسهولة');

    await page.locator('#ayat-tour-root > .ayat-tour-card [data-tour-action="next"]').click();
    assert.equal(await visibleStep(page), 'افتح قسم الأذكار');
    await page.locator('.ayat-tour-hit').click();
    await page.waitForURL(/adhkar\.html/);
    assert.equal(await visibleStep(page), 'ابدأ بأذكار الصباح');
    await context.close();
}

async function testQuranTourFromSettings(browser, origin) {
    const context = await browser.newContext({ viewport: { width: 393, height: 852 } });
    const page = await context.newPage();
    await page.addInitScript(() => {
        localStorage.setItem('ayat-tour-done-quran-v3', '1');
        localStorage.setItem('ayat-tour-done-general-v3', '1');
    });
    await page.goto(`${origin}/quran.html`);
    await page.waitForFunction(() => document.querySelector('#quran-text')?.dataset.layoutState === 'ready');
    assert.match(await page.locator('script[src^="tour.js"]').getAttribute('src'), /tour\.js\?v=45$/);

    // Reveal the reader toolbar exactly as a touch user does, then use the
    // real settings controls rather than invoking tour functions directly.
    await page.locator('#reader-stage').click({ position: { x: 190, y: 300 } });
    await page.locator('#open-settings').click();
    await page.waitForSelector('#settings-sheet.is-open');
    await page.locator('#ayat-tour-settings-button').click();
    await page.waitForSelector('.ayat-tour-dialog:not([hidden])');
    await page.locator('[data-tour-action="replay-quran"]').click();

    assert.equal(await visibleStep(page), 'قلّب صفحات المصحف بإصبعك');
    assert.equal(await page.locator('#settings-sheet').getAttribute('aria-hidden'), 'true');
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('ayat-tour-active-v3'))), { kind: 'quran', step: 0 });
    await context.close();
}

async function testOfflineHandoff(browser, origin) {
    const context = await browser.newContext({ viewport: { width: 393, height: 852 }, serviceWorkers: 'allow' });
    const page = await context.newPage();
    await page.goto(`${origin}/index.html?ayatTour=general&ayatStep=2`);
    assert.equal(await visibleStep(page), 'فين تلاقي التلاوات؟');
    await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
        if (!navigator.serviceWorker.controller) {
            await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
        }
    });
    await context.setOffline(true);
    await page.locator('.ayat-tour-hit').click();
    await page.waitForURL(/recitations\.html/);
    assert.equal(await visibleStep(page), 'اختار صوت القارئ اللي تحبه');
    await context.close();
}

(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
    try {
        await testFullJourney(browser, origin);
        await testQuranTourFromSettings(browser, origin);
        await testOfflineHandoff(browser, origin);
        console.log('Tour navigation browser tests passed.');
    } finally {
        await browser.close();
        server.close();
    }
})().catch(error => {
    console.error(error);
    server.close();
    process.exitCode = 1;
});
