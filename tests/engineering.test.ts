import {describe,test,expect} from 'vitest';
import {recorder,recordData,simulateRecorder,simulateEnergy,dailyDataEvents} from '../src/sim/models/operations';
import {wetBurnFuel,SURVEY_KITS,surfaceThermalKw} from '../src/sim/missions/survey';
import {PLANETS,worldMap} from '../src/data/expeditions';
import {computeEarthwatch,evaluateEarthwatch} from '../src/sim/missions/earthwatch';
import {computeLunar} from '../src/sim/missions/lunar';
import {MissionSession} from '../src/state/session';
import {missionById} from '../src/missions/registry';
import {landerModel,advanceCrew,expeditionAction,expeditionReport} from '../src/state/expedition';
import {designSnapshot,comparable} from '../src/sim/engineering';
import {newProfile,recordDesign,recordReport,exportProfile,importProfile,isCleared} from '../src/persist/profile';
import type {MissionReport} from '../src/sim/types';
const EW={orbit:'sso600',imager:'heron',power:'balanced',comms:'xhga',launch:'kestrel'};
const LU={engine:'methalox',tanks:'t40',orbit:'llo100',survey:'nac',power:'p8',thermal:'white',comms:'xband'};
const ctx={missingStations:[],timeUsedS:100,timeLimitS:720,mode:'solo' as const,seed:1,committedBy:{},players:[{name:'Pilot',astronautId:'armstrong'}]};
function laz(n=1){return new MissionSession(missionById('lazarus'),Array.from({length:n},(_,i)=>({id:'p'+i,name:'Pilot '+i,astronautId:['armstrong','chawla','collins','gagarin'][i]})),1,n>1?'multiplayer':'solo','p0');}
describe('recorder and phase energy',()=>{
 test('only packets already collected can be received; overflow is explicit',()=>{
  const l=simulateRecorder(10,[{timeS:0,kind:'contact',label:'empty',bits:100},{timeS:1,kind:'collect',label:'image',bits:16},{timeS:2,kind:'missed',label:'outage',bits:10},{timeS:3,kind:'contact',label:'ground',bits:4}]);
  expect(l).toMatchObject({generatedBits:16,receivedBits:4,storedBits:6,droppedBits:6,peakStoredBits:10});
  expect(l.events[0].movedBits).toBe(0);expect(l.events[2].movedBits).toBe(0);
 });
 test('more collection or missed contacts can overflow the same finite recorder',()=>{
  const sample=(bits:number,missed=-1)=>simulateRecorder(12,dailyDataEvents({days:3,generatedBitsPerDay:bits,capacityBitsPerDay:20,collectionsPerDay:4,contactsPerDay:2,missedContact:missed}));
  expect(sample(40).droppedBits).toBeGreaterThan(sample(12).droppedBits);
  expect(sample(12,0).receivedBits).toBeLessThan(sample(12).receivedBits);
 });
 test('physical recorder recovery preserves conservation',()=>{
  const l=recorder(8);recordData(l,{timeS:1,kind:'collect',label:'field',bits:6});
  expect(l.receivedBits).toBe(0);recordData(l,{timeS:2,kind:'recover',label:'mothership',bits:100});
  expect(l.receivedBits).toBe(6);expect(l.generatedBits).toBe(l.receivedBits+l.storedBits+l.droppedBits);
 });
 test('battery depletes, clips recharge and records unserved load with conserved energy',()=>{
  const e=simulateEnergy(100,[{label:'eclipse',durationS:3600,generationW:0,loadW:120},{label:'sun',durationS:3600,generationW:200,loadW:10}]);
  expect(e.minimumWh).toBe(0);expect(e.unservedWh).toBe(20);expect(e.finalWh).toBe(100);expect(e.spilledWh).toBe(90);
  expect(e.initialWh+e.generatedWh+e.unservedWh).toBeCloseTo(e.finalWh+e.loadWh+e.spilledWh,8);
 });
 test('invalid capacities and data cannot poison host counters',()=>{
  expect(()=>recorder(-1)).toThrow();expect(()=>simulateEnergy(0,[])).toThrow();
  expect(()=>recordData(recorder(1),{timeS:0,kind:'collect',label:'bad',bits:NaN})).toThrow();
 });
});
describe('audit regressions',()=>{
 test('missions that cannot reach their science orbit do not fabricate collected data',()=>{
  const ew=computeEarthwatch({...EW,orbit:'sso800',imager:'condor',power:'heavy',comms:'xmga'}),lu=computeLunar({...LU,engine:'hydrolox',tanks:'t44'});
  expect(ew.data!.generatedBits).toBe(0);expect(ew.data!.receivedBits).toBe(0);expect(lu.data!.generatedBits).toBe(0);expect(lu.surveyFrac).toBe(0);
 });
 test('the audited USD72M design cannot earn full success',()=>{
  const r=evaluateEarthwatch({...EW,comms:'xmga',launch:'aster'},ctx);
  expect(r.outcome).not.toBe('SUCCESS');expect(r.engineering!.requirements.find(c=>c.id==='budget')!.met).toBe(false);
 });
 test('the audited 150-year orbit cannot meet disposal',()=>{
  const r=evaluateEarthwatch({...EW,orbit:'sso800',comms:'sband'},ctx);
  expect(r.outcome).not.toBe('SUCCESS');expect(r.engineering!.requirements.find(c=>c.id==='disposal')!.met).toBe(false);
 });
 test('returned Lunar science is bounded by collected area and received packets',()=>{
  const low=computeLunar({...LU,comms:'sband'}),high=computeLunar(LU);
  expect(low.surveyFrac!).toBeLessThan(low.collectedSurveyFrac!);expect(high.surveyFrac!).toBeCloseTo(1,8);
  expect(low.surveyFrac!).toBeCloseTo(low.collectedSurveyFrac!*low.dataFrac!,8);
 });
 test('all lander actual burn debits invert to the commanded delta-v',()=>{
  for(const planet of PLANETS)for(const kitId of Object.keys(SURVEY_KITS) as (keyof typeof SURVEY_KITS)[])for(const fuel of [1000,2200,3600]){
   const m=landerModel(planet,{fuel,oxygen:1.8,supplies:10},kitId),left=fuel-m.outboundFuel;
   if(left<m.returnFuel)continue;
   const used=wetBurnFuel(m.dry,left,planet.roundTripDv/2);
   expect(340*9.80665*Math.log((m.dry+left)/(m.dry+left-used))).toBeCloseTo(planet.roundTripDv/2,7);
   expect(used).toBeGreaterThanOrEqual(m.returnFuel-1e-8);
  }
 });
 test('walking spends electricity while lander fuel remains unchanged',()=>{
  const s=laz(),r=s.raw.runtime,p=r.crew[0];Object.assign(p,{location:'cindra',fuel:1000,energy:50,oxygen:1,supplies:10,x:6.5,y:6.5});
  for(let i=0;i<40;i++)advanceCrew(r,'lazarus',s.mission.map!,{p0:{x:1,y:0}},.25);
  expect(p.fuel).toBe(1000);expect(p.energy).toBeLessThan(50);expect(surfaceThermalKw(210)).toBeGreaterThan(surfaceThermalKw(291));
 });
 test('beacon-only failure is graded against the beacon check',()=>{
  const s=new MissionSession(missionById('evac'),[{id:'p0',name:'Pilot',astronautId:'armstrong'}]);const p=s.raw.runtime.crew[0];
  Object.assign(p,{pod:{engine:'p220',power:'b40',obdh:'standard',gnc:'tracker',comms:'burst',life:'standard'},escaped:true,safe:true,beacon:false});
  const r=expeditionReport(s.raw.runtime,'evac',ctx),comms=r.subsystems.find(s=>s.subsystem==='COMMS')!;
  expect(r.outcome).toBe('PARTIAL');expect(comms.points).toBe(0);expect(comms.rating).toBe('critical');expect(r.subsystems.find(s=>s.subsystem==='EPS')!.rating).toBe('strong');
 });
});
describe('survey integration and authority',()=>{
 test('survey kits change dry mass, require collection time, and recover data only on arrival',()=>{
  const s=laz(),r=s.raw.runtime,survey=r.surveys[0],p=r.crew[0],planet=PLANETS[0],map=s.mission.map!,w=worldMap(map,planet.id);
  const light=landerModel(planet,{fuel:2200},'scout'),heavy=landerModel(planet,{fuel:2200},'lab');expect(heavy.requiredFuel).toBeGreaterThan(light.requiredFuel);
  r.phase='exploration';Object.assign(p,{location:planet.id,x:w.director.x+1,y:w.director.y+1.375,energy:90,oxygen:1,fuel:2000,supplies:10});
  expeditionAction(r,'lazarus',map,p.id,{type:'collect'},true);expect(survey.collected).toBe(false);
  expect(()=>expeditionAction(r,'lazarus',map,p.id,{type:'collect'},true)).toThrow(/already/);
  for(let i=0;i<49;i++)advanceCrew(r,'lazarus',map,{},.25);
  expect(survey.collected).toBe(true);expect(survey.data.generatedBits).toBe(6e9);expect(survey.data.receivedBits).toBe(0);
  Object.assign(p,{x:w.spawn.x+.5,y:w.spawn.y+.5});expeditionAction(r,'lazarus',map,p.id,{type:'return'},true);
  expect(p.fuel).toBeCloseTo(2000-wetBurnFuel(landerModel(planet,survey.allocation,survey.kitId).dry,2000,planet.roundTripDv/2),7);
  expect(survey.delivered).toBe(false);for(let i=0;i<21;i++)advanceCrew(r,'lazarus',map,{},.25);
  expect(survey.delivered).toBe(true);expect(survey.data.receivedBits).toBe(6e9);
 });
 test('kit choices are host validated by ownership, option and phase',()=>{
  const s=laz(2),r=s.raw.runtime,d=s.mission.map!.director;r.crew.forEach(p=>Object.assign(p,{x:d.x+1,y:d.y+1.375}));
  expect(()=>s.dispatch({type:'surveyKit',player:'p1',planetId:'cindra',kitId:'lab'})).toThrow(/belongs/);
  expect(()=>s.dispatch({type:'surveyKit',planetId:'cindra',kitId:'invalid' as any})).toThrow(/listed/);
  s.dispatch({type:'surveyKit',planetId:'cindra',kitId:'lab'});expect(r.surveys[0].kitId).toBe('lab');
  r.phase='exploration';expect(()=>s.dispatch({type:'surveyKit',planetId:'cindra',kitId:'scout'})).toThrow(/before dispatch/);
 });
 test('only the host may select the operations stress scenario, and sync carries counters',()=>{
  const s=new MissionSession(missionById('earthwatch'),[{id:'h',name:'Host',astronautId:'armstrong'},{id:'g',name:'Guest',astronautId:'chawla'}],1,'multiplayer','h');
  expect(()=>s.dispatch({type:'operations',player:'g',scenario:'outage'})).toThrow(/host/);
  s.dispatch({type:'operations',scenario:'outage'});const guest=new MissionSession(s.mission,s.raw.players,1,'multiplayer','g');guest.sync(s.raw);expect(guest.raw.decisions._ops).toBe('outage');
  const l=laz(2),copy=laz(2);l.raw.runtime.surveys[0].data.generatedBits=4;copy.sync(l.raw);expect(copy.raw.runtime.surveys[0].data.generatedBits).toBe(4);
 });
});
describe('saved designs and history compatibility',()=>{
 test('old v1 reports retain their outcome and earned unlocks on import',()=>{
  const legacy={...evaluateEarthwatch(EW,ctx)};delete legacy.engineering;delete legacy.design;
  const p=recordReport(newProfile('Legacy'),legacy);delete p.savedDesigns;
  const restored=importProfile(exportProfile(p));expect(restored.ok).toBe(true);
  if(restored.ok){expect(restored.profile.history[0]).toEqual(legacy);expect(isCleared(restored.profile,'earthwatch')).toBe(true);expect(restored.profile.savedDesigns).toEqual([]);}
 });
 test('exact choice IDs survive saved-variant export and model/scenario comparisons',()=>{
  const design=designSnapshot('earthwatch',EW),p=recordDesign(newProfile('Variants'),design),restored=importProfile(exportProfile(p));
  expect(restored.ok).toBe(true);if(restored.ok)expect(restored.profile.savedDesigns![0]).toEqual(design);
  const a=evaluateEarthwatch(EW,ctx),b=evaluateEarthwatch({...EW,comms:'xmga'},ctx);expect(comparable(a,b)).toBe(true);
  const c=structuredClone(b);c.design!.modelVersion='future';expect(comparable(a,c)).toBe(false);
  expect(comparable(a,{...b,design:undefined} as MissionReport)).toBe(false);
  expect(comparable(a,evaluateEarthwatch({...EW,_ops:'outage'},ctx))).toBe(false);
 });
 test('missed-contact scenario is deterministic and retains all recorder accounting',()=>{
  const a=computeEarthwatch({...EW,_ops:'outage'}),b=computeEarthwatch({...EW,_ops:'outage'});expect(a.data).toEqual(b.data);
  expect(a.data!.events.filter(e=>e.kind==='missed')).toHaveLength(3);
 });
});
