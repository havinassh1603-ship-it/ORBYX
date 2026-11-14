import { h, btn, astroCanvas } from "../dom";
import type { App } from "../app";
import { ASTRONAUTS, astronautById, type Astronaut } from "../../data/astronauts";
import { SUBSYSTEMS } from "../../sim/types";
import { missionById } from "../../missions/registry";

export function rosterScreen(app: App, missionId: string): HTMLElement {
  const mission = missionById(missionId);
  let selected: Astronaut = astronautById(app.profile.astronautId);
  let heroStop: (() => void) | null = null;

  const hero = h("div", { class: "roster-hero" });
  const detail = h("div", { class: "roster-detail scroll" });
  const picks = h("div", { class: "roster-pick", role: "radiogroup", "aria-label": "Astronaut" });
  const confirmBtn = btn("", () => {
    app.setProfile({ ...app.profile, astronautId: selected.id });
    heroStop?.();
    app.goBriefing(missionId);
  }, "btn primary");

  const render = () => {
    heroStop?.();
    const big = astroCanvas(selected, 256, { walk: false });
    heroStop = big.stop;
    const sys = SUBSYSTEMS[selected.subsystem];
    hero.replaceChildren(
      big.canvas,
      h("h2", { style: "margin-top:0.4rem" }, selected.name),
      h("span", { class: "chip role-badge", style: `color:${sys.color}; border-color:${sys.color}66` }, `${sys.short} - ${sys.name}`),
    );
    detail.replaceChildren(
      h("div", { class: "eyebrow" }, "Historical record"),
      h("h2", { style: "margin:0.3rem 0 0.1rem" }, selected.name),
      h("div", { style: "color:var(--dim); font-size:0.88rem" }, `${selected.lifespan} - ${selected.origin}`),
      h("div", { class: "facts" }, ...selected.facts.map((f) => h("div", {}, h("span", {}, f.label), h("b", {}, f.value)))),
      ...selected.bio.map((p) => h("p", {}, p)),
      h(
        "div",
        { class: "fiction", style: "margin-top:1rem" },
        h("div", { class: "eyebrow" }, "ORBYX crew role - fictional"),
        h("h3", { style: "margin:0.3rem 0 0.2rem; color:" + sys.color }, selected.roleTitle),
        h("p", { style: "margin:0" }, selected.roleText),
        h("p", { style: "margin:0.5rem 0 0; font-size:0.8rem; color:var(--dim)" }, "In solo play you operate every workstation yourself; your role decides who owns which station in multiplayer."),
      ),
    );
    confirmBtn.textContent = `Continue as ${selected.name.split(" ").slice(-1)[0]}`;
    for (const b of picks.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.id === selected.id));
  };

  for (const a of ASTRONAUTS) {
    const mini = astroCanvas(a, 48, { still: true });
    const b = btn([mini.canvas, h("span", {}, a.name.split(" ").slice(-1)[0])], () => {
      selected = a;
      render();
    }, "");
    b.dataset.id = a.id;
    b.setAttribute("role", "radio");
    picks.append(b);
  }
  render();

  return h(
    "div",
    { class: "screen centered" },
    h(
      "div",
      { class: "panel card-wide", style: "height: min(44rem, 92vh)" },
      h(
        "div",
        { class: "card-head" },
        h("div", {}, h("div", { class: "eyebrow" }, `${mission.name} - choose your astronaut`), h("h2", {}, "Crew roster")),
        btn("Back", () => {
          heroStop?.();
          app.goMissionSelect();
        }, "btn ghost small"),
      ),
      h("div", { class: "roster" }, hero, h("div", { style: "display:flex; flex-direction:column; min-height:0" }, picks, detail)),
      h("div", { class: "card-foot" }, confirmBtn),
    ),
  );
}
