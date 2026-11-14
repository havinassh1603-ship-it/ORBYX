import type { Decisions, MissionReport } from '../sim/types';
import type { MissionDef } from '../missions/registry';
import { astronautById } from '../data/astronauts';
import { initRuntime, advanceCrew, expeditionAction, expeditionReport, runtimeDesign, nearDirector, distance, log, type Runtime, type ExpeditionAction } from './expedition';

export type SessionStatus='active'|'paused'|'running'|'complete';
export interface SessionPlayer {id?:string;name:string;astronautId:string;}
export type SessionAction=
 |{type:'commit';stationId:string;optionId:string;player:string}
 |{type:'tick';dtS:number}|{type:'pause';paused:boolean;player?:string}|{type:'run';player?:string}|{type:'expire'}
 |{type:'input';x:number;y:number;player?:string;stop?:boolean}|{type:'sync'}
 |{type:'operations';scenario:'nominal'|'outage';player?:string}
 |(ExpeditionAction&{player?:string});
export interface SessionSnapshot {missionId:string;seed:number;timeLimitS:number;timeLeftS:number;status:SessionStatus;decisions:Decisions;committedBy:Record<string,string>;players:SessionPlayer[];report:MissionReport|null;runtime:Runtime;pauseReason:string;attemptId:string;revision:number;}
type Listener=(s:SessionSnapshot,a:SessionAction)=>void;
export class MissionSession {
 private state:SessionSnapshot;private listeners=new Set<Listener>();private inputs:Record<string,{x:number;y:number}>={};
 private relay:((a:SessionAction)=>void)|null=null;readonly selfId:string;
 constructor(readonly mission:MissionDef,players:SessionPlayer[],seed=Math.floor(Math.random()*2**31),readonly mode:'solo'|'multiplayer'='solo',selfId?:string,readonly enforceWorld=false){
  this.selfId=selfId||players[0].id||players[0].name;
  const runtime=initRuntime(mission.id,players,mission.map!,mission.stations,(id,sys)=>astronautById(id).subsystem===sys?4:0);
  this.state={missionId:mission.id,seed,timeLimitS:mission.timeLimitS,timeLeftS:mission.timeLimitS+(mission.id==='lazarus'&&players.length===1?600:0),status:'active',decisions:{},committedBy:{},players,report:null,runtime,pauseReason:'',attemptId:globalThis.crypto?.randomUUID?.()||`${Date.now()}-${seed}`,revision:0};this.state.timeLimitS=this.state.timeLeftS;
 }
 get raw(){return this.state;}
 get snapshot():SessionSnapshot {if(this.mission.id!=='evac')return this.state;const me=this.state.runtime.crew.find(p=>p.id===this.selfId)!;return {...this.state,decisions:me?.pod||{}};}
 get isHost(){return this.state.runtime.crew[0].id===this.selfId;}
 get remote(){return !!this.relay;}
 setRelay(fn:(a:SessionAction)=>void){this.relay=fn;}
 sync(s:SessionSnapshot){this.state=structuredClone(s);this.emit({type:'sync'});}
 on(fn:Listener){this.listeners.add(fn);return ()=>{this.listeners.delete(fn);};}
 missingStations(){return this.mission.stations.map(s=>s.id).filter(id=>!this.snapshot.decisions[id]);}
 canRun(){return !['evac','lazarus'].includes(this.mission.id)&&this.state.status==='active'&&!this.missingStations().length;}
 disconnect(id:string){const p=this.state.runtime.crew.find(p=>p.id===id);if(p){p.connected=false;p.route=[];this.inputs[id]={x:0,y:0};if(['active','paused'].includes(this.state.status)){this.state.status='paused';this.state.pauseReason='A crew member disconnected. Rejoin this attempt, then the host can resume; or abandon without recording a result.';}this.emit({type:'sync'});}}
 reconnect(id:string){const p=this.state.runtime.crew.find(p=>p.id===id);if(p){p.connected=true;this.emit({type:'sync'});}}
 dispatch(a:SessionAction){if(this.relay){if(!['tick','expire','sync'].includes(a.type))this.relay(a);return;}
  const s=this.state,r=s.runtime,actor=('player'in a&&a.player)||this.selfId,p=r.crew.find(p=>p.id===actor),host=r.crew[0].id===actor;
  if(['tick','expire','sync'].includes(a.type)){}else if(!p)throw Error('Unknown crew member.');
  if(a.type==='input'){if(!Number.isFinite(a.x)||!Number.isFinite(a.y))return;if(a.stop&&p)p.route=[];this.inputs[actor]={x:Math.max(-1,Math.min(1,a.x)),y:Math.max(-1,Math.min(1,a.y))};return;}
  if(a.type==='pause'){
   if(!host)throw Error('Only the host can pause or resume the shared mission.');
   if(!['active','paused'].includes(s.status))return;
   if(!a.paused&&r.crew.some(p=>!p.connected))throw Error('Wait for all astronauts to reconnect, or abandon this attempt.');
   if(a.paused)this.inputs={};s.status=a.paused?'paused':'active';s.pauseReason=a.paused?'Mission paused by host.':'';this.emit(a);return;
  }
  if(a.type==='tick'){
   if(s.status!=='active'||!Number.isFinite(a.dtS)||a.dtS<=0)return;
   s.timeLeftS=Math.max(0,s.timeLeftS-a.dtS);r.elapsed+=a.dtS;
   advanceCrew(r,this.mission.id,this.mission.map!,this.inputs,Math.min(a.dtS,.25));
   if(this.mission.id==='lazarus'){
    if(r.crew.some(p=>!p.alive)){this.finish();return;}
    if(r.phase==='exploration'&&r.surveys.every(s=>s.delivered)&&r.crew.every(p=>p.location==='ship'&&!p.travel)){r.phase='voting';r.voteLeft=120;log(r,'All datasets delivered. Compare the observations and vote.');}
    if(r.phase==='voting'){r.voteLeft=Math.max(0,r.voteLeft-a.dtS);if(!r.voteLeft){this.finish();return;}}
   }
   if(this.mission.id==='evac'&&(r.crew.every(p=>!p.alive||p.escaped)||(r.crew.length>1&&r.crew.filter(p=>p.alive).length<=r.crew.length/2))){this.finish();return;}
   if(!s.timeLeftS){this.dispatch({type:'expire'});return;}this.emit(a);return;
  }
  if(a.type==='expire'){if(s.status==='active'||s.status==='paused')this.finish(this.missingStations());return;}
  if(s.status!=='active')throw Error('The mission is paused or already evaluated.');
  if(!p?.alive||p.escaped||p.travel)throw Error('This astronaut cannot act now.');
  if(a.type==='operations'){
   if(!host||!['earthwatch','lunar'].includes(this.mission.id))throw Error('The host selects the operations scenario.');
   if(!['nominal','outage'].includes(a.scenario))throw Error('Unknown operations scenario.');
   if(this.enforceWorld&&!nearDirector(p,this.mission.map!))throw Error('Reach the Flight Director console.');
   s.decisions._ops=a.scenario;s.revision++;this.emit(a);return;
  }
  if(a.type==='commit'){
   const st=this.mission.stations.find(st=>st.id===a.stationId);if(!st||!st.options.some(o=>o.id===a.optionId))throw Error('Unknown workstation or hardware choice.');
   if(this.mission.id!=='evac'&&r.owners[st.id]!==actor)throw Error('This workstation is assigned to '+r.crew.find(p=>p.id===r.owners[st.id])?.name+'.');
   if(this.enforceWorld){const pos=this.mission.map!.stations.find(s=>s.stationId===st.id)!;if(p.location!=='ship'||distance(p,{x:pos.x+.5,y:pos.y+1.375})>1.5)throw Error('Walk to the assigned console before committing.');}
   if(this.mission.id==='evac')p.pod[st.id]=a.optionId;else s.decisions[st.id]=a.optionId;
   s.committedBy[st.id]=p.name;s.revision++;this.emit(a);return;
  }
  if(a.type==='run'){
   if(!host)throw Error('Only the host authorizes Run Mission.');if(!this.canRun())return;
   if(this.enforceWorld&&!nearDirector(p,this.mission.map!))throw Error('Reach the Flight Director console.');this.finish();return;
  }
  if(a.type==='sync')return;
  if(expeditionAction(r,this.mission.id,this.mission.map!,actor,a,host)==='finish'){this.finish();return;}
  s.revision++;this.emit(a);
 }
 private finish(missing:string[]=[]){const s=this.state;if(s.status==='running'||s.status==='complete')return;
  const ctx={missingStations:missing,timeUsedS:s.timeLimitS-s.timeLeftS,timeLimitS:s.timeLimitS,mode:this.mode,seed:s.seed,committedBy:s.committedBy,players:s.players};
  s.report=['evac','lazarus'].includes(this.mission.id)?expeditionReport(s.runtime,this.mission.id,ctx):this.mission.evaluate(s.decisions,ctx);
  s.report.design=runtimeDesign(this.mission.id,s.runtime,s.decisions,this.mode);
  s.status='running';for(const p of s.runtime.crew)p.route=[];this.emit({type:'run'});
 }
 complete(){this.state.status='complete';}
 private emit(a:SessionAction){for(const fn of this.listeners)fn(this.snapshot,a);}
}
/** Deterministic option order per session so the best answer is not always in the same slot. */
export function shuffledOptions<T>(items: T[], seed: number, salt: string): T[] {
  let h = seed ^ 0x9e3779b9;
  for (let i = 0; i < salt.length; i++) h = Math.imul(h ^ salt.charCodeAt(i), 0x85ebca6b);
  const rnd = () => {
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d);
    h ^= h >>> 12;
    h = Math.imul(h, 0x297a2d39);
    h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  };
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
