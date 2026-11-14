/**
 * Map data. Layout is expressed as rectangles in tile units; the scene carves floors from rooms
 * and corridors, turns every remaining tile next to a floor into a wall, and places doors,
 * stations and props on top. Collision is derived from the same grid.
 */

export type FloorStyle = "ops" | "clean" | "tech" | "hangar" | "lobby" | "corridor";

export interface RoomDef {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  floor: FloorStyle;
}

export interface RectDef {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DoorDef extends RectDef {
  id: string;
}

export type PropKind =
  | "desk"
  | "rack"
  | "plant"
  | "crate"
  | "bench"
  | "satellite"
  | "rocket"
  | "battery"
  | "dish"
  | "screen"
  | "holo"
  | "sofa"
  | "locker"
  | "tank"
  | "engine"
  | "platform"
  | "radiator"
  | "bunk"
  | "capsule";

export interface PropDef {
  kind: PropKind;
  x: number;
  y: number;
  w: number;
  h: number;
  solid?: boolean;
}

export interface StationPlacement {
  stationId: string;
  x: number;
  y: number;
}

export interface MapDef {
  width: number;
  height: number;
  rooms: RoomDef[];
  corridors: RectDef[];
  doors: DoorDef[];
  windows: RectDef[];
  stations: StationPlacement[];
  director: { x: number; y: number };
  props: PropDef[];
  spawn: { x: number; y: number };
  /** Visual theme: ground facility (default) or spacecraft interior */
  theme?: "facility" | "ship" | "planet";
  planetId?: string;
}

/** The Earthwatch Integration Centre. 46 x 28 tiles. */
export const EARTHWATCH_MAP: MapDef = {
  width: 46,
  height: 28,
  rooms: [
    { id: "payload", name: "Payload Clean Room", x: 1, y: 1, w: 12, h: 10, floor: "clean" },
    { id: "ops", name: "Mission Control", x: 14, y: 1, w: 17, h: 10, floor: "ops" },
    { id: "comms", name: "Comms Bay", x: 32, y: 1, w: 13, h: 10, floor: "tech" },
    { id: "power", name: "Power Bay", x: 1, y: 16, w: 12, h: 11, floor: "tech" },
    { id: "lobby", name: "Crew Lobby", x: 14, y: 16, w: 12, h: 11, floor: "lobby" },
    { id: "launch", name: "Launch Integration Hall", x: 27, y: 16, w: 18, h: 11, floor: "hangar" },
  ],
  corridors: [{ x: 1, y: 12, w: 44, h: 3 }],
  doors: [
    { id: "d-payload", x: 6, y: 11, w: 2, h: 1 },
    { id: "d-ops", x: 21, y: 11, w: 3, h: 1 },
    { id: "d-comms", x: 37, y: 11, w: 2, h: 1 },
    { id: "d-power", x: 6, y: 15, w: 2, h: 1 },
    { id: "d-lobby", x: 19, y: 15, w: 2, h: 1 },
    { id: "d-launch", x: 34, y: 15, w: 3, h: 1 },
  ],
  windows: [
    { x: 16, y: 0, w: 4, h: 1 },
    { x: 25, y: 0, w: 4, h: 1 },
    { x: 35, y: 0, w: 3, h: 1 },
  ],
  stations: [
    { stationId: "orbit", x: 21, y: 4 },
    { stationId: "imager", x: 3, y: 2 },
    { stationId: "comms", x: 40, y: 2 },
    { stationId: "power", x: 3, y: 17 },
    { stationId: "launch", x: 41, y: 17 },
  ],
  director: { x: 26, y: 4 },
  props: [
    // Mission Control
    { kind: "screen", x: 20, y: 1, w: 5, h: 1, solid: true },
    { kind: "desk", x: 15, y: 6, w: 3, h: 1, solid: true },
    { kind: "desk", x: 19, y: 7, w: 3, h: 1, solid: true },
    { kind: "desk", x: 24, y: 7, w: 3, h: 1, solid: true },
    { kind: "holo", x: 15, y: 2, w: 2, h: 2, solid: true },
    { kind: "plant", x: 29, y: 9, w: 1, h: 1, solid: true },
    { kind: "plant", x: 14, y: 9, w: 1, h: 1, solid: true },
    // Payload clean room
    { kind: "satellite", x: 6, y: 5, w: 3, h: 3, solid: true },
    { kind: "bench", x: 9, y: 2, w: 3, h: 1, solid: true },
    { kind: "locker", x: 1, y: 7, w: 1, h: 3, solid: true },
    // Comms bay
    { kind: "dish", x: 34, y: 5, w: 3, h: 3, solid: true },
    { kind: "rack", x: 43, y: 4, w: 1, h: 3, solid: true },
    { kind: "rack", x: 43, y: 8, w: 1, h: 2, solid: true },
    { kind: "desk", x: 38, y: 7, w: 3, h: 1, solid: true },
    // Power bay
    { kind: "battery", x: 7, y: 19, w: 2, h: 2, solid: true },
    { kind: "battery", x: 7, y: 23, w: 2, h: 2, solid: true },
    { kind: "rack", x: 11, y: 18, w: 1, h: 3, solid: true },
    { kind: "crate", x: 1, y: 25, w: 1, h: 1, solid: true },
    { kind: "crate", x: 2, y: 25, w: 1, h: 1, solid: true },
    // Crew lobby
    { kind: "sofa", x: 15, y: 22, w: 3, h: 1, solid: true },
    { kind: "sofa", x: 22, y: 22, w: 3, h: 1, solid: true },
    { kind: "plant", x: 14, y: 16, w: 1, h: 1, solid: true },
    { kind: "plant", x: 25, y: 16, w: 1, h: 1, solid: true },
    { kind: "locker", x: 14, y: 24, w: 1, h: 3, solid: true },
    // Launch hall
    { kind: "rocket", x: 31, y: 18, w: 3, h: 8, solid: true },
    { kind: "crate", x: 37, y: 24, w: 1, h: 1, solid: true },
    { kind: "crate", x: 38, y: 24, w: 1, h: 1, solid: true },
    { kind: "crate", x: 37, y: 25, w: 1, h: 1, solid: true },
    { kind: "desk", x: 39, y: 20, w: 3, h: 1, solid: true },
  ],
  spawn: { x: 20, y: 20 },
};

/**
 * The crewed lunar spacecraft Selene. 40 x 45 tiles, laid out vertically like a stacked ship:
 * Command Deck at the top, a central spine corridor with side modules behind hatches, and the
 * Engine Room at the bottom.
 */
export const LUNAR_MAP: MapDef = {
  width: 40,
  height: 45,
  theme: "ship",
  rooms: [
    { id: "bridge", name: "Command Deck", x: 9, y: 1, w: 22, h: 8, floor: "ops" },
    { id: "survey", name: "Survey Bay", x: 2, y: 10, w: 15, h: 8, floor: "clean" },
    { id: "power", name: "Power Bay", x: 2, y: 19, w: 15, h: 7, floor: "tech" },
    { id: "tanks", name: "Tank Farm", x: 2, y: 27, w: 15, h: 9, floor: "hangar" },
    { id: "comms", name: "Comms Deck", x: 23, y: 10, w: 15, h: 8, floor: "tech" },
    { id: "thermal", name: "Thermal Control", x: 23, y: 19, w: 15, h: 7, floor: "tech" },
    { id: "quarters", name: "Crew Quarters", x: 23, y: 27, w: 15, h: 9, floor: "lobby" },
    { id: "engine", name: "Engine Room", x: 9, y: 37, w: 22, h: 7, floor: "hangar" },
  ],
  corridors: [{ x: 18, y: 10, w: 4, h: 26 }],
  doors: [
    { id: "d-bridge", x: 19, y: 9, w: 2, h: 1 },
    { id: "d-engine", x: 19, y: 36, w: 2, h: 1 },
    { id: "d-survey", x: 17, y: 13, w: 1, h: 2 },
    { id: "d-power", x: 17, y: 21, w: 1, h: 2 },
    { id: "d-tanks", x: 17, y: 30, w: 1, h: 2 },
    { id: "d-comms", x: 22, y: 13, w: 1, h: 2 },
    { id: "d-thermal", x: 22, y: 21, w: 1, h: 2 },
    { id: "d-quarters", x: 22, y: 30, w: 1, h: 2 },
  ],
  windows: [
    { x: 11, y: 0, w: 5, h: 1 },
    { x: 24, y: 0, w: 5, h: 1 },
    { x: 3, y: 9, w: 4, h: 1 },
    { x: 33, y: 9, w: 4, h: 1 },
  ],
  stations: [
    { stationId: "orbit", x: 13, y: 2 },
    { stationId: "survey", x: 5, y: 11 },
    { stationId: "power", x: 5, y: 20 },
    { stationId: "tanks", x: 5, y: 28 },
    { stationId: "comms", x: 33, y: 11 },
    { stationId: "thermal", x: 33, y: 20 },
    { stationId: "engine", x: 13, y: 38 },
  ],
  director: { x: 25, y: 2 },
  props: [
    // Command Deck
    { kind: "holo", x: 18, y: 4, w: 3, h: 2, solid: true },
    { kind: "desk", x: 10, y: 6, w: 3, h: 1, solid: true },
    { kind: "desk", x: 27, y: 6, w: 3, h: 1, solid: true },
    { kind: "rack", x: 30, y: 1, w: 1, h: 2, solid: true },
    { kind: "rack", x: 9, y: 1, w: 1, h: 2, solid: true },
    // Survey Bay
    { kind: "platform", x: 9, y: 12, w: 4, h: 4, solid: true },
    { kind: "rack", x: 15, y: 10, w: 1, h: 2, solid: true },
    { kind: "crate", x: 2, y: 15, w: 2, h: 2, solid: true },
    // Power Bay
    { kind: "battery", x: 9, y: 20, w: 2, h: 2, solid: true },
    { kind: "battery", x: 12, y: 20, w: 2, h: 2, solid: true },
    { kind: "crate", x: 2, y: 23, w: 2, h: 2, solid: true },
    // Tank Farm
    { kind: "tank", x: 8, y: 28, w: 3, h: 3, solid: true },
    { kind: "tank", x: 12, y: 28, w: 3, h: 3, solid: true },
    { kind: "tank", x: 8, y: 32, w: 3, h: 3, solid: true },
    { kind: "tank", x: 12, y: 32, w: 3, h: 3, solid: true },
    // Comms Deck
    { kind: "dish", x: 27, y: 12, w: 3, h: 3, solid: true },
    { kind: "rack", x: 36, y: 14, w: 1, h: 2, solid: true },
    { kind: "screen", x: 23, y: 10, w: 2, h: 1, solid: true },
    // Thermal Control
    { kind: "radiator", x: 26, y: 21, w: 4, h: 2, solid: true },
    { kind: "rack", x: 36, y: 22, w: 1, h: 2, solid: true },
    // Crew Quarters
    { kind: "bunk", x: 24, y: 28, w: 2, h: 3, solid: true },
    { kind: "bunk", x: 27, y: 28, w: 2, h: 3, solid: true },
    { kind: "bunk", x: 30, y: 28, w: 2, h: 3, solid: true },
    { kind: "locker", x: 36, y: 27, w: 1, h: 3, solid: true },
    { kind: "capsule", x: 32, y: 32, w: 3, h: 3, solid: true },
    { kind: "plant", x: 23, y: 34, w: 1, h: 1, solid: true },
    // Engine Room
    { kind: "engine", x: 17, y: 39, w: 6, h: 4, solid: true },
    { kind: "rack", x: 9, y: 41, w: 1, h: 2, solid: true },
    { kind: "crate", x: 27, y: 40, w: 2, h: 2, solid: true },
  ],
  spawn: { x: 26, y: 33 },
};
