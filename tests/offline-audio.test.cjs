'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

const source = readFileSync(require('node:path').join(__dirname, '..', 'audio-downloads.js'), 'utf8');

function makeContext(savedEntries = {}) {
  const objects = new Map();
  let counter = 0;
  let requests = 0;
  const mediaURL = class extends URL {};
  mediaURL.createObjectURL = blob => {
    const key = 'blob:test-' + (++counter);
    objects.set(key, blob);
    return key;
  };
  mediaURL.revokeObjectURL = key => objects.delete(key);
  const cache = {
    async match(url) { return savedEntries[url] || null; }
  };
  const window = { dispatchEvent() {} };
  const context = {
    window, navigator: { onLine: false },
    URL: mediaURL, caches: { async open() { return cache; } },
    localStorage: { getItem() { return null; }, setItem() {} },
    Request, Response, Blob, EventTarget, Event, CustomEvent: class extends Event {},
    fetch() { requests++; throw new Error('Unexpected network request'); },
    console, setTimeout, clearTimeout
  };
  vm.runInNewContext(source, context, { filename: 'audio-downloads.js' });
  return { api: window.QuranDownloads, objects, getRequests: () => requests };
}

test('offline playback uses a stored audio blob and needs no network', async () => {
  const url = 'https://cdn.mp3quran.net/reciter/001.mp3';
  const bytes = new Uint8Array([73, 68, 51, 0, 0, 0]);
  const { api, objects, getRequests } = makeContext({
    [url]: new Response(bytes, { status: 200, headers: { 'Content-Type': 'audio/mpeg' } })
  });
  const owner = {};
  const first = await api.mediaFor(owner, url);
  assert.match(first, /^blob:/);
  assert.equal(objects.size, 1);
  assert.equal(await objects.get(first).arrayBuffer().then(x => x.byteLength), bytes.length);
  assert.equal(await api.mediaFor(owner, url), first, 'same cached object should be reused');
  assert.equal(getRequests(), 0, 'offline playback should never fetch the remote URL');
  api.releaseMedia(owner);
  assert.equal(objects.size, 0, 'blob must be revoked after playback');
});

test('uncached audio retains the online URL for normal playback', async () => {
  const { api, objects } = makeContext();
  const url = 'https://cdn.mp3quran.net/reciter/002.mp3';
  const owner = {};
  assert.equal(await api.mediaFor(owner, url), url);
  assert.equal(objects.size, 0);
  api.releaseMedia(owner);
});

test('changing tracks revokes the previous saved blob', async () => {
  const firstUrl = 'https://cdn.mp3quran.net/001.mp3';
  const secondUrl = 'https://cdn.mp3quran.net/002.mp3';
  const response = () => new Response(new Uint8Array([73, 68, 51, 0]));
  const { api, objects } = makeContext({
    [firstUrl]: response(), [secondUrl]: response()
  });
  const owner = {};
  const first = await api.mediaFor(owner, firstUrl);
  const second = await api.mediaFor(owner, secondUrl);
  assert.notEqual(first, second);
  assert.equal(objects.has(first), false);
  assert.equal(objects.has(second), true);
  api.releaseMedia(owner);
});
