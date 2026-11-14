import { describe, expect, test } from "vitest";
import { evaluateEarthwatch, type EvalContext } from "../src/sim/missions/earthwatch";
import { exportProfile, importProfile, isCleared, newProfile, recordReport, PROFILE_VERSION } from "../src/persist/profile";
import { MissionSession, shuffledOptions } from "../src/state/session";
import { missionById } from "../src/missions/registry";
import type { MissionReport } from "../src/sim/types";

const ctx = (over: Partial<EvalContext> = {}): EvalContext =>
  ({
    missingStations: [],
    timeUsedS: 300,
    timeLimitS: 720,
    mode: "solo",
    seed: 1,
    committedBy: {},
    players: [{ name: "Tester", astronautId: "armstrong" }],
    ...over,
  }) as EvalContext;

const BEST = { orbit: "sso600", imager: "heron", power: "balanced", comms: "xhga", launch: "kestrel" };

describe("Earthwatch evaluator", () => {
  test("a well-matched design is Successful with a high score", () => {
    const r = evaluateEarthwatch(BEST, ctx());
    expect(r.outcome).toBe("SUCCESS");
    expect(r.score).toBeGreaterThanOrEqual(9);
    expect(r.subsystems).toHaveLength(5);
  });
  test("a missing workstation at timer expiry fails the mission", () => {
    const { power: _p, ...partial } = BEST;
    const r = evaluateEarthwatch(partial, ctx({ missingStations: ["power"] }));
    expect(r.outcome).toBe("FAILED");
    expect(r.criticalFindings.join(" ")).toMatch(/Power Bay/);
  });
  test("an overloaded launcher fails and returns no imagery", () => {
    const r = evaluateEarthwatch({ orbit: "sso800", imager: "condor", power: "heavy", comms: "xmga", launch: "kestrel" }, ctx());
    expect(r.outcome).toBe("FAILED");
    expect(r.keyMetrics.find((m) => m.label === "Usable imagery delivered")?.value).toMatch(/^0%/);
  });
  test("scores stay inside outcome bands", () => {
    const r = evaluateEarthwatch({ ...BEST, orbit: "leo400" }, ctx());
    if (r.outcome === "PARTIAL") expect(r.score).toBeLessThanOrEqual(7.4);
    if (r.outcome === "FAILED") expect(r.score).toBeLessThanOrEqual(4.5);
  });
});

describe("mission session", () => {
  test("cannot run until every station is committed; expiry evaluates with what was submitted", () => {
    const s = new MissionSession(missionById("earthwatch"), [{ name: "T", astronautId: "armstrong" }], 7);
    s.dispatch({ type: "commit", stationId: "orbit", optionId: "sso600", player: "T" });
    s.dispatch({ type: "run" });
    expect(s.snapshot.status).toBe("active");
    s.dispatch({ type: "tick", dtS: 10_000 });
    expect(s.snapshot.status).toBe("running");
    expect(s.snapshot.report?.outcome).toBe("FAILED");
  });
  test("pause stops the countdown", () => {
    const s = new MissionSession(missionById("earthwatch"), [{ name: "T", astronautId: "armstrong" }], 7);
    s.dispatch({ type: "pause", paused: true });
    s.dispatch({ type: "tick", dtS: 30 });
    expect(s.snapshot.timeLeftS).toBe(s.snapshot.timeLimitS);
  });
  test("option order is shuffled deterministically per seed", () => {
    const items = ["a", "b", "c"];
    expect(shuffledOptions(items, 42, "orbit")).toEqual(shuffledOptions(items, 42, "orbit"));
    const orders = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => shuffledOptions(items, seed, "orbit").join("")));
    expect(orders.size).toBeGreaterThan(1);
  });
});

describe("profile", () => {
  test("export and import round-trip", () => {
    const p = newProfile("Ada");
    const res = importProfile(exportProfile(p));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.profile.displayName).toBe("Ada");
  });
  test("tampered, foreign and future files are rejected", () => {
    const text = exportProfile(newProfile("Ada"));
    const t = JSON.parse(text);
    t.profile.displayName = "Mallory";
    expect(importProfile(JSON.stringify(t)).ok).toBe(false);
    expect(importProfile("{}").ok).toBe(false);
    expect(importProfile("not json").ok).toBe(false);
    const f = JSON.parse(text);
    f.version = PROFILE_VERSION + 1;
    expect(importProfile(JSON.stringify(f)).ok).toBe(false);
  });
  test("names are sanitised", () => {
    expect(newProfile("  <b>Neil</b>  ").displayName).toBe("bNeil/b");
  });
  test("a mission clears with one Successful or two Partially Successful results", () => {
    const rep = (outcome: MissionReport["outcome"]) => ({ missionId: "earthwatch", outcome, score: 6 }) as MissionReport;
    let p = newProfile("Ada");
    expect(isCleared(p, "earthwatch")).toBe(false);
    p = recordReport(p, rep("PARTIAL"));
    expect(isCleared(p, "earthwatch")).toBe(false);
    p = recordReport(p, rep("PARTIAL"));
    expect(isCleared(p, "earthwatch")).toBe(true);
    const q = recordReport(newProfile("B"), rep("SUCCESS"));
    expect(isCleared(q, "earthwatch")).toBe(true);
    const f = recordReport(newProfile("C"), rep("FAILED"));
    expect(isCleared(f, "earthwatch")).toBe(false);
  });
});
