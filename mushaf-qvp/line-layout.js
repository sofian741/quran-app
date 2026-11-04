// Fixed printed-line grid. Uniformly size glyphs within fixed rows; never stretch them or
// reflow words. Reference for body-only centres, ayah-marker ownership and
// sajdah underlines: Quran Engine qvp-core/src/lib.rs at sources.json engineCommit.
export const GRID=Object.freeze({slots:15,band:40,gap:10,width:360,height:760,inkScale:1.035});
const valid=b=>Array.isArray(b)&&b.length===4&&b.every(Number.isFinite);
const middle=b=>(b[1]+b[3])/2;
const union=boxes=>boxes.length?[
 Math.min(...boxes.map(b=>b[0])),Math.min(...boxes.map(b=>b[1])),
 Math.max(...boxes.map(b=>b[2])),Math.max(...boxes.map(b=>b[3]))
]:null;
const onPage=(box,g)=>valid(box)&&box[2]>0&&box[0]<g.width&&box[3]>0&&box[1]<g.height;
const boxAt=(b,scale,dx,dy)=>[b[0]*scale+dx,b[1]*scale+dy,b[2]*scale+dx,b[3]*scale+dy];

export function layoutGeometry(g){
 if(g.layoutApplied)return g;
 const originalHeight=g.height,originalWidth=g.width;
 // Artwork outside the source viewBox (four records on p17) was never visible.
 // A taller presentation must not pull that running head/page number into view.
 for(const path of g.paths)path.hidden=!onPage(path.box,g);
 if(g.number<=2){
  const ink=union(g.paths.filter(p=>!p.hidden).map(p=>p.box));
  const zoom=Math.min(1.5,(g.width-12)/(ink[2]-ink[0]),(g.height-20)/(ink[3]-ink[1]));
  const dx=g.width/2-((ink[0]+ink[2])/2)*zoom;
  const dy=g.height/2-middle(ink)*zoom;
  for(const path of g.paths){
   if(path.hidden)continue;
   for(let k=0;k<path.pts.length;k+=2){path.pts[k]=path.pts[k]*zoom+dx;path.pts[k+1]=path.pts[k+1]*zoom+dy;}
   path.box=boxAt(path.box,zoom,dx,dy);
  }
  for(const record of [...g.words,...g.decorations,...g.lines,...g.ayahs])
   if(valid(record.box)&&onPage(record.box,{...g,height:originalHeight}))record.box=boxAt(record.box,zoom,dx,dy);
  g.layoutStats={mode:'opening-zoom',zoom,dx,dy};g.layoutApplied=true;return g;
 }
 if(g.lines.length!==GRID.slots)throw new Error('Expected 15 printed slots: '+g.number);
 const centres=g.lines.map(line=>{
  const boxes=[];
  for(let i=line.firstWord;i<line.firstWord+line.nWords;i++){
   const w=g.words[i];for(let p=w.firstPath;p<w.firstPath+w.nPaths;p++)
    if(g.paths[p].kind===0&&!g.paths[p].hidden)boxes.push(g.paths[p].box);
  }
  if(!boxes.length)for(const d of g.decorations)
   if(d.lineIndex===line.index&&(d.decoration===1||d.decoration===2))boxes.push(d.box);
  const box=union(boxes);if(!box)throw new Error('Empty printed slot '+g.number+':'+line.index);
  return middle(box);
 });
 const targets=centres.map((_,i)=>GRID.gap+GRID.band/2+i*(GRID.band+GRID.gap));
 const ownership=new Int16Array(g.paths.length).fill(-1);
 const lastWord=new Map(g.words.map(w=>[w.surah+':'+w.ayah,w]));
 function assign(record,line){
  if(!Number.isInteger(line)||line<0||line>=GRID.slots)throw new Error('Missing printed line '+g.number);
  for(let p=record.firstPath;p<record.firstPath+record.nPaths;p++){
   if(ownership[p]>=0&&ownership[p]!==line)throw new Error('Conflicting path ownership');
   ownership[p]=line;
  }
 }
 for(const w of g.words)assign(w,w.lineIndex);
 for(const d of g.decorations){
  if(!onPage(d.box,g))continue;
  let line=d.decoration===0?lastWord.get(d.surah+':'+d.ayah)?.lineIndex:d.lineIndex;
  if(!Number.isInteger(line)||line<0)throw new Error('Unresolved decoration '+g.number+':'+d.decoration);
  assign(d,line);
  // A sajdah underline can belong several rows above its closing sign.
  // Attach each underline to the overlapping word directly below it.
  for(let p=d.firstPath;p<d.firstPath+d.nPaths;p++)if(g.paths[p].mark===31){
   const box=g.paths[p].box;
   const under=g.words.filter(w=>w.box[0]<box[2]&&w.box[2]>box[0]&&w.box[1]>=box[1]-2)
    .sort((a,b)=>a.box[1]-b.box[1])[0];
   if(!under)throw new Error('Unresolved sajdah underline '+g.number);
   ownership[p]=under.lineIndex;
  }
 }
 const bands=Array.from({length:GRID.slots},()=>[]);
 for(let i=0;i<g.paths.length;i++){
  const p=g.paths[i];if(p.hidden)continue;
  const line=ownership[i];if(line<0)throw new Error('Unowned visible path '+g.number+':'+i);
  const scale=GRID.inkScale,dx=GRID.width/2-originalWidth/2*scale,dy=targets[line]-centres[line]*scale;
  for(let k=0;k<p.pts.length;k+=2){p.pts[k]=p.pts[k]*scale+dx;p.pts[k+1]=p.pts[k+1]*scale+dy;}
  p.box=boxAt(p.box,scale,dx,dy);bands[line].push(p.box);
 }
 for(const w of g.words)w.box=boxAt(w.box,GRID.inkScale,GRID.width/2-originalWidth/2*GRID.inkScale,targets[w.lineIndex]-centres[w.lineIndex]*GRID.inkScale);
 for(const d of g.decorations){
  const boxes=g.paths.slice(d.firstPath,d.firstPath+d.nPaths).filter(p=>!p.hidden).map(p=>p.box);
  if(boxes.length)d.box=union(boxes);
 }
 for(let i=0;i<GRID.slots;i++)g.lines[i].box=union(bands[i]);
 for(const a of g.ayahs)a.box=union(g.words.slice(a.firstWord,a.firstWord+a.nWords).map(w=>w.box));
 g.width=GRID.width;g.height=GRID.height;
 g.layoutStats={mode:'fixed-grid',inkScale:GRID.inkScale,sourceWidth:originalWidth,slots:GRID.slots,band:GRID.band,gap:GRID.gap,pitch:GRID.band+GRID.gap,centres:targets,sourceCentres:centres,pathLines:ownership};
 g.layoutApplied=true;return g;
}

// Preserve upstream data/path indices; discard only the originally clipped ink
// from the painter's view. Word/ayah references and original buffers stay intact.
export function paintGeometry(g){
 return {...g,paths:g.paths.map(p=>p.hidden?{...p,ops:new Uint8Array(0),pts:new Float32Array(0)}:p)};
}

export function headingBox(g,decoration){
 const zoom=g.layoutStats.mode==='opening-zoom'?g.layoutStats.zoom:1;
 // Full-width frame with enough room for title ink and padding, independent of
 // whether the page contains 8 or 15 source rows.
 const height=(decoration.box[3]-decoration.box[1]+8*zoom)*224/144;
 const y=middle(decoration.box);return [4,y-height/2,g.width-4,y+height/2];
}
