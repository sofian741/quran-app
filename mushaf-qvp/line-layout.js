// Fixed printed-line grid. Uniformly size glyphs within fixed rows; never stretch them or
// reflow words. Reference for body-only centres, ayah-marker ownership and
// sajdah underlines: Quran Engine qvp-core/src/lib.rs at sources.json engineCommit.
export const GRID=Object.freeze({slots:15,band:40,gap:10,width:360,height:760,inkScale:1.055,maxInkScale:2,inkStroke:.68,markerStroke:.4});
const valid=b=>Array.isArray(b)&&b.length===4&&b.every(Number.isFinite);
const middle=b=>(b[1]+b[3])/2;
const union=boxes=>boxes.length?[
 Math.min(...boxes.map(b=>b[0])),Math.min(...boxes.map(b=>b[1])),
 Math.max(...boxes.map(b=>b[2])),Math.max(...boxes.map(b=>b[3]))
]:null;
const onPage=(box,g)=>valid(box)&&box[2]>0&&box[0]<g.width&&box[3]>0&&box[1]<g.height;

// Fit the *printed contours* rather than enlarging the CSS canvas: text, harakat
// and verse numerals then share exactly the same affine transformation.
// This conservative bound uses the actual glyph boxes on each of the 15 rows.
// Never reduce a formerly working page below its previous 1.055 scale.
function chooseInkScale(g,ownership,centres,targets,originalWidth){
 const buckets=Array.from({length:GRID.slots},()=>[]);
 for(let i=0;i<g.paths.length;i++){
  const p=g.paths[i],line=ownership[i];
  if(!p.hidden&&line>=0&&valid(p.box))buckets[line].push(p.box);
 }
 const pad=Math.max(GRID.inkStroke,GRID.markerStroke)/2+.5;
 const fits=scale=>{
  const dx=GRID.width/2-originalWidth/2*scale;
  const projected=buckets.map((boxes,line)=>{
   const dy=targets[line]-centres[line]*scale;
   let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
   for(const b of boxes){
    left=Math.min(left,b[0]*scale+dx);right=Math.max(right,b[2]*scale+dx);
    top=Math.min(top,b[1]*scale+dy);bottom=Math.max(bottom,b[3]*scale+dy);
   }
   return [left,top,right,bottom];
  });
  for(const b of projected)if(b[0]<pad||b[2]>GRID.width-pad||b[1]<pad||b[3]>GRID.height-pad)return false;
  // This is intentionally stricter than checking only pixels with common X:
  // a positive gap between successive rows prevents touching even at dense marks.
  for(let i=1;i<projected.length;i++)
   if(projected[i][1]-projected[i-1][3]<Math.max(GRID.inkStroke,GRID.markerStroke)+.5)return false;
  // The heritage surah frame is taller than its printed QVP title contours.
  // Reserve the frame's full height, not just the glyph bounding box.
  for(const d of g.decorations){
   if(d.decoration!==1)continue;
   const line=d.lineIndex,boxes=g.paths.slice(d.firstPath,d.firstPath+d.nPaths).filter(p=>!p.hidden);
   if(!boxes.length)continue;
   const dy=targets[line]-centres[line]*scale;
   const top=Math.min(...boxes.map(p=>p.box[1]))*scale+dy;
   const bottom=Math.max(...boxes.map(p=>p.box[3]))*scale+dy;
   const h=(bottom-top+8)*224/144,mid=(top+bottom)/2;
   if(mid-h/2<pad||mid+h/2>GRID.height-pad)return false;
   if(line>0&&mid-h/2<=projected[line-1][3]+pad)return false;
   if(line<GRID.slots-1&&mid+h/2>=projected[line+1][1]-pad)return false;
  }
  return true;
 };
 let low=GRID.inkScale,high=GRID.maxInkScale;
 if(!fits(low))return low; // honour the proven prior layout on unusual pages
 if(fits(high))return high;
 for(let i=0;i<14;i++){
  const mid=(low+high)/2;
  if(fits(mid))low=mid;else high=mid;
 }
 return Math.floor(low*1000)/1000;
}
const boxAt=(b,scale,dx,dy)=>[b[0]*scale+dx,b[1]*scale+dy,b[2]*scale+dx,b[3]*scale+dy];

export function layoutGeometry(g,{uniformInkScale=GRID.inkScale,calibrate=false}={}){
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
 // A shared scale is calibrated against all 602 pages during asset preparation.
 // The historical 1.055 baseline is the safe compatibility fallback for old assets.
 const scale=calibrate?chooseInkScale(g,ownership,centres,targets,originalWidth):uniformInkScale;
 // Every printed page was already verified against this scale during preparation;
 // never repeat a binary search on every page turn on a low-end phone.
 if(!Number.isFinite(scale)||scale<GRID.inkScale||scale>GRID.maxInkScale)
  throw new Error('Invalid shared ink scale '+scale+' on page '+g.number);
 const bands=Array.from({length:GRID.slots},()=>[]);
 for(let i=0;i<g.paths.length;i++){
  const p=g.paths[i];if(p.hidden)continue;
  const line=ownership[i];if(line<0)throw new Error('Unowned visible path '+g.number+':'+i);
  const dx=GRID.width/2-originalWidth/2*scale,dy=targets[line]-centres[line]*scale;
  for(let k=0;k<p.pts.length;k+=2){p.pts[k]=p.pts[k]*scale+dx;p.pts[k+1]=p.pts[k+1]*scale+dy;}
  p.box=boxAt(p.box,scale,dx,dy);bands[line].push(p.box);
 }
 for(const w of g.words)w.box=boxAt(w.box,scale,GRID.width/2-originalWidth/2*scale,targets[w.lineIndex]-centres[w.lineIndex]*scale);
 for(const d of g.decorations){
  const boxes=g.paths.slice(d.firstPath,d.firstPath+d.nPaths).filter(p=>!p.hidden).map(p=>p.box);
  if(boxes.length)d.box=union(boxes);
 }
 for(let i=0;i<GRID.slots;i++)g.lines[i].box=union(bands[i]);
 for(const a of g.ayahs)a.box=union(g.words.slice(a.firstWord,a.firstWord+a.nWords).map(w=>w.box));
 g.width=GRID.width;g.height=GRID.height;
 g.layoutStats={mode:'fixed-grid',inkScale:scale,sourceWidth:originalWidth,slots:GRID.slots,band:GRID.band,gap:GRID.gap,pitch:GRID.band+GRID.gap,centres:targets,sourceCentres:centres,pathLines:ownership};
 g.layoutApplied=true;return g;
}

// Enlarge each original verse-number cartouche around its own center without
// changing word order or page typography. The *same* factor is used on all pages.
const intersects=(a,b,pad=0)=>a[0]<b[2]+pad&&a[2]>b[0]-pad&&a[1]<b[3]+pad&&a[3]>b[1]-pad;
const overlapArea=(a,b,pad=0)=>Math.max(0,Math.min(a[2],b[2]+pad)-Math.max(a[0],b[0]-pad))*Math.max(0,Math.min(a[3],b[3]+pad)-Math.max(a[1],b[1]-pad));
const scaledAround=(b,cx,cy,s)=>[cx+(b[0]-cx)*s,cy+(b[1]-cy)*s,cx+(b[2]-cx)*s,cy+(b[3]-cy)*s];
export function maxSafeMarkerScale(g,upper=1.5){
 const markers=g.decorations.filter(d=>d.decoration===0&&valid(d.box));
 if(!markers.length)return upper;
 const other=[...g.words,...g.decorations.filter(d=>d.decoration!==0)]
  .filter(r=>valid(r.box)).map(r=>r.box);
 const pad=Math.max(GRID.inkStroke,GRID.markerStroke)/2+.25;
 const safe=s=>{
  for(const d of markers){
   const cx=(d.box[0]+d.box[2])/2,cy=(d.box[1]+d.box[3])/2;
   const b=scaledAround(d.box,cx,cy,s);
   if(b[0]<pad||b[1]<pad||b[2]>g.width-pad||b[3]>g.height-pad)return false;
   for(const word of other)if(overlapArea(b,word,pad)>overlapArea(d.box,word,pad)+.01)return false;
  }
  // No newly intersecting cartouches.
  for(let i=0;i<markers.length;i++)for(let j=i+1;j<markers.length;j++){
   const a=markers[i].box,b=markers[j].box;
   const ca=[(a[0]+a[2])/2,(a[1]+a[3])/2],cb=[(b[0]+b[2])/2,(b[1]+b[3])/2];
   if(overlapArea(scaledAround(a,...ca,s),scaledAround(b,...cb,s),pad)>overlapArea(a,b,pad)+.01)return false;
  }
  return true;
 };
 let low=1,high=upper;
 if(!safe(1))return 1;
 if(safe(high))return high;
 for(let i=0;i<12;i++){const mid=(low+high)/2;if(safe(mid))low=mid;else high=mid;}
 return Math.floor(low*1000)/1000;
}
export function enlargeVerseMarkers(g,scale){
 if(!Number.isFinite(scale)||scale<1||scale>1.5)throw new Error('Invalid marker scale');
 if(scale===1)return g;
 if(g.markerScaleApplied)throw new Error('Marker scale applied twice');
 for(const d of g.decorations.filter(d=>d.decoration===0&&valid(d.box))){
  const cx=(d.box[0]+d.box[2])/2,cy=(d.box[1]+d.box[3])/2;
  for(let i=d.firstPath;i<d.firstPath+d.nPaths;i++){
   const p=g.paths[i];if(p.hidden)continue;
   for(let k=0;k<p.pts.length;k+=2){
    p.pts[k]=cx+(p.pts[k]-cx)*scale;
    p.pts[k+1]=cy+(p.pts[k+1]-cy)*scale;
   }
   p.box=scaledAround(p.box,cx,cy,scale);
  }
  d.box=scaledAround(d.box,cx,cy,scale);
 }
 g.markerScaleApplied=true;
 return g;
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
