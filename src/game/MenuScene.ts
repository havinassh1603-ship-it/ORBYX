import Phaser from "phaser";
import { registerTextures } from "./textures";
import { Globe, drawHalo } from "./globe";

/** Animated space backdrop behind menus: parallax stars, a turning Earth and an orbiting satellite. */
export class MenuScene extends Phaser.Scene {
  private far!: Phaser.GameObjects.TileSprite;
  private near!: Phaser.GameObjects.TileSprite;
  private globe!: Globe;
  private halo!: Phaser.GameObjects.Graphics;
  private sat!: Phaser.GameObjects.Container;
  private t = 0;
  private reduced = false;
  private earthR = 300;
  private ex = 0;
  private ey = 0;
  private renderAcc = 0;

  constructor() {
    super("menu");
  }

  init(d: { reducedMotion?: boolean }) {
    this.reduced = !!d?.reducedMotion;
  }

  create() {
    registerTextures(this);
    const { width, height } = this.scale;
    this.far = this.add.tileSprite(0, 0, width, height, "stars-far").setOrigin(0);
    this.near = this.add.tileSprite(0, 0, width, height, "stars").setOrigin(0).setAlpha(0.9);
    this.halo = this.add.graphics();
    this.globe = new Globe(this, 0, 0, 100, 320, 20);
    this.globe.rotation = 0.62;
    this.globe.render();

    const body = this.add.rectangle(0, 0, 10, 8, 0xf2c65a).setStrokeStyle(1, 0x0b1220);
    const w1 = this.add.rectangle(-12, 0, 12, 5, 0x2b56c8).setStrokeStyle(1, 0x0b1220);
    const w2 = this.add.rectangle(12, 0, 12, 5, 0x2b56c8).setStrokeStyle(1, 0x0b1220);
    const light = this.add.circle(0, -6, 2, 0x2ee6c5);
    this.sat = this.add.container(0, 0, [w1, w2, body, light]);

    this.layout();
    this.scale.on("resize", this.layout, this);
    this.events.once("shutdown", () => {
      this.scale.off("resize", this.layout, this);
      this.globe.destroy();
    });
  }

  private layout() {
    const { width, height } = this.scale;
    this.far.setSize(width, height);
    this.near.setSize(width, height);
    this.earthR = Math.max(260, Math.min(width, height) * 0.62);
    this.ex = width * 0.8;
    this.ey = height + this.earthR * 0.34;
    this.globe.setPosition(this.ex, this.ey, this.earthR * 2);
    drawHalo(this.halo, this.ex, this.ey, this.earthR);
  }

  update(_t: number, dt: number) {
    const k = this.reduced ? 0.15 : 1;
    this.t += (dt / 1000) * k;
    this.far.tilePositionX += 0.02 * dt * k;
    this.near.tilePositionX += 0.05 * dt * k;
    // Re-render the globe at about 20 fps; it turns slowly so this is visually smooth.
    this.renderAcc += dt;
    if (this.renderAcc > 50) {
      this.globe.rotation += 0.00045 * this.renderAcc * k * 0.1;
      this.renderAcc = 0;
      this.globe.render();
    }
    const a = this.earthR * 1.22;
    const b = this.earthR * 0.34;
    const th = this.t * 0.35;
    const x = Math.cos(th) * a;
    const y = Math.sin(th) * b;
    const rot = -0.32;
    const px = this.ex + x * Math.cos(rot) - y * Math.sin(rot);
    const py = this.ey - this.earthR * 0.2 + x * Math.sin(rot) + y * Math.cos(rot);
    this.sat.setPosition(px, py);
    const behind = Math.sin(th) < 0 && Math.hypot(px - this.ex, py - this.ey) < this.earthR;
    this.sat.setVisible(!behind);
    this.sat.setScale(1 + Math.sin(th) * 0.25);
  }
}
