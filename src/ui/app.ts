import { Room, newId, type Lobby } from '../net/room';
import { multiplayerScreen, lobbyScreen, loadNetwork, expeditionControl, refreshControl } from './expedition';
import { ExpeditionCinematicScene } from '../game/ExpeditionCinematicScene';
import { distance, hazards, runtimeDesign } from '../state/expedition';
import { MODEL_VERSION, type DesignSnapshot } from '../sim/engineering';
import { worldMap } from '../data/expeditions';
import { h, btn } from './dom';
import type { SessionAction, SessionSnapshot } from '../state/session';
import Phaser from "phaser";
import { $, toast } from "./dom";
import { bus, type InteractTarget } from "../bus";
import { sfx } from "../audio/sfx";
import { MISSIONS, missionById, type MissionDef } from "../missions/registry";
import { MissionSession } from "../state/session";
import type { MissionReport } from "../sim/types";
import {
  loadProfile,
  saveProfile,
  recordReport,
  recordDesign,
  isCleared,
  type Profile,
} from "../persist/profile";
import { astronautById } from "../data/astronauts";
import { MenuScene } from "../game/MenuScene";
import { WorldScene, type WorldData } from "../game/WorldScene";
import { CinematicScene } from "../game/CinematicScene";
import { LunarCinematicScene } from "../game/LunarCinematicScene";
import type { CinematicInfo } from "../missions/registry";
import { profileCreateScreen, mainMenuScreen, missionSelectScreen } from "./screens/menus";
import { rosterScreen } from "./screens/roster";
import { briefingScreen } from "./screens/briefing";
import { debriefScreen, historyScreen } from "./screens/debrief";
import { Hud, stationModal, directorModal, mapModal, helpModal, pauseModal } from "./hud";

interface ModalEntry {
  el: HTMLElement;
  id: string;
  dismissable: boolean;
  onClose?: () => void;
  onKey?: (e: KeyboardEvent) => boolean;
}

export class App {
  profile!: Profile;
  game!: Phaser.Game;
  session: MissionSession | null = null;
  mission: MissionDef | null = null;
  private hud: Hud | null = null;
  private modals: ModalEntry[] = [];
  private unsubSession: (() => void) | null = null;
  private ending = false;
  clientId=sessionStorage.getItem('orbyx3-client')||newId();
  room:Room|null=null;
  connecting=false;
  networkError='';
  networkSettings=loadNetwork();
  private roomSignature='';
  private clock:ReturnType<typeof setInterval>|null=null;
  private worldLocation='';
  private previousPhase='';
  private controlRevision=-1;
  private controlSecond=-1;
  referenceDesign:DesignSnapshot|null=null;
  private savedAttempts=new Set<string>();
  private endTimer:ReturnType<typeof setTimeout>|null=null;

  async boot() {
    sessionStorage.setItem('orbyx3-client',this.clientId);
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&this.session?.isHost&&this.session.snapshot.status==='active')void this.submitAction({type:'pause',paused:true});});
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: "game",
      backgroundColor: "#060A14",
      scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
      physics: { default: "arcade", arcade: { debug: false } },
      render: { antialias: true, pixelArt: false, roundPixels: false },
      scene: [],
      input: { keyboard: { capture: [] } },
      audio: { noAudio: true },
    });
    this.game.scene.add("menu", MenuScene, false);
    this.game.scene.add("world", WorldScene, false);
    this.game.scene.add("cinematic", CinematicScene, false);
    this.game.scene.add("cinematic-lunar", LunarCinematicScene, false);
    this.game.scene.add("cinematic-expedition", ExpeditionCinematicScene, false);

    window.addEventListener("keydown", (e) => this.onKey(e));
    window.addEventListener("pointerdown", () => sfx.unlock(), { once: false, capture: true });
    bus.on("interact", (t: InteractTarget) => this.onInteract(t));
    bus.on("cinematic:done", () => this.afterCinematic());
    bus.on('use',()=>this.useNearest());
    bus.on('move:input',(v:{x:number;y:number})=>this.session?.dispatch({type:'input',...v}));
    bus.on('walk:target',(v:{x:number;y:number})=>this.navigate(v));

    const p = await loadProfile();
    await document.fonts?.ready;
    this.game.scene.start("menu", { reducedMotion: p?.settings.reducedMotion });
    if (!p) {
      this.setScreen(profileCreateScreen(this));
      return;
    }
    this.profile = p;
    this.applySettings();
    this.goMenu();
  }

  // -------------------------------------------------------------------------------------------
  // Screens and modals
  // -------------------------------------------------------------------------------------------

  setScreen(el: HTMLElement | null) {
    const root = $("screen");
    root.replaceChildren();
    if (el) root.append(el);
  }

  openModal(el: HTMLElement, opts: { id: string; dismissable?: boolean; onClose?: () => void; onKey?: (e: KeyboardEvent) => boolean }) {
    const wrap = document.createElement("div");
    wrap.className = "modal-wrap";
    wrap.append(el);
    if (opts.dismissable !== false)
      wrap.addEventListener("mousedown", (e) => {
        if (e.target === wrap) this.closeModal();
      });
    this.modals.push({ el: wrap, id: opts.id, dismissable: opts.dismissable !== false, onClose: opts.onClose, onKey: opts.onKey });
    $("modal").append(wrap);
    sfx.play("open");
    this.syncLock();
  }

  closeModal(id?: string) {
    const idx = id ? this.modals.map((m) => m.id).lastIndexOf(id) : this.modals.length - 1;
    if (idx < 0) return;
    const [m] = this.modals.splice(idx, 1);
    m.el.remove();
    sfx.play("close");
    m.onClose?.();
    this.syncLock();
  }

  closeAllModals() {
    while (this.modals.length) {
      const m = this.modals.pop()!;
      m.el.remove();
      m.onClose?.();
    }
    this.syncLock();
  }

  topModal(): string | null {
    return this.modals.length ? this.modals[this.modals.length - 1].id : null;
  }

  private syncLock() {
    bus.emit("lock", this.modals.length > 0);
  }

  private onKey(e: KeyboardEvent) {
    const typing = (e.target as HTMLElement)?.tagName === "INPUT";
    const top = this.modals[this.modals.length - 1];
    if (top?.onKey && top.onKey(e)) {
      e.preventDefault();
      return;
    }
    if (e.key === "Escape") {
      if (top) {
        if (top.dismissable) this.closeModal();
        e.preventDefault();
        return;
      }
      if (this.inMission()) {
        this.openPause();
        e.preventDefault();
      }
      return;
    }
    if (typing) return;
    if (!this.inMission()) return;
    const k = e.key.toLowerCase();
    if (k === "m") {
      if (top?.id === "map") this.closeModal("map");
      else if (!top) this.openMap();
      e.preventDefault();
    } else if (k === "h" || e.key === "?") {
      if (top?.id === "help") this.closeModal("help");
      else if (!top) this.openHelp();
      e.preventDefault();
    }
  }

  inMission() {
    return !!this.session && (this.session.snapshot.status === "active" || this.session.snapshot.status === "paused") && !this.ending;
  }

  // -------------------------------------------------------------------------------------------
  // Profile and settings
  // -------------------------------------------------------------------------------------------

  async save() {
    await saveProfile(this.profile);
  }

  setProfile(p: Profile) {
    this.profile = p;
    this.applySettings();
    void this.save();
  }

  applySettings() {
    const s = this.profile.settings;
    document.documentElement.style.setProperty("--ui-scale", String(s.uiScale));
    document.documentElement.classList.toggle("reduced", s.reducedMotion);
    sfx.apply(s);
  }

  isUnlocked(m: MissionDef) {
    return !m.unlockedBy || isCleared(this.profile, m.unlockedBy);
  }

  // -------------------------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------------------------

  goMenu() {
    this.ensureBackdrop();
    this.setScreen(mainMenuScreen(this));
  }

  goMissionSelect() {
    this.ensureBackdrop();
    this.setScreen(missionSelectScreen(this, MISSIONS));
  }

  goRoster(missionId: string) {
    this.referenceDesign=null;
    this.setScreen(rosterScreen(this, missionId));
  }

  goBriefing(missionId: string) {
    this.setScreen(briefingScreen(this, missionById(missionId)));
  }

  goHistory() {
    this.ensureBackdrop();
    this.setScreen(historyScreen(this));
  }

  saveCurrentDesign(){
    if(!this.session)return;
    this.profile=recordDesign(this.profile,runtimeDesign(this.session.mission.id,this.session.raw.runtime,this.session.snapshot.decisions,this.session.mode));
    void this.save();toast('Design saved. Reuse it from Mission history.','ok');
  }
  reuseDesign(design:DesignSnapshot){
    if(this.room){toast('Saved designs can be revised in solo mode.','info');return;}
    if(design.modelVersion!==MODEL_VERSION||design.scenario!=='solo:1'){toast('Reuse needs the same engineering model and a solo design. The recorded report remains available.','warn');return;}
    if(!this.isUnlocked(missionById(design.missionId))){toast('Clear the preceding mission first.','warn');return;}
    this.referenceDesign=structuredClone(design);this.goBriefing(design.missionId);
  }
  reopenDirector(){
    if(!this.session||!this.mission)return;
    this.closeModal('director');this.openModal(directorModal(this,this.mission,this.session),{id:'director'});
  }
  async restoreExpeditionReference(){
    const design=this.referenceDesign;
    if(!design?.expeditions||this.session?.mission.id!=='lazarus'||this.room||this.session.raw.runtime.phase!=='allocation')return;
    for(const saved of design.expeditions){
      if(!this.session.raw.runtime.surveys.some(s=>s.planetId===saved.planetId))continue;
      if(!await this.submitAction({type:'surveyKit',planetId:saved.planetId,kitId:saved.kitId}))return;
      for(const [resource,value]of Object.entries(saved.allocation))if(!await this.submitAction({type:'allocate',planetId:saved.planetId,resource,value}))return;
    }
    if(design.earthFuel)await this.submitAction({type:'earthFuel',value:design.earthFuel});
    toast('Saved expedition plan loaded. Review the shared totals and reserves before dispatch.','ok');
  }

  private ensureBackdrop() {
    const sm = this.game.scene;
    if (sm.isActive("world")) sm.stop("world");
    if (sm.isActive("cinematic")) sm.stop("cinematic");
    if (sm.isActive("cinematic-lunar")) sm.stop("cinematic-lunar");
    if (sm.isActive("cinematic-expedition")) sm.stop("cinematic-expedition");
    if (!sm.isActive("menu")) sm.start("menu", { reducedMotion: this.profile?.settings.reducedMotion });
  }

  // -------------------------------------------------------------------------------------------
  // Mission lifecycle
  // -------------------------------------------------------------------------------------------

  startMission(missionId: string) {
    const mission = missionById(missionId);
    if (!mission.playable || !this.isUnlocked(mission)) {
      toast("That mission is not available yet.", "warn");
      return;
    }
    this.attachSession(new MissionSession(mission,[{id:this.clientId,name:this.profile.displayName,astronautId:this.profile.astronautId}],undefined,'solo',this.clientId,true));
  }

  private attachSession(session:MissionSession){
    this.closeAllModals();this.unsubSession?.();this.hud?.destroy();this.session=session;this.mission=session.mission;this.ending=false;this.previousPhase='';this.controlRevision=-1;
    this.unsubSession=session.on((state,action)=>this.sessionChanged(state,action));
    this.showWorld();this.startClock();this.sessionChanged(session.snapshot,{type:'sync'});
  }
  private showWorld(){
    if(!this.session||!this.mission)return;
    const mission=this.mission;this.worldLocation=this.session.snapshot.runtime.crew.find(p=>p.id===this.session!.selfId)!.location;
    this.game.scene.stop('world');this.hud?.destroy();
    this.setScreen(null);
    const sm = this.game.scene;
    if (sm.isActive("menu")) sm.stop("menu");
    const data: WorldData = {
      mission,
      session: this.session,
      astronautId: this.session.snapshot.runtime.crew.find(p=>p.id===this.session!.selfId)!.astronautId,
      playerName: this.profile.displayName,
      reducedMotion: this.profile.settings.reducedMotion,
    };
    sm.start("world", data);
    this.hud = new Hud(this, mission, this.session);
    this.hud.mount();
    sfx.startAmbience();
    toast(`${mission.name}: walk to your assigned consoles. Press H for help.`, "info");
  }
  snapshot(){return this.session!.snapshot;}
  private sessionChanged(s:SessionSnapshot,_a:SessionAction){
    const local=s.runtime.crew.find(p=>p.id===this.session!.selfId);
    if(local&&local.location!==this.worldLocation&&!this.ending){this.closeAllModals();this.showWorld();}
    this.hud?.update(s);
    if(s.revision!==this.controlRevision||(local?.location!=='ship'&&Math.floor(s.runtime.elapsed)!==this.controlSecond)){
      this.controlRevision=s.revision;this.controlSecond=Math.floor(s.runtime.elapsed);
      if(this.topModal()==='expedition'&&!this.ending)refreshControl(this);
    }
    if(s.runtime.phase==='voting'&&this.previousPhase!=='voting'&&!this.ending){this.closeAllModals();this.openExpedition();}
    this.previousPhase=s.runtime.phase;
    if(s.status==='running'&&s.report&&!this.ending)this.beginEnding(s.report,s.timeLeftS===0);
  }
  private startClock(){
    if(this.clock)clearInterval(this.clock);let last=performance.now();
    this.clock=setInterval(()=>{const now=performance.now(),dt=(now-last)/1000;last=now;if(this.session&&!this.session.remote)this.session.dispatch({type:'tick',dtS:Math.min(.25,dt)});},50);
  }
  async submitAction(action:Record<string,unknown>):Promise<boolean>{
    if(!this.session)return false;
    try{const a={...action,player:this.session.selfId} as SessionAction;if(this.room)await this.room.action({type:'session',action:a});else this.session.dispatch(a);return true;}
    catch(e){toast((e as Error).message,'warn');return false;}
  }
  navigate(point:{x:number;y:number}){this.session?.dispatch({type:'input',x:0,y:0});void this.submitAction({type:'navigate',...point});}
  useNearest(){
    if(!this.session||this.topModal())return;
    const s=this.session.snapshot,p=s.runtime.crew.find(p=>p.id===this.session!.selfId)!;if(!p.alive||p.escaped||p.travel)return;
    const map=worldMap(this.mission!.map!,p.location);
    if(this.mission!.id==='lazarus'&&p.location!=='ship'){this.openExpedition();return;}
    const st=map.stations.find(st=>distance(p,{x:st.x+.5,y:st.y+1.375})<1.5);
    if(st){this.onInteract({kind:'station',id:st.stationId});return;}
    if(distance(p,{x:map.director.x+1,y:map.director.y+1.375})<1.5){this.onInteract({kind:'director'});return;}
    if(this.mission!.id==='evac'){
      const hazard=hazards(s.runtime,'ship').find(h=>h.kind!=='organism'&&distance(p,h)<2.2);
      if(hazard){void this.submitAction({type:'seal',hazardId:hazard.id});return;}
      if(distance(p,{x:20.5,y:15})<1.8){void this.submitAction({type:'seal',hazardId:'containment'});return;}
    }
    toast('Walk close to a console, dock or repair point. Use the map to plot a route.','info');
  }
  openExpedition(){if(this.session)this.openModal(expeditionControl(this),{id:'expedition'});}
  goMultiplayer(){this.ensureBackdrop();this.setScreen(multiplayerScreen(this));}
  async connectRoom(mode:'host'|'join',code=''){
    if(this.connecting)return;this.connecting=true;this.networkError='';this.roomSignature='';this.goMultiplayer();
    const identity={id:this.clientId,name:this.profile.displayName,astronautId:this.profile.astronautId,cleared:MISSIONS.filter(m=>isCleared(this.profile,m.id)).map(m=>m.id),partials:Object.fromEntries(Object.entries(this.profile.progress).map(([id,p])=>[id,p.partials]))};
    this.room?.close();this.room=new Room(identity,l=>this.roomChanged(l),text=>toast(text,'warn'));
    try{if(mode==='host')await this.room.host(this.networkSettings);else await this.room.join(code,this.networkSettings);}
    catch(e){this.room?.close();this.room=null;this.networkError=(e as Error).message;toast(this.networkError,'warn');}
    this.connecting=false;if(!this.room)this.goMultiplayer();
  }
  private roomChanged(l:Lobby){
    if(l.phase==='mission'&&this.room?.session){if(this.session!==this.room.session&&!this.savedAttempts.has(this.room.session.raw.attemptId))this.attachSession(this.room.session);return;}
    if(l.phase==='lobby'){
      if(this.session){this.closeAllModals();this.teardownMission();this.ensureBackdrop();}
      const sig=JSON.stringify([l.missionId,l.seats,l.chat]);if(sig!==this.roomSignature){this.roomSignature=sig;this.setScreen(lobbyScreen(this));}
    }
  }
  leaveRoom(){this.closeAllModals();this.teardownMission();this.room?.close();this.room=null;this.roomSignature='';this.goMenu();}
  backToCrew(){if(!this.room){this.goMissionSelect();return;}if(this.room.isHost)this.room.returnLobby();else toast('The host returns the crew to the lobby.','info');}


  private onInteract(t: InteractTarget) {
    if (!this.session || !this.mission || this.modals.length) return;
    if (t.kind === "station") {
      const st = this.mission.stations.find((s) => s.id === t.id);
      if (st) this.openModal(stationModal(this, this.mission, this.session, st), { id: "station", onKey: (e) => this.stationKey(e) });
    } else {
      if(['evac','lazarus'].includes(this.mission.id)){this.openExpedition();return;}
      this.openModal(directorModal(this, this.mission, this.session), { id: "director" });
    }
  }

  /** Station panels register their own key handler through a data attribute on the modal */
  private stationKey(e: KeyboardEvent): boolean {
    const top = this.modals[this.modals.length - 1];
    const handler = (top?.el.firstElementChild as HTMLElement & { _onKey?: (e: KeyboardEvent) => boolean })?._onKey;
    return handler ? handler(e) : false;
  }

  openMap() {
    if (!this.mission || !this.session) return;
    this.openModal(mapModal(this, this.mission, this.session), { id: "map" });
  }

  openHelp() {
    this.openModal(helpModal(this, this.mission), { id: "help" });
  }

  openPause() {
    if (!this.session) return;
    if(this.session.isHost)void this.submitAction({type:'pause',paused:true});
    this.openModal(pauseModal(this), {
      id: "pause",
      onClose: () => {if(this.session?.isHost)void this.submitAction({type:'pause',paused:false});},
    });
  }

  abandonMission() {
    this.closeAllModals();
    this.teardownMission();
    this.room?.close();this.room=null;
    toast("Mission abandoned. No result was recorded.", "warn");
    this.goMissionSelect();
  }

  private teardownMission() {
    if(this.clock)clearInterval(this.clock);this.clock=null;
    if(this.endTimer)clearTimeout(this.endTimer);this.endTimer=null;
    this.unsubSession?.();
    this.unsubSession = null;
    this.hud?.destroy();
    this.hud = null;
    sfx.stopAmbience();
    this.session = null;
    this.ending = false;
  }

  private pendingReport: MissionReport | null = null;

  private beginEnding(report: MissionReport, expired: boolean) {
    this.ending = true;
    this.closeAllModals();
    this.pendingReport = report;
    if (expired) toast("Time is up. The design review proceeds with what was submitted.", "warn");
    const mission = this.mission!;
    const decisions = this.session!.snapshot.decisions;
    const attempt=this.session!.raw.attemptId;
    if(!this.savedAttempts.has(attempt)){this.savedAttempts.add(attempt);this.profile=recordReport(this.profile,report);void this.save();}
    this.hud?.destroy();
    this.hud = null;
    sfx.stopAmbience();
    const sm = this.game.scene;
    this.endTimer=setTimeout(
      () => {
        sm.stop("world");
        let info: CinematicInfo;
        try {
          info = mission.cinematic(decisions);
        } catch {
          info = { kind: "earthwatch", altitudeKm: 600, launchFails: false, dataReturn: 0, sunSync: true, recorderSummary: 'No operational data' };
        }
        if(info.kind==='expedition'){info.crewCount=report.contributions.length;info.resultTrace=report.keyMetrics.slice(0,2).map(m=>m.label+': '+m.value).join(' · ');}
        const scene = info.kind === 'expedition'?'cinematic-expedition':info.kind === "lunar" ? "cinematic-lunar" : "cinematic";
        sm.start(scene, { info, outcome: report.outcome, reducedMotion: this.profile.settings.reducedMotion });
        this.setScreen(h('div',{class:'cinematic-skip'},btn('Skip cinematic / view report',()=>this.afterCinematic(),'btn')));
      },
      expired ? 900 : 300,
    );
  }

  private afterCinematic() {
    const report = this.pendingReport;
    this.pendingReport = null;
    const missionId = this.mission?.id;
    this.session?.complete();
    this.teardownMission();
    this.ensureBackdrop();
    if (!report) {
      this.goMenu();
      return;
    }
    sfx.play(report.outcome === "SUCCESS" ? "success" : report.outcome === "PARTIAL" ? "partial" : "fail");
    this.setScreen(debriefScreen(this, report, { fresh: true, retry: !this.room&&missionId ? () => report.design?this.reuseDesign(report.design):this.goBriefing(missionId) : undefined }));
    const next = MISSIONS.find((m) => m.unlockedBy === report.missionId);
    if (next && isCleared(this.profile, report.missionId)) {
      const before = this.profile.history.slice(0, -1);
      const wasCleared = isCleared({ ...this.profile, progress: progressFrom(before) }, report.missionId);
      if (!wasCleared) toast(`${next.name} unlocked.`, "ok");
    }
  }

  astronaut() {
    return astronautById(this.session?.snapshot.runtime.crew.find(p=>p.id===this.session!.selfId)?.astronautId||this.profile.astronautId);
  }
}

/** Rebuild progress from a history slice (used to detect a fresh unlock) */
function progressFrom(history: MissionReport[]): Profile["progress"] {
  let p = { progress: {}, history: [] } as unknown as Profile;
  for (const r of history) p = recordReport(p, r);
  return p.progress;
}
