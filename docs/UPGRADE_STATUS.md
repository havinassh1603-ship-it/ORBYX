# ORBYX 1.1.0 implementation checkpoint

The original 1.0.0 archive remains the comparison baseline. Preserve the four missions, art,
maps, controls, host-authoritative rooms and existing profile unlock rules.

- [x] M1: mandatory/advisory checks, correct wet-mass return burn, fuel/walking semantics, per-system capsule grading.
- [x] M2: finite recorder and bounded phase-energy models, useful received science, saved choices and same-model comparisons.
- [x] M3: three synthetic survey kits with mass, energy, time, data and completeness; environmental thermal demand.
- [x] M4: existing-panel education, operation traces, NASA resource provenance, regression tests, build and playable ZIP.

Do not claim an ephemeris/GMAT simulation or verified multi-device networking. Keep Python-only play launchers and bundle dist/.

Verification: 96 tests, all-design invariants and TypeScript pass. See QA.md for browser/device limits.
