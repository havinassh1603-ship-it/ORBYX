import { h, btn, wordmark, astroCanvas, toast, download } from "../dom";
import type { App } from "../app";
import type { MissionDef } from "../../missions/registry";
import { newProfile, exportProfile, importProfile, deleteProfile, isCleared, sanitizeName, type Profile } from "../../persist/profile";
import { OUTCOME_LABEL } from "../../sim/types";
import { sfx } from "../../audio/sfx";

const STORAGE_NOTE =
  "Your profile is saved in this browser only. Clearing browser data erases it, so export a backup from Settings.";

export function profileCreateScreen(app: App): HTMLElement {
  const input = h("input", { type: "text", maxlength: 20, placeholder: "Display name", "aria-label": "Display name", autocomplete: "off" });
  const err = h("p", { style: "color: var(--red); min-height: 1.4em; margin: 0.4rem 0 0" });
  const create = () => {
    const name = sanitizeName(input.value);
    if (name.length < 2) {
      err.textContent = "Choose a name of at least 2 characters.";
      sfx.play("error");
      return;
    }
    app.setProfile(newProfile(name));
    toast(`Welcome aboard, ${name}.`, "ok");
    app.goMenu();
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") create();
  });
  const file = h("input", { type: "file", accept: "application/json,.json", style: "display:none" }) as HTMLInputElement;
  file.addEventListener("change", async () => {
    const f = file.files?.[0];
    if (!f) return;
    const res = importProfile(await f.text());
    if (!res.ok) {
      err.textContent = res.error;
      sfx.play("error");
      return;
    }
    app.setProfile(res.profile);
    toast(`Profile restored: ${res.profile.displayName}.`, "ok");
    app.goMenu();
  });
  const el = h(
    "div",
    { class: "screen centered" },
    h(
      "div",
      { class: "panel profile-create" },
      wordmark(),
      h("div", { class: "eyebrow" }, "New crew member"),
      h("h2", { style: "margin: 0.4rem 0 0.2rem" }, "Create your profile"),
      h("p", {}, "Pick the name your crew will see. You can choose your astronaut before each mission."),
      input,
      err,
      h("div", { style: "display:flex; gap:0.7rem; margin-top:0.6rem; flex-wrap: wrap" }, btn("Create profile", create, "btn primary"), btn("Import a profile", () => file.click(), "btn ghost")),
      file,
      h("p", { style: "font-size: 0.78rem; margin-top: 1.2rem; color: var(--dim)" }, STORAGE_NOTE),
    ),
  );
  setTimeout(() => input.focus(), 50);
  return el;
}

export function mainMenuScreen(app: App): HTMLElement {
  const a = app.astronaut();
  const avatar = astroCanvas(a, 44);
  const clearedCount = ["earthwatch", "lunar", "evac", "lazarus"].filter((m) => isCleared(app.profile, m)).length;
  return h(
    "div",
    { class: "screen menu-main" },
    h(
      "div",
      {},
      wordmark(),
      h("div", { class: "tag" }, "Design the spacecraft. Walk the station. Fly the mission. Every decision is real engineering, and every subsystem depends on the others."),
    ),
    h(
      "div",
      { class: "panel player-chip" },
      avatar.canvas,
      h("div", {}, h("b", {}, app.profile.displayName), h("div", { style: "font-size:0.78rem;color:var(--dim)" }, `${a.name} - ${clearedCount}/4 missions cleared`)),
    ),
    h(
      "div",
      { class: "menu-list" },
      btn([h("span", {}, "Play solo"), h("small", {}, "Mission select")], () => app.goMissionSelect(), "btn primary"),
      btn([h('span',{},'Multiplayer'),h('small',{},'Create or join a crew · 1–4 players')],()=>app.goMultiplayer()),
      btn([h("span", {}, "Mission history"), h("small", {}, `${app.profile.history.length} report${app.profile.history.length === 1 ? "" : "s"}`)], () => app.goHistory()),
      btn([h("span", {}, "How to play"), h("small", {}, "Controls and rules")], () => app.openHelp()),
      btn([h("span", {}, "Settings"), h("small", {}, "Audio, display, profile")], () => openSettings(app)),
    ),
    h("div", { class: "footer-note" }, `ORBYX 1.1.0 - Four-mission engineering update. ${STORAGE_NOTE}`),
  );
}

export function missionSelectScreen(app: App, missions: MissionDef[]): HTMLElement {
  const cards = missions.map((m, i) => {
    const unlocked = app.isUnlocked(m);
    const playable = m.playable && unlocked;
    const pr = app.profile.progress[m.id];
    const prev = m.unlockedBy ? missions.find((x) => x.id === m.unlockedBy) : null;
    let status: HTMLElement;
    if (!unlocked) status = h("div", { class: "status" }, `Locked. Clear ${prev?.name ?? "the previous mission"} (one Successful or two Partially Successful results).`);
    else if (!m.playable) status = h("div", { class: "status" }, h("b", {}, "Unlocked. "), "This mission is being built and becomes playable in a later milestone.");
    else if (pr) status = h("div", { class: "status" }, "Best: ", h("b", {}, `${OUTCOME_LABEL[pr.bestOutcome]} - ${pr.bestScore.toFixed(1)}/10`), ` - ${pr.attempts} attempt${pr.attempts === 1 ? "" : "s"}`);
    else status = h("div", { class: "status" }, h("b", {}, "Ready. "), "Not attempted yet.");
    const art = h("div", { class: "art" });
    art.innerHTML = missionArt(i);
    const card = h(
      "div",
      { class: `panel mission-card ${playable ? "playable" : ""} ${unlocked ? "" : "locked"}`, role: playable ? "button" : null, tabindex: playable ? 0 : null },
      art,
      h("div", { style: "display:flex; justify-content:space-between; align-items:center" }, h("span", { class: `chip ${m.difficulty.toLowerCase()}` }, m.difficulty), h("span", { class: "eyebrow", style: "color:var(--dim)" }, `Mission ${i + 1}`)),
      h("h3", {}, m.name),
      h("p", { style: "margin:0; font-size:0.88rem" }, m.tagline),
      status,
      playable ? btn("Select crew", () => app.goRoster(m.id), "btn primary small") : null,
    );
    if (playable) card.addEventListener("keydown", (e) => e.key === "Enter" && app.goRoster(m.id));
    return card;
  });
  return h(
    "div",
    { class: "screen centered" },
    h(
      "div",
      { class: "panel card-wide" },
      h("div", { class: "card-head" }, h("div", {}, h("div", { class: "eyebrow" }, "Campaign"), h("h2", {}, "Mission select")), btn("Back", () => app.goMenu(), "btn ghost small")),
      h("div", { class: "card-body scroll" }, h("div", { class: "missions" }, ...cards)),
    ),
  );
}

function missionArt(i: number): string {
  const arts = [
    `<svg viewBox="0 0 200 72" width="100%" height="100%" preserveAspectRatio="xMidYMid slice"><circle cx="150" cy="120" r="90" fill="#1d5fb0"/><path d="M90 70 q30 -30 70 -20 q30 10 30 30" fill="#3b8c5a"/><ellipse cx="150" cy="120" rx="118" ry="40" fill="none" stroke="#2EE6C5" stroke-width="1.5" transform="rotate(-15 150 120)"/><rect x="50" y="26" width="10" height="8" fill="#F2C65A"/><rect x="38" y="28" width="11" height="4" fill="#2b56c8"/><rect x="61" y="28" width="11" height="4" fill="#2b56c8"/></svg>`,
    `<svg viewBox="0 0 200 72" width="100%" height="100%" preserveAspectRatio="xMidYMid slice"><circle cx="140" cy="44" r="34" fill="#a9b2c0"/><circle cx="128" cy="34" r="6" fill="#8d96a5"/><circle cx="150" cy="54" r="8" fill="#8d96a5"/><circle cx="30" cy="70" r="26" fill="#1d5fb0"/><path d="M40 52 Q90 -10 140 10" fill="none" stroke="#4FC3F7" stroke-dasharray="4 4"/></svg>`,
    `<svg viewBox="0 0 200 72" width="100%" height="100%" preserveAspectRatio="xMidYMid slice"><rect x="20" y="20" width="160" height="34" rx="6" fill="#2a2f3a"/><path d="M60 20 l10 34 M120 20 l-8 34" stroke="#FF5A5A" stroke-width="3"/><circle cx="160" cy="36" r="6" fill="#FFB020"/></svg>`,
    `<svg viewBox="0 0 200 72" width="100%" height="100%" preserveAspectRatio="xMidYMid slice"><circle cx="60" cy="30" r="12" fill="#FFD27A"/><circle cx="84" cy="40" r="7" fill="#FFB86B"/><circle cx="150" cy="50" r="16" fill="#3b6f8c"/><circle cx="120" cy="22" r="6" fill="#8c5a3b"/></svg>`,
  ];
  return arts[i] ?? "";
}

// ---------------------------------------------------------------------------------------------
// Settings (modal)
// ---------------------------------------------------------------------------------------------

export function openSettings(app: App) {
  app.openModal(settingsPanel(app), { id: "settings" });
}

function toggle(on: boolean, onchange: (v: boolean) => void, label: string): HTMLButtonElement {
  const t = h("button", { class: "toggle", type: "button", role: "switch", "aria-checked": String(on), "aria-label": label }) as HTMLButtonElement;
  t.addEventListener("click", () => {
    const v = t.getAttribute("aria-checked") !== "true";
    t.setAttribute("aria-checked", String(v));
    sfx.play("click");
    onchange(v);
  });
  return t;
}

function settingsPanel(app: App): HTMLElement {
  const s = app.profile.settings;
  const update = (patch: Partial<Profile["settings"]>) => {
    app.setProfile({ ...app.profile, settings: { ...app.profile.settings, ...patch } });
  };
  const vol = h("input", { type: "range", min: 0, max: 1, step: 0.05, value: s.masterVolume, "aria-label": "Master volume" }) as HTMLInputElement;
  vol.addEventListener("input", () => update({ masterVolume: Number(vol.value) }));
  vol.addEventListener("change", () => sfx.play("commit"));
  const scale = h("input", { type: "range", min: 0.85, max: 1.25, step: 0.05, value: s.uiScale, "aria-label": "Interface scale" }) as HTMLInputElement;
  scale.addEventListener("change", () => update({ uiScale: Number(scale.value) }));

  const file = h("input", { type: "file", accept: "application/json,.json", style: "display:none" }) as HTMLInputElement;
  file.addEventListener("change", async () => {
    const f = file.files?.[0];
    if (!f) return;
    const res = importProfile(await f.text());
    if (!res.ok) {
      toast(res.error, "warn");
      sfx.play("error");
      return;
    }
    if (!confirm(`Replace the current profile "${app.profile.displayName}" with "${res.profile.displayName}"? This cannot be undone.`)) return;
    app.setProfile(res.profile);
    toast(`Profile imported: ${res.profile.displayName}.`, "ok");
    app.closeModal("settings");
    app.goMenu();
  });

  const row = (label: string, hint: string, control: HTMLElement) =>
    h("div", { class: "setting" }, h("label", {}, label, h("small", {}, hint)), control);

  return h(
    "div",
    { class: "panel modal narrow" },
    h("div", { class: "card-head" }, h("h2", {}, "Settings"), btn("Close", () => app.closeModal("settings"), "btn ghost small")),
    h(
      "div",
      { class: "card-body scroll" },
      row("Master volume", "All game audio", vol),
      row("Sound effects", "Interface, doors, footsteps", toggle(s.sfx, (v) => update({ sfx: v }), "Sound effects")),
      row("Ambience", "Station hum during missions", toggle(s.ambience, (v) => update({ ambience: v }), "Ambience")),
      row("Reduced motion", "Calmer animation, shorter cinematic", toggle(s.reducedMotion, (v) => update({ reducedMotion: v }), "Reduced motion")),
      row("Interface scale", "Text and panel size", scale),
      h("h4", { style: "margin-top:1.2rem; font-size:0.8rem; letter-spacing:0.18em; color:var(--dim); text-transform:uppercase" }, "Profile"),
      h("p", { style: "font-size:0.85rem" }, STORAGE_NOTE),
      h(
        "div",
        { style: "display:flex; gap:0.6rem; flex-wrap:wrap" },
        btn("Export profile", () => {
          download(`orbyx-profile-${app.profile.displayName.replace(/\W+/g, "_")}.json`, exportProfile(app.profile));
          toast("Profile exported.", "ok");
        }, "btn small"),
        btn("Import profile", () => file.click(), "btn small"),
        btn("Delete profile", async () => {
          if (!confirm("Delete this profile and all mission history from this browser? Export first if you want a backup.")) return;
          await deleteProfile();
          location.reload();
        }, "btn small danger"),
      ),
      file,
    ),
  );
}
