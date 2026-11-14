import Phaser from "phaser";
import { drawEarthMap } from "./textures";

/**
 * Rotating orthographic globe rendered per-pixel into a small canvas texture.
 * The per-pixel latitude/longitude and lighting are precomputed once; each frame only samples
 * the equirectangular map at a shifted longitude, so it stays cheap (about 50k lookups).
 */
let MAP: { data: Uint8ClampedArray; w: number; h: number } | null = null;

function earthMap() {
  if (!MAP) {
    const cv = drawEarthMap(768, 384);
    const d = cv.getContext("2d")!.getImageData(0, 0, cv.width, cv.height).data;
    MAP = { data: d, w: cv.width, h: cv.height };
  }
  return MAP;
}

let MOON: { data: Uint8ClampedArray; w: number; h: number } | null = null;
/** Procedural equirectangular Moon: grey highlands, dark maria, craters with bright rims */
function moonMap() {
  if (!MOON) {
    const w = 512,
      h = 256;
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    const g = cv.getContext("2d")!;
    g.fillStyle = "#9b9a96";
    g.fillRect(0, 0, w, h);
    let seed = 1337;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const blob = (cx: number, cy: number, r: number, col: string) => {
      for (const dx of [-w, 0, w]) {
        g.fillStyle = col;
        g.beginPath();
        g.ellipse(cx + dx, cy, r * 1.6, r, 0, 0, Math.PI * 2);
        g.fill();
      }
    };
    // maria (concentrated on one hemisphere, like the near side)
    const maria: Array<[number, number, number]> = [
      [0.18, 0.38, 26], [0.24, 0.47, 22], [0.12, 0.5, 18], [0.3, 0.36, 16], [0.2, 0.6, 14], [0.08, 0.36, 20], [0.33, 0.55, 12], [0.9, 0.45, 12],
    ];
    for (const [u, v, r] of maria) blob(u * w, v * h, r, "rgba(70,72,78,0.85)");
    for (let i = 0; i < 260; i++) {
      const x = rnd() * w,
        y = 10 + rnd() * (h - 20),
        r = 1 + Math.pow(rnd(), 3) * 12;
      g.fillStyle = "rgba(60,60,64,0.45)";
      g.beginPath();
      g.ellipse(x, y, r * 1.4, r, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "rgba(220,220,214,0.35)";
      g.lineWidth = Math.max(0.6, r * 0.18);
      g.beginPath();
      g.ellipse(x - r * 0.15, y - r * 0.15, r * 1.4, r, 0, Math.PI * 0.9, Math.PI * 1.9);
      g.stroke();
    }
    const d = g.getImageData(0, 0, w, h).data;
    MOON = { data: d, w, h };
  }
  return MOON;
}
let counter = 0;

export class Globe {
  readonly key: string;
  readonly image: Phaser.GameObjects.Image;
  private tex: Phaser.Textures.CanvasTexture;
  private size: number;
  private lon: Float32Array;
  private latRow: Int32Array;
  private light: Float32Array;
  private rim: Float32Array;
  private inside: Uint8Array;
  private edge: Float32Array;
  rotation = 0;

  private surface: "earth" | "moon";
  constructor(scene: Phaser.Scene, x: number, y: number, diameter: number, res = 256, tiltDeg = 18, surface: "earth" | "moon" = "earth") {
    this.surface = surface;
    this.size = res;
    this.key = `globe-${++counter}`;
    this.tex = scene.textures.createCanvas(this.key, res, res)!;
    this.image = scene.add.image(x, y, this.key).setDisplaySize(diameter, diameter);
    const n = res * res;
    this.lon = new Float32Array(n);
    this.latRow = new Int32Array(n);
    this.light = new Float32Array(n);
    this.rim = new Float32Array(n);
    this.inside = new Uint8Array(n);
    this.edge = new Float32Array(n);
    const map = surface === "moon" ? moonMap() : earthMap();
    const tilt = (tiltDeg * Math.PI) / 180;
    // sun from upper-left-front
    const sx = -0.55,
      sy = -0.35,
      sz = 0.76;
    for (let j = 0; j < res; j++)
      for (let i = 0; i < res; i++) {
        const k = j * res + i;
        const px = (i + 0.5) / res * 2 - 1;
        const py = (j + 0.5) / res * 2 - 1;
        const r2 = px * px + py * py;
        if (r2 > 1) continue;
        this.inside[k] = 1;
        // fade the outermost pixel ring for a smooth silhouette
        this.edge[k] = Math.min(1, (1 - Math.sqrt(r2)) * res * 0.5);
        const pz = Math.sqrt(1 - r2);
        // undo axial tilt (rotate around view x-axis)
        const y2 = py * Math.cos(tilt) - pz * Math.sin(tilt);
        const z2 = py * Math.sin(tilt) + pz * Math.cos(tilt);
        const lat = Math.asin(-y2);
        const lon = Math.atan2(px, z2);
        this.lon[k] = lon / (2 * Math.PI);
        this.latRow[k] = Math.min(map.h - 1, Math.max(0, Math.floor((0.5 - lat / Math.PI) * map.h)));
        const ndl = px * sx + py * sy + pz * sz;
        this.light[k] = Math.max(0.06, Math.min(1, ndl * 1.15 + 0.12));
        this.rim[k] = Math.pow(1 - pz, 3);
      }
  }

  setPosition(x: number, y: number, diameter: number) {
    this.image.setPosition(x, y).setDisplaySize(diameter, diameter);
  }

  render() {
    const map = this.surface === "moon" ? moonMap() : earthMap();
    const air = this.surface === "earth" ? 1 : 0;
    const ctx = this.tex.getContext();
    const img = ctx.createImageData(this.size, this.size);
    const out = img.data;
    const rot = this.rotation;
    const n = this.size * this.size;
    for (let k = 0; k < n; k++) {
      if (!this.inside[k]) continue;
      let u = this.lon[k] + rot;
      u -= Math.floor(u);
      const mx = Math.floor(u * map.w) % map.w;
      const mi = (this.latRow[k] * map.w + mx) * 4;
      const l = this.light[k];
      const rim = this.rim[k] * air;
      const o = k * 4;
      // lit surface plus blue atmospheric scattering toward the limb
      out[o] = map.data[mi] * l * (1 - rim * 0.6) + 90 * rim;
      out[o + 1] = map.data[mi + 1] * l * (1 - rim * 0.6) + 160 * rim;
      out[o + 2] = map.data[mi + 2] * l * (1 - rim * 0.5) + 255 * rim;
      out[o + 3] = 255 * this.edge[k];
    }
    ctx.putImageData(img, 0, 0);
    this.tex.refresh();
  }

  destroy() {
    this.image.destroy();
    this.tex.destroy();
  }
}

/** Soft atmosphere halo drawn behind the globe */
export function drawHalo(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number) {
  g.clear();
  for (let i = 0; i < 16; i++) {
    g.fillStyle(0x4aa8ff, 0.028);
    g.fillCircle(x, y, r * (1.0 + i * 0.012));
  }
}
