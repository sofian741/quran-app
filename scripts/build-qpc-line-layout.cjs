#!/usr/bin/env node
'use strict';

/**
 * Build the compact application layout from the canonical 15-line Madinah
 * mushaf page-line metadata. The Quran text itself always stays in the local
 * Tanzil file; this script imports only page/line boundaries and centering.
 *
 * Usage:
 *   node scripts/build-qpc-line-layout.cjs /path/to/page_lines.csv
 *   node scripts/build-qpc-line-layout.cjs https://.../page_lines.csv
 */

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const quranPath = path.join(projectRoot, 'data/quran-uthmani.txt');
const currentLayoutPath = path.join(projectRoot, 'data/mushaf-layout.json');
const outputPath = currentLayoutPath;
const sourceArg = process.argv[2];
const EXPECTED_PAGES = 604;
const EXPECTED_VERSES = 6236;
const EXPECTED_LOCAL_WORDS = 77881;
const EXPECTED_QUL_MAX_WORD_ID = 83668;
const SUFFIX_MARKS = new Set(['ۖ', 'ۚ', 'ۘ', 'ۗ', 'ۛ', 'ۙ', 'ۜ', '۩']);
const PREFIX_MARKS = new Set(['۞']);

if (!sourceArg) {
    console.error('Usage: node scripts/build-qpc-line-layout.cjs /path/to/page_lines.csv');
    process.exit(1);
}

function splitQuranWords(text) {
    const words = [];
    let prefix = '';
    for (const rawWord of text.split(/\s+/).filter(Boolean)) {
        if (PREFIX_MARKS.has(rawWord)) {
            prefix += rawWord;
        } else if (SUFFIX_MARKS.has(rawWord) && words.length) {
            words[words.length - 1] += `\u202f${rawWord}`;
        } else {
            words.push(prefix ? `${prefix}\u202f${rawWord}` : rawWord);
            prefix = '';
        }
    }
    return words;
}

async function readText(input) {
    if (/^https:\/\//i.test(input)) {
        const response = await fetch(input, { redirect: 'follow' });
        if (!response.ok) throw new Error(`Could not fetch layout CSV: HTTP ${response.status}`);
        return response.text();
    }
    return fs.readFileSync(path.resolve(input), 'utf8');
}

function parseLocalQuran() {
    const raw = fs.readFileSync(quranPath, 'utf8');
    const tokens = [];
    const qulToLocal = new Map();
    let qulWordId = 0;
    let verseCount = 0;

    for (const line of raw.split(/\r?\n/)) {
        if (!/^\d+\|\d+\|/.test(line)) continue;
        const [surahText, ayahText, ...textParts] = line.split('|');
        const surah = Number(surahText);
        const ayah = Number(ayahText);
        const words = splitQuranWords(textParts.join('|'));
        // Tanzil stores the opening basmala as the first four tokens of ayah 1
        // for every surah except Al-Fatihah and At-Tawbah. QUL represents those
        // as a separate basmallah row with no word IDs.
        const basmalaWords = ayah === 1 && surah !== 1 && surah !== 9 ? 4 : 0;

        words.forEach((text, wordIndex) => {
            const localIndex = tokens.length;
            tokens.push({ surah, ayah, word: wordIndex, text });
            if (wordIndex >= basmalaWords) {
                qulWordId += 1;
                qulToLocal.set(qulWordId, localIndex);
            }
        });

        // QUL's word stream includes one ayah-number marker after every verse.
        // The final marker is not referenced by page_lines.csv, but incrementing
        // it keeps all preceding IDs aligned with QUL's canonical word IDs.
        qulWordId += 1;
        verseCount += 1;
    }

    if (verseCount !== EXPECTED_VERSES || tokens.length !== EXPECTED_LOCAL_WORDS) {
        throw new Error(`Unexpected Tanzil structure: ${verseCount} verses, ${tokens.length} words`);
    }
    if (qulWordId !== EXPECTED_QUL_MAX_WORD_ID + 1) {
        throw new Error(`Unexpected QUL stream size: ${qulWordId}`);
    }
    return { tokens, qulToLocal };
}

function parseCsv(raw) {
    const rows = [];
    const lines = raw.trim().split(/\r?\n/);
    const header = lines.shift();
    if (header !== 'page_number,line_number,line_type,is_centered,first_word_id,last_word_id,surah_number') {
        throw new Error(`Unexpected page_lines.csv header: ${header}`);
    }
    for (const line of lines) {
        const [page, lineNumber, type, centered, first, last, surah] = line.split(',');
        rows.push({
            page: Number(page),
            line: Number(lineNumber),
            type,
            centered: centered === '1',
            first: first ? Number(first) : null,
            last: last ? Number(last) : null,
            surah: surah ? Number(surah) : null,
        });
    }
    return rows;
}

function firstMappedId(map, first, last) {
    for (let id = first; id <= last; id++) if (map.has(id)) return id;
    return null;
}

function lastMappedId(map, first, last) {
    for (let id = last; id >= first; id--) if (map.has(id)) return id;
    return null;
}

function location(token) {
    return token ? `${token.surah}:${token.ayah}:${token.word + 1}` : 'none';
}

(async () => {
    const csv = parseCsv(await readText(sourceArg));
    const current = JSON.parse(fs.readFileSync(currentLayoutPath, 'utf8'));
    if (!Array.isArray(current.pages) || current.pages.length !== EXPECTED_PAGES) {
        throw new Error('Existing layout is invalid; refusing to overwrite');
    }
    const { tokens, qulToLocal } = parseLocalQuran();
    const pages = Array.from({ length: EXPECTED_PAGES }, () => []);

    // Page 1 and page 2 are intentionally protected. Their custom opening-page
    // design has separate rendering rules and must not move during this rebuild.
    pages[0] = current.pages[0].map(row => [...row]);
    pages[1] = current.pages[1].map(row => [...row]);
    let cursor = pages[1].filter(row => row[0] !== 'h').at(-1)[2];
    let currentSurah = 2;

    for (const row of csv) {
        if (row.page <= 2) continue;
        if (!Number.isInteger(row.page) || row.page < 3 || row.page > EXPECTED_PAGES) {
            throw new Error(`Invalid page number: ${row.page}`);
        }
        const page = pages[row.page - 1];

        if (row.type === 'surah_name') {
            if (!Number.isInteger(row.surah) || row.surah < 1 || row.surah > 114) {
                throw new Error(`Invalid surah header on page ${row.page}`);
            }
            currentSurah = row.surah;
            page.push(['h', row.surah]);
            continue;
        }

        if (row.type === 'basmallah') {
            const start = cursor;
            const end = start + 4;
            const first = tokens[start];
            const last = tokens[end - 1];
            if (
                first?.surah !== currentSurah || first?.ayah !== 1 || first?.word !== 0 ||
                last?.surah !== currentSurah || last?.ayah !== 1 || last?.word !== 3
            ) {
                throw new Error(`Basmala mismatch on page ${row.page} for surah ${currentSurah}: ${location(first)}-${location(last)}`);
            }
            page.push(['b', start, end]);
            cursor = end;
            continue;
        }

        if (row.type !== 'ayah' || !row.first || !row.last || row.last < row.first) {
            throw new Error(`Invalid line ${row.page}:${row.line}`);
        }
        const firstId = firstMappedId(qulToLocal, row.first, row.last);
        const lastId = lastMappedId(qulToLocal, row.first, row.last);
        if (!firstId || !lastId) throw new Error(`No Quran words in line ${row.page}:${row.line}`);
        const start = qulToLocal.get(firstId);
        const end = qulToLocal.get(lastId) + 1;
        if (start !== cursor) {
            throw new Error(`Non-contiguous QPC line at ${row.page}:${row.line}; expected local ${cursor}, got ${start} (${location(tokens[start])})`);
        }
        page.push(['l', start, end, row.centered ? 1 : 0]);
        cursor = end;
    }

    if (cursor !== tokens.length) {
        throw new Error(`Canonical layout stopped at ${cursor}/${tokens.length} local words`);
    }
    for (let page = 3; page <= EXPECTED_PAGES; page++) {
        if (pages[page - 1].length !== 15) {
            throw new Error(`Canonical page ${page} has ${pages[page - 1].length} rows instead of 15`);
        }
    }

    const headingCount = pages.flat().filter(row => row[0] === 'h').length;
    const basmalaCount = pages.flat().filter(row => row[0] === 'b').length;
    if (headingCount !== 114 || basmalaCount !== 112) {
        throw new Error(`Unexpected structures: ${headingCount} headings, ${basmalaCount} basmalas`);
    }

    const page246 = pages[245].filter(row => row[0] === 'l');
    const page586 = pages[585];
    if (location(tokens[page246[0][1]]) !== '12:87:1' || location(tokens[page246[1][2] - 1]) !== '12:87:19') {
        throw new Error('Page 246 canonical line anchors do not match QPC 15-line layout');
    }
    if (
        page586[0]?.[0] !== 'l' || location(tokens[page586[0][1]]) !== '80:41:1' ||
        page586[1]?.[0] !== 'h' || page586[1]?.[1] !== 81 || page586[2]?.[0] !== 'b'
    ) {
        throw new Error('Page 586 canonical transition does not match QPC 15-line layout');
    }

    const output = {
        version: 2,
        source: 'QUL QPC 15-line page metadata (canonical Madinah line breaks + centered flags)',
        source_url: 'https://github.com/hussainsajib/qpc-v4-mushaf-bundle/blob/master/data/page_lines.csv',
        protected_opening_pages: 2,
        pages,
    };
    fs.writeFileSync(outputPath, `${JSON.stringify(output)}\n`);
    console.log(`Wrote ${outputPath}: ${pages.length} pages; ${headingCount} headings; ${basmalaCount} basmalas.`);
})();
