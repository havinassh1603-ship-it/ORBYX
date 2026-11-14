# Original Manus milestone notes

These notes were present in the supplied source archive. They are retained for provenance; the current status is in the root TODO.md and docs/QA.md. Paths and completion claims below describe the original Manus environment.

# ORBYX — TODO (governing plan: approved Phase 0 design, /home/ubuntu/orbyx-phase0/ORBYX_Phase0_Game_Design.md)

Stack: Phaser 3.90.0 + TypeScript + Vite 7 (static build, no server/DB). DOM overlay for menus/HUD/panels
(crisp text), Phaser for the world. Pure `src/sim/` (no Phaser imports) tested with Vitest.
Fonts bundled via @fontsource (Space Grotesk display, Inter body) for offline play.
Art: original procedural art drawn on canvas at boot (no external assets). Chibi astronaut: large round
helmet with glossy visor, small rounded torso, backpack, chunky boots, antenna light, suit colour per
astronaut. Same draw function powers the roster illustration and the in-world spritesheets
(down/up/side x 4 walk frames + idle). No photo/likeness of real people.

## Module layout
- src/sim/models/* orbit, imaging, power, link, propulsion(+thermal) — DONE
- src/sim/types.ts — DONE; src/sim/missions/earthwatch.ts stations+compute+gauges+evaluate — DONE (tune via tests/sweep.test.ts)
- src/data/astronauts.ts roster (facts below) ; src/data/maps/earthwatch.ts ASCII map
- src/state/session.ts MissionSession reducer (actions: commit, run, tick, expire) — host-authoritative ready for M4
- src/persist/profile.ts IndexedDB (idb) + localStorage mirror, export/import JSON w/ checksum + version
- src/game/textures.ts, WorldScene.ts (tilemap from ASCII, arcade collision, auto doors, stations, prompts, camera), CinematicScene.ts
- src/ui/* DOM screens: boot, profile create, main menu, mission select, roster, briefing, HUD, station panel,
  map overlay, help, pause, settings, debrief, history; styles.css
- src/audio/sfx.ts WebAudio synth (click, commit chime, door whoosh, footsteps, alarm, ambient hum)

## M1 outcomes (acceptance)
Evidence: tests/e2e/playtest.py 28/28 browser checks; vitest 28/28 (models, evaluator, session, profile); tsc + vite build clean.
- [x] Original ORBYX identity: wordmark, signature colour, boot/title screen, not a website look.
- [x] Local profile: create display name, persists across reloads (IndexedDB + localStorage mirror); export/import JSON with checksum; honest note that clearing browser data erases progress.
- [x] Main menu: Play solo, Mission select (Earthwatch available; Lunar/Hard/Extreme shown locked with unlock rule; later missions labelled as in development, not clickable), History, Settings, Help. Multiplayer shown disabled "arrives in M4" (no dead buttons that pretend to work).
- [x] Astronaut roster: six astronauts, animated illustration left, verified biography right, separate clearly-labelled fictional gameplay role; choose one.
- [x] Earthwatch map: rooms, corridors, walls with collision, auto-sliding doors, room labels, decor, 5 workstations (orbit/GNC, payload/OBDH, power/EPS, comms/COMMS, launch/PROP) + Flight Director (Run Mission) console in Mission Control.
- [x] Controls: WASD/arrows move with acceleration, E interact, M map, H/? help, Esc pause/close; prompt appears near station.
- [x] HUD: help button top-left, map button top-right, countdown timer immediately left of map, live gauges (mass, power, data, resolution, cost), objectives checklist.
- [x] Station panel: question, context, live budget for that subsystem, 3 options (order shuffled per seed), keys 1/2/3, Enter commit, Esc close; revisable until Run.
- [x] Run Mission only when all required tasks committed; timer expiry auto-evaluates with missing tasks -> Failed.
- [x] Short cinematic (launch -> orbit -> imaging/downlink; launch failure variant), skippable.
- [x] Debrief: outcome (Successful / Partially Successful / Failed), score /10, per-subsystem choice -> computed results -> effect -> lesson (no answer key), contributions, retry / mission select; saved to profile history and re-openable.
- [x] Progression: Earthwatch Successful unlocks Lunar (Lunar playable in M2).
- [x] Settings: master volume, SFX on/off, reduced motion, UI scale — all functional.
- [x] Tests: model tests (period, eclipse, Tsiolkovsky, link, GSD, power sign, thermal) + Earthwatch evaluator cases + profile export/import validation; typecheck + build pass.
- [ ] Playable preview + checkpoint + honest M1 report.

## Roster facts (verified; keep accurate)
- Yuri Gagarin (1934-1968), Soviet Air Force pilot; Vostok 1, 12 Apr 1961, first human in space, one orbit ~108 min; died 27 Mar 1968 in MiG-15UTI training crash. Role: Propulsion & Launch (PROP).
- Michael Collins (1930-2021, born Rome), USAF test pilot; Gemini 10 (Jul 1966) two EVAs; Apollo 11 command module pilot; later director of the National Air and Space Museum; wrote "Carrying the Fire". Role: Communications (COMMS).
- Neil Armstrong (1930-2012), naval aviator, X-15 test pilot; Gemini 8 (Mar 1966) first docking of two spacecraft in orbit; Apollo 11 commander, first to walk on the Moon 20 Jul 1969; later aerospace engineering professor, University of Cincinnati. Role: GNC.
- Buzz Aldrin (born 20 Jan 1930, living, 96 in 2026), West Point 1951, USAF fighter pilot Korea, Sc.D. MIT 1963 (thesis on orbital rendezvous guidance); Gemini 12 (Nov 1966) EVA techniques; Apollo 11 lunar module pilot, second person on the Moon. Role: OBDH.
- Valentina Tereshkova (born 6 Mar 1937, living), textile worker & amateur parachutist; Vostok 6, 16-19 Jun 1963, first woman in space, 48 orbits ~71 h; later engineering degree (Zhukovsky Air Force Engineering Academy) and politician (State Duma). Role: EPS.
- Kalpana Chawla (1962-2003, born Karnal, India), aerospace engineer: B.Eng Punjab Engineering College 1982, M.S. UT Arlington 1984, Ph.D. CU Boulder 1988; NASA Ames CFD; STS-87 (1997) and STS-107 (2003, Columbia, died 1 Feb 2003 on re-entry); first woman of Indian origin in space. Role: Thermal (THERMAL).

## Next milestones
- [ ] M2 Lunar Survey and Return (Intermediate) — IN PROGRESS
  Design (approved Phase 0 sec 6.2, refined): crewed Selene in 400 km LEO; 7 stations (engine PROP, tanks STRUCT, orbit GNC,
  survey OBDH, power EPS, thermal THERMAL, comms COMMS) in src/sim/missions/lunar.ts; models in src/sim/models/cislunar.ts
  (lunar period/eclipse, track spacing, sequenced burn plan w/ boil-off, radiator hot/cold/heater). 15 min timer (stricter than EW).
  Rules: stack > 60 t -> scrub FAILED; TLI shortfall -> stays in LEO FAILED; later shortfall -> free-return flyby FAILED (crew safe);
  reserve after TEI < 100 m/s -> cannot be SUCCESS; survey < 30% -> FAILED. Modifications vs Phase 0 to report: kerolox->methalox,
  propellant loads scaled to 36/40/44 t (crewed ship realistic mass), 60 t launch cap added, 18->15 min, comms trade driven by
  6 h/day HD crew video (Phase 0 link figure 65 dB-Hz was an arithmetic slip; correct ~75+ dB-Hz), 7 stations not 6 (engine and load split).
  TODO: registry entry + map (vertical ship: spine corridor, side modules, vertical doors), new props (tank, engine, platform rotating,
  capsule, radiator, bunk), vertical door support in WorldScene, CinematicInfo union + lunar cinematic (scrub/leo/freeReturn/orbit,
  Moon globe), tests (cislunar models, lunar evaluator, sweep), e2e (unlock via EW then fly lunar best+bad), checkpoint.
- [ ] M3 Emergency Evacuation (Hard): damaged ship, hazards, roaming organism, individual escape pods
- [ ] M4 Project Lazarus (Extreme) + PeerJS host-authoritative multiplayer (room codes, 4 players expandable to 5, unique astronauts)
