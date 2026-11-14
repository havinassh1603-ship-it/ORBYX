import Phaser from "phaser";
import type { LunarCinematic } from "../missions/registry";
import type { Outcome } from "../sim/types";
import { bus } from "../bus";
import { sfx } from "../audio/sfx";
import { registerTextures } from "./textures";
import { Globe, drawHalo } from "./globe";

interface CineData {
  info: LunarCinematic;
  outcome: Outcome;
  reducedMotion: boolean;
}

/**
 * Lunar mission cinematic, driven by the evaluated design:
 *   scrub      - the stack is too heavy, launch is cancelled on the pad
 *   leo        - trans-lunar injection runs out of propellant, Selene stays in Earth orbit
 *   freeReturn - Selene coasts around the Moon on the free-return figure-eight and comes home
 *   orbit      - insertion, survey passes over the Apollo basin, downlinks, return and splashdown
 */
export class LunarCinematicScene extends Phaser.Scene {
  private d!: CineData;
  private caption!: Phaser.GameObjects.Text;
  private sub!: Phaser.GameObjects.Text;
  private finished = false;
  private globes: Globe[] = [];

  constructor() {
    super("cinematic-lunar");
  }

  init(d: CineData) {
    this.d = d;
    this.finished = false;
    this.globes = [];
  }

  create() {
    registerTextures(this);
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor("#04070F");
    this.add.tileSprite(0, 0, width, height, "stars").setOrigin(0).setAlpha(0.6);
    this.caption = this.add
      .text(width / 2, height - 92, "", { fontFamily: "Space Grotesk, sans-serif", fontSize: "26px", color: "#E8F4FF", fontStyle: "bold" })
      .setOrigin(0.5)
      .setDepth(100);
    this.sub = this.add
      .text(width / 2, height - 58, "", { fontFamily: "Inter, sans-serif", fontSize: "16px", color: "#9FB3D9" })
      .setOrigin(0.5)
      .setDepth(100);
    this.add
      .text(width - 24, 22, "Space / Enter / click to skip", { fontFamily: "Inter, sans-serif", fontSize: "13px", color: "#6E7FA3" })
      .setOrigin(1, 0)
      .setDepth(100);
    const skip = () => this.finish();
    this.input.once("pointerdown", skip);
    this.input.keyboard?.once("keydown-SPACE", skip);
    this.input.keyboard?.once("keydown-ENTER", skip);
    this.input.keyboard?.once("keydown-ESC", skip);
    this.events.once("shutdown", () => {
      for (const g of this.globes) g.destroy();
      this.globes = [];
    });
    const st = this.d.info.stage;
    if (st === "scrub") this.scrubAct();
    else this.parkingAct();
  }

  private say(title: string, sub = "") {
    this.caption.setText(title);
    this.sub.setText(sub);
    this.caption.setAlpha(0);
    this.sub.setAlpha(0);
    this.tweens.add({ targets: [this.caption, this.sub], alpha: 1, duration: 300 });
  }

  private wait(ms: number, fn: () => void) {
    this.time.delayedCall(this.d.reducedMotion ? Math.min(ms, 900) : ms, fn);
  }

  /** Small Selene sprite: crew module, service module, arrays */
  private ship(scale = 1): Phaser.GameObjects.Container {
    const c = this.add.container(0, 0);
    const arrL = this.add.rectangle(-22, 0, 26, 8, 0x3b5bd6).setStrokeStyle(1.5, 0x0b1220);
    const arrR = this.add.rectangle(22, 0, 26, 8, 0x3b5bd6).setStrokeStyle(1.5, 0x0b1220);
    const sm = this.add.rectangle(0, 4, 12, 16, 0xdfe6f0).setStrokeStyle(1.5, 0x0b1220);
    const cm = this.add.triangle(0, -10, -7, 6, 7, 6, 0, -8, 0xf2f5fa).setStrokeStyle(1.5, 0x0b1220);
    const flame = this.add.image(0, 18, "glow").setTint(0xffb020).setScale(0.18, 0.32).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    c.add([flame, arrL, arrR, sm, cm]);
    c.setData("flame", flame);
    c.setScale(scale);
    return c;
  }

  private burn(ship: Phaser.GameObjects.Container, ms: number, sputter = false) {
    const flame = ship.getData("flame") as Phaser.GameObjects.Image;
    flame.setVisible(true);
    sfx.play("launch");
    if (sputter) this.tweens.add({ targets: flame, alpha: 0.1, duration: 140, yoyo: true, repeat: Math.floor(ms / 280) });
    else this.tweens.add({ targets: flame, scaleY: 0.45, duration: 90, yoyo: true, repeat: Math.floor(ms / 180) });
    this.wait(ms, () => flame.setVisible(false));
  }

  // -------------------------------------------------------------------------------------------
  private scrubAct() {
    const { width, height } = this.scale;
    const sky = this.add.graphics();
    sky.fillGradientStyle(0x0a1a3a, 0x0a1a3a, 0x1d3a6a, 0x1d3a6a, 1);
    sky.fillRect(0, 0, width, height);
    this.add.rectangle(width / 2, height - 40, width, 120, 0x141a24);
    this.add.rectangle(width / 2 + 60, height - 260, 20, 360, 0x3a4558).setStrokeStyle(2, 0x0b1220);
    const rocket = this.add.container(width / 2, height - 150);
    rocket.add([
      this.add.rectangle(0, -90, 46, 230, 0xf2f5fa).setStrokeStyle(2, 0x0b1220),
      this.add.rectangle(-34, -40, 18, 140, 0xdfe6f0).setStrokeStyle(2, 0x0b1220),
      this.add.rectangle(34, -40, 18, 140, 0xdfe6f0).setStrokeStyle(2, 0x0b1220),
      this.add.triangle(0, -220, -23, 15, 23, 15, 0, -30, 0xf2f5fa).setStrokeStyle(2, 0x0b1220),
      this.add.rectangle(0, -150, 46, 10, 0x2ee6c5),
    ]);
    const lamp = this.add.circle(width / 2 + 60, height - 430, 8, 0xff5a5a);
    this.tweens.add({ targets: lamp, alpha: 0.2, duration: 400, yoyo: true, repeat: -1 });
    this.say("Launch readiness review", "Weighing the fuelled stack");
    this.wait(2200, () => this.say("Launch scrubbed", "The fuelled stack is heavier than the launcher can lift"));
    this.wait(4400, () => {
      sky.setAlpha(0.6);
      this.say("Selene stays on the ground", "Lighten the stack or carry less propellant");
    });
    this.wait(6600, () => this.finish());
    void rocket;
  }

  // -------------------------------------------------------------------------------------------
  private parkingAct() {
    const { width, height } = this.scale;
    const R = Math.min(width, height) * 0.26;
    const ex = width * 0.5;
    const ey = height * 0.48;
    const halo = this.add.graphics();
    drawHalo(halo, ex, ey, R);
    const earth = new Globe(this, ex, ey, R * 2, 220, 18, "earth");
    this.globes.push(earth);
    const ship = this.ship(1.1);
    const st = { th: -1.2 };
    const orbitR = R * 1.18;
    const tick = () => {
      earth.rotation += 0.0009;
      earth.render();
      const x = ex + Math.cos(st.th) * orbitR;
      const y = ey + Math.sin(st.th) * orbitR * 0.42;
      ship.setPosition(x, y).setRotation(st.th + Math.PI);
      ship.setDepth(Math.sin(st.th) > -0.05 ? 10 : -1);
    };
    this.events.on("update", tick);
    this.tweens.add({ targets: st, th: st.th + Math.PI * 1.6, duration: this.d.reducedMotion ? 600 : 4200, ease: "Linear" });
    this.say("Earth parking orbit", "400 km, systems configured, crew ready");
    const leo = this.d.info.stage === "leo";
    this.wait(2200, () => {
      this.say("Trans-lunar injection", leo ? "3.15 km/s burn under way" : "Main engine burn: 3.15 km/s");
      this.burn(ship, 1800, leo);
    });
    if (leo) {
      this.wait(4200, () => this.say("Propellant depleted", "The burn ended short: Selene cannot reach the Moon"));
      this.wait(6600, () => {
        this.say("Mission aborted in Earth orbit", "The crew returns home without leaving low Earth orbit");
      });
      this.wait(8800, () => {
        this.events.off("update", tick);
        this.finish();
      });
      return;
    }
    this.wait(4300, () => {
      this.cameras.main.fadeOut(350, 4, 7, 15);
      this.wait(380, () => {
        this.events.off("update", tick);
        earth.destroy();
        this.globes = this.globes.filter((g) => g !== earth);
        halo.destroy();
        ship.destroy();
        this.cameras.main.fadeIn(350, 4, 7, 15);
        this.coastAct();
      });
    });
  }

  // -------------------------------------------------------------------------------------------
  private coastAct() {
    const { width, height } = this.scale;
    const ex = width * 0.16;
    const ey = height * 0.46;
    const mx = width * 0.82;
    const my = height * 0.42;
    const halo = this.add.graphics();
    drawHalo(halo, ex, ey, 46);
    const earth = new Globe(this, ex, ey, 92, 128, 18, "earth");
    const moon = new Globe(this, mx, my, 70, 128, 6, "moon");
    this.globes.push(earth, moon);
    const free = this.d.info.stage === "freeReturn";
    // Trajectory: out along the lower arc, around the far side of the Moon, back along the upper arc
    const pts: Phaser.Math.Vector2[] = [];
    const N = 120;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      // outbound
      const x = Phaser.Math.Linear(ex + 50, mx - 10, t);
      const y = ey + 10 + Math.sin(t * Math.PI) * 70 - (my - ey) * t;
      pts.push(new Phaser.Math.Vector2(x, y));
    }
    const around: Phaser.Math.Vector2[] = [];
    for (let i = 0; i <= 40; i++) {
      const a = Math.PI * 0.75 - (i / 40) * Math.PI * 1.5;
      around.push(new Phaser.Math.Vector2(mx + Math.cos(a + Math.PI) * -60, my + Math.sin(a + Math.PI) * 60));
    }
    const back: Phaser.Math.Vector2[] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const x = Phaser.Math.Linear(mx - 10, ex + 50, t);
      const y = my - 10 - Math.sin(t * Math.PI) * 70 + (ey - my) * t;
      back.push(new Phaser.Math.Vector2(x, y));
    }
    const path = free ? [...pts, ...around, ...back] : pts;
    const trail = this.add.graphics();
    trail.lineStyle(2, 0x2ee6c5, 0.5);
    const dots = this.add.graphics();
    dots.fillStyle(0x6e7fa3, 0.6);
    for (let i = 0; i < path.length; i += 4) dots.fillCircle(path[i].x, path[i].y, 1.5);
    const ship = this.ship(0.7);
    const st = { i: 0 };
    const tick = () => {
      earth.rotation += 0.002;
      earth.render();
      moon.rotation += 0.0006;
      moon.render();
      const k = Math.min(path.length - 1, Math.floor(st.i));
      const p = path[k];
      const q = path[Math.min(path.length - 1, k + 1)];
      ship.setPosition(p.x, p.y).setRotation(Math.atan2(q.y - p.y, q.x - p.x) + Math.PI / 2);
      trail.clear();
      trail.lineStyle(2, 0x2ee6c5, 0.7);
      trail.beginPath();
      trail.moveTo(path[0].x, path[0].y);
      for (let j = 1; j <= k; j++) trail.lineTo(path[j].x, path[j].y);
      trail.strokePath();
    };
    this.events.on("update", tick);
    const dur = free ? 7600 : 3600;
    this.tweens.add({ targets: st, i: path.length - 1, duration: this.d.reducedMotion ? 900 : dur, ease: "Sine.inOut" });
    this.say("Translunar coast", "3.5 days to the Moon on a free-return trajectory");
    const cleanup = () => {
      this.events.off("update", tick);
      for (const g of [earth, moon]) g.destroy();
      this.globes = this.globes.filter((g) => g !== earth && g !== moon);
      [halo, trail, dots, ship].forEach((o) => o.destroy());
    };
    if (free) {
      this.wait(2600, () => this.say("No-go for lunar orbit insertion", "Not enough propellant to guarantee the return burn"));
      this.wait(5000, () => this.say("Free-return flyby", "Selene swings around the far side and heads home"));
      this.wait(8200, () => this.say("Splashdown", "The crew is safe; no survey was flown"));
      this.wait(10_200, () => {
        cleanup();
        this.finish();
      });
      return;
    }
    this.wait(3700, () => {
      this.cameras.main.fadeOut(350, 4, 7, 15);
      this.wait(380, () => {
        cleanup();
        this.cameras.main.fadeIn(350, 4, 7, 15);
        this.lunarOrbitAct();
      });
    });
  }

  // -------------------------------------------------------------------------------------------
  private lunarOrbitAct() {
    const { width, height } = this.scale;
    const info = this.d.info;
    const R = Math.min(width, height) * 0.27;
    const mx = width * 0.5;
    const my = height * 0.47;
    const moon = new Globe(this, mx, my, R * 2, 240, 8, "moon");
    this.globes.push(moon);
    const earthHalo = this.add.graphics();
    drawHalo(earthHalo, width * 0.88, height * 0.16, 30);
    const earth = new Globe(this, width * 0.88, height * 0.16, 60, 96, 18, "earth");
    this.globes.push(earth);
    const nrho = info.orbitKind === "nrho";
    const a = nrho ? R * 2.1 : R * (1.06 + info.surveyAltKm / 2000);
    const b = nrho ? R * 0.55 : a * 0.38;
    const cx = nrho ? mx + R * 1.0 : mx;
    const orbitG = this.add.graphics();
    orbitG.lineStyle(1.5, 0x2ee6c5, 0.35);
    orbitG.strokeEllipse(cx, my, a * 2, b * 2);
    const site = this.add.circle(mx + R * 0.15, my + R * 0.42, 6, 0xffb020).setStrokeStyle(2, 0x0b1220);
    this.tweens.add({ targets: site, scale: 1.5, duration: 600, yoyo: true, repeat: -1 });
    const beams = this.add.graphics();
    const ship = this.ship(0.8);
    const st = { th: Math.PI };
    const lostEvery = info.dataFrac >= 0.95 ? 0 : Math.max(1, Math.round(1 / Math.max(0.05, 1 - info.dataFrac)));
    let pass = 0;
    const tick = () => {
      moon.rotation += 0.0012;
      moon.render();
      earth.rotation += 0.002;
      earth.render();
      const x = cx + Math.cos(st.th) * a;
      const y = my + Math.sin(st.th) * b;
      ship.setPosition(x, y).setRotation(st.th);
      const front = Math.sin(st.th) > 0 || Math.hypot(x - mx, y - my) > R;
      ship.setVisible(front);
      beams.clear();
      const phase = (((st.th % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2);
      const p = Math.floor(st.th / (Math.PI * 2));
      if (p !== pass) pass = p;
      if (front && phase > 0.12 && phase < 0.38 && info.surveyFrac > 0) {
        beams.fillStyle(0xffd27a, nrho ? 0.08 : 0.25);
        beams.fillTriangle(x, y, site.x - 12, site.y + 4, site.x + 12, site.y + 4);
      }
      if (front && phase > 0.6 && phase < 0.85) {
        const lost = lostEvery > 0 && (pass + 1) % lostEvery === 0;
        beams.lineStyle(2.5, lost ? 0xff5a5a : 0xb6f36b, 0.85);
        beams.lineBetween(x, y, earth.image.x, earth.image.y);
      }
    };
    this.events.on("update", tick);
    const orbits = nrho ? 1.4 : 3.2;
    const total = this.d.reducedMotion ? 1200 : 7600;
    this.say("Lunar orbit insertion", nrho ? "Near-rectilinear halo orbit" : `${info.surveyAltKm} km polar orbit`);
    sfx.play("launch");
    this.cameras.main.flash(250, 255, 200, 120);
    this.tweens.add({ targets: st, th: st.th + Math.PI * 2 * orbits, duration: total, ease: "Linear" });
    const pct = Math.round(info.surveyFrac * 100);
    this.wait(total * 0.33, () =>
      this.say(
        "Surveying the Apollo basin",
        info.surveyFrac >= 0.8 ? `${pct}% of the landing region mapped at full resolution` : info.surveyFrac > 0 ? `Only ${pct}% of the region usable` : "The imagery is too coarse to certify a landing site",
      ),
    );
    this.wait(total * 0.66, () =>
      this.say("Downlink to Earth", info.recorderSummary),
    );
    this.wait(total + 200, () => {
      this.say("Trans-Earth injection", "Main engine burn for home");
      ship.setVisible(true);
      this.burn(ship, 1400);
      this.tweens.add({ targets: ship, x: width * 0.88, y: height * 0.16, scale: 0.2, duration: this.d.reducedMotion ? 400 : 2400, ease: "Quad.in" });
    });
    this.wait(total + 2800, () => {
      this.events.off("update", tick);
      this.say(
        "Splashdown",
        info.thinReturn ? `Home with only ${Math.max(0, Math.round(info.reserveMps))} m/s to spare` : `Crew home safely with ${Math.round(info.reserveMps)} m/s in reserve`,
      );
      this.cameras.main.flash(300, 200, 230, 255);
    });
    this.wait(total + 5000, () => this.finish());
  }

  private finish() {
    if (this.finished) return;
    this.finished = true;
    this.cameras.main.fadeOut(300, 4, 7, 15);
    this.time.delayedCall(320, () => bus.emit("cinematic:done"));
  }
}
