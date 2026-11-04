// Page-local, one-time QVP geometry layout. No DOM measurements or per-frame work.
// All word, decoration and hit-test paths are moved together.
const validBox = b => Array.isArray(b) && b.length === 4 &&
    b.every(Number.isFinite) && b[2] >= b[0] && b[3] >= b[1];

function union(boxes) {
    if (!boxes.length) return null;
    return [
        Math.min(...boxes.map(b => b[0])),
        Math.min(...boxes.map(b => b[1])),
        Math.max(...boxes.map(b => b[2])),
        Math.max(...boxes.map(b => b[3]))
    ];
}

function owningLine(geometry, record) {
    if (Number.isInteger(record.lineIndex) &&
        record.lineIndex >= 0 && record.lineIndex < geometry.lines.length)
        return record.lineIndex;
    // Rare decoration with no associated line: use the closest occupied line.
    const center=(record.box[1]+record.box[3])/2;
    let nearest=0, distance=Infinity;
    geometry.lines.forEach((line,i)=>{
        if (!validBox(line.box)) return;
        const d=Math.abs(center-(line.box[1]+line.box[3])/2);
        if(d<distance){distance=d;nearest=i;}
    });
    return nearest;
}

function zoomOpening(geometry, requested) {
    const box=union(geometry.paths.map(p=>p.box).filter(validBox));
    if(!box)return 1;
    // Fixed QVP canvas 345x550. Always keep a small visible safety margin.
    const availableX=geometry.width-6, availableY=geometry.height-12;
    const applied=Math.min(requested,availableX/(box[2]-box[0]),availableY/(box[3]-box[1]));
    if(!Number.isFinite(applied)||applied<=1)return 1;
    const centerX=(box[0]+box[2])/2, centerY=(box[1]+box[3])/2;
    const moveX=geometry.width/2-centerX*applied;
    const moveY=geometry.height/2-centerY*applied;
    const tx=x=>x*applied+moveX, ty=y=>y*applied+moveY;
    for(const path of geometry.paths){
        for(let k=0;k<path.pts.length;k+=2){path.pts[k]=tx(path.pts[k]);path.pts[k+1]=ty(path.pts[k+1]);}
        path.box=[tx(path.box[0]),ty(path.box[1]),tx(path.box[2]),ty(path.box[3])];
    }
    for(const record of [...geometry.words,...geometry.decorations,...geometry.ayahs,...geometry.lines]){
        if(validBox(record.box))record.box=[tx(record.box[0]),ty(record.box[1]),tx(record.box[2]),ty(record.box[3])];
    }
    return applied;
}

export function layoutGeometry(geometry) {
    if(geometry.layoutApplied)return geometry;
    if(geometry.number<=2){
        geometry.layoutStats={mode:'opening-zoom',zoom:zoomOpening(geometry,geometry.number===1?1.28:1.10)};
        geometry.layoutApplied=true;
        return geometry;
    }
    const n=geometry.lines.length;
    const records=Array.from({length:n},()=>[]);
    for(const item of [...geometry.words,...geometry.decorations])
        if(validBox(item.box))records[owningLine(geometry,item)].push(item.box);
    const bands=records.map(union),occupied=bands.map((b,i)=>b?i:-1).filter(i=>i>=0);
    if(occupied.length<2){geometry.layoutStats={mode:'original'};geometry.layoutApplied=true;return geometry;}
    const used=occupied.reduce((sum,i)=>sum+bands[i][3]-bands[i][1],0);
    // Equal optical whitespace: the page starts and ends with the same gap
    // as between every occupied text / basmala / title band.
    const gap=(geometry.height-used)/(occupied.length+1);
    if(!Number.isFinite(gap)||gap<2){
        geometry.layoutStats={mode:'original',reason:'insufficient-vertical-space'};
        geometry.layoutApplied=true;return geometry;
    }
    const shift=Array(n).fill(0);
    let cursor=gap;
    for(const i of occupied){
        shift[i]=cursor-bands[i][1];
        cursor+=bands[i][3]-bands[i][1]+gap;
    }
    // Resolve all paths exactly once. A page might have decorative contours
    // beyond the words, so unmatched paths inherit their nearest band.
    const ownership=new Int16Array(geometry.paths.length).fill(-1);
    for(const record of [...geometry.words,...geometry.decorations]){
        const line=owningLine(geometry,record);
        for(let i=record.firstPath;i<record.firstPath+record.nPaths;i++){
            if(i>=0&&i<ownership.length && ownership[i]<0)ownership[i]=line;
        }
    }
    for(let i=0;i<geometry.paths.length;i++){
        const path=geometry.paths[i];
        let line=ownership[i];
        if(line<0){
            const center=(path.box[1]+path.box[3])/2;
            line=occupied.reduce((best,j)=>Math.abs(center-(bands[j][1]+bands[j][3])/2)<
                Math.abs(center-(bands[best][1]+bands[best][3])/2)?j:best,occupied[0]);
        }
        const dy=shift[line];if(!dy)continue;
        for(let k=1;k<path.pts.length;k+=2)path.pts[k]+=dy;
        path.box[1]+=dy;path.box[3]+=dy;
    }
    for(const record of [...geometry.words,...geometry.decorations]){
        const dy=shift[owningLine(geometry,record)];
        record.box[1]+=dy;record.box[3]+=dy;
    }
    for(const line of geometry.lines){
        if(!validBox(line.box))continue;
        const index=geometry.lines.indexOf(line),dy=shift[index];
        line.box[1]+=dy;line.box[3]+=dy;
    }
    for(const ayah of geometry.ayahs){
        const boxes=geometry.words.slice(ayah.firstWord,ayah.firstWord+ayah.nWords)
            .map(w=>w.box).filter(validBox);
        ayah.box=union(boxes);
    }
    geometry.layoutStats={mode:'equal-gaps',gap,occupied:occupied.length,lines:n};
    geometry.layoutApplied=true;
    return geometry;
}
