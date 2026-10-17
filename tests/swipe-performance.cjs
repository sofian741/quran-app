// Verifies that touch dragging consumes a prepared adjacent page instead of
// building and measuring hundreds of Quran word nodes inside pointermove.
// QURAN_BROWSER_PATH=/usr/bin/chromium node tests/swipe-performance.cjs
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');

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

    const browser = await chromium.launch({
        headless: true,
        ...(process.env.QURAN_BROWSER_PATH || fs.existsSync('/usr/bin/chromium')
            ? { executablePath: process.env.QURAN_BROWSER_PATH || '/usr/bin/chromium' }
            : {}),
    });

    try {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
        await page.addInitScript(() => {
            window.__swipeRectReads = 0;
            const originalRect = Element.prototype.getBoundingClientRect;
            Element.prototype.getBoundingClientRect = function measuredRect() {
                window.__swipeRectReads++;
                return originalRect.call(this);
            };
            HTMLElement.prototype.setPointerCapture = function setPointerCapture() {};
            HTMLElement.prototype.releasePointerCapture = function releasePointerCapture() {};
            window.addEventListener('mushaf:page-ready', event => {
                window.__lastPageReadyDetail = event.detail;
            });
        });
        await page.emulateMedia({ reducedMotion: 'reduce' });

        const url = `http://127.0.0.1:${server.address().port}/quran.html`;
        const timings = [];
        const commitTimings = [];

        async function openAt(pageNumber) {
            await page.goto(url);
            await page.evaluate(number => localStorage.setItem(
                'quranReaderState', JSON.stringify({ displayPage: number }),
            ), pageNumber);
            await page.reload();
            await page.waitForSelector('#loading-screen', { state: 'detached' });
            await page.evaluate(() => document.fonts.ready);
            await page.waitForFunction(() => (
                document.querySelector('#quran-text').dataset.layoutState === 'ready' &&
                window.mushafSwipeDiagnostics?.preparedReady > 0
            ));
        }

        async function drag(direction, instantCommit = true) {
            const result = await page.evaluate(direction => {
                const stage = document.querySelector('#reader-stage');
                const rect = stage.getBoundingClientRect();
                const x = rect.left + rect.width / 2;
                const y = rect.top + rect.height / 2;
                const emit = (type, dx) => stage.dispatchEvent(new PointerEvent(type, {
                    bubbles: true,
                    cancelable: true,
                    pointerId: 73,
                    pointerType: 'touch',
                    clientX: x + dx,
                    clientY: y,
                    button: 0,
                }));

                emit('pointerdown', 0);
                window.__swipeRectReads = 0;
                const before = performance.now();
                emit('pointermove', direction * 24);
                const duration = performance.now() - before;
                const activePreview = document.querySelector('.swipe-preview');
                const snapshot = {
                    duration,
                    rectReads: window.__swipeRectReads,
                    preparedState: activePreview?.dataset.preparedPreview,
                    preparedHits: window.mushafSwipeDiagnostics.preparedHits,
                    preparationMisses: window.mushafSwipeDiagnostics.preparationMisses,
                };
                emit('pointermove', direction * 120);
                const readsBeforeCommit = window.__swipeRectReads;
                const commitStart = performance.now();
                emit('pointerup', direction * 120);
                snapshot.commitDuration = performance.now() - commitStart;
                snapshot.commitRectReads = window.__swipeRectReads - readsBeforeCommit;
                snapshot.preparedCommit = window.__lastPageReadyDetail?.prepared === true;
                return snapshot;
            }, direction);
            timings.push(result.duration);
            assert.equal(result.preparedState, 'used');
            assert.equal(result.rectReads, 0);
            assert.equal(result.preparationMisses, 0);
            assert.ok(result.preparedHits > 0);
            assert.ok(result.duration < 12, `slow prepared pointermove: ${result.duration}ms`);
            if (instantCommit) {
                commitTimings.push(result.commitDuration);
                assert.equal(result.preparedCommit, true);
                assert.ok(result.commitRectReads <= 1, `layout reads during commit: ${result.commitRectReads}`);
                assert.ok(result.commitDuration < 30, `slow prepared commit: ${result.commitDuration}ms`);
            }
        }

        async function waitAt(expected) {
            await page.waitForFunction(expected => (
                window.mushafReader.getCurrentPage() === expected &&
                document.querySelector('#quran-text').dataset.layoutState === 'ready' &&
                window.mushafSwipeDiagnostics.preparedKeys?.includes(`${expected + 1}:1`) &&
                window.mushafSwipeDiagnostics.preparedKeys?.includes(`${expected - 1}:-1`)
            ), expected);
        }

        for (const [width, height, start] of [[390, 844, 223], [320, 568, 602]]) {
            await page.setViewportSize({ width, height });
            await openAt(start);
            await drag(1);
            await waitAt(start + 1);
            if (start === 223) {
                // Exercise consecutive fast reading-direction turns as well as reversal.
                await drag(1);
                await waitAt(start + 2);
                await drag(-1);
                await waitAt(start + 1);
            }
            await drag(-1);
            await waitAt(start);
        }

        // Also exercise the real 175ms completion animation used on phones.
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await page.setViewportSize({ width: 390, height: 844 });
        await openAt(223);
        await drag(1, false);
        await waitAt(224);
        assert.equal(await page.evaluate(() => window.__lastPageReadyDetail?.prepared), true);
        const adoptedPresentation = await page.evaluate(() => {
            const current = document.querySelector('#quran-text');
            return {
                className: current.className,
                text: current.textContent,
                rows: [...current.children].map(row => ({
                    className: row.className,
                    start: row.dataset.start || '',
                    end: row.dataset.end || '',
                    transform: row.style.transform,
                    gap: row.style.columnGap,
                    justify: row.style.justifyContent,
                })),
            };
        });
        await openAt(224);
        const directPresentation = await page.evaluate(() => {
            const current = document.querySelector('#quran-text');
            return {
                className: current.className,
                text: current.textContent,
                rows: [...current.children].map(row => ({
                    className: row.className,
                    start: row.dataset.start || '',
                    end: row.dataset.end || '',
                    transform: row.style.transform,
                    gap: row.style.columnGap,
                    justify: row.style.justifyContent,
                })),
            };
        });
        assert.deepEqual(adoptedPresentation, directPresentation);

        console.log(
            `PASS: ${timings.length} prepared touch drags; ` +
            `pointermove ${Math.max(...timings).toFixed(2)}ms max; ` +
            `commit ${Math.max(...commitTimings).toFixed(2)}ms max; zero layout reads during drag.`,
        );
    } finally {
        await browser.close();
        server.close();
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
