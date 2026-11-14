import { EVAC_MAP, LAZARUS_MAP } from '../data/expeditions';
import { EVAC_STATIONS, evacGauges, podModel, emptyAdvancedReport } from '../sim/missions/evac';
import type { Decisions, Gauge, MissionReport, StationDef } from "../sim/types";
import type { MapDef } from "../data/maps";
import { EARTHWATCH_MAP, LUNAR_MAP } from "../data/maps";
import { LUNAR_STATIONS, LU_REQ, computeLunar, evaluateLunar, lunarGauges, lunarEngineering, type LunarStage } from "../sim/missions/lunar";
import type { EngineeringReview } from '../sim/engineering';
import {
  EARTHWATCH_STATIONS,
  EW_REQ,
  earthwatchGauges,
  evaluateEarthwatch,
  computeEarthwatch,
  earthwatchEngineering,
  type EvalContext,
} from "../sim/missions/earthwatch";

export type Difficulty = "Easy" | "Intermediate" | "Hard" | "Extreme";

export interface MissionDef {
  id: string;
  name: string;
  difficulty: Difficulty;
  tagline: string;
  /** Whether this milestone ships a playable build of the mission */
  playable: boolean;
  /** Mission id that must be completed to unlock this one (null = always unlocked) */
  unlockedBy: string | null;
  timeLimitS: number;
  story: string[];
  objectives: string[];
  requirements: { label: string; value: string }[];
  stations: StationDef[];
  map: MapDef | null;
  gauges(d: Decisions): Gauge[];
  evaluate(d: Decisions, ctx: EvalContext): MissionReport;
  engineering?(d: Decisions): EngineeringReview;
  /** Extra outcome data the cinematic needs */
  cinematic(d: Decisions): CinematicInfo;
  /** Short live readout shown inside a station panel */
  stationReadout(stationId: string, d: Decisions): { label: string; value: string }[];
}

export interface EarthwatchCinematic {
  kind: "earthwatch";
  altitudeKm: number;
  launchFails: boolean;
  dataReturn: number;
  sunSync: boolean;
  recorderSummary: string;
}
export interface LunarCinematic {
  kind: "lunar";
  stage: LunarStage;
  orbitKind: "llo" | "nrho";
  surveyAltKm: number;
  /** usable fraction of the landing region mapped */
  surveyFrac: number;
  dataFrac: number;
  reserveMps: number;
  thinReturn: boolean;
  recorderSummary: string;
}
export interface AdvancedCinematic {kind:'expedition';missionId:string;crewCount?:number;resultTrace?:string;}
export type CinematicInfo = EarthwatchCinematic | LunarCinematic | AdvancedCinematic;


const f = (n: number | undefined, d = 0, unit = "") =>
  n === undefined || !isFinite(n) ? "n/a" : `${n.toLocaleString("en-GB", { maximumFractionDigits: d, minimumFractionDigits: d })}${unit}`;

export const MISSIONS: MissionDef[] = [
  {
    id: "earthwatch",
    name: "Earthwatch",
    difficulty: "Easy",
    tagline: "Design a flood-watch satellite and put it in the right orbit.",
    playable: true,
    unlockedBy: null,
    timeLimitS: 12 * 60,
    story: [
      "Spring floods along the North Sea coast are getting worse. The regional agency wants a small satellite that images the 25,000 square-kilometre flood plain every day, sharply enough to map field boundaries and waterlines.",
      "Your crew has twelve minutes before the design review. Walk the Integration Centre, make the call at each workstation, then take the design to the Flight Director console in Mission Control and run the mission.",
    ],
    objectives: [
      "Choose the operational orbit (Mission Control)",
      "Integrate the imaging payload (Payload Clean Room)",
      "Size the solar array and battery (Power Bay)",
      "Choose the downlink radio (Comms Bay)",
      "Book a launch vehicle (Launch Integration Hall)",
      "Run the mission from the Flight Director console",
    ],
    requirements: [
      { label: "Target", value: `${EW_REQ.dailyAreaKm2.toLocaleString("en-GB")} km2 near ${EW_REQ.targetLatitudeDeg} deg N, imaged daily` },
      { label: "Resolution", value: `${EW_REQ.maxGsdM} m ground sample distance or better` },
      { label: "Design life", value: `at least ${EW_REQ.designLifeYears} years` },
      { label: "Disposal", value: `re-enter within ${EW_REQ.disposalYears} years of mission end` },
      { label: "Budget", value: `USD ${EW_REQ.budgetMusd}M including launch` },
      { label: "Launch margin", value: "at least 10% spare launcher capacity" },
    ],
    stations: EARTHWATCH_STATIONS,
    map: EARTHWATCH_MAP,
    gauges: earthwatchGauges,
    evaluate: evaluateEarthwatch,
    engineering: earthwatchEngineering,
    cinematic(d) {
      const s = computeEarthwatch(d);
      return {
        kind: "earthwatch",
        altitudeKm: s.orbit?.altitudeKm ?? 600,
        launchFails: s.launchMargin !== undefined && s.launchMargin < 0,
        dataReturn: s.usableFraction ?? 0,
        sunSync: s.orbit?.sunSync ?? true,
        recorderSummary: `${((s.data?.receivedBits ?? 0) / 1e9).toFixed(1)} Gbit received · ${((s.data?.storedBits ?? 0) / 1e9).toFixed(1)} queued · ${((s.data?.droppedBits ?? 0) / 1e9).toFixed(1)} dropped`,
      };
    },
    stationReadout(stationId, d) {
      const s = computeEarthwatch(d);
      switch (stationId) {
        case "orbit":
          return [
            { label: "Imager chosen", value: s.imager ? `f = ${s.imager.focalLengthM} m, D = ${s.imager.apertureM} m` : "not yet" },
            { label: "Current launch mass", value: f(s.launchMassKg, 0, " kg") },
          ];
        case "imager":
          return [
            { label: "Orbit altitude", value: s.orbit ? `${s.orbit.altitudeKm} km` : "not yet chosen" },
            { label: "Pixel pitch", value: "5.5 micrometres" },
            { label: "Required GSD", value: `${EW_REQ.maxGsdM} m or better` },
            { label: "Current GSD", value: f(s.gsdM, 2, " m") },
          ];
        case "power":
          return [
            { label: "Orbit period / eclipse", value: s.periodS ? `${f(s.periodS / 60, 1)} / ${f((s.eclipseS ?? 0) / 60, 1)} min` : "orbit not chosen" },
            { label: "Imager power", value: s.imager ? `${s.imager.powerW} W while imaging` : "payload not chosen (0 W assumed)" },
            { label: "Daylight / eclipse load", value: s.daylightLoadW ? `${f(s.daylightLoadW, 1)} / ${f(s.eclipseLoadW, 1)} W` : "n/a" },
            { label: "Array needed at end of life", value: f(s.requiredArrayW, 0, " W") },
          ];
        case "comms":
          return [
            { label: "Imagery per day", value: s.dailyDataBits ? f(s.dailyDataBits / 1e9, 1, " Gbit") : "needs orbit + imager" },
            { label: "Contact time per day", value: s.contactSPerDay ? f(s.contactSPerDay / 60, 1, " min") : "orbit not chosen" },
            { label: "Worst-case slant range", value: f(s.slantRangeKm, 0, " km") },
          ];
        case "launch":
          return [
            { label: "Current launch mass", value: f(s.launchMassKg, 0, " kg") },
            { label: "Orbit", value: s.orbit ? `${s.orbit.altitudeKm} km, ${s.orbit.sunSync ? "sun-synchronous" : `${s.orbit.inclinationDeg} deg`}` : "not chosen" },
            { label: "Programme cost so far", value: `USD ${f(s.costMusd, 1)}M of ${EW_REQ.budgetMusd}M` },
          ];
        default:
          return [];
      }
    },
  },
  {
    id: "lunar",
    name: "Lunar Survey and Return",
    difficulty: "Intermediate",
    tagline: "Reach lunar orbit, survey a landing site and bring the crew home.",
    playable: true,
    unlockedBy: "earthwatch",
    timeLimitS: 15 * 60,
    story: [
      "The landing programme has chosen a candidate site on the far side of the Moon: the smooth floor of the Apollo basin, near 36 degrees south. Before anyone lands there, a crew must map it from orbit, boulder by boulder.",
      "Your crew is aboard Selene, a three-person spacecraft fuelled in a 400 km Earth parking orbit. Every system draws on the same delta-v budget: one engine must push the ship to the Moon, into orbit and back home with fuel to spare. You have fifteen minutes to configure the ship before the departure window closes.",
    ],
    objectives: [
      "Choose the main engine and propellant (Engine Room)",
      "Load the propellant (Tank Farm)",
      "Choose the lunar survey orbit (Command Deck)",
      "Install the survey instrument (Survey Bay)",
      "Size the arrays and battery (Power Bay)",
      "Choose the radiators (Thermal Control)",
      "Choose the communications system (Comms Deck)",
      "Run the mission from the Flight Director console",
    ],
    requirements: [
      { label: "Survey", value: `${LU_REQ.siteAreaKm2.toLocaleString("en-GB")} km2 of the Apollo basin at ${LU_REQ.maxGsdM} m GSD or better` },
      { label: "Return", value: `crew home with at least ${LU_REQ.returnReserveMps} m/s of delta-v in reserve` },
      { label: "Launch", value: `fuelled stack within the ${LU_REQ.launchCapacityKg / 1000} t launch capacity` },
      { label: "Thermal", value: `radiators between ${LU_REQ.radiatorMinK} K and ${LU_REQ.radiatorMaxK} K` },
      { label: "Downlink", value: "6 h of HD crew video per day plus all survey data" },
      { label: "Duration", value: `${LU_REQ.transitDays} days each way, ${LU_REQ.surveyDays} days surveying` },
    ],
    stations: LUNAR_STATIONS,
    map: LUNAR_MAP,
    gauges: lunarGauges,
    evaluate: evaluateLunar,
    engineering: lunarEngineering,
    cinematic(d) {
      const s = computeLunar(d);
      const reserve = s.returnReserveMps ?? 0;
      return {
        kind: "lunar",
        stage: s.stage ?? "orbit",
        orbitKind: s.orbit?.kind ?? "llo",
        surveyAltKm: s.orbit?.surveyAltKm ?? 100,
        surveyFrac: s.surveyFrac ?? 0,
        dataFrac: s.dataFrac ?? 0,
        reserveMps: reserve,
        thinReturn: reserve < LU_REQ.returnReserveMps,
        recorderSummary: `${((s.data?.receivedBits ?? 0) / 1e9).toFixed(1)} Gbit received · ${((s.data?.storedBits ?? 0) / 1e9).toFixed(1)} queued · ${((s.data?.droppedBits ?? 0) / 1e9).toFixed(1)} dropped`,
      };
    },
    stationReadout(stationId, d) {
      const s = computeLunar(d);
      const dv = s.plannedDvMps !== undefined ? f(s.plannedDvMps / 1000, 2, " km/s") : "needs engine, load and orbit";
      switch (stationId) {
        case "engine":
        case "tanks":
          return [
            { label: "Stack mass / capacity", value: `${f(s.stackMassKg / 1000, 1)} / ${LU_REQ.launchCapacityKg / 1000} t` },
            { label: "Dry mass incl. tanks", value: f(s.dryMassKg, 0, " kg") },
            { label: "Delta-v needed (incl. 100 m/s contingency)", value: dv },
            { label: "Delta-v available (before boil-off)", value: s.idealDvMps !== undefined ? f(s.idealDvMps / 1000, 2, " km/s") : "n/a" },
            { label: "Reserve after return burn", value: s.returnReserveMps !== undefined ? f(s.returnReserveMps, 0, " m/s") : "n/a" },
          ];
        case "orbit":
          return [
            { label: "Trans-lunar injection", value: "3.15 km/s (fixed)" },
            { label: "Delta-v needed (incl. contingency)", value: dv },
            { label: "Instrument", value: s.instrument ? s.instrument.name : "not installed" },
            { label: "Current resolution", value: s.gsdM !== undefined ? f(s.gsdM, 2, " m GSD") : "n/a" },
            { label: "Site coverage", value: s.coverageFrac !== undefined ? f(s.coverageFrac * 100, 0, "%") : "n/a" },
          ];
        case "survey":
          return [
            { label: "Survey altitude", value: s.orbit ? `${f(s.orbit.surveyAltKm)} km` : "orbit not chosen" },
            { label: "Pixel pitch / pointing", value: "7 micrometres / up to 30 deg off nadir" },
            { label: "Passes over the site", value: f(s.passes, 1) },
            { label: "GSD / swath", value: s.gsdM !== undefined ? `${f(s.gsdM, 2)} m / ${f(s.swathKm, 1)} km` : "n/a" },
            { label: "Site coverage at 1.0 m", value: s.coverageFrac !== undefined ? f(s.coverageFrac * 100, 0, "%") : "n/a" },
          ];
        case "power":
          return [
            { label: "Orbit period / eclipse", value: s.periodS ? `${f(s.periodS / 60, 1)} / ${f((s.eclipseS ?? 0) / 60, 1)} min` : "orbit not chosen" },
            { label: "Daylight / eclipse load", value: s.daylightLoadW ? `${f(s.daylightLoadW / 1000, 2)} / ${f((s.eclipseLoadW ?? 0) / 1000, 2)} kW` : "n/a" },
            { label: "Radiator heaters in shadow", value: s.heaterW !== undefined ? f(s.heaterW, 0, " W") : "radiators not chosen" },
            { label: "Array needed (end of mission)", value: s.requiredArrayW ? f(s.requiredArrayW / 1000, 2, " kW") : "n/a" },
          ];
        case "thermal":
          return [
            { label: "Heat to reject (day)", value: s.daylightLoadW ? f(s.daylightLoadW + 360, 0, " W") : "n/a" },
            { label: "Lunar view factor", value: s.orbit ? f(s.orbit.moonViewFactor, 2) : "orbit not chosen" },
            { label: "Hot / cold case", value: s.radiatorHotK !== undefined ? `${f(s.radiatorHotK)} / ${f(s.radiatorColdK)} K` : "n/a" },
            { label: "Limits", value: `${LU_REQ.radiatorMinK} - ${LU_REQ.radiatorMaxK} K` },
          ];
        case "comms":
          return [
            { label: "Worst-case distance", value: "405,500 km" },
            { label: "Earth in view", value: s.orbit ? f(s.orbit.earthVisibility * 100, 0, "%") : "orbit not chosen" },
            { label: "Data needed per day", value: s.dailyNeedGbit !== undefined ? f(s.dailyNeedGbit, 0, " Gbit") : `${f(LU_REQ.crewVideoGbitPerDay, 0)} Gbit video + survey` },
            { label: "Link rate", value: s.linkRateBps !== undefined ? f(s.linkRateBps / 1e6, 2, " Mbit/s") : "n/a" },
          ];
        default:
          return [];
      }
    },
  },
  {id:'evac',name:'Emergency Evacuation',difficulty:'Hard',tagline:'Survive Hesperus. Build your capsule. Reach the rescue rendezvous.',playable:true,unlockedBy:'lunar',timeLimitS:12*60,
 story:['A fictional alien specimen has escaped containment aboard the deep-space research vessel Hesperus. Radiation leaks and a compromised bulkhead threaten the crew.','Each astronaut must configure all six systems of their own escape capsule and board at the evacuation dock. Your pods rendezvous with a rescue transport; a 72-hour direct interplanetary Earth return is not being modeled.'],
 objectives:['Configure your six personal capsule workstations','Isolate radiation leaks, seal the breach, or avoid them','Contain the organism at the Deck B control, or evade it','Return to the evacuation dock and launch your own capsule'],
 requirements:[{label:'Capsule mass',value:'950 kg maximum'},{label:'Maneuver allocation',value:'900 m/s minimum'},{label:'Survival',value:'72 modeled hours of electrical power, oxygen and scrubbing'},{label:'Success',value:'Every astronaut alive with a viable capsule and beacon'},{label:'Partial',value:'A strict majority viable; a 1–1 tie fails. Solo: viable return with deficient beacon is partial.'}],
 stations:EVAC_STATIONS,map:EVAC_MAP,gauges:evacGauges,evaluate:(_d,ctx)=>emptyAdvancedReport('evac','Emergency Evacuation',ctx),cinematic:()=>({kind:'expedition',missionId:'evac'}),
 stationReadout:(_id,d)=>{const p=podModel(d);return [{label:'Wet capsule mass',value:p.mass.toFixed(0)+' / 950 kg'},{label:'Return delta-v',value:p.dv.toFixed(0)+' / 900 m/s'},{label:'Usable / required electrical energy',value:p.energy.toFixed(1)+' / '+p.need.toFixed(1)+' kWh'}];}},
 {id:'lazarus',name:'Project Lazarus',difficulty:'Extreme',tagline:'Allocate the landers. Return every dataset. Choose using the evidence.',playable:true,unlockedBy:'evac',timeLimitS:14*60,
 story:['In a fictional Alpha Centauri expedition, humanity needs evidence about four synthetic candidate worlds. Interstellar transport is a story premise; local maneuvers and consumables use transparent simplified models.','Assign lander propellant, electrical energy, oxygen and supplies while protecting the mothership return allocation. Solo players survey three worlds sequentially with ten extra minutes. Surface deadlines come from environmental windows, not time dilation.'],
 objectives:['Allocate every lander resource and the mothership return propellant','Visit each assigned planet and reach its research station','Return every observation and every astronaut alive','Compare all delivered evidence and vote for the supported candidate'],
 requirements:[{label:'Return',value:'Every required dataset and every astronaut must return'},{label:'Mothership',value:'4,800 m/s modeled in-system return maneuver, Isp 900 s, dry mass 10 t'},{label:'Environment',value:'Displayed surface storm windows; consumable time is compressed 60:1 on the surface'},{label:'Selection',value:'All stated synthetic habitability criteria must be met; no claim of proven human habitability'}],
 stations:[],map:LAZARUS_MAP,gauges:()=>[],evaluate:(_d,ctx)=>emptyAdvancedReport('lazarus','Project Lazarus',ctx),cinematic:()=>({kind:'expedition',missionId:'lazarus'}),stationReadout:()=>[]},
];

export function missionById(id: string): MissionDef {
  const m = MISSIONS.find((x) => x.id === id);
  if (!m) throw new Error(`Unknown mission ${id}`);
  return m;
}
