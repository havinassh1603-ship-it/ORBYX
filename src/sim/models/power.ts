/**
 * Electrical power system sizing (first-order, after the classic SMAD method).
 *
 * Required end-of-life array power:
 *   P_sa = ( P_e * T_e / X_e + P_d * T_d / X_d ) / T_d
 * where X_e, X_d are path efficiencies for eclipse (via battery) and daylight (direct).
 *
 * Battery depth of discharge per eclipse:
 *   DoD = P_e * T_e / (E_batt * eta_discharge)
 */

export const PATH_EFF_DAYLIGHT = 0.85;
export const PATH_EFF_ECLIPSE = 0.65;
export const BATTERY_DISCHARGE_EFF = 0.9;

export interface PowerBalanceInput {
  /** Average load while in sunlight, W */
  daylightLoadW: number;
  /** Average load while in eclipse, W */
  eclipseLoadW: number;
  /** Daylight duration per orbit, s */
  daylightS: number;
  /** Eclipse duration per orbit, s */
  eclipseS: number;
  /** End-of-life array output, W */
  arrayEolW: number;
  /** Battery nameplate capacity, Wh */
  batteryWh: number;
}

export interface PowerBalanceResult {
  requiredArrayW: number;
  arrayEolW: number;
  /** (available - required) / required */
  arrayMargin: number;
  eclipseEnergyWh: number;
  depthOfDischarge: number;
}

export function requiredArrayPowerW(i: Omit<PowerBalanceInput, "arrayEolW" | "batteryWh">): number {
  return (
    (i.eclipseLoadW * i.eclipseS) / PATH_EFF_ECLIPSE / i.daylightS +
    (i.daylightLoadW * i.daylightS) / PATH_EFF_DAYLIGHT / i.daylightS
  );
}

export function powerBalance(i: PowerBalanceInput): PowerBalanceResult {
  const requiredArrayW = requiredArrayPowerW(i);
  const eclipseEnergyWh = (i.eclipseLoadW * i.eclipseS) / 3600;
  return {
    requiredArrayW,
    arrayEolW: i.arrayEolW,
    arrayMargin: (i.arrayEolW - requiredArrayW) / requiredArrayW,
    eclipseEnergyWh,
    depthOfDischarge: eclipseEnergyWh / (i.batteryWh * BATTERY_DISCHARGE_EFF),
  };
}

/** Array degradation to end of life: (1 - d)^years, d = annual degradation (e.g. 0.0275). */
export function arrayEolFactor(years: number, annualDegradation = 0.0275, inherentLoss = 0.92): number {
  return inherentLoss * Math.pow(1 - annualDegradation, years);
}
