/**
 * Propulsion: the Tsiolkovsky rocket equation.
 *   dv = Isp * g0 * ln(m0 / mf)
 *   m_prop = mf * (exp(dv / (Isp g0)) - 1)
 * Units: dv in m/s, Isp in s, masses in kg.
 */
import { G0_MPS2 } from "./orbit";

export function deltaVMps(ispS: number, initialMassKg: number, finalMassKg: number): number {
  return ispS * G0_MPS2 * Math.log(initialMassKg / finalMassKg);
}

export function propellantForDeltaVKg(ispS: number, finalMassKg: number, dvMps: number): number {
  return finalMassKg * (Math.exp(dvMps / (ispS * G0_MPS2)) - 1);
}

export function massRatio(ispS: number, dvMps: number): number {
  return Math.exp(dvMps / (ispS * G0_MPS2));
}

/**
 * Thermal: radiative equilibrium of a flat plate facing the Sun.
 *   alpha * S * A_abs = eps * sigma * A_rad * T^4  ->  T = (alpha S A_abs / (eps sigma A_rad))^(1/4)
 * Optional internal dissipation Q (W) adds to the absorbed power.
 */
export const SOLAR_CONSTANT_W_M2 = 1361;
export const STEFAN_BOLTZMANN = 5.670374419e-8;

export function equilibriumTemperatureK(
  absorptivity: number,
  emissivity: number,
  absorbingAreaM2 = 1,
  radiatingAreaM2 = 1,
  internalW = 0,
  solarFluxWm2 = SOLAR_CONSTANT_W_M2,
): number {
  const absorbed = absorptivity * solarFluxWm2 * absorbingAreaM2 + internalW;
  return Math.pow(absorbed / (emissivity * STEFAN_BOLTZMANN * radiatingAreaM2), 0.25);
}
