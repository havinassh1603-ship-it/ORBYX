/**
 * EARTHWATCH — Easy mission.
 *
 * Objective: a small Earth-observation satellite must image a 25,000 km^2 flood-risk region
 * near 52 deg N every day, at 2.5 m ground sample distance or better, for at least 5 years,
 * within a USD 60M programme budget, and comply with the 25-year post-mission disposal guideline.
 *
 * Every number the evaluator uses is derived from the models in ../models with the parameters
 * below. Option quality is NOT hard-coded: the score comes from the resulting physics, so an
 * option that is optimal in one design can be inadequate in another (e.g. the small launcher).
 */
import {
  averagePassDurationS,
  eclipseDurationS,
  maxSlantRangeKm,
  orbitalPeriodS,
  sunSyncInclinationDeg,
} from "../models/orbit";
import { diffractionGsdM, effectiveGsdM, geometricGsdM, imageDataBits } from "../models/imaging";
import { PATH_EFF_DAYLIGHT, arrayEolFactor, powerBalance } from "../models/power";
import { closeLink } from "../models/link";
import { dailyDataEvents, simulateRecorder, simulateEnergy, type DataLedger, type EnergyTrace } from '../models/operations';
import { check, mandatoryMet, segmentReview, MODEL_VERSION, designSnapshot, type RequirementCheck, type EngineeringReview } from '../engineering';
import type {
  Contribution,
  Decisions,
  Gauge,
  MissionReport,
  Outcome,
  Rating,
  Spec,
  StationDef,
  SubsystemReport,
  EvalContext,
} from "../types";

// ---------------------------------------------------------------------------------------------
// Requirements and fixed assumptions
// ---------------------------------------------------------------------------------------------

export const EW_REQ = {
  targetLatitudeDeg: 52,
  dailyAreaKm2: 25_000,
  maxGsdM: 2.5,
  designLifeYears: 5,
  disposalYears: 25,
  budgetMusd: 60,
  minLaunchMargin: 0.1,
  maxDod: 0.3,
} as const;

export const EW_ASSUMPTIONS = {
  busDryMassKg: 165,
  busPowerW: 80,
  eclipseHeaterW: 10,
  busCostMusd: 16,
  opsCostMusd: 4,
  adapterMassKg: 15,
  collisionAvoidancePropKg: 6,
  systemMassMargin: 0.1,
  pixelPitchM: 5.5e-6,
  bitsPerPixel: 12,
  /** panchromatic band + 4 multispectral bands at 4x coarser GSD = 1 + 4/16 */
  bandFactor: 1.25,
  compressionRatio: 3,
  /** orbit-average imaging duty, all of it in daylight */
  imagingDutyOrbitAvg: 0.12,
  minElevationDeg: 10,
  contactEfficiency: 0.9,
  requiredEbN0Db: 4.5,
  wantedLinkMarginDb: 3,
  otherLinkLossesDb: 3,
  arrayAnnualDegradation: 0.0275,
  recorderBits: 32e9,
} as const;

// ---------------------------------------------------------------------------------------------
// Option parameter tables
// ---------------------------------------------------------------------------------------------

interface OrbitParams {
  altitudeKm: number;
  sunSync: boolean;
  inclinationDeg: number;
  contactsPerDay: number;
  /** fraction of target passes with usable solar illumination */
  illumination: number;
  /** approximate natural orbital lifetime, years (ballistic coeff ~100 kg/m^2, mid solar cycle) */
  naturalLifetimeYears: number;
  /** launcher capacity multiplier versus 600 km SSO reference */
  capacityFactor: number;
}

export const ORBITS: Record<string, OrbitParams> = {
  sso600: {
    altitudeKm: 600,
    sunSync: true,
    inclinationDeg: sunSyncInclinationDeg(600),
    contactsPerDay: 10,
    illumination: 1.0,
    naturalLifetimeYears: 18,
    capacityFactor: 1.0,
  },
  sso800: {
    altitudeKm: 800,
    sunSync: true,
    inclinationDeg: sunSyncInclinationDeg(800),
    contactsPerDay: 12,
    illumination: 1.0,
    naturalLifetimeYears: 150,
    capacityFactor: 0.89,
  },
  leo400: {
    altitudeKm: 400,
    sunSync: false,
    inclinationDeg: 51.6,
    contactsPerDay: 4,
    illumination: 0.55,
    naturalLifetimeYears: 1.4,
    capacityFactor: 1.22,
  },
};

interface ImagerParams {
  focalLengthM: number;
  apertureM: number;
  massKg: number;
  powerW: number;
  costMusd: number;
}

export const IMAGERS: Record<string, ImagerParams> = {
  kite: { focalLengthM: 1.0, apertureM: 0.18, massKg: 32, powerW: 35, costMusd: 6 },
  heron: { focalLengthM: 2.0, apertureM: 0.35, massKg: 78, powerW: 60, costMusd: 13 },
  condor: { focalLengthM: 3.6, apertureM: 0.6, massKg: 205, powerW: 115, costMusd: 30 },
};

interface PowerParams {
  arrayBolW: number;
  batteryWh: number;
  massKg: number;
  costMusd: number;
}

export const POWER: Record<string, PowerParams> = {
  compact: { arrayBolW: 200, batteryWh: 120, massKg: 29, costMusd: 2.5 },
  balanced: { arrayBolW: 300, batteryWh: 240, massKg: 41, costMusd: 4 },
  heavy: { arrayBolW: 520, batteryWh: 600, massKg: 71, costMusd: 7.5 },
};

interface CommsParams {
  band: "S" | "X";
  frequencyHz: number;
  txPowerW: number;
  txGainDbi: number;
  groundGOverTDbK: number;
  modemRateBps: number;
  dcPowerW: number;
  massKg: number;
  costMusd: number;
}

export const COMMS: Record<string, CommsParams> = {
  sband: {
    band: "S",
    frequencyHz: 2.25e9,
    txPowerW: 2,
    txGainDbi: 3,
    groundGOverTDbK: 21,
    modemRateBps: 5e6,
    dcPowerW: 15,
    massKg: 3,
    costMusd: 1,
  },
  xmga: {
    band: "X",
    frequencyHz: 8.2e9,
    txPowerW: 5,
    txGainDbi: 12,
    groundGOverTDbK: 32,
    modemRateBps: 25e6,
    dcPowerW: 40,
    massKg: 7,
    costMusd: 3,
  },
  xhga: {
    band: "X",
    frequencyHz: 8.2e9,
    txPowerW: 10,
    txGainDbi: 22,
    groundGOverTDbK: 32,
    modemRateBps: 120e6,
    dcPowerW: 85,
    massKg: 19,
    costMusd: 8,
  },
};

interface LauncherParams {
  capacity600SsoKg: number;
  costMusd: number;
}

export const LAUNCHERS: Record<string, LauncherParams> = {
  kestrel: { capacity600SsoKg: 480, costMusd: 15 },
  aster: { capacity600SsoKg: 1250, costMusd: 32 },
  borealis: { capacity600SsoKg: 4200, costMusd: 70 },
};

// ---------------------------------------------------------------------------------------------
// Station definitions (player-facing text). Option order is shuffled per session in the UI.
// ---------------------------------------------------------------------------------------------

const fmt = (n: number, d = 0) => n.toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d });

export const EARTHWATCH_STATIONS: StationDef[] = [
  {
    id: "orbit",
    subsystem: "GNC",
    title: "Orbit Planning",
    roomId: "ops",
    question: "Which operational orbit should the spacecraft fly?",
    context:
      "The target region sits near 52 deg N. Altitude sets image resolution, pass length, eclipse duration, launcher capacity and how long drag keeps the satellite up. A sun-synchronous orbit crosses the target at the same local solar time every day, which keeps shadows and lighting consistent. The spacecraft has only a small collision-avoidance propellant budget, so it cannot raise or lower its orbit later.",
    options: [
      {
        id: "sso600",
        name: "600 km sun-synchronous",
        tagline: "Inclination 97.8 deg, 10:30 local-time descending node",
        specs: [
          { label: "Period", value: `${fmt(orbitalPeriodS(600) / 60, 1)} min` },
          { label: "Eclipse", value: `${fmt(eclipseDurationS(600) / 60, 1)} min per orbit` },
          { label: "Ground contacts", value: "about 10 per day (two high-latitude stations)" },
          { label: "Natural decay", value: "about 18 years" },
        ],
      },
      {
        id: "sso800",
        name: "800 km sun-synchronous",
        tagline: "Inclination 98.6 deg, 10:30 local-time descending node",
        specs: [
          { label: "Period", value: `${fmt(orbitalPeriodS(800) / 60, 1)} min` },
          { label: "Eclipse", value: `${fmt(eclipseDurationS(800) / 60, 1)} min per orbit` },
          { label: "Ground contacts", value: "about 12 per day (two high-latitude stations)" },
          { label: "Natural decay", value: "about 150 years" },
        ],
      },
      {
        id: "leo400",
        name: "400 km, 51.6 deg inclination",
        tagline: "Shared rideshare orbit, local solar time drifts daily",
        specs: [
          { label: "Period", value: `${fmt(orbitalPeriodS(400) / 60, 1)} min` },
          { label: "Eclipse", value: `${fmt(eclipseDurationS(400) / 60, 1)} min per orbit` },
          { label: "Ground contacts", value: "about 4 per day (mid-latitude station only)" },
          { label: "Natural decay", value: "about 1.4 years" },
        ],
      },
    ],
  },
  {
    id: "imager",
    subsystem: "OBDH",
    title: "Payload Integration",
    roomId: "payload",
    question: "Which imaging telescope should fly?",
    context:
      "Resolution is set by the larger of two limits: geometric (altitude x pixel pitch / focal length, with 5.5 micrometre pixels) and diffraction (1.22 x wavelength x altitude / aperture). The science team needs 2.5 m or better. Finer pixels also mean more data to store and downlink every day, and every kilogram and watt must be carried by the rest of the spacecraft.",
    options: [
      {
        id: "kite",
        name: "KITE-1 compact imager",
        tagline: "Focal length 1.0 m, aperture 0.18 m",
        specs: [
          { label: "Mass", value: "32 kg" },
          { label: "Power while imaging", value: "35 W" },
          { label: "Cost", value: "USD 6M" },
        ],
      },
      {
        id: "heron",
        name: "HERON-2 mid-size imager",
        tagline: "Focal length 2.0 m, aperture 0.35 m",
        specs: [
          { label: "Mass", value: "78 kg" },
          { label: "Power while imaging", value: "60 W" },
          { label: "Cost", value: "USD 13M" },
        ],
      },
      {
        id: "condor",
        name: "CONDOR-3 large imager",
        tagline: "Focal length 3.6 m, aperture 0.60 m",
        specs: [
          { label: "Mass", value: "205 kg" },
          { label: "Power while imaging", value: "115 W" },
          { label: "Cost", value: "USD 30M" },
        ],
      },
    ],
  },
  {
    id: "power",
    subsystem: "EPS",
    title: "Power Bay",
    roomId: "power",
    question: "How large should the solar array and battery be?",
    context:
      "The array must carry the daylight load directly and recharge the battery for every eclipse. Arrays lose output over the mission (about 8% inherent loss plus 2.75% per year), so a 5-year mission keeps about 80% of beginning-of-life power. For thousands of charge cycles per year, Li-ion batteries should stay below about 30% depth of discharge. The bus draws 80 W, the imager draws its rated power during imaging passes (about 19% of daylight), and heaters add 10 W in eclipse.",
    options: [
      {
        id: "compact",
        name: "Compact array",
        tagline: "Single deployable wing",
        specs: [
          { label: "Array output (BOL)", value: "200 W" },
          { label: "Battery", value: "120 Wh Li-ion" },
          { label: "Mass", value: "29 kg" },
          { label: "Cost", value: "USD 2.5M" },
        ],
      },
      {
        id: "balanced",
        name: "Twin-wing array",
        tagline: "Two deployable wings",
        specs: [
          { label: "Array output (BOL)", value: "300 W" },
          { label: "Battery", value: "240 Wh Li-ion" },
          { label: "Mass", value: "41 kg" },
          { label: "Cost", value: "USD 4M" },
        ],
      },
      {
        id: "heavy",
        name: "Tracking array",
        tagline: "Two wings with sun-tracking drives",
        specs: [
          { label: "Array output (BOL)", value: "520 W" },
          { label: "Battery", value: "600 Wh Li-ion" },
          { label: "Mass", value: "71 kg" },
          { label: "Cost", value: "USD 7.5M" },
        ],
      },
    ],
  },
  {
    id: "comms",
    subsystem: "COMMS",
    title: "Comms Bay",
    roomId: "comms",
    question: "Which downlink should carry the imagery to the ground?",
    context:
      "Every image collected must reach the ground before the on-board recorder fills. Daily capacity = data rate x total contact time with the ground stations. At low Earth orbit ranges the link budget usually closes easily, so the modem's maximum rate and the number and length of passes are the real limits. Faster radios cost mass, power and money.",
    options: [
      {
        id: "sband",
        name: "S-band low-gain",
        tagline: "2.25 GHz, 2 W transmitter, 3 dBi patch",
        specs: [
          { label: "Max data rate", value: "5 Mbit/s" },
          { label: "DC power transmitting", value: "15 W" },
          { label: "Mass", value: "3 kg" },
          { label: "Cost", value: "USD 1M" },
        ],
      },
      {
        id: "xmga",
        name: "X-band medium-gain",
        tagline: "8.2 GHz, 5 W transmitter, 12 dBi isoflux antenna",
        specs: [
          { label: "Max data rate", value: "25 Mbit/s" },
          { label: "DC power transmitting", value: "40 W" },
          { label: "Mass", value: "7 kg" },
          { label: "Cost", value: "USD 3M" },
        ],
      },
      {
        id: "xhga",
        name: "X-band high-gain, gimballed",
        tagline: "8.2 GHz, 10 W transmitter, 22 dBi steerable dish",
        specs: [
          { label: "Max data rate", value: "120 Mbit/s" },
          { label: "DC power transmitting", value: "85 W" },
          { label: "Mass", value: "19 kg" },
          { label: "Cost", value: "USD 8M" },
        ],
      },
    ],
  },
  {
    id: "launch",
    subsystem: "PROP",
    title: "Launch Integration",
    roomId: "launch",
    question: "Which launch vehicle should carry the spacecraft?",
    context:
      "Launcher capacity is quoted to a 600 km sun-synchronous orbit. Higher orbits reduce it (about 11% less at 800 km); a 51.6 deg orbit increases it (about 22% more at 400 km). Programme policy requires at least 10% mass margin at launch, because spacecraft mass always grows. Launch mass = (bus + payload + power + comms) x 1.10 system margin + 6 kg propellant + 15 kg adapter.",
    options: [
      {
        id: "kestrel",
        name: "KESTREL small launcher",
        tagline: "Dedicated small-satellite rocket",
        specs: [
          { label: "Capacity (600 km SSO)", value: "480 kg" },
          { label: "Price", value: "USD 15M" },
        ],
      },
      {
        id: "aster",
        name: "ASTER medium launcher",
        tagline: "Medium-lift rocket, dedicated ride",
        specs: [
          { label: "Capacity (600 km SSO)", value: "1,250 kg" },
          { label: "Price", value: "USD 32M" },
        ],
      },
      {
        id: "borealis",
        name: "BOREALIS heavy launcher",
        tagline: "Heavy-lift rocket, dedicated ride",
        specs: [
          { label: "Capacity (600 km SSO)", value: "4,200 kg" },
          { label: "Price", value: "USD 70M" },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------------------------
// Physics computation for a (possibly partial) design
// ---------------------------------------------------------------------------------------------

export interface EarthwatchState {
  orbit?: OrbitParams;
  imager?: ImagerParams;
  power?: PowerParams;
  comms?: CommsParams;
  launcher?: LauncherParams;

  periodS?: number;
  eclipseS?: number;
  daylightS?: number;

  gsdGeomM?: number;
  gsdDiffM?: number;
  gsdM?: number;
  dailyDataBits?: number;

  contactSPerDay?: number;
  slantRangeKm?: number;
  linkRateBps?: number;
  linkMarginDb?: number;
  downlinkBitsPerDay?: number;
  downlinkRatio?: number;

  daylightLoadW?: number;
  eclipseLoadW?: number;
  requiredArrayW?: number;
  arrayEolW?: number;
  arrayMargin?: number;
  dod?: number;
  dutyFactor?: number;

  launchMassKg: number;
  capacityKg?: number;
  launchMargin?: number;

  costMusd: number;
  lifetimeYears?: number;
  deliveredFraction?: number;
  usableFraction?: number;
  data?: DataLedger;
  energy?: EnergyTrace;
}

export function computeEarthwatch(d: Decisions): EarthwatchState {
  const A = EW_ASSUMPTIONS;
  const orbit = d.orbit ? ORBITS[d.orbit] : undefined;
  const imager = d.imager ? IMAGERS[d.imager] : undefined;
  const power = d.power ? POWER[d.power] : undefined;
  const comms = d.comms ? COMMS[d.comms] : undefined;
  const launcher = d.launch ? LAUNCHERS[d.launch] : undefined;

  const s: EarthwatchState = { orbit, imager, power, comms, launcher, launchMassKg: 0, costMusd: 0 };

  // Mass and cost
  const dry = A.busDryMassKg + (imager?.massKg ?? 0) + (power?.massKg ?? 0) + (comms?.massKg ?? 0);
  s.launchMassKg = dry * (1 + A.systemMassMargin) + A.collisionAvoidancePropKg + A.adapterMassKg;
  s.costMusd =
    A.busCostMusd +
    A.opsCostMusd +
    (imager?.costMusd ?? 0) +
    (power?.costMusd ?? 0) +
    (comms?.costMusd ?? 0) +
    (launcher?.costMusd ?? 0);

  if (orbit) {
    s.periodS = orbitalPeriodS(orbit.altitudeKm);
    s.eclipseS = eclipseDurationS(orbit.altitudeKm);
    s.daylightS = s.periodS - s.eclipseS;
    s.lifetimeYears = orbit.naturalLifetimeYears;
    s.contactSPerDay =
      orbit.contactsPerDay * averagePassDurationS(orbit.altitudeKm, A.minElevationDeg) * A.contactEfficiency;
    s.slantRangeKm = maxSlantRangeKm(orbit.altitudeKm, A.minElevationDeg);
    if (launcher) {
      s.capacityKg = launcher.capacity600SsoKg * orbit.capacityFactor;
      s.launchMargin = (s.capacityKg - s.launchMassKg) / s.capacityKg;
    }
  }

  if (orbit && imager) {
    s.gsdGeomM = geometricGsdM(orbit.altitudeKm, A.pixelPitchM, imager.focalLengthM);
    s.gsdDiffM = diffractionGsdM(orbit.altitudeKm, imager.apertureM);
    s.gsdM = effectiveGsdM(orbit.altitudeKm, A.pixelPitchM, imager.focalLengthM, imager.apertureM);
    s.dailyDataBits = imageDataBits(EW_REQ.dailyAreaKm2, s.gsdM, A.bitsPerPixel, A.bandFactor, A.compressionRatio);
  }

  if (orbit && comms && s.slantRangeKm !== undefined && s.contactSPerDay !== undefined) {
    const link = closeLink(
      {
        txPowerW: comms.txPowerW,
        txGainDbi: comms.txGainDbi,
        rxGOverTDbK: comms.groundGOverTDbK,
        frequencyHz: comms.frequencyHz,
        distanceKm: s.slantRangeKm,
        otherLossesDb: A.otherLinkLossesDb,
        dataRateBps: comms.modemRateBps,
      },
      A.requiredEbN0Db,
      A.wantedLinkMarginDb,
    );
    s.linkRateBps = link.rateBps;
    s.linkMarginDb = link.marginDb;
    s.downlinkBitsPerDay = link.rateBps * s.contactSPerDay;
  }

  if (orbit && s.daylightS !== undefined && s.eclipseS !== undefined && s.periodS !== undefined) {
    const imagingDutyInDaylight = A.imagingDutyOrbitAvg * (s.periodS / s.daylightS);
    const contactFraction = (s.contactSPerDay ?? 0) / 86_400;
    const commsAvg = (comms?.dcPowerW ?? 0) * contactFraction;
    s.daylightLoadW = A.busPowerW + (imager?.powerW ?? 0) * imagingDutyInDaylight + commsAvg;
    s.eclipseLoadW = A.busPowerW + A.eclipseHeaterW + commsAvg;
    // The required array depends only on the loads and the orbit, so it is shown before the
    // power system is chosen; margins and depth of discharge need the chosen array and battery.
    const arrayEolW = power ? power.arrayBolW * arrayEolFactor(EW_REQ.designLifeYears, A.arrayAnnualDegradation) : 0;
    const pb = powerBalance({
      daylightLoadW: s.daylightLoadW,
      eclipseLoadW: s.eclipseLoadW,
      daylightS: s.daylightS,
      eclipseS: s.eclipseS,
      arrayEolW,
      batteryWh: power ? power.batteryWh : 1,
    });
    s.requiredArrayW = pb.requiredArrayW;
  }
  if (power && s.requiredArrayW !== undefined && s.daylightLoadW !== undefined && s.eclipseLoadW !== undefined && s.daylightS !== undefined && s.eclipseS !== undefined && s.periodS !== undefined) {
    const imagingDutyInDaylight = A.imagingDutyOrbitAvg * (s.periodS / s.daylightS);
    s.arrayEolW = power.arrayBolW * arrayEolFactor(EW_REQ.designLifeYears, A.arrayAnnualDegradation);
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
    // A power deficit forces the payload to be duty-cycled: the imager gets what is left.
    if (pb.arrayMargin >= 0) {
      s.dutyFactor = 1;
    } else {
      // Shortfall at the array, expressed as load the bus can no longer support.
      const deficitW = (pb.requiredArrayW - pb.arrayEolW) * PATH_EFF_DAYLIGHT;
      const imagerAvgW = (imager?.powerW ?? 1) * imagingDutyInDaylight;
      s.dutyFactor = Math.max(0, 1 - deficitW / Math.max(imagerAvgW, 1e-6));
    }
  }

  if (s.dailyDataBits !== undefined && s.downlinkBitsPerDay !== undefined) {
    s.downlinkRatio = s.downlinkBitsPerDay / s.dailyDataBits;
    const duty = s.dutyFactor ?? 1;
    const collected = s.dailyDataBits * duty;
    s.data = simulateRecorder(A.recorderBits, dailyDataEvents({ days: 3, generatedBitsPerDay: collected,
      capacityBitsPerDay: s.downlinkBitsPerDay, collectionsPerDay: 86400 / s.periodS!,
      contactsPerDay: orbit!.contactsPerDay, missedContact: d._ops === 'outage' ? 2 : -1 }));
    s.deliveredFraction = s.data.receivedBits / (s.dailyDataBits * 3);
    s.usableFraction = s.deliveredFraction * (orbit?.illumination ?? 1);
  }

  if (power && s.daylightS !== undefined && s.eclipseS !== undefined && s.arrayEolW !== undefined) {
    // Three end-of-life orbits expose recharge and eclipse depletion; no multi-year time stepping.
    const phases = Array.from({ length: 3 }, (_, i) => [
      { label: `Orbit ${i + 1} · sunlight / recharge`, durationS: s.daylightS!, generationW: s.arrayEolW! * .85, loadW: s.daylightLoadW! },
      { label: `Orbit ${i + 1} · eclipse`, durationS: s.eclipseS!, generationW: 0, loadW: s.eclipseLoadW! / .9 },
    ]).flat();
    // .65 eclipse path versus .85 direct includes charging losses; only the charging surplus is derated.
    for (const phase of phases) if (phase.generationW > phase.loadW) phase.generationW = phase.loadW + (phase.generationW - phase.loadW) * (.65 / (.85 * .9));
    s.energy = simulateEnergy(power.batteryWh, phases);
  }
  if (s.launchMargin !== undefined && s.launchMargin < 0) {
    s.data = simulateRecorder(A.recorderBits, []);
    s.deliveredFraction = 0; s.usableFraction = 0;
  }

  return s;
}

export function earthwatchRequirements(d: Decisions, s = computeEarthwatch(d)): RequirementCheck[] {
  const known = (keys: string[], predicate: boolean) => keys.every(k => !!d[k]) ? predicate : undefined;
  return [
    check('launch', 'Launch capacity and margin', 'launch', known(['orbit', 'launch', 'imager', 'power', 'comms'], (s.launchMargin ?? -1) >= EW_REQ.minLaunchMargin), `${((s.launchMargin ?? 0) * 100).toFixed(1)}% spare`, 'At least 10% spare capacity', 'Reduce spacecraft mass or select a compatible launcher within budget.'),
    check('budget', 'Programme budget', 'launch', known(['launch', 'imager', 'power', 'comms'], s.costMusd <= EW_REQ.budgetMusd), `USD ${s.costMusd.toFixed(1)}M`, 'At most USD 60M', 'Trade excess payload, radio or launcher capacity against cost.'),
    check('resolution', 'Image resolution', 'space', known(['orbit', 'imager'], (s.gsdM ?? Infinity) <= EW_REQ.maxGsdM), `${s.gsdM?.toFixed(2) ?? '—'} m GSD`, 'At most 2.5 m GSD', 'Compare altitude, focal length and aperture together.'),
    check('life', 'Operational lifetime', 'space', known(['orbit'], (s.lifetimeYears ?? 0) >= EW_REQ.designLifeYears), `${s.lifetimeYears ?? '—'} years`, 'At least 5 years', 'Choose an orbit that lasts through the planned mission.'),
    check('disposal', 'Post-mission disposal', 'space', known(['orbit'], Math.max(0, (s.lifetimeYears ?? Infinity) - EW_REQ.designLifeYears) <= EW_REQ.disposalYears), `${Math.max(0, (s.lifetimeYears ?? 0) - EW_REQ.designLifeYears)} years after mission end`, 'Re-entry within 25 years after mission end', 'Choose a lower natural-lifetime orbit; no active disposal module is modeled.'),
    check('array', 'End-of-life power', 'space', known(['orbit', 'power', 'imager', 'comms'], (s.arrayMargin ?? -1) >= 0 && (s.energy?.unservedWh ?? Infinity) < 1e-6), `${((s.arrayMargin ?? 0) * 100).toFixed(1)}% margin`, 'Non-negative array margin and no unserved energy', 'Reduce power demand or resize the array and battery.'),
    check('battery', 'Battery cycling', 'space', known(['orbit', 'power', 'comms'], (s.dod ?? Infinity) <= EW_REQ.maxDod), `${((s.dod ?? 0) * 100).toFixed(1)}% DoD`, 'At most 30% discharge per eclipse', 'Use a larger battery or reduce eclipse demand.'),
    check('data', 'Useful flood imagery on the ground', 'user', known(['orbit', 'imager', 'power', 'comms'], (s.usableFraction ?? 0) >= 1 - 1e-9), `${((s.usableFraction ?? 0) * 100).toFixed(1)}% of daily requirement`, '100% of 25,000 km²/day at required resolution', 'Check collection duty, illumination, recorder overflow and ground contacts.'),
    check('recorder', 'Recorder headroom', 'ground', s.data ? s.data.droppedBits < 1 : undefined, s.data ? `${(s.data.droppedBits / 1e9).toFixed(2)} Gbit dropped` : 'Not modeled yet', 'Prefer no overflow in the 3-day operations sample', 'Reduce payload data or increase contact throughput.', false),
  ];
}

export function earthwatchEngineering(d: Decisions, s = computeEarthwatch(d)): EngineeringReview {
  const requirements = earthwatchRequirements(d, s);
  return { modelVersion: MODEL_VERSION, durationS: EW_REQ.designLifeYears * 365.25 * 86400, requirements,
    assumptions: ['Synthetic hardware and cost tables; simplified circular orbits, no ephemeris.', '32 Gbit recorder; reject newest data on overflow. Three representative days, not a five-year propagation.', 'Contacts are uniformly spaced access windows. The outage test misses contact 3 each day.', 'Imager points at nadir; RF tracking is ideal within the existing 3 dB combined loss allowance.', 'Energy trace: three end-of-life orbits with average phase loads and existing path efficiencies.', 'Natural re-entry lifetime is a teaching estimate. The 25-year rule is this scenario’s requirement.'],
    data: s.data, energy: s.energy, segments: segmentReview(requirements), timeline: [
      { timeS: 0, label: (s.launchMargin ?? 0) < 0 ? 'Launch rejected' : 'Launch / commissioning', detail: `${s.launchMassKg.toFixed(0)} kg; ${((s.launchMargin ?? 0) * 100).toFixed(1)}% launcher margin` },
      ...(s.data?.events ?? []).map(e => ({ timeS: e.timeS, label: e.label, detail: e.kind === 'missed' ? 'No data received; recorder retains its queue.' : `${(e.movedBits / 1e9).toFixed(2)} Gbit ${e.kind === 'collect' ? 'stored' : 'received'}; queue ${(e.storedBits / 1e9).toFixed(2)} Gbit` })),
      { timeS: EW_REQ.designLifeYears * 365.25 * 86400, label: 'End of mission', detail: 'Evaluate natural disposal after the five-year design life.' },
    ] };
}

// ---------------------------------------------------------------------------------------------
// HUD gauges (live consequences while the crew is still deciding)
// ---------------------------------------------------------------------------------------------

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const pct = (x: number) => `${x >= 0 ? "+" : ""}${Math.round(x * 100)}%`;

export function earthwatchGauges(d: Decisions): Gauge[] {
  const s = computeEarthwatch(d);
  const g: Gauge[] = [];

  if (s.capacityKg !== undefined && s.launchMargin !== undefined) {
    g.push({
      id: "mass",
      label: "Launch mass",
      display: `${fmt(s.launchMassKg)} / ${fmt(s.capacityKg)} kg`,
      fill: clamp01(s.launchMassKg / s.capacityKg),
      status: s.launchMargin < 0 ? "bad" : s.launchMargin < EW_REQ.minLaunchMargin ? "warn" : "ok",
      hint:
        s.launchMargin < 0
          ? "Spacecraft is heavier than the launcher can lift to this orbit."
          : `Launch mass margin ${pct(s.launchMargin)} (policy: at least +10%).`,
    });
  } else {
    g.push({
      id: "mass",
      label: "Launch mass",
      display: `${fmt(s.launchMassKg)} kg`,
      fill: null,
      status: "unknown",
      hint: "Choose an orbit and a launcher to see the launch margin.",
    });
  }

  if (s.arrayMargin !== undefined && s.requiredArrayW !== undefined && s.arrayEolW !== undefined) {
    const dodBad = (s.dod ?? 0) > EW_REQ.maxDod;
    g.push({
      id: "power",
      label: "Power margin",
      display: `${fmt(s.arrayEolW)} W vs ${fmt(s.requiredArrayW)} W needed`,
      fill: clamp01(s.arrayEolW / s.requiredArrayW / 1.5),
      status: s.arrayMargin < 0 ? "bad" : s.arrayMargin < 0.05 || dodBad ? "warn" : "ok",
      hint: `End-of-life array margin ${pct(s.arrayMargin)}; battery depth of discharge ${Math.round((s.dod ?? 0) * 100)}% per eclipse.`,
    });
  } else {
    g.push({ id: "power", label: "Power margin", display: "not sized", fill: null, status: "unknown", hint: "Needs an orbit and a power system." });
  }

  if (s.downlinkRatio !== undefined) {
    g.push({
      id: "data",
      label: "Data downlink",
      display: `${fmt((s.deliveredFraction ?? 0) * 100)}% received; ${fmt((s.data?.storedBits ?? 0) / 1e9, 1)} Gbit queued`,
      fill: clamp01(s.deliveredFraction ?? 0),
      status: (s.deliveredFraction ?? 0) >= 1 - 1e-9 ? 'ok' : (s.deliveredFraction ?? 0) < .4 ? 'bad' : 'warn',
      hint: `32 Gbit recorder; ${fmt((s.data?.droppedBits ?? 0) / 1e9, 1)} Gbit dropped over 3 days. Nominal daily radio capacity ${fmt((s.downlinkBitsPerDay ?? 0) / 1e9, 1)} Gbit.`,
    });
  } else {
    g.push({ id: "data", label: "Data downlink", display: "unknown", fill: null, status: "unknown", hint: "Needs an orbit, an imager and a downlink." });
  }

  if (s.gsdM !== undefined) {
    g.push({
      id: "gsd",
      label: "Resolution",
      display: `${fmt(s.gsdM, 2)} m GSD (need <= 2.5 m)`,
      fill: clamp01(EW_REQ.maxGsdM / s.gsdM),
      status: s.gsdM > EW_REQ.maxGsdM ? "bad" : "ok",
      hint: `Geometric ${fmt(s.gsdGeomM ?? 0, 2)} m, diffraction limit ${fmt(s.gsdDiffM ?? 0, 2)} m.`,
    });
  } else {
    g.push({ id: "gsd", label: "Resolution", display: "unknown", fill: null, status: "unknown", hint: "Needs an orbit and an imager." });
  }

  g.push({
    id: "budget",
    label: "Programme cost",
    display: `USD ${fmt(s.costMusd, 1)}M / ${EW_REQ.budgetMusd}M`,
    fill: clamp01(s.costMusd / EW_REQ.budgetMusd),
    status: s.costMusd > EW_REQ.budgetMusd * 1.2 ? "bad" : s.costMusd > EW_REQ.budgetMusd ? "warn" : "ok",
    hint: "Includes USD 16M bus and USD 4M operations.",
  });

  return g;
}

// ---------------------------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------------------------

export type { EvalContext } from "../types";

function rate(points: number, max: number): Rating {
  const r = points / max;
  if (r >= 0.9) return "strong";
  if (r >= 0.6) return "adequate";
  if (r > 0.15) return "weak";
  return "critical";
}

function optionOf(stationId: string, optionId: string | undefined) {
  const st = EARTHWATCH_STATIONS.find((x) => x.id === stationId)!;
  const op = st.options.find((o) => o.id === optionId);
  return { st, op };
}

export function evaluateEarthwatch(d: Decisions, ctx: EvalContext): MissionReport {
  const s = computeEarthwatch(d);
  const subs: SubsystemReport[] = [];
  const findings: string[] = [];
  const lessons: string[] = [];

  const base = (stationId: string) => {
    const { st, op } = optionOf(stationId, d[stationId]);
    return {
      stationId,
      subsystem: st.subsystem,
      title: st.title,
      choiceName: op ? op.name : "Not submitted",
      selectedSpecs: op ? op.specs : [],
      committedBy: ctx.committedBy[stationId],
    };
  };

  // ---- Orbit (GNC), max 2.0
  {
    const max = 2.0;
    let pts = 0;
    const results: Spec[] = [];
    let effect = "No orbit was selected, so nothing else in the design could be evaluated reliably.";
    let lesson = "Orbit choice sets resolution, lighting, ground contact, eclipse power and lifetime at once.";
    if (s.orbit) {
      const lifeFactor = Math.min(1, (s.lifetimeYears ?? 0) / EW_REQ.designLifeYears);
      pts = max * s.orbit.illumination * lifeFactor;
      const debris = (s.lifetimeYears ?? 0) > EW_REQ.disposalYears;
      if (debris) pts -= 0.6;
      pts = Math.max(0, pts);
      results.push(
        { label: "Altitude / inclination", value: `${s.orbit.altitudeKm} km / ${fmt(s.orbit.inclinationDeg, 1)} deg` },
        { label: "Orbital period", value: `${fmt((s.periodS ?? 0) / 60, 1)} min` },
        { label: "Eclipse per orbit", value: `${fmt((s.eclipseS ?? 0) / 60, 1)} min` },
        { label: "Usable lighting on target passes", value: `${Math.round(s.orbit.illumination * 100)}%` },
        { label: "Natural orbital lifetime", value: `about ${fmt(s.lifetimeYears ?? 0, 1)} years` },
      );
      const parts: string[] = [];
      if (s.orbit.sunSync) parts.push("The sun-synchronous orbit revisited the target at the same local time each day, so images were comparable.");
      else parts.push("Local solar time drifted every day; many target passes happened in low or no sunlight, so a large share of images was unusable for flood mapping.");
      if (lifeFactor < 1) {
        parts.push(`Drag brought the spacecraft down after about ${fmt(s.lifetimeYears ?? 0, 1)} years, short of the ${EW_REQ.designLifeYears}-year requirement.`);
        findings.push(`Orbital lifetime of about ${fmt(s.lifetimeYears ?? 0, 1)} years did not meet the ${EW_REQ.designLifeYears}-year design life.`);
      }
      if (debris) {
        parts.push(`At this altitude the spacecraft would stay in orbit for roughly ${fmt(s.lifetimeYears ?? 0)} years after the mission, breaking the ${EW_REQ.disposalYears}-year disposal guideline with no propellant to deorbit.`);
        findings.push("Post-mission disposal guideline (25 years) not met: the spacecraft becomes long-lived debris.");
      }
      effect = parts.join(" ");
      lesson =
        "Lower orbits sharpen images but decay faster; higher orbits last longer but blur images and linger as debris. Sun-synchronous orbits keep lighting consistent for Earth observation.";
    }
    subs.push({ ...base("orbit"), results, points: pts, maxPoints: max, rating: rate(pts, max), effect, lesson });
  }

  // ---- Imager (OBDH), max 2.0
  {
    const max = 2.0;
    let pts = 0;
    const results: Spec[] = [];
    let effect = "No payload was integrated.";
    if (s.gsdM !== undefined) {
      const ok = s.gsdM <= EW_REQ.maxGsdM;
      pts = ok ? max : max * Math.pow(EW_REQ.maxGsdM / s.gsdM, 2) * 0.5;
      results.push(
        { label: "Geometric GSD", value: `${fmt(s.gsdGeomM ?? 0, 2)} m` },
        { label: "Diffraction limit", value: `${fmt(s.gsdDiffM ?? 0, 2)} m` },
        { label: "Effective GSD", value: `${fmt(s.gsdM, 2)} m (required <= ${EW_REQ.maxGsdM} m)` },
        { label: "Imagery generated per day", value: `${fmt((s.dailyDataBits ?? 0) / 1e9, 1)} Gbit` },
      );
      effect = ok
        ? `Images resolved ${fmt(s.gsdM, 2)} m on the ground, meeting the science requirement.`
        : `Images resolved only ${fmt(s.gsdM, 2)} m, too coarse to map field and flood boundaries at the required ${EW_REQ.maxGsdM} m.`;
      if (!ok) findings.push(`Resolution requirement missed: ${fmt(s.gsdM, 2)} m GSD versus ${EW_REQ.maxGsdM} m required.`);
      if (ok && s.gsdM < 1.2) effect += " That is much finer than required, which multiplied the daily data volume and pushed mass, power and cost upward.";
    } else if (s.imager) {
      effect = "The imager was selected but no orbit was chosen, so its resolution is undefined.";
    }
    subs.push({
      ...base("imager"),
      results,
      points: pts,
      maxPoints: max,
      rating: rate(pts, max),
      effect,
      lesson: "Resolution depends on altitude, focal length and aperture together. Exceeding the requirement is not free: data volume grows with 1/GSD squared.",
    });
  }

  // ---- Comms, max 2.0
  {
    const max = 2.0;
    let pts = 0;
    const results: Spec[] = [];
    let effect = "No downlink was installed.";
    if (s.downlinkRatio !== undefined) {
      pts = max * Math.min(1, s.downlinkRatio);
      const oversized = s.downlinkRatio > 4;
      if (oversized) pts -= 0.25;
      results.push(
        { label: "Contact time per day", value: `${fmt((s.contactSPerDay ?? 0) / 60, 1)} min` },
        { label: "Worst-case slant range", value: `${fmt(s.slantRangeKm ?? 0)} km` },
        { label: "Data rate achieved", value: `${fmt((s.linkRateBps ?? 0) / 1e6, 1)} Mbit/s (link margin ${fmt(s.linkMarginDb ?? 0, 1)} dB)` },
        { label: "Downlink capacity per day", value: `${fmt((s.downlinkBitsPerDay ?? 0) / 1e9, 1)} Gbit` },
        { label: "Share of imagery downlinked", value: `${Math.round(Math.min(1, s.downlinkRatio) * 100)}%` },
      );
      if (s.downlinkRatio < 1) {
        effect = `The finite recorder returned ${Math.round((s.deliveredFraction ?? 0) * 100)}% of required imagery in the three-day sample. ${(s.data!.storedBits / 1e9).toFixed(2)} Gbit remains queued and ${(s.data!.droppedBits / 1e9).toFixed(2)} Gbit was rejected on overflow.`;
        findings.push(`Downlink could return only ${Math.round(s.downlinkRatio * 100)}% of daily imagery.`);
      } else {
        effect = `The operations sample received ${Math.round((s.deliveredFraction ?? 0) * 100)}% of required imagery; ${(s.data!.storedBits / 1e9).toFixed(2)} Gbit remains queued and ${(s.data!.droppedBits / 1e9).toFixed(2)} Gbit was dropped.`;
        if (oversized) effect += ` Capacity was about ${fmt(s.downlinkRatio, 1)} times the need, so the radio carried mass, power and cost the mission did not use.`;
      }
    } else if (s.comms) {
      effect = "The radio was selected, but without an orbit and payload its throughput could not be judged.";
    }
    subs.push({
      ...base("comms"),
      results,
      points: Math.max(0, pts),
      maxPoints: max,
      rating: rate(Math.max(0, pts), max),
      effect,
      lesson: "Daily data return equals data rate times contact time. In low Earth orbit the modem rate and pass time limit throughput long before the link budget does.",
    });
  }

  // ---- Power (EPS), max 1.5
  {
    const max = 1.5;
    let pts = 0;
    const results: Spec[] = [];
    let effect = "No power system was installed.";
    if (s.arrayMargin !== undefined) {
      const m = s.arrayMargin;
      if (m < 0) pts = max * Math.max(0, 1 + 3 * m);
      else if (m < 0.05) pts = 1.2;
      else if (m <= 0.6) pts = max;
      else pts = 1.1;
      const dod = s.dod ?? 0;
      if (dod > 0.5) pts -= 0.8;
      else if (dod > EW_REQ.maxDod) pts -= 0.4;
      pts = Math.max(0, pts);
      results.push(
        { label: "Daylight / eclipse load", value: `${fmt(s.daylightLoadW ?? 0, 1)} W / ${fmt(s.eclipseLoadW ?? 0, 1)} W` },
        { label: "Array needed at end of life", value: `${fmt(s.requiredArrayW ?? 0)} W` },
        { label: "Array available at end of life", value: `${fmt(s.arrayEolW ?? 0)} W (${pct(m)})` },
        { label: "Battery depth of discharge", value: `${Math.round(dod * 100)}% per eclipse (limit ${EW_REQ.maxDod * 100}%)` },
      );
      const parts: string[] = [];
      if (m < 0) {
        parts.push(`The array fell ${Math.round(-m * 100)}% short by end of life, so operators had to switch the imager off for part of each orbit (payload duty reduced to ${Math.round((s.dutyFactor ?? 0) * 100)}%).`);
        findings.push(`Power deficit of ${Math.round(-m * 100)}% forced the payload to be duty-cycled.`);
      } else if (m > 0.6) {
        parts.push(`The array produced ${pct(m)} more power than needed: safe, but the extra wings added mass and cost the mission did not need.`);
      } else {
        parts.push(`The array covered every orbit with a ${pct(m)} end-of-life margin.`);
      }
      if (dod > EW_REQ.maxDod) {
        parts.push(`Each eclipse drained the battery to ${Math.round(dod * 100)}% depth, which wears Li-ion cells quickly over about 5,500 cycles a year.`);
        findings.push(`Battery cycled to ${Math.round(dod * 100)}% depth of discharge, above the ${EW_REQ.maxDod * 100}% guideline.`);
      }
      effect = parts.join(" ");
    }
    subs.push({
      ...base("power"),
      results,
      points: pts,
      maxPoints: max,
      rating: rate(pts, max),
      effect,
      lesson: "Size the array for end-of-life power, including the energy needed to recharge after every eclipse, and size the battery for depth of discharge, not just total energy.",
    });
  }

  // ---- Launch (PROP), max 1.25
  {
    const max = 1.25;
    let pts = 0;
    const results: Spec[] = [];
    let effect = "No launch vehicle was booked.";
    if (s.launchMargin !== undefined && s.capacityKg !== undefined) {
      const m = s.launchMargin;
      if (m < 0) pts = 0;
      else if (m < EW_REQ.minLaunchMargin) pts = 0.8;
      else if (m <= 0.6) pts = max;
      else pts = 0.9;
      results.push(
        { label: "Spacecraft launch mass", value: `${fmt(s.launchMassKg)} kg` },
        { label: "Launcher capacity to this orbit", value: `${fmt(s.capacityKg)} kg` },
        { label: "Mass margin", value: pct(m) },
      );
      if (m < 0) {
        effect = `The ${fmt(s.launchMassKg)} kg spacecraft exceeded the launcher's ${fmt(s.capacityKg)} kg capability to this orbit. The vehicle could not reach orbit with this payload.`;
      } else if (m < EW_REQ.minLaunchMargin) {
        effect = `The launch succeeded, but with only ${pct(m)} margin the programme carried serious schedule risk from normal mass growth.`;
        findings.push(`Launch mass margin of ${pct(m)} was below the 10% policy minimum.`);
      } else if (m > 0.6) {
        effect = `The launcher had ${pct(m)} spare capacity: the spacecraft rode a much larger, more expensive rocket than it needed.`;
      } else {
        effect = `The launcher delivered the spacecraft with a healthy ${pct(m)} mass margin.`;
      }
    } else if (s.launcher) {
      effect = "A launcher was booked but no orbit was chosen, so its capacity could not be checked.";
    }
    subs.push({
      ...base("launch"),
      results,
      points: pts,
      maxPoints: max,
      rating: rate(pts, max),
      effect,
      lesson: "Every kilogram chosen elsewhere lands on the launcher. Keep a mass margin, but do not buy a rocket several times larger than the spacecraft.",
    });
  }

  // ---- Programme budget (shared), max 1.25
  const budgetMax = 1.25;
  const overrun = (s.costMusd - EW_REQ.budgetMusd) / EW_REQ.budgetMusd;
  const budgetPts = overrun <= 0 ? budgetMax : budgetMax * Math.max(0, 1 - overrun / 0.3);
  if (overrun > 0) findings.push(`Programme cost USD ${fmt(s.costMusd, 1)}M exceeded the USD ${EW_REQ.budgetMusd}M budget by ${Math.round(overrun * 100)}%.`);

  let score = subs.reduce((a, x) => a + x.points, 0) + budgetPts;

  // ---- Outcome rules
  let outcome: Outcome;
  const launchFailed = s.launchMargin !== undefined && s.launchMargin < 0;
  // A spacecraft that never reached orbit returns no imagery, whatever its design could have done.
  const usable = launchFailed ? 0 : s.usableFraction ?? 0;
  const hard: string[] = [];
  if (ctx.missingStations.length > 0) {
    const names = ctx.missingStations.map((id) => EARTHWATCH_STATIONS.find((x) => x.id === id)?.title ?? id);
    hard.push(`Required task${names.length > 1 ? "s" : ""} not submitted before the countdown ended: ${names.join(", ")}.`);
    score = Math.min(score, 4);
  }
  if (launchFailed) {
    hard.push("The spacecraft exceeded the launcher's capacity to the chosen orbit; the launch could not reach orbit.");
    score = Math.min(score, 3);
  }
  if (!launchFailed && ctx.missingStations.length === 0 && usable < 0.4) {
    hard.push(`Only ${Math.round(usable * 100)}% of the required daily imagery was usable on the ground.`);
  }
  const engineering = earthwatchEngineering(d, s);
  for (const c of engineering.requirements) if (c.mandatory && c.met === false) findings.push(`${c.label}: ${c.actual}; need ${c.required}. Next attempt: ${c.advice}`);
  if (hard.length > 0 || score < 5) outcome = "FAILED";
  else if (score >= 7 && mandatoryMet(engineering.requirements)) outcome = "SUCCESS";
  else outcome = "PARTIAL";

  // The outcome bands the score so a mission that missed requirements never outscores one that
  // met them, while better designs still rank higher inside each band:
  //   FAILED 0.0-4.5, PARTIAL 5.0-7.4, SUCCESS 7.0-10 (unchanged).
  const rawScore = score;
  if (outcome === "FAILED") score = Math.min(4.5, score * 0.45);
  if (outcome === "PARTIAL") score = Math.min(7.4, 5 + Math.max(0, score - 5) * (2.4 / 5));
  score = Math.round(Math.max(0, Math.min(10, score)) * 10) / 10;
  if (score < Math.round(rawScore * 10) / 10) {
    findings.push(
      `Subsystem points totalled ${(Math.round(rawScore * 10) / 10).toFixed(1)}; because the mission was ${outcome === "FAILED" ? "a failure" : "only partially successful"}, the final score is scaled to ${score.toFixed(1)}.`,
    );
  }

  const criticalFindings = [...hard, ...findings];

  // ---- Narrative
  let headline: string;
  let summary: string;
  if (outcome === "SUCCESS") {
    headline = score >= 9.5 ? "Earthwatch is imaging every day." : "Earthwatch is operational, with room to improve.";
    summary = `The spacecraft reached orbit and returned ${Math.round(usable * 100)}% of the required daily imagery at ${fmt(s.gsdM ?? 0, 2)} m resolution for a programme cost of USD ${fmt(s.costMusd, 1)}M.`;
  } else if (outcome === "PARTIAL") {
    headline = "Earthwatch flew, but the mission fell short.";
    summary = `The spacecraft operated, but delivered ${Math.round(usable * 100)}% of the required usable imagery and missed at least one mission requirement.`;
  } else {
    headline = launchFailed ? "Earthwatch never reached orbit." : "Earthwatch did not achieve its mission.";
    summary = hard[0] ?? "The design did not meet enough of the mission requirements to be considered operational.";
  }

  lessons.push(
    "Subsystems are coupled: payload choices drive power, data, mass and cost, so decisions made in one room change what is right in another.",
    "Margins matter at every interface: power, mass, data and budget each need headroom, but oversizing one of them steals resources from the others.",
  );
  if (s.orbit && !s.orbit.sunSync) lessons.push("For repeat imaging of the same region, a sun-synchronous orbit keeps lighting conditions comparable from day to day.");
  if ((s.downlinkRatio ?? 1) < 1) lessons.push("Check the data chain end to end: the imager's output per day must fit through the radio during the available ground contacts.");
  if (overrun > 0) lessons.push("Large components cascade into cost: a heavier payload often forces a bigger power system and a bigger launcher as well.");

  const keyMetrics: Spec[] = [
    { label: "Usable imagery delivered", value: launchFailed ? "0% (never reached orbit)" : `${Math.round(usable * 100)}% of requirement` },
    { label: "Resolution", value: s.gsdM !== undefined ? `${fmt(s.gsdM, 2)} m GSD` : "n/a" },
    { label: "Launch mass margin", value: s.launchMargin !== undefined ? pct(s.launchMargin) : "n/a" },
    { label: "Power margin (EOL)", value: s.arrayMargin !== undefined ? pct(s.arrayMargin) : "n/a" },
    { label: "Programme cost", value: `USD ${fmt(s.costMusd, 1)}M of ${EW_REQ.budgetMusd}M` },
    { label: "Orbital lifetime", value: s.lifetimeYears !== undefined ? `about ${fmt(s.lifetimeYears, 1)} years` : "n/a" },
  ];

  const contributions: Contribution[] = ctx.players.map((p) => {
    const mine = subs.filter((x) => x.committedBy === p.name);
    return {
      playerName: p.name,
      astronautId: p.astronautId,
      stations: mine.map((x) => x.title),
      pointsEarned: Math.round(mine.reduce((a, x) => a + x.points, 0) * 10) / 10,
      pointsPossible: mine.reduce((a, x) => a + x.maxPoints, 0),
    };
  });

  subs.forEach((x) => (x.points = Math.round(x.points * 100) / 100));

  return {
    version: 1,
    engineering,
    design: designSnapshot('earthwatch', d, `${ctx.mode}:${Math.max(1, ctx.players.length)}`),
    missionId: "earthwatch",
    missionName: "Earthwatch",
    difficulty: "Easy",
    outcome,
    score,
    headline,
    summary,
    criticalFindings,
    subsystems: subs,
    keyMetrics: [...keyMetrics, { label: "Programme budget points", value: `${fmt(budgetPts, 2)} / ${budgetMax}` }],
    lessons,
    contributions,
    timeUsedS: Math.round(ctx.timeUsedS),
    timeLimitS: ctx.timeLimitS,
    createdAt: (ctx.now ?? new Date()).toISOString(),
    mode: ctx.mode,
    seed: ctx.seed,
  };
}
