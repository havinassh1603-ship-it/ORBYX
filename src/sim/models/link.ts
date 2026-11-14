/**
 * Radio link budget.
 *   Eb/N0 [dB] = EIRP + G/T - FSPL - L_other - k - 10 log10(R)
 *   FSPL  [dB] = 20 log10(4 pi d / lambda)
 *   k = -228.6 dBW/K/Hz (Boltzmann)
 */

export const SPEED_OF_LIGHT_MPS = 299_792_458;
export const BOLTZMANN_DBW_PER_K_HZ = -228.6;

export function toDb(x: number): number {
  return 10 * Math.log10(x);
}

export function freeSpacePathLossDb(distanceKm: number, frequencyHz: number): number {
  const lambda = SPEED_OF_LIGHT_MPS / frequencyHz;
  return 20 * Math.log10((4 * Math.PI * distanceKm * 1000) / lambda);
}

export interface LinkInput {
  txPowerW: number;
  txGainDbi: number;
  /** Ground station figure of merit, dB/K */
  rxGOverTDbK: number;
  frequencyHz: number;
  distanceKm: number;
  /** Atmospheric, pointing and implementation losses, dB */
  otherLossesDb: number;
  dataRateBps: number;
}

export function ebN0Db(i: LinkInput): number {
  const eirp = toDb(i.txPowerW) + i.txGainDbi;
  return (
    eirp +
    i.rxGOverTDbK -
    freeSpacePathLossDb(i.distanceKm, i.frequencyHz) -
    i.otherLossesDb -
    BOLTZMANN_DBW_PER_K_HZ -
    toDb(i.dataRateBps)
  );
}

/** Link margin = achieved Eb/N0 - required Eb/N0. */
export function linkMarginDb(i: LinkInput, requiredEbN0Db: number): number {
  return ebN0Db(i) - requiredEbN0Db;
}

/**
 * Adaptive data rate: halve the rate until the link closes with the requested margin.
 * Returns the achievable rate (bps) and the margin at that rate.
 */
export function closeLink(
  i: LinkInput,
  requiredEbN0Db: number,
  wantedMarginDb: number,
  maxHalvings = 10,
): { rateBps: number; marginDb: number; halvings: number } {
  let rate = i.dataRateBps;
  for (let h = 0; h <= maxHalvings; h++) {
    const m = linkMarginDb({ ...i, dataRateBps: rate }, requiredEbN0Db);
    if (m >= wantedMarginDb) return { rateBps: rate, marginDb: m, halvings: h };
    rate /= 2;
  }
  return { rateBps: 0, marginDb: linkMarginDb({ ...i, dataRateBps: rate }, requiredEbN0Db), halvings: maxHalvings };
}
