import { h } from './dom';
import type { EngineeringReview, RequirementCheck } from '../sim/engineering';

export function requirementList(checks: RequirementCheck[]): HTMLElement {
  return h('div', {class:'engineering-checks'}, ...checks.map(c => h('div', {class:`engineering-check ${c.met === true ? 'met' : c.met === false ? 'unmet' : 'pending'}`},
    h('div', {}, h('b', {}, `${c.met === true ? '✓' : c.met === false ? '!' : '○'} ${c.label}`), h('small', {}, c.mandatory ? 'Required' : 'Advisory')),
    h('span', {}, `${c.actual} · ${c.required}`),
    c.met === false ? h('p', {}, c.advice) : null,
  )));
}
const bits = (n: number) => `${(n / 1e9).toFixed(2)} Gbit`;
export function engineeringPanel(review: EngineeringReview): HTMLElement {
  const data=review.data, energy=review.energy;
  return h('section', {class:'engineering-review'},
    h('h3', {}, 'Mission engineering trace'),
    h('p', {class:'dim'}, `Model ${review.modelVersion} · modeled duration ${(review.durationS / 86400).toFixed(1)} days. The design countdown above measures player time.`),
    h('div', {class:'metrics'}, ...review.segments.map(s => h('div', {}, h('span', {}, s.title), h('b', {}, s.result)))),
    h('details', {}, h('summary', {}, 'Requirements and next-attempt advice'), requirementList(review.requirements)),
    data ? h('details', {open:true}, h('summary', {}, 'Finite recorder and received data'),
      h('div', {class:'kv'}, h('span', {}, 'Recorder capacity'), h('b', {}, bits(data.capacityBits)), h('span', {}, 'Generated'), h('b', {}, bits(data.generatedBits)), h('span', {}, 'Received'), h('b', {}, bits(data.receivedBits)), h('span', {}, 'Still stored'), h('b', {}, bits(data.storedBits)), h('span', {}, 'Dropped on overflow'), h('b', {}, bits(data.droppedBits)), h('span', {}, 'Peak occupancy'), h('b', {}, bits(data.peakStoredBits))),
      h('p', {class:'dim'}, 'Conservation: generated = received + still stored + dropped. Data left aboard has not yet become a useful ground product.')) : null,
    energy ? h('details', {}, h('summary', {}, 'Battery charge through representative phases'),
      h('p', {}, `Minimum charge ${(energy.minimumWh / energy.capacityWh * 100).toFixed(1)}% · ${energy.unservedWh.toFixed(2)} Wh unserved.`),
      h('div', {class:'kv'}, ...energy.phases.flatMap(p => [h('span', {}, p.label), h('b', {}, `${(p.durationS/60).toFixed(1)} min · ${(p.endWh / energy.capacityWh * 100).toFixed(1)}% charge`)]))) : null,
    h('details', {}, h('summary', {}, `Operations timeline · ${review.timeline.length} events`),
      h('ol', {class:'operation-events'}, ...review.timeline.map(e => h('li', {}, h('small', {}, e.timeS >= 86400 ? `Day ${(e.timeS / 86400).toFixed(2)}` : `${(e.timeS/60).toFixed(1)} min`), h('b', {}, e.label), h('span', {}, e.detail))))),
    h('details', {}, h('summary', {}, 'Model assumptions and learning resources'),
      h('ul', {}, ...review.assumptions.map(a => h('li', {}, a))),
      h('p', {class:'dim'}, 'NASA mission design, ConOps, CML, CubeSat 101 and educational resources are mapped to code in docs/NASA_RESOURCE_MAP.md. Hardware and synthetic planets are teaching parameters.')),
  );
}
