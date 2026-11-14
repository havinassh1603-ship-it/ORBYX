/** Hypothetical field instruments and explicit game-scale environmental coefficients. */
export const SURVEY_KITS = {
  scout: { name: 'Rapid reconnaissance', massKg: 18, powerKw: .2, collectionS: 6, dataBits: 2e9, recorderBits: 4e9, completeness: 2 / 3, note: 'Four of six environmental measurements; pressure, temperature, gravity and water. Fast but incomplete.' },
  balanced: { name: 'Integrated survey kit', massKg: 42, powerKw: .65, collectionS: 12, dataBits: 6e9, recorderBits: 8e9, completeness: .95, note: 'All six environmental measurements at the standard training confidence.' },
  lab: { name: 'Field laboratory', massKg: 90, powerKw: 1.8, collectionS: 24, dataBits: 7.5e9, recorderBits: 8e9, completeness: 1, note: 'All six measurements with extra calibration; higher mass, electricity and exposure time.' },
} as const;
export type SurveyKitId = keyof typeof SURVEY_KITS;
export const kitById = (id: string) => SURVEY_KITS[id as SurveyKitId] ?? SURVEY_KITS.balanced;
export const SURFACE_TIME_SCALE = 60;
/** Lumped thermal-control proxy, not a spacecraft heat-transfer solution or a NASA dataset. */
export function surfaceThermalKw(temperatureK: number) { return Math.abs(temperatureK - 295) * .006; }
/** Actual propellant debit for a burn from the carried wet mass; minimum reserve is separate. */
export function wetBurnFuel(dryKg: number, fuelKg: number, dvMps: number, ispS = 340) {
  return (dryKg + fuelKg) * (1 - Math.exp(-dvMps / (ispS * 9.80665)));
}
