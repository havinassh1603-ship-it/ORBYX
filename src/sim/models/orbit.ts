/**
 * Orbital mechanics models (first-order, two-body, circular orbits).
 *
 * Units are encoded in names: km, s, deg, kmps (km/s). All functions are pure.
 * Assumptions:
 *  - Spherical Earth, circular orbit, no perturbations except where stated.
 *  - Eclipse fraction uses the cylindrical-shadow model at beta angle 0 (worst case).
 */

export const MU_EARTH_KM3_S2 = 398_600.4418;
export const R_EARTH_KM = 6_378.137;
export const G0_MPS2 = 9.80665;
/** Reference constant for the sun-synchronous condition: cos i = -(a / 12352 km)^3.5 */
const SSO_REF_KM = 12_352;

const DEG = Math.PI / 180;

export function semiMajorAxisKm(altitudeKm: number): number {
  return R_EARTH_KM + altitudeKm;
}

/** Orbital period T = 2 pi sqrt(a^3 / mu), seconds. */
export function orbitalPeriodS(altitudeKm: number): number {
  const a = semiMajorAxisKm(altitudeKm);
  return 2 * Math.PI * Math.sqrt((a * a * a) / MU_EARTH_KM3_S2);
}

/** Circular orbital speed v = sqrt(mu / a), km/s. */
export function circularVelocityKmps(altitudeKm: number): number {
  return Math.sqrt(MU_EARTH_KM3_S2 / semiMajorAxisKm(altitudeKm));
}

/** Sub-satellite ground-track speed, km/s (ignores Earth rotation). */
export function groundSpeedKmps(altitudeKm: number): number {
  return (circularVelocityKmps(altitudeKm) * R_EARTH_KM) / semiMajorAxisKm(altitudeKm);
}

/** Eclipse fraction f = (1/pi) * acos( sqrt(a^2 - Re^2) / a ), beta = 0 worst case. */
export function eclipseFraction(altitudeKm: number): number {
  const a = semiMajorAxisKm(altitudeKm);
  return Math.acos(Math.sqrt(a * a - R_EARTH_KM * R_EARTH_KM) / a) / Math.PI;
}

export function eclipseDurationS(altitudeKm: number): number {
  return eclipseFraction(altitudeKm) * orbitalPeriodS(altitudeKm);
}

/** Inclination (deg) giving a sun-synchronous orbit at this altitude (J2 nodal precession). */
export function sunSyncInclinationDeg(altitudeKm: number): number {
  const a = semiMajorAxisKm(altitudeKm);
  return Math.acos(-Math.pow(a / SSO_REF_KM, 3.5)) / DEG;
}

/**
 * Earth central angle (rad) from a ground station to the edge of visibility for
 * a minimum elevation angle eps: lambda = acos(Re cos(eps) / a) - eps.
 */
export function visibilityHalfAngleRad(altitudeKm: number, minElevationDeg: number): number {
  const a = semiMajorAxisKm(altitudeKm);
  const eps = minElevationDeg * DEG;
  return Math.acos((R_EARTH_KM * Math.cos(eps)) / a) - eps;
}

/** Maximum slant range (km) to a station at minimum elevation. */
export function maxSlantRangeKm(altitudeKm: number, minElevationDeg: number): number {
  const a = semiMajorAxisKm(altitudeKm);
  const eps = minElevationDeg * DEG;
  const reCos = R_EARTH_KM * Math.cos(eps);
  return Math.sqrt(a * a - reCos * reCos) - R_EARTH_KM * Math.sin(eps);
}

/**
 * Duration (s) of an overhead pass: 2 * lambda / (2 pi) * T.
 * Real passes are rarely overhead; callers apply an average-pass factor.
 */
export function overheadPassDurationS(altitudeKm: number, minElevationDeg: number): number {
  return (visibilityHalfAngleRad(altitudeKm, minElevationDeg) / Math.PI) * orbitalPeriodS(altitudeKm);
}

/** Average pass length relative to an overhead pass (geometric average over chord offsets). */
export const AVERAGE_PASS_FACTOR = 0.7;

export function averagePassDurationS(altitudeKm: number, minElevationDeg: number): number {
  return overheadPassDurationS(altitudeKm, minElevationDeg) * AVERAGE_PASS_FACTOR;
}
