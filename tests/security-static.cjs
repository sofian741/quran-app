#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const htmlFiles = ['index.html', 'quran.html', 'adhkar.html', 'recitations.html', 'library.html', 'licenses.html'];
const requiredCsp = ["default-src 'self'", "script-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"];

for (const file of htmlFiles) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/i)?.[1] || '';
    requiredCsp.forEach(directive => assert.ok(csp.includes(directive), `${file} CSP missing ${directive}`));
    assert.equal(csp.includes('upgrade-insecure-requests'), false,
        `${file} must keep LAN HTTP assets on the current origin`);
    assert.match(html, /<meta name="referrer" content="no-referrer">/i, `${file} must suppress referrer leakage`);
    assert.match(html, /<script src="service-worker-register\.js"><\/script>/, `${file} must prepare offline use`);
    for (const script of html.matchAll(/<script\s+[^>]*src="([^"]+)"/gi)) {
        assert.equal(/^https?:/i.test(script[1]), false, `${file} loads remote JavaScript`);
        const localScript = script[1].split(/[?#]/)[0];
        assert.ok(fs.existsSync(path.join(root, localScript)), `${file} missing script ${script[1]}`);
    }
    for (const link of html.matchAll(/<a\s+[^>]*target="_blank"[^>]*>/gi)) {
        assert.match(link[0], /rel="[^"]*noopener[^"]*"/i, `${file} external tab lacks noopener`);
    }
    for (const link of html.matchAll(/<a\s+[^>]*href="([^"]+)"/gi)) {
        const href = link[1];
        if (/^(?:https?:|mailto:|#)/i.test(href)) continue;
        const localPath = href.split(/[?#]/)[0];
        assert.ok(fs.existsSync(path.join(root, localPath)), `${file} broken local link ${href}`);
    }
}

const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const shellMatch = sw.match(/const APP_SHELL = \[([\s\S]*?)\];/);
assert.ok(shellMatch, 'service-worker shell list missing');
const shellPaths = [...shellMatch[1].matchAll(/'\.\/([^']*)'/g)].map(match => match[1] || 'index.html');
for (const item of shellPaths) {
    const resolved = item === '' ? 'index.html' : item.split(/[?#]/)[0];
    assert.ok(fs.existsSync(path.join(root, resolved)), `offline shell path missing: ${resolved}`);
}
assert.ok(shellPaths.includes('mushaf-layout-prewarm-worker.js'), 'layout worker must be available offline');
assert.ok(shellPaths.includes('licenses.html'), 'license and privacy notices must be available offline');

for (const file of fs.readdirSync(root).filter(name => name.endsWith('.js'))) {
    const code = fs.readFileSync(path.join(root, file), 'utf8');
    assert.equal(/\beval\s*\(|new\s+Function\s*\(/.test(code), false, `${file} uses dynamic code execution`);
}

const androidWorkflow = fs.readFileSync(path.join(root, '.github/workflows/build-android-apk.yml'), 'utf8');
const audioWorkflow = fs.readFileSync(path.join(root, '.github/workflows/prepare-mishary-audio.yml'), 'utf8');
assert.match(androidWorkflow, /AYAT_EVERYAYAH_REDISTRIBUTION_APPROVED == 'true'/,
    'APK must require explicit audio rights approval before bundling EveryAyah');
assert.match(androidWorkflow, /rm -rf www\/offline\/mishary/,
    'normal QA APK must exclude unapproved EveryAyah assets');
assert.match(audioWorkflow, /AYAT_EVERYAYAH_REDISTRIBUTION_APPROVED == 'true'/,
    'audio-only public release must require explicit rights approval');
const audioDownloads = fs.readFileSync(path.join(root, 'audio-downloads.js'), 'utf8');
assert.match(audioDownloads, /isMp3QuranUrl\(track\.url\)/,
    'only approved MP3Quran recordings can be downloaded');
console.log(`PASS: ${htmlFiles.length} entry pages, security and audio copyright release gates verified.`);
