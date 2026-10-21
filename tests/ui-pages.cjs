const fs=require('fs');const assert=require('assert');
const files=['adhkar.html','recitations.html','library.html'];const text=Object.fromEntries(files.map(f=>[f,fs.readFileSync(f,'utf8')]));
const home=fs.readFileSync('index.html','utf8'),quran=fs.readFileSync('quran.html','utf8');
const forbidden=/[☀☾☽۞✦✧♡♥⌂♫▤⌕✓‹↗]/u;
for(const [file,html] of Object.entries(text)){assert(!forbidden.test(html),`${file} still contains a font-dependent UI glyph`);assert((html.match(/<nav class="bottom-nav"/g)||[]).length===1,`${file} must have one unified bottom nav`);assert((html.match(/<svg/g)||[]).length>=8,`${file} should use vector UI marks`);assert(html.includes('unified-nav.css'),`${file} must load the shared bottom-navigation style`)}
assert(!forbidden.test(home),'index.html still contains a font-dependent UI glyph');
assert((home.match(/<svg/g)||[]).length>=10,'Home dashboard should use vector UI marks');
assert(!quran.includes('>×</button>'),'Quran reader still contains a font-dependent close glyph');
assert(!quran.includes('class="loading-mark" aria-hidden="true">۞'),'Quran loading screen still contains a font-dependent ornament glyph');
assert(/class="loading-mark"[^>]*>[\s\S]*?<svg/.test(quran),'Quran loading mark should be vector-based');
assert(!/class="back"/.test(text['recitations.html']),'Recitations must not have a redundant home back button');
assert(/href="library\.html"/.test(text['recitations.html']),'Recitations must link to My Library');
assert(!/downloads-section/.test(text['recitations.html']),'Offline downloads must live on the separate My Library page');
for(const id of ['recitation-audio','reciter-list','moshaf-select','surah-select','play-pause','download-current','download-all','mini-player'])assert(text['recitations.html'].includes(`id="${id}"`),`Missing recitations controller target: ${id}`);
for(const id of ['library-content','library-search','sort-mode','library-player','library-audio'])assert(text['library.html'].includes(`id="${id}"`),`Missing My Library target: ${id}`);
for(const id of ['open-index','index-sheet','reader','reader-viewport','dhikr-slide','tasbih','reader-report','report-benefits'])assert(text['adhkar.html'].includes(`id="${id}"`),`Missing Adhkar session target: ${id}`);
const adhkarJs=fs.readFileSync('adhkar.js','utf8'),libraryJs=fs.readFileSync('library.js','utf8'),recitationsJs=fs.readFileSync('recitations.js','utf8');
assert(/swipeTo\(dx>0\?1:-1\)/.test(adhkarJs),'Right swipe must advance to the next dhikr via the genuine finger/mouse swipe handler');
assert(/BENEFITS=\[/.test(adhkarJs),'Adhkar completion report must have sourced-benefit rules');
assert(/source:matched\.reference\|\|rule\.source/.test(adhkarJs),'Adhkar benefit cards must bind to the completed dhikr corpus reference');
assert(/moshaf-block/.test(libraryJs),'My Library must group a reader by moshaf/recording before tracks');
assert(!/downloadsList|downloadsCount|downloadsStatus/.test(recitationsJs),'Recitations controller should no longer own the offline library list');
const sw=fs.readFileSync('sw.js','utf8');for(const asset of ['library.html','library.css','library.js','adhkar.html','adhkar.css','adhkar.js','recitations-overrides.css','unified-nav.css'])assert(sw.includes(`./${asset}`),`Service worker shell missing ${asset}`);
console.log('UI pages OK: stable vector marks, unified navigation, vectorized Quran controls, separate My Library, swipe Adhkar reader, sourced reports, and offline shell verified.');

assert(!text['library.html'].includes('hero-stats'),'Library summary counters should be removed');
assert(text['adhkar.html'].indexOf('id="dhikr-reference"')>text['adhkar.html'].indexOf('id="tasbih"'),'Reference must appear below counter');
assert(/advanceTimer=setTimeout/.test(adhkarJs),'Counter must advance automatically');
assert(/touchmove/.test(adhkarJs)&&/translateX/.test(adhkarJs),'Swipe must follow finger');
