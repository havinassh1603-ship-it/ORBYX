import { openDB, type IDBPDatabase } from "idb";
import type { MissionReport } from "../sim/types";
import type { DesignSnapshot } from '../sim/engineering';

/**
 * Local player profile. Stored in IndexedDB (primary) with a localStorage mirror so the boot screen
 * can show the name instantly and so data survives if IndexedDB is unavailable (private mode).
 * Not encrypted and not synced: export/import is the backup mechanism.
 */

export const PROFILE_VERSION = 1;

export interface Settings {
  masterVolume: number;
  sfx: boolean;
  ambience: boolean;
  reducedMotion: boolean;
  uiScale: number;
}

export interface Profile {
  version: number;
  id: string;
  displayName: string;
  astronautId: string;
  createdAt: string;
  settings: Settings;
  /** missionId -> best outcome rank and best score */
  progress: Record<string, { bestScore: number; bestOutcome: MissionReport["outcome"]; attempts: number; partials: number }>;
  history: MissionReport[];
  /** Optional for original profile v1 imports. Existing outcomes are never recalculated. */
  savedDesigns?: DesignSnapshot[];
}

export const DEFAULT_SETTINGS: Settings = {
  masterVolume: 0.7,
  sfx: true,
  ambience: true,
  reducedMotion: false,
  uiScale: 1,
};

const DB_NAME = "orbyx";
const STORE = "profile";
const KEY = "current";
const LS_KEY = "orbyx.profile.v1";
const HISTORY_LIMIT = 100;

let dbp: Promise<IDBPDatabase> | null = null;
function db(): Promise<IDBPDatabase> | null {
  if (typeof indexedDB === "undefined") return null;
  if (!dbp) {
    dbp = openDB(DB_NAME, 1, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
      },
    }).catch((e) => {
      console.warn("IndexedDB unavailable, using localStorage only", e);
      dbp = null;
      throw e;
    });
  }
  return dbp;
}

export function newProfile(displayName: string, astronautId = "armstrong"): Profile {
  return {
    version: PROFILE_VERSION,
    id: (globalThis.crypto?.randomUUID?.() ?? `p-${Date.now()}-${Math.random().toString(36).slice(2)}`),
    displayName: sanitizeName(displayName),
    astronautId,
    createdAt: new Date().toISOString(),
    settings: { ...DEFAULT_SETTINGS },
    progress: {},
    history: [],
    savedDesigns: [],
  };
}

export function sanitizeName(raw: string): string {
  return raw.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 20);
}

export async function loadProfile(): Promise<Profile | null> {
  let p: Profile | null = null;
  try {
    const d = await db();
    if (d) p = ((await d.get(STORE, KEY)) as Profile | undefined) ?? null;
  } catch {
    /* fall back to localStorage */
  }
  if (!p) {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) p = JSON.parse(raw) as Profile;
    } catch {
      p = null;
    }
  }
  return p ? migrate(p) : null;
}

export async function saveProfile(p: Profile): Promise<void> {
  const copy: Profile = { ...p, history: p.history.slice(-HISTORY_LIMIT) };
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(copy));
  } catch {
    /* quota or disabled; IndexedDB may still work */
  }
  try {
    const d = await db();
    if (d) await d.put(STORE, copy, KEY);
  } catch {
    /* localStorage copy is the fallback */
  }
}

export async function deleteProfile(): Promise<void> {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
  try {
    const d = await db();
    if (d) await d.delete(STORE, KEY);
  } catch {
    /* ignore */
  }
}

function migrate(p: Profile): Profile {
  return {
    ...p,
    version: PROFILE_VERSION,
    settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) },
    progress: p.progress ?? {},
    history: Array.isArray(p.history) ? p.history : [],
    savedDesigns: Array.isArray(p.savedDesigns) ? p.savedDesigns.slice(-20) : [],
  };
}

const OUTCOME_RANK = { FAILED: 0, PARTIAL: 1, SUCCESS: 2 } as const;

export function recordDesign(p: Profile, design: DesignSnapshot): Profile {
  return { ...p, savedDesigns: [...(p.savedDesigns ?? []).filter(d => d.id !== design.id), structuredClone(design)].slice(-20) };
}

/** Record a finished mission and return the updated profile. */
export function recordReport(p: Profile, r: MissionReport): Profile {
  const prev = p.progress[r.missionId] ?? { bestScore: 0, bestOutcome: "FAILED" as const, attempts: 0, partials: 0 };
  const better = OUTCOME_RANK[r.outcome] > OUTCOME_RANK[prev.bestOutcome];
  return {
    ...p,
    progress: {
      ...p.progress,
      [r.missionId]: {
        attempts: prev.attempts + 1,
        partials: prev.partials + (r.outcome === "PARTIAL" ? 1 : 0),
        bestScore: Math.max(prev.bestScore, r.score),
        bestOutcome: better ? r.outcome : prev.bestOutcome,
      },
    },
    history: [...p.history, r].slice(-HISTORY_LIMIT),
  };
}

/**
 * Unlock rule (from the approved design): a mission is cleared by one Successful result, or by
 * two Partially Successful results, so a near miss does not hard-block progress forever.
 */
export function isCleared(p: Profile, missionId: string): boolean {
  const pr = p.progress[missionId];
  if (!pr) return false;
  return pr.bestOutcome === "SUCCESS" || pr.partials >= 2;
}

// ---------------------------------------------------------------------------------------------
// Export / import
// ---------------------------------------------------------------------------------------------

export function checksum(text: string): string {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function exportProfile(p: Profile): string {
  const body = JSON.stringify(p);
  return JSON.stringify({ format: "orbyx-profile", version: PROFILE_VERSION, checksum: checksum(body), profile: p }, null, 2);
}

export type ImportResult = { ok: true; profile: Profile } | { ok: false; error: string };

export function importProfile(text: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "The file is not valid JSON." };
  }
  const o = parsed as { format?: string; version?: number; checksum?: string; profile?: Profile };
  if (!o || o.format !== "orbyx-profile") return { ok: false, error: "This is not an ORBYX profile export." };
  if (typeof o.version !== "number" || o.version > PROFILE_VERSION)
    return { ok: false, error: "This profile was made by a newer version of ORBYX." };
  if (!o.profile || typeof o.profile !== "object") return { ok: false, error: "The profile data is missing." };
  if (checksum(JSON.stringify(o.profile)) !== o.checksum)
    return { ok: false, error: "The checksum does not match; the file may be damaged or edited." };
  const p = o.profile;
  if (typeof p.displayName !== "string" || !sanitizeName(p.displayName))
    return { ok: false, error: "The profile has no valid display name." };
  return { ok: true, profile: migrate({ ...p, displayName: sanitizeName(p.displayName) }) };
}
