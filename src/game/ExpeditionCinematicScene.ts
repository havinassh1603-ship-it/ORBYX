import Phaser from 'phaser';
import { registerTextures } from './textures';
import { bus } from '../bus';
import type { AdvancedCinematic } from '../missions/registry';
export class ExpeditionCinematicScene extends Phaser.Scene {
 constructor(){super('cinematic-expedition');}
 create(data:{info:AdvancedCinematic;outcome:string;reducedMotion:boolean}){
  registerTextures(this);const {width:w,height:h}=this.scale;this.cameras.main.setBackgroundColor('#060a14');this.add.tileSprite(0,0,w,h,'stars').setOrigin(0).setAlpha(.7);
  const g=this.add.graphics();g.lineStyle(2,0x2ee6c5,.35);g.strokeEllipse(w*.53,h*.48,w*.7,h*.5);
  if(data.info.missionId==='evac'){
   g.fillStyle(0x23394e).fillRoundedRect(w*.67,h*.31,180,120,20);g.lineStyle(3,0x7bbabf).strokeRoundedRect(w*.67,h*.31,180,120,20);g.fillStyle(0x2ee6c5).fillRect(w*.67+36,h*.31+34,80,18);
   for(let i=0;i<(data.info.crewCount??4);i++){const x=w*.2,y=h*.3+i*58,pod=this.add.graphics({x,y});pod.fillStyle(data.outcome==='FAILED'?0xc37a72:0xe3edf1).fillRoundedRect(0,0,46,30,14);pod.fillStyle(0x294e65).fillRoundedRect(9,4,23,12,5);pod.fillStyle(0xffbb74).fillTriangle(-14,15,0,7,0,23);if(!data.reducedMotion)this.tweens.add({targets:pod,x:w*.67-55,y:h*.34+i*25,duration:3600+i*250,ease:'Sine.inOut'});}
  }else{
   for(const [i,color]of [0xb98861,0x50a791,0x987ec2,0x6396b7].entries()){g.fillStyle(color).fillCircle(w*(.24+i*.18),h*.43,35+i*3);g.lineStyle(1,0xffffff,.16).strokeCircle(w*(.24+i*.18),h*.43,45+i*3);}
   const ship=this.add.graphics({x:w*.2,y:h*.67});ship.fillStyle(0xe8edf4).fillTriangle(-24,18,24,18,0,-35);ship.fillStyle(0x2ee6c5).fillRect(-6,-13,12,14);if(!data.reducedMotion)this.tweens.add({targets:ship,x:w*.8,duration:4200,ease:'Sine.inOut'});
  }
  this.add.text(w/2,h*.15,data.info.missionId==='evac'?'THE RESCUE CORRIDOR':'EVIDENCE FOR THE RETURN',{fontFamily:'Space Grotesk',fontSize:'28px',color:'#e8f4ff'}).setOrigin(.5);
  this.add.text(w/2,h*.82,data.outcome==='SUCCESS'?'Mission objectives achieved':data.outcome==='PARTIAL'?'Some objectives achieved':'Critical objectives were not achieved',{fontFamily:'Inter',fontSize:'20px',color:data.outcome==='FAILED'?'#ff8c82':'#2ee6c5'}).setOrigin(.5);
  if(data.info.resultTrace)this.add.text(w/2,h*.89,data.info.resultTrace,{fontFamily:'Inter',fontSize:'14px',color:'#9fb3d9',wordWrap:{width:w*.85},align:'center'}).setOrigin(.5);
  const timer=setTimeout(()=>bus.emit('cinematic:done'),data.reducedMotion?1000:6500);this.events.once('shutdown',()=>clearTimeout(timer));
 }
}
