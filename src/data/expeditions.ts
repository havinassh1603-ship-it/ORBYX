import type { MapDef } from './maps';

export interface Planet {
 id:string; name:string; color:number; type:string; pressure:number; temperature:number; gravity:number;
 radiation:number; water:number; stability:number; transitH:number; roundTripDv:number; windowS:number; suppliesKg:number;
}
export const PLANETS:Planet[]=[
 {id:'cindra',name:'Cindra',color:0xb98861,type:'Dust-scoured basalt',pressure:4,temperature:210,gravity:.4,radiation:60,water:.1,stability:.5,transitH:6,roundTripDv:1200,windowS:210,suppliesKg:5},
 {id:'veyra',name:'Veyra',color:0x50a791,type:'Temperate river basin',pressure:96,temperature:291,gravity:1.1,radiation:40,water:.8,stability:.8,transitH:8,roundTripDv:1800,windowS:270,suppliesKg:8},
 {id:'talos',name:'Talos',color:0x987ec2,type:'Electrical storm uplands',pressure:120,temperature:305,gravity:.9,radiation:180,water:.9,stability:.4,transitH:12,roundTripDv:2400,windowS:180,suppliesKg:10},
 {id:'orison',name:'Orison',color:0x6396b7,type:'Frozen twilight terrain',pressure:70,temperature:265,gravity:.8,radiation:350,water:.6,stability:.6,transitH:14,roundTripDv:2600,windowS:210,suppliesKg:12},
];
export const HABITABILITY={pressure:[50,120],temperature:[260,320],gravity:[.6,1.4],radiation:100,water:.5,stability:.6};
export function habitability(p:Planet){return [
 {label:'Pressure',value:p.pressure,unit:'kPa',ok:p.pressure>=50&&p.pressure<=120},
 {label:'Temperature',value:p.temperature,unit:'K',ok:p.temperature>=260&&p.temperature<=320},
 {label:'Gravity',value:p.gravity,unit:'g',ok:p.gravity>=.6&&p.gravity<=1.4},
 {label:'Radiation index',value:p.radiation,unit:'mSv/year (synthetic)',ok:p.radiation<100},
 {label:'Water evidence',value:p.water,unit:'index',ok:p.water>=.5},
 {label:'Environmental stability',value:p.stability,unit:'index',ok:p.stability>=.6},
 ];}
export const EVAC_MAP:MapDef={
 width:42,height:50,theme:'ship',spawn:{x:20,y:43},director:{x:20,y:40},
 rooms:[
 {id:'engine',name:'Deck A · Propulsion',x:2,y:2,w:14,h:10,floor:'hangar'},
 {id:'power',name:'Deck A · Power',x:25,y:2,w:14,h:10,floor:'tech'},
 {id:'obdh',name:'Deck B · Computer',x:2,y:15,w:14,h:10,floor:'clean'},
 {id:'gnc',name:'Deck B · Guidance',x:25,y:15,w:14,h:10,floor:'ops'},
 {id:'comms',name:'Deck C · Beacon',x:2,y:28,w:14,h:10,floor:'tech'},
 {id:'life',name:'Deck C · Life Support',x:25,y:28,w:14,h:10,floor:'lobby'},
 {id:'pods',name:'Evacuation Dock',x:10,y:40,w:22,h:8,floor:'hangar'},
 ],corridors:[{x:18,y:2,w:5,h:39},... [5,18,31].map(y=>({x:15,y,w:12,h:4}))],
 doors:[... [5,18,31].flatMap((y,i)=>[{id:'left-'+i,x:16,y,w:2,h:3},{id:'right-'+i,x:23,y,w:2,h:3}])],windows:[],
 stations:[{stationId:'engine',x:5,y:3},{stationId:'power',x:33,y:3},{stationId:'obdh',x:5,y:16},{stationId:'gnc',x:33,y:16},{stationId:'comms',x:5,y:29},{stationId:'life',x:33,y:29}],
 props:[{kind:'engine',x:10,y:6,w:3,h:3,solid:true},{kind:'battery',x:27,y:7,w:3,h:2,solid:true},{kind:'rack',x:10,y:18,w:2,h:4,solid:true},{kind:'holo',x:27,y:19,w:3,h:3,solid:true},{kind:'dish',x:10,y:32,w:3,h:3,solid:true},{kind:'tank',x:27,y:33,w:2,h:3,solid:true},...[12,16,24,28].map(x=>({kind:'capsule' as const,x,y:44,w:2,h:3,solid:true}))],
};
export const LAZARUS_MAP:MapDef={width:38,height:28,theme:'ship',spawn:{x:19,y:15},director:{x:18,y:11},rooms:[
 {id:'bridge',name:'Lazarus · Expedition Control',x:10,y:2,w:18,h:16,floor:'ops'},
 {id:'landers',name:'Lander Hangar',x:2,y:20,w:34,h:6,floor:'hangar'},
 {id:'stores',name:'Resource Stores',x:2,y:3,w:6,h:13,floor:'tech'},
 {id:'observatory',name:'Observation Gallery',x:30,y:3,w:6,h:13,floor:'clean'}
 ],corridors:[{x:3,y:17,w:32,h:3},{x:8,y:10,w:23,h:3}],doors:[{id:'hangar',x:18,y:18,w:3,h:2}],windows:[],stations:[],
 props:[{kind:'holo',x:17,y:4,w:4,h:4,solid:true},{kind:'tank',x:3,y:5,w:2,h:3,solid:true},{kind:'battery',x:3,y:11,w:2,h:2,solid:true},{kind:'platform',x:31,y:6,w:3,h:3,solid:true},...[5,13,22,30].map(x=>({kind:'capsule' as const,x,y:21,w:2,h:3,solid:true}))]};

/** Deterministic maze; every floor cell is connected. Coordinates use 48px tiles. */
const planetCache=new Map<string,MapDef>();
export function planetMap(id:string):MapDef{
 const cached=planetCache.get(id);if(cached)return cached;
 const index=PLANETS.findIndex(p=>p.id===id);let seed=(index+3)*7919;
 const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const w=25,h=21,grid=Array.from({length:h},()=>Array(w).fill(false));
 function carve(x:number,y:number){grid[y][x]=true;const ds=[[2,0],[-2,0],[0,2],[0,-2]];for(let i=3;i>0;i--){const j=Math.floor(rnd()*(i+1));[ds[i],ds[j]]=[ds[j],ds[i]];}for(const[dx,dy]of ds){const nx=x+dx,ny=y+dy;if(nx>0&&ny>0&&nx<w-1&&ny<h-1&&!grid[ny][nx]){grid[y+dy/2][x+dx/2]=true;carve(nx,ny);}}}
 carve(1,19);
 // Two-tile-wide paths make navigation fair with the existing astronaut body.
 const rooms:MapDef['rooms']=[];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(grid[y][x])rooms.push({id:`t${x}-${y}`,name:'',x:x*2+1,y:y*2+1,w:2,h:2,floor:index===1?'lobby':index===2?'tech':'hangar'});
 rooms.push({id:'landing',name:'Lander',x:2,y:38,w:5,h:5,floor:'hangar'},{id:'research',name:'Research Station',x:45,y:2,w:6,h:5,floor:'clean'});
 const map:MapDef={width:w*2+2,height:h*2+2,theme:'planet',planetId:id,rooms,corridors:[],doors:[],windows:[],props:[],stations:[],spawn:{x:4,y:40},director:{x:47,y:4}};planetCache.set(id,map);return map;
}
export function worldMap(mission:MapDef,location:string){return location==='ship'?mission:planetMap(location);}
/** Shared floor/body collision for authoritative movement and path planning. Doors auto-open on approach. */
const floors=new WeakMap<MapDef,boolean[][]>();
export function floorAt(map:MapDef,x:number,y:number){let floor=floors.get(map);if(!floor){floor=Array.from({length:map.height},()=>Array(map.width).fill(false));for(const r of [...map.rooms,...map.corridors,...map.doors])for(let j=r.y;j<r.y+r.h;j++)for(let i=r.x;i<r.x+r.w;i++)if(floor[j]&&i>=0&&i<map.width)floor[j][i]=true;floors.set(map,floor);}return !!floor[Math.floor(y)]?.[Math.floor(x)];}
export function walkable(map:MapDef,x:number,y:number){
 if(![[-.27,-.16],[-.27,.12],[.27,-.16],[.27,.12]].every(([dx,dy])=>floorAt(map,x+dx,y+dy)))return false;
 const blocked=map.props.filter(p=>p.solid).some(p=>x>p.x-.2&&x<p.x+p.w+.2&&y>p.y-.2&&y<p.y+p.h+.2);
 const consoles=[...map.stations.map(p=>({...p,w:1})),{...map.director,w:2}];
 return !blocked&&!consoles.some(p=>x>p.x-.2&&x<p.x+p.w+.2&&y>p.y-.1&&y<p.y+.95);
}
export function routeTo(map:MapDef,start:{x:number;y:number},goal:{x:number;y:number}){
 const step=.5,cols=map.width*2,rows=map.height*2,key=(x:number,y:number)=>y*cols+x;
 const a={x:Math.floor(start.x/step),y:Math.floor(start.y/step)},b={x:Math.floor(goal.x/step),y:Math.floor(goal.y/step)};
 if(!walkable(map,goal.x,goal.y))return [];
 const queue=[a],seen=new Map<number,{x:number;y:number}|null>([[key(a.x,a.y),null]]);let end:null|{x:number;y:number}=null;
 for(let i=0;i<queue.length;i++){const p=queue[i];if(p.x===b.x&&p.y===b.y){end=p;break;}for(const[dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const x=p.x+dx,y=p.y+dy;if(x<0||y<0||x>=cols||y>=rows||seen.has(key(x,y))||!walkable(map,(x+.5)*step,(y+.5)*step))continue;seen.set(key(x,y),p);queue.push({x,y});}}
 if(!end)return [];const out=[];while(end){out.push({x:(end.x+.5)*step,y:(end.y+.5)*step});end=seen.get(key(end.x,end.y))!;}out.reverse();out.shift();out.push(goal);return out;
}
