/* Ayat Tasbih Studio. Deliberately independent of the Hisn reader counter. */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const studio=$('ts-studio'),openButton=$('ts-open');
if(!studio||!openButton)return;
const STORAGE='ayatTasbihStudioV1',C=2*Math.PI*110,MAX_COUNT=999999999;
const LABELS={
 subhan:'سُبْحَانَ اللَّهِ',hamd:'الْحَمْدُ لِلَّهِ',akbar:'اللَّهُ أَكْبَرُ',
 astaghfir:'أَسْتَغْفِرُ اللَّهَ',tahlil:'لَا إِلَهَ إِلَّا اللَّهُ',
 salawat:'اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ',custom:''
};
const PRAYERS={
 '334':{reference:'صحيح مسلم 596أ',link:'https://sunnah.com/muslim:596',
  steps:[['سُبْحَانَ اللَّهِ',33,'تسبيح'],['الْحَمْدُ لِلَّهِ',33,'تحميد'],['اللَّهُ أَكْبَرُ',34,'تكبير']]},
 '333':{reference:'صحيح مسلم 597أ',link:'https://sunnah.com/muslim:597a',
  steps:[['سُبْحَانَ اللَّهِ',33,'تسبيح'],['الْحَمْدُ لِلَّهِ',33,'تحميد'],['اللَّهُ أَكْبَرُ',33,'تكبير'],
    ['لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ',1,'ختام']]}
};
const ar=n=>String(n).replace(/\d/g,d=>'٠١٢٣٤٥٦٧٨٩'[d]);
const bounded=(n,max=MAX_COUNT)=>Number.isFinite(Number(n))?Math.max(0,Math.min(max,Math.floor(Number(n)))):0;
const day=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
const fresh=()=>({mode:'free',selected:'subhan',customText:'',entries:{},prayer:'334',prayerIndex:{'334':0,'333':0},prayerCounts:{'334':[0,0,0],'333':[0,0,0,0]},haptic:true,day:day(),today:0,undo:null});
let state=fresh();
try{
 const x=JSON.parse(localStorage.getItem(STORAGE)||'null');
 if(x&&typeof x==='object'&&!Array.isArray(x)){
  state.mode=x.mode==='prayer'?'prayer':'free';
  state.selected=Object.prototype.hasOwnProperty.call(LABELS,x.selected)?x.selected:'subhan';
  state.customText=typeof x.customText==='string'?x.customText.slice(0,120):'';
  state.entries=x.entries&&typeof x.entries==='object'&&!Array.isArray(x.entries)?x.entries:{};
  state.prayer=Object.prototype.hasOwnProperty.call(PRAYERS,x.prayer)?x.prayer:'334';
  for(const id of Object.keys(PRAYERS)){
   const steps=PRAYERS[id].steps;
   state.prayerCounts[id]=steps.map((s,i)=>bounded(x.prayerCounts?.[id]?.[i],s[1]));
   state.prayerIndex[id]=bounded(x.prayerIndex?.[id],steps.length-1);
  }
  state.haptic=x.haptic!==false;
  state.day=typeof x.day==='string'?x.day:day();
  state.today=bounded(x.today);
  state.undo=x.undo||null;
 }
}catch{}
function refreshDay(){const d=day();if(state.day!==d){state.day=d;state.today=0;state.undo=null}}
function save(){refreshDay();try{localStorage.setItem(STORAGE,JSON.stringify(state))}catch{}}
function selectedEntry(){
 const id=state.selected,candidate=state.entries[id];
 if(!candidate||typeof candidate!=='object'||Array.isArray(candidate))state.entries[id]={count:0,goal:'33',customGoal:50};
 const e=state.entries[id];
 e.count=bounded(e.count);
 if(!['33','100','infinite','custom'].includes(e.goal))e.goal='33';
 e.customGoal=Math.max(1,bounded(e.customGoal,1000000)||50);
 return e;
}
function goalOf(e){return e.goal==='infinite'?null:e.goal==='custom'?e.customGoal:Number(e.goal)}
function prayer(){return PRAYERS[state.prayer]}
function stepIndex(){return bounded(state.prayerIndex[state.prayer],prayer().steps.length-1)}
function currentStep(){return prayer().steps[stepIndex()]}
const circle=$('ts-ring-fill'),countButton=$('ts-count');
let advanceTimer=null,resetTimer=null,resetArmed=false,returnFocus=null,ownsHistory=false;
function cancelAdvance(){if(advanceTimer!==null){clearTimeout(advanceTimer);advanceTimer=null}}
function disarmReset(){
 resetArmed=false;
 if(resetTimer!==null){clearTimeout(resetTimer);resetTimer=null}
 $('ts-reset').classList.remove('ts-confirm');
 $('ts-reset').lastChild.textContent=' تصفير';
}
function ringTo(phase,animate=false,restart=false){
 const offset=C*(1-Math.min(1,Math.max(0,phase)));
 if(!animate||restart){
  circle.style.transition='none';
  circle.style.strokeDashoffset=String(restart?C:offset);
  void circle.getBoundingClientRect();
  circle.style.transition='';
 }
 if(animate)circle.style.strokeDashoffset=String(offset);
}
function bounce(completed){
 countButton.classList.remove('ts-bump','ts-finished');
 void countButton.offsetWidth;
 countButton.classList.add(completed?'ts-finished':'ts-bump');
}
function haptic(completed=false){if(!state.haptic)return;try{navigator.vibrate?.(completed?[22,45,40]:12)}catch{}}
function activeData(){
 if(state.mode==='free'){
  const e=selectedEntry(),goal=goalOf(e),raw=e.count,mod=goal?raw%goal:raw;
  return {count:goal?(raw>0&&mod===0?goal:mod):raw,raw,goal,label:state.selected==='custom'?(state.customText.trim()||'ذكرك الخاص'):LABELS[state.selected],complete:Boolean(goal&&raw>0&&mod===0),cycles:goal?Math.floor(raw/goal):0};
 }
 const i=stepIndex(),step=currentStep(),raw=state.prayerCounts[state.prayer][i];
 return {count:raw,raw,goal:step[1],label:step[0],complete:raw===step[1],cycles:state.prayerCounts[state.prayer].reduce((sum,n)=>sum+n,0)};
}
function renderSteps(){
 const container=$('ts-steps');container.replaceChildren();
 const i=stepIndex(),values=state.prayerCounts[state.prayer],steps=prayer().steps;
 steps.forEach((step,j)=>{
  const pill=document.createElement('span');pill.className='ts-step';
  pill.dataset.state=j===i?'current':values[j]===step[1]?'done':'future';
  const mark=document.createElement('strong');mark.textContent=values[j]===step[1]?'✓':ar(j+1);
  const name=document.createElement('span');name.textContent=step[2];
  pill.append(mark,name);container.append(pill);
 });
 const source=$('ts-prayer-source');source.replaceChildren();
 source.append('الصيغة الواردة في ');
 const a=document.createElement('a');a.href=prayer().link;a.target='_blank';a.rel='noopener noreferrer';a.textContent=prayer().reference;
 source.append(a);
}
function render(opts={}){
 refreshDay();
 const isPrayer=state.mode==='prayer';
 studio.querySelectorAll('[role=tab]').forEach(tab=>{
  const chosen=tab.id===(isPrayer?'ts-tab-prayer':'ts-tab-free');
  tab.setAttribute('aria-selected',String(chosen));tab.tabIndex=chosen?0:-1
 });
 $('ts-free').hidden=isPrayer;$('ts-prayer').hidden=!isPrayer;
 studio.querySelectorAll('[data-ts-phrase]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tsPhrase===state.selected)));
 const e=selectedEntry();
 studio.querySelectorAll('[data-ts-goal]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tsGoal===e.goal)));
 $('ts-custom-row').hidden=state.selected!=='custom';
 if(document.activeElement!==$('ts-custom-text'))$('ts-custom-text').value=state.customText;
 $('ts-custom-goal-row').hidden=e.goal!=='custom';
 if(document.activeElement!==$('ts-custom-goal'))$('ts-custom-goal').value=String(e.customGoal);
 studio.querySelectorAll('[data-ts-prayer]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tsPrayer===state.prayer)));
 $('ts-prayer-navigation').hidden=!isPrayer;
 if(isPrayer)renderSteps();
 const data=activeData(),counts=state.prayerCounts[state.prayer],allDone=isPrayer&&prayer().steps.every((s,i)=>counts[i]===s[1]);
 $('ts-phrase-title').textContent=data.label;
 $('ts-number').textContent=ar(data.count);
 $('ts-number').classList.toggle('ts-long-number',String(data.count).length>=6);
 $('ts-of').textContent=data.goal?'من '+ar(data.goal):'بلا حدود ∞';
 $('ts-rounds-label').textContent=isPrayer?'إجمالي ذكر هذه الجلسة':'الدورات المكتملة';
 $('ts-rounds').textContent=ar(data.cycles);
 $('ts-today').textContent=ar(state.today);
 $('ts-haptic').setAttribute('aria-pressed',String(state.haptic));
 $('ts-undo').disabled=data.raw===0;
 $('ts-reset').disabled=data.raw===0&&!(isPrayer&&counts.some(n=>n>0));
 if(isPrayer){
  $('ts-prayer-prev').disabled=stepIndex()===0;
  $('ts-prayer-next').disabled=!data.complete;
  $('ts-prayer-next').textContent=allDone&&stepIndex()===prayer().steps.length-1?'جلسة جديدة':'التالي';
 }
 countButton.disabled=isPrayer&&data.complete;
 countButton.setAttribute('aria-label',isPrayer&&data.complete?'اكتمل هذا الذكر، انتقل إلى التالي':'عدّ '+data.label+'، '+ar(data.count)+(data.goal?' من '+ar(data.goal):' تسبيحة'));
 if(opts.message)$('ts-status').textContent=opts.message;
 else if(isPrayer&&allDone)$('ts-status').textContent='اكتملت الأذكار المحددة. تقبل الله منك.';
 else if(isPrayer&&data.complete)$('ts-status').textContent='تم هذا الذكر، انتقل للذي يليه.';
 else if(isPrayer)$('ts-status').textContent='المرحلة '+ar(stepIndex()+1)+' من '+ar(prayer().steps.length)+' • كل ضغطة ذكر واحد';
 else if(data.complete)$('ts-status').textContent='اكتملت دورة من '+ar(data.goal)+' تسبيحة ✦';
 else $('ts-status').textContent='كل ضغطة تُحسب مرة واحدة';
 ringTo(data.goal?data.count/data.goal:0,Boolean(opts.animate),Boolean(opts.restart));
}
function switchMode(mode){
 if(mode===state.mode)return;
 cancelAdvance();disarmReset();state.mode=mode;save();render();
}
function increment(){
 cancelAdvance();disarmReset();
 const before=activeData();
 if(state.mode==='prayer'){
  const idx=stepIndex(),step=currentStep(),values=state.prayerCounts[state.prayer];
  if(values[idx]>=step[1])return;
  values[idx]++;
  state.undo={mode:'prayer',which:state.prayer,idx,day:state.day};
 }else{
  const entry=selectedEntry();
  if(entry.count>=MAX_COUNT)return;
  entry.count++;
  state.undo={mode:'free',which:state.selected,day:state.day};
 }
 state.today=bounded(state.today+1);
 save();
 const after=activeData(),newCompletion=after.complete&&!before.complete;
 render({animate:true,restart:state.mode==='free'&&Boolean(after.goal)&&before.raw>0&&before.raw%after.goal===0});
 bounce(newCompletion);haptic(newCompletion);
 if(newCompletion&&state.mode==='prayer'&&stepIndex()<prayer().steps.length-1){
  const preset=state.prayer,stage=stepIndex();
  advanceTimer=setTimeout(()=>{
   advanceTimer=null;
   if(studio.hidden||state.mode!=='prayer'||state.prayer!==preset||stepIndex()!==stage)return;
   state.prayerIndex[preset]=stage+1;save();render();
  },880);
 }
}
function undo(){
 cancelAdvance();disarmReset();
 const data=activeData();if(data.raw===0)return;
 const canRewindToday=state.undo?.day===state.day&&state.undo?.mode===state.mode&&
  (state.mode==='free'?state.undo.which===state.selected:state.undo.which===state.prayer&&state.undo.idx===stepIndex());
 if(state.mode==='free')selectedEntry().count--;
 else state.prayerCounts[state.prayer][stepIndex()]--;
 if(canRewindToday)state.today=Math.max(0,state.today-1);
 state.undo=null;save();render({message:'تم التراجع عن آخر عدّة.'});
}
function reset(){
 cancelAdvance();
 if(!resetArmed){
  resetArmed=true;$('ts-reset').classList.add('ts-confirm');$('ts-reset').lastChild.textContent=' تأكيد التصفير';
  resetTimer=setTimeout(disarmReset,3500);return;
 }
 disarmReset();
 if(state.mode==='free')selectedEntry().count=0;
 else{state.prayerCounts[state.prayer]=prayer().steps.map(()=>0);state.prayerIndex[state.prayer]=0}
 state.undo=null;save();render({message:'تم تصفير العداد. يمكنك البدء من جديد.'});
}
function nextPrayer(){
 cancelAdvance();disarmReset();
 if(state.mode!=='prayer')return;
 const i=stepIndex(),steps=prayer().steps;
 if(state.prayerCounts[state.prayer][i]<steps[i][1])return;
 if(i===steps.length-1){state.prayerCounts[state.prayer]=steps.map(()=>0);state.prayerIndex[state.prayer]=0}
 else state.prayerIndex[state.prayer]=i+1;
 state.undo=null;save();render();
}
function previousPrayer(){
 cancelAdvance();disarmReset();
 if(state.mode!=='prayer'||stepIndex()===0)return;
 state.prayerIndex[state.prayer]--;state.undo=null;save();render();
}
function hide(fromHistory=false){
 if(studio.hidden)return;
 cancelAdvance();disarmReset();
 studio.hidden=true;document.body.classList.remove('ts-open');
 if(ownsHistory&&!fromHistory&&history.state?.ayatTasbih)history.back();
 ownsHistory=false;
 if(returnFocus?.isConnected)returnFocus.focus();
}
function open(){
 if(!studio.hidden)return;
 returnFocus=document.activeElement;studio.hidden=false;
 document.body.classList.add('ts-open');
 history.pushState({ayatTasbih:true},'','#tasbih');ownsHistory=true;
 render();$('ts-close').focus();
}
openButton.addEventListener('click',open);
$('ts-close').addEventListener('click',()=>hide());
$('ts-tab-free').addEventListener('click',()=>switchMode('free'));
$('ts-tab-prayer').addEventListener('click',()=>switchMode('prayer'));
$('ts-phrases').addEventListener('click',ev=>{
 const button=ev.target.closest('[data-ts-phrase]');if(!button)return;
 cancelAdvance();disarmReset();state.selected=button.dataset.tsPhrase;state.undo=null;save();render();
 if(state.selected==='custom'&&!state.customText)$('ts-custom-text').focus();
});
$('ts-custom-text').addEventListener('input',ev=>{
 state.customText=ev.target.value.slice(0,120);save();
 $('ts-phrase-title').textContent=state.customText.trim()||'ذكرك الخاص';
});
$('ts-goals').addEventListener('click',ev=>{
 const button=ev.target.closest('[data-ts-goal]');if(!button)return;
 disarmReset();const e=selectedEntry();e.goal=button.dataset.tsGoal;state.undo=null;save();render();
 if(e.goal==='custom')$('ts-custom-goal').focus();
});
$('ts-custom-goal').addEventListener('input',ev=>{
 const e=selectedEntry();e.customGoal=Math.max(1,bounded(ev.target.value,1000000)||1);save();render();
});
studio.querySelectorAll('[data-ts-prayer]').forEach(button=>button.addEventListener('click',()=>{
 cancelAdvance();disarmReset();state.prayer=button.dataset.tsPrayer;state.undo=null;save();render();
}));
$('ts-haptic').addEventListener('click',()=>{state.haptic=!state.haptic;save();render()});
countButton.addEventListener('click',increment);
$('ts-undo').addEventListener('click',undo);
$('ts-reset').addEventListener('click',reset);
$('ts-prayer-next').addEventListener('click',nextPrayer);
$('ts-prayer-prev').addEventListener('click',previousPrayer);
window.addEventListener('popstate',()=>{if(!studio.hidden)hide(true)});
document.addEventListener('keydown',ev=>{
 if(studio.hidden)return;
 if(ev.key==='Escape'){ev.preventDefault();ev.stopImmediatePropagation();hide();return}
 if(ev.key!=='Tab')return;
 const nodes=[...studio.querySelectorAll('button:not([disabled]),input:not([disabled])')].filter(el=>!el.hidden&&el.getClientRects().length);
 if(!nodes.length)return;
 const first=nodes[0],last=nodes[nodes.length-1];
 if(ev.shiftKey&&document.activeElement===first){ev.preventDefault();last.focus()}
 else if(!ev.shiftKey&&document.activeElement===last){ev.preventDefault();first.focus()}
},true);
save();
})();
