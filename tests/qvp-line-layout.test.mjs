import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decodeGeometry} from '../mushaf-qvp/vendor/lite.js';
import {layoutGeometry,paintGeometry,headingBox,GRID} from '../mushaf-qvp/line-layout.js';
const raw=n=>decodeGeometry(fs.readFileSync(new URL('../data/qvp/pages/'+String(n).padStart(3,'0')+'.qvp',import.meta.url)));
const near=(a,b,label='coordinate')=>assert.ok(Math.abs(a-b)<.00012,label+': '+a+' vs '+b);
const bodyCentre=(g,line)=>{
 const p=g.words.filter(w=>w.lineIndex===line).flatMap(w=>g.paths.slice(w.firstPath,w.firstPath+w.nPaths)).filter(p=>p.kind===0);
 return (Math.min(...p.map(p=>p.box[1]))+Math.max(...p.map(p=>p.box[3])))/2;
};

test('all 602 normal pages share one 15-slot grid, preserve every contour and have no collisions or crop',()=>{
 let minGap=Infinity,headings=0,sajdah=0;
 for(let n=3;n<=604;n++){
  const source=raw(n),g=layoutGeometry(raw(n)),stats=g.layoutStats;
  assert.equal(stats.mode,'fixed-grid');assert.equal(g.height,760);assert.equal(g.width,360);assert.equal(stats.inkScale,1.055);assert.equal(GRID.inkStroke,.4);
  assert.deepEqual(stats.centres,Array.from({length:15},(_,i)=>30+50*i));
  assert.equal(GRID.slots*GRID.band+(GRID.slots+1)*GRID.gap,g.height);
  for(let i=0;i<g.paths.length;i++){
   const p=g.paths[i],before=source.paths[i];assert.deepEqual(p.ops,before.ops);
   if(p.hidden){assert.equal(n,17);assert.deepEqual(p.pts,before.pts);continue;}
   const line=stats.pathLines[i],scale=GRID.inkScale,dx=GRID.width/2-source.width/2*scale,dy=stats.centres[line]-stats.sourceCentres[line]*scale;
   const pad=GRID.inkStroke/2;assert.ok(p.box[0]>=pad&&p.box[2]<=g.width-pad&&p.box[1]>=pad&&p.box[3]<=g.height-pad,'crop '+n+':'+i);
   for(let k=0;k<p.pts.length;k+=2){near(p.pts[k],before.pts[k]*scale+dx);near(p.pts[k+1],before.pts[k+1]*scale+dy,'contour '+n+':'+i);}
  }
  for(let i=0;i<g.words.length;i++){
   const w=g.words[i],before=source.words[i];assert.equal(w.text,before.text);assert.equal(w.lineIndex,before.lineIndex);
   near(w.box[2]-w.box[0],(before.box[2]-before.box[0])*GRID.inkScale);near(w.box[3]-w.box[1],(before.box[3]-before.box[1])*GRID.inkScale);
  }
  for(const line of g.lines){
   if(line.nWords)near(bodyCentre(g,line.index),stats.centres[line.index],'body centre '+n+':'+line.index);
   if(line.index){
    const previous=g.paths.filter((p,i)=>!p.hidden&&stats.pathLines[i]===line.index-1),next=g.paths.filter((p,i)=>!p.hidden&&stats.pathLines[i]===line.index);
    for(const a of previous)for(const b of next)if(a.box[0]-GRID.inkStroke/2<b.box[2]+GRID.inkStroke/2&&a.box[2]+GRID.inkStroke/2>b.box[0]-GRID.inkStroke/2){
     const gap=b.box[1]-a.box[3]-GRID.inkStroke;assert.ok(gap>=0,'colliding contours '+n+':'+line.index);minGap=Math.min(gap,minGap);
    }
   }
  }
  const headers=g.decorations.filter(d=>d.decoration===1),basmalas=g.decorations.filter(d=>d.decoration===2);
  assert.equal(g.lines.filter(l=>l.nWords).length,15-headers.length-basmalas.length,'reserved heading slots '+n);
  for(const d of headers){
   const b=headingBox(g,d),i=d.lineIndex;assert.ok(b[1]>=0&&b[3]<=g.height);
   if(i)assert.ok(b[1]>g.lines[i-1].box[3],'heading collides with preceding verse '+n);
   if(i<14)assert.ok(b[3]<g.lines[i+1].box[1],'heading collides with basmala '+n);
   headings++;
  }
  const last=new Map(g.words.map(w=>[w.surah+':'+w.ayah,w.lineIndex]));
  for(const d of g.decorations.filter(d=>d.decoration===0))
   for(let i=d.firstPath;i<d.firstPath+d.nPaths;i++)assert.equal(stats.pathLines[i],last.get(d.surah+':'+d.ayah),'verse marker owner '+n);
  for(const d of g.decorations.filter(d=>d.decoration===4))for(let i=d.firstPath;i<d.firstPath+d.nPaths;i++)if(g.paths[i].mark===31){
   const box=source.paths[i].box,under=source.words.filter(w=>w.box[0]<box[2]&&w.box[2]>box[0]&&w.box[1]>=box[1]-2).sort((a,b)=>a.box[1]-b.box[1])[0];
   assert.equal(stats.pathLines[i],under.lineIndex,'sajdah underline owner '+n);sajdah++;
  }
  assert.equal(layoutGeometry(g),g,'layout is applied once');
 }
 assert.equal(headings,112);assert.ok(sajdah>=15);assert.ok(minGap>=0);
});

test('page 17 source running head and folio remain clipped when the presentation grows',()=>{
 const g=layoutGeometry(raw(17)),view=paintGeometry(g),hidden=g.paths.map((p,i)=>p.hidden?i:-1).filter(i=>i>=0);
 assert.equal(hidden.length,4);for(const i of hidden){assert.equal(view.paths[i].ops.length,0);assert.ok(g.paths[i].ops.length>0);}
});

test('pages 1 and 2 use a single 1.5x affine zoom, including all marks, without changing composition',()=>{
 for(const n of [1,2]){
  const source=raw(n),g=layoutGeometry(raw(n)),{zoom,dx,dy}=g.layoutStats;
  assert.equal(g.layoutStats.mode,'opening-zoom');assert.equal(zoom,1.5);assert.equal(g.height,550);
  for(let i=0;i<g.paths.length;i++){
   const p=g.paths[i],old=source.paths[i];assert.deepEqual(p.ops,old.ops);
   for(let k=0;k<p.pts.length;k+=2){near(p.pts[k],old.pts[k]*zoom+dx);near(p.pts[k+1],old.pts[k+1]*zoom+dy);}
   assert.ok(p.box[0]>=6+GRID.inkStroke/2&&p.box[2]<=339-GRID.inkStroke/2&&p.box[1]>=10+GRID.inkStroke/2&&p.box[3]<=540-GRID.inkStroke/2);
  }
  for(let i=0;i<g.words.length;i++){const w=g.words[i],old=source.words[i];assert.equal(w.text,old.text);near(w.box[2]-w.box[0],(old.box[2]-old.box[0])*zoom);near(w.box[3]-w.box[1],(old.box[3]-old.box[1])*zoom);}
 }
});
