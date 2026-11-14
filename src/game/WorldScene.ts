import { worldMap } from '../data/expeditions';
import { ensurePlanetArt, PLANET_ART } from './planetArt';
import { hazards } from '../state/expedition';
import Phaser from "phaser";
import type { MapDef, FloorStyle, RoomDef } from "../data/maps";
import type { MissionDef } from "../missions/registry";
import type { MissionSession } from "../state/session";
import { SUBSYSTEMS } from "../sim/types";
import { bus, type InteractTarget } from "../bus";
import { sfx } from "../audio/sfx";
import {
  TILE,
  T,
  SOLID_TILES,
  astronautKey,
  ensureConsoleTextures,
  ensurePropTexture,
  registerTextures,
} from "./textures";
import { SHEET_COLS } from "../art/astronaut";

export interface WorldData {
  mission: MissionDef;
  session: MissionSession;
  astronautId: string;
  playerName: string;
  reducedMotion: boolean;
}

const FLOOR_TILE: Record<FloorStyle, number> = {
  ops: T.F_OPS,
  clean: T.F_CLEAN,
  tech: T.F_TECH,
  hangar: T.F_HANGAR,
  lobby: T.F_LOBBY,
  corridor: T.F_CORRIDOR,
};

interface Door {
  rect: Phaser.Geom.Rectangle;
  panels: Phaser.GameObjects.Image[];
  body: Phaser.GameObjects.Zone;
  open: boolean;
  horizontal: boolean;
  /** closed position of each panel along the opening axis (x for horizontal, y for vertical doors) */
  closedX: number[];
}

interface Interactable {
  target: InteractTarget;
  /** world point the player must stand near */
  fx: number;
  fy: number;
  label: string;
  badge?: Phaser.GameObjects.Text;
  screen?: Phaser.GameObjects.Image;
  glow?: Phaser.GameObjects.Image;
  accent: string;
}

const SPEED = 230;
const INTERACT_RANGE = 62;

export class WorldScene extends Phaser.Scene {
  private d!: WorldData;
  private map!: MapDef;
  private grid: number[][] = [];
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private doors: Door[] = [];
  private interactables: Interactable[] = [];
  private near: Interactable | null = null;
  private prompt!: Phaser.GameObjects.Container;
  private promptText!: Phaser.GameObjects.Text;
  private locked = false;
  private facing: "down" | "up" | "side" = "down";
  private stepT = 0;
  private posT = 0;
  private remoteAvatars=new Map<string,{sprite:Phaser.GameObjects.Sprite;label:Phaser.GameObjects.Text}>();
  private hazardLayer!:Phaser.GameObjects.Graphics;
  private routeLayer!:Phaser.GameObjects.Graphics;
  private unsub: (() => void) | null = null;

  constructor() {
    super("world");
  }

  init(d: WorldData) {
    this.d = d;
    const local=d.session.snapshot.runtime.crew.find(p=>p.id===d.session.selfId)!;
    this.map = worldMap(d.mission.map!,local.location);
    this.remoteAvatars=new Map();
    this.doors = [];
    this.interactables = [];
    this.near = null;
    this.locked = false;
  }

  create() {
    registerTextures(this);
    this.buildGrid();
    const W = this.map.width * TILE;
    const H = this.map.height * TILE;

    const surface=this.map.theme==='planet';
    if(surface)this.cameras.main.setBackgroundColor(PLANET_ART[this.map.planetId!].sky);
    else {
      this.add.tileSprite(0,0,this.scale.width*2,this.scale.height*2,'stars-far').setOrigin(0).setScrollFactor(.05).setDepth(-20);
      this.add.tileSprite(0,0,this.scale.width*2,this.scale.height*2,'stars').setOrigin(0).setScrollFactor(.12).setDepth(-19).setAlpha(.8);
    }
    // Terrain uses the same authoritative maze, with natural ridges replacing ship walls.
    const tileKey=surface?ensurePlanetArt(this,this.map.planetId!):'tileset';
    const data=this.grid.map(row=>row.map(v=>v===T.VOID&&!surface?-1:v));
    const tm = this.make.tilemap({ data, tileWidth: TILE, tileHeight: TILE });
    const ts = tm.addTilesetImage("tileset", tileKey, TILE, TILE, 0, 0)!;
    const layer = tm.createLayer(0, ts, 0, 0)!;
    layer.setDepth(-10);
    layer.setCollision(SOLID_TILES);
    this.routeLayer=this.add.graphics().setDepth(4500);
    this.hazardLayer=this.add.graphics().setDepth(4000);

    this.addRoomDressing();
    const solids = this.physics.add.staticGroup();
    this.addProps(solids);
    this.addStations(solids);
    this.addDoors();

    // Player
    const current=this.d.session.snapshot.runtime.crew.find(p=>p.id===this.d.session.selfId)!;
    const sx = current.x*TILE;
    const sy = current.y*TILE;
    const key = astronautKey(this.d.astronautId);
    this.makeAnims(key);
    this.player = this.physics.add.sprite(sx, sy, key, 4) as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    this.player.setOrigin(0.5, 0.9);
    this.player.body.setSize(24, 14).setOffset(20, 45);
    this.player.setMaxVelocity(SPEED, SPEED);
    this.player.setDamping(false);
    this.player.body.moves=false;

    const nameTag = this.add
      .text(sx, sy - 66, this.d.playerName, { fontFamily: "Inter, sans-serif", fontSize: "12px", color: "#E8F4FF", backgroundColor: "rgba(8,14,28,0.65)", padding: { x: 6, y: 2 } })
      .setOrigin(0.5)
      .setDepth(5000);
    this.events.on("postupdate", () => nameTag.setPosition(this.player.x, this.player.y - 66));

    this.physics.add.collider(this.player, layer);
    this.physics.add.collider(this.player, solids);
    for (const door of this.doors) this.physics.add.collider(this.player, door.body);

    // Camera
    const cam = this.cameras.main;
    cam.setBounds(-TILE * 2, -TILE * 2, W + TILE * 4, H + TILE * 4);
    cam.startFollow(this.player, true, 0.12, 0.12);
    cam.setRoundPixels(true);
    this.fitZoom();
    this.scale.on("resize", this.fitZoom, this);
    if (!this.d.reducedMotion) cam.fadeIn(500, 6, 10, 20);

    // Prompt bubble
    this.promptText = this.add.text(0, 0, "", { fontFamily: "Inter, sans-serif", fontSize: "13px", color: "#E8F4FF" }).setOrigin(0, 0.5);
    const keyCap = this.add.text(0, 0, "E", { fontFamily: "Space Grotesk, sans-serif", fontSize: "13px", color: "#06101C", backgroundColor: "#2EE6C5", padding: { x: 6, y: 2 } }).setOrigin(0.5);
    const bg = this.add.rectangle(0, 0, 10, 26, 0x0a1426, 0.88).setStrokeStyle(1, 0x2ee6c5, 0.8).setOrigin(0, 0.5);
    this.prompt = this.add.container(0, 0, [bg, keyCap, this.promptText]).setDepth(6000).setVisible(false);
    this.prompt.setData("bg", bg);
    this.prompt.setData("cap", keyCap);

    // Input: do not capture keys so DOM panels keep working
    const kb = this.input.keyboard!;
    const k = (code: number) => kb.addKey(code, false);
    const KC = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {
      up: k(KC.W),
      down: k(KC.S),
      left: k(KC.A),
      right: k(KC.D),
      up2: k(KC.UP),
      down2: k(KC.DOWN),
      left2: k(KC.LEFT),
      right2: k(KC.RIGHT),
      interact: k(KC.E),
    };

    bus.on("lock", this.onLock, this);
    this.unsub = this.d.session.on(() => this.refreshBadges());
    this.refreshBadges();
    this.input.on('pointerdown',(pointer:Phaser.Input.Pointer)=>{if(!this.locked)bus.emit('walk:target',{x:pointer.worldX/TILE,y:pointer.worldY/TILE});});
    this.events.once("shutdown", () => {
      bus.off("lock", this.onLock, this);
      this.scale.off("resize", this.fitZoom, this);
      this.unsub?.();
    });
  }

  private onLock(v: boolean) {
    this.locked = v;
    if (v) {this.player?.setAcceleration(0, 0).setVelocity(0, 0);bus.emit('move:input',{x:0,y:0,stop:true});}
  }

  private fitZoom() {
    const w = this.scale.width;
    const h = this.scale.height;
    const z = Phaser.Math.Clamp(Math.min(w / 1050, h / 640), 0.85, 1.7);
    this.cameras.main.setZoom(z);
  }

  // -------------------------------------------------------------------------------------------
  // Map construction
  // -------------------------------------------------------------------------------------------

  private buildGrid() {
    const { width, height } = this.map;
    const g: number[][] = Array.from({ length: height }, () => Array(width).fill(T.VOID));
    const carve = (x: number, y: number, w: number, h: number, v: number) => {
      for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (j >= 0 && j < height && i >= 0 && i < width) g[j][i] = v;
    };
    for (const c of this.map.corridors) carve(c.x, c.y, c.w, c.h, T.F_CORRIDOR);
    for (const r of this.map.rooms) carve(r.x, r.y, r.w, r.h, FLOOR_TILE[r.floor]);
    for (const d of this.map.doors) carve(d.x, d.y, d.w, d.h, T.F_DOOR);
    const isFloor = (x: number, y: number) => y >= 0 && y < height && x >= 0 && x < width && g[y][x] >= T.F_OPS;
    // walls around floors
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        if (g[y][x] !== T.VOID) continue;
        let n = false;
        for (let dy = -1; dy <= 1 && !n; dy++) for (let dx = -1; dx <= 1 && !n; dx++) if (isFloor(x + dx, y + dy)) n = true;
        if (n) g[y][x] = T.WALL;
      }
    // wall faces (wall with floor directly below)
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (g[y][x] === T.WALL && isFloor(x, y + 1) && g[y + 1][x] !== T.F_DOOR) g[y][x] = T.WALL_FACE;
    for (const w of this.map.windows) for (let i = w.x; i < w.x + w.w; i++) if (g[w.y][i] === T.WALL_FACE) g[w.y][i] = T.WINDOW;
    this.grid = g;
  }

  private addRoomDressing() {
    for (const r of this.map.rooms) {
      if(!r.name)continue;
      const cx = (r.x + r.w / 2) * TILE;
      const cy = (r.y + r.h - 0.9) * TILE;
      this.add
        .text(cx, cy, r.name.toUpperCase(), { fontFamily: "Space Grotesk, sans-serif", fontSize: "22px", color: "#9FB3D9", fontStyle: "bold" })
        .setOrigin(0.5)
        .setAlpha(r.floor === "clean" ? 0.35 : 0.16)
        .setDepth(-9)
        .setLetterSpacing(4);
      if(this.map.theme!=='planet')this.addCeilingLights(r);
    }
    // corridor lights
    for (const c of this.map.corridors)
      for (let x = c.x + 2; x < c.x + c.w; x += 5)
        this.add.image((x + 0.5) * TILE, (c.y + c.h / 2) * TILE, "glow").setTint(0x2ee6c5).setAlpha(0.12).setScale(1.4).setBlendMode(Phaser.BlendModes.ADD).setDepth(-8);
  }

  private addCeilingLights(r: RoomDef) {
    const tint = this.d.mission.id==='evac'?0xff8974:r.floor === "clean" ? 0xdfefff : r.floor === "hangar" ? 0xffd9a0 : r.floor === "lobby" ? 0xc9a8ff : 0x7fd8ff;
    for (let y = r.y + 2; y < r.y + r.h; y += 5)
      for (let x = r.x + 2; x < r.x + r.w; x += 5) {
        const gl = this.add.image((x + 0.5) * TILE, (y + 0.5) * TILE, "glow").setTint(tint).setAlpha(0.13).setScale(3.2).setBlendMode(Phaser.BlendModes.ADD).setDepth(-8);
        if (!this.d.reducedMotion) this.tweens.add({ targets: gl, alpha: 0.09, duration: 2200 + Math.random() * 1800, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      }
  }

  private addProps(solids: Phaser.Physics.Arcade.StaticGroup) {
    for (const p of this.map.props) {
      const key = ensurePropTexture(this, p.kind, p.w, p.h);
      const img = this.add.image(p.x * TILE, p.y * TILE - 16, key).setOrigin(0, 0);
      img.setDepth((p.y + p.h) * TILE - 2);
      if (p.solid) {
        const inset = 4;
        const z = this.add.zone(p.x * TILE + inset, p.y * TILE + inset, p.w * TILE - inset * 2, p.h * TILE - inset * 2).setOrigin(0);
        solids.add(z);
      }
      if (p.kind === "holo" && !this.d.reducedMotion) this.tweens.add({ targets: img, alpha: 0.75, duration: 900, yoyo: true, repeat: -1 });
      if (p.kind === "platform") {
        const size = Math.min(p.w, p.h) * TILE * 0.8;
        const top = this.add
          .image((p.x + p.w / 2) * TILE, (p.y + p.h / 2) * TILE - 16, "platform-top")
          .setDisplaySize(size, size)
          .setDepth((p.y + p.h) * TILE - 1);
        if (!this.d.reducedMotion) this.tweens.add({ targets: top, angle: 360, duration: 14_000, repeat: -1 });
      }
    }
  }

  private addStations(solids: Phaser.Physics.Arcade.StaticGroup) {
    const stations = this.d.mission.stations;
    for (const pl of this.map.stations) {
      const st = stations.find((s) => s.id === pl.stationId);
      if (!st) continue;
      const accent = SUBSYSTEMS[st.subsystem].color;
      this.addConsole(pl.x, pl.y, accent, false, solids, { kind: "station", id: st.id }, `${st.title} - ${SUBSYSTEMS[st.subsystem].short}`);
    }
    const dr = this.map.director;
    this.addConsole(dr.x, dr.y, "#2EE6C5", true, solids, { kind: "director" }, this.map.theme==='planet'?'Research station':this.d.mission.id==='evac'?'Evacuation dock':this.d.mission.id==='lazarus'?'Expedition Control':'Flight Director - Run Mission');
    if(this.map.theme==='planet'){
      const x=(this.map.spawn.x+.5)*TILE,y=(this.map.spawn.y+.5)*TILE;
      const pad=this.add.graphics().setDepth(-7);pad.lineStyle(3,0x7dd9dc).strokeCircle(x,y,48);pad.fillStyle(0x7dd9dc,.2).fillCircle(x,y,36);
      const craft=this.add.graphics().setDepth(y-28);
      craft.fillStyle(0x101d28,.3).fillEllipse(x,y-20,94,26);
      craft.lineStyle(5,0x293c4a).lineBetween(x-20,y-56,x-42,y-22).lineBetween(x+20,y-56,x+42,y-22);
      craft.lineStyle(4,0xb8cbd1).lineBetween(x-51,y-22,x-33,y-22).lineBetween(x+33,y-22,x+51,y-22);
      craft.fillStyle(0xc9d8df).fillRoundedRect(x-27,y-103,54,74,24);
      craft.fillStyle(0x284c5b).fillRoundedRect(x-18,y-85,36,26,11);
      craft.lineStyle(2,0x78cbd1).lineBetween(x-13,y-81,x+4,y-81);
      craft.fillStyle(0x354b60).fillRect(x-49,y-70,19,29).fillRect(x+30,y-70,19,29);
      craft.lineStyle(2,0x81a9be).lineBetween(x-39,y-68,x-39,y-43).lineBetween(x+39,y-68,x+39,y-43);

      this.add.text(x,y+48,'LANDER · E',{fontFamily:'Space Grotesk',fontSize:'14px',color:'#a2e4e2'}).setOrigin(.5);
      this.interactables.push({target:{kind:'director'},fx:x,fy:y,label:'Lander · return to mothership',accent:'#2EE6C5'});
    }
  }

  private addConsole(
    tx: number,
    ty: number,
    accent: string,
    wide: boolean,
    solids: Phaser.Physics.Arcade.StaticGroup,
    target: InteractTarget,
    label: string,
  ) {
    const keys = ensureConsoleTextures(this, accent, wide);
    const w = wide ? 2 : 1;
    const x = tx * TILE;
    const y = ty * TILE;
    const color = Phaser.Display.Color.HexStringToColor(accent).color;
    const glow = this.add.image(x + (w * TILE) / 2, y + TILE * 0.6, "glow").setTint(color).setAlpha(0.35).setScale(w * 1.6).setBlendMode(Phaser.BlendModes.ADD).setDepth(y + TILE - 3);
    this.add.image(x, y - 24, keys.body).setOrigin(0).setDepth(y + TILE - 2);
    const screen = this.add.image(x + 8, y - 24 + 7, keys.screen).setOrigin(0).setDepth(y + TILE - 1);
    if (!this.d.reducedMotion) this.tweens.add({ targets: screen, alpha: 0.7, duration: 600 + Math.random() * 500, yoyo: true, repeat: -1 });
    const z = this.add.zone(x + 2, y + 4, w * TILE - 4, TILE - 8).setOrigin(0);
    solids.add(z);
    const badge = this.add
      .text(x + (w * TILE) / 2, y - 40, "!", { fontFamily: "Space Grotesk, sans-serif", fontSize: "16px", fontStyle: "bold", color: "#06101C", backgroundColor: "#FFB020", padding: { x: 7, y: 1 } })
      .setOrigin(0.5)
      .setDepth(5500);
    if (!this.d.reducedMotion) this.tweens.add({ targets: badge, y: y - 46, duration: 700, yoyo: true, repeat: -1, ease: "Sine.inOut" });
    this.interactables.push({ target, fx: x + (w * TILE) / 2, fy: y + TILE + 18, label, badge, screen, glow, accent });
  }

  private addDoors() {
    for (const d of this.map.doors) {
      const rect = new Phaser.Geom.Rectangle(d.x * TILE, d.y * TILE, d.w * TILE, d.h * TILE);
      const horizontal = d.w >= d.h;
      const panels: Phaser.GameObjects.Image[] = [];
      const closedX: number[] = [];
      if (horizontal) {
        const halfW = rect.width / 2;
        for (let i = 0; i < 2; i++) {
          const px = rect.x + i * halfW;
          const img = this.add.image(px, rect.y - 12, "door").setOrigin(0).setDisplaySize(halfW, TILE + 12).setDepth(rect.bottom - 1);
          if (i === 1) img.setFlipX(true);
          panels.push(img);
          closedX.push(px);
        }
      } else {
        // Hatch in a vertical wall: two panels that retract up and down into the frame.
        const halfH = rect.height / 2;
        for (let i = 0; i < 2; i++) {
          const py = rect.y + i * halfH;
          const img = this.add.image(rect.x, py, "door-v").setOrigin(0).setDisplaySize(rect.width, halfH).setDepth(rect.bottom - 1);
          if (i === 1) img.setFlipY(true);
          panels.push(img);
          closedX.push(py);
        }
      }
      const body = this.add.zone(rect.x, rect.y, rect.width, rect.height).setOrigin(0);
      this.physics.add.existing(body, true);
      this.doors.push({ rect, panels, body, open: false, horizontal, closedX });
    }
  }
  private makeAnims(key: string) {
    const rows: Array<["down" | "up" | "side", number]> = [
      ["down", 0],
      ["up", 1],
      ["side", 2],
    ];
    for (const [name, row] of rows) {
      const k = `${key}-walk-${name}`;
      if (!this.anims.exists(k))
        this.anims.create({ key: k, frames: [0, 1, 2, 3].map((c) => ({ key, frame: row * SHEET_COLS + c })), frameRate: 9, repeat: -1 });
    }
  }

  // -------------------------------------------------------------------------------------------
  // Per-frame
  // -------------------------------------------------------------------------------------------

  update(_t: number, dtMs: number) {
    const dt=Math.min(.25,dtMs/1000),snapshot=this.d.session.snapshot,r=snapshot.runtime,local=r.crew.find(p=>p.id===this.d.session.selfId)!;
    if(!local)return;
    const k=this.keys;
    let ix=0,iy=0;
    if(!this.locked&&snapshot.status==='active'&&local.alive&&!local.escaped&&!local.travel){ix=Number(k.right.isDown||k.right2.isDown)-Number(k.left.isDown||k.left2.isDown);iy=Number(k.down.isDown||k.down2.isDown)-Number(k.up.isDown||k.up2.isDown);}
    this.posT-=dt;
    if(this.posT<=0){this.posT=.06;bus.emit('move:input',{x:ix,y:iy});bus.emit('player:pos',{x:local.x,y:local.y});}
    this.player.setPosition(Phaser.Math.Linear(this.player.x,local.x*TILE,.65),Phaser.Math.Linear(this.player.y,local.y*TILE,.65));
    this.player.setAlpha(local.alive&&!local.escaped?1:.35);
    this.facing=local.facing==='left'||local.facing==='right'?'side':local.facing==='up'?'up':'down';this.player.setFlipX(local.facing==='left');
    const key=astronautKey(this.d.astronautId);
    if(local.moving&&local.alive&&!local.escaped){this.player.anims.play(`${key}-walk-${this.facing}`,true);this.stepT-=dt;if(this.stepT<=0){sfx.play('step');this.stepT=.3;}}
    else {this.player.anims.stop();this.player.setFrame({down:4,up:9,side:14}[this.facing]);}
    this.player.setDepth(this.player.y);
    const present=new Set<string>();
    for(const p of r.crew){if(p.id===local.id||p.location!==local.location)continue;present.add(p.id);let a=this.remoteAvatars.get(p.id);if(!a){const texture=astronautKey(p.astronautId);this.makeAnims(texture);a={sprite:this.add.sprite(p.x*TILE,p.y*TILE,texture,4).setOrigin(.5,.9),label:this.add.text(p.x*TILE,p.y*TILE-65,p.name,{fontFamily:'Inter',fontSize:'12px',color:'#b6c9dc',backgroundColor:'#080e1c'}).setOrigin(.5).setDepth(5000)};this.remoteAvatars.set(p.id,a);}a.sprite.setPosition(Phaser.Math.Linear(a.sprite.x,p.x*TILE,.4),Phaser.Math.Linear(a.sprite.y,p.y*TILE,.4)).setDepth(p.y*TILE).setAlpha(p.alive&&!p.escaped?1:.3).setFlipX(p.facing==='left');a.label.setPosition(a.sprite.x,a.sprite.y-65);const f=p.facing==='left'||p.facing==='right'?'side':p.facing==='up'?'up':'down';if(p.moving)a.sprite.anims.play(`${astronautKey(p.astronautId)}-walk-${f}`,true);else a.sprite.anims.stop();}
    for(const[id,a]of this.remoteAvatars)if(!present.has(id)){a.sprite.destroy();a.label.destroy();this.remoteAvatars.delete(id);}
    const g=this.hazardLayer;g.clear();this.routeLayer.clear();
    if(local.route.length){this.routeLayer.lineStyle(2,0x2ee6c5,.6).beginPath().moveTo(local.x*TILE,local.y*TILE);for(const p of local.route)this.routeLayer.lineTo(p.x*TILE,p.y*TILE);this.routeLayer.strokePath();}
    if(this.d.mission.id==='evac'||local.location!=='ship')for(const hazard of hazards(r,local.location)){
      const x=hazard.x*TILE,y=hazard.y*TILE,rad=hazard.r*TILE,color=hazard.kind==='organism'?0xd5a974:hazard.kind==='breach'?0x080912:0xff695c;
      g.fillStyle(color,.2).fillCircle(x,y,rad+9);g.lineStyle(2,hazard.kind==='breach'?0xf5a579:color,.8).strokeCircle(x,y,rad);
      if(hazard.kind==='organism'){g.fillStyle(0x8d7957).fillEllipse(x,y,40,32);g.fillStyle(0xffd887).fillCircle(x-9,y-7,4).fillCircle(x+9,y-7,4);g.lineStyle(3,0x998763).lineBetween(x-18,y,x-29,y+12).lineBetween(x+18,y,x+29,y+12);}
      else if(hazard.kind==='breach'){g.fillStyle(0x030611).fillCircle(x,y,rad*.85);g.lineStyle(2,0xb4c3d4).lineBetween(x-rad,y-rad,x+rad*.7,y+rad*.3);}
      else {g.lineStyle(3,color).strokeTriangle(x-12,y+11,x,y-13,x+12,y+11);}
    }
    if(this.d.mission.id==='evac'&&!r.sealed.includes('containment')){g.lineStyle(2,0x2ee6c5).strokeRect(19.7*TILE,14.3*TILE,1.6*TILE,1.4*TILE);}
    this.updateDoors();
    this.updateInteraction();

    if (!this.locked && Phaser.Input.Keyboard.JustDown(k.interact))bus.emit('use');


  }

  private updateDoors() {
    const px = this.player.x;
    const py = this.player.y;
    for (const d of this.doors) {
      const cx = d.rect.centerX;
      const cy = d.rect.centerY;
      const near = d.horizontal
        ? Math.abs(px - cx) < d.rect.width / 2 + TILE * 0.9 && Math.abs(py - cy) < TILE * 1.9
        : Math.abs(px - cx) < TILE * 1.9 && Math.abs(py - cy) < d.rect.height / 2 + TILE * 0.9;
      if (near === d.open) continue;
      d.open = near;
      const body = d.body.body as Phaser.Physics.Arcade.StaticBody;
      body.enable = !near;
      this.tweens.killTweensOf(d.panels);
      const dur = this.d.reducedMotion ? 1 : 220;
      if (d.horizontal) {
        const half = d.rect.width / 2;
        d.panels.forEach((p, i) => {
          // Panels retract into the door frame: shrink toward their outer edge.
          const openW = half * 0.14;
          const targetW = near ? openW : half;
          const targetX = i === 0 ? d.closedX[0] : near ? d.closedX[1] + half - openW : d.closedX[1];
          this.tweens.add({ targets: p, x: targetX, displayWidth: targetW, duration: dur, ease: "Cubic.out" });
        });
      } else {
        const half = d.rect.height / 2;
        d.panels.forEach((p, i) => {
          const openH = half * 0.14;
          const targetH = near ? openH : half;
          const targetY = i === 0 ? d.closedX[0] : near ? d.closedX[1] + half - openH : d.closedX[1];
          this.tweens.add({ targets: p, y: targetY, displayHeight: targetH, duration: dur, ease: "Cubic.out" });
        });
      }
      sfx.play("door");
    }
  }
  private updateInteraction() {
    let best: Interactable | null = null;
    let bestD = INTERACT_RANGE;
    for (const it of this.interactables) {
      const dd = Phaser.Math.Distance.Between(this.player.x, this.player.y, it.fx, it.fy);
      if (dd < bestD) {
        bestD = dd;
        best = it;
      }
    }
    if (best !== this.near) {
      this.near = best;
      bus.emit("near", best ? best.target : null);
      if (best) {
        const text = this.locked ? "" : best.label;
        this.promptText.setText(text);
        const cap = this.prompt.getData("cap") as Phaser.GameObjects.Text;
        const bg = this.prompt.getData("bg") as Phaser.GameObjects.Rectangle;
        const w = this.promptText.width + 46;
        bg.setSize(w, 28).setPosition(-w / 2, 0);
        cap.setPosition(-w / 2 + 16, 0);
        this.promptText.setPosition(-w / 2 + 32, 0);
        this.prompt.setPosition(best.fx, best.fy - TILE * 2.3);
      }
    }
    this.prompt.setVisible(!!this.near && !this.locked);
  }

  private refreshBadges() {
    const s = this.d.session.snapshot;
    const allDone = this.d.mission.stations.every((st) => s.decisions[st.id]);
    for (const it of this.interactables) {
      if (!it.badge) continue;
      if (it.target.kind === "station") {
        const done = !!s.decisions[it.target.id];
        it.badge.setText(done ? "OK" : "!");
        it.badge.setBackgroundColor(done ? "#2EE6C5" : "#FFB020");
      } else {
        it.badge.setText(allDone ? "RUN" : "...");
        it.badge.setBackgroundColor(allDone ? "#2EE6C5" : "#55607A");
      }
    }
  }

  /** For the map overlay */
  getGrid() {
    return this.grid;
  }
}
