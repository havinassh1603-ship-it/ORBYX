/** Bounded, deterministic operations models. Times are modeled seconds, never player time. */
export interface DataEvent {
  timeS: number;
  kind: 'collect' | 'contact' | 'missed' | 'recover';
  label: string;
  /** Generated bits for collect; maximum transferable bits for contact/recover. */
  bits: number;
}
export interface DataLedger {
  capacityBits: number;
  generatedBits: number;
  receivedBits: number;
  storedBits: number;
  droppedBits: number;
  peakStoredBits: number;
  events: (DataEvent & { movedBits: number; storedBits: number; droppedBits: number })[];
}
export function recorder(capacityBits: number): DataLedger {
  if (!Number.isFinite(capacityBits) || capacityBits < 0) throw Error('Invalid recorder capacity.');
  return { capacityBits, generatedBits: 0, receivedBits: 0, storedBits: 0, droppedBits: 0, peakStoredBits: 0, events: [] };
}
/** Reject newest observations on overflow. No data is silently created, overwritten or delivered. */
export function recordData(ledger: DataLedger, event: DataEvent, keepEvents = true): number {
  if (!Number.isFinite(event.bits) || event.bits < 0 || !Number.isFinite(event.timeS)) throw Error('Invalid data event.');
  let moved = 0, dropped = 0;
  if (event.kind === 'collect') {
    ledger.generatedBits += event.bits;
    moved = Math.min(event.bits, Math.max(0, ledger.capacityBits - ledger.storedBits));
    dropped = event.bits - moved;
    ledger.storedBits += moved;
    ledger.droppedBits += dropped;
  } else if (event.kind !== 'missed') {
    moved = Math.min(ledger.storedBits, event.bits);
    ledger.storedBits -= moved;
    ledger.receivedBits += moved;
  }
  ledger.peakStoredBits = Math.max(ledger.peakStoredBits, ledger.storedBits);
  if (keepEvents) ledger.events.push({ ...event, movedBits: moved, storedBits: ledger.storedBits, droppedBits: dropped });
  return moved;
}
export function simulateRecorder(capacityBits: number, events: DataEvent[]): DataLedger {
  const ledger = recorder(capacityBits);
  for (const event of [...events].sort((a, b) => a.timeS - b.timeS)) recordData(ledger, event);
  return ledger;
}
/** Uniform access windows are a teaching schedule, not a ground-station ephemeris. */
export function dailyDataEvents(input: {
  days: number; generatedBitsPerDay: number; capacityBitsPerDay: number;
  collectionsPerDay: number; contactsPerDay: number; missedContact?: number;
}): DataEvent[] {
  const events: DataEvent[] = [];
  const collections = Math.max(1, Math.round(input.collectionsPerDay));
  const contacts = Math.max(1, Math.round(input.contactsPerDay));
  for (let day = 0; day < input.days; day++) {
    for (let i = 0; i < collections; i++) events.push({
      timeS: (day + (i + .25) / collections) * 86400, kind: 'collect',
      label: `Day ${day + 1} · observation ${i + 1}`, bits: input.generatedBitsPerDay / collections,
    });
    for (let i = 0; i < contacts; i++) events.push({
      timeS: (day + (i + 1) / contacts) * 86400,
      kind: input.missedContact === i ? 'missed' : 'contact',
      label: `Day ${day + 1} · ${input.missedContact === i ? 'missed' : 'ground'} contact ${i + 1}`,
      bits: input.capacityBitsPerDay / contacts,
    });
  }
  return events;
}

export interface EnergyPhase { label: string; durationS: number; generationW: number; loadW: number; }
export interface EnergyTrace {
  capacityWh: number; initialWh: number; finalWh: number; minimumWh: number;
  generatedWh: number; loadWh: number; spilledWh: number; unservedWh: number;
  phases: (EnergyPhase & { endWh: number; unservedWh: number })[];
}
/** generationW/loadW are battery-side equivalent powers, including path losses. */
export function simulateEnergy(capacityWh: number, phases: EnergyPhase[], initialWh = capacityWh): EnergyTrace {
  if (!(capacityWh > 0) || !Number.isFinite(capacityWh)) throw Error('Invalid energy capacity.');
  const trace: EnergyTrace = { capacityWh, initialWh: Math.max(0, Math.min(capacityWh, initialWh)), finalWh: 0, minimumWh: 0, generatedWh: 0, loadWh: 0, spilledWh: 0, unservedWh: 0, phases: [] };
  let stored = trace.initialWh;
  trace.minimumWh = stored;
  for (const phase of phases) {
    if ([phase.durationS, phase.generationW, phase.loadW].some(x => !Number.isFinite(x) || x < 0)) throw Error('Invalid energy phase.');
    const generated = phase.generationW * phase.durationS / 3600, load = phase.loadW * phase.durationS / 3600;
    const next = stored + generated - load, unserved = Math.max(0, -next);
    trace.generatedWh += generated; trace.loadWh += load;
    trace.spilledWh += Math.max(0, next - capacityWh); trace.unservedWh += unserved;
    stored = Math.max(0, Math.min(capacityWh, next));
    trace.minimumWh = Math.min(trace.minimumWh, stored);
    trace.phases.push({ ...phase, endWh: stored, unservedWh: unserved });
  }
  trace.finalWh = stored;
  return trace;
}
