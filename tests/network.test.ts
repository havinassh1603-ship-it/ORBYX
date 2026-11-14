/// <reference types="node" />
import {EventEmitter} from 'node:events';
import {test,expect} from 'vitest';
import type {DataConnection} from 'peerjs';
import {Room,PROTOCOL,type Identity} from '../src/net/room';

const host:Identity={id:'host-player-identity',name:'Host',astronautId:'armstrong',cleared:[]};
const guest:Identity={id:'guest-player-identity',name:'Guest',astronautId:'chawla',cleared:[]};
class Channel extends EventEmitter {
 open=true;sent:Record<string,any>[]=[];
 send(message:Record<string,any>){this.sent.push(structuredClone(message));}
 close(){if(this.open){this.open=false;this.emit('close');}}
 message(message:Record<string,unknown>){this.emit('data',{protocol:PROTOCOL,...message});}
}
function accept(room:Room,channel:Channel,secret=''){
 (room as unknown as {accept(c:DataConnection):void}).accept(channel as unknown as DataConnection);
 channel.message({type:'hello',identity:guest,secret});
}
function setup(){const room=new Room({...host},()=>{},()=>{});room.isHost=true;room.lobby={code:'ABC234',hostId:host.id,missionId:'earthwatch',phase:'lobby',seats:[{...host,ready:true,connected:true}],chat:[],snapshot:null};const c=new Channel();accept(room,c);room.lobby.seats.forEach(p=>p.ready=true);room.start();return {room,c};}

test('the host rejects guest clock updates and stamps the sender identity on choices',()=>{
 const {room,c}=setup(),s=room.session!,time=s.raw.timeLeftS;
 c.message({type:'action',request:1,action:{type:'session',action:{type:'tick',dtS:1000,player:host.id}}});
 expect(s.raw.timeLeftS).toBe(time);expect(c.sent.at(-1)?.message).toMatch(/host simulation/);
 const station=s.mission.stations.find(st=>s.raw.runtime.owners[st.id]===host.id)!,pos=s.mission.map!.stations.find(st=>st.stationId===station.id)!;
 Object.assign(s.raw.runtime.crew[1],{x:pos.x+.5,y:pos.y+1.375});
 c.message({type:'action',request:2,action:{type:'session',action:{type:'commit',player:host.id,stationId:station.id,optionId:station.options[0].id}}});
 expect(s.raw.decisions[station.id]).toBeUndefined();expect(c.sent.at(-1)?.message).toMatch(/assigned/);room.close();
});

test('replacing an old connection cannot disconnect the newly authenticated crew slot',async()=>{
 const {room,c}=setup(),secret=c.sent.find(m=>m.type==='welcome')!.secret,next=new Channel();
 accept(room,next,secret);expect(c.open).toBe(false);expect(room.session!.raw.runtime.crew[1].connected).toBe(true);expect(room.session!.raw.status).toBe('active');
 next.close();expect(room.session!.raw.status).toBe('paused');const resumed=new Channel();accept(room,resumed,secret);expect(room.session!.raw.runtime.crew[1].connected).toBe(true);expect(room.session!.raw.status).toBe('paused');
 await room.action({type:'session',action:{type:'pause',paused:false}});expect(room.session!.raw.status).toBe('active');room.close();
});

test('a departing guest cannot invalidate a completed report or block the next lobby',()=>{
 const {room,c}=setup();room.session!.dispatch({type:'expire'});room.session!.complete();const result=room.session!.raw.report;c.close();expect(room.session!.raw.status).toBe('complete');expect(room.session!.raw.report).toBe(result);room.returnLobby();expect(room.lobby!.seats).toHaveLength(1);expect(room.lobby!.phase).toBe('lobby');expect(room.session).toBe(null);room.close();
});
