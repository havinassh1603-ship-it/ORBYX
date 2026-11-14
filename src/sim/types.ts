/** Shared types for mission definitions, decisions and reports. Pure data, no engine imports. */

export type SubsystemId = "EPS" | "OBDH" | "PROP" | "GNC" | "COMMS" | "THERMAL" | "STRUCT";

export const SUBSYSTEMS: Record<SubsystemId, { name: string; short: string; color: string; icon: string }> = {
  EPS: { name: "Electrical Power Systems", short: "EPS", color: "#FFB020", icon: "bolt" },
  OBDH: { name: "On-Board Data Handling", short: "OBDH", color: "#9B7BFF", icon: "chip" },
  PROP: { name: "Propulsion and Launch", short: "PROP", color: "#FF6B5A", icon: "flame" },
  GNC: { name: "Guidance, Navigation and Control", short: "GNC", color: "#4FC3F7", icon: "compass" },
  COMMS: { name: "Communications", short: "COMMS", color: "#B6F36B", icon: "antenna" },
  THERMAL: { name: "Thermal Control", short: "THERM", color: "#FF8FB1", icon: "thermo" },
  STRUCT: { name: "Structures", short: "STRUCT", color: "#9AA7B8", icon: "frame" },
};

export interface Spec {
  label: string;
  value: string;
}

export interface StationOption {
  id: string;
  name: string;
  tagline: string;
  specs: Spec[];
}

export interface StationDef {
  id: string;
  subsystem: SubsystemId;
  title: string;
  roomId: string;
  question: string;
  context: string;
  options: StationOption[];
}

export type Decisions = Record<string, string>;

export type Outcome = "SUCCESS" | "PARTIAL" | "FAILED";

export const OUTCOME_LABEL: Record<Outcome, string> = {
  SUCCESS: "Successful",
  PARTIAL: "Partially Successful",
  FAILED: "Failed",
};

export type Rating = "strong" | "adequate" | "weak" | "critical";

export interface SubsystemReport {
  stationId: string;
  subsystem: SubsystemId;
  title: string;
  choiceName: string;
  selectedSpecs: Spec[];
  results: Spec[];
  rating: Rating;
  points: number;
  maxPoints: number;
  effect: string;
  lesson: string;
  committedBy?: string;
}

export interface Contribution {
  playerName: string;
  astronautId: string;
  stations: string[];
  pointsEarned: number;
  pointsPossible: number;
}

export interface MissionReport {
  version: 1;
  missionId: string;
  missionName: string;
  difficulty: string;
  outcome: Outcome;
  score: number;
  headline: string;
  summary: string;
  criticalFindings: string[];
  subsystems: SubsystemReport[];
  keyMetrics: Spec[];
  lessons: string[];
  contributions: Contribution[];
  timeUsedS: number;
  timeLimitS: number;
  createdAt: string;
  mode: "solo" | "multiplayer";
  seed: number;
  /** Optional extensions keep original v1 history and earned unlocks readable. */
  design?: import('./engineering').DesignSnapshot;
  engineering?: import('./engineering').EngineeringReview;
}

/** A live gauge for the HUD. value in [0, 1+] relative to the threshold, null if undetermined. */
export interface Gauge {
  id: string;
  label: string;
  display: string;
  /** 0..1 fill level for the bar */
  fill: number | null;
  status: "ok" | "warn" | "bad" | "unknown";
  hint: string;
}
/** Context the session passes to a mission evaluator */
export interface EvalContext {
  missingStations: string[];
  timeUsedS: number;
  timeLimitS: number;
  mode: "solo" | "multiplayer";
  seed: number;
  /** stationId -> player name; used for contributions */
  committedBy: Record<string, string>;
  players: { name: string; astronautId: string }[];
  now?: Date;
}
