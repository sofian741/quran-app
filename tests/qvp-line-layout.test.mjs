import test from 'node:test';
import assert from 'node:assert/strict';
import {layoutGeometry} from '../mushaf-qvp/line-layout.js';

function sample(number=4){
 const heights=[15,23,17,20];
 const paths=heights.map((height,i)=>({
   pts:new Float32Array([8,80+i*45,22,80+i*45,22,80+i*45+height]),
   box:[8,80+i*45,22,80+i*45+height]
 }));
 const words=heights.map((height,i)=>({
   firstPath:i,nPaths:1,lineIndex:i,box:[8,80+i*45,22,80+i*45+height]
 }));
 const lines=heights.map((height,i)=>({
   firstWord:i,nWords:1,box:[8,80+i*45,22,80+i*45+height]
 }));
 return {number,width:345,height:550,paths,words,decorations:[],
   lines,ayahs:[]};
}

test('equal gaps include upper and lower whitespace, preserving widths and hit boxes',()=>{
 const g=sample(),widths=g.words.map(w=>w.box[2]-w.box[0]);
 layoutGeometry(g);
 assert.equal(g.layoutStats.mode,'equal-gaps');
 const edges=g.words.map(w=>w.box);
 const gaps=[edges[0][1],...edges.slice(1).map((b,i)=>b[1]-edges[i][3]),550-edges.at(-1)[3]];
 assert.ok(gaps.every(x=>Math.abs(x-gaps[0])<.0001));
 assert.deepEqual(g.words.map(w=>w.box[2]-w.box[0]),widths);
 g.words.forEach((w,i)=>assert.ok(Math.abs(w.box[1]-g.paths[i].box[1])<.0001));
 const first=g.words[0].box[1];layoutGeometry(g);assert.equal(g.words[0].box[1],first);
});
test('title, basmala and verse marks stay on the same shifted line',()=>{
 const g=sample();g.decorations=[
   {decoration:1,lineIndex:0,firstPath:4,nPaths:1,box:[3,78,100,96]},
   {decoration:2,lineIndex:1,firstPath:5,nPaths:1,box:[3,122,100,140]},
   {decoration:0,lineIndex:2,firstPath:6,nPaths:1,box:[3,166,30,189]}
 ];
 for(const d of g.decorations)g.paths.push({pts:new Float32Array([3,d.box[1],30,d.box[3]]),box:[...d.box]});
 const before=g.decorations.map(d=>d.box[1]-g.words[d.lineIndex].box[1]);
 layoutGeometry(g);
 g.decorations.forEach((d,i)=>{
   assert.ok(Math.abs(d.box[1]-g.words[d.lineIndex].box[1]-before[i])<.0001);
   assert.equal(d.box[1],g.paths[d.firstPath].box[1]);
 });
});
test('opening pages are magnified uniformly without cropping and without reflow',()=>{
 for(const n of [1,2]){
   const g=sample(n),w=g.words[0].box[2]-g.words[0].box[0],h=g.words[0].box[3]-g.words[0].box[1];
   layoutGeometry(g);
   assert.equal(g.layoutStats.mode,'opening-zoom');
   assert.ok(g.layoutStats.zoom>1);
   assert.ok(Math.abs((g.words[0].box[2]-g.words[0].box[0])/w-g.layoutStats.zoom)<.0001);
   assert.ok(Math.abs((g.words[0].box[3]-g.words[0].box[1])/h-g.layoutStats.zoom)<.0001);
   assert.ok(g.paths.every(p=>p.box[0]>=2.99&&p.box[2]<=342.01&&p.box[1]>=5.99&&p.box[3]<=544.01));
 }
});
