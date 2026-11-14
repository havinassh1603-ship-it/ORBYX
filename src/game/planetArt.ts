import type Phaser from 'phaser';
import { TILE, TILE_COUNT, T } from './textures';

export const PLANET_ART:Record<string,{ground:string;light:string;ridge:string;dark:string;sky:string}>={
 cindra:{ground:'#9b7052',light:'#d6ad7b',ridge:'#72503f',dark:'#49392f',sky:'#261f24'},
 veyra:{ground:'#547d65',light:'#9bb18b',ridge:'#355b4c',dark:'#243f3a',sky:'#183137'},
 talos:{ground:'#746680',light:'#b3a5b9',ridge:'#4d465f',dark:'#312d43',sky:'#242237'},
 orison:{ground:'#88a8b6',light:'#dbe6e6',ridge:'#536f83',dark:'#314c66',sky:'#1e3047'},
};

/** Original painted terrain tiles. Collision is still supplied by the shared maze map. */
export function ensurePlanetArt(scene:Phaser.Scene,id:string){
 const key='terrain-'+id;if(scene.textures.exists(key))return key;
 const p=PLANET_ART[id]||PLANET_ART.cindra,c=document.createElement('canvas');c.width=TILE*TILE_COUNT;c.height=TILE;const g=c.getContext('2d')!;
 let seed=id.split('').reduce((a,b)=>a+b.charCodeAt(0),321);
 const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<TILE_COUNT;i++){
  g.save();g.translate(i*TILE,0);g.beginPath();g.rect(0,0,TILE,TILE);g.clip();
  const ground=i>=T.F_OPS,face=i===T.WALL_FACE;
  g.fillStyle=ground?p.ground:i===T.VOID?p.dark:p.ridge;g.fillRect(0,0,TILE,TILE);
  // Small grains and imperfect seams avoid a metal-panel grid on the surface.
  for(let n=0;n<80;n++){g.globalAlpha=.06+rnd()*.12;g.fillStyle=n%2?p.light:p.dark;g.fillRect(rnd()*TILE,rnd()*TILE,1+rnd()*2,1+rnd()*2);}g.globalAlpha=1;
  if(ground){
   g.strokeStyle=p.light;g.globalAlpha=.16;g.lineWidth=1;
   for(let n=0;n<3;n++){const y=rnd()*TILE;g.beginPath();g.moveTo(-5,y);g.bezierCurveTo(10,y-8,30,y+12,TILE+4,y-3);g.stroke();}g.globalAlpha=1;
   for(let n=0;n<3;n++){const x=4+rnd()*40,y=4+rnd()*40;g.fillStyle=p.dark;g.globalAlpha=.3;g.beginPath();g.ellipse(x,y,2+rnd()*3,1+rnd()*2,0,0,Math.PI*2);g.fill();}g.globalAlpha=1;
   if(id==='veyra'){g.strokeStyle='#b0c59a';g.globalAlpha=.25;for(let n=0;n<4;n++){const x=rnd()*TILE,y=rnd()*TILE;g.beginPath();g.moveTo(x-2,y+3);g.lineTo(x,y-2);g.lineTo(x+2,y+2);g.stroke();}g.globalAlpha=1;}
   if(id==='orison'){g.strokeStyle='#d6e9ec';g.globalAlpha=.32;g.beginPath();g.moveTo(4,25);g.lineTo(19,18);g.lineTo(27,28);g.lineTo(47,20);g.stroke();g.globalAlpha=1;}
  }else{
   // Angular elevated ridges surround the walkable channels.
   for(let n=0;n<3;n++){const x=n*20-9,y=8+rnd()*14;g.fillStyle=n%2?p.ridge:p.dark;g.beginPath();g.moveTo(x,42);g.lineTo(x+6,y+6);g.lineTo(x+19,y);g.lineTo(x+31,40);g.closePath();g.fill();g.strokeStyle=p.light;g.globalAlpha=.25;g.beginPath();g.moveTo(x+7,y+7);g.lineTo(x+19,y+1);g.lineTo(x+25,y+10);g.stroke();g.globalAlpha=1;}
   if(face){const shadow=g.createLinearGradient(0,0,0,TILE);shadow.addColorStop(0,'#00000000');shadow.addColorStop(1,'#00000066');g.fillStyle=shadow;g.fillRect(0,0,TILE,TILE);}
  }
  g.restore();
 }
 scene.textures.addCanvas(key,c);return key;
}
