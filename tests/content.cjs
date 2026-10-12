// Dependency-free content regression checks. Does not emulate browser layout.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.join(__dirname,'..'),source=fs.readFileSync(path.join(root,'app.js'),'utf8');
class Node {
 constructor(tag='',text=''){this.tag=tag;this.value=text;this.children=[];this.dataset={};this.className='';}
 appendChild(n){this.children.push(n);return n;}
 replaceChildren(n){this.children=n.children;}
 setAttribute(){}
 set textContent(t){this.value=t;this.children=[];}
 get textContent(){return this.value+this.children.map(n=>n.textContent).join('');}
}
const document={createDocumentFragment:()=>new Node(),createTextNode:t=>new Node('#text',t),createElement:t=>new Node(t)};
const context=vm.createContext({document,els:{text:new Node()},console});
const names=source.slice(source.indexOf('    const SURAH_NAMES'),source.indexOf('    const THEMES'));
const parse=source.slice(source.indexOf('    function parseQuran'),source.indexOf('    // عرض صفحة'));
const render=source.slice(source.indexOf('    // Original geometric artwork'),source.indexOf('    function updatePageMeta'));
const digits=source.slice(source.indexOf('    function toArabicDigits'),source.indexOf('    function clamp'));
vm.runInContext(names+parse+render+digits,context);
const raw=fs.readFileSync(path.join(root,'data/quran-uthmani.txt'),'utf8');context.raw=raw;
vm.runInContext('var verses=parseQuran(raw); var tokens=buildTokens(verses);',context);
const expected=raw.split(/\r?\n/).filter(x=>/^\d+\|/.test(x)).map(x=>x.split('|').slice(2).join('|'));
assert.equal(context.verses.length,6236);assert.deepEqual(Array.from(context.verses,v=>v.text),expected);
const pages=JSON.parse(fs.readFileSync(path.join(root,'data/verse-to-page.json')));
assert.equal(pages.length,604);
const starts=pages.map(p=>context.verses.findIndex(v=>v.surah===p.surah&&v.ayah===p.ayah));
assert.equal(starts[0],0);assert.ok(starts.every((x,i)=>x>=0&&(!i||x>starts[i-1])));
let offset=0;const tokenStarts=context.verses.map(v=>{const x=offset;offset+=v.text.split(/\s+/).length;return x});
const all=(node)=>[node,...node.children.flatMap(all)];
const clean=node=>['surah-heading','ayah-marker'].includes(node.className)?'':node.value+node.children.map(clean).join('');
let headings=0,basmalas=0,markers=0;
for(let i=0;i<604;i++){
 context.start=tokenStarts[starts[i]];context.end=tokenStarts[starts[i+1]]??offset;
 vm.runInContext('renderRange(start,end)',context);
 const nodes=all(context.els.text), vv=context.verses.slice(starts[i],starts[i+1]);
 assert.equal(clean(context.els.text).replace(/\s+/g,' ').trim(),vv.map(v=>v.text).join(' '),`page ${i+1}`);
 const h=nodes.filter(n=>n.className==='surah-heading'),b=nodes.filter(n=>n.className==='surah-basmala'),m=nodes.filter(n=>n.className==='ayah-marker');
 assert.deepEqual(h.map(n=>+n.dataset.surah),Array.from(vv.filter(v=>v.ayah===1),v=>v.surah));
 assert.equal(b.length,vv.filter(v=>v.ayah===1&&v.surah!==9).length);assert.equal(m.length,vv.length);
 b.forEach((x,j)=>assert.equal(clean(x).trim(),vv.filter(v=>v.ayah===1&&v.surah!==9)[j].text.split(/\s+/).slice(0,4).join(' ')));
 if(i===0)assert.equal(all(b[0]).filter(n=>n.className==='ayah-marker').length,1);
 headings+=h.length;basmalas+=b.length;markers+=m.length;
}
assert.equal(headings,114);assert.equal(basmalas,113);assert.equal(markers,6236);
console.log('PASS: 604 pages; 6236 unchanged verses and markers; 114 headings; 113 opening basmalas (including numbered Fatiha); no Tawbah basmala. DOM/content only; browser layout not tested.');
