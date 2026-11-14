import { runtimeHUD } from './expedition';
import { worldMap } from '../data/expeditions';
import { hazards } from '../state/expedition';
import { h, btn, kbd, fmtTime, toast } from "./dom";
import type { App } from "./app";
import type { MissionDef } from "../missions/registry";
import { MissionSession, shuffledOptions, type SessionSnapshot } from "../state/session";
import { SUBSYSTEMS, type StationDef } from "../sim/types";
import { bus } from "../bus";
import { sfx } from "../audio/sfx";
import { T } from "../game/textures";
import type { WorldScene } from "../game/WorldScene";
import { openSettings } from "./screens/menus";
import { engineeringPanel } from './engineering';

// ---------------------------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------------------------

export class Hud {
  private root = h("div", { class: "hud-root" });
  private timer = h("div", { class: "panel hud-timer", role: "timer", "aria-label": "Mission countdown" });
  private objectives = h("div", { class: "panel hud-objectives" });
  private gauges = h("div", { class: "panel hud-gauges" });
  private ready = h("div", { class: "panel hud-ready" }, "All workstations complete - go to the Flight Director console in Mission Control");
  private hint = h("div", { class: "panel hud-hint" });
  private runtimePanel=h('div',{class:'panel hud-runtime'});
  private runtimeSignature=''; private objectiveSignature='';private gaugeSignature='';
  private offNear: (() => void) | null = null;

  constructor(
    private app: App,
    private mission: MissionDef,
    private session: MissionSession,
  ) {}

  mount() {
    const helpBtn = h("button", { class: "hud-icon", type: "button", title: "Help (H)", "aria-label": "Help" }, "?");
    helpBtn.addEventListener("click", () => this.app.topModal() || this.app.openHelp());
    const mapBtn = h("button", { class: "hud-icon", type: "button", title: "Map (M)", "aria-label": "Map" });
    mapBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/></svg>`;
    mapBtn.addEventListener("click", () => this.app.topModal() || this.app.openMap());
    const top = h(
      "div",
      { class: "hud-top" },
      h(
        "div",
        { class: "hud-left" },
        helpBtn,
        h("div", { class: "panel hud-title" }, h("span", { class: "eyebrow" }, this.mission.difficulty), h("b", {}, this.mission.name)),
      ),
      h("div", { class: "hud-right" }, this.timer, mapBtn),
    );
    this.hint.append(
      h("span", {}, kbd("WASD"), "move"),
      h("span", {}, kbd("E"), "use"),
      h("span", {}, kbd("M"), "map"),
      h("span", {}, kbd("H"), "help"),
      h("span", {}, kbd("Esc"), "pause"),
    );
    const use=btn('Interact · E',()=>this.app.useNearest(),'btn primary',{'aria-label':'Interact with nearby console'});
    this.hint.append(use);
    this.root.append(top,this.objectives,h('div',{class:'hud-budget-stack'},this.gauges,this.runtimePanel),this.ready,this.hint);
    document.getElementById("hud")!.append(this.root);
    const onNear = (t: unknown) => this.hint.classList.toggle("near", !!t);
    bus.on("near", onNear);
    this.offNear = () => bus.off("near", onNear);
    this.update(this.session.snapshot);
  }

  update(s: SessionSnapshot) {
    const t = s.timeLeftS;
    this.timer.replaceChildren(h("small", {}, s.status === "paused" ? "PAUSED" : "T-MINUS"), fmtTime(t));
    this.timer.classList.toggle("warn", t <= 120 && t > 30);
    this.timer.classList.toggle("crit", t <= 30);

    const local=s.runtime.crew.find(p=>p.id===this.session.selfId)!;
    const objSig=JSON.stringify([s.decisions,s.runtime.phase,s.runtime.surveys,s.runtime.owners,local.location]);
    if(objSig!==this.objectiveSignature){this.objectiveSignature=objSig;
    const rows:HTMLElement[] = this.mission.stations.map((st) => {
      const done = !!s.decisions[st.id];
      const choice = st.options.find((o) => o.id === s.decisions[st.id]);
      return h(
        "button",
        { class: `obj obj-route ${done ? "done" : ""}`,onclick:()=>{const pos=this.mission.map!.stations.find(p=>p.stationId===st.id)!;this.app.navigate({x:pos.x+.5,y:pos.y+1.375});},title:'Walk a route to this console' },
        h("span", { class: "box" }, done ? "\u2713" : ""),
        h("span", {}, st.title, h("span", { class: "who" }, done ? choice?.name ?? "" : `${SUBSYSTEMS[st.subsystem].short} - ${roomName(this.mission, st.roomId)} · ${this.mission.id==='evac'?'your capsule':s.runtime.crew.find(p=>p.id===s.runtime.owners[st.id])?.name||'you'}`)),
      );
    });
    const allDone = this.mission.stations.every((st) => s.decisions[st.id]);
    rows.push(btn(local.location!=='ship'?'Route to research station':this.mission.id==='evac'?'Route to evacuation dock':this.mission.id==='lazarus'?'Route to Expedition Control':'Route to Flight Director',()=>{const p=worldMap(this.mission.map!,local.location).director;this.app.navigate({x:p.x+1,y:p.y+1.375});},'btn small'));
    if(this.mission.id==='evac')rows.push(btn('Route to containment control',()=>this.app.navigate({x:20.5,y:15}),'btn small'));
    if(local.location!=='ship')rows.push(btn('Route to lander',()=>{const p=worldMap(this.mission.map!,local.location).spawn;this.app.navigate({x:p.x+.5,y:p.y+.5});},'btn small'));
    if(this.mission.id==='lazarus'){rows.unshift(h('p',{},s.runtime.phase==='allocation'?'Allocate resources at Expedition Control.':s.runtime.phase==='voting'?'Review the evidence and vote.':'Complete every assigned expedition.'));for(const survey of s.runtime.surveys)rows.push(h('p',{},survey.planetId+' · '+(survey.delivered?'delivered':survey.collected?'return needed':'research needed')));}
    this.objectives.replaceChildren(h("h4", {}, "Objectives"), ...rows);
    this.ready.style.display = allDone && s.status === "active"&&this.mission.id!=='lazarus' ? "" : "none";
    this.ready.textContent=this.mission.id==='evac'?'All personal capsule tasks are configured. Reach the evacuation dock.':'All workstations complete. The host can authorize the flight at the Director console.';
    }

    const gaugeSig=JSON.stringify(s.decisions);if(gaugeSig!==this.gaugeSignature){this.gaugeSignature=gaugeSig;
    const gs = this.mission.gauges(s.decisions);
    this.gauges.replaceChildren(
      h("h4", {}, "Spacecraft budget"),
      ...gs.map((g) =>
        h(
          "div",
          { class: `gauge ${g.status}`, title: g.hint },
          h("div", { class: "row" }, h("span", {}, g.label), h("span", {}, g.display)),
          h("div", { class: "bar" }, h("i", { style: `width:${Math.round((g.fill ?? 0) * 100)}%` })),
        ),
      ),
    );}
    this.gauges.style.display=this.mission.id==='lazarus'?'none':'';
    const r=s.runtime;
    const signature=JSON.stringify([s.status,s.pauseReason,r.phase,r.sealed,r.organism.target,r.votes,Math.ceil(r.voteLeft),r.crew.map(p=>[p.id,p.connected,p.location,p.travel?.to,p.alive,p.escaped,p.route.length>0,Math.ceil(p.health),Math.ceil(p.suit),p.fuel.toFixed(0),p.oxygen.toFixed(2),p.energy.toFixed(1),Math.ceil(p.localS),Math.round(p.x),Math.round(p.y)])]);
    if(signature!==this.runtimeSignature){this.runtimeSignature=signature;this.runtimePanel.replaceChildren(runtimeHUD(this.app,s));}
  }

  destroy() {
    this.offNear?.();
    this.root.remove();
  }
}

function roomName(m: MissionDef, roomId: string) {
  return m.map?.rooms.find((r) => r.id === roomId)?.name ?? roomId;
}

// ---------------------------------------------------------------------------------------------
// Station panel
// ---------------------------------------------------------------------------------------------

export function stationModal(app: App, mission: MissionDef, session: MissionSession, st: StationDef): HTMLElement {
  const sys = SUBSYSTEMS[st.subsystem];
  const snap = session.snapshot;
  const committed = snap.decisions[st.id];
  const opts = shuffledOptions(st.options, snap.seed, st.id);
  const reference=app.referenceDesign?.missionId===mission.id?app.referenceDesign.decisions[st.id]:undefined;
  let selected: string | null = committed ?? (st.options.some(o=>o.id===reference)?reference!:null);

  const readout = h("div", { class: "readout" });
  const renderReadout = () => {
    readout.replaceChildren(...mission.stationReadout(st.id, session.snapshot.decisions).map((r) => h("div", {}, h("span", {}, r.label), h("b", {}, r.value))));
  };
  renderReadout();

  const commitBtn = btn("Commit decision", () => commit(), "btn primary") as HTMLButtonElement;
  const optionEls = opts.map((o, i) => {
    const el = h(
      "button",
      { class: "option", type: "button", "data-id": o.id, "aria-pressed": String(selected === o.id) },
      h("span", { class: "num" }, kbd(String(i + 1))),
      committed === o.id ? h("span", { class: "current" }, "Current decision") : null,
      h("h3", {}, o.name),
      h("div", { class: "tl" }, o.tagline),
      h("dl", {}, ...o.specs.flatMap((s) => [h("dt", {}, s.label), h("dd", {}, s.value)])),
    );
    el.addEventListener("click", () => choose(o.id));
    return el;
  });
  const choose = (id: string) => {
    selected = id;
    sfx.play("click");
    optionEls.forEach((el, i) => el.setAttribute("aria-pressed", String(opts[i].id === id)));
    commitBtn.disabled = !selected||(mission.id!=='evac'&&session.snapshot.runtime.owners[st.id]!==session.selfId);
  };
  const commit = async () => {
    if (!selected) {
      sfx.play("error");
      return;
    }
    if (session.snapshot.status !== "active") {
      toast("Decisions are locked while the mission is paused or running.", "warn");
      return;
    }
    if(!await app.submitAction({type:'commit',stationId:st.id,optionId:selected}))return;
    sfx.play("commit");
    const name = st.options.find((o) => o.id === selected)?.name;
    toast(`${st.title}: ${name} committed`, "ok");
    app.closeModal("station");
  };
  const mine=mission.id==='evac'||snap.runtime.owners[st.id]===session.selfId;
  commitBtn.disabled = !selected||!mine;
  if(!mine)commitBtn.title='Assigned to '+snap.runtime.crew.find(p=>p.id===snap.runtime.owners[st.id])?.name;

  const panel = h(
    "div",
    { class: "panel modal", style: `--teal:${sys.color}` },
    h(
      "div",
      { class: "card-head" },
      h(
        "div",
        { class: "station-head" },
        h("span", { class: "sys", style: `background:${sys.color}` }, sys.short),
        h("div", {}, h("div", { class: "eyebrow", style: `color:${sys.color}` }, `${sys.name} - ${roomName(mission, st.roomId)}`), h("h2", {}, st.title)),
      ),
      btn("Close", () => app.closeModal("station"), "btn ghost small"),
    ),
    h(
      "div",
      { class: "card-body scroll" },
      h("h3", { style: "font-size:1.15rem" }, st.question),
      h("p", {}, st.context),
      reference ? h('p',{class:'dim'},'Saved design reference: '+(st.options.find(o=>o.id===reference)?.name??reference)+'. Review or change it, then commit at this console.') : null,
      h("div", { class: "eyebrow", style: "color:var(--dim)" }, "Live design data"),
      readout,
      h("div", { class: "options" }, ...optionEls),
    ),
    h(
      "div",
      { class: "card-foot", style: "justify-content:space-between; align-items:center" },
      h("span", { style: "font-size:0.82rem; color:var(--dim)" }, kbd("1"), " ", kbd("2"), " ", kbd("3"), " select  ", kbd("Enter"), " commit  ", kbd("Esc"), " close. You can revise any decision until the mission runs."),
      commitBtn,
    ),
  ) as HTMLElement & { _onKey?: (e: KeyboardEvent) => boolean };
  panel._onKey = (e) => {
    if (["1", "2", "3"].includes(e.key)) {
      const o = opts[Number(e.key) - 1];
      if (o) choose(o.id);
      return true;
    }
    if (e.key === "Enter") {
      commit();
      return true;
    }
    return false;
  };
  return panel;
}

// ---------------------------------------------------------------------------------------------
// Flight Director console
// ---------------------------------------------------------------------------------------------

export function directorModal(app: App, mission: MissionDef, session: MissionSession): HTMLElement {
  const s = session.snapshot;
  const missing = session.missingStations();
  const rows = mission.stations.map((st) => {
    const sys = SUBSYSTEMS[st.subsystem];
    const choice = st.options.find((o) => o.id === s.decisions[st.id]);
    return h(
      "div",
      { class: `row ${choice ? "" : "missing"}` },
      h("span", { class: "dot", style: `background:${choice ? sys.color : "transparent"}; border:1.5px solid ${sys.color}` }),
      h("span", {}, h("b", {}, st.title), h("span", { style: "color:var(--dim); font-size:0.8rem" }, `  ${sys.short}`)),
      h("span", { class: "val" }, choice ? `${choice.name}${s.committedBy[st.id] ? ` - ${s.committedBy[st.id]}` : ""}` : `Not submitted - ${roomName(mission, st.roomId)}`),
    );
  });
  const gauges = mission.gauges(s.decisions);
  const warnings = gauges.filter((g) => g.status === "bad" || g.status === "warn");
  const runBtn = btn("Run mission", () => {
    if (!session.canRun()) return;
    app.closeModal("director");
    void app.submitAction({type:'run'});
  }, "btn primary") as HTMLButtonElement;
  runBtn.disabled = missing.length > 0||!session.isHost;
  return h(
    "div",
    { class: "panel modal", style: "width:min(44rem,95vw)" },
    h("div", { class: "card-head" }, h("div", {}, h("div", { class: "eyebrow" }, "Flight Director console"), h("h2", {}, "Design review")), btn("Close", () => app.closeModal("director"), "btn ghost small")),
    h(
      "div",
      { class: "card-body scroll" },
      h("div", { class: "director-list" }, ...rows),
      h('p',{class:'dim'},'Objective → feasibility → trade study → point design. Review the coupled limits, save a variant, then authorize this design.'),
      h('div',{class:'adv-actions'},
        btn('Save design variant',()=>app.saveCurrentDesign(),'btn small'),
        ...(['nominal','outage'] as const).map(scenario=>btn(((s.decisions._ops??'nominal')===scenario?'✓ ':'')+(scenario==='nominal'?'Nominal contacts':'Missed-contact test'),()=>{
          void app.submitAction({type:'operations',scenario}).then(ok=>{if(ok)app.reopenDirector();});
        },'btn small',{disabled:!session.isHost}))),
      app.referenceDesign?.decisions._ops&&app.referenceDesign.decisions._ops!==s.decisions._ops?btn('Use saved contact scenario',()=>{
        void app.submitAction({type:'operations',scenario:app.referenceDesign!.decisions._ops}).then(ok=>{if(ok)app.reopenDirector();});
      },'btn small',{disabled:!session.isHost}):null,
      mission.engineering ? engineeringPanel(mission.engineering(s.decisions)) : null,
      warnings.length
        ? h("div", { class: "findings", style: "margin-top:1rem" }, h("b", {}, "Telemetry flags"), h("ul", { style: "margin:0.3rem 0 0; padding-left:1.1rem" }, ...warnings.map((g) => h("li", {}, `${g.label}: ${g.hint}`))))
        : null,
      h(
        "p",
        { style: "margin-top:1rem; font-size:0.88rem" },
        missing.length
          ? `Complete ${missing.length} more workstation${missing.length > 1 ? "s" : ""} before the mission can run.`
          : "Every workstation has submitted. Running the mission locks all decisions and launches the spacecraft. The result is final.",
      ),
    ),
    h("div", { class: "card-foot" }, btn("Keep working", () => app.closeModal("director"), "btn ghost"), runBtn),
  );
}

// ---------------------------------------------------------------------------------------------
// Map overlay
// ---------------------------------------------------------------------------------------------

export function mapModal(app: App, mission: MissionDef, session: MissionSession): HTMLElement {
  const local=session.snapshot.runtime.crew.find(p=>p.id===session.selfId)!;
  const map = worldMap(mission.map!,local.location);
  const scene = app.game.scene.getScene("world") as WorldScene;
  const grid = scene.getGrid();
  const cell = 18;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cv = h("canvas", { width: map.width * cell * dpr, height: map.height * cell * dpr, "aria-label": "Station map" }) as HTMLCanvasElement;
  const g = cv.getContext("2d")!;
  g.scale(dpr, dpr);
  let pos = {x:local.x,y:local.y};
  const floorColor: Record<number, string> = {
    [T.F_OPS]: "#1d3150",
    [T.F_CLEAN]: "#5d6f86",
    [T.F_TECH]: "#22363f",
    [T.F_HANGAR]: "#33373f",
    [T.F_LOBBY]: "#34294e",
    [T.F_CORRIDOR]: "#18233a",
    [T.F_DOOR]: "#6b5320",
  };
  let raf = 0;
  const draw = (now: number) => {
    g.clearRect(0, 0, cv.width, cv.height);
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x < map.width; x++) {
        const v = grid[y][x];
        if (v === T.VOID) continue;
        g.fillStyle = v === T.WALL || v === T.WALL_FACE || v === T.WINDOW ? "#46557a" : floorColor[v] ?? "#1b2536";
        g.fillRect(x * cell, y * cell, cell, cell);
      }
    g.font = "600 11px Space Grotesk, sans-serif";
    g.textAlign = "center";
    for (const r of map.rooms) {
      g.fillStyle = "rgba(232,244,255,0.75)";
      g.fillText(r.name.toUpperCase(), (r.x + r.w / 2) * cell, (r.y + r.h - 0.6) * cell);
    }
    const s = session.snapshot;
    for (const p of map.stations) {
      const st = mission.stations.find((x) => x.id === p.stationId)!;
      const done = !!s.decisions[st.id];
      const c = SUBSYSTEMS[st.subsystem].color;
      g.fillStyle = done ? c : "#0b1220";
      g.strokeStyle = c;
      g.lineWidth = 2;
      g.beginPath();
      g.arc((p.x + 0.5) * cell, (p.y + 0.5) * cell, 6, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = "#E8F4FF";
      g.font = "500 10px Inter, sans-serif";
      g.fillText(st.title, (p.x + 0.5) * cell, (p.y + 1.6) * cell);
    }
    const d = map.director;
    g.fillStyle = "#2EE6C5";
    g.fillRect(d.x * cell + 2, d.y * cell + 4, cell * 2 - 4, cell - 8);
    g.fillStyle = "#E8F4FF";
    g.fillText(local.location!=='ship'?'Research station':mission.id==='evac'?'Evacuation dock':mission.id==='lazarus'?'Expedition Control':'Flight Director', (d.x + 1) * cell, (d.y + 1.6) * cell);
    if(mission.id==='evac')for(const hazard of hazards(s.runtime,'ship')){g.fillStyle=hazard.kind==='organism'?'#d5a974':'#ff695c';g.beginPath();g.arc(hazard.x*cell,hazard.y*cell,Math.max(5,hazard.r*cell),0,Math.PI*2);g.fill();}
    const pulse = 5 + Math.sin(now / 180) * 2;
    g.fillStyle = "#FFB020";
    g.beginPath();
    const runtime=session.snapshot.runtime;const you=runtime.crew.find(p=>p.id===session.selfId)!;pos={x:you.x,y:you.y};
    for(const crew of runtime.crew.filter(p=>p.location===local.location&&p.id!==session.selfId)){g.fillStyle='#9FB3D9';g.beginPath();g.arc(crew.x*cell,crew.y*cell,5,0,Math.PI*2);g.fill();g.fillText(crew.name,crew.x*cell,crew.y*cell-12);}
    g.fillStyle='#FFB020';g.beginPath();g.arc(pos.x * cell, pos.y * cell, pulse, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#0B1220";
    g.stroke();
    if (cv.isConnected) raf = requestAnimationFrame(draw);
  };
  const onPos = (p: { x: number; y: number }) => (pos = p);
  bus.on("player:pos", onPos);
  requestAnimationFrame(draw);
  const el = h(
    "div",
    { class: "panel modal map-modal", style: "width:min(64rem,96vw)" },
    h("div", { class: "card-head" }, h("div", {}, h("div", { class: "eyebrow" }, mission.name), h("h2", {}, "Station map")), btn("Close", () => app.closeModal("map"), "btn ghost small")),
    h(
      "div",
      { class: "card-body scroll" },
      cv,
      h('div',{class:'adv-actions'},...map.stations.map(st=>btn(mission.stations.find(s=>s.id===st.stationId)?.title||st.stationId,()=>{app.closeModal('map');app.navigate({x:st.x+.5,y:st.y+1.375});},'btn small')),btn(local.location==='ship'?'Flight Director / Expedition Control':'Research station',()=>{app.closeModal('map');app.navigate({x:map.director.x+1,y:map.director.y+1.375});},'btn small'),local.location!=='ship'?btn('Lander',()=>{app.closeModal('map');app.navigate({x:map.spawn.x+.5,y:map.spawn.y+.5});},'btn small'):null,...(mission.id==='evac'?[{name:'Containment control',x:20.5,y:15},{name:'Radiation repair A',x:20.5,y:11.9},{name:'Breach repair B',x:21.4,y:19.5},{name:'Radiation repair C',x:20.5,y:34.9}].map(p=>btn(p.name,()=>{app.closeModal('map');app.navigate(p);},'btn small')):[])),
      h(
        "div",
        { class: "legend" },
        h("span", {}, h("span", { class: "dot", style: "background:#FFB020" }), "You"),
        h("span", {}, h("span", { class: "dot", style: "border:2px solid #9FB3D9" }), "Workstation to do"),
        h("span", {}, h("span", { class: "dot", style: "background:#9FB3D9" }), "Workstation done"),
        h("span", {}, h("span", { class: "dot", style: "background:#2EE6C5; border-radius:2px" }), "Flight Director (Run Mission)"),
        h("span", {}, kbd("M"), " or ", kbd("Esc"), " to close"),
      ),
    ),
  );
  const obs = new MutationObserver(() => {
    if (!el.isConnected) {
      bus.off("player:pos", onPos);
      cancelAnimationFrame(raf);
      obs.disconnect();
    }
  });
  obs.observe(document.getElementById("modal")!, { childList: true, subtree: true });
  return el;
}

// ---------------------------------------------------------------------------------------------
// Help and pause
// ---------------------------------------------------------------------------------------------

export function helpModal(app: App, mission: MissionDef | null): HTMLElement {
  const a = app.astronaut();
  const sys = SUBSYSTEMS[a.subsystem];
  return h(
    "div",
    { class: "panel modal", style: "width:min(56rem,95vw)" },
    h("div", { class: "card-head" }, h("div", {}, h("div", { class: "eyebrow" }, "Help"), h("h2", {}, mission ? `${mission.name} - how to play` : "How to play ORBYX")), btn("Close", () => app.closeModal("help"), "btn ghost small")),
    h(
      "div",
      { class: "card-body scroll" },
      h(
        "div",
        { class: "help-grid" },
        h(
          "div",
          {},
          h("h3", {}, "Controls"),
          h(
            "div",
            { class: "controls-list", style: "margin-top:0.6rem" },
            h("span", {}, kbd("W"), kbd("A"), kbd("S"), kbd("D")),
            h("span", {}, "Move. Arrow keys also work."),
            kbd("E"),
            h("span", {}, "Use the workstation you are standing at"),
            h("span", {}, kbd("1"), kbd("2"), kbd("3")),
            h("span", {}, "Pick an option in a workstation panel"),
            kbd("Enter"),
            h("span", {}, "Commit the selected option"),
            kbd("M"),
            h("span", {}, "Open or close the station map"),
            kbd("H"),
            h("span", {}, "Open or close this help"),
            kbd("Esc"),
            h("span", {}, "Close a panel, or pause the mission"),
          ),
          h("h3", { style: "margin-top:1.2rem" }, "Your role"),
          h("p", {}, `You are playing as ${a.name}. Crew role (fictional): ${a.roleTitle}, ${sys.name}. In solo missions you operate every workstation yourself.`),
        ),
        h(
          "div",
          {},
          h("h3", {}, "How a mission works"),
          h("p", {}, "Walk to each workstation marked with an amber badge and press E. Read the problem and the live design data, then commit one of three options. Badges turn teal when a decision is in. You can revisit a workstation and change your mind until the mission runs."),
          h("p", {}, "Subsystems are coupled: the payload you choose changes the power you need, the data you must downlink, the mass the launcher must lift, and the cost. Watch the Spacecraft budget panel on the right."),
          h("p", {}, "When every workstation is done, use the Flight Director console in Mission Control to run the mission. If the countdown reaches zero first, the mission is judged with what was submitted, and any missing workstation means failure."),
          h("h3", { style: "margin-top:1rem" }, "Results"),
          h("p", {}, "Every mission ends Successful, Partially Successful, or Failed, with a score out of 10. The debrief shows what each decision did to the spacecraft and why."),
        ),
      ),
    ),
  );
}

export function pauseModal(app: App): HTMLElement {
  return h(
    "div",
    { class: "panel modal narrow" },
    h("div", { class: "card-head" }, h("div", {}, h("div", { class: "eyebrow" }, "Mission paused"), h("h2", {}, "Paused")), null),
    h(
      "div",
      { class: "card-body", style: "display:flex; flex-direction:column; gap:0.6rem" },
      h("p", { style: "margin:0 0 0.4rem" }, "The host can pause or resume the shared countdown. A disconnected astronaut must rejoin before resuming."),
      btn(app.session?.isHost?'Resume':'Close pause menu', () => app.closeModal("pause"), "btn primary"),
      btn("Help", () => app.openHelp()),
      btn("Settings", () => openSettings(app)),
      btn("Abandon mission", () => {
        if (confirm("Abandon this mission? Nothing will be recorded.")) app.abandonMission();
      }, "btn danger"),
    ),
  );
}
