import { describe, expect, test } from "vitest";
import {
  flyBurnPlan,
  heaterPowerW,
  lunarEclipseFraction,
  lunarPeriodS,
  lunarTrackSpacingKm,
  radiatorColdK,
  radiatorHotK,
} from "../src/sim/models/cislunar";
import { LUNAR_STATIONS, computeLunar, dishGainDbi, evaluateLunar } from "../src/sim/missions/lunar";
import type { EvalContext } from "../src/sim/types";

const ctx: EvalContext = {
  missingStations: [],
  timeUsedS: 400,
  timeLimitS: 900,
  mode: "solo",
  seed: 7,
  committedBy: {},
  players: [{ name: "Test", astronautId: "armstrong" }],
};
const BEST = { engine: "methalox", tanks: "t40", orbit: "llo100", survey: "nac", power: "p8", thermal: "white", comms: "xband" };

describe("cislunar models", () => {
  test("100 km lunar orbit period is about 118 minutes (reference: Apollo CSM ~2 h)", () => {
    expect(lunarPeriodS(100) / 60).toBeCloseTo(117.8, 0);
  });
  test("eclipse fraction at 100 km is about 39%", () => {
    expect(lunarEclipseFraction(100)).toBeCloseTo(0.394, 2);
  });
  test("ground-track shift per 100 km orbit is about 33 km at the equator", () => {
    expect(lunarTrackSpacingKm(100)).toBeCloseTo(32.7, 0);
    expect(lunarTrackSpacingKm(100, 60)).toBeCloseTo(16.35, 0);
  });
  test("burn plan without boil-off matches a single rocket-equation burn", () => {
    const one = flyBurnPlan(10_000, 30_000, 350, [{ name: "a", dvMps: 2000, coastDaysBefore: 0 }], 0);
    const two = flyBurnPlan(
      10_000,
      30_000,
      350,
      [
        { name: "a", dvMps: 1000, coastDaysBefore: 0 },
        { name: "b", dvMps: 1000, coastDaysBefore: 3 },
      ],
      0,
    );
    expect(two.propLeftKg).toBeCloseTo(one.propLeftKg, 3);
    const ideal = 350 * 9.80665 * Math.log(40_000 / 10_000);
    expect(one.residualDvMps + 2000).toBeCloseTo(ideal, 3);
  });
  test("boil-off reduces the residual delta-v and records the loss", () => {
    const burns = [
      { name: "a", dvMps: 1000, coastDaysBefore: 0 },
      { name: "b", dvMps: 1000, coastDaysBefore: 5 },
    ];
    const dry = flyBurnPlan(10_000, 30_000, 450, burns, 0);
    const wet = flyBurnPlan(10_000, 30_000, 450, burns, 0.015);
    expect(wet.residualDvMps).toBeLessThan(dry.residualDvMps);
    expect(wet.steps[1].boiledOffKg).toBeGreaterThan(0);
  });
  test("a burn that exceeds the propellant is flagged as a shortfall", () => {
    const r = flyBurnPlan(10_000, 1_000, 320, [{ name: "big", dvMps: 3000, coastDaysBefore: 0 }], 0);
    expect(r.firstShortfall).toBe(0);
    expect(r.steps[0].completed).toBe(false);
  });
  test("radiator: higher absorptivity runs hotter; heaters only when below the minimum", () => {
    const base = { internalW: 3000, areaM2: 30, emissivity: 0.9, sunViewFactor: 0.15, moonViewFactor: 0.3, moonIrWm2: 1300, moonAlbedo: 0.12 };
    expect(radiatorHotK({ ...base, absorptivity: 0.92 })).toBeGreaterThan(radiatorHotK({ ...base, absorptivity: 0.2 }));
    // energy balance: eps*sigma*A*T^4 = Q in the cold case
    const t = radiatorColdK(3000, 30, 0.9);
    expect(0.9 * 5.670374419e-8 * 30 * t ** 4).toBeCloseTo(3000, 3);
    expect(heaterPowerW(3000, 30, 0.9, t - 5)).toBe(0);
    expect(heaterPowerW(3000, 30, 0.9, t + 10)).toBeGreaterThan(0);
  });
  test("dish gain: 1 m at X-band is about 36 dBi", () => {
    expect(dishGainDbi(1.0, 8.45e9)).toBeCloseTo(36.3, 0);
  });
});

describe("Lunar mission rules", () => {
  test("every station offers exactly three options", () => {
    for (const s of LUNAR_STATIONS) expect(s.options).toHaveLength(3);
  });
  test("the reference design succeeds with the reserve, coverage and limits met", () => {
    const r = evaluateLunar(BEST, ctx);
    const s = computeLunar(BEST);
    expect(r.outcome).toBe("SUCCESS");
    expect(r.score).toBeGreaterThanOrEqual(9);
    expect(s.returnReserveMps!).toBeGreaterThanOrEqual(100);
    expect(s.coverageFrac!).toBeGreaterThanOrEqual(0.8);
    expect(s.radiatorHotK!).toBeLessThanOrEqual(315);
  });
  test("an overweight stack is scrubbed and fails", () => {
    const d = { ...BEST, engine: "hydrolox", tanks: "t44" };
    expect(computeLunar(d).stage).toBe("scrub");
    expect(evaluateLunar(d, ctx).outcome).toBe("FAILED");
  });
  test("insufficient delta-v triggers a free return and fails, crew safe", () => {
    const d = { ...BEST, engine: "hyper", tanks: "t36" };
    const s = computeLunar(d);
    expect(s.stage).toBe("freeReturn");
    const r = evaluateLunar(d, ctx);
    expect(r.outcome).toBe("FAILED");
    expect(r.criticalFindings.join(" ")).toMatch(/free-return/);
  });
  test("a halo orbit reaches the Moon but cannot map at 1 m", () => {
    const d = { ...BEST, orbit: "nrho" };
    const s = computeLunar(d);
    expect(s.stage).toBe("orbit");
    expect(s.gsdM!).toBeGreaterThan(1);
    expect(evaluateLunar(d, ctx).outcome).toBe("FAILED");
  });
  test("black radiators overheat in low lunar orbit and prevent success", () => {
    const d = { ...BEST, thermal: "black" };
    const s = computeLunar(d);
    expect(s.radiatorHotK!).toBeGreaterThan(315);
    expect(evaluateLunar(d, ctx).outcome).not.toBe("SUCCESS");
  });
  test("an S-band link cannot carry the daily video plus survey data from low orbit", () => {
    const s = computeLunar({ ...BEST, comms: "sband" });
    expect(s.dataFrac!).toBeLessThan(0.9);
    expect(evaluateLunar({ ...BEST, comms: "sband" }, ctx).outcome).toBe("PARTIAL");
  });
  test("an undersized array forces the survey off and is reported", () => {
    const s = computeLunar({ ...BEST, power: "p5" });
    expect(s.arrayMargin!).toBeLessThan(0);
    expect(s.powerDuty!).toBeLessThan(1);
  });
  test("missing tasks cap the mission at FAILED", () => {
    const r = evaluateLunar({ ...BEST, comms: undefined as unknown as string }, { ...ctx, missingStations: ["comms"] });
    expect(r.outcome).toBe("FAILED");
  });
  test("thin return reserve cannot be a success", () => {
    const d = { ...BEST, tanks: "t36", engine: "hydrolox", thermal: "teflon", power: "p12", comms: "kaband" };
    const s = computeLunar(d);
    if (s.returnReserveMps !== undefined && s.returnReserveMps >= 0 && s.returnReserveMps < 100) {
      expect(evaluateLunar(d, ctx).outcome).not.toBe("SUCCESS");
    }
  });
  test("score is always within 0..10 and consistent with the outcome band", () => {
    const ids = LUNAR_STATIONS.map((s) => s.id);
    const opts = LUNAR_STATIONS.map((s) => s.options.map((o) => o.id));
    let n = 0;
    const rec = (i: number, d: Record<string, string>) => {
      if (i === ids.length) {
        const r = evaluateLunar(d, ctx);
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(10);
        if (r.outcome === "FAILED") expect(r.score).toBeLessThan(5);
        if (r.outcome === "SUCCESS") expect(r.score).toBeGreaterThanOrEqual(7);
        n++;
        return;
      }
      for (const o of opts[i]) rec(i + 1, { ...d, [ids[i]]: o });
    };
    rec(0, {});
    expect(n).toBe(3 ** 7);
  });
});
