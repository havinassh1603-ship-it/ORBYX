import { h, btn, kbd, fmtTime } from "../dom";
import type { App } from "../app";
import type { MissionDef } from "../../missions/registry";
import { SUBSYSTEMS } from "../../sim/types";

export function briefingScreen(app: App, m: MissionDef): HTMLElement {
  const me = app.astronaut();
  return h(
    "div",
    { class: "screen centered" },
    h(
      "div",
      { class: "panel card-wide" },
      h(
        "div",
        { class: "card-head" },
        h(
          "div",
          {},
          h("div", { class: "eyebrow" }, "Mission briefing"),
          h("h2", { style: "display:flex; gap:0.8rem; align-items:center" }, m.name, h("span", { class: `chip ${m.difficulty.toLowerCase()}` }, m.difficulty)),
        ),
        btn("Back", () => app.goRoster(m.id), "btn ghost small"),
      ),
      h(
        "div",
        { class: "card-body scroll" },
        h(
          "div",
          { class: "brief-grid" },
          h(
            "div",
            {},
            ...m.story.map((p) => h("p", { style: "color:var(--text)" }, p)),
            h("h4", { style: "margin:1.2rem 0 0.4rem" }, "Mission requirements"),
            h("table", { class: "req-table" }, h("tbody", {}, ...m.requirements.map((r) => h("tr", {}, h("td", {}, r.label), h("td", {}, r.value))))),
          ),
          h(
            "div",
            {},
            h("div", { class: "panel", style: "padding:1rem 1.1rem; margin-bottom:1rem" }, h("div", { class: "eyebrow" }, "Countdown"), h("div", { style: "font-family:var(--display); font-size:2rem; font-weight:700" }, fmtTime(m.timeLimitS)), h("p", { style: "margin:0; font-size:0.85rem" }, "If the timer reaches zero, the mission is evaluated with whatever was submitted. A missing workstation means the mission fails.")),
            h("h4", { style: "margin-bottom:0.4rem" }, "Crew assignments"),
            h("p", { style: "margin:0 0 0.4rem; font-size:0.85rem" }, `Solo mission: ${me.name} (${app.profile.displayName}) holds every workstation.`),
            h(
              "div",
              { class: "assign" },
              ...m.stations.map((s) => {
                const sys = SUBSYSTEMS[s.subsystem];
                return h("div", {}, h("span", { class: "dot", style: `background:${sys.color}` }), h("b", {}, s.title), h("span", { style: "color:var(--dim)" }, ` - ${sys.short}`));
              }),
            ),
            h("h4", { style: "margin:1.1rem 0 0.4rem" }, "Controls"),
            h(
              "div",
              { class: "controls-list" },
              h("span", {}, kbd("W"), kbd("A"), kbd("S"), kbd("D")),
              h("span", {}, "Move (arrow keys also work)"),
              kbd("E"),
              h("span", {}, "Use a workstation"),
              kbd("M"),
              h("span", {}, "Station map"),
              kbd("H"),
              h("span", {}, "Help"),
              kbd("Esc"),
              h("span", {}, "Pause / close panel"),
            ),
          ),
        ),
      ),
      h("div", { class: "card-foot" }, btn("Begin mission", () => app.startMission(m.id), "btn primary")),
    ),
  );
}
