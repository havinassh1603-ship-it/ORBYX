# 1.1.0 · Engineering audit update

- Preserved the four missions, original Phaser scenes, astronaut art, maps, sound, controls and crew-room architecture.
- Required Earthwatch success to respect the USD60M budget, launch margin, useful imagery, battery cycling, operational life and post-mission disposal rules. Lunar full success now requires all published useful survey and downlink objectives.
- Added finite data collection/contact/recovery ledgers, overflow accounting, optional missed-contact testing and bounded phase energy traces. Science depends on received data.
- Corrected lander return fuel debit using actual wet mass. Walking consumes suit electricity instead of lander propellant.
- Graded escape-capsule subsystems independently, including deficient rescue beacons.
- Added three hypothetical Lazarus survey kits, timed field collection, kit mass in burns, temperature-dependent electrical demand and measurement completeness.
- Saved exact design choices, allocations and model assumptions with new reports. Added reusable solo variants and same-model/scenario A/B comparison without regrading legacy reports.
- Added mission-segment traces, requirement advice and NASA resource provenance within the established interface.
- Raised the network protocol to 4 for the new authoritative state; no paid infrastructure or new runtime dependency.
- Bundled rebuilt dist/ and the existing Python-only Windows/macOS/Linux launchers.

---

# Continuation from the supplied Manus source

## 1.0.0 — 2026-11-12

- Preserved the original Phaser artwork, font/UI style, profile system, Earthwatch and Lunar engineering models, Selene map and mission cinematics.
- Completed the four-mission progression with Emergency Evacuation and Project Lazarus.
- Added a shared authoritative movement/physics state, legal walking routes, synchronized crew positions, actual survival hazards, organism pursuit/containment and personal capsule configuration.
- Added finite planetary resource allocations, mass-coupled lander burns, transit/surface consumption, seeded terrain mazes, dataset delivery, survival rules, evidence comparison and voting.
- Added PeerJS room setup, unique astronauts, crew readiness/chat, mission unlock checks, host action validation, state distribution and authenticated guest reconnects. Connection failures remain visible. Live WebRTC joining did not complete in the validation browser; test on the team's actual devices.
- Preserved one-success/two-partial progression in solo profiles and crew lobbies, report history and checksum-backed profile export/import.
- Added a Python standard-library launcher and prebuilt game; no pip installation is needed to play.
- Added mission traversal, survival, outcome, allocation, voting, authority, lobby, reconnect and signalling integration checks. Final automated run: 78 tests across nine files; production build passed.

See ENGINEERING.md for numerical assumptions and QA.md for actual verification and limitations. Original Manus notes are retained in MANUS_HANDOFF.md for provenance.
