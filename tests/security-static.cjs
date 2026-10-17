#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const htmlFiles = ['index.html', 'quran.html', 'adhkar.html', 'recitations.html', 'library.html'];
const requiredCsp = ["default-src 'self'", "script-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"];

for (const file of htmlFiles) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/i)?.[1] || '';
    requiredCsp.forEach(directive => assert.ok(csp.includes(directive), `${file} CSP missing ${directive}`));
    assert.match(html, /<meta name="referrer" content="no-referrer">/i, `${file} must suppress referrer leakage`);
    assert.match(html, /<script src="service-worker-register\.js"><\/script>/, `${file} must prepare offline use`);
    for (const script of html.matchAll(/<script\s+[^>]*src="([^"]+)"/gi)) {
        assert.equal(/^https?:/i.test(script[1]), false, `${file} loads remote JavaScript`);
        assert.ok(fs.existsSync(path.join(root, script[1])), `${file} missing script ${script[1]}`);
    }
    for (const link of html.matchAll(/<a\s+[^>]*target="_blank"[^>]*>/gi)) {
        assert.match(link[0], /rel="[^"]*noopener[^"]*"/i, `${file} external tab lacks noopener`);
    }
}

const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const shellMatch = sw.match(/const APP_SHELL = \[([\s\S]*?)\];/);
assert.ok(shellMatch, 'service-worker shell list missing');
const shellPaths = [...shellMatch[1].matchAll(/'\.\/([^']*)'/g)].map(match => match[1] || 'index.html');
for (const item of shellPaths) {
    const resolved = item === '' ? 'index.html' : item;
    assert.ok(fs.existsSync(path.join(root, resolved)), `offline shell path missing: ${resolved}`);
}
assert.ok(shellPaths.includes('mushaf-layout-prewarm-worker.js'), 'layout worker must be available offline');

for (const file of fs.readdirSync(root).filter(name => name.endsWith('.js'))) {
    const code = fs.readFileSync(path.join(root, file), 'utf8');
    assert.equal(/\beval\s*\(|new\s+Function\s*\(/.test(code), false, `${file} uses dynamic code execution`);
}

console.log(`PASS: ${htmlFiles.length} entry pages use local scripts, CSP, safe external tabs, and a complete offline shell.`);
