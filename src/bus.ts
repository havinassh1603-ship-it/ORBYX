import Phaser from "phaser";

/**
 * Single event bus between the Phaser world and the DOM interface.
 * World -> UI: "interact", "near", "player:pos", "door"
 * UI -> World: "lock" (boolean), "camera:zoom"
 */
export const bus = new Phaser.Events.EventEmitter();

export type InteractTarget = { kind: "station"; id: string } | { kind: "director" };
