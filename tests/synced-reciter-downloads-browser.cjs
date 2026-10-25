#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const base = process.env.QURAN_BASE_URL || 'http://127.0.0.1:4173';
const browserPath = process.env.QURAN_BROWSER_PATH || '/usr/bin/chromium';
(async () => {
  const browser = await chromium.launch({
    headless: true, executablePath: browserPath, args: ['--no-sandbox']
  });
  try {
    const page = await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://mp3quran.net/api/**', route => route.fulfill({
      status:200,contentType:'application/json',body:JSON.stringify({reciters:[]})
    }));
    await page.goto(base+'/recitations.html', {waitUntil:'domcontentloaded'});
    await page.waitForFunction(() => document.querySelectorAll('.synced-reader-card').length > 0);

    const initial = await page.evaluate(() => ({
      readers:[...document.querySelectorAll('.synced-reader-card strong')].map(x=>x.textContent),
      surahs:document.getElementById('synced-surah').options.length,
      selected:document.getElementById('synced-selected-reader').textContent,
      unavailable:document.getElementById('synced-unavailable-list').textContent
    }));
    assert.equal(initial.readers.length,7,'Only 7 QUD readers use approved MP3Quran audio');
    assert.equal(initial.surahs,114);
    assert.match(initial.selected,/الحذيفي/);
    assert.match(initial.unavailable,/ماهر المعيقلي/);
    assert.match(await page.locator('#synced-download-status').textContent(),/اختر/);

    // Stub the external audio transfer, but keep the real UI, URL validation,
    // source selection, saved-index behavior and word timing verification.
    await page.evaluate(() => {
      window.__syncedCalls = [];
      const dm = window.QuranDownloads.DownloadManager.prototype;
      dm.has = async url => {
        const items=JSON.parse(localStorage.getItem('quranAudioDownloadsV1')||'[]');
        return items.some(item=>item.url===url);
      };
      dm.list = function() {
        return JSON.parse(localStorage.getItem('quranAudioDownloadsV1')||'[]');
      };
      dm.downloadTrack = async function(track) {
        window.__syncedCalls.push({...track});
        if(!window.QuranDownloads.canDownloadTrack(track)) throw new Error('Unapproved audio');
        const items=this.list();
        items.push({...track,savedAt:Date.now(),bytes:12345});
        localStorage.setItem('quranAudioDownloadsV1',JSON.stringify(items));
        this.emit({status:'done',track,bytes:12345,progress:1});
        return true;
      };
      window.QuranQud.loadChapter = async function(reader,surah) {
        const count=window.QuranAudio.VERSE_COUNTS[surah-1];
        return {reciterId:reader.id,surah,
          audioUrl:'https://server9.mp3quran.net/'+reader.slug+'/'+String(surah).padStart(3,'0')+'.mp3',
          verses:Array.from({length:count},(_,i)=>({ayah:i+1,segments:[{word:1,start:0,end:100}]}))
        };
      };
    });

    await page.locator('#synced-download-one').click();
    await page.waitForFunction(() => document.getElementById('synced-download-status').textContent.includes('اكتمل التنزيل'));
    const first = await page.evaluate(() => window.__syncedCalls[0]);
    assert.equal(first.reciterId,9004);
    assert.equal(first.surah,1);
    assert.equal(first.provider,'mp3quran');
    assert.match(first.url,/^https:\/\/server9\.mp3quran\.net\/.+\/001\.mp3$/);
    assert.match(await page.locator('.synced-reader-card.is-selected').textContent(),/١ \/ ١١٤/);

    await page.locator('#synced-download-one').click();
    await page.waitForFunction(() => document.getElementById('synced-download-status').textContent.includes('الموجود مسبقًا'));
    assert.equal(await page.evaluate(() => window.__syncedCalls.length),1,'Already saved surah is not downloaded again');

    await page.locator('.synced-reader-card').first().click();
    await page.locator('#synced-surah').selectOption('2');
    await page.locator('#synced-download-one').click();
    await page.waitForFunction(() => document.getElementById('synced-download-status').textContent.includes('اكتمل التنزيل'));
    const second=await page.evaluate(() => window.__syncedCalls[1]);
    assert.equal(second.surah,2);
    assert.notEqual(second.reciterId,9004);

    await page.evaluate(() => {window.confirm=()=>true;});
    await page.locator('#synced-download-all').click();
    await page.waitForFunction(() => document.getElementById('synced-download-status').textContent.includes('اكتمل التنزيل'),{timeout:30000});
    const summary=await page.evaluate(() => ({
      total:window.__syncedCalls.length,
      owner:window.AyatDownloadLock.owner,
      cards:document.querySelectorAll('.synced-reader-card').length,
      stored:JSON.parse(localStorage.getItem('quranAudioDownloadsV1')).length,
      status:document.getElementById('synced-download-status').textContent
    }));
    assert.equal(summary.total,115,'1 Huthaifi + 114 recordings of selected reciter');
    assert.equal(summary.stored,115);
    assert.equal(summary.owner,null);
    assert.equal(summary.cards,7);
    assert.deepEqual(errors,[],'No uncaught page errors');
    console.log('PASS: QUD MP3Quran reader download UI, exact recording, single and full Mushaf, saved count and dedupe, other source notice');
  } finally {
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
