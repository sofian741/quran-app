// Reviewed against pinned 262.qvp (see sources.json). Four paths draw لَّوْ,
// two paths draw مَا. Every original contour is retained, including all marks.
// This partitions interaction/color only; it never changes page ink/placement.
export const SUBWORDS = {'15:7:1':[
  {key:'15:7:1~1',ordinal:1,text:'لَّوْ',paths:[372,373,374,375]},
  {key:'15:7:1~2',ordinal:2,text:'مَا',paths:[376,377]}
]};
export function subwordBox(geometry,part){
  const boxes=part.paths.map(i=>geometry.paths[i].box);
  return [Math.min(...boxes.map(b=>b[0])),Math.min(...boxes.map(b=>b[1])),Math.max(...boxes.map(b=>b[2])),Math.max(...boxes.map(b=>b[3]))];
}
