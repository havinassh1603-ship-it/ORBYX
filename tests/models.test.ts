import { describe, expect, test } from "vitest";
import {
  orbitalPeriodS,
  circularVelocityKmps,
  eclipseFraction,
  eclipseDurationS,
  sunSyncInclinationDeg,
  maxSlantRangeKm,
} from "../src/sim/models/orbit";
import { geometricGsdM, diffractionGsdM } from "../src/sim/models/imaging";
import { freeSpacePathLossDb, ebN0Db, toDb } from "../src/sim/models/link";
import { powerBalance, arrayEolFactor } from "../src/sim/models/power";
import { deltaVMps, propellantForDeltaVKg, equilibriumTemperatureK } from "../src/sim/models/propulsion";

/** Reference values computed independently (textbook formulas / published figures). */
describe("orbital mechanics", () => {
  test("ISS-like 400 km circular orbit: period about 92.6 min, speed about 7.67 km/s", () => {
    expect(orbitalPeriodS(400) / 60).toBeCloseTo(92.56, 1);
    expect(circularVelocityKmps(400)).toBeCloseTo(7.669, 2);
  });
  test("geostationary altitude gives one sidereal day", () => {
    expect(Math.abs(orbitalPeriodS(35_786) - 86_164)).toBeLessThan(15);
  });
  test("eclipse fraction at 400 km (beta = 0, cylindrical shadow) is about 39%", () => {
    expect(eclipseFraction(400)).toBeCloseTo(0.3898, 3);
    expect(eclipseDurationS(400) / 60).toBeCloseTo(36.1, 0);
  });
  test("eclipse fraction falls with altitude", () => {
    expect(eclipseFraction(800)).toBeLessThan(eclipseFraction(600));
  });
  test("sun-synchronous inclination: about 97.8 deg at 600 km, 98.6 deg at 800 km", () => {
    expect(sunSyncInclinationDeg(600)).toBeCloseTo(97.79, 1);
    expect(sunSyncInclinationDeg(800)).toBeCloseTo(98.6, 1);
  });
  test("slant range at 0 deg elevation equals the horizon distance", () => {
    const a = 6378.137 + 600;
    expect(maxSlantRangeKm(600, 0)).toBeCloseTo(Math.sqrt(a * a - 6378.137 ** 2), 0);
  });
});

describe("imaging", () => {
  test("geometric GSD = altitude x pixel pitch / focal length", () => {
    expect(geometricGsdM(600, 5.5e-6, 2.0)).toBeCloseTo(1.65, 3);
  });
  test("diffraction limit 1.22 lambda h / D at 550 nm", () => {
    expect(diffractionGsdM(600, 0.35)).toBeCloseTo((1.22 * 0.55e-6 * 600e3) / 0.35, 4);
  });
});

describe("communications", () => {
  test("free-space path loss: 2000 km at 8.2 GHz is about 176.7 dB", () => {
    expect(freeSpacePathLossDb(2000, 8.2e9)).toBeCloseTo(176.74, 1);
  });
  test("doubling the data rate costs 3 dB of Eb/N0", () => {
    const base = { txPowerW: 2, txGainDbi: 15, rxGOverTDbK: 30, frequencyHz: 8.2e9, distanceKm: 2000, otherLossesDb: 3, dataRateBps: 50e6 };
    expect(ebN0Db(base) - ebN0Db({ ...base, dataRateBps: 100e6 })).toBeCloseTo(toDb(2), 6);
  });
});

describe("power", () => {
  test("array end-of-life factor after 5 years is about 0.80", () => {
    expect(arrayEolFactor(5)).toBeCloseTo(0.92 * (1 - 0.0275) ** 5, 6);
    expect(arrayEolFactor(5)).toBeGreaterThan(0.78);
  });
  test("margin is positive when the array exceeds the requirement and negative when it does not", () => {
    const base = { daylightLoadW: 95, eclipseLoadW: 93, daylightS: 3700, eclipseS: 2130, batteryWh: 240 };
    const req = powerBalance({ ...base, arrayEolW: 1 }).requiredArrayW;
    expect(powerBalance({ ...base, arrayEolW: req * 1.2 }).arrayMargin).toBeCloseTo(0.2, 6);
    expect(powerBalance({ ...base, arrayEolW: req * 0.8 }).arrayMargin).toBeLessThan(0);
  });
  test("depth of discharge equals eclipse energy over battery capacity (with discharge efficiency)", () => {
    const r = powerBalance({ daylightLoadW: 90, eclipseLoadW: 90, daylightS: 3600, eclipseS: 1800, arrayEolW: 400, batteryWh: 200 });
    expect(r.depthOfDischarge).toBeGreaterThan(45 / 200);
    expect(r.depthOfDischarge).toBeLessThan(45 / 200 / 0.8);
  });
});

describe("propulsion and thermal", () => {
  test("Tsiolkovsky: Isp 300 s, mass ratio 2 gives about 2039 m/s", () => {
    expect(deltaVMps(300, 1000, 500)).toBeCloseTo(300 * 9.80665 * Math.LN2, 3);
  });
  test("propellant for a delta-v is the inverse of the rocket equation", () => {
    const prop = propellantForDeltaVKg(320, 800, 2500);
    expect(deltaVMps(320, 800 + prop, 800)).toBeCloseTo(2500, 6);
  });
  test("radiative equilibrium: black plate facing the Sun about 394 K, isothermal sphere about 279 K", () => {
    expect(equilibriumTemperatureK(1, 1, 1, 1)).toBeCloseTo(393.6, 0);
    expect(equilibriumTemperatureK(1, 1, 1, 4)).toBeCloseTo(278.3, 0);
  });
});
