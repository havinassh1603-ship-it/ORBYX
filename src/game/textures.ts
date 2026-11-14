import Phaser from "phaser";
import type { PropKind } from "../data/maps";
import { ASTRONAUTS } from "../data/astronauts";
import { buildAstronautSheet, CELL, SHEET_COLS, SHEET_ROWS } from "../art/astronaut";

export const TILE = 48;

export const T = {
  VOID: 0,
  WALL: 1,
  WALL_FACE: 2,
  WINDOW: 3,
  F_OPS: 4,
  F_CLEAN: 5,
  F_TECH: 6,
  F_HANGAR: 7,
  F_LOBBY: 8,
  F_CORRIDOR: 9,
  F_DOOR: 10,
} as const;
export const TILE_COUNT = 11;
export const SOLID_TILES = [T.WALL, T.WALL_FACE, T.WINDOW];

export const PALETTE = {
  space: "#060A14",
  teal: "#2EE6C5",
  tealDeep: "#13A58C",
  ink: "#0B1220",
  wallTop: "#141B2B",
  wallFace: "#26314A",
  amber: "#FFB020",
};

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, g: c.getContext("2d")! };
}

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Small deterministic PRNG for texture detail */
function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------------------------
// Tileset
// ---------------------------------------------------------------------------------------------

function drawTile(g: CanvasRenderingContext2D, idx: number, x: number) {
  const S = TILE;
  g.save();
  g.translate(x, 0);
  g.beginPath();
  g.rect(0, 0, S, S);
  g.clip();
  const rnd = mulberry(idx * 97 + 13);

  const panelFloor = (base: string, line: string, accent?: string) => {
    g.fillStyle = base;
    g.fillRect(0, 0, S, S);
    g.strokeStyle = line;
    g.lineWidth = 1;
    g.strokeRect(0.5, 0.5, S - 1, S - 1);
    g.strokeStyle = "rgba(255,255,255,0.035)";
    g.beginPath();
    g.moveTo(1, 1.5);
    g.lineTo(S - 1, 1.5);
    g.stroke();
    if (accent) {
      g.fillStyle = accent;
      g.fillRect(S / 2 - 1, S / 2 - 1, 2, 2);
    }
  };

  switch (idx) {
    case T.VOID:
      break;
    case T.WALL: {
      g.fillStyle = PALETTE.wallTop;
      g.fillRect(0, 0, S, S);
      g.fillStyle = "rgba(255,255,255,0.025)";
      g.fillRect(0, 0, S, 1);
      g.fillRect(0, 0, 1, S);
      break;
    }
    case T.WALL_FACE:
    case T.WINDOW: {
      const grd = g.createLinearGradient(0, 0, 0, S);
      grd.addColorStop(0, "#36446A");
      grd.addColorStop(0.18, PALETTE.wallFace);
      grd.addColorStop(1, "#19213A");
      g.fillStyle = grd;
      g.fillRect(0, 0, S, S);
      g.fillStyle = "#475A86";
      g.fillRect(0, 0, S, 4);
      g.fillStyle = "rgba(0,0,0,0.35)";
      g.fillRect(0, S - 4, S, 4);
      g.strokeStyle = "rgba(0,0,0,0.35)";
      g.beginPath();
      g.moveTo(S - 0.5, 4);
      g.lineTo(S - 0.5, S - 4);
      g.stroke();
      if (idx === T.WINDOW) {
        g.fillStyle = "#0A1530";
        rr(g, 4, 9, S - 8, S - 20, 4);
        g.fill();
        for (let i = 0; i < 9; i++) {
          g.fillStyle = `rgba(255,255,255,${0.4 + rnd() * 0.6})`;
          g.fillRect(6 + rnd() * (S - 12), 11 + rnd() * (S - 24), 1.3, 1.3);
        }
        const eg = g.createLinearGradient(0, S - 22, 0, S - 11);
        eg.addColorStop(0, "rgba(80,160,255,0)");
        eg.addColorStop(1, "rgba(80,170,255,0.55)");
        g.fillStyle = eg;
        g.fillRect(4, S - 22, S - 8, 11);
        g.strokeStyle = "#6C83B8";
        g.lineWidth = 2;
        rr(g, 4, 9, S - 8, S - 20, 4);
        g.stroke();
      } else {
        g.fillStyle = "rgba(46,230,197,0.55)";
        g.fillRect(8, 22, S - 16, 2);
        g.fillStyle = "rgba(255,255,255,0.05)";
        g.fillRect(10, 30, 10, 8);
        g.fillRect(26, 30, 12, 8);
      }
      break;
    }
    case T.F_OPS:
      panelFloor("#1C2840", "rgba(0,0,0,0.35)", "rgba(46,230,197,0.25)");
      break;
    case T.F_CLEAN: {
      panelFloor("#C9D5E2", "rgba(40,60,90,0.25)");
      g.fillStyle = "rgba(255,255,255,0.35)";
      for (let yy = 8; yy < S; yy += 10) for (let xx = 8; xx < S; xx += 10) g.fillRect(xx, yy, 1.5, 1.5);
      break;
    }
    case T.F_TECH: {
      panelFloor("#202D38", "rgba(0,0,0,0.4)");
      g.strokeStyle = "rgba(255,255,255,0.05)";
      for (let i = -S; i < S; i += 8) {
        g.beginPath();
        g.moveTo(i, S);
        g.lineTo(i + S, 0);
        g.stroke();
      }
      break;
    }
    case T.F_HANGAR: {
      g.fillStyle = "#2A2F38";
      g.fillRect(0, 0, S, S);
      for (let i = 0; i < 40; i++) {
        g.fillStyle = `rgba(255,255,255,${rnd() * 0.04})`;
        g.fillRect(rnd() * S, rnd() * S, 2, 2);
      }
      g.strokeStyle = "rgba(0,0,0,0.4)";
      g.strokeRect(0.5, 0.5, S - 1, S - 1);
      break;
    }
    case T.F_LOBBY: {
      g.fillStyle = "#2B2742";
      g.fillRect(0, 0, S, S);
      for (let i = 0; i < 60; i++) {
        g.fillStyle = `rgba(255,255,255,${rnd() * 0.03})`;
        g.fillRect(rnd() * S, rnd() * S, 1.5, 1.5);
      }
      g.strokeStyle = "rgba(0,0,0,0.2)";
      g.strokeRect(0.5, 0.5, S - 1, S - 1);
      break;
    }
    case T.F_CORRIDOR: {
      panelFloor("#18223A", "rgba(0,0,0,0.4)");
      g.fillStyle = "rgba(46,230,197,0.08)";
      g.fillRect(0, S / 2 - 2, S, 4);
      break;
    }
    case T.F_DOOR: {
      g.fillStyle = "#1A2236";
      g.fillRect(0, 0, S, S);
      g.fillStyle = "#FFB020";
      for (let i = -S; i < S * 2; i += 12) {
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i + 6, 0);
        g.lineTo(i + 6 - S, S);
        g.lineTo(i - S, S);
        g.closePath();
        g.globalAlpha = 0.35;
        g.fill();
        g.globalAlpha = 1;
      }
      break;
    }
  }
  g.restore();
}

export function buildTileset(): HTMLCanvasElement {
  const { c, g } = canvas(TILE * TILE_COUNT, TILE);
  for (let i = 0; i < TILE_COUNT; i++) drawTile(g, i, i * TILE);
  return c;
}

// ---------------------------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------------------------

export function propKey(kind: PropKind, w: number, h: number) {
  return `prop-${kind}-${w}x${h}`;
}

function shadow(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  g.fillStyle = "rgba(0,0,0,0.3)";
  rr(g, x + 3, y + 5, w, h, 6);
  g.fill();
}

export function drawProp(kind: PropKind, wT: number, hT: number): HTMLCanvasElement {
  const W = wT * TILE;
  const H = hT * TILE;
  const { c, g } = canvas(W, H + 16);
  g.translate(0, 16); // allow 16 px of height above the footprint for a 3/4 look
  const ink = PALETTE.ink;
  g.lineWidth = 2;
  g.strokeStyle = ink;
  const rnd = mulberry(W * 7 + H * 3 + kind.length);

  switch (kind) {
    case "desk": {
      shadow(g, 2, 6, W - 4, H - 10);
      g.fillStyle = "#3B4A6B";
      rr(g, 2, 6, W - 4, H - 12, 6);
      g.fill();
      g.stroke();
      g.fillStyle = "#4E628D";
      rr(g, 2, 2, W - 4, H - 18, 6);
      g.fill();
      g.stroke();
      for (let i = 0; i < wT; i++) {
        const x = i * TILE + 8;
        g.fillStyle = "#0E1830";
        rr(g, x, -12, TILE - 16, 20, 3);
        g.fill();
        g.stroke();
        const sg = g.createLinearGradient(0, -10, 0, 6);
        sg.addColorStop(0, "rgba(46,230,197,0.9)");
        sg.addColorStop(1, "rgba(46,120,230,0.6)");
        g.fillStyle = sg;
        g.fillRect(x + 3, -9, TILE - 22, 14);
        g.fillStyle = "rgba(255,255,255,0.6)";
        for (let k = 0; k < 3; k++) g.fillRect(x + 5, -6 + k * 4, 6 + rnd() * 14, 1.5);
      }
      break;
    }
    case "rack": {
      shadow(g, 4, 0, W - 8, H - 4);
      g.fillStyle = "#222C40";
      rr(g, 4, -12, W - 8, H + 6, 4);
      g.fill();
      g.stroke();
      for (let y = -6; y < H - 8; y += 9) {
        g.fillStyle = "#151C2C";
        g.fillRect(8, y, W - 16, 6);
        g.fillStyle = rnd() > 0.3 ? "#2EE6C5" : "#FFB020";
        g.fillRect(10, y + 2, 3, 2);
        g.fillStyle = "#4FC3F7";
        g.fillRect(16, y + 2, 2, 2);
      }
      break;
    }
    case "plant": {
      g.fillStyle = "rgba(0,0,0,0.3)";
      g.beginPath();
      g.ellipse(W / 2, H - 6, 16, 5, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#C9D5E2";
      rr(g, W / 2 - 11, H - 24, 22, 18, 5);
      g.fill();
      g.stroke();
      const leaf = (a: number, l: number, col: string) => {
        g.save();
        g.translate(W / 2, H - 22);
        g.rotate(a);
        g.fillStyle = col;
        g.beginPath();
        g.ellipse(0, -l / 2, 6, l / 2, 0, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        g.restore();
      };
      leaf(-0.9, 26, "#2FAE7A");
      leaf(0.8, 24, "#2FAE7A");
      leaf(-0.3, 32, "#3BCB8E");
      leaf(0.35, 30, "#3BCB8E");
      break;
    }
    case "crate": {
      shadow(g, 4, 4, W - 8, H - 8);
      g.fillStyle = "#6A5A3A";
      rr(g, 4, -4, W - 8, H - 4, 4);
      g.fill();
      g.stroke();
      g.fillStyle = "#8A7650";
      rr(g, 4, -4, W - 8, 10, 4);
      g.fill();
      g.stroke();
      g.strokeStyle = "rgba(0,0,0,0.35)";
      g.beginPath();
      g.moveTo(8, 8);
      g.lineTo(W - 8, H - 10);
      g.moveTo(W - 8, 8);
      g.lineTo(8, H - 10);
      g.stroke();
      g.fillStyle = "#FFB020";
      g.fillRect(W / 2 - 6, 14, 12, 5);
      break;
    }
    case "bench": {
      shadow(g, 2, 4, W - 4, H - 8);
      g.fillStyle = "#AFC0D3";
      rr(g, 2, 0, W - 4, H - 8, 5);
      g.fill();
      g.stroke();
      g.fillStyle = "#E6EDF5";
      rr(g, 2, -6, W - 4, H - 14, 5);
      g.fill();
      g.stroke();
      g.fillStyle = "#7A8CA6";
      for (let i = 0; i < 4; i++) g.fillRect(12 + i * 30, 2, 14, 6);
      break;
    }
    case "satellite": {
      // The Earthwatch spacecraft under integration, on a stand.
      g.fillStyle = "rgba(0,0,0,0.3)";
      g.beginPath();
      g.ellipse(W / 2, H - 10, W / 2 - 6, 12, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#5A6A86";
      g.fillRect(W / 2 - 4, H - 40, 8, 30);
      g.strokeRect(W / 2 - 4, H - 40, 8, 30);
      // solar wings
      const wing = (x: number) => {
        g.fillStyle = "#1E3E8A";
        rr(g, x, 22, 34, 46, 3);
        g.fill();
        g.stroke();
        g.strokeStyle = "rgba(140,190,255,0.6)";
        g.lineWidth = 1;
        for (let i = 1; i < 4; i++) {
          g.beginPath();
          g.moveTo(x + 2, 22 + i * 11.5);
          g.lineTo(x + 32, 22 + i * 11.5);
          g.stroke();
        }
        g.beginPath();
        g.moveTo(x + 17, 24);
        g.lineTo(x + 17, 66);
        g.stroke();
        g.lineWidth = 2;
        g.strokeStyle = ink;
      };
      wing(4);
      wing(W - 38);
      // bus with gold foil
      const bg = g.createLinearGradient(W / 2 - 26, 0, W / 2 + 26, 0);
      bg.addColorStop(0, "#B8892A");
      bg.addColorStop(0.5, "#F2C65A");
      bg.addColorStop(1, "#A67A22");
      g.fillStyle = bg;
      rr(g, W / 2 - 28, 14, 56, 62, 6);
      g.fill();
      g.stroke();
      g.strokeStyle = "rgba(90,60,10,0.4)";
      g.lineWidth = 1;
      for (let i = 0; i < 6; i++) {
        g.beginPath();
        g.moveTo(W / 2 - 26 + rnd() * 50, 16);
        g.lineTo(W / 2 - 26 + rnd() * 50, 74);
        g.stroke();
      }
      g.lineWidth = 2;
      g.strokeStyle = ink;
      // telescope barrel
      g.fillStyle = "#D9E2EC";
      rr(g, W / 2 - 14, -10, 28, 34, 6);
      g.fill();
      g.stroke();
      g.fillStyle = "#0E1830";
      g.beginPath();
      g.ellipse(W / 2, -8, 11, 5, 0, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case "rocket": {
      // Launch vehicle mock-up standing on its integration stand (seen from above at an angle).
      g.fillStyle = "rgba(0,0,0,0.35)";
      g.beginPath();
      g.ellipse(W / 2, H - 14, W / 2, 16, 0, 0, Math.PI * 2);
      g.fill();
      // gantry
      g.strokeStyle = "#566179";
      g.lineWidth = 3;
      for (let y = 10; y < H - 20; y += 22) {
        g.beginPath();
        g.moveTo(W - 10, y);
        g.lineTo(W - 2, y + 22);
        g.stroke();
      }
      g.strokeRect(W - 12, 0, 10, H - 18);
      g.lineWidth = 2;
      g.strokeStyle = ink;
      const cx = W / 2 - 6;
      const bw = 40;
      const body = g.createLinearGradient(cx - bw / 2, 0, cx + bw / 2, 0);
      body.addColorStop(0, "#BFC8D6");
      body.addColorStop(0.45, "#FFFFFF");
      body.addColorStop(1, "#9AA5B8");
      g.fillStyle = body;
      g.beginPath();
      g.moveTo(cx - bw / 2, H - 40);
      g.lineTo(cx - bw / 2, 60);
      g.quadraticCurveTo(cx - bw / 2, -6, cx, -14);
      g.quadraticCurveTo(cx + bw / 2, -6, cx + bw / 2, 60);
      g.lineTo(cx + bw / 2, H - 40);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = "#2EE6C5";
      g.fillRect(cx - bw / 2 + 1, 70, bw - 2, 8);
      g.fillStyle = "#0B1220";
      g.font = "bold 13px sans-serif";
      g.save();
      g.translate(cx + 5, 200);
      g.rotate(-Math.PI / 2);
      g.fillText("ORBYX", 0, 0);
      g.restore();
      // fins
      g.fillStyle = "#FF6B5A";
      g.beginPath();
      g.moveTo(cx - bw / 2, H - 80);
      g.lineTo(cx - bw / 2 - 18, H - 34);
      g.lineTo(cx - bw / 2, H - 40);
      g.closePath();
      g.fill();
      g.stroke();
      g.beginPath();
      g.moveTo(cx + bw / 2, H - 80);
      g.lineTo(cx + bw / 2 + 18, H - 34);
      g.lineTo(cx + bw / 2, H - 40);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = "#3A4558";
      rr(g, cx - 14, H - 42, 28, 14, 3);
      g.fill();
      g.stroke();
      break;
    }
    case "battery": {
      shadow(g, 4, 4, W - 8, H - 8);
      g.fillStyle = "#2C3A4E";
      rr(g, 4, -6, W - 8, H - 2, 5);
      g.fill();
      g.stroke();
      for (let i = 0; i < 3; i++) {
        g.fillStyle = "#1A2434";
        rr(g, 10, 2 + i * 26, W - 20, 20, 3);
        g.fill();
        g.fillStyle = "#FFB020";
        g.fillRect(14, 8 + i * 26, (W - 28) * (0.5 + rnd() * 0.5), 6);
      }
      break;
    }
    case "dish": {
      g.fillStyle = "rgba(0,0,0,0.3)";
      g.beginPath();
      g.ellipse(W / 2, H - 12, W / 2 - 8, 12, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#566179";
      g.fillRect(W / 2 - 5, H / 2, 10, H / 2 - 10);
      g.strokeRect(W / 2 - 5, H / 2, 10, H / 2 - 10);
      const dg = g.createRadialGradient(W / 2 - 14, H / 2 - 20, 4, W / 2, H / 2 - 6, W / 2);
      dg.addColorStop(0, "#FFFFFF");
      dg.addColorStop(1, "#9AA7B8");
      g.fillStyle = dg;
      g.beginPath();
      g.ellipse(W / 2, H / 2 - 8, W / 2 - 10, H / 2 - 22, -0.35, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.strokeStyle = "#566179";
      g.beginPath();
      g.moveTo(W / 2 - 22, H / 2 + 6);
      g.lineTo(W / 2 + 6, H / 2 - 22);
      g.moveTo(W / 2 + 22, H / 2 + 4);
      g.lineTo(W / 2 + 6, H / 2 - 22);
      g.stroke();
      g.fillStyle = "#B6F36B";
      g.beginPath();
      g.arc(W / 2 + 6, H / 2 - 22, 4, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case "screen": {
      g.fillStyle = "#0E1830";
      rr(g, 4, -14, W - 8, H + 4, 5);
      g.fill();
      g.stroke();
      const sg = g.createLinearGradient(0, -10, 0, H - 14);
      sg.addColorStop(0, "#0A2A4A");
      sg.addColorStop(1, "#06182E");
      g.fillStyle = sg;
      g.fillRect(9, -9, W - 18, H - 6);
      // world map ground track
      g.strokeStyle = "rgba(46,230,197,0.85)";
      g.lineWidth = 1.5;
      g.beginPath();
      for (let x = 0; x < W - 18; x += 3) {
        const y = (H - 16) / 2 + Math.sin((x / (W - 18)) * Math.PI * 4) * ((H - 20) / 2.6);
        if (x === 0) g.moveTo(9 + x, -9 + y);
        else g.lineTo(9 + x, -9 + y);
      }
      g.stroke();
      g.fillStyle = "rgba(255,255,255,0.15)";
      for (let i = 0; i < 12; i++) g.fillRect(12 + rnd() * (W - 30), -6 + rnd() * (H - 14), 8 + rnd() * 18, 4 + rnd() * 6);
      break;
    }
    case "holo": {
      g.fillStyle = "rgba(0,0,0,0.3)";
      g.beginPath();
      g.ellipse(W / 2, H - 14, W / 2 - 10, 12, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#2B3854";
      g.beginPath();
      g.ellipse(W / 2, H - 20, W / 2 - 14, 12, 0, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = "rgba(46,230,197,0.18)";
      g.beginPath();
      g.moveTo(W / 2 - 26, H - 22);
      g.lineTo(W / 2 - 34, 8);
      g.lineTo(W / 2 + 34, 8);
      g.lineTo(W / 2 + 26, H - 22);
      g.closePath();
      g.fill();
      g.strokeStyle = "rgba(46,230,197,0.9)";
      g.beginPath();
      g.arc(W / 2, 30, 18, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.ellipse(W / 2, 30, 30, 10, -0.4, 0, Math.PI * 2);
      g.stroke();
      break;
    }
    case "sofa": {
      shadow(g, 2, 4, W - 4, H - 8);
      g.fillStyle = "#5B4A8C";
      rr(g, 2, -8, W - 4, H, 10);
      g.fill();
      g.stroke();
      g.fillStyle = "#7360AE";
      rr(g, 8, 4, W - 16, H - 18, 7);
      g.fill();
      g.stroke();
      break;
    }
    case "locker": {
      shadow(g, 4, 0, W - 8, H - 4);
      g.fillStyle = "#3A4A66";
      rr(g, 4, -12, W - 8, H + 6, 4);
      g.fill();
      g.stroke();
      for (let y = -6; y < H - 6; y += TILE) {
        g.strokeStyle = "rgba(0,0,0,0.4)";
        g.strokeRect(8, y, W - 16, TILE - 8);
        g.fillStyle = "#2EE6C5";
        g.fillRect(W - 16, y + 18, 3, 8);
      }
      break;
    }
    case "tank": {
      // spherical propellant tank in a cradle, frost-white insulation
      const r = Math.min(W, H) / 2 - 6;
      g.fillStyle = "rgba(0,0,0,0.32)";
      g.beginPath();
      g.ellipse(W / 2 + 4, H - 10, r, r * 0.35, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#3A4558";
      g.fillRect(W / 2 - r * 0.8, H - 22, r * 1.6, 12);
      g.strokeRect(W / 2 - r * 0.8, H - 22, r * 1.6, 12);
      const tg = g.createRadialGradient(W / 2 - r * 0.4, H / 2 - r * 0.6, r * 0.1, W / 2, H / 2 - 8, r * 1.1);
      tg.addColorStop(0, "#F4F7FB");
      tg.addColorStop(0.6, "#B9C3D3");
      tg.addColorStop(1, "#6B7890");
      g.fillStyle = tg;
      g.beginPath();
      g.arc(W / 2, H / 2 - 8, r, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.strokeStyle = "rgba(11,18,32,0.35)";
      g.beginPath();
      g.ellipse(W / 2, H / 2 - 8, r, r * 0.3, 0, 0, Math.PI);
      g.stroke();
      g.fillStyle = "#FFB020";
      g.fillRect(W / 2 - 10, H / 2 - 8 - r * 0.15, 20, 5);
      g.fillStyle = "#13A58C";
      g.beginPath();
      g.arc(W / 2 + r * 0.55, H / 2 - 8 - r * 0.55, 4, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case "engine": {
      // main engine seen from above: thrust structure, gimbal ring, nozzle bell going aft
      shadow(g, 6, 4, W - 12, H - 8);
      g.fillStyle = "#2A3346";
      rr(g, 6, -4, W - 12, H - 6, 10);
      g.fill();
      g.stroke();
      g.strokeStyle = "rgba(255,255,255,0.08)";
      for (let i = 1; i < 6; i++) {
        g.beginPath();
        g.moveTo(6 + ((W - 12) * i) / 6, -4);
        g.lineTo(6 + ((W - 12) * i) / 6, H - 10);
        g.stroke();
      }
      const cx = W / 2,
        cy = H / 2 - 6,
        R = Math.min(W, H) / 2 - 12;
      const ng = g.createRadialGradient(cx, cy, 4, cx, cy, R);
      ng.addColorStop(0, "#0B0F18");
      ng.addColorStop(0.55, "#3B2A22");
      ng.addColorStop(0.85, "#B5652E");
      ng.addColorStop(1, "#E9A15A");
      g.fillStyle = ng;
      g.beginPath();
      g.arc(cx, cy, R, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = PALETTE.ink;
      g.lineWidth = 3;
      g.stroke();
      g.lineWidth = 2;
      g.strokeStyle = "#8C9BB5";
      g.beginPath();
      g.arc(cx, cy, R * 0.42, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = "#566179";
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        g.fillRect(cx + dx * (R + 6) - 5, cy + dy * (R * 0.6) - 5, 10, 10);
      }
      // feed lines
      g.strokeStyle = "#FFB020";
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(10, 6);
      g.quadraticCurveTo(cx - R, 4, cx - R * 0.7, cy - R * 0.7);
      g.stroke();
      g.strokeStyle = "#7FD8FF";
      g.beginPath();
      g.moveTo(W - 10, 6);
      g.quadraticCurveTo(cx + R, 4, cx + R * 0.7, cy - R * 0.7);
      g.stroke();
      g.lineWidth = 2;
      break;
    }
    case "platform": {
      // rotating scan platform base (the turret is a separate rotating sprite: platform-top)
      g.fillStyle = "rgba(0,0,0,0.3)";
      g.beginPath();
      g.ellipse(W / 2 + 4, H / 2 + 6, W / 2 - 4, H / 2 - 8, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#26314A";
      g.beginPath();
      g.arc(W / 2, H / 2, W / 2 - 6, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.strokeStyle = "rgba(46,230,197,0.6)";
      g.setLineDash([6, 6]);
      g.beginPath();
      g.arc(W / 2, H / 2, W / 2 - 14, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
      break;
    }
    case "radiator": {
      // folded radiator panels on a test rack
      shadow(g, 2, 2, W - 4, H - 6);
      g.fillStyle = "#3A4558";
      g.fillRect(4, H - 14, W - 8, 8);
      g.strokeRect(4, H - 14, W - 8, 8);
      const n = 5;
      const pw = (W - 16) / n;
      for (let i = 0; i < n; i++) {
        const x = 8 + i * pw;
        const pg = g.createLinearGradient(x, -10, x + pw, H);
        pg.addColorStop(0, "#F2F5FA");
        pg.addColorStop(1, "#A9B4C6");
        g.fillStyle = pg;
        rr(g, x + 1, -10, pw - 3, H - 8, 2);
        g.fill();
        g.stroke();
        g.strokeStyle = "rgba(127,216,255,0.55)";
        g.beginPath();
        for (let y = -4; y < H - 20; y += 8) {
          g.moveTo(x + 4, y);
          g.lineTo(x + pw - 6, y);
        }
        g.stroke();
        g.strokeStyle = PALETTE.ink;
      }
      break;
    }
    case "bunk": {
      // sleeping-bag station on the wall: crew quarters
      shadow(g, 4, 0, W - 8, H - 6);
      g.fillStyle = "#33415F";
      rr(g, 4, -10, W - 8, H, 6);
      g.fill();
      g.stroke();
      g.fillStyle = "#5B4BA8";
      rr(g, 9, -2, W - 18, H - 22, 8);
      g.fill();
      g.stroke();
      g.fillStyle = "#E8EEF8";
      rr(g, 12, 2, W - 24, 14, 5);
      g.fill();
      g.fillStyle = "#FFB020";
      g.fillRect(W / 2 - 3, H - 18, 6, 6);
      break;
    }
    case "capsule": {
      // docking hatch to the return capsule
      const r = Math.min(W, H) / 2 - 4;
      g.fillStyle = "rgba(0,0,0,0.35)";
      g.beginPath();
      g.arc(W / 2 + 4, H / 2 + 4, r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#4A5B80";
      g.beginPath();
      g.arc(W / 2, H / 2 - 4, r, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = "#1B2438";
      g.beginPath();
      g.arc(W / 2, H / 2 - 4, r * 0.72, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.strokeStyle = "#FFB020";
      g.lineWidth = 4;
      g.beginPath();
      g.arc(W / 2, H / 2 - 4, r * 0.86, -0.3, 0.9);
      g.stroke();
      g.beginPath();
      g.arc(W / 2, H / 2 - 4, r * 0.86, Math.PI - 0.3, Math.PI + 0.9);
      g.stroke();
      g.lineWidth = 2;
      g.strokeStyle = "#8C9BB5";
      g.beginPath();
      g.moveTo(W / 2 - r * 0.45, H / 2 - 4);
      g.lineTo(W / 2 + r * 0.45, H / 2 - 4);
      g.moveTo(W / 2, H / 2 - 4 - r * 0.45);
      g.lineTo(W / 2, H / 2 - 4 + r * 0.45);
      g.stroke();
      g.fillStyle = "#2EE6C5";
      g.beginPath();
      g.arc(W / 2, H / 2 - 4, 5, 0, Math.PI * 2);
      g.fill();
      break;
    }
  }
  return c;
}
/** Rotating turret of the survey scan platform: twin telescopes on a yoke */
export function drawPlatformTop(size: number): HTMLCanvasElement {
  const { c, g } = canvas(size, size);
  const m = size / 2;
  g.lineWidth = 2;
  g.strokeStyle = PALETTE.ink;
  g.fillStyle = "#566179";
  g.beginPath();
  g.arc(m, m, size * 0.22, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  for (const dx of [-1, 1]) {
    const tg = g.createLinearGradient(m + dx * size * 0.12, 0, m + dx * size * 0.3, 0);
    tg.addColorStop(0, "#E8EEF8");
    tg.addColorStop(1, "#8C9BB5");
    g.fillStyle = tg;
    rr(g, m + (dx < 0 ? -size * 0.32 : size * 0.1), size * 0.12, size * 0.22, size * 0.56, 8);
    g.fill();
    g.stroke();
    g.fillStyle = "#0B1426";
    g.beginPath();
    g.arc(m + dx * size * 0.21, size * 0.18, size * 0.07, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "rgba(127,216,255,0.9)";
    g.stroke();
    g.strokeStyle = PALETTE.ink;
  }
  g.fillStyle = "#2EE6C5";
  g.fillRect(m - 3, m - 3, 6, 6);
  return c;
}
/** Vertical hatch panel (half of a door in a vertical wall) */
export function drawDoorPanelV(): HTMLCanvasElement {
  const { c, g } = canvas(TILE, TILE);
  g.lineWidth = 2;
  g.strokeStyle = PALETTE.ink;
  const grd = g.createLinearGradient(0, 0, TILE, 0);
  grd.addColorStop(0, "#2C3756");
  grd.addColorStop(0.5, "#5A6E9A");
  grd.addColorStop(1, "#2C3756");
  g.fillStyle = grd;
  rr(g, 8, 1, TILE - 16, TILE - 2, 3);
  g.fill();
  g.stroke();
  g.fillStyle = "#FFB020";
  g.fillRect(TILE / 2 - 2, 4, 4, TILE - 8);
  g.fillStyle = "rgba(46,230,197,0.8)";
  g.fillRect(12, TILE / 2 - 2, 6, 4);
  return c;
}
// ---------------------------------------------------------------------------------------------
// Consoles, doors, glow, sky
// ---------------------------------------------------------------------------------------------

export function drawConsole(accent: string, wide = false): HTMLCanvasElement {
  const W = wide ? TILE * 2 : TILE;
  const { c, g } = canvas(W, TILE + 24);
  g.translate(0, 24);
  g.lineWidth = 2;
  g.strokeStyle = PALETTE.ink;
  g.fillStyle = "rgba(0,0,0,0.35)";
  rr(g, 4, 10, W - 6, TILE - 10, 6);
  g.fill();
  g.fillStyle = "#33415F";
  rr(g, 3, 4, W - 6, TILE - 8, 6);
  g.fill();
  g.stroke();
  g.fillStyle = accent;
  g.fillRect(6, TILE - 12, W - 12, 3);
  // angled screen
  g.fillStyle = "#0B1426";
  rr(g, 5, -20, W - 10, 28, 4);
  g.fill();
  g.stroke();
  // keyboard
  g.fillStyle = "#4A5B80";
  rr(g, 9, 12, W - 18, 12, 3);
  g.fill();
  g.fillStyle = "rgba(255,255,255,0.25)";
  for (let x = 12; x < W - 12; x += 5) g.fillRect(x, 15, 3, 2), g.fillRect(x, 19, 3, 2);
  return c;
}

export function drawConsoleScreen(accent: string, wide = false): HTMLCanvasElement {
  const W = (wide ? TILE * 2 : TILE) - 16;
  const { c, g } = canvas(W, 22);
  const sg = g.createLinearGradient(0, 0, 0, 22);
  sg.addColorStop(0, accent);
  sg.addColorStop(1, "rgba(20,40,80,0.9)");
  g.fillStyle = sg;
  g.globalAlpha = 0.9;
  g.fillRect(0, 0, W, 22);
  g.globalAlpha = 1;
  g.fillStyle = "rgba(11,18,32,0.55)";
  for (let i = 0; i < 4; i++) g.fillRect(3, 3 + i * 4.5, 6 + ((i * 37) % (W - 10)), 2);
  return c;
}

export function drawDoorPanel(): HTMLCanvasElement {
  const { c, g } = canvas(TILE, TILE + 12);
  g.translate(0, 12);
  g.lineWidth = 2;
  g.strokeStyle = PALETTE.ink;
  const grd = g.createLinearGradient(0, -12, 0, TILE);
  grd.addColorStop(0, "#5A6E9A");
  grd.addColorStop(1, "#2C3756");
  g.fillStyle = grd;
  rr(g, 1, -12, TILE - 2, TILE + 8, 3);
  g.fill();
  g.stroke();
  g.fillStyle = "#FFB020";
  g.fillRect(4, TILE - 16, TILE - 8, 4);
  g.fillStyle = "rgba(46,230,197,0.8)";
  g.fillRect(TILE / 2 - 2, 4, 4, 14);
  return c;
}

export function drawGlow(): HTMLCanvasElement {
  const { c, g } = canvas(128, 128);
  const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, "rgba(255,255,255,0.9)");
  rg.addColorStop(0.35, "rgba(255,255,255,0.35)");
  rg.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = rg;
  g.fillRect(0, 0, 128, 128);
  return c;
}

export function drawStarfield(size = 1024, seed = 7, density = 520): HTMLCanvasElement {
  const { c, g } = canvas(size, size);
  const rnd = mulberry(seed);
  g.fillStyle = PALETTE.space;
  g.fillRect(0, 0, size, size);
  // Nebula glows are drawn at all wrap offsets so the texture tiles without seams.
  for (let i = 0; i < 4; i++) {
    const x0 = rnd() * size,
      y0 = rnd() * size,
      r = 120 + rnd() * 220;
    const hue = [200, 260, 170, 300][i];
    for (const ox of [-size, 0, size])
      for (const oy of [-size, 0, size]) {
        const x = x0 + ox,
          y = y0 + oy;
        const ng = g.createRadialGradient(x, y, 0, x, y, r);
        ng.addColorStop(0, `hsla(${hue},70%,45%,0.10)`);
        ng.addColorStop(1, "hsla(0,0%,0%,0)");
        g.fillStyle = ng;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
  }
  for (let i = 0; i < density; i++) {
    const b = rnd();
    g.fillStyle = `rgba(${200 + rnd() * 55},${210 + rnd() * 45},255,${0.25 + b * 0.75})`;
    const s = b > 0.97 ? 2.2 : b > 0.85 ? 1.5 : 1;
    g.fillRect(rnd() * (size - 3), rnd() * (size - 3), s, s);
  }
  return c;
}

/** Value noise whose x axis wraps with the given integer period (seamless in longitude). */
function makeNoise(seed: number) {
  const rnd = mulberry(seed);
  const N = 256;
  const grid = new Float32Array(N * N).map(() => rnd());
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number, period: number) => {
    const xi = Math.floor(x),
      yi = Math.floor(y);
    const xf = smooth(x - xi),
      yf = smooth(y - yi);
    const X0 = ((xi % period) + period) % period;
    const X1 = (X0 + 1) % period;
    const Y0 = ((yi % N) + N) % N;
    const Y1 = (Y0 + 1) % N;
    const a = grid[Y0 * N + X0],
      b = grid[Y0 * N + X1],
      c = grid[Y1 * N + X0],
      d = grid[Y1 * N + X1];
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}

/** Equirectangular Earth-like map (seamless in longitude) sampled by the globe renderer. */
export function drawEarthMap(w = 768, h = 384): HTMLCanvasElement {
  const { c, g } = canvas(w, h);
  const noise = makeNoise(42);
  const cloudN = makeNoise(77);
  const fbm = (n: typeof noise, u: number, v: number, base: number, oct: number) => {
    let sum = 0,
      amp = 0.5,
      norm = 0;
    for (let o = 0; o < oct; o++) {
      const f = base * 2 ** o;
      sum += n(u * f, v * f * 0.5, f) * amp;
      norm += amp;
      amp *= 0.5;
    }
    return sum / norm;
  };
  const img = g.createImageData(w, h);
  const D = img.data;
  for (let y = 0; y < h; y++) {
    const v = y / h;
    const lat = (v - 0.5) * Math.PI;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const n = fbm(noise, u, v, 6, 5) - Math.abs(lat) * 0.04;
      const i = (y * w + x) * 4;
      let r: number, gg: number, b: number;
      if (n > 0.53) {
        const t = Math.min(1, (n - 0.53) * 5);
        const arid = fbm(noise, u + 0.37, v, 4, 3);
        // deserts favour the subtropics but blend smoothly with latitude
        const dry = arid > 0.5 + Math.abs(Math.abs(lat) - 0.42) * 0.55;
        r = dry ? 196 - t * 40 : 62 + t * 46;
        gg = dry ? 164 - t * 40 : 128 - t * 18;
        b = dry ? 104 - t * 20 : 70;
      } else {
        const d = Math.min(1, (0.53 - n) * 4);
        r = 26 - d * 14;
        gg = 96 - d * 42;
        b = 176 - d * 46;
      }
      // ragged polar ice
      const iceEdge = 1.17 + (fbm(noise, u + 0.11, v, 8, 3) - 0.5) * 0.35;
      if (Math.abs(lat) > iceEdge) {
        r = 232;
        gg = 240;
        b = 250;
      }
      const cl = fbm(cloudN, u, v, 5, 5);
      if (cl > 0.55) {
        const a = Math.min(0.88, (cl - 0.55) * 3.2);
        r = r * (1 - a) + 255 * a;
        gg = gg * (1 - a) + 255 * a;
        b = b * (1 - a) + 255 * a;
      }
      D[i] = r;
      D[i + 1] = gg;
      D[i + 2] = b;
      D[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

// ---------------------------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------------------------

export function astronautKey(id: string) {
  return `astro-${id}`;
}

export function registerTextures(scene: Phaser.Scene) {
  const tm = scene.textures;
  const add = (key: string, cv: HTMLCanvasElement) => {
    if (!tm.exists(key)) tm.addCanvas(key, cv);
  };
  add("tileset", buildTileset());
  add("glow", drawGlow());
  add("door", drawDoorPanel());
  add("door-v", drawDoorPanelV());
  add("platform-top", drawPlatformTop(160));
  add("stars", drawStarfield(1024, 7, 520));
  add("stars-far", drawStarfield(1024, 19, 260));

  for (const a of ASTRONAUTS) {
    const key = astronautKey(a.id);
    if (tm.exists(key)) continue;
    const tex = tm.addCanvas(key, buildAstronautSheet(a));
    if (!tex) continue;
    for (let r = 0; r < SHEET_ROWS; r++)
      for (let col = 0; col < SHEET_COLS; col++) tex.add(r * SHEET_COLS + col, 0, col * CELL, r * CELL, CELL, CELL);
  }
}

export function ensurePropTexture(scene: Phaser.Scene, kind: PropKind, w: number, h: number) {
  const key = propKey(kind, w, h);
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, drawProp(kind, w, h));
  return key;
}

export function ensureConsoleTextures(scene: Phaser.Scene, accent: string, wide = false) {
  const k = `console-${accent}-${wide ? "w" : "n"}`;
  if (!scene.textures.exists(k)) scene.textures.addCanvas(k, drawConsole(accent, wide));
  if (!scene.textures.exists(k + "-scr")) scene.textures.addCanvas(k + "-scr", drawConsoleScreen(accent, wide));
  return { body: k, screen: k + "-scr" };
}
