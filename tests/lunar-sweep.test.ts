import { expect, test } from 'vitest';
import { LUNAR_STATIONS, evaluateLunar, computeLunar, LU_REQ } from '../src/sim/missions/lunar';
import { mandatoryMet } from '../src/sim/engineering';
import type { Decisions } from '../src/sim/types';
const ctx={missingStations:[],timeUsedS:300,timeLimitS:900,mode:'solo' as const,seed:1,committedBy:{},players:[]};
test('all 2187 Lunar designs conserve packets and require the full useful survey for success',()=>{
 let total=0,successes=0;
 function visit(i:number,d:Decisions){
  if(i<LUNAR_STATIONS.length){const st=LUNAR_STATIONS[i];for(const op of st.options)visit(i+1,{...d,[st.id]:op.id});return;}
  total++;const r=evaluateLunar(d,ctx),s=computeLunar(d),data=s.data!;
  expect(data.generatedBits).toBeCloseTo(data.receivedBits+data.storedBits+data.droppedBits,1);
  expect(data.peakStoredBits).toBeLessThanOrEqual(data.capacityBits+1);
  if(r.outcome==='SUCCESS'){
   successes++;expect(mandatoryMet(r.engineering!.requirements)).toBe(true);
   expect(s.returnReserveMps!).toBeGreaterThanOrEqual(100);expect(s.surveyFrac!).toBeGreaterThanOrEqual(1-1e-9);
   expect(s.dataFrac!).toBeGreaterThanOrEqual(1-1e-9);expect(s.dod!).toBeLessThanOrEqual(LU_REQ.maxDod);
  }
 }
 visit(0,{});expect(total).toBe(2187);expect(successes).toBeGreaterThan(0);
});
