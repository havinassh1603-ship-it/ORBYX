import Phaser from "phaser";
import type { EarthwatchCinematic } from "../missions/registry";
import type { Outcome } from "../sim/types";
import { bus } from "../bus";
import { sfx } from "../audio/sfx";
import { registerTextures } from "./textures";
import { Globe, drawHalo } from "./globe";

interface CineData {
  info: EarthwatchCinematic;
  outcome: Outcome;
  reducedMotion: boolean;
}

/**
 * Short mission cinematic driven by the evaluated design:
 *   Act 1: launch (fails to reach orbit if the spacecraft is too heavy)
 *   Act 2: orbit, imaging passes over the target and downlinks to ground stations;
 *          lost downlinks are drawn in red in proportion to the data that could not be returned.
 */
export class CinematicScene extends Phaser.Scene {
  private d!: CineData;
  private caption!: Phaser.GameObjects.Text;
  private sub!: Phaser.GameObjects.Text;
  private finished = false;

  constructor() {
    super("cinematic");
  }

  init(d: CineData) {
    this.d = d;
    this.finished = false;
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

    if (this.d.reducedMotion) {
      this.orbitAct(0);
      return;
    }
    this.launchAct();
  }

  private say(title: string, sub = "") {
    this.caption.setText(title);
    this.sub.setText(sub);
    this.caption.setAlpha(0);
    this.sub.setAlpha(0);
    this.tweens.add({ targets: [this.caption, this.sub], alpha: 1, duration: 300 });
  }

  private launchAct() {
    const { width, height } = this.scale;
    const layer = this.add.container(0, 0);
    const sky = this.add.graphics();
    sky.fillGradientStyle(0x0a1a3a, 0x0a1a3a, 0x1d3a6a, 0x1d3a6a, 1);
    sky.fillRect(0, 0, width, height);
    const ground = this.add.rectangle(width / 2, height - 40, width, 120, 0x141a24);
    const tower = this.add.rectangle(width / 2 + 52, height - 230, 18, 300, 0x3a4558).setStrokeStyle(2, 0x0b1220);
    layer.add([sky, ground, tower]);

    const rocket = this.add.container(width / 2, height - 150);
    const body = this.add.rectangle(0, -60, 34, 170, 0xf2f5fa).setStrokeStyle(2, 0x0b1220);
    const nose = this.add.triangle(0, -160, -17, 15, 17, 15, 0, -30, 0xf2f5fa).setStrokeStyle(2, 0x0b1220);
    const band = this.add.rectangle(0, -100, 34, 10, 0x2ee6c5);
    const finL = this.add.triangle(-24, 10, 7, -30, 7, 10, -10, 22, 0xff6b5a).setStrokeStyle(2, 0x0b1220);
    const finR = this.add.triangle(24, 10, -7, -30, -7, 10, 10, 22, 0xff6b5a).setStrokeStyle(2, 0x0b1220);
    const flame = this.add.image(0, 46, "glow").setTint(0xffb020).setScale(0.9, 1.6).setBlendMode(Phaser.BlendModes.ADD);
    rocket.add([flame, body, nose, band, finL, finR]);
    layer.add(rocket);

    const smoke = this.add.particles(width / 2, height - 100, "glow", {
      speed: { min: 40, max: 180 },
      angle: { min: 200, max: 340 },
      scale: { start: 0.6, end: 2.6 },
      alpha: { start: 0.5, end: 0 },
      tint: 0xb8c2d6,
      lifespan: 1800,
      frequency: 30,
    });
    layer.add(smoke);
    this.tweens.add({ targets: flame, scaleY: 2.1, duration: 80, yoyo: true, repeat: -1 });

    sfx.play("launch");
    this.say("T-0  Lift-off", "Main engine ignition");
    this.cameras.main.shake(2600, 0.004);

    if (this.d.info.launchFails) {
      this.tweens.add({ targets: rocket, y: height - 420, duration: 2600, ease: "Quad.in" });
      this.time.delayedCall(2300, () => {
        this.say("Insufficient performance", "The vehicle cannot carry this spacecraft to orbit");
        this.tweens.add({ targets: rocket, angle: 18, duration: 1400, ease: "Sine.inOut" });
        this.tweens.add({ targets: flame, alpha: 0.15, duration: 300, yoyo: true, repeat: 4 });
        sky.setAlpha(0.8);
      });
      this.time.delayedCall(4300, () => {
        this.tweens.add({ targets: rocket, y: height + 240, angle: 70, duration: 1300, ease: "Quad.in" });
        this.cameras.main.flash(500, 255, 80, 60);
      });
      this.time.delayedCall(6200, () => this.finish());
      return;
    }

    this.tweens.add({ targets: rocket, y: -260, duration: 3200, ease: "Quad.in" });
    this.time.delayedCall(1700, () => this.say("Max-Q", "Peak aerodynamic pressure"));
    this.time.delayedCall(3000, () => {
      this.cameras.main.fadeOut(350, 4, 7, 15);
      this.time.delayedCall(380, () => {
        layer.destroy();
        smoke.destroy();
        this.cameras.main.fadeIn(350, 4, 7, 15);
        this.orbitAct(0);
      });
    });
  }

  private orbitAct(delay: number) {
    const { width, height } = this.scale;
    const R = Math.min(width, height) * 0.3;
    const ex = width / 2;
    const ey = height / 2 - 20;
    const halo = this.add.graphics();
    drawHalo(halo, ex, ey, R);
    const globe = new Globe(this, ex, ey, R * 2, 320, 24);
    globe.rotation = 0.55;
    globe.render();
    this.time.addEvent({
      delay: 40,
      loop: true,
      callback: () => {
        globe.rotation += 0.0016;
        globe.render();
      },
    });
    this.events.once("shutdown", () => globe.destroy());

    // ground stations and target
    const target = this.add.circle(ex - R * 0.18, ey - R * 0.45, 7, 0xffb020).setStrokeStyle(2, 0x0b1220);
    const gsA = this.add.rectangle(ex - R * 0.05, ey - R * 0.86, 10, 10, 0xb6f36b).setStrokeStyle(2, 0x0b1220);
    const gsB = this.add.rectangle(ex + R * 0.35, ey + R * 0.8, 10, 10, 0xb6f36b).setStrokeStyle(2, 0x0b1220);
    this.add.text(target.x + 12, target.y - 8, "Target 52 N", { fontFamily: "Inter, sans-serif", fontSize: "12px", color: "#FFD27A" });
    const sats = this.d.info.sunSync ? [gsA, gsB] : [gsB];

    // orbit path (altitude exaggerated for readability)
    const a = R * (1.18 + (this.d.info.altitudeKm - 400) / 2000);
    const b = a * 0.38;
    const rot = this.d.info.sunSync ? -1.25 : -0.6;
    const path = this.add.graphics();
    path.lineStyle(1.5, 0x2ee6c5, 0.5);
    path.beginPath();
    for (let i = 0; i <= 64; i++) {
      const th = (i / 64) * Math.PI * 2;
      const [px, py] = this.orbitPoint(th, a, b, rot, ex, ey);
      if (i === 0) path.moveTo(px, py);
      else path.lineTo(px, py);
    }
    path.strokePath();

    const sat = this.add.container(0, 0, [
      this.add.rectangle(-11, 0, 12, 5, 0x2b56c8).setStrokeStyle(1, 0x0b1220),
      this.add.rectangle(11, 0, 12, 5, 0x2b56c8).setStrokeStyle(1, 0x0b1220),
      this.add.rectangle(0, 0, 9, 9, 0xf2c65a).setStrokeStyle(1, 0x0b1220),
    ]);
    const beams = this.add.graphics();
    const state = { th: 0 };
    const total = this.d.reducedMotion ? 2500 : 6500;
    let passes = 0;
    const lostEvery = this.d.info.dataReturn >= 0.98 ? 0 : Math.max(1, Math.round(1 / Math.max(0.05, 1 - this.d.info.dataReturn)));
    this.time.delayedCall(delay, () => {
      this.say("Orbit insertion confirmed", `${this.d.info.altitudeKm} km ${this.d.info.sunSync ? "sun-synchronous orbit" : "inclined orbit"}`);
      this.tweens.add({
        targets: state,
        th: Math.PI * 6,
        duration: total,
        onUpdate: () => {
          const [px, py] = this.orbitPoint(state.th, a, b, rot, ex, ey);
          sat.setPosition(px, py);
          const front = Math.sin(state.th) > -0.1 || Math.hypot(px - ex, py - ey) > R;
          sat.setVisible(front);
          beams.clear();
          const phase = (state.th % (Math.PI * 2)) / (Math.PI * 2);
          if (front && phase > 0.15 && phase < 0.3) {
            beams.fillStyle(0xffd27a, 0.25);
            beams.fillTriangle(px, py, target.x - 14, target.y + 6, target.x + 14, target.y + 6);
          }
          if (front && phase > 0.55 && phase < 0.75) {
            const passIndex = Math.floor(state.th / (Math.PI * 2));
            const lost = lostEvery > 0 && (passIndex + 1) % lostEvery === 0;
            const gs = sats[passIndex % sats.length];
            beams.lineStyle(3, lost ? 0xff5a5a : 0xb6f36b, 0.9);
            beams.lineBetween(px, py, gs.x, gs.y);
            if (passIndex !== passes) passes = passIndex;
          }
        },
      });
    });

    const info = this.d.info;
    const captions: Array<[number, string, string]> = [
      [total * 0.35, "First light", "Imaging the flood plain"],
      [
        total * 0.65,
        "Downlink",
        info.recorderSummary,
      ],
    ];
    for (const [t, a1, b1] of captions) this.time.delayedCall(delay + t, () => this.say(a1, b1));
    this.time.delayedCall(delay + total + 600, () => this.finish());
  }

  private orbitPoint(th: number, a: number, b: number, rot: number, ex: number, ey: number): [number, number] {
    const x = Math.cos(th) * a;
    const y = Math.sin(th) * b;
    return [ex + x * Math.cos(rot) - y * Math.sin(rot), ey + x * Math.sin(rot) + y * Math.cos(rot)];
  }

  private finish() {
    if (this.finished) return;
    this.finished = true;
    this.cameras.main.fadeOut(300, 4, 7, 15);
    this.time.delayedCall(320, () => bus.emit("cinematic:done"));
  }
}
