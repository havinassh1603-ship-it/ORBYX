/**
 * LUNAR SURVEY AND RETURN — Intermediate mission.
 *
 * The crewed spacecraft Selene waits in a 400 km Earth parking orbit. It must fly to the Moon,
 * enter lunar orbit, image a candidate landing region on the far side (the floor of the Apollo
 * basin, near 36 deg S) for seven days, and bring its crew home with a delta-v reserve.
 *
 * Every number is derived from the models in ../models with the parameters below:
 *   - burn plan: TLI, LOI, station-keeping and TEI flown with the rocket equation, in sequence,
 *     with cryogenic boil-off during each coast;
 *   - survey: ground-track spacing from the lunar orbit period and the Moon's rotation, an
 *     off-nadir access band, swath and GSD from the camera optics;
 *   - power: lunar-orbit eclipse from geometry, array and battery sizing;
 *   - thermal: radiator hot case over the sunlit lunar surface and cold case in shadow;
 *   - comms: X/S/Ka link budgets at worst-case Earth-Moon distance and far-side occultation.
 * Option quality is NOT hard-coded; the evaluator scores the resulting physics.
 */
import { effectiveGsdM, geometricGsdM, diffractionGsdM } from "../models/imaging";
import { arrayEolFactor, powerBalance } from "../models/power";
import { closeLink, toDb } from "../models/link";
import {
  EARTH_MOON_WORST_KM,
  flyBurnPlan,
  heaterPowerW,
  lunarEclipseFraction,
  lunarPeriodS,
  lunarTrackSpacingKm,
  radiatorColdK,
  radiatorHotK,
  type BurnPlanResult,
} from "../models/cislunar";
import { G0_MPS2 } from "../models/orbit";
import { dailyDataEvents, simulateRecorder, simulateEnergy, type DataLedger, type EnergyTrace } from '../models/operations';
import { check, mandatoryMet, segmentReview, MODEL_VERSION, designSnapshot, type RequirementCheck, type EngineeringReview } from '../engineering';
import type { Contribution, Decisions, EvalContext, Gauge, MissionReport, Outcome, Rating, Spec, StationDef, SubsystemReport } from "../types";

// ---------------------------------------------------------------------------------------------
// Requirements and fixed assumptions
// ---------------------------------------------------------------------------------------------

export const LU_REQ = {
  /** One super-heavy launch delivers the fuelled stack to the parking orbit */
  launchCapacityKg: 60_000,
  minLaunchMargin: 0.03,
  /** Delta-v reserve that must remain after the return burn (contingency), m/s */
  returnReserveMps: 100,
  siteAreaKm2: 1_200,
  maxGsdM: 1.0,
  targetLatitudeDeg: -36,
  surveyDays: 7,
  transitDays: 3.5,
  radiatorMaxK: 315,
  radiatorMinK: 205,
  maxDod: 0.6,
  /** Daily downlink: 6 h of HD crew-operations video at 6 Mbit/s, plus survey imagery */
  crewVideoGbitPerDay: 6e6 * 6 * 3600 / 1e9,
} as const;

export const LU_ASSUMPTIONS = {
  /** Crew module, service module structure, life support, avionics, RCS, 3 crew, 14-day consumables */
  baseDryMassKg: 8_000,
  tliMps: 3_150,
  busPowerW: 2_300,
  crewMetabolicW: 360,
  /** instrument average load as a fraction of its rated power while surveying (slews, processing) */
  instrumentDuty: 0.5,
  pixelPitchM: 7e-6,
  offNadirDeg: 30,
  stripLengthKm: 60,
  bitsPerPixel: 12,
  compressionRatio: 3,
  missionYears: 14 / 365,
  networkAvailability: 0.9,
  requiredEbN0Db: 2.5,
  wantedLinkMarginDb: 3,
  moonIrWm2: 1_300,
  moonAlbedo: 0.12,
  sunViewFactor: 0.15,
  recorderBits: 256e9,
} as const;

// ---------------------------------------------------------------------------------------------
// Option parameter tables
// ---------------------------------------------------------------------------------------------

interface EngineOpt {
  name: string;
  ispS: number;
  engineMassKg: number;
  /** tank and pressurisation mass per kg of propellant */
  tankFraction: number;
  /** fraction of remaining propellant lost per day of coasting */
  boilOffPerDay: number;
}
const ENGINES: Record<string, EngineOpt> = {
  hyper: { name: "Hypergolic NTO/MMH", ispS: 320, engineMassKg: 190, tankFraction: 0.06, boilOffPerDay: 0 },
  methalox: { name: "Methalox LOX/CH4", ispS: 360, engineMassKg: 430, tankFraction: 0.085, boilOffPerDay: 0.0008 },
  hydrolox: { name: "Hydrolox LOX/LH2", ispS: 450, engineMassKg: 520, tankFraction: 0.17, boilOffPerDay: 0.015 },
};

const LOADS: Record<string, { name: string; propellantKg: number }> = {
  t36: { name: "36 t propellant", propellantKg: 36_000 },
  t40: { name: "40 t propellant", propellantKg: 40_000 },
  t44: { name: "44 t propellant", propellantKg: 44_000 },
};

interface LunarOrbitOpt {
  name: string;
  kind: "llo" | "nrho";
  /** survey altitude (perilune for the halo orbit), km */
  surveyAltKm: number;
  loiMps: number;
  teiMps: number;
  stationKeepingMps: number;
  /** view factor from side radiators to the lunar surface */
  moonViewFactor: number;
  /** fraction of time Earth is in view (far-side occultation) */
  earthVisibility: number;
  /** survey passes over the site per survey: computed for low orbits, fixed for the halo */
  fixedPasses?: number;
  periodS?: number;
  eclipseS?: number;
}
const ORBITS: Record<string, LunarOrbitOpt> = {
  llo100: { name: "100 km circular polar orbit", kind: "llo", surveyAltKm: 100, loiMps: 850, teiMps: 850, stationKeepingMps: 15, moonViewFactor: 0.3, earthVisibility: 0.55 },
  llo50: { name: "50 km low polar orbit", kind: "llo", surveyAltKm: 50, loiMps: 880, teiMps: 880, stationKeepingMps: 70, moonViewFactor: 0.38, earthVisibility: 0.53 },
  nrho: {
    name: "Near-rectilinear halo orbit",
    kind: "nrho",
    surveyAltKm: 3_000,
    loiMps: 450,
    teiMps: 450,
    stationKeepingMps: 10,
    moonViewFactor: 0.02,
    earthVisibility: 1,
    fixedPasses: 1,
    periodS: 6.5 * 86_400,
    eclipseS: 0,
  },
};

interface InstrumentOpt {
  name: string;
  massKg: number;
  focalLengthM: number;
  apertureM: number;
  /** detector pixels across track, per camera */
  pixels: number;
  /** cameras side by side (swath multiplies); stereo cameras view the same strip */
  cameras: number;
  stereo: boolean;
  powerW: number;
}
const INSTRUMENTS: Record<string, InstrumentOpt> = {
  wac: { name: "Wide-angle mapper", massKg: 120, focalLengthM: 0.6, apertureM: 0.12, pixels: 6_000, cameras: 1, stereo: false, powerW: 60 },
  nac: { name: "Twin narrow-angle cameras", massKg: 240, focalLengthM: 1.4, apertureM: 0.2, pixels: 5_000, cameras: 2, stereo: false, powerW: 110 },
  stereo: { name: "Stereo cameras + laser altimeter", massKg: 400, focalLengthM: 1.4, apertureM: 0.2, pixels: 5_000, cameras: 1, stereo: true, powerW: 260 },
};

const POWER: Record<string, { name: string; arrayBolW: number; batteryWh: number; massKg: number }> = {
  p5: { name: "5 kW arrays, 8 kWh battery", arrayBolW: 5_000, batteryWh: 8_000, massKg: 290 },
  p8: { name: "8 kW arrays, 14 kWh battery", arrayBolW: 8_000, batteryWh: 14_000, massKg: 420 },
  p12: { name: "12 kW arrays, 24 kWh battery", arrayBolW: 12_000, batteryWh: 24_000, massKg: 640 },
};

const THERMAL: Record<string, { name: string; areaM2: number; absorptivity: number; emissivity: number; massKg: number }> = {
  white: { name: "White-paint radiators, 30 m2", areaM2: 30, absorptivity: 0.2, emissivity: 0.9, massKg: 240 },
  black: { name: "Black-anodised radiators, 30 m2", areaM2: 30, absorptivity: 0.92, emissivity: 0.88, massKg: 220 },
  teflon: { name: "Silvered-Teflon radiators, 45 m2", areaM2: 45, absorptivity: 0.08, emissivity: 0.8, massKg: 360 },
};

interface CommsOpt {
  name: string;
  band: string;
  frequencyHz: number;
  dishM: number;
  txPowerW: number;
  dcPowerW: number;
  massKg: number;
  groundGOverTDbK: number;
  otherLossesDb: number;
  modemRateBps: number;
}
const COMMS: Record<string, CommsOpt> = {
  sband: { name: "S-band 0.5 m medium-gain", band: "S", frequencyHz: 2.25e9, dishM: 0.5, txPowerW: 10, dcPowerW: 60, massKg: 25, groundGOverTDbK: 25, otherLossesDb: 2, modemRateBps: 2e6 },
  xband: { name: "X-band 1.0 m gimballed dish", band: "X", frequencyHz: 8.45e9, dishM: 1.0, txPowerW: 20, dcPowerW: 150, massKg: 60, groundGOverTDbK: 36, otherLossesDb: 2.5, modemRateBps: 20e6 },
  kaband: { name: "Ka-band 2.0 m high-gain dish", band: "Ka", frequencyHz: 26e9, dishM: 2.0, txPowerW: 40, dcPowerW: 320, massKg: 140, groundGOverTDbK: 40, otherLossesDb: 5, modemRateBps: 150e6 },
};

const fmt = (n: number, d = 0) => n.toLocaleString("en-GB", { maximumFractionDigits: d, minimumFractionDigits: d });
const kg = (n: number) => `${fmt(n)} kg`;

/** Parabolic dish gain with 55% aperture efficiency, dBi */
export function dishGainDbi(diameterM: number, frequencyHz: number, efficiency = 0.55): number {
  const lambda = 299_792_458 / frequencyHz;
  return toDb(efficiency * Math.pow((Math.PI * diameterM) / lambda, 2));
}

// ---------------------------------------------------------------------------------------------
// Stations shown in the world
// ---------------------------------------------------------------------------------------------

export const LUNAR_STATIONS: StationDef[] = [
  {
    id: "engine",
    subsystem: "PROP",
    title: "Engine Room",
    roomId: "engine",
    question: "Which main engine and propellant should Selene fly?",
    context:
      "One engine performs every big burn: trans-lunar injection (3.15 km/s), lunar orbit insertion and the trans-Earth return burn. Higher specific impulse (Isp) means less propellant per km/s, but cryogenic propellants boil off during the 14-day mission and low-density hydrogen needs much heavier tanks.",
    options: [
      {
        id: "hyper",
        name: "Hypergolic NTO/MMH",
        tagline: "Storable, self-igniting, flight-proven",
        specs: [
          { label: "Specific impulse", value: "320 s" },
          { label: "Engine mass", value: "190 kg" },
          { label: "Tank mass", value: "6% of propellant" },
          { label: "Boil-off", value: "none (storable)" },
        ],
      },
      {
        id: "methalox",
        name: "Methalox LOX/CH4",
        tagline: "Mid-performance, mildly cryogenic",
        specs: [
          { label: "Specific impulse", value: "360 s" },
          { label: "Engine mass", value: "430 kg" },
          { label: "Tank mass", value: "8.5% of propellant" },
          { label: "Boil-off", value: "0.08% per day" },
        ],
      },
      {
        id: "hydrolox",
        name: "Hydrolox LOX/LH2",
        tagline: "Highest Isp, deep-cryogenic hydrogen",
        specs: [
          { label: "Specific impulse", value: "450 s" },
          { label: "Engine mass", value: "520 kg" },
          { label: "Tank mass", value: "17% of propellant" },
          { label: "Boil-off", value: "1.5% per day" },
        ],
      },
    ],
  },
  {
    id: "tanks",
    subsystem: "STRUCT",
    title: "Tank Farm",
    roomId: "tanks",
    question: "How much propellant should be loaded before departure?",
    context:
      "Propellant sets the delta-v Selene can deliver, from the rocket equation dv = Isp x g0 x ln(m0 / m1). Every kilogram of propellant also needs tankage, and the fuelled stack must fit within the 60 t a single super-heavy launch can place in the 400 km parking orbit.",
    options: Object.entries(LOADS).map(([id, o]) => ({
      id,
      name: o.name,
      tagline: id === "t36" ? "Light stack, smaller tanks" : id === "t40" ? "Standard load" : "Brim-full tanks",
      specs: [
        { label: "Propellant", value: kg(o.propellantKg) },
        { label: "Launch capacity", value: kg(LU_REQ.launchCapacityKg) },
      ],
    })),
  },
  {
    id: "orbit",
    subsystem: "GNC",
    title: "Flight Dynamics",
    roomId: "bridge",
    question: "Which lunar orbit should Selene survey from?",
    context:
      "Insertion and departure burns depend on the orbit. Low orbits put the cameras close to the surface but the Moon's uneven gravity (mascons) pulls them down, so they need station-keeping. A near-rectilinear halo orbit, like the one planned for Gateway, is cheap to enter and leave and almost never sees an eclipse, but its closest approach is thousands of kilometres up.",
    options: [
      {
        id: "llo100",
        name: "100 km circular polar orbit",
        tagline: "The classic survey orbit",
        specs: [
          { label: "Insertion + return", value: "0.85 + 0.85 km/s" },
          { label: "Station-keeping", value: "about 15 m/s per week" },
          { label: "Period", value: `${fmt(lunarPeriodS(100) / 60, 1)} min` },
          { label: "Earth in view", value: "about 55% (far side hidden)" },
        ],
      },
      {
        id: "llo50",
        name: "50 km low polar orbit",
        tagline: "Closer cameras, unstable orbit",
        specs: [
          { label: "Insertion + return", value: "0.88 + 0.88 km/s" },
          { label: "Station-keeping", value: "about 70 m/s per week" },
          { label: "Period", value: `${fmt(lunarPeriodS(50) / 60, 1)} min` },
          { label: "Earth in view", value: "about 53%" },
        ],
      },
      {
        id: "nrho",
        name: "Near-rectilinear halo orbit",
        tagline: "Cheap to reach, far from the surface",
        specs: [
          { label: "Insertion + return", value: "0.45 + 0.45 km/s" },
          { label: "Closest approach", value: "about 3,000 km" },
          { label: "Period", value: "about 6.5 days" },
          { label: "Earth in view", value: "continuous" },
        ],
      },
    ],
  },
  {
    id: "survey",
    subsystem: "OBDH",
    title: "Survey Bay",
    roomId: "survey",
    question: "Which survey instrument should ride on the scan platform?",
    context:
      "The landing team needs 1,200 km2 of the Apollo basin floor mapped at 1.0 m ground sample distance or better. GSD = altitude x pixel pitch / focal length (7 micrometre pixels), limited by diffraction. Swath width, and how many orbits pass over the site, set how much area can be imaged.",
    options: Object.entries(INSTRUMENTS).map(([id, o]) => ({
      id,
      name: o.name,
      tagline: id === "wac" ? "Wide swath, modest optics" : id === "nac" ? "Two telescopes side by side" : "Same strip from two angles, plus laser ranging",
      specs: [
        { label: "Focal length / aperture", value: `${o.focalLengthM} m / ${o.apertureM * 100} cm` },
        { label: "Detector", value: `${fmt(o.pixels)} px x ${o.cameras} ${o.stereo ? "(stereo)" : o.cameras > 1 ? "cameras" : "camera"}` },
        { label: "Mass", value: kg(o.massKg) },
        { label: "Power", value: `${o.powerW} W` },
      ],
    })),
  },
  {
    id: "power",
    subsystem: "EPS",
    title: "Power Bay",
    roomId: "power",
    question: "How large should the solar arrays and battery be?",
    context:
      "Selene's crew systems draw 2.3 kW day and night. In lunar orbit the arrays must carry the daylight load and recharge the battery for every eclipse; heaters added by the thermal design count in eclipse too. For a two-week mission with about 85 eclipses the battery can safely cycle to 60% depth of discharge.",
    options: Object.entries(POWER).map(([id, o]) => ({
      id,
      name: o.name,
      tagline: id === "p5" ? "Light and compact" : id === "p8" ? "Mid-size wings" : "Large wings, big battery",
      specs: [
        { label: "Array output (start of life)", value: `${fmt(o.arrayBolW / 1000, 1)} kW` },
        { label: "Battery", value: `${fmt(o.batteryWh / 1000)} kWh Li-ion` },
        { label: "Mass", value: kg(o.massKg) },
      ],
    })),
  },
  {
    id: "thermal",
    subsystem: "THERMAL",
    title: "Thermal Control",
    roomId: "thermal",
    question: "Which radiator design should cool the cabin and electronics?",
    context:
      "Everything Selene consumes as electricity, plus 360 W from the crew, ends up as heat the radiators must reject. In low lunar orbit the sunlit surface below glows at up to about 1,300 W/m2 of infrared, so the radiators warm up. The coolant loop needs the radiators below 315 K in the hot case and above 205 K in shadow, or heaters must make up the difference.",
    options: Object.entries(THERMAL).map(([id, o]) => ({
      id,
      name: o.name,
      tagline: id === "white" ? "Reflects sunlight, radiates well" : id === "black" ? "High emissivity, absorbs sunlight" : "Low absorptivity, large area",
      specs: [
        { label: "Absorptivity / emissivity", value: `${o.absorptivity} / ${o.emissivity}` },
        { label: "Area", value: `${o.areaM2} m2` },
        { label: "Mass", value: kg(o.massKg) },
      ],
    })),
  },
  {
    id: "comms",
    subsystem: "COMMS",
    title: "Comms Deck",
    roomId: "comms",
    question: "Which communications system should Selene carry?",
    context:
      "Each day Selene must send six hours of HD crew-operations video at 6 Mbit/s plus the survey imagery, over up to 405,500 km, through a network of 12 to 13 m ground antennas. The far side hides Earth for part of every low orbit. Higher frequencies give more gain per metre of dish but suffer more from rain and pointing error.",
    options: Object.entries(COMMS).map(([id, o]) => ({
      id,
      name: o.name,
      tagline: id === "sband" ? "Simple, robust, low rate" : id === "xband" ? "Deep-space workhorse" : "Very high rate, demanding",
      specs: [
        { label: "Antenna gain", value: `${fmt(dishGainDbi(o.dishM, o.frequencyHz), 1)} dBi` },
        { label: "Transmitter", value: `${o.txPowerW} W RF (${o.dcPowerW} W DC)` },
        { label: "Radio maximum rate", value: `${fmt(o.modemRateBps / 1e6)} Mbit/s` },
        { label: "Mass", value: kg(o.massKg) },
      ],
    })),
  },
];

// ---------------------------------------------------------------------------------------------
// Coupled computation
// ---------------------------------------------------------------------------------------------

export type LunarStage = "scrub" | "leo" | "freeReturn" | "orbit";

export interface LunarState {
  engine?: EngineOpt;
  load?: (typeof LOADS)[string];
  orbit?: LunarOrbitOpt;
  instrument?: InstrumentOpt;
  power?: (typeof POWER)[string];
  thermal?: (typeof THERMAL)[string];
  comms?: CommsOpt;
  dryMassKg: number;
  tankMassKg: number;
  stackMassKg: number;
  launchMargin: number;
  /** total planned delta-v including contingency, m/s */
  plannedDvMps?: number;
  /** ideal delta-v from the loaded propellant, no boil-off, m/s */
  idealDvMps?: number;
  plan?: BurnPlanResult;
  boiledOffKg?: number;
  /** delta-v left after the return burn, m/s (negative if the plan cannot be flown) */
  returnReserveMps?: number;
  stage?: LunarStage;
  periodS?: number;
  eclipseS?: number;
  daylightS?: number;
  gsdM?: number;
  swathKm?: number;
  passes?: number;
  coverageKm2?: number;
  /** fraction of the required area imaged at the required GSD (before power/thermal limits) */
  coverageFrac?: number;
  daylightLoadW?: number;
  eclipseLoadW?: number;
  heaterW?: number;
  requiredArrayW?: number;
  arrayEolW?: number;
  arrayMargin?: number;
  dod?: number;
  powerDuty?: number;
  radiatorHotK?: number;
  radiatorColdK?: number;
  thermalDuty?: number;
  linkRateBps?: number;
  linkMarginDb?: number;
  dailyNeedGbit?: number;
  dailyCapacityGbit?: number;
  dataFrac?: number;
  /** usable survey fraction actually returned to Earth */
  surveyFrac?: number;
  collectedSurveyFrac?: number;
  data?: DataLedger;
  energy?: EnergyTrace;
}

export function computeLunar(d: Decisions): LunarState {
  const A = LU_ASSUMPTIONS;
  const engine = d.engine ? ENGINES[d.engine] : undefined;
  const load = d.tanks ? LOADS[d.tanks] : undefined;
  const orbit = d.orbit ? ORBITS[d.orbit] : undefined;
  const instrument = d.survey ? INSTRUMENTS[d.survey] : undefined;
  const power = d.power ? POWER[d.power] : undefined;
  const thermal = d.thermal ? THERMAL[d.thermal] : undefined;
  const comms = d.comms ? COMMS[d.comms] : undefined;

  const propKg = load?.propellantKg ?? 0;
  const tankMassKg = propKg * (engine?.tankFraction ?? 0.085);
  const dryMassKg =
    A.baseDryMassKg +
    (engine?.engineMassKg ?? 0) +
    tankMassKg +
    (instrument?.massKg ?? 0) +
    (power?.massKg ?? 0) +
    (thermal?.massKg ?? 0) +
    (comms?.massKg ?? 0);
  const stackMassKg = dryMassKg + propKg;
  const s: LunarState = {
    engine,
    load,
    orbit,
    instrument,
    power,
    thermal,
    comms,
    dryMassKg,
    tankMassKg,
    stackMassKg,
    launchMargin: (LU_REQ.launchCapacityKg - stackMassKg) / LU_REQ.launchCapacityKg,
  };

  // ---- Burn plan
  if (engine && load && orbit) {
    s.plannedDvMps = A.tliMps + orbit.loiMps + orbit.stationKeepingMps + orbit.teiMps + LU_REQ.returnReserveMps;
    s.idealDvMps = engine.ispS * G0_MPS2 * Math.log(stackMassKg / dryMassKg);
    const half = LU_REQ.surveyDays / 2;
    s.plan = flyBurnPlan(
      dryMassKg,
      propKg,
      engine.ispS,
      [
        { name: "Trans-lunar injection", dvMps: A.tliMps, coastDaysBefore: 0.2 },
        { name: "Lunar orbit insertion", dvMps: orbit.loiMps, coastDaysBefore: LU_REQ.transitDays },
        { name: "Station-keeping", dvMps: orbit.stationKeepingMps, coastDaysBefore: half },
        { name: "Trans-Earth injection", dvMps: orbit.teiMps, coastDaysBefore: half },
      ],
      engine.boilOffPerDay,
    );
    s.boiledOffKg = s.plan.steps.reduce((a, x) => a + x.boiledOffKg, 0);
    if (s.plan.firstShortfall === -1) s.returnReserveMps = s.plan.residualDvMps;
    else {
      // Shortfall expressed as the delta-v that was missing at the failed burn
      const st = s.plan.steps[s.plan.firstShortfall];
      const ve = engine.ispS * G0_MPS2;
      const achieved = ve * Math.log(st.massBeforeKg / (st.massBeforeKg - st.propUsedKg));
      const remaining = A.tliMps + orbit.loiMps + orbit.stationKeepingMps + orbit.teiMps;
      const flownBefore = s.plan.steps.slice(0, s.plan.firstShortfall).reduce((a, x) => a + x.dvMps, 0);
      s.returnReserveMps = -(remaining - flownBefore - achieved);
    }
    if (s.launchMargin < 0) s.stage = "scrub";
    else if (s.plan.firstShortfall === 0) s.stage = "leo";
    // Mission rule: lunar orbit insertion only if the full return can be flown. Otherwise the crew
    // stays on the free-return trajectory (a lunar flyby straight back to Earth).
    else if (s.plan.firstShortfall > 0) s.stage = "freeReturn";
    else s.stage = "orbit";
  } else if (s.launchMargin < 0) s.stage = "scrub";

  // ---- Orbit geometry
  if (orbit) {
    s.periodS = orbit.periodS ?? lunarPeriodS(orbit.surveyAltKm);
    s.eclipseS = orbit.eclipseS ?? s.periodS * lunarEclipseFraction(orbit.surveyAltKm);
    s.daylightS = s.periodS - s.eclipseS;
  }

  // ---- Survey
  if (orbit && instrument) {
    const h = orbit.surveyAltKm;
    s.gsdM = effectiveGsdM(h, A.pixelPitchM, instrument.focalLengthM, instrument.apertureM);
    s.swathKm = ((instrument.pixels * A.pixelPitchM * h * 1000) / instrument.focalLengthM / 1000) * instrument.cameras;
    if (orbit.fixedPasses !== undefined) s.passes = orbit.fixedPasses;
    else {
      const bandKm = 2 * h * Math.tan((A.offNadirDeg * Math.PI) / 180);
      s.passes = bandKm / lunarTrackSpacingKm(h, LU_REQ.targetLatitudeDeg);
    }
    s.coverageKm2 = Math.min(s.passes * A.stripLengthKm * s.swathKm, LU_REQ.siteAreaKm2 * 4);
    const resOk = s.gsdM <= LU_REQ.maxGsdM;
    s.coverageFrac = resOk ? Math.min(1, s.coverageKm2 / LU_REQ.siteAreaKm2) : 0;
  }

  // ---- Thermal (needed before power: heaters add eclipse load)
  const commsAvgW = comms && orbit ? comms.dcPowerW * orbit.earthVisibility : 0;
  const instrW = instrument ? instrument.powerW * A.instrumentDuty : 0;
  const dayLoadNoHeater = A.busPowerW + instrW + commsAvgW;
  const eclLoadNoHeater = A.busPowerW + commsAvgW;
  if (thermal && orbit) {
    const qHot = dayLoadNoHeater + A.crewMetabolicW;
    const qCold = eclLoadNoHeater + A.crewMetabolicW;
    s.radiatorHotK = radiatorHotK({
      internalW: qHot,
      areaM2: thermal.areaM2,
      absorptivity: thermal.absorptivity,
      emissivity: thermal.emissivity,
      sunViewFactor: A.sunViewFactor,
      moonViewFactor: orbit.moonViewFactor,
      moonIrWm2: A.moonIrWm2,
      moonAlbedo: A.moonAlbedo,
    });
    s.radiatorColdK = radiatorColdK(qCold, thermal.areaM2, thermal.emissivity);
    s.heaterW = heaterPowerW(qCold, thermal.areaM2, thermal.emissivity, LU_REQ.radiatorMinK);
    // Over-temperature forces the crew to power down survey equipment to protect the cabin.
    s.thermalDuty = Math.max(0, Math.min(1, 1 - (s.radiatorHotK - LU_REQ.radiatorMaxK) / 25));
  }

  // ---- Power
  if (orbit && s.daylightS !== undefined && s.eclipseS !== undefined) {
    s.daylightLoadW = dayLoadNoHeater;
    s.eclipseLoadW = eclLoadNoHeater + (s.heaterW ?? 0);
    const pbReq = powerBalance({
      daylightLoadW: s.daylightLoadW,
      eclipseLoadW: s.eclipseLoadW,
      daylightS: s.daylightS,
      eclipseS: s.eclipseS,
      arrayEolW: 1,
      batteryWh: 1,
    });
    s.requiredArrayW = pbReq.requiredArrayW;
    if (power) {
      s.arrayEolW = power.arrayBolW * arrayEolFactor(A.missionYears);
      const pb = powerBalance({
        daylightLoadW: s.daylightLoadW,
        eclipseLoadW: s.eclipseLoadW,
        daylightS: s.daylightS,
        eclipseS: s.eclipseS,
        arrayEolW: s.arrayEolW,
        batteryWh: power.batteryWh,
      });
      s.arrayMargin = pb.arrayMargin;
      s.dod = pb.depthOfDischarge;
      // A deficit is absorbed by switching off the survey first (crew systems have priority).
      if (pb.arrayMargin >= 0) s.powerDuty = 1;
      else {
        const deficitW = pb.requiredArrayW - pb.arrayEolW;
        const surveyW = Math.max(1, instrW + commsAvgW) / 0.85;
        s.powerDuty = Math.max(0, 1 - deficitW / surveyW);
      }
    }
  }

  // ---- Comms
  if (comms) {
    const link = closeLink(
      {
        txPowerW: comms.txPowerW,
        txGainDbi: dishGainDbi(comms.dishM, comms.frequencyHz),
        rxGOverTDbK: comms.groundGOverTDbK,
        frequencyHz: comms.frequencyHz,
        distanceKm: EARTH_MOON_WORST_KM,
        otherLossesDb: comms.otherLossesDb,
        dataRateBps: comms.modemRateBps,
      },
      A.requiredEbN0Db,
      A.wantedLinkMarginDb,
      14,
    );
    s.linkRateBps = link.rateBps;
    s.linkMarginDb = link.marginDb;
    if (orbit) {
      const contactS = 86_400 * orbit.earthVisibility * A.networkAvailability;
      const surveyBits =
        s.coverageKm2 !== undefined && s.gsdM !== undefined
          ? ((Math.min(s.coverageKm2, LU_REQ.siteAreaKm2) * 1e6) / (s.gsdM * s.gsdM)) * (A.bitsPerPixel / A.compressionRatio) * (instrument?.stereo ? 2 : 1)
          : 0;
      s.dailyNeedGbit = LU_REQ.crewVideoGbitPerDay + surveyBits / 1e9 / LU_REQ.surveyDays;
      s.dailyCapacityGbit = (link.rateBps * contactS) / 1e9;
      s.data = simulateRecorder(A.recorderBits, dailyDataEvents({ days: LU_REQ.surveyDays,
        generatedBitsPerDay: s.dailyNeedGbit * 1e9, capacityBitsPerDay: s.dailyCapacityGbit * 1e9,
        collectionsPerDay: Math.max(1, 86400 / (s.periodS ?? 7200)), contactsPerDay: Math.max(1, 86400 / (s.periodS ?? 7200)),
        missedContact: d._ops === 'outage' ? 0 : -1 }));
      s.dataFrac = s.data.generatedBits ? s.data.receivedBits / s.data.generatedBits : 0;
    }
  }

  if (s.stage && s.stage !== 'orbit') {
    s.data = simulateRecorder(A.recorderBits, []); s.dataFrac = 0;
  }
  if (s.coverageFrac !== undefined) {
    const reached = s.stage === undefined || s.stage === "orbit";
    s.collectedSurveyFrac = reached ? s.coverageFrac * (s.powerDuty ?? 1) * (s.thermalDuty ?? 1) : 0;
    // Video and survey share proportional packets; usable science must actually reach the ground.
    s.surveyFrac = s.collectedSurveyFrac * (s.dataFrac ?? 1);
  }
  if (power && s.daylightS !== undefined && s.eclipseS !== undefined && s.arrayEolW !== undefined) {
    const phases = Array.from({ length: 3 }, (_, i) => [
      { label: `Survey orbit ${i + 1} · sunlight / recharge`, durationS: s.daylightS!, generationW: s.arrayEolW! * .85, loadW: s.daylightLoadW! },
      { label: `Survey orbit ${i + 1} · eclipse`, durationS: s.eclipseS!, generationW: 0, loadW: s.eclipseLoadW! / .9 },
    ]).flat();
    for (const phase of phases) if (phase.generationW > phase.loadW) phase.generationW = phase.loadW + (phase.generationW - phase.loadW) * (.65 / (.85 * .9));
    s.energy = simulateEnergy(power.batteryWh, phases);
  }
  return s;
}

export function lunarRequirements(d: Decisions, s = computeLunar(d)): RequirementCheck[] {
  const known = (keys: string[], predicate: boolean) => keys.every(k => !!d[k]) ? predicate : undefined;
  return [
    check('launch', 'Fuelled launch mass', 'launch', known(['engine', 'tanks', 'power', 'survey', 'thermal', 'comms'], s.launchMargin >= 0), `${(s.stackMassKg / 1000).toFixed(2)} t`, 'Within 60 t capacity', 'Trade subsystem and tank mass against propellant performance.'),
    check('margin', 'Launch growth margin', 'launch', d.tanks ? s.launchMargin >= LU_REQ.minLaunchMargin : undefined, `${(s.launchMargin * 100).toFixed(1)}% spare`, 'Prefer at least 3% spare capacity', 'Leave room for integration growth.', false),
    check('return', 'Return and contingency', 'space', known(['engine', 'tanks', 'orbit'], s.stage === 'orbit' && (s.returnReserveMps ?? -1) >= LU_REQ.returnReserveMps), `${s.returnReserveMps?.toFixed(0) ?? '—'} m/s reserve`, 'Complete all burns and retain 100 m/s', 'Balance Isp, propellant, dry mass and coast boil-off.'),
    check('power', 'Sustainable electrical power', 'space', known(['orbit', 'power', 'survey', 'comms', 'thermal'], (s.arrayMargin ?? -1) >= 0 && (s.energy?.unservedWh ?? Infinity) < 1e-6), `${((s.arrayMargin ?? 0) * 100).toFixed(1)}% margin`, 'Non-negative array margin; no unserved energy', 'Include communications and cold-case heater demand.'),
    check('battery', 'Battery cycling', 'space', known(['orbit', 'power', 'comms', 'thermal'], (s.dod ?? Infinity) <= LU_REQ.maxDod), `${((s.dod ?? 0) * 100).toFixed(1)}% DoD`, 'At most 60% discharge per eclipse', 'Increase battery size or reduce eclipse load.'),
    check('thermal', 'Radiator temperatures', 'space', known(['thermal', 'orbit'], (s.radiatorHotK ?? Infinity) <= LU_REQ.radiatorMaxK), `${s.radiatorHotK?.toFixed(0) ?? '—'} K hot; ${Math.max(s.radiatorColdK ?? 0, LU_REQ.radiatorMinK).toFixed(0)} K with heaters`, '205–315 K, with heater power included', 'Compare coating absorption, radiator area and heater power together.'),
    check('downlink', 'Video and survey delivery', 'ground', known(['comms', 'orbit', 'survey'], (s.dataFrac ?? 0) >= 1 - 1e-9), `${((s.dataFrac ?? 0) * 100).toFixed(1)}% received`, 'All modeled daily video and survey packets', 'Size the link for Earth visibility and preserve recorder headroom.'),
    check('survey', 'Useful landing-site survey', 'user', known(['survey', 'orbit', 'comms', 'power', 'thermal', 'engine', 'tanks'], (s.surveyFrac ?? 0) >= 1 - 1e-9 && (s.gsdM ?? Infinity) <= LU_REQ.maxGsdM), `${((s.surveyFrac ?? 0) * 100).toFixed(1)}% received at ${s.gsdM?.toFixed(2) ?? '—'} m`, '1,200 km² at 1 m GSD or better', 'Check coverage, pointing assumptions, thermal duty, energy and received data.'),
  ];
}

export function lunarEngineering(d: Decisions, s = computeLunar(d)): EngineeringReview {
  const requirements = lunarRequirements(d, s), timeline: EngineeringReview['timeline'] = [];
  let timeS = 0;
  for (const step of s.plan?.steps ?? []) {
    timeS += step.coastDaysBefore * 86400;
    timeline.push({ timeS, label: (s.stage === 'orbit' ? '' : 'Planned · ') + step.name, detail: `${step.completed ? 'Burn calculation' : 'Calculated shortfall'} · ${step.propUsedKg.toFixed(0)} kg propellant; ${step.boiledOffKg.toFixed(0)} kg coast boil-off` });
  }
  timeline.push(...(s.data?.events ?? []).map(e => ({ timeS: (LU_REQ.transitDays + .2) * 86400 + e.timeS, label: e.label,
    detail: e.kind === 'missed' ? 'Ground contact missed; packets remain aboard.' : `${(e.movedBits / 1e9).toFixed(2)} Gbit ${e.kind === 'collect' ? 'stored' : 'received'}; ${(e.storedBits / 1e9).toFixed(2)} Gbit queued` })));
  timeline.push({ timeS: (2 * LU_REQ.transitDays + LU_REQ.surveyDays + .2) * 86400, label: 'Earth return', detail: `${s.returnReserveMps?.toFixed(0) ?? '—'} m/s contingency; useful survey ${((s.surveyFrac ?? 0) * 100).toFixed(1)}%` });
  timeline.sort((a, b) => a.timeS - b.timeS);
  return { modelVersion: MODEL_VERSION, durationS: (2 * LU_REQ.transitDays + LU_REQ.surveyDays + .2) * 86400, requirements,
    assumptions: ['Synthetic Selene hardware; patched-conic burn allocations and simplified lunar geometry, not a propagated ephemeris.', '256 Gbit recorder; proportional video/survey packets; reject newest packets on overflow.', 'Uniform access windows reproduce daily Earth visibility. Outage test misses the first contact of each survey day.', 'Survey pointing is ideal within the off-nadir access band. RF pointing/weather losses are included in each radio’s stated loss budget.', 'Three survey orbits sample battery charge using average loads, with cold-case heaters included. Coasts use the retained mission-average sizing assumptions.', 'Three crew and fourteen-day consumables are included in fixed dry mass; no landing or lunar ascent is simulated.'],
    data: s.data, energy: s.energy, timeline, segments: segmentReview(requirements) };
}

// ---------------------------------------------------------------------------------------------
// HUD gauges
// ---------------------------------------------------------------------------------------------

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const pct = (x: number) => `${x >= 0 ? "+" : ""}${Math.round(x * 100)}%`;

export function lunarGauges(d: Decisions): Gauge[] {
  const s = computeLunar(d);
  const g: Gauge[] = [];
  g.push({
    id: "mass",
    label: "Stack mass",
    display: `${fmt(s.stackMassKg / 1000, 1)} / ${fmt(LU_REQ.launchCapacityKg / 1000)} t`,
    fill: d.tanks ? clamp01(s.stackMassKg / LU_REQ.launchCapacityKg) : null,
    status: !d.tanks ? "unknown" : s.launchMargin < 0 ? "bad" : s.launchMargin < LU_REQ.minLaunchMargin ? "warn" : "ok",
    hint: !d.tanks ? "Load propellant in the Tank Farm to see the stack mass." : `Launch margin ${pct(s.launchMargin)} of the 60 t capacity.`,
  });
  if (s.returnReserveMps !== undefined) {
    const r = s.returnReserveMps;
    g.push({
      id: "dv",
      label: "Return reserve",
      display: `${fmt(r)} m/s (need ${LU_REQ.returnReserveMps})`,
      fill: clamp01((r + 300) / 700),
      status: r < 0 ? "bad" : r < LU_REQ.returnReserveMps ? "warn" : "ok",
      hint:
        r < 0
          ? "Selene cannot fly the full plan: the crew could not get home from lunar orbit."
          : `Delta-v left after the return burn, after ${fmt(s.boiledOffKg ?? 0)} kg of boil-off.`,
    });
  } else g.push({ id: "dv", label: "Return reserve", display: "not planned", fill: null, status: "unknown", hint: "Needs an engine, a propellant load and a lunar orbit." });
  if (s.coverageFrac !== undefined) {
    g.push({
      id: "survey",
      label: "Site coverage",
      display: s.gsdM! > LU_REQ.maxGsdM ? `${fmt(s.gsdM!, 2)} m GSD, too coarse` : `${Math.round(s.coverageFrac * 100)}% at ${fmt(s.gsdM!, 2)} m`,
      fill: s.coverageFrac,
      status: (s.surveyFrac ?? 0) >= 1 - 1e-9 ? "ok" : s.coverageFrac >= 0.4 ? "warn" : "bad",
      hint: `Required: ${fmt(LU_REQ.siteAreaKm2)} km2 at ${LU_REQ.maxGsdM} m GSD or better. Useful survey received: ${((s.surveyFrac ?? 0) * 100).toFixed(1)}%.`,
    });
  } else g.push({ id: "survey", label: "Site coverage", display: "unknown", fill: null, status: "unknown", hint: "Needs a lunar orbit and an instrument." });
  if (s.arrayMargin !== undefined && s.arrayEolW !== undefined && s.requiredArrayW !== undefined) {
    g.push({
      id: "power",
      label: "Power margin",
      display: `${fmt(s.arrayEolW / 1000, 1)} vs ${fmt(s.requiredArrayW / 1000, 1)} kW`,
      fill: clamp01(s.arrayEolW / s.requiredArrayW / 1.5),
      status: s.arrayMargin < 0 ? "bad" : (s.dod ?? 0) > LU_REQ.maxDod ? "warn" : "ok",
      hint: `Array margin ${pct(s.arrayMargin)}; battery depth of discharge ${Math.round((s.dod ?? 0) * 100)}%.`,
    });
  } else g.push({ id: "power", label: "Power margin", display: s.requiredArrayW ? `need ${fmt(s.requiredArrayW / 1000, 1)} kW` : "not sized", fill: null, status: "unknown", hint: "Needs a lunar orbit and a power system." });
  if (s.radiatorHotK !== undefined) {
    const hot = s.radiatorHotK;
    g.push({
      id: "thermal",
      label: "Radiator hot case",
      display: `${fmt(hot)} K (max ${LU_REQ.radiatorMaxK})`,
      fill: clamp01((hot - 200) / 160),
      status: hot > LU_REQ.radiatorMaxK + 10 ? "bad" : hot > LU_REQ.radiatorMaxK ? "warn" : "ok",
      hint: `Cold case ${fmt(s.radiatorColdK ?? 0)} K; heaters ${fmt(s.heaterW ?? 0)} W in shadow.`,
    });
  } else g.push({ id: "thermal", label: "Radiator hot case", display: "unknown", fill: null, status: "unknown", hint: "Needs a lunar orbit and a radiator design." });
  if (s.dataFrac !== undefined) {
    g.push({
      id: "data",
      label: "Daily downlink",
      display: `${fmt(s.dailyCapacityGbit ?? 0)} of ${fmt(s.dailyNeedGbit ?? 0)} Gbit`,
      fill: s.dataFrac,
      status: s.dataFrac >= 0.95 ? "ok" : s.dataFrac >= 0.6 ? "warn" : "bad",
      hint: `Link rate ${fmt((s.linkRateBps ?? 0) / 1e6, 2)} Mbit/s at 405,500 km.`,
    });
  } else g.push({ id: "data", label: "Daily downlink", display: "unknown", fill: null, status: "unknown", hint: "Needs a lunar orbit and a comms system." });
  return g;
}

// ---------------------------------------------------------------------------------------------
// Evaluation and report
// ---------------------------------------------------------------------------------------------

function rate(points: number, max: number): Rating {
  const r = points / max;
  if (r >= 0.9) return "strong";
  if (r >= 0.6) return "adequate";
  if (r > 0.15) return "weak";
  return "critical";
}

export function evaluateLunar(d: Decisions, ctx: EvalContext): MissionReport {
  const s = computeLunar(d);
  const subs: SubsystemReport[] = [];
  const findings: string[] = [];
  const lessons: string[] = [];
  const base = (stationId: string) => {
    const st = LUNAR_STATIONS.find((x) => x.id === stationId)!;
    const op = st.options.find((o) => o.id === d[stationId]);
    return {
      stationId,
      subsystem: st.subsystem,
      title: st.title,
      choiceName: op ? op.name : "Not submitted",
      selectedSpecs: op ? op.specs : [],
      committedBy: ctx.committedBy[stationId],
    };
  };
  const reserve = s.returnReserveMps;
  const reserveScore = reserve === undefined ? 0 : reserve >= LU_REQ.returnReserveMps ? 1 : reserve >= 0 ? 0.55 + 0.35 * (reserve / LU_REQ.returnReserveMps) : Math.max(0, 0.3 + reserve / 1000);
  const planSpecs = (): Spec[] => {
    const out: Spec[] = [];
    if (s.plannedDvMps !== undefined) out.push({ label: "Delta-v needed incl. contingency", value: `${fmt(s.plannedDvMps / 1000, 2)} km/s` });
    if (s.idealDvMps !== undefined) out.push({ label: "Delta-v from loaded propellant", value: `${fmt(s.idealDvMps / 1000, 2)} km/s (before boil-off)` });
    if (s.boiledOffKg !== undefined) out.push({ label: "Propellant lost to boil-off", value: kg(s.boiledOffKg) });
    if (reserve !== undefined) out.push({ label: reserve >= 0 ? "Reserve after return burn" : "Shortfall in the burn plan", value: `${fmt(Math.abs(reserve))} m/s` });
    return out;
  };

  // ---- Engine (PROP), max 1.5
  {
    const max = 1.5;
    let pts = 0;
    let effect = "No engine was chosen, so Selene could not leave Earth orbit.";
    const results: Spec[] = [];
    if (s.engine) {
      pts = max * reserveScore;
      // Propellant lost to boil-off is margin the crew can never use: penalise it in proportion.
      const boilFrac = (s.boiledOffKg ?? 0) / (s.load?.propellantKg ?? 1);
      pts -= Math.min(0.5, boilFrac * 12);
      pts = Math.max(0, pts);
      results.push({ label: "Specific impulse", value: `${s.engine.ispS} s (exhaust velocity ${fmt((s.engine.ispS * G0_MPS2) / 1000, 2)} km/s)` }, ...planSpecs());
      const parts = [`The ${s.engine.name} engine gives an exhaust velocity of ${fmt((s.engine.ispS * G0_MPS2) / 1000, 2)} km/s.`];
      if (s.engine.boilOffPerDay > 0.005)
        parts.push(`Liquid hydrogen boiled off throughout the trip: ${kg(s.boiledOffKg ?? 0)} of propellant was gone before the return burn, and the hydrogen tanks weighed ${kg(s.tankMassKg)}.`);
      if (s.engine.ispS <= 320) parts.push("Its low specific impulse needs a very large mass ratio for a 5 km/s mission, so most of the stack has to be propellant.");
      effect = parts.join(" ");
    }
    subs.push({
      ...base("engine"),
      results,
      points: pts,
      maxPoints: max,
      rating: rate(pts, max),
      effect,
      lesson: "Specific impulse is only half the story: tank mass and boil-off over the mission duration decide how much of that efficiency survives to the last burn.",
    });
  }
  // ---- Tanks (STRUCT), max 1.5
  {
    const max = 1.5;
    let pts = 0;
    let effect = "No propellant was loaded.";
    const results: Spec[] = [];
    if (s.load) {
      results.push(
        { label: "Stack mass at departure", value: `${kg(s.stackMassKg)} of ${kg(LU_REQ.launchCapacityKg)}` },
        { label: "Launch margin", value: pct(s.launchMargin) },
        { label: "Dry mass (incl. tanks)", value: kg(s.dryMassKg) },
        { label: "Mass ratio m0 / m1", value: fmt(s.stackMassKg / s.dryMassKg, 2) },
      );
      if (s.launchMargin < 0) {
        pts = 0;
        effect = `The fuelled stack weighed ${kg(s.stackMassKg)}, ${kg(-s.launchMargin * LU_REQ.launchCapacityKg)} more than the launcher can deliver. The launch was cancelled.`;
        findings.push("The fuelled stack exceeded the launcher's 60 t capacity; Selene could not be launched.");
      } else {
        pts = max * reserveScore;
        if (s.launchMargin < LU_REQ.minLaunchMargin) pts -= 0.2;
        pts = Math.max(0, pts);
        effect =
          reserve !== undefined && reserve >= LU_REQ.returnReserveMps
            ? `The ${s.load.name} load flew the whole plan and left ${fmt(reserve)} m/s for contingencies.`
            : reserve !== undefined && reserve >= 0
              ? `The ${s.load.name} load completed every burn, but the crew came home with only ${fmt(reserve)} m/s spare, less than the ${LU_REQ.returnReserveMps} m/s contingency.`
              : `The ${s.load.name} load could not cover the burn plan with this engine and spacecraft mass.`;
      }
    }
    subs.push({
      ...base("tanks"),
      results,
      points: pts,
      maxPoints: max,
      rating: rate(pts, max),
      effect,
      lesson: "More propellant always adds delta-v, but with diminishing returns: each extra tonne must also be lifted, tanked and pushed through every burn, and it all has to fit on the launcher.",
    });
  }
  // ---- Orbit (GNC), max 1.5
  {
    const max = 1.5;
    let pts = 0;
    let effect = "No lunar orbit was selected.";
    const results: Spec[] = [];
    if (s.orbit) {
      const passes = s.passes ?? 0;
      results.push(
        { label: "Survey altitude", value: `${fmt(s.orbit.surveyAltKm)} km` },
        { label: "Period / eclipse", value: `${fmt((s.periodS ?? 0) / 60, 1)} / ${fmt((s.eclipseS ?? 0) / 60, 1)} min` },
        { label: "Passes over the site", value: fmt(passes, 1) },
        { label: "Insertion + return", value: `${fmt((s.orbit.loiMps + s.orbit.teiMps) / 1000, 2)} km/s` },
      );
      const cov = s.coverageFrac ?? 0;
      pts = max * (0.6 * cov + 0.4 * reserveScore);
      const parts: string[] = [];
      if (s.orbit.kind === "nrho")
        parts.push(`The halo orbit saved ${fmt(800)} m/s of insertion and return delta-v, but its closest approach is about 3,000 km up, so the cameras resolved only ${fmt(s.gsdM ?? 0, 1)} m.`);
      else if (s.orbit.surveyAltKm < 100)
        parts.push(`At 50 km the cameras were twice as close, but the swath halved and only ${fmt(passes, 1)} orbits crossed the site's access band; mascon perturbations cost ${s.orbit.stationKeepingMps} m/s of station-keeping.`);
      else parts.push(`From 100 km, ${fmt(passes, 1)} consecutive orbits crossed the site while the Moon turned beneath Selene.`);
      effect = parts.join(" ");
    }
    subs.push({
      ...base("orbit"),
      results,
      points: pts,
      maxPoints: max,
      rating: rate(pts, max),
      effect,
      lesson: "Lunar orbit choice trades delta-v against what you can see: low orbits cost more to enter, leave and maintain, while high orbits are cheap but too distant for detailed mapping.",
    });
  }
  // ---- Survey instrument (OBDH), max 1.5
  {
    const max = 1.5;
    let pts = 0;
    let effect = "No instrument was installed, so there was nothing to survey with.";
    const results: Spec[] = [];
    if (s.instrument && s.gsdM !== undefined) {
      const geo = geometricGsdM(s.orbit!.surveyAltKm, LU_ASSUMPTIONS.pixelPitchM, s.instrument.focalLengthM);
      const dif = diffractionGsdM(s.orbit!.surveyAltKm, s.instrument.apertureM);
      results.push(
        { label: "Ground sample distance", value: `${fmt(s.gsdM, 2)} m (geometric ${fmt(geo, 2)}, diffraction ${fmt(dif, 2)})` },
        { label: "Swath", value: `${fmt(s.swathKm ?? 0, 1)} km` },
        { label: "Area imaged", value: `${fmt(Math.min(s.coverageKm2 ?? 0, LU_REQ.siteAreaKm2 * 4))} km2` },
        { label: "Usable coverage returned", value: `${Math.round((s.surveyFrac ?? 0) * 100)}% of ${fmt(LU_REQ.siteAreaKm2)} km2` },
      );
      const cov = s.surveyFrac ?? 0;
      pts = max * cov + (s.instrument.stereo && cov > 0.3 ? 0.25 : 0);
      pts = Math.min(max, pts);
      const parts: string[] = [];
      if (s.gsdM > LU_REQ.maxGsdM) parts.push(`At ${fmt(s.gsdM, 2)} m per pixel the images were too coarse to see the boulders and slopes that matter for a landing.`);
      else parts.push(`Images reached ${fmt(s.gsdM, 2)} m per pixel across a ${fmt(s.swathKm ?? 0, 1)} km swath.`);
      if (s.instrument.stereo) parts.push("Stereo imaging and laser ranging also produced a slope map, valuable for landing safety, at the cost of half the swath.");
      if ((s.powerDuty ?? 1) < 1) parts.push(`A power shortfall forced the crew to switch the survey off for ${Math.round((1 - (s.powerDuty ?? 1)) * 100)}% of the time.`);
      if ((s.thermalDuty ?? 1) < 1) parts.push(`Radiator over-temperature forced the crew to power down survey equipment ${Math.round((1 - (s.thermalDuty ?? 1)) * 100)}% of the time.`);
      if (s.stage && s.stage !== "orbit") parts.push("Selene never entered lunar orbit, so no survey was flown.");
      effect = parts.join(" ");
    }
    subs.push({
      ...base("survey"),
      results,
      points: pts,
      maxPoints: max,
      rating: rate(pts, max),
      effect,
      lesson: "Resolution depends on altitude and optics together; coverage depends on swath and how often the orbit passes the site. A camera is only as good as the orbit it flies in.",
    });
  }
  // ---- Power (EPS), max 1.5
  {
    const max = 1.5;
    let pts = 0;
    let effect = "No power system was installed.";
    const results: Spec[] = [];
    if (s.power && s.arrayMargin !== undefined) {
      const m = s.arrayMargin;
      if (m < 0) pts = max * Math.max(0, 1 + 3 * m);
      else if (m <= 0.8) pts = max;
      else pts = 1.1;
      if ((s.dod ?? 0) > LU_REQ.maxDod) pts -= 0.4;
      pts = Math.max(0, pts);
      results.push(
        { label: "Daylight / eclipse load", value: `${fmt((s.daylightLoadW ?? 0) / 1000, 2)} / ${fmt((s.eclipseLoadW ?? 0) / 1000, 2)} kW` },
        { label: "Array needed / available", value: `${fmt((s.requiredArrayW ?? 0) / 1000, 2)} / ${fmt((s.arrayEolW ?? 0) / 1000, 2)} kW` },
        { label: "Array margin", value: pct(m) },
        { label: "Battery depth of discharge", value: `${Math.round((s.dod ?? 0) * 100)}%` },
      );
      effect =
        m < 0
          ? `The arrays fell ${fmt((s.requiredArrayW! - s.arrayEolW!) / 1000, 2)} kW short; crew systems have priority, so the survey and its radio were switched off to balance the bus.`
          : m > 0.8
            ? `Power was never a problem, but the oversized arrays and battery added ${kg(s.power.massKg - POWER.p8.massKg)} compared with the mid-size option, mass the propellant had to push.`
            : `The arrays covered the daylight load and recharged the battery every ${fmt((s.periodS ?? 0) / 60)} minutes with ${pct(m)} margin.`;
      if ((s.heaterW ?? 0) > 50) effect += ` Radiator heaters added ${fmt(s.heaterW ?? 0)} W in every eclipse.`;
    }
    subs.push({
      ...base("power"),
      results,
      points: pts,
      maxPoints: max,
      rating: rate(pts, max),
      effect,
      lesson: "In lunar orbit nearly 40% of each low orbit is in shadow, so arrays must carry the load and recharge the battery in the remaining time, and the thermal design's heaters become part of the power budget.",
    });
  }
  // ---- Thermal, max 1.25
  {
    const max = 1.25;
    let pts = 0;
    let effect = "No radiator design was selected.";
    const results: Spec[] = [];
    if (s.thermal && s.radiatorHotK !== undefined) {
      const hot = s.radiatorHotK;
      const heater = s.heaterW ?? 0;
      pts = max;
      if (hot > LU_REQ.radiatorMaxK) pts = max * Math.max(0, 1 - (hot - LU_REQ.radiatorMaxK) / 30);
      if (heater > 300) pts -= 0.35;
      else if (heater > 50) pts -= 0.15;
      pts = Math.max(0, pts);
      results.push(
        { label: "Hot case (sunlit, over lunar day)", value: `${fmt(hot)} K, limit ${LU_REQ.radiatorMaxK} K` },
        { label: "Cold case (shadow)", value: `${fmt(s.radiatorColdK ?? 0)} K, limit ${LU_REQ.radiatorMinK} K` },
        { label: "Heater power in shadow", value: `${fmt(heater)} W` },
      );
      const parts: string[] = [];
      if (hot > LU_REQ.radiatorMaxK)
        parts.push(`With an absorptivity of ${s.thermal.absorptivity} the radiators soaked up sunlight and lunar infrared and climbed to ${fmt(hot)} K, above the coolant loop's ${LU_REQ.radiatorMaxK} K limit; the cabin warmed and equipment had to be powered down.`);
      else parts.push(`The radiators held ${fmt(hot)} K in the hot case, inside the ${LU_REQ.radiatorMaxK} K limit.`);
      if (heater > 50) parts.push(`In shadow they would have fallen to ${fmt(s.radiatorColdK ?? 0)} K, so ${fmt(heater)} W of heaters kept the coolant from freezing.`);
      effect = parts.join(" ");
    }
    subs.push({
      ...base("thermal"),
      results,
      points: pts,
      maxPoints: max,
      rating: rate(pts, max),
      effect,
      lesson: "A good radiator coating has low solar absorptivity and high infrared emissivity. Bigger is not automatically better: an oversized radiator gets too cold in shadow and needs heater power.",
    });
  }
  // ---- Comms, max 1.25
  {
    const max = 1.25;
    let pts = 0;
    let effect = "No communications system was installed: no video, no survey data and no telemetry reached Earth.";
    const results: Spec[] = [];
    if (s.comms && s.dataFrac !== undefined) {
      pts = max * s.dataFrac;
      const oversize = (s.linkRateBps ?? 0) > 40e6;
      if (oversize) pts -= 0.25;
      pts = Math.max(0, pts);
      results.push(
        { label: "Link rate at 405,500 km", value: `${fmt((s.linkRateBps ?? 0) / 1e6, 2)} Mbit/s (margin ${fmt(s.linkMarginDb ?? 0, 1)} dB)` },
        { label: "Daily capacity / need", value: `${fmt(s.dailyCapacityGbit ?? 0)} / ${fmt(s.dailyNeedGbit ?? 0)} Gbit` },
        { label: "Data returned", value: `${Math.round(s.dataFrac * 100)}%` },
      );
      effect =
        s.dataFrac < 0.95
          ? `The ${s.comms.band}-band link closed at only ${fmt((s.linkRateBps ?? 0) / 1e6, 2)} Mbit/s, so ${Math.round((1 - s.dataFrac) * 100)}% of the daily video and imagery never reached Earth.`
          : oversize
            ? `The Ka-band dish delivered everything with a huge margin, but its ${s.comms.dcPowerW} W transmitter and ${kg(s.comms.massKg)} were far more than the mission needed.`
            : `The ${s.comms.band}-band link returned all of the daily video and survey data during the time Earth was in view.`;
    }
    subs.push({
      ...base("comms"),
      results,
      points: pts,
      maxPoints: max,
      rating: rate(pts, max),
      effect,
      lesson: "Path loss grows with the square of distance: the Moon is about 400 times farther than the Earthwatch ground passes, so the same radio delivers about 160,000 times less signal and antenna gain becomes essential.",
    });
  }

  let score = subs.reduce((a, x) => a + x.points, 0);
  // ---- Outcome rules
  const hard: string[] = [];
  if (ctx.missingStations.length > 0) {
    const names = ctx.missingStations.map((id) => LUNAR_STATIONS.find((x) => x.id === id)?.title ?? id);
    hard.push(`Required task${names.length > 1 ? "s" : ""} not submitted before the countdown ended: ${names.join(", ")}.`);
    score = Math.min(score, 4);
  }
  if (s.stage === "scrub") hard.push("The fuelled stack was heavier than the launcher's 60 t capacity, so Selene could not be launched.");
  else if (s.stage === "leo") hard.push("Selene did not carry enough propellant to complete trans-lunar injection and stayed in Earth orbit.");
  else if (s.stage === "freeReturn")
    hard.push(`Flight dynamics showed Selene could not fly the return burn after lunar orbit insertion (${fmt(Math.abs(reserve ?? 0))} m/s short). The crew stayed on the free-return trajectory, swung around the Moon and came home without a survey.`);
  const survey = s.surveyFrac ?? 0;
  if (!hard.length && ctx.missingStations.length === 0 && (s.collectedSurveyFrac ?? 0) < 0.3) hard.push(`Only ${Math.round((s.collectedSurveyFrac ?? 0) * 100)}% of the landing region was mapped at the required resolution.`);
  if (hard.length) score = Math.min(score, 3.5);
  if (!hard.length && reserve !== undefined && reserve < LU_REQ.returnReserveMps)
    findings.push(`The crew returned with ${fmt(reserve)} m/s of delta-v to spare, below the ${LU_REQ.returnReserveMps} m/s contingency the mission rules require.`);
  const engineering = lunarEngineering(d, s);
  for (const c of engineering.requirements) if (c.mandatory && c.met === false) findings.push(`${c.label}: ${c.actual}; need ${c.required}. Next attempt: ${c.advice}`);
  let outcome: Outcome;
  if (hard.length > 0 || score < 5) outcome = "FAILED";
  else if (score >= 7 && mandatoryMet(engineering.requirements)) outcome = "SUCCESS";
  else outcome = "PARTIAL";
  const rawScore = score;
  if (outcome === "FAILED") score = Math.min(4.5, score * 0.45);
  if (outcome === "PARTIAL") score = Math.min(7.4, 5 + Math.max(0, score - 5) * (2.4 / 5));
  score = Math.round(Math.max(0, Math.min(10, score)) * 10) / 10;
  if (score < Math.round(rawScore * 10) / 10)
    findings.push(
      `Subsystem points totalled ${(Math.round(rawScore * 10) / 10).toFixed(1)}; because the mission was ${outcome === "FAILED" ? "a failure" : "only partially successful"}, the final score is scaled to ${score.toFixed(1)}.`,
    );

  let headline: string;
  let summary: string;
  if (outcome === "SUCCESS") {
    headline = score >= 9.3 ? "Selene mapped the Apollo basin and came home." : "Selene completed the survey and returned safely.";
    summary = `The crew mapped ${Math.round(survey * 100)}% of the landing region at ${fmt(s.gsdM ?? 0, 2)} m and splashed down with ${fmt(reserve ?? 0)} m/s of delta-v in reserve.`;
  } else if (outcome === "PARTIAL") {
    headline = "Selene came home, but the mission fell short.";
    summary = `The crew returned safely after mapping ${Math.round(survey * 100)}% of the landing region, but at least one mission requirement was not met.`;
  } else {
    headline =
      s.stage === "scrub" ? "Selene never left the ground." : s.stage === "leo" ? "Selene could not leave Earth orbit." : s.stage === "freeReturn" ? "Selene flew past the Moon and straight home." : "The lunar survey failed.";
    summary = hard[0] ?? "The design did not meet enough of the mission requirements.";
  }
  lessons.push(
    "Delta-v is the master budget of a lunar mission: every subsystem's mass is paid for in propellant, and propellant must be paid for in launch capacity.",
    "Mission rules protect the crew: if the return burn cannot be guaranteed, the spacecraft does not enter lunar orbit.",
  );
  if (s.engine?.boilOffPerDay && s.engine.boilOffPerDay > 0.005) lessons.push("Cryogenic hydrogen is superb in a rocket stage that burns within hours, but over days it boils away unless the tanks are actively cooled.");
  if ((s.radiatorHotK ?? 0) > LU_REQ.radiatorMaxK) lessons.push("Low lunar orbit is a hot thermal environment: the sunlit surface below radiates almost as much heat as the Sun itself delivers.");
  if (s.orbit?.kind === "nrho") lessons.push("Halo orbits are excellent staging points, but survey work needs to be close to the surface.");

  const keyMetrics: Spec[] = [
    { label: "Return reserve", value: reserve === undefined ? "n/a" : reserve >= 0 ? `${fmt(reserve)} m/s` : `${fmt(-reserve)} m/s short` },
    { label: "Stack mass", value: `${fmt(s.stackMassKg / 1000, 1)} t of 60 t` },
    { label: "Landing region mapped", value: `${Math.round(survey * 100)}%` },
    { label: "Resolution", value: s.gsdM !== undefined ? `${fmt(s.gsdM, 2)} m GSD` : "n/a" },
    { label: "Power margin", value: s.arrayMargin !== undefined ? pct(s.arrayMargin) : "n/a" },
    { label: "Radiator hot case", value: s.radiatorHotK !== undefined ? `${fmt(s.radiatorHotK)} K` : "n/a" },
    { label: "Data returned", value: s.dataFrac !== undefined ? `${Math.round(s.dataFrac * 100)}%` : "n/a" },
  ];
  const contributions: Contribution[] = ctx.players.map((p) => {
    const mine = subs.filter((x) => x.committedBy === p.name);
    return {
      playerName: p.name,
      astronautId: p.astronautId,
      stations: mine.map((x) => x.title),
      pointsEarned: Math.round(mine.reduce((a, x) => a + x.points, 0) * 10) / 10,
      pointsPossible: Math.round(mine.reduce((a, x) => a + x.maxPoints, 0) * 10) / 10,
    };
  });
  return {
    version: 1,
    engineering,
    design: designSnapshot('lunar', d, `${ctx.mode}:${Math.max(1, ctx.players.length)}`),
    missionId: "lunar",
    missionName: "Lunar Survey and Return",
    difficulty: "Intermediate",
    outcome,
    score,
    headline,
    summary,
    criticalFindings: [...hard, ...findings],
    subsystems: subs,
    keyMetrics,
    lessons,
    contributions,
    timeUsedS: Math.round(ctx.timeUsedS),
    timeLimitS: ctx.timeLimitS,
    createdAt: (ctx.now ?? new Date()).toISOString(),
    mode: ctx.mode,
    seed: ctx.seed,
  };
}

export { ENGINES, LOADS, ORBITS, INSTRUMENTS, POWER, THERMAL, COMMS };
