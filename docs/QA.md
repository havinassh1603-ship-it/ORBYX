# ORBYX 1.1.0 verification

## Automated and build checks

- 96 tests passed in 10 test files; TypeScript checks passed.
- All 243 Earthwatch designs were enumerated: 3 SUCCESS, 97 PARTIAL, 143 FAILED. Every success meets all mandatory checks; all ledgers conserve packets.
- All 2,187 Lunar designs were enumerated: 27 SUCCESS, 91 PARTIAL, 2,069 FAILED. Every success meets the full returned-survey, data, thermal, battery and reserve requirements.
- Audit regression cases cover the USD72M Earthwatch design, 150-year natural lifetime, actual wet-mass lander return burn, walking electricity rather than fuel, and beacon-specific subsystem grading.
- Tests cover contact ordering, overflow, missed contacts, physical recorder recovery, battery clipping/unserved energy, old profile import/unlocks, saved choices and same-model/scenario comparisons.
- Solo and four-crew constrained traversal tests complete all four missions. Lazarus collection now waits for its instrument timer and physically returns the data. Ownership, kit choice, phase, clock authority, pause, disconnect and snapshot state are checked.
- Production build uses the pinned dependency lock. No new runtime dependency was added.

## Browser observations for 1.1.0

A fresh QA profile played Earthwatch through the visible objective routes and all five consoles.
The updated Director showed the 32 Gbit recorder, 137.74 Gbit generated and received, no retained
or dropped packets, requirement checks, energy/timeline disclosures and saved variants. Selecting
the missed-contact test increased peak occupancy from 6.12 to 9.18 Gbit. The design was saved,
evaluated SUCCESS at9.8, persisted its report and unlocked Lunar. The profile export completed.

A later browser profile-fixture import timed out and the browser session expired. No additional
1.1.0 browser completion, A/B UI acceptance, or live guest-network test is claimed from that
attempt. Saved-design comparison and later mission behavior are covered by code review and
automated checks; visual/device acceptance remains useful on the team's machines.

## Acceptance limits

Windows itself was not available in the Linux validation environment. The supplied batch file
starts the checked standard-library Python server. Test the extracted ZIP on Windows using
START_ORBYX.bat. Browser profiles depend on the same origin/port; export a backup before moving.

Guest data channels timed out during the earlier cloud/local browser tests. Deterministic
four-player state, host protocol and real PeerServer signalling tests are distinct from live
WebRTC gameplay. Actual two/four-laptop and cross-network play still requires device testing;
NAT/firewalls may require a reachable TURN relay. No paid relay is provisioned. Host migration
and unfinished-session recovery after host reload remain outside scope.

---

# Historical 1.0.0 verification record

The observations below belong to the preceding build and are retained as project history.

# Verification report — 2026-11-12

This separates automated simulation checks, browser interaction, and network/device limits. No cross-device result is inferred from a single browser or a signalling relay test.

## Automated checks

- `pnpm test`: 78 passing tests in nine files in the final verification run.
- `pnpm build`: passed, including TypeScript checking and the production Vite bundle.
- Original Earthwatch and Lunar model/evaluator tests and all-design sweeps remain included.
- Actual constrained route traversal completes Earthwatch and Lunar with successful outcomes.
- Every workstation, dock and seeded planetary research point has a valid floor/collision route.
- Capsule tests cover mass, delta-v, usable battery, oxygen, scrubber endurance, guidance and computer conditions; viable/partial/failed outcomes and strict-majority rules are checked.
- Solo and four-astronaut evacuation traversals configure separate personal capsules and complete the rescue.
- Organism checks cover occluded vision, hearing moving crew across a wall, routed pursuit without crossing solids, and containment.
- Lazarus tests complete all three solo worlds and all four assigned multiplayer worlds, including outbound fuel, physical walking, research collection, physical return, dataset delivery and evidence vote.
- Wrong votes, repeated ties, missing research, inadequate return reserve, lost crew and deadlines are checked.
- Shared controls validate actual options, identity, owner, location, proximity, phase and resource totals. Pause/disconnect/reconnect state freezes and resumes correctly.
- Lobby tests check unique astronaut reservation, maximum four crew, progression, failed outcomes, immediate success and the two-partial unlock rule.
- Real local PeerServer HTTP/WebSocket integration registers two peers and forwards OFFER and ANSWER messages. This verifies signalling; it does not assert a WebRTC data channel across NAT.

## Browser interaction checked

- A new local Review Pilot profile was created and persisted across source reloads.
- Earthwatch was played through the actual objective-route and console controls, evaluated successfully, saved its report and unlocked Lunar.
- Lunar was played through all seven actual consoles. Its report showed 100% survey return at 0.50 m with 131 m/s reserve, saved and unlocked Evacuation.
- Original astronaut art, Selene room art, HUD and consoles were inspected visually.

- Emergency Evacuation was played through all six personal stations after isolating containment. The viable 789 kg capsule reached rescue with sufficient maneuver, battery, oxygen, scrubbing and guidance; its saved success report unlocked Lazarus.

- Project Lazarus completed all three solo sorties through the actual interface, delivered all observations, preserved the crew and 8,000 kg mothership reserve, voted for Veyra, and saved a successful report. All four missions were unlocked naturally through the campaign.

- The prebuilt Python launcher served HTML and all five linked script/style/favicon assets with HTTP 200 and correct JavaScript/CSS MIME types. It uses no pip dependencies.

- Hosted PeerJS and local development signalling both created rooms through the UI. Host mission selection, readiness and transition into the chosen mission worked.
- A second browser tab attempted to join each signalling mode. Both attempts timed out opening the WebRTC peer data channel. Live guest gameplay, two-tab synchronization and cross-network multiplayer are therefore **not claimed as verified** in this environment.
- The host protocol regression checks use controlled channels to validate sender identity, rejection of guest clock updates, authenticated reconnect replacement, disconnect pause, preservation of completed reports and removal of departed crew on return to lobby. These are distinct from real WebRTC acceptance.
- Each synthetic world now has its own procedural natural-terrain palette and ridges, rather than ship panels. The Cindra lander/terrain presentation was inspected after the visual update.


## Device/network limits

Windows itself is not available in this Linux validation environment. The batch launcher is supplied for Windows, and the underlying Python server is checked locally. A real Windows launch is not claimed. Profiles are local browser storage, not synchronized accounts. Use profile export/import to move them.

Four-player simulation state is tested deterministically. Actual four-laptop play across the team's internet connections remains an acceptance check: signalling and, when NAT requires it, a working TURN relay must be reachable. No paid relay is provisioned. Host reload/migration and recovery of unfinished attempts are outside this build.
