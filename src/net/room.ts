import Peer, { type DataConnection, type PeerOptions } from 'peerjs';
import { MissionSession, type SessionAction, type SessionSnapshot } from '../state/session';
import { missionById, MISSIONS } from '../missions/registry';
import { ASTRONAUTS } from '../data/astronauts';
export const PROTOCOL=4;
export interface Identity {id:string;name:string;astronautId:string;cleared:string[];partials?:Record<string,number>;}
export interface Seat extends Identity {ready:boolean;connected:boolean;}
export interface NetworkSettings {signalling:'cloud'|'local'|'custom';signalUrl:string;turnUrl:string;turnUser:string;turnPassword:string;}
export const DEFAULT_NETWORK:NetworkSettings={signalling:'cloud',signalUrl:'',turnUrl:'',turnUser:'',turnPassword:''};
export interface Lobby {code:string;hostId:string;missionId:string;phase:'lobby'|'mission';seats:Seat[];chat:{name:string;text:string}[];snapshot:SessionSnapshot|null;}
export function advanceLobbyProgress(l:Lobby,missionId:string,outcome:'SUCCESS'|'PARTIAL'|'FAILED'){
 for(const p of l.seats){p.partials??={};if(outcome==='PARTIAL')p.partials[missionId]=(p.partials[missionId]||0)+1;if((outcome==='SUCCESS'||p.partials[missionId]>=2)&&!p.cleared.includes(missionId))p.cleared.push(missionId);}
}
function peerOptions(s:NetworkSettings){const o:PeerOptions={debug:0,config:{iceServers:[{urls:'stun:stun.l.google.com:19302'}]}};
 if(s.signalling==='local'){o.host=location.hostname;o.port=Number(location.port)||(location.protocol==='https:'?443:80);o.path='/peerjs/orbyx';o.secure=location.protocol==='https:';o.config={iceServers:[]};}
 if(s.signalling==='custom'){const u=new URL(s.signalUrl);if(!['https:','http:'].includes(u.protocol))throw Error('Use an HTTP(S) signalling URL.');o.host=u.hostname;o.port=Number(u.port)||(u.protocol==='https:'?443:80);o.path=u.pathname;o.secure=u.protocol==='https:';}
 if(s.turnUrl){if(!/^turns?:/.test(s.turnUrl))throw Error('TURN URL must start with turn: or turns:.');o.config!.iceServers!.push({urls:s.turnUrl,username:s.turnUser,credential:s.turnPassword});}return o;
}
export function newId(){return globalThis.crypto.randomUUID?.()||Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');}
export function roomCode(){return Array.from(crypto.getRandomValues(new Uint8Array(6)),x=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[x%32]).join('');}
export function reserveSeat(l:Lobby,identity:Identity){
 if(l.phase!=='lobby')throw Error('This expedition is in progress; only existing crew can reconnect.');
 if(l.seats.length>=4)throw Error('The room already has four astronauts.');
 if(!/^[a-z0-9-]{12,60}$/i.test(identity.id)||l.seats.some(p=>p.id===identity.id))throw Error('Invalid or occupied player identity.');
 const astronautId=l.seats.some(p=>p.astronautId===identity.astronautId)?'':identity.astronautId;
 const partials=Object.fromEntries(MISSIONS.map(m=>[m.id,Math.max(0,Math.min(100,Math.floor(Number(identity.partials?.[m.id])||0)))]));
 l.seats.push({...identity,name:String(identity.name).trim().slice(0,20)||'Astronaut',cleared:Array.isArray(identity.cleared)?identity.cleared.filter(x=>MISSIONS.some(m=>m.id===x)):[],partials,astronautId:ASTRONAUTS.some(a=>a.id===astronautId)?astronautId:'',ready:false,connected:true});
 const mission=missionById(l.missionId);if(mission.unlockedBy&&!l.seats.every(p=>p.cleared.includes(mission.unlockedBy!)))l.missionId='earthwatch';
}
export function lobbyAction(l:Lobby,id:string,a:Record<string,unknown>){
 const me=l.seats.find(p=>p.id===id);if(!me)throw Error('Not a member of this crew.');
 if(a.type==='chat'){const text=String(a.text||'').trim().slice(0,200);if(text){l.chat.push({name:me.name,text});l.chat=l.chat.slice(-20);}return;}
 if(l.phase!=='lobby')throw Error('Return to the crew lobby first.');
 if(a.type==='character'){const char=String(a.astronautId);if(!ASTRONAUTS.some(x=>x.id===char))throw Error('Unknown astronaut.');if(l.seats.some(p=>p.id!==id&&p.astronautId===char))throw Error('That astronaut is already reserved.');me.astronautId=char;me.ready=false;}
 else if(a.type==='ready'){if(!me.astronautId)throw Error('Select an available astronaut first.');me.ready=!me.ready;}
 else if(a.type==='mission'){if(id!==l.hostId)throw Error('Only the host chooses the mission.');const m=missionById(String(a.missionId));if(m.unlockedBy&&!l.seats.every(p=>p.cleared.includes(m.unlockedBy!)))throw Error('Every crew member must unlock this mission first.');l.missionId=m.id;l.seats.forEach(p=>p.ready=false);}
 else throw Error('Unknown lobby action.');
}
export class Room {
 peer:Peer|null=null;session:MissionSession|null=null;lobby:Lobby|null=null;isHost=false;closed=false;
 private connections=new Map<string,DataConnection>();private secrets=new Map<string,string>();private hostConn:DataConnection|null=null;private pending=new Map<number,{resolve:()=>void;reject:(e:Error)=>void}>();private counter=0;private timer:ReturnType<typeof setInterval>|null=null;private retry:ReturnType<typeof setTimeout>|null=null;
 constructor(readonly identity:Identity,readonly changed:(l:Lobby)=>void,readonly error:(text:string)=>void){}
 async host(settings:NetworkSettings){this.isHost=true;const code=roomCode();this.peer=new Peer('orbyx3-'+code.toLowerCase(),peerOptions(settings));
 await this.openPeer();this.lobby={code,hostId:this.identity.id,missionId:'earthwatch',phase:'lobby',seats:[{...this.identity,ready:false,connected:true}],chat:[],snapshot:null};
 this.peer.on('connection',c=>this.accept(c));this.timer=setInterval(()=>{if(this.lobby?.phase==='mission')this.emit();},100);this.emit();}
 async join(code:string,settings:NetworkSettings){code=code.trim().toUpperCase();if(!/^[A-Z2-9]{6}$/.test(code))throw Error('Enter the six-character room code.');this.peer=new Peer(peerOptions(settings));await this.openPeer();await this.connect(code);}
 private openPeer(){return new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Signalling timed out. Check network settings and internet access.')),15000);this.peer!.once('open',()=>{clearTimeout(timer);resolve();});this.peer!.on('error',e=>{clearTimeout(timer);this.error(e.message);reject(e);});});}
 private accept(c:DataConnection){let id='';c.on('data',raw=>{const msg=(raw&&typeof raw==='object'?raw:{}) as Record<string,any>;try{
  if(msg?.protocol!==PROTOCOL)throw Error('Different ORBYX version. Use the same archive.');
  if(msg.type==='hello'){
   if(id)throw Error('Already joined.');const supplied=msg.identity as Identity;
   if(!supplied||supplied.id===this.identity.id)throw Error('Open the guest in a separate browser session.');
   const existing=this.lobby!.seats.find(p=>p.id===supplied.id);
   if(existing){if(!msg.secret||msg.secret!==this.secrets.get(supplied.id))throw Error('Crew slot is occupied.');existing.connected=true;this.session?.reconnect(existing.id);}
   else reserveSeat(this.lobby!,supplied);
   id=supplied.id;const previous=this.connections.get(id);this.connections.set(id,c);previous?.close();const secret=this.secrets.get(id)||newId();this.secrets.set(id,secret);c.send({protocol:PROTOCOL,type:'welcome',secret,lobby:this.packed()});this.emit();return;
  }
  if(!id)throw Error('Join the room first.');
  if(msg.type==='action'){
   if(msg.action?.type==='session')this.authoritativeAction(id,msg.action.action);
   else lobbyAction(this.lobby!,id,msg.action);
   if(msg.request)c.send({protocol:PROTOCOL,type:'ack',request:msg.request});if(msg.action?.type==='session'&&msg.action.action?.type==='input')return;this.emit();
  }
 }catch(e){c.send({protocol:PROTOCOL,type:'error',message:(e as Error).message,request:msg.request});}});
 c.on('close',()=>{if(!id||this.connections.get(id)!==c||this.closed)return;this.connections.delete(id);if(this.lobby!.phase==='lobby')this.lobby!.seats=this.lobby!.seats.filter(p=>p.id!==id);else{this.lobby!.seats.find(p=>p.id===id)!.connected=false;this.session?.disconnect(id);}this.emit();});c.on('error',e=>this.error(e.message));}
 private authoritativeAction(id:string,a:SessionAction){if(!this.session)throw Error('No mission is active.');if(['tick','expire','sync'].includes(a.type))throw Error('Only the host simulation advances time.');this.session.dispatch({...a,player:id} as SessionAction);}
 private connect(code:string){return new Promise<void>((resolve,reject)=>{
  const c=this.peer!.connect('orbyx3-'+code.toLowerCase(),{reliable:true});this.hostConn=c;
  const timer=setTimeout(()=>reject(Error('Could not open the peer data channel. Check the host and code; restrictive networks may need TURN.')),16000);
  c.on('open',()=>c.send({protocol:PROTOCOL,type:'hello',identity:this.identity,secret:sessionStorage.getItem('orbyx3-secret-'+code+this.identity.id)||''}));
  c.on('data',raw=>{const m=raw as Record<string,any>;if(m?.protocol!==PROTOCOL)return;
   if(m.type==='welcome'){clearTimeout(timer);sessionStorage.setItem('orbyx3-secret-'+code+this.identity.id,m.secret);this.receive(m.lobby);resolve();}
   else if(m.type==='snapshot')this.receive(m.lobby);
   else if(m.type==='ack'){this.pending.get(m.request)?.resolve();this.pending.delete(m.request);}
   else if(m.type==='error'){const e=Error(m.message);if(this.pending.has(m.request)){this.pending.get(m.request)!.reject(e);this.pending.delete(m.request);}else{clearTimeout(timer);reject(e);this.error(e.message);}}
  });
  c.on('close',()=>{if(!this.closed){this.error('Host connection lost. Reconnecting; controls are suspended.');if(this.session){const snap=structuredClone(this.session.raw);snap.status='paused';snap.pauseReason='Host connection lost. Waiting to reconnect; host migration is not available.';this.session.sync(snap);}this.retry=setTimeout(()=>{if(!this.closed)this.connect(code).catch(e=>this.error(e.message));},1800);}});c.on('error',e=>{clearTimeout(timer);reject(e);});
 });}
 private receive(l:Lobby){this.lobby=l;if(l.phase==='mission'&&l.snapshot){if(!this.session||this.session.raw.attemptId!==l.snapshot.attemptId){this.session=new MissionSession(missionById(l.missionId),l.snapshot.players,l.snapshot.seed,'multiplayer',this.identity.id,true);this.session.setRelay(a=>{this.action({type:'session',action:a}).catch(e=>this.error(e.message));});}this.session.sync(l.snapshot);}this.changed(l);}
 async action(action:Record<string,unknown>){if(action.type==='session'&&(action.action as SessionAction)?.type==='input'){if(this.isHost)this.authoritativeAction(this.identity.id,action.action as SessionAction);else if(this.hostConn?.open)this.hostConn.send({protocol:PROTOCOL,type:'action',action});return;}if(this.closed)throw Error('The room is closed.');if(this.isHost){if(action.type==='session')this.authoritativeAction(this.identity.id,action.action as SessionAction);else lobbyAction(this.lobby!,this.identity.id,action);this.emit();return;}
 if(!this.hostConn?.open)throw Error('The host is disconnected.');const request=++this.counter;
 return new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(request);reject(Error('The host did not acknowledge this action.'));},7000);this.pending.set(request,{resolve:()=>{clearTimeout(timer);resolve();},reject:e=>{clearTimeout(timer);reject(e);}});this.hostConn!.send({protocol:PROTOCOL,type:'action',request,action});});}
 start(){if(!this.isHost||!this.lobby)throw Error('Only the host starts the mission.');const l=this.lobby;if(!l.seats.every(p=>p.ready&&p.connected&&p.astronautId)||new Set(l.seats.map(p=>p.astronautId)).size!==l.seats.length)throw Error('Every connected astronaut must select a unique character and mark ready.');const m=missionById(l.missionId);if(m.unlockedBy&&!l.seats.every(p=>p.cleared.includes(m.unlockedBy!)))throw Error('Every astronaut must unlock this mission.');this.session=new MissionSession(m,l.seats,undefined,'multiplayer',this.identity.id,true);l.phase='mission';this.emit();}
 returnLobby(){if(!this.isHost||!this.lobby)throw Error('The host returns the crew to the lobby.');if(this.session?.raw.status!=='complete'&&this.session?.raw.status!=='running')throw Error('Finish or abandon this mission first.');const r=this.session.raw.report;if(r)advanceLobbyProgress(this.lobby,r.missionId,r.outcome);this.lobby.phase='lobby';this.lobby.seats=this.lobby.seats.filter(p=>p.connected);this.lobby.seats.forEach(p=>p.ready=false);this.lobby.snapshot=null;this.session=null;this.emit();}
 private packed():Lobby{const l=this.lobby!;return {...l,snapshot:l.phase==='mission'&&this.session?this.session.raw:null};}
 private emit(){if(!this.lobby||this.closed)return;const l=this.packed();this.changed(l);for(const c of this.connections.values())if(c.open)c.send({protocol:PROTOCOL,type:'snapshot',lobby:l});}
 close(){this.closed=true;if(this.timer)clearInterval(this.timer);if(this.retry)clearTimeout(this.retry);for(const c of this.connections.values())c.close();this.hostConn?.close();this.peer?.destroy();for(const p of this.pending.values())p.reject(Error('Room closed.'));this.pending.clear();}
}
