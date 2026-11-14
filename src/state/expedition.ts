import { PLANETS, habitability, EVAC_MAP, LAZARUS_MAP, worldMap, walkable, routeTo, type Planet } from '../data/expeditions';
import type { MapDef } from '../data/maps';
import { podModel, podStationChecks, evacRequirements, EVAC_STATIONS, emptyAdvancedReport } from '../sim/missions/evac';
import type { Decisions, EvalContext, MissionReport } from '../sim/types';
import { SURVEY_KITS, kitById, surfaceThermalKw, SURFACE_TIME_SCALE, wetBurnFuel, type SurveyKitId } from '../sim/missions/survey';
import { recorder, recordData, type DataLedger } from '../sim/models/operations';
import { check, segmentReview, MODEL_VERSION, designSnapshot } from '../sim/engineering';

export interface CrewState {id:string;name:string;astronautId:string;connected:boolean;location:string;x:number;y:number;facing:string;moving:boolean;alive:boolean;health:number;suit:number;escaped:boolean;safe:boolean;beacon:boolean;pod:Decisions;oxygen:number;energy:number;fuel:number;supplies:number;localS:number;travel:null|{to:string;left:number;from?:string};route:{x:number;y:number}[];}
export interface Allocation {fuel:number;energy:number;oxygen:number;supplies:number;}
export interface Survey {planetId:string;owner:string;collected:boolean;delivered:boolean;allocation:Partial<Allocation>;kitId:SurveyKitId;collectionLeftS:number;data:DataLedger;energyUsedKwh:number;}
export interface Hazard {id:string;x:number;y:number;r:number;kind:'radiation'|'breach'|'organism'|'storm';}
export interface Organism {x:number;y:number;target:string|null;memoryS:number;replanS:number;patrol:number;route:{x:number;y:number}[];}
export interface Runtime {
 crew:CrewState[];phase:'design'|'allocation'|'exploration'|'voting';elapsed:number;surveys:Survey[];earthFuel:number;
 sealed:string[];votes:Record<string,string>;voteRound:number;voteLeft:number;events:{time:number;text:string}[];
 owners:Record<string,string>;selected:string|null;notice:string;organism:Organism;
}
export const LIMITS={fuel:24000,energy:480,oxygen:6,supplies:50};
export const ALLOCATIONS={fuel:[1000,2200,3600],energy:[40,90,150],oxygen:[.5,1,1.8],supplies:[5,10,20]};
export const EARTH_DV=4800,EARTH_DRY=10000,EARTH_ISP=900;
export const earthFuelRequired=()=>EARTH_DRY*(Math.exp(EARTH_DV/(EARTH_ISP*9.80665))-1);
export function landerModel(planet:Planet,a:Partial<Allocation>,kitId:SurveyKitId='balanced'){
 const dry=1390+kitById(kitId).massKg+(a.oxygen||0)+(a.supplies||0),isp=340,g=9.80665,leg=planet.roundTripDv/2;
 return {dry,requiredFuel:dry*(Math.exp(planet.roundTripDv/(isp*g))-1),outboundFuel:wetBurnFuel(dry,a.fuel||0,leg),returnFuel:dry*(Math.exp(leg/(isp*g))-1),outboundOxygen:.84*planet.transitH/24,outboundEnergy:planet.transitH*2.2};
}
export function initRuntime(id:string,players:{id?:string;name:string;astronautId:string}[],map:MapDef,stations:{id:string;subsystem:string}[],affinity:(astronaut:string,sys:string)=>number):Runtime{
 const crew=players.map((p,i):CrewState=>({id:p.id||p.name,name:p.name,astronautId:p.astronautId,connected:true,location:'ship',x:map.spawn.x+.5+(i%2)*.6,y:map.spawn.y+.5+Math.floor(i/2)*.6,facing:'down',moving:false,alive:true,health:100,suit:100,escaped:false,safe:false,beacon:false,pod:{},oxygen:0,energy:0,fuel:0,supplies:0,localS:0,travel:null,route:[]}));
 const load:Record<string,number>={};const owners:Record<string,string>={};for(const st of stations){const best=crew.slice().sort((a,b)=>(load[a.id]||0)*3-affinity(a.astronautId,st.subsystem)-((load[b.id]||0)*3-affinity(b.astronautId,st.subsystem))||a.id.localeCompare(b.id))[0];owners[st.id]=best.id;load[best.id]=(load[best.id]||0)+1;}
 const count=crew.length===1?3:crew.length;
 return {crew,phase:id==='lazarus'?'allocation':'design',elapsed:0,surveys:id==='lazarus'?PLANETS.slice(0,count).map((p,i)=>({planetId:p.id,owner:crew[i%crew.length].id,collected:false,delivered:false,allocation:{},kitId:'balanced',collectionLeftS:0,data:recorder(SURVEY_KITS.balanced.recorderBits),energyUsedKwh:0})):[],earthFuel:0,sealed:[],votes:{},voteRound:0,voteLeft:120,events:[],owners,selected:null,notice:'',organism:{x:20.5,y:24.5,target:null,memoryS:0,replanS:0,patrol:0,route:[]}};
}
export function totals(r:Runtime){const out={fuel:r.earthFuel,energy:0,oxygen:0,supplies:0};for(const s of r.surveys)for(const k of Object.keys(out) as (keyof Allocation)[])out[k]+=s.allocation[k]||0;return out;}
export function log(r:Runtime,text:string){r.events.push({time:r.elapsed,text});r.events=r.events.slice(-60);r.notice=text;}
export function hazards(r:Runtime,location:string):Hazard[]{
 if(location==='ship')return [{id:'leak-a',x:20.5,y:10,r:1.0,kind:'radiation'},{id:'breach-b',x:23.5,y:19.5,r:1.0,kind:'breach'},{id:'leak-c',x:20.5,y:33,r:1,kind:'radiation'},...(r.sealed.includes('containment')?[]:[{id:'organism',x:r.organism.x,y:r.organism.y,r:.65,kind:'organism' as const}])].filter(h=>!r.sealed.includes(h.id)) as Hazard[];
 const index=PLANETS.findIndex(p=>p.id===location),map=worldMap(LAZARUS_MAP,location);const points:Hazard[]=[];
 for(let i=0;i<8;i++){const x=8+(i*7+index*3)%36,y=8+(i*11+index*5)%28;if(walkable(map,x+.5,y+.5))points.push({id:'surface-'+i,x:x+.5,y:y+.5,r:.7,kind:'storm'});}
 if(index===2||index===3){const phase=(r.elapsed%24)/24;points.push({id:'front',x:25,y:5+phase*34,r:1.7,kind:index===3?'radiation':'storm'});}
 return points;
}
export const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
/** Walls and solid equipment occlude sight; running can still be heard through a nearby wall. */
export function clearSight(map:MapDef,a:{x:number;y:number},b:{x:number;y:number}){
 const steps=Math.ceil(distance(a,b)*5);for(let i=1;i<steps;i++)if(!walkable(map,a.x+(b.x-a.x)*i/steps,a.y+(b.y-a.y)*i/steps))return false;return true;
}
export function advanceOrganism(r:Runtime,map:MapDef,dt:number){
 const o=r.organism;if(r.sealed.includes('containment')){o.target=null;o.route=[];return;}
 const sensed=r.crew.filter(p=>p.alive&&p.connected&&!p.escaped&&!p.travel&&p.location==='ship'&&((p.moving&&distance(o,p)<=6)||(distance(o,p)<=9&&clearSight(map,o,p)))).sort((a,b)=>distance(o,a)-distance(o,b))[0];
 const changed=!!sensed&&sensed.id!==o.target;
 if(sensed){o.target=sensed.id;o.memoryS=6;}else{o.memoryS=Math.max(0,o.memoryS-dt);if(!o.memoryS)o.target=null;}
 const target=r.crew.find(p=>p.id===o.target&&p.alive&&!p.escaped);if(!target)o.target=null;
 o.replanS-=dt;
 if(o.replanS<=0||changed||!o.route.length){
  const patrol=[{x:20.5,y:35},{x:20.5,y:6},{x:20.5,y:24.5}];
  if(!o.target&&distance(o,patrol[o.patrol])<.3)o.patrol=(o.patrol+1)%patrol.length;
  // On losing contact, finish the last known route instead of tracking through walls.
  if(sensed||!o.target)o.route=routeTo(map,o,sensed||patrol[o.patrol]);o.replanS=.65;
 }
 let remaining=dt*(o.target?2.3:1.6);
 while(o.route.length&&remaining>0){const t=o.route[0],d=distance(o,t);if(d<.01){o.route.shift();continue;}const step=Math.min(d,remaining),x=o.x+(t.x-o.x)/d*step,y=o.y+(t.y-o.y)/d*step;if(!walkable(map,x,y)){o.route=[];break;}o.x=x;o.y=y;remaining-=step;if(step===d)o.route.shift();}
}
export function nearDirector(p:CrewState,map:MapDef){return p.location==='ship'&&distance(p,{x:map.director.x+1,y:map.director.y+1.375})<1.45;}
export function advanceCrew(r:Runtime,missionId:string,map:MapDef,inputs:Record<string,{x:number;y:number}>,dt:number){
 if(missionId==='evac')advanceOrganism(r,map,dt);
 for(const p of r.crew){if(!p.alive||p.escaped||!p.connected)continue;
  if(p.travel){p.travel.left-=dt;if(p.travel.left<=0){const t=p.travel;p.travel=null;p.location=t.to;const w=worldMap(map,t.to);p.x=w.spawn.x+.5;p.y=w.spawn.y+.5;p.route=[];if(t.from){const survey=r.surveys.find(s=>s.planetId===t.from)!;recordData(survey.data,{timeS:r.elapsed,kind:'recover',label:'Recorder recovered aboard mothership',bits:survey.data.storedBits});survey.delivered=true;log(r,p.name+' delivered '+PLANETS.find(x=>x.id===t.from)!.name+' observations.');}}continue;}
  const w=worldMap(map,p.location);let input=inputs[p.id]||{x:0,y:0};if(input.x||input.y)p.route=[];
  while(p.route.length&&distance(p,p.route[0])<.08)p.route.shift();let dx=input.x,dy=input.y;const target=p.route[0];if(target){dx=target.x-p.x;dy=target.y-p.y;}
  const length=Math.hypot(dx,dy),speed=4.79*(p.suit<20?.6:1),step=Math.min(speed*dt,target?length:Infinity);dx=length?dx/length*step:0;dy=length?dy/length*step:0;
  const blocked=(x:number,y:number)=>missionId==='evac'&&hazards(r,'ship').some(h=>h.kind==='breach'&&Math.hypot(x-h.x,y-h.y)<h.r*.7);
  if(walkable(w,p.x+dx,p.y)&&!blocked(p.x+dx,p.y))p.x+=dx;if(walkable(w,p.x,p.y+dy)&&!blocked(p.x,p.y+dy))p.y+=dy;
  p.moving=!!length;if(length)p.facing=Math.abs(dx)>Math.abs(dy)?dx<0?'left':'right':dy<0?'up':'down';
  if(missionId==='evac'){
   for(const h of hazards(r,'ship'))if(distance(p,h)<h.r+.25){const rate=h.kind==='organism'?28:h.kind==='breach'?18:6;p.health-=dt*rate;p.suit=Math.max(0,p.suit-dt*(h.kind==='radiation'?7:2));}
  }
  if(missionId==='lazarus'&&p.location!=='ship'){
   const planet=PLANETS.find(x=>x.id===p.location)!,survey=r.surveys.find(s=>s.planetId===p.location)!,kit=kitById(survey.kitId);p.localS+=dt;
   let collecting=survey.collectionLeftS>0;
   if(collecting&&distance(p,{x:w.director.x+1,y:w.director.y+1.375})>1.8){survey.collectionLeftS=0;collecting=false;log(r,p.name+' interrupted the survey. Remain at the research station to finish.');}
   const activeS=collecting?Math.min(dt,survey.collectionLeftS):0;
   const energyUsed=((.65+surfaceThermalKw(planet.temperature)+(p.moving?.15:0))*dt+kit.powerKw*activeS)*SURFACE_TIME_SCALE/3600;
   p.oxygen=Math.max(0,p.oxygen-.84/86400*SURFACE_TIME_SCALE*dt);p.energy=Math.max(0,p.energy-energyUsed);survey.energyUsedKwh+=energyUsed;
   if(collecting&&p.energy>0&&p.oxygen>0){survey.collectionLeftS=Math.max(0,survey.collectionLeftS-dt);if(!survey.collectionLeftS){recordData(survey.data,{timeS:r.elapsed,kind:'collect',label:planet.name+' field observations',bits:kit.dataBits});survey.collected=true;log(r,p.name+' completed '+planet.name+' observations with '+kit.name+'.');}}
   let exposure=0;for(const h of hazards(r,p.location))if(distance(p,h)<h.r+.25)exposure+=6;
   if(p.localS>planet.windowS)exposure+=12;
   if(p.supplies<planet.suppliesKg)exposure+=1.5;
   if(p.oxygen<=0||p.energy<=0)exposure+=30;p.health-=exposure*dt;
  }
  p.health=Math.max(0,p.health);if(!p.health){p.alive=false;p.route=[];log(r,p.name+' did not survive the expedition.');}
 }
}
export type ExpeditionAction={type:'allocate';planetId:string;resource:keyof Allocation;value:number}|{type:'surveyKit';planetId:string;kitId:SurveyKitId}|{type:'earthFuel';value:number}|{type:'dispatch'}|{type:'depart';planetId:string}|{type:'collect'}|{type:'return'}|{type:'vote';planetId:string}|{type:'board'}|{type:'seal';hazardId:string}|{type:'navigate';x:number;y:number};
export function expeditionAction(r:Runtime,missionId:string,map:MapDef,actor:string,a:ExpeditionAction,isHost:boolean):'finish'|void{
 const p=r.crew.find(p=>p.id===actor);if(!p||!p.connected||!p.alive||p.travel||p.escaped)throw Error('Your astronaut cannot perform this action now.');
 if(a.type==='navigate'){const w=worldMap(map,p.location);if(!Number.isFinite(a.x)||!Number.isFinite(a.y))throw Error('Invalid destination.');const route=routeTo(w,p,{x:a.x,y:a.y});if(!route.length)throw Error('Choose reachable clear floor.');p.route=route;return;}
 if(a.type==='seal'){
  if(missionId!=='evac')throw Error('No emergency repair here.');if(a.hazardId==='containment'){if(distance(p,{x:20.5,y:15})>1.8)throw Error('Reach the Deck B containment control.');}else{const h=hazards(r,'ship').find(x=>x.id===a.hazardId&&x.kind!=='organism');if(!h||distance(p,h)>2.2)throw Error('Reach the marked repair point.');}
  if(!r.sealed.includes(a.hazardId)){r.sealed.push(a.hazardId);log(r,p.name+' isolated '+a.hazardId+'.');}return;
 }
 if(a.type==='board'){
  if(missionId!=='evac'||!nearDirector(p,map))throw Error('Reach the evacuation dock.');const pod=podModel(p.pod);if(!pod.complete)throw Error('Complete all six personal capsule workstations.');p.escaped=true;p.safe=pod.coreSafe;p.beacon=pod.beacon>=.9;p.route=[];log(r,p.name+' launched a capsule; its calculated return will be evaluated.');if(r.crew.every(c=>c.escaped||!c.alive))return 'finish';return;
 }
 if(missionId!=='lazarus')throw Error('Expedition control is unavailable.');
 if(a.type==='allocate'||a.type==='earthFuel'||a.type==='surveyKit'){
  if(r.phase!=='allocation'||!nearDirector(p,map))throw Error('Configure resources at Expedition Control before dispatch.');
  if(a.type==='earthFuel'){if(!isHost||![5000,8000,11000].includes(a.value))throw Error('Only the host may choose a listed mothership reserve.');r.earthFuel=a.value;return;}
  const s=r.surveys.find(s=>s.planetId===a.planetId);if(!s||(!isHost&&s.owner!==actor))throw Error('That lander belongs to another crew member.');
  if(a.type==='surveyKit'){if(!Object.hasOwn(SURVEY_KITS,a.kitId))throw Error('Choose a listed survey kit.');s.kitId=a.kitId;s.data=recorder(kitById(a.kitId).recorderBits);return;}
  if(!Object.hasOwn(ALLOCATIONS,a.resource)||!ALLOCATIONS[a.resource].includes(a.value))throw Error('Choose a listed allocation.');s.allocation[a.resource]=a.value;return;
 }
 if(a.type==='dispatch'){
  if(!isHost||r.phase!=='allocation'||!nearDirector(p,map))throw Error('The host authorizes dispatch at Expedition Control.');
  if(!r.earthFuel||r.surveys.some(s=>Object.keys(ALLOCATIONS).some(k=>!s.allocation[k as keyof Allocation])))throw Error('Complete every resource allocation and the mothership reserve.');const t=totals(r);if((Object.keys(LIMITS) as (keyof Allocation)[]).some(k=>t[k]>LIMITS[k]))throw Error('Allocations exceed the shared supplies.');r.phase='exploration';log(r,'Expeditions authorized. Every dataset and every astronaut must return.');return;
 }
 if(a.type==='depart'){
  if(r.phase!=='exploration'||!nearDirector(p,map))throw Error('Board your lander at Expedition Control.');const s=r.surveys.find(s=>s.owner===actor&&s.planetId===a.planetId&&!s.delivered);if(!s)throw Error('Choose your assigned unfinished expedition.');const planet=PLANETS.find(x=>x.id===s.planetId)!,a0=s.allocation as Allocation,m=landerModel(planet,a0,s.kitId);if(a0.fuel<m.outboundFuel||a0.oxygen<m.outboundOxygen||a0.energy<m.outboundEnergy)throw Error('This lander cannot complete even the outbound transit. Revise allocations before authorizing dispatch, or abandon and retry.');p.fuel=a0.fuel-m.outboundFuel;p.oxygen=a0.oxygen-m.outboundOxygen;p.energy=a0.energy-m.outboundEnergy;p.supplies=a0.supplies;p.localS=0;p.route=[];p.travel={to:planet.id,left:5};log(r,p.name+' departed for '+planet.name+'.');return;
 }
 const survey=r.surveys.find(s=>s.planetId===p.location&&s.owner===actor),planet=PLANETS.find(x=>x.id===p.location);
 if(a.type==='collect'){const w=worldMap(map,p.location);if(!survey||distance(p,{x:w.director.x+1,y:w.director.y+1.375})>1.6)throw Error('Reach the research station.');if(survey.collected||survey.collectionLeftS>0)throw Error('Survey already collected or in progress.');survey.collectionLeftS=kitById(survey.kitId).collectionS;p.route=[];log(r,p.name+' started the timed '+planet!.name+' survey. Stay at the station.');return;}
 if(a.type==='return'){
  const w=worldMap(map,p.location);if(!survey||!survey.collected||distance(p,{x:w.spawn.x+.5,y:w.spawn.y+.5})>1.6)throw Error('Collect the data, then return to the lander.');const m=landerModel(planet!,survey.allocation,survey.kitId);if(p.fuel<m.returnFuel||p.oxygen<m.outboundOxygen||p.energy<m.outboundEnergy){p.alive=false;p.health=0;log(r,'A required lander lacked fuel, oxygen or energy for return.');return 'finish';}const used=wetBurnFuel(m.dry,p.fuel,planet!.roundTripDv/2);p.fuel-=used;p.oxygen-=m.outboundOxygen;p.energy-=m.outboundEnergy;p.route=[];p.travel={to:'ship',from:planet!.id,left:5};log(r,p.name+' return burn used '+used.toFixed(1)+' kg from actual wet mass.');return;
 }
 if(a.type==='vote'){
  if(r.phase!=='voting'||!r.surveys.some(s=>s.planetId===a.planetId&&s.delivered))throw Error('Vote after every dataset returns.');r.votes[actor]=a.planetId;if(r.crew.every(p=>r.votes[p.id])){
   const counts:Record<string,number>={};Object.values(r.votes).forEach(v=>counts[v]=(counts[v]||0)+1);const sorted=Object.entries(counts).sort((a,b)=>b[1]-a[1]);const tied=sorted.length>1&&sorted[0][1]===sorted[1][1];if(tied&&!r.voteRound){r.voteRound=1;r.votes={};r.voteLeft=60;log(r,'Vote tied. Discuss the evidence and vote again.');}else{r.selected=tied?null:sorted[0][0];return 'finish';}
  }return;
 }
 throw Error('Action unavailable in this mission phase.');
}
export function expeditionReport(r:Runtime,id:string,ctx:EvalContext):MissionReport{
 const report=emptyAdvancedReport(id,id==='evac'?'Emergency Evacuation':'Project Lazarus',ctx);
 report.criticalFindings=[];
 report.design=runtimeDesign(id,r,{},ctx.mode);
 const requirements = id==='evac' ? r.crew.flatMap(p=>[
  ...evacRequirements(p.pod).map(c=>({...c,id:p.id+':'+c.id,label:p.name+' · '+c.label})),
  check(p.id+':survival',p.name+' · survival and boarding','user',p.alive&&p.escaped,p.alive?(p.escaped?'Boarded':'Aboard damaged ship'):'Lost','Survive and board a viable capsule','Isolate containment, avoid hazards and complete your personal stations.'),
 ]) : lazarusRequirements(r,true);
 report.engineering={modelVersion:MODEL_VERSION,durationS:id==='evac'?72*3600:Math.max(...r.surveys.map(s=>2*PLANETS.find(p=>p.id===s.planetId)!.transitH*3600))+r.elapsed*60,
  requirements,segments:segmentReview(requirements),timeline:r.events.map(e=>({timeS:e.time,label:e.text,detail:'Elapsed player seconds; transit durations and surface compression are modeled separately.'})),
  assumptions:id==='evac'?['Capsule hardware, guidance factor and beacon availability are synthetic teaching proxies, not reliability predictions.','72 modeled hours to a rescue transport. Its onward Earth transfer is a story assumption.','Life support checks oxygen and scrubbing; the THERMAL role is an ECLSS assignment, not an independently solved thermal design.','One-person capsule accommodation is included in the 280 kg base mass. Beacon tracking is local to the rescue corridor.']:
   ['Synthetic planets and in-system landers; interstellar transport is a story assumption.','Survey-kit mass is included in both burns. The minimum return reserve differs from the fuel actually burned at carried wet mass.','Surface time and consumables are compressed 60:1. Thermal proxy is 0.006 kW/K from 295 K, plus 0.65 kW base and 0.15 kW while walking.','Measurements are stored in a finite recorder, then physically recovered at the mothership. No instantaneous interstellar radio link is assumed.','Lander dry mass conservatively retains allocated consumable mass on return. Duration is a bounding scenario estimate; events below show the player clock.']};
 report.contributions=r.crew.map(p=>({playerName:p.name,astronautId:p.astronautId,stations:id==='evac'?Object.keys(p.pod):r.surveys.filter(s=>s.owner===p.id).map(s=>s.planetId+(s.delivered?' · delivered':' · missing')),pointsEarned:id==='evac'?EVAC_STATIONS.filter(st=>p.pod[st.id]&&podStationChecks(st.id,podModel(p.pod)).every(c=>c.ok)).length:r.surveys.filter(s=>s.owner===p.id&&s.delivered).length,pointsPossible:id==='evac'?6:r.surveys.filter(s=>s.owner===p.id).length}));
 if(id==='evac'){
  const safe=r.crew.filter(p=>p.alive&&p.escaped&&p.safe),full=safe.length===r.crew.length&&safe.every(p=>p.beacon);
  report.outcome=full?'SUCCESS':safe.length>r.crew.length/2||(r.crew.length===1&&safe.length===1)?'PARTIAL':'FAILED';
  report.score=full?Math.min(10,8+safe.reduce((n,p)=>n+p.health/100,0)/safe.length+Math.min(1,r.sealed.length*.2)):report.outcome==='PARTIAL'?6.5:Math.min(4.5,safe.length/r.crew.length*5);
  report.headline=full?'Every capsule reached the rescue rendezvous':report.outcome==='PARTIAL'?'Some rescue objectives were met':'The evacuation did not preserve a viable majority';
  report.summary=`${safe.length}/${r.crew.length} crew achieved a viable rescue rendezvous. A tie in a two-person crew is not a surviving majority. The final Earth return is provided by the fictional rescue transport.`;
  report.keyMetrics=[{label:'Viable returns',value:`${safe.length}/${r.crew.length}`},{label:'Isolated hazards',value:String(r.sealed.length)}];
  for(const p of r.crew){
   const pod=podModel(p.pod);
   for(const st of EVAC_STATIONS){
    const o=st.options.find(o=>o.id===p.pod[st.id]),checks=podStationChecks(st.id,pod),points=o?checks.filter(c=>c.ok).length/Math.max(1,checks.length):0;
    const unmet=checks.filter(c=>!c.ok);
    report.subsystems.push({stationId:p.id+':'+st.id,subsystem:st.subsystem,title:p.name+' · '+st.title,choiceName:o?.name||'Not completed',selectedSpecs:o?.specs||[],
     results:checks.map(c=>({label:c.label,value:`${c.value.toFixed(2)} ${c.unit} / ${c.limit.toFixed(2)} ${c.label==='Wet mass'?'maximum':'minimum'}`})),
     rating:points===1?'strong':points>0?'weak':'critical',points,maxPoints:1,
     effect:unmet.length?`This subsystem missed: ${unmet.map(c=>c.label).join(', ')}. ${st.id==='comms'?'The pod can reach the corridor, but rescuers cannot track it often enough for full success.':'This limits the capsule even if the other systems pass.'}`:'This subsystem met its own checks with the full capsule mass and load included.',
     lesson:evacRequirements(p.pod).find(c=>c.id.startsWith(st.id+':'))!.advice,committedBy:p.name});
   }
  }
  report.lessons=['More propellant improves delta-v while increasing launch mass.','Battery capacity is energy; multiply load by the full 72-hour rescue duration.','A viable trajectory and a usable rescue beacon are separate requirements.','Seal or bypass hazards and coordinate station access. Death is permanent in this scenario.'];
 }else{
  const all=r.surveys.every(s=>s.delivered)&&r.crew.every(p=>p.alive&&p.location==='ship'&&!p.travel),reserve=r.earthFuel>=earthFuelRequired();
  const selected=PLANETS.find(p=>p.id===r.selected),suitable=!!selected&&habitability(selected).every(x=>x.ok),complete=r.surveys.every(s=>usefulSurvey(s)>=.9);
  report.outcome=all&&reserve?(suitable&&complete?'SUCCESS':'PARTIAL'):'FAILED';
  report.score=report.outcome==='SUCCESS'?Math.min(10,8.5+r.surveys.reduce((n,s)=>n+usefulSurvey(s),0)/r.surveys.length):report.outcome==='PARTIAL'?6.5:Math.min(4.5,r.surveys.filter(s=>s.delivered).length/r.surveys.length*4.5);
  report.headline=report.outcome==='SUCCESS'?'The evidence and crew can return home':report.outcome==='PARTIAL'?'Returns achieved; evidence or selection fell short':'A critical expedition condition failed';
  report.summary=`${r.surveys.filter(s=>s.delivered).length}/${r.surveys.length} required datasets physically returned. Candidate: ${selected?.name||'no consensus'}. All worlds and habitability criteria are synthetic training data.`;
  report.keyMetrics=[{label:'Datasets delivered',value:`${r.surveys.filter(s=>s.delivered).length}/${r.surveys.length}`},{label:'Mothership return propellant',value:`${r.earthFuel.toFixed(0)} / ${earthFuelRequired().toFixed(0)} kg required`},{label:'Crew alive',value:`${r.crew.filter(p=>p.alive).length}/${r.crew.length}`}];
  for(const s of r.surveys){
   const planet=PLANETS.find(p=>p.id===s.planetId)!,kit=kitById(s.kitId),m=landerModel(planet,s.allocation,s.kitId),useful=usefulSurvey(s);
   report.subsystems.push({stationId:s.planetId,subsystem:'PROP',title:planet.name+' expedition',choiceName:kit.name,selectedSpecs:Object.entries(s.allocation).map(([k,v])=>({label:k,value:String(v)})),
    results:[{label:'Round-trip minimum propellant',value:m.requiredFuel.toFixed(0)+' kg'},{label:'Useful evidence returned',value:(useful*100).toFixed(1)+'%'},{label:'Recorder generated / received / stored / dropped',value:[s.data.generatedBits,s.data.receivedBits,s.data.storedBits,s.data.droppedBits].map(n=>(n/1e9).toFixed(2)).join(' / ')+' Gbit'},{label:'Surface electrical consumption',value:s.energyUsedKwh.toFixed(2)+' kWh'}],
    rating:useful>=.9?'strong':s.delivered?'weak':'critical',points:s.delivered?useful:0,maxPoints:1,effect:'Kit mass affects both burns; field time, walking and environmental thermal control consume electricity. The dataset only reaches mission control on physical return.',lesson:'Protect both transit reserves and collect sufficiently complete measurements before choosing a planet.',committedBy:r.crew.find(p=>p.id===s.owner)?.name});
  }
  if(selected)for(const h of habitability(selected))if(!h.ok)report.criticalFindings.push(`${selected.name}: ${h.label} ${h.value} ${h.unit} is outside the training criteria.`);
  report.lessons=['Minimum fuel for feasibility and actual fuel burned at carried wet mass are different quantities.','Walking consumes suit electricity, not lander propellant.','A habitable-zone location alone does not establish human habitability.','The final choice needs every stated environmental criterion and sufficiently complete returned evidence.'];
 }
 for(const c of requirements)if(c.mandatory&&c.met!==true)report.criticalFindings.push(`${c.label}: ${c.actual}; ${c.required}. Next attempt: ${c.advice}`);
 report.score=Math.round(report.score*10)/10;
 return report;
}
export function usefulSurvey(s:Survey){return s.data.generatedBits>0?s.data.receivedBits/s.data.generatedBits*kitById(s.kitId).completeness:0;}
export function runtimeDesign(id:string,r:Runtime,decisions:Decisions,mode:'solo'|'multiplayer'){
 const design=designSnapshot(id,id==='evac'?r.crew[0].pod:decisions,`${mode}:${r.crew.length}`);
 if(id==='evac')design.capsules=r.crew.map(p=>({astronautId:p.astronautId,decisions:{...p.pod}}));
 if(id==='lazarus'){design.expeditions=r.surveys.map(s=>({planetId:s.planetId,kitId:s.kitId,allocation:{...s.allocation}}));design.earthFuel=r.earthFuel;}
 return design;
}
export function lazarusRequirements(r:Runtime,flown=false){
 const total=totals(r),all=r.surveys.every(s=>s.delivered)&&r.crew.every(p=>p.alive&&p.location==='ship'&&!p.travel);
 const selected=PLANETS.find(p=>p.id===r.selected);
 return [
  check('supplies','Shared resource allocation','launch',(Object.keys(LIMITS) as (keyof Allocation)[]).every(k=>total[k]<=LIMITS[k]),'Fuel, electricity, oxygen and supplies','Stay within all four shared limits','Reduce allocations or use a lighter survey kit.'),
  check('earth','Mothership return reserve','space',r.earthFuel>=earthFuelRequired(),r.earthFuel.toFixed(0)+' kg','At least '+earthFuelRequired().toFixed(0)+' kg','Ring-fence return propellant before dividing lander resources.'),
  ...r.surveys.map(s=>{const planet=PLANETS.find(p=>p.id===s.planetId)!,m=landerModel(planet,s.allocation,s.kitId);return check(s.planetId+':transit',planet.name+' · both transit legs','space',Object.keys(ALLOCATIONS).every(k=>!!s.allocation[k as keyof Allocation])?((s.allocation.fuel??0)>=m.requiredFuel&&(s.allocation.oxygen??0)>=m.outboundOxygen*2&&(s.allocation.energy??0)>=m.outboundEnergy*2):undefined,`${m.requiredFuel.toFixed(0)} kg fuel; ${(m.outboundOxygen*2).toFixed(2)} kg O₂; ${(m.outboundEnergy*2).toFixed(1)} kWh minimum`,'Both legs plus a surface reserve','Check the outbound and return legs before authorizing dispatch.');}),
  check('crew','All crew and datasets returned','ground',flown?all:undefined,`${r.surveys.filter(s=>s.delivered).length}/${r.surveys.length} datasets`,'Every assigned dataset and astronaut aboard','Return to the lander and protect fuel, oxygen, energy and environmental deadlines.'),
  ...r.surveys.map(s=>check(s.planetId+':science',PLANETS.find(p=>p.id===s.planetId)!.name+' · useful measurements','user',flown?usefulSurvey(s)>=.9:kitById(s.kitId).completeness>=.9,`${((flown?usefulSurvey(s):kitById(s.kitId).completeness)*100).toFixed(1)}%`,'At least 90% measurement completeness recovered','Choose a complete survey kit, finish collection and recover its recorder.')),
  check('selection','Evidence-based candidate decision','user',flown?!!selected&&habitability(selected).every(h=>h.ok):undefined,selected?.name||'Not voted yet','Unique candidate meeting every synthetic criterion','Compare all six measurements and discuss the crew vote.'),
 ];
}
export const ADVANCED_MAPS={evac:EVAC_MAP,lazarus:LAZARUS_MAP};
