import { h, btn, fmtTime } from "../dom";
import type { App } from "../app";
import { OUTCOME_LABEL, SUBSYSTEMS, type MissionReport } from "../../sim/types";
import { astronautById } from "../../data/astronauts";
import { comparable, type DesignSnapshot } from '../../sim/engineering';
import { engineeringPanel } from '../engineering';

function dial(score: number, outcome: MissionReport["outcome"]) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const color = outcome === "SUCCESS" ? "#2EE6C5" : outcome === "PARTIAL" ? "#FFB020" : "#FF5A5A";
  const el = h("div", { class: "score-dial" });
  el.innerHTML = `<svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="${r}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="9"/><circle cx="60" cy="60" r="${r}" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c}" style="transition: stroke-dashoffset 1.1s cubic-bezier(.2,.8,.2,1)"/></svg><div class="val"><div>${score.toFixed(1)}<small>out of 10</small></div></div>`;
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const arc = el.querySelectorAll("circle")[1] as SVGCircleElement;
      arc.style.strokeDashoffset = String(c * (1 - score / 10));
    }),
  );
  return el;
}

export function debriefScreen(app: App, r: MissionReport, opts: { fresh?: boolean; retry?: () => void; back?: () => void }): HTMLElement {
  const subs = r.subsystems.map((s) => {
    const sys = SUBSYSTEMS[s.subsystem];
    return h(
      "div",
      { class: "subsys" },
      h(
        "div",
        { class: "l" },
        h("h3", {}, h("span", { class: "dot", style: `background:${sys.color}` }), s.title, h("span", { class: `rating ${s.rating}` }, s.rating)),
        h("div", { style: "font-size:0.78rem; color:var(--dim); margin-top:0.2rem" }, `${sys.name}${s.committedBy ? ` - committed by ${s.committedBy}` : ""}`),
        h("div", { style: "margin-top:0.7rem; font-size:0.78rem; color:var(--dim); text-transform:uppercase; letter-spacing:0.12em" }, "Decision"),
        h("div", { style: "font-family:var(--display); font-weight:600" }, s.choiceName),
        h("div", { class: "kv" }, ...s.selectedSpecs.flatMap((x) => [h("span", {}, x.label), h("span", {}, x.value)])),
        h("div", { class: "pts" }, h("span", {}, `${s.points.toFixed(2)} / ${s.maxPoints}`), h("div", { class: "bar" }, h("i", { style: `width:${(s.points / s.maxPoints) * 100}%; background:${sys.color}` }))),
      ),
      h(
        "div",
        { class: "r" },
        h("div", { style: "font-size:0.78rem; color:var(--dim); text-transform:uppercase; letter-spacing:0.12em" }, "Computed result"),
        s.results.length ? h("div", { class: "kv" }, ...s.results.flatMap((x) => [h("span", {}, x.label), h("span", {}, x.value)])) : h("p", {}, "No result could be computed."),
        h("p", { style: "color:var(--text); font-size:0.9rem" }, s.effect),
        h("div", { class: "lesson" }, h("b", {}, "Engineering note: "), s.lesson),
      ),
    );
  });
  const contrib = r.contributions.map((c) => {
    const a = astronautById(c.astronautId);
    return h("div", { class: "metrics" }, h("div", {}, h("span", {}, "Crew member"), h("b", {}, `${c.playerName} (${a.name})`)), h("div", {}, h("span", {}, "Workstations"), h("b", {}, c.stations.join(", ") || "none")), h("div", {}, h("span", {}, "Subsystem points"), h("b", {}, `${c.pointsEarned} / ${c.pointsPossible}`)));
  });

  const back = opts.back ?? (() => app.goMissionSelect());
  return h(
    "div",
    { class: "screen centered" },
    h(
      "div",
      { class: "panel debrief" },
      h(
        "div",
        { class: "debrief-hero" },
        h("div", { class: `stamp ${r.outcome}` }, OUTCOME_LABEL[r.outcome]),
        h(
          "div",
          {},
          h("div", { class: "eyebrow" }, `${r.missionName} - ${r.difficulty} - mission debrief`),
          h("h2", { style: "margin:0.3rem 0" }, r.headline),
          h("p", { style: "margin:0" }, r.summary),
          h("div", { style: "font-size:0.78rem; color:var(--dim); margin-top:0.4rem" }, `${new Date(r.createdAt).toLocaleString()} - time used ${fmtTime(r.timeUsedS)} of ${fmtTime(r.timeLimitS)} - ${r.mode === "solo" ? "solo" : "multiplayer"}${opts.fresh ? " - saved to your history" : ""}`),
        ),
        dial(r.score, r.outcome),
      ),
      h(
        "div",
        { class: "card-body scroll", style: "flex:1" },
        r.criticalFindings.length
          ? h("div", { class: `findings ${r.outcome}` }, h("b", {}, "Findings"), h("ul", { style: "margin:0.3rem 0 0; padding-left:1.1rem" }, ...r.criticalFindings.map((f) => h("li", {}, f))))
          : null,
        h("div", { class: "metrics" }, ...r.keyMetrics.map((m) => h("div", {}, h("span", {}, m.label), h("b", {}, m.value)))),
        r.engineering ? engineeringPanel(r.engineering) : h('p',{class:'dim'},'Legacy report: preserved as originally recorded. Engineering-model comparisons are available for new 1.1.0 attempts.'),
        comparison(app,r),
        h("h3", { style: "margin:0.4rem 0 0.8rem" }, "Subsystem review"),
        ...subs,
        h("h3", { style: "margin:1.2rem 0 0.6rem" }, "Crew contribution"),
        ...contrib,
        h("h3", { style: "margin:1.2rem 0 0.4rem" }, "Lessons from this mission"),
        h("ul", { style: "color:var(--muted); line-height:1.6; padding-left:1.1rem" }, ...r.lessons.map((l) => h("li", {}, l))),
      ),
      h(
        "div",
        { class: "card-foot" },
        app.room ? btn('Leave crew',()=>app.leaveRoom(),'btn ghost') : btn(opts.back ? "Back to history" : "Mission select", back, "btn ghost"),
        app.room ? btn('Return to crew lobby',()=>app.backToCrew(),'btn primary') : btn("Main menu", () => app.goMenu(), "btn ghost"),
        opts.retry ? btn("Fly it again", opts.retry, "btn primary") : null,
        r.design&&!app.room ? btn('Revise saved design',()=>app.reuseDesign(r.design!),'btn') : null,
      ),
    ),
  );
}

export function historyScreen(app: App): HTMLElement {
  const list = [...app.profile.history].reverse();
  const color = { SUCCESS: "var(--teal)", PARTIAL: "var(--amber)", FAILED: "var(--red)" } as const;
  const rows = list.map((r) => {
    const b = btn(
      [
        h("span", { style: "color:var(--dim)" }, new Date(r.createdAt).toLocaleDateString()),
        h("span", {}, h("b", {}, r.missionName), h("span", { style: "color:var(--dim)" }, ` - ${r.difficulty}`)),
        h("span", { style: `color:${color[r.outcome]}; font-family:var(--display)` }, OUTCOME_LABEL[r.outcome]),
        h("span", { style: "font-family:var(--display); font-weight:700" }, r.score.toFixed(1)),
        h("span", { style: "color:var(--dim)" }, "Open"),
      ],
      () => app.setScreen(debriefScreen(app, r, { back: () => app.goHistory() })),
      "history-row",
    );
    return b;
  });
  return h(
    "div",
    { class: "screen centered" },
    h(
      "div",
      { class: "panel card-wide", style: "height:min(40rem,90vh)" },
      h("div", { class: "card-head" }, h("div", {}, h("div", { class: "eyebrow" }, app.profile.displayName), h("h2", {}, "Mission history")), btn("Back", () => app.goMenu(), "btn ghost small")),
      h("div", { class: "card-body scroll", style: "flex:1" },
        (app.profile.savedDesigns?.length??0)>0?h('section',{},h('h3',{},'Saved design variants'),...(app.profile.savedDesigns??[]).slice().reverse().map(d=>h('p',{},btn(`Reuse ${d.missionId} · ${new Date(d.savedAt).toLocaleString()}`,()=>app.reuseDesign(d),'btn small')))):null,
        rows.length ? h("div", {}, ...rows) : h("p", {}, "No missions flown yet. Your debrief reports will be saved here.")),
    ),
  );
}

function comparison(app:App,current:MissionReport):HTMLElement|null{
 const candidates=app.profile.history.filter(r=>r.design?.id!==current.design?.id&&comparable(current,r));
 if(!candidates.length)return null;
 const selector=h('select',{'aria-label':'Compare with saved attempt'},...candidates.map((r,i)=>h('option',{value:String(i)},`${new Date(r.createdAt).toLocaleString()} · ${r.outcome} · ${r.score.toFixed(1)}`)));
 const body=h('div',{});
 const render=()=>{const previous=candidates[Number(selector.value)],a=designEntries(previous.design!),b=designEntries(current.design!);body.replaceChildren(h('p',{},`Same model and scenario · A ${previous.score.toFixed(1)} / ${previous.outcome} → B ${current.score.toFixed(1)} / ${current.outcome}`),h('table',{class:'comparison-table'},h('thead',{},h('tr',{},h('th',{},'Design / result'),h('th',{},'A · previous'),h('th',{},'B · this attempt'))),h('tbody',{},
  ...Array.from(new Set([...Object.keys(a),...Object.keys(b)])).map(key=>h('tr',{},h('td',{},key),h('td',{},a[key]??'—'),h('td',{},b[key]??'—'))),
  ...current.keyMetrics.map(m=>h('tr',{},h('td',{},m.label),h('td',{},previous.keyMetrics.find(p=>p.label===m.label)?.value??'—'),h('td',{},m.value))))));};
 selector.addEventListener('change',render);render();
 return h('details',{},h('summary',{},'Compare designs A / B'),selector,body);
}
function designEntries(d:DesignSnapshot):Record<string,string>{
 const rows={...d.decisions};
 if(d.earthFuel!==undefined)rows['Mothership propellant (kg)']=String(d.earthFuel);
 for(const sortie of d.expeditions??[]){rows[sortie.planetId+' · survey kit']=sortie.kitId;for(const [resource,value]of Object.entries(sortie.allocation))rows[sortie.planetId+' · '+resource]=String(value);}
 for(const pod of d.capsules??[])for(const [station,choice]of Object.entries(pod.decisions))rows[pod.astronautId+' · '+station]=choice;
 return rows;
}
