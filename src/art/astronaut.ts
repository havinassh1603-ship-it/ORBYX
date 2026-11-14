/**
 * ORBYX astronaut — original procedural character art.
 * Chibi proportions: a large round helmet with a glossy visor, a compact suit with a chest
 * panel in the astronaut's accent colour, a life-support backpack, chunky boots and a helmet
 * antenna with a status light. Drawn in a 64 x 64 design space and scaled.
 */

export type Facing = "down" | "up" | "side";

export interface AstroColors {
  suit: string;
  accent: string;
  visor: string;
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  const t = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  r = Math.round((t - r) * p + r);
  g = Math.round((t - g) * p + g);
  b = Math.round((t - b) * p + b);
  return `rgb(${r},${g},${b})`;
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Draw one astronaut frame.
 * @param ox,oy top-left of the 64x64 design cell (after scale)
 * @param frame walk frame 0..3, or -1 for idle
 * @param t seconds, used for idle breathing and the antenna light
 */
export function drawAstronaut(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  scale: number,
  facing: Facing,
  frame: number,
  c: AstroColors,
  t = 0,
  outline = "#0B1220",
) {
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  const walking = frame >= 0;
  const legA = walking ? [3, 0, -3, 0][frame % 4] : 0;
  const bob = walking ? [0, -1.2, 0, -1.2][frame % 4] : Math.sin(t * 2.4) * 0.6;
  const armSwing = walking ? [-3, 0, 3, 0][frame % 4] : 0;

  const suitHi = shade(c.suit, 0.25);
  const suitLo = shade(c.suit, -0.22);
  const suitDeep = shade(c.suit, -0.38);
  const lw = 1.6;

  // Ground shadow
  ctx.fillStyle = "rgba(4,8,18,0.35)";
  ctx.beginPath();
  ctx.ellipse(32, 60, 13, 3.2, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.translate(0, bob);

  // ---- Legs and boots
  const drawLeg = (x: number, dy: number) => {
    ctx.fillStyle = suitLo;
    rr(ctx, x - 4, 47 + dy * 0.3, 8, 9, 3);
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = lw;
    ctx.stroke();
    ctx.fillStyle = "#3A4558";
    rr(ctx, x - 5, 54 + dy * 0.3, 10, 5, 2.5);
    ctx.fill();
    ctx.stroke();
  };
  if (facing === "side") {
    drawLeg(29 - legA, legA);
    drawLeg(35 + legA, -legA);
  } else {
    drawLeg(26, legA);
    drawLeg(38, -legA);
  }

  // ---- Backpack (behind body unless facing up)
  const drawPack = (x: number, w: number) => {
    ctx.fillStyle = suitDeep;
    rr(ctx, x, 31, w, 17, 4);
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = lw;
    ctx.stroke();
  };
  if (facing === "down") drawPack(19, 26);
  if (facing === "side") drawPack(14, 10);

  // ---- Arms (back arm first)
  const drawArm = (x: number, y: number, swing: number) => {
    ctx.fillStyle = suitLo;
    rr(ctx, x - 3.5, y + swing * 0.4, 7, 13, 3.5);
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = lw;
    ctx.stroke();
    ctx.fillStyle = shade(c.accent, -0.1);
    ctx.beginPath();
    ctx.arc(x, y + 12.5 + swing * 0.4, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  };
  if (facing === "side") drawArm(27, 35, -armSwing);
  else {
    drawArm(18.5, 35, armSwing);
    drawArm(45.5, 35, -armSwing);
  }

  // ---- Torso
  const tg = ctx.createLinearGradient(20, 32, 44, 50);
  tg.addColorStop(0, suitHi);
  tg.addColorStop(1, suitLo);
  ctx.fillStyle = tg;
  rr(ctx, 21, 32, 22, 18, 7);
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = lw;
  ctx.stroke();

  if (facing === "down") {
    // chest panel
    ctx.fillStyle = "#1A2335";
    rr(ctx, 27, 37, 10, 7, 2);
    ctx.fill();
    ctx.fillStyle = c.accent;
    ctx.fillRect(28.5, 38.5, 3, 1.6);
    ctx.fillStyle = "#7CF2D8";
    ctx.fillRect(32.5, 38.5, 3, 1.6);
    ctx.fillStyle = shade(c.accent, 0.3);
    ctx.fillRect(28.5, 41.3, 7, 1.4);
    // belt
    ctx.fillStyle = c.accent;
    ctx.fillRect(21.8, 46, 20.4, 2);
  } else if (facing === "up") {
    // backpack seen from behind
    ctx.fillStyle = suitDeep;
    rr(ctx, 23, 31, 18, 17, 4);
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.stroke();
    ctx.fillStyle = c.accent;
    rr(ctx, 27, 35, 10, 3, 1.5);
    ctx.fill();
    ctx.fillStyle = "#7CF2D8";
    ctx.beginPath();
    ctx.arc(32, 43, 1.8, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = c.accent;
    ctx.fillRect(22, 46, 20, 2);
    ctx.fillStyle = "#1A2335";
    rr(ctx, 33, 37, 7, 6, 2);
    ctx.fill();
  }

  if (facing === "side") drawArm(37, 35, armSwing);

  // ---- Helmet
  const hx = facing === "side" ? 33 : 32;
  const hy = 20;
  const hr = 15.5;
  // collar ring
  ctx.fillStyle = c.accent;
  rr(ctx, 22, 31, 20, 4.5, 2.2);
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = lw;
  ctx.stroke();

  // antenna
  const ax = facing === "side" ? hx - 7 : hx - 9;
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(ax, hy - 11);
  ctx.lineTo(ax - 3, hy - 19);
  ctx.stroke();
  const blink = 0.55 + 0.45 * Math.max(0, Math.sin(t * 3.1));
  ctx.fillStyle = c.accent;
  ctx.globalAlpha = blink;
  ctx.beginPath();
  ctx.arc(ax - 3, hy - 20, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  const hg = ctx.createRadialGradient(hx - 5, hy - 6, 2, hx, hy, hr);
  hg.addColorStop(0, "#FFFFFF");
  hg.addColorStop(0.55, suitHi);
  hg.addColorStop(1, suitLo);
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.arc(hx, hy, hr, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = lw;
  ctx.stroke();

  if (facing !== "up") {
    // visor
    const vx = facing === "side" ? hx + 4 : hx;
    const vw = facing === "side" ? 9.5 : 11.5;
    const vg = ctx.createLinearGradient(vx - vw, hy - 7, vx + vw, hy + 7);
    vg.addColorStop(0, shade(c.visor, 0.18));
    vg.addColorStop(1, c.visor);
    ctx.fillStyle = vg;
    ctx.beginPath();
    ctx.ellipse(vx, hy + 1, vw, 8.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.3;
    ctx.stroke();
    // reflections
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.ellipse(vx - vw * 0.42, hy - 2.6, 3.1, 1.7, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(124,242,216,0.55)";
    ctx.beginPath();
    ctx.ellipse(vx + vw * 0.35, hy + 4, 3.6, 1.1, -0.3, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // rear helmet detail
    ctx.fillStyle = suitLo;
    rr(ctx, hx - 6, hy + 2, 12, 5, 2.5);
    ctx.fill();
  }
  // helmet rim highlight
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(hx, hy, hr - 3, Math.PI * 1.1, Math.PI * 1.45);
  ctx.stroke();

  ctx.restore();
}

/** Spritesheet layout: rows down/up/side, columns walk 0..3 then idle. 64 px cells. */
export const SHEET_COLS = 5;
export const SHEET_ROWS = 3;
export const CELL = 64;
export const FACINGS: Facing[] = ["down", "up", "side"];

export function buildAstronautSheet(c: AstroColors): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = CELL * SHEET_COLS;
  cv.height = CELL * SHEET_ROWS;
  const ctx = cv.getContext("2d")!;
  FACINGS.forEach((f, row) => {
    for (let col = 0; col < SHEET_COLS; col++) {
      const frame = col < 4 ? col : -1;
      drawAstronaut(ctx, col * CELL, row * CELL, 1, f, frame, c, 0.4);
    }
  });
  return cv;
}
