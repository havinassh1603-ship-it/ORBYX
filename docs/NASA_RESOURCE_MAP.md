# NASA resources and ORBYX 1.1.0

This is an independent educational game. Guidance from the resources below informs the
mission-design workflow; it does not certify the simulation or supply the fictional hardware
performance tables. The challenge requirements supplied by the team are the product brief.
No NASA endorsement, GMAT numerical equivalence, or real exoplanet habitability claim is made.

## Resource-to-code map

| Primary resource | Applied concept | Implementation |
| --- | --- | --- |
| [NASA: Design and Develop Science Missions, J. Levri, March 2025](https://ntrs.nasa.gov/citations/20250002492) | Science objectives, launch/space/ground/user segments, time-sequenced ConOps | `src/sim/engineering.ts`, `src/sim/models/operations.ts`, existing Director and debrief panels |
| [NASA Ames Mission Design Center: About Our Studies](https://www.nasa.gov/ames-engineering/spaceflight-division/mission-design-center/about-our-studies/) | Consultation, feasibility, trade-space and point-design cues inspired by CML 1–4 | Existing mission briefing → station decisions → Director review → recorded comparison. This is a lightweight teaching adaptation, not a CML assessment. |
| [NASA Goddard Mission Design Lab](https://etd.gsfc.nasa.gov/capabilities/integrated-design-center/mission-design-lab) | Integrated subsystem trades and feasibility | Shared pure mission models, mandatory/advisory requirement checks, mass/power/data/thermal couplings |
| [NASA GMAT catalog](https://software.nasa.gov/software/GSC-19468-1) | Reference for a professional trajectory-analysis tool | Scope boundary: ORBYX uses transparent circular-orbit and burn-allocation approximations. GMAT is neither embedded nor required. |
| [NASA MissionViz](https://nasa.github.io/mission-viz/) | Accessible orbit visualization and Earth–Moon examples | Existing mission-specific cinematics consume modeled outcomes and recorder summaries. ORBYX retains its original Phaser artwork. |
| [NASA Webb: Build It Yourself](https://science.nasa.gov/mission/webb/game-build-it-yourself/) | Objective-driven instrument and spacecraft choices | Payload mass, power and data trades; Lunar useful survey; Lazarus instrument packages. No Webb components are simulated. |
| [NASA CubeSat 101, 2017 revision](https://science.nasa.gov/wp-content/uploads/2023/06/nasa_csli_cubesat_101_508.pdf) | Lifecycle, ground operations, integration and readiness | End-to-end data chain, launch margins, review gates, end-of-mission checks. Its historical guidance is not presented as current universal regulation, and ORBYX remains a four-mission game. |
| [Canadian Space Agency educational games](https://www.asc-csa.gc.ca/eng/youth-educators/digital-games-and-activities.asp) | Accessible game-based learning | Short explanations, units, revisable choices, visible consequences and actionable debrief advice |

The 2026 challenge page was supplied in full by the team. Its web details/resources page and
the earlier VR challenge did not return usable content during the audit; their current contents
are not claimed as independently verified. The resources above were checked independently.

## Provenance of numbers

| Quantity | Provenance / limitation |
| --- | --- |
| Earth/Moon gravitational parameters, standard gravity, Stefan–Boltzmann constant, rocket equation, free-space loss, imaging geometry | Standard physical relationships in `src/sim/models/`; units are documented in code. |
| Earthwatch telescopes, launchers, cost, orbit lifetime and station-access counts | Retained synthetic Manus scenario tables. Lifetime is an approximate scenario value, not a drag propagation. |
| Selene engines, radiators, arrays, radios and burn allocations | Retained synthetic vehicle design; simplified lunar geometry, boil-off and thermal balance. |
| Escape capsules, guidance and beacon availability | Synthetic educational proxies. No probabilistic reliability or detailed rescue trajectory is inferred. |
| Lazarus worlds, habitability criteria, vehicle and interstellar premise | Entirely fictional training scenario. Suit consumption and temperature-dependent electrical demand are explicit proxies. |
| Recorders: Earthwatch 32 Gbit; Selene 256 Gbit | Illustrative fixed bus capacities included in existing bus mass/cost. Reject newest packets on overflow. |
| Survey kits: 18/42/90 kg, 0.2/0.65/1.8 kW, 6/12/24 player seconds | Hypothetical options in `survey.ts`; all effects feed the shared host model. |

## Engineering contract

Full success meets every mandatory published scenario requirement. Advisory checks explain
margin without silently changing a mandatory limit. Near misses can remain PARTIAL; infeasible
designs may still be simulated so players can learn why they fail. The same functions drive
Director preflight checks and the saved debrief. Earlier saved reports retain their original
outcomes and earned unlocks, even where the 1.1.0 evaluator would now grade the design differently.
