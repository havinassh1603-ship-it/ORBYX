import type { Decisions, MissionReport } from './types';
import type { DataLedger, EnergyTrace } from './models/operations';

export const MODEL_VERSION = '1.1.0';
export type MissionSegment = 'launch' | 'space' | 'ground' | 'user';
export interface RequirementCheck {
  id: string; label: string; segment: MissionSegment; mandatory: boolean;
  met: boolean | null; actual: string; required: string; advice: string;
}
export interface DesignSnapshot {
  version: 1; id: string; missionId: string; modelVersion: string; savedAt: string;
  scenario: string; decisions: Decisions;
  expeditions?: { planetId: string; kitId: string; allocation: { fuel?: number; energy?: number; oxygen?: number; supplies?: number } }[];
  earthFuel?: number;
  capsules?: { astronautId: string; decisions: Decisions }[];
}
export interface EngineeringReview {
  modelVersion: string; durationS: number; assumptions: string[];
  requirements: RequirementCheck[]; data?: DataLedger; energy?: EnergyTrace;
  timeline: { timeS: number; label: string; detail: string }[];
  segments: { id: MissionSegment; title: string; result: string }[];
}
export function check(id: string, label: string, segment: MissionSegment, met: boolean | undefined, actual: string, required: string, advice: string, mandatory = true): RequirementCheck {
  return { id, label, segment, mandatory, met: met ?? null, actual, required, advice };
}
export const mandatoryMet = (checks: RequirementCheck[]) => checks.filter(c => c.mandatory).every(c => c.met === true);
export function segmentReview(checks: RequirementCheck[]): EngineeringReview['segments'] {
  return (['launch', 'space', 'ground', 'user'] as const).map(id => {
    const items = checks.filter(c => c.segment === id && c.mandatory);
    const advisory = checks.filter(c => c.segment === id && !c.mandatory);
    const result = items.some(c => c.met === false) ? 'Requirement shortfall' : items.some(c => c.met === null) ? 'Design incomplete' : items.length ? 'Requirements met' : 'Scenario assumption';
    return { id, title: ({ launch: 'Launch segment', space: 'Space segment', ground: 'Ground / operations', user: 'Useful product' })[id], result: !items.length && advisory.length ? advisory.every(c=>c.met===true)?'Advisories met':'Review advisories' : result };
  });
}
export function designSnapshot(missionId: string, decisions: Decisions, scenario = 'solo:1'): DesignSnapshot {
  return { version: 1, id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`, missionId, modelVersion: MODEL_VERSION, savedAt: new Date().toISOString(), scenario, decisions: { ...decisions } };
}
/** Stored outcomes are compared as recorded; legacy reports are never re-evaluated. */
export function comparable(a: MissionReport, b: MissionReport): boolean {
  return !!a.design && !!b.design && a.missionId === b.missionId && a.design.modelVersion === b.design.modelVersion && a.design.scenario === b.design.scenario && (a.design.decisions._ops ?? 'nominal') === (b.design.decisions._ops ?? 'nominal');
}
