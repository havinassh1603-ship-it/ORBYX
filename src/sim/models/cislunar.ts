/**
 * Cislunar models: lunar orbits, a sequenced burn plan with propellant boil-off, and a
 * radiator heat balance. Units are explicit in every name. Pure functions, no engine imports.
 */
import { G0_MPS2 } from "./orbit";
import { STEFAN_BOLTZMANN, SOLAR_CONSTANT_W_M2 } from "./propulsion";

/** Lunar gravitational parameter, km^3/s^2 (GRAIL-derived value) */
export const MU_MOON_KM3_S2 = 4_902.800;
/** Mean lunar radius, km */
export const R_MOON_KM = 1_737.4;
/** Sidereal rotation period of the Moon, s (27.3217 days) */
export const MOON_SIDEREAL_DAY_S = 27.3217 * 86_400;
/** Mean Earth-Moon distance used for link budgets (perigee 363,300 km, apogee 405,500 km), km */
export const EARTH_MOON_WORST_KM = 405_500;

export function lunarPeriodS(altitudeKm: number): number {
  const a = R_MOON_KM + altitudeKm;
  return 2 * Math.PI * Math.sqrt((a * a * a) / MU_MOON_KM3_S2);
}

/** Worst-case (beta = 0) shadow fraction of a circular lunar orbit, cylindrical shadow */
export function lunarEclipseFraction(altitudeKm: number): number {
  return Math.asin(R_MOON_KM / (R_MOON_KM + altitudeKm)) / Math.PI;
}

/** Ground-track shift at the lunar equator between consecutive orbits, km */
export function lunarTrackSpacingKm(altitudeKm: number, latitudeDeg = 0): number {
  const shiftRad = (2 * Math.PI * lunarPeriodS(altitudeKm)) / MOON_SIDEREAL_DAY_S;
  return shiftRad * R_MOON_KM * Math.cos((latitudeDeg * Math.PI) / 180);
}

// ---------------------------------------------------------------------------------------------
// Burn plan
// ---------------------------------------------------------------------------------------------

export interface Burn {
  name: string;
  dvMps: number;
  /** Days spent coasting BEFORE this burn (propellant boils off during the coast) */
  coastDaysBefore: number;
}

export interface BurnStep {
  name: string;
  dvMps: number;
  coastDaysBefore: number;
  massBeforeKg: number;
  propUsedKg: number;
  boiledOffKg: number;
  propLeftKg: number;
  /** false if there was not enough propellant to complete this burn */
  completed: boolean;
}

export interface BurnPlanResult {
  steps: BurnStep[];
  propLeftKg: number;
  /** delta-v still available from the remaining propellant at the end of the plan, m/s */
  residualDvMps: number;
  /** index of the first burn that could not be completed, or -1 */
  firstShortfall: number;
}

/**
 * Fly a sequence of impulsive burns with the rocket equation. Before each burn the remaining
 * propellant boils off at `boilOffPerDay` (fraction of remaining propellant per day).
 */
export function flyBurnPlan(dryMassKg: number, propellantKg: number, ispS: number, burns: Burn[], boilOffPerDay: number): BurnPlanResult {
  const ve = ispS * G0_MPS2;
  let prop = propellantKg;
  const steps: BurnStep[] = [];
  let firstShortfall = -1;
  for (const [i, b] of burns.entries()) {
    const boiled = prop * (1 - Math.pow(1 - boilOffPerDay, b.coastDaysBefore));
    prop -= boiled;
    const m0 = dryMassKg + prop;
    const need = m0 * (1 - Math.exp(-b.dvMps / ve));
    const completed = need <= prop + 1e-9;
    const used = completed ? need : prop;
    prop -= used;
    steps.push({ name: b.name, dvMps: b.dvMps, coastDaysBefore: b.coastDaysBefore, massBeforeKg: m0, propUsedKg: used, boiledOffKg: boiled, propLeftKg: prop, completed });
    if (!completed && firstShortfall < 0) {
      firstShortfall = i;
      break;
    }
  }
  const residualDvMps = ve * Math.log((dryMassKg + prop) / dryMassKg);
  return { steps, propLeftKg: prop, residualDvMps, firstShortfall };
}

// ---------------------------------------------------------------------------------------------
// Radiator heat balance
// ---------------------------------------------------------------------------------------------

export interface RadiatorInput {
  /** Heat the radiators must reject, W */
  internalW: number;
  areaM2: number;
  absorptivity: number;
  emissivity: number;
  /** fraction of the radiator area effectively facing the Sun (orbit average, worst case) */
  sunViewFactor: number;
  /** view factor from the radiators to the lunar surface */
  moonViewFactor: number;
  /** infrared flux leaving the sunlit lunar surface beneath, W/m^2 */
  moonIrWm2: number;
  /** lunar Bond albedo */
  moonAlbedo: number;
}

/** Hot-case radiator equilibrium temperature, K: sunlit, over the sunlit lunar surface */
export function radiatorHotK(i: RadiatorInput): number {
  const absorbed =
    i.absorptivity * SOLAR_CONSTANT_W_M2 * (i.sunViewFactor + i.moonAlbedo * i.moonViewFactor) + i.emissivity * i.moonIrWm2 * i.moonViewFactor;
  const flux = i.internalW / i.areaM2 + absorbed;
  return Math.pow(flux / (i.emissivity * STEFAN_BOLTZMANN), 0.25);
}

/** Cold-case radiator temperature, K: in shadow over the lunar night (environment negligible) */
export function radiatorColdK(internalW: number, areaM2: number, emissivity: number): number {
  return Math.pow(internalW / areaM2 / (emissivity * STEFAN_BOLTZMANN), 0.25);
}

/** Heater power needed to hold the radiator loop at `minK` in the cold case, W */
export function heaterPowerW(internalW: number, areaM2: number, emissivity: number, minK: number): number {
  return Math.max(0, emissivity * STEFAN_BOLTZMANN * areaM2 * Math.pow(minK, 4) - internalW);
}
