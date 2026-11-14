/**
 * Electro-optical imager models.
 * GSD (ground sample distance) is the larger of the geometric and diffraction limits.
 *   geometric:   GSD = h * p / f
 *   diffraction: GSD = 1.22 * lambda * h / D   (Rayleigh criterion)
 */

export const VISIBLE_WAVELENGTH_M = 0.55e-6;

export function geometricGsdM(altitudeKm: number, pixelPitchM: number, focalLengthM: number): number {
  return (altitudeKm * 1000 * pixelPitchM) / focalLengthM;
}

export function diffractionGsdM(altitudeKm: number, apertureM: number): number {
  return (1.22 * VISIBLE_WAVELENGTH_M * altitudeKm * 1000) / apertureM;
}

export function effectiveGsdM(
  altitudeKm: number,
  pixelPitchM: number,
  focalLengthM: number,
  apertureM: number,
): number {
  return Math.max(
    geometricGsdM(altitudeKm, pixelPitchM, focalLengthM),
    diffractionGsdM(altitudeKm, apertureM),
  );
}

/** Swath width (km) for a push-broom detector with N cross-track pixels. */
export function swathKm(altitudeKm: number, pixelPitchM: number, focalLengthM: number, pixels: number): number {
  return (geometricGsdM(altitudeKm, pixelPitchM, focalLengthM) * pixels) / 1000;
}

/**
 * Raw-to-downlink data volume (bits) for imaging an area once.
 * bits = (area / GSD^2) * bitsPerPixel * bands / compressionRatio
 */
export function imageDataBits(
  areaKm2: number,
  gsdM: number,
  bitsPerPixel: number,
  bands: number,
  compressionRatio: number,
): number {
  const pixels = (areaKm2 * 1e6) / (gsdM * gsdM);
  return (pixels * bitsPerPixel * bands) / compressionRatio;
}
