import { sfx } from "../audio/sfx";
import { drawAstronaut, type Facing } from "../art/astronaut";
import type { Astronaut } from "../data/astronauts";

type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | EventListener | null | undefined>;

/** Tiny hyperscript helper. Event handlers: { onclick: fn }. Boolean false/null attributes are skipped. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v as EventListener);
    else if (k === "class") el.className = String(v);
    else if (k === "html") el.innerHTML = String(v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const $ = (id: string) => document.getElementById(id)!;

export function btn(label: Child | Child[], onclick: () => void, cls = "btn", extra: Attrs = {}): HTMLButtonElement {
  const b = h("button", { class: cls, type: "button", ...extra }, ...(Array.isArray(label) ? label : [label]));
  b.addEventListener("click", () => {
    sfx.unlock();
    sfx.play("click");
    onclick();
  });
  b.addEventListener("mouseenter", () => sfx.play("hover"));
  return b;
}

export function kbd(k: string) {
  return h("span", { class: "kbd" }, k);
}

export function toast(text: string, kind: "ok" | "warn" | "info" = "info") {
  const t = h("div", { class: `toast panel ${kind}` }, text);
  $("toasts").append(t);
  setTimeout(() => t.remove(), 3300);
}

export function wordmark(): HTMLElement {
  const svg = `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="22" fill="none" stroke="#2EE6C5" stroke-width="9"/><g class="orbit-dot"><ellipse cx="32" cy="32" rx="31" ry="11" fill="none" stroke="#E8F4FF" stroke-width="3" transform="rotate(-28 32 32)"/><circle cx="58" cy="18" r="5.5" fill="#FFB020"/></g></svg>`;
  const el = h("span", { class: "wordmark", "aria-label": "ORBYX" });
  el.innerHTML = `${svg}<span>RBYX</span>`;
  return el;
}

export function fmtTime(s: number): string {
  const t = Math.max(0, Math.ceil(s));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/** Canvas showing an astronaut; animated unless `still`. Returns the canvas and a stop function. */
export function astroCanvas(a: Astronaut, px: number, opts: { still?: boolean; walk?: boolean; facing?: Facing } = {}) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const c = h("canvas", { width: Math.round(px * dpr), height: Math.round(px * dpr) }) as HTMLCanvasElement;
  const ctx = c.getContext("2d")!;
  let raf = 0;
  let alive = true;
  let wasConnected = false;
  const start = performance.now();
  const draw = (now: number) => {
    const t = (now - start) / 1000;
    ctx.clearRect(0, 0, c.width, c.height);
    const scale = (px * dpr) / 64;
    const frame = opts.walk ? Math.floor(t * 6) % 4 : -1;
    drawAstronaut(ctx, 0, 0, scale, opts.facing ?? "down", frame, a, t);
    if (c.isConnected) wasConnected = true;
    // Keep animating until the canvas has been shown and then removed from the page.
    if (!opts.still && alive && !(wasConnected && !c.isConnected)) raf = requestAnimationFrame(draw);
  };
  draw(performance.now());
  return {
    canvas: c,
    stop: () => {
      alive = false;
      cancelAnimationFrame(raf);
    },
  };
}

/** Download a text file */
export function download(name: string, text: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = h("a", { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
