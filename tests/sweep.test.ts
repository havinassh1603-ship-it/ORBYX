import { expect, test } from 'vitest';
import { evaluateEarthwatch, EARTHWATCH_STATIONS, computeEarthwatch, EW_REQ } from '../src/sim/missions/earthwatch';
import { mandatoryMet } from '../src/sim/engineering';
const ctx={missingStations:[],timeUsedS:1,timeLimitS:720,mode:'solo' as const,seed:1,committedBy:{},players:[]};
test('all 243 Earthwatch designs obey mandatory success and recorder invariants',()=>{
 const [orbits,imagers,powers,radios,launchers]=EARTHWATCH_STATIONS.map(s=>s.options.map(o=>o.id));
 let total=0,successes=0;
 for(const orbit of orbits)for(const imager of imagers)for(const power of powers)for(const comms of radios)for(const launch of launchers){
  const d={orbit,imager,power,comms,launch},r=evaluateEarthwatch(d,ctx),s=computeEarthwatch(d),data=s.data!;
  total++;
  expect(data.generatedBits).toBeCloseTo(data.receivedBits+data.storedBits+data.droppedBits,1);
  expect(data.storedBits).toBeLessThanOrEqual(data.capacityBits+1);
  expect(r.score).toBeGreaterThanOrEqual(0);expect(r.score).toBeLessThanOrEqual(10);
  if(r.outcome==='SUCCESS'){
   successes++;expect(mandatoryMet(r.engineering!.requirements)).toBe(true);
   expect(s.costMusd).toBeLessThanOrEqual(EW_REQ.budgetMusd);
   expect(s.lifetimeYears!-EW_REQ.designLifeYears).toBeLessThanOrEqual(EW_REQ.disposalYears);
   expect(s.usableFraction!).toBeGreaterThanOrEqual(1-1e-9);expect(s.dod!).toBeLessThanOrEqual(EW_REQ.maxDod);
  }
 }
 expect(total).toBe(243);expect(successes).toBeGreaterThan(0);
});
