// Identity is always surah:ayah plus an edition-specific word ordinal.
// Normalization is used ONLY to compare identities, never to render/copy text.
const suffix = new Set(['ۖ', 'ۚ', 'ۘ', 'ۗ', 'ۛ', 'ۙ', 'ۜ', '۩']);
export function splitWords(text) {
  const out = []; let prefix = '';
  for (const part of text.trim().split(/\s+/)) {
    if (part === '۞') prefix += part;
    else if (suffix.has(part) && out.length) out[out.length - 1] += '\u202f' + part;
    else { out.push(prefix + part); prefix = ''; }
  }
  return out;
}
export function parseTanzil(raw) {
  return raw.split(/\r?\n/).flatMap(line => {
    const m = /^(\d+)\|(\d+)\|(.+)$/.exec(line);
    return m ? [{surah: +m[1], ayah: +m[2], text: m[3], key: m[1]+':'+m[2]}] : [];
  });
}
export function skeleton(text) {
  return text.normalize('NFD').replace(/[\p{M}\u0640\u06d6-\u06ed\u200c-\u200f\u202a-\u202f\s]/gu, '')
    .replace(/ٱ/g, 'ا').replace(/ى/g, 'ي');
}
export function alignWords(source, printed) {
  const a = source.map(skeleton), b = printed.map(skeleton);
  const memo = new Map();
  function visit(i, j) {
    if (i === a.length && j === b.length) return [[]];
    if (i >= a.length || j >= b.length) return [];
    const key = i+':'+j;
    if (memo.has(key)) return memo.get(key);
    const paths = [];
    // Prefer one-to-one only when the rest of the verse is also exact.
    for (const [n, m] of [[1,1], [1,2], [2,1]]) {
      if (i+n > a.length || j+m > b.length) continue;
      if (!a.slice(i,i+n).join('') || a.slice(i,i+n).join('') !== b.slice(j,j+m).join('')) continue;
      for (const tail of visit(i+n,j+m)) {
        paths.push([{source:[i,i+n], printed:[j,j+m]}, ...tail]);
        if (paths.length > 1) break;
      }
      if (paths.length > 1) break;
    }
    memo.set(key, paths); return paths;
  }
  const paths = visit(0,0);
  return paths.length === 1 ? {status:'exact-skeleton', groups:paths[0]} :
    {status:paths.length ? 'ambiguous' : 'unresolved', source, printed};
}
// Full-verse identity map, never current-page array positions. A page can hold
// only part of a verse. Provider ordinal spaces must be named explicitly.
export function mapTimingWord(verse, ordinal, space = 'tanzil-spoken') {
  if (!Number.isInteger(ordinal) || ordinal < 1) throw new Error('Invalid timing ordinal');
  if (!verse || verse.status !== 'exact-skeleton' || space !== 'tanzil-spoken') return null;
  return verse.sourceToPrinted[ordinal - 1] || null;
}
export function timingRange(verse, segment, space = 'tanzil-spoken') {
  const end = segment.endWord ?? segment.word;
  if (!Number.isInteger(end) || end < segment.word) return null;
  const result = new Set();
  for (let i = segment.word; i <= end; i++) {
    const keys = mapTimingWord(verse, i, space);
    if (!keys) return null;
    keys.forEach(key => result.add(key));
  }
  return [...result];
}
