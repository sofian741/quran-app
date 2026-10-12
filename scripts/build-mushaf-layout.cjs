#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const sourcePath = path.join(projectRoot, 'data/quran-uthmani.txt');
const inputRoot = path.resolve(process.argv[2] || '');
const outputPath = path.join(projectRoot, 'data/mushaf-layout.json');
const suffixMarks = new Set(['ۖ', 'ۚ', 'ۘ', 'ۗ', 'ۛ', 'ۙ', 'ۜ', '۩']);
const prefixMarks = new Set(['۞']);

if (!inputRoot || !fs.existsSync(path.join(inputRoot, 'page-001.json'))) {
    console.error('Usage: node scripts/build-mushaf-layout.cjs /path/to/mushaf-layout/mushaf');
    process.exit(1);
}

function splitQuranWords(text) {
    const words = [];
    let prefix = '';

    for (const word of text.trim().split(/\s+/).filter(Boolean)) {
        if (prefixMarks.has(word)) {
            prefix += word;
        } else if (suffixMarks.has(word) && words.length) {
            words[words.length - 1] += word;
        } else {
            words.push(prefix + word);
            prefix = '';
        }
    }

    return words;
}

function normalizeForLayout(text) {
    return text.normalize('NFC')
        .replace(/[٠-٩0-9\s]/g, '')
        .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
        .replace(/\u0640/g, '')
        .replace(/[ٱأإآ]/g, 'ا')
        .replace(/ى/g, 'ي');
}

function editDistance(left, right) {
    let previous = Array.from(
        { length: right.length + 1 },
        (_, index) => index,
    );

    for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
        const current = [leftIndex];

        for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
            current[rightIndex] = Math.min(
                current[rightIndex - 1] + 1,
                previous[rightIndex] + 1,
                previous[rightIndex - 1] + (
                    left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1
                ),
            );
        }

        previous = current;
    }

    return previous[right.length];
}

const source = fs.readFileSync(sourcePath, 'utf8');
const sourceWords = [];

for (const rawLine of source.split(/\r?\n/)) {
    if (!/^\d+\|\d+\|/.test(rawLine)) continue;

    const [surahText, ayahText, ...textParts] = rawLine.split('|');
    const surah = Number(surahText);
    const ayah = Number(ayahText);

    splitQuranWords(textParts.join('|')).forEach((text, word) => {
        sourceWords.push({ surah, ayah, word, text });
    });
}

const pages = [];
let cursor = 0;
let lastSurah = 0;
let fuzzyLines = 0;
let maxDistance = 0;

function addBasmala(lines, surah, filename) {
    const start = cursor;

    for (let word = 0; word < 4; word++) {
        const item = sourceWords[cursor++];

        if (
            item?.surah !== surah ||
            item?.ayah !== 1 ||
            item?.word !== word
        ) {
            throw new Error(`Basmala mismatch in ${filename} for surah ${surah}`);
        }
    }

    lines.push(['b', start, cursor]);
}

for (let pageNumber = 1; pageNumber <= 604; pageNumber++) {
    const filename = `page-${String(pageNumber).padStart(3, '0')}.json`;
    const rawPage = JSON.parse(
        fs.readFileSync(path.join(inputRoot, filename), 'utf8'),
    );
    const lines = [];

    for (let lineIndex = 0; lineIndex < rawPage.lines.length; lineIndex++) {
        const line = rawPage.lines[lineIndex];

        if (line.type === 'surah-header') {
            lines.push(['h', ++lastSurah]);
            continue;
        }

        if (line.type === 'basmala') {
            const following = rawPage.lines
                .slice(lineIndex + 1)
                .find(item => item.type === 'text');
            const followingSurah = Number(
                following?.verseRange?.split(/[:-]/)[0],
            );

            while (lastSurah < followingSurah) {
                lines.push(['h', ++lastSurah]);
            }

            const surah = followingSurah || lastSurah;
            if (surah === 1 || surah === 9) {
                throw new Error(`Unexpected basmala in ${filename}`);
            }

            addBasmala(lines, surah, filename);
            continue;
        }

        if (line.type !== 'text') {
            throw new Error(`Unknown line type in ${filename}: ${line.type}`);
        }

        const firstSurah = Number(line.verseRange.split(/[:-]/)[0]);

        while (lastSurah < firstSurah) {
            lines.push(['h', ++lastSurah]);
        }

        if (
            firstSurah !== 1 &&
            firstSurah !== 9 &&
            sourceWords[cursor]?.surah === firstSurah &&
            sourceWords[cursor]?.ayah === 1 &&
            sourceWords[cursor]?.word === 0
        ) {
            addBasmala(lines, firstSurah, filename);
        }

        const start = cursor;
        const target = normalizeForLayout(line.text);
        let joined = '';
        let probe = cursor;
        let best = null;

        while (
            probe < sourceWords.length &&
            joined.length <= target.length + 24
        ) {
            joined += normalizeForLayout(sourceWords[probe].text);
            probe++;

            const score = editDistance(joined, target);
            if (!best || score < best.score) {
                best = { end: probe, score };
            }
        }

        if (
            !best ||
            best.score > Math.max(4, Math.ceil(target.length * 0.08))
        ) {
            throw new Error(
                `Unable to align ${filename}, source line ${line.line}`,
            );
        }

        if (best.score) fuzzyLines++;
        maxDistance = Math.max(maxDistance, best.score);
        cursor = best.end;
        lines.push(['l', start, cursor]);
    }

    pages.push(lines);
}

// A heading must stay with the opening it introduces. A few upstream pages
// place the heading as the final row and the basmala/text on the next page.
for (let pageIndex = 0; pageIndex < pages.length - 1; pageIndex++) {
    const trailing = pages[pageIndex].at(-1);
    if (trailing?.[0] === 'h') {
        pages[pageIndex + 1].unshift(pages[pageIndex].pop());
    }
}

if (cursor !== sourceWords.length || lastSurah !== 114) {
    throw new Error(
        `Incomplete layout: ${cursor}/${sourceWords.length} words, ${lastSurah}/114 surahs`,
    );
}

const output = {
    version: 1,
    source: 'zonetecde/mushaf-layout@72116ce4d405d67823804f0eed795c1e6409b4af',
    pages,
};

fs.writeFileSync(outputPath, `${JSON.stringify(output)}\n`);
console.log(JSON.stringify({
    pages: pages.length,
    verses: 6236,
    words: sourceWords.length,
    surahs: lastSurah,
    fuzzyLines,
    maxDistance,
    bytes: fs.statSync(outputPath).size,
}));
