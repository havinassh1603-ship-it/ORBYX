# ORBYX 1.1.0 engineering additions

The historical implementation notes below describe the 1.0.0 baseline. Where behavior differs,
this section is authoritative for 1.1.0. Pure models remain shared by preflight and evaluation.

## Requirements and mission segments

`engineering.ts` provides named mandatory/advisory checks. Earthwatch success must meet the
USD60M cost cap, >=10% launch margin, <=2.5 m GSD, >=5-year life, <=25-year remaining natural
lifetime after mission end, sustainable power, <=30% eclipse discharge and the full useful
25,000 km²/day imagery objective. Lunar success needs the fuelled stack within 60 t, all burns,
>=100 m/s contingency, sustainable power, <=60% eclipse discharge, the thermal limit, full
video/survey packet return and 1,200 km² useful survey at <=1 m GSD. Its 3% launch growth margin
is advisory because the published briefing only requires compatibility with the 60 t launcher.
The retained score bands and one-success/two-partial progression remain unchanged.

## Finite recorder and energy phases

`operations.ts` rejects newest packets on overflow and tracks generated, received, retained,
dropped and peak occupancy. For a defined stream, generated = received + retained + dropped.
An empty contact transfers nothing. A missed contact leaves the queue aboard. Earthwatch uses
32 Gbit and three representative days; Lunar uses 256 Gbit and seven survey days. Synthetic
uniform access windows replace full station ephemerides. The optional outage test misses one
contact per modeled day. Video and Lunar survey data are proportionally multiplexed. Received
packet fraction multiplies collected survey coverage; stored imagery is not claimed as a
useful ground product. The existing fixed bus mass/cost includes these illustrative recorders.

Battery phases use battery-side equivalent powers with the retained .85 direct path, .65
array-to-eclipse path and .9 battery-discharge efficiency. Charging surplus is derated by
.65/(.85*.9); eclipse electrical load is divided by .9. Storage clips to capacity, records
spilled generation and unserved load, and conserves input/output energy. Three representative
orbits expose recharge and depletion without advancing every second of a multi-year mission.
These use average loads within each phase; pulse loads, aging transients and autonomous load
shedding are outside scope. The array sizing and DoD checks remain in force independently.

## Lazarus field model

Kits are hypothetical: rapid reconnaissance 18 kg/.2 kW/6 player seconds/2 Gbit/4 Gbit recorder;
integrated survey 42 kg/.65 kW/12 seconds/6 Gbit/8 Gbit recorder; field lab 90 kg/1.8 kW/24 seconds/
7.5 Gbit/8 Gbit recorder. Their measurement-completeness factors are 2/3, .95 and 1.0. The rapid
kit lacks radiation/stability observations. All data is stored until the physical recorder is
recovered aboard the mothership. At least .9 useful completeness is needed for full success.

The existing 1390 kg lander dry base now carries the chosen kit and allocated oxygen/supplies.
Propellant minimums are calculated from final dry mass; actual burn debit is
(dry+carriedFuel)*(1-exp(-deltaV/(Isp*g0))). Both burns use actual carried mass. Allocated
consumable mass is conservatively retained in the return dry-mass estimate. Walking spends
.15 kW extra suit electricity, never lander engine fuel. Surface base draw is .65 kW, plus
abs(temperatureK-295)*.006 kW for lumped thermal control, plus collection power while active.
This is an explicit game coefficient, not a validated thermal model. Surface time/consumption
is compressed 60:1; transits debit their modeled hours separately. Interstellar transport stays
a fictional story premise; no instantaneous interstellar telemetry is implemented.

## Persistence and multiplayer

New optional report fields store exact choice IDs, allocations, kit choices, assumptions,
requirements, recorder/energy ledgers and model 1.1.0. Original v1 profiles, checksums, history
and earned unlocks remain supported. Legacy reports are not re-evaluated. Saved station
variants preselect reference options without bypassing physical station access. Saved solo
Lazarus allocations are restored through the same validated actions as manual controls.

Network protocol 4 carries the new state. Guest identities are stamped by the host; kit,
operations-scenario, phase, owner and proximity checks run in the authoritative model. A
shared snapshot includes collection progress, resource counters and reports. This extends the
existing PeerJS design; no TURN provisioning or paid backend is added.

---

# Engineering and continuation notes

The Manus Earthwatch and Lunar mission models remain the baseline. Their workstations use deterministic coupled orbit, imaging, power, communications, thermal and propulsion calculations. New engineering models use kg, seconds, W/kWh, m/s and explicit game thresholds.

## Escape capsules

Dry mass includes the capsule/astronaut base, engine and selected equipment. Wet mass adds actual propellant once. Tsiolkovsky: delta-v = Isp × 9.80665 × ln(wet/dry). Capsule limit is 950 kg and the modeled rescue maneuver requirement is 900 m/s. Nominal batteries are 80% usable; required energy is total selected watts × 72 hours / 1000. Life support needs 0.84 kg O2 per modeled day × three days, plus sufficient CO2 scrubbing. Guidance and computer checks are explicit game reliability proxies, not accident probabilities. A rescue beacon affects rescue completeness. A separate fictional transport supplies the final Earth return.

Radiation, decompression and organism contact cause actual simulated condition loss. Isolating repairs removes a hazard. The organism patrols connected floor, sees crew through clear corridors within nine tiles, hears running within six tiles, and follows a collision-aware route. It searches its last known route for six seconds after losing contact; Deck B containment stops it. Contact damage is gradual, allowing escape rather than an automatic one-hit death. Suit depletion slows walking. Permanent crew loss affects the mission's strict-majority survival rule; a two-player tie is failed. This resolves the Phase 0 draft's inconsistent respawn/permanent-death descriptions in favor of the master prompt's survival conditions.

## Lazarus landers

Lander dry mass is 1390 kg plus allocated oxygen and supplies; Isp is 340 s. Each world's round-trip maneuver allocation is split equally into two legs. The outbound burn uses actual allocated wet mass; return requirement uses dry mass, so fuel is never counted twice. Transit electronics consume 2.2 kW × hours on each leg, and oxygen consumption is 0.84 kg per day per astronaut. The surface uses a transparent 60:1 simulation-time compression for suit resources; environmental windows shown in minutes are explicit gameplay constraints. Walking consumes a small illustrative maneuvering resource. These are simplified training models, not validated spacecraft designs.

Shared pools in this playable build: 24,000 kg propellant, 480 kWh electricity, 6 kg O2 and 50 kg supplies. Oxygen/supplies were scaled down from the preliminary Phase 0 quantities so single-astronaut sortie choices create meaningful allocation constraints. Values and options are in source data. Nothing is silently treated as unlimited.

The mothership has 10,000 kg dry mass, an illustrative 900 s Isp and a 4800 m/s in-system return maneuver. Its minimum propellant is calculated with the same rocket equation. The wider interstellar Earth-return transport is explicitly fictional. Insufficient mothership allocation fails the scenario even if the planetary evidence returns.

Worlds Cindra, Veyra, Talos and Orison, their measurements and thresholds are synthetic. A chosen candidate must satisfy all stated criteria to achieve full success. These rules demonstrate evidence-based comparisons; they do not certify habitability or provide real medical radiation limits. One lost astronaut or missing observation fails; a wrong vote after complete safe return gives partial success. First voting tie triggers a second discussion/vote; a second tie or vote timeout is partial only when all critical return conditions passed.

## Runtime and multiplayer

Mission time and collision/movement advance in the authoritative host state at a bounded step, independently of Phaser rendering. Station choices are checked against the actual option list, assigned owner and world proximity. UI routes traverse the same collision floor at the same speed as keyboard movement. New missions use the existing scene/art/DOM interfaces, rather than a replacement application.

The host owns shared outcomes and hazards. Guests cannot submit time progression or another astronaut's actions. Identical snapshots feed the same simulation state. Local profiles remain editable offline player records, not a competitive anti-cheat system. No guarantee of universal internet connectivity is made: signalling/STUN/TURN and NAT behavior must be tested on the actual networks.
