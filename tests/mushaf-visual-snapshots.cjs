'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const out = path.join(root, 'artifacts', 'canonical-mushaf-audit');
const pages = [1, 2, 76, 77, 207, 208, 223, 246, 585, 586, 602, 604];
const viewport = { width: 390, height: 844 };
fs.mkdirSync(out, { recursive: true });

(async () => {
    const server = http.createServer((request, response) => {
        const pathname = request.url.split('?')[0] === '/' ? '/quran.html' : request.url.split('?')[0];
        try {
            response.end(fs.readFileSync(path.join(root, pathname)));
        } catch (_) {
            response.statusCode = 404;
            response.end();
        }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
    const url = `http://127.0.0.1:${server.address().port}/quran.html`;
    const report = [];

    try {
        for (const pageNumber of pages) {
            await page.goto(url);
            await page.evaluate(number => localStorage.setItem(
                'quranReaderState', JSON.stringify({ displayPage: number })
            ), pageNumber);
            await page.reload();
            await page.waitForSelector('#loading-screen', { state: 'detached' });
            await page.evaluate(() => document.fonts.ready);
            await page.waitForFunction(() => document.querySelector('#quran-text').dataset.layoutState === 'ready');
            await page.waitForTimeout(80);

            const metrics = await page.evaluate(number => {
                const text = document.querySelector('#quran-text');
                const bounds = text.getBoundingClientRect();
                const lines = [...text.querySelectorAll('.mushaf-line')];
                const rows = [...text.children];
                const basmalas = [...text.querySelectorAll('.surah-basmala')];
                const words = [...text.querySelectorAll('.mushaf-word')];
                return {
                    page: number,
                    fontSize: parseFloat(getComputedStyle(text).fontSize),
                    rowCount: rows.length,
                    textLineCount: lines.length,
                    headings: [...text.querySelectorAll('.surah-heading')].map(node => Number(node.dataset.surah)),
                    basmalaCount: basmalas.length,
                    basmalaSizes: basmalas.map(node => parseFloat(getComputedStyle(node).fontSize)),
                    centeredLines: lines.filter(line => line.dataset.canonicalCentered === '1').length,
                    fullLines: lines.filter(line => line.dataset.canonicalCentered === '0').length,
                    transformedLines: lines.filter(line => getComputedStyle(line).transform !== 'none').length,
                    outsideWords: words.filter(word => {
                        const rect = word.getBoundingClientRect();
                        return rect.left < bounds.left - 1 || rect.right > bounds.right + 1;
                    }).length,
                    rowOverlap: rows.slice(1).some((row, index) => {
                        const previous = rows[index].getBoundingClientRect();
                        const current = row.getBoundingClientRect();
                        return previous.bottom > current.top + 1;
                    }),
                    scrollOverflow: text.scrollHeight > text.clientHeight + 1,
                };
            }, pageNumber);
            report.push(metrics);
            await page.locator('#mushaf-page').screenshot({
                path: path.join(out, `page-${String(pageNumber).padStart(3, '0')}-390x844.png`),
            });
        }
        fs.writeFileSync(path.join(out, 'metrics.json'), JSON.stringify(report, null, 2));
        console.log(JSON.stringify(report, null, 2));
    } finally {
        await browser.close();
        server.close();
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
