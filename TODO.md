# ORBYX continuation status

The supplied Manus project is the baseline. Preserve its Phaser 3.90 artwork, DOM interface, original astronauts and Earthwatch/Lunar engineering models. Current build: 1.1.0. Engineering audit upgrades are recorded in docs/CHANGELOG.md.

## Implemented

- [x] Earthwatch: five coupled engineering stations, original flight animation and detailed report.
- [x] Lunar Survey and Return: seven stations, Selene map, vertical hatches, Moon cinematic, cislunar models and outcome sweep.
- [x] Emergency Evacuation: three decks, six independently configured capsule systems per astronaut, radiation/breach repairs, line-of-sight and hearing-based organism pursuit, containment, launch and majority-aware rescue evaluation.
- [x] Project Lazarus: limited shared resources, return reserve, assigned landers, four deterministic traversable planet mazes, transit/surface consumption, research collection and delivery, crew survival, evidence comparison, voting and revote.
- [x] Solo plus up to four peer-connected players: room codes, unique astronauts, ready manifest, chat, assigned consoles, personal capsules, host-authoritative collision/time/actions, snapshots, reconnect secrets and disconnect pause.
- [x] Consistent progression: one success or two partial results; persistent local reports and profile export/import.
- [x] Browser-accessible movement routes and console controls; no teleport shortcuts required to play.
- [x] Prebuilt static game and standard-library Python launcher; no pip or C++ build needed to play.

## Verification and handoff

See docs/QA.md for the final checks and limits. Current automated suite includes the retained tests, complete constrained mission traversals, four-player Lazarus state, hazard pursuit, ownership, progression, and real PeerServer HTTP/WebSocket signalling relay. Browser/network results are recorded separately from unit checks.

## Explicit limits / future work

- Actual cross-device/cross-network WebRTC acceptance must be performed with the team's devices. Some networks need a reachable TURN service; no paid relay is included.
- Host migration, autosaved unfinished attempts, ranked anti-cheat accounts and more than four players are not implemented.
- Ship/planet layouts and engineering coefficients are simplified educational models. Planets/interstellar transportation are fictional.
- Optional future polish: additional maze seeds/scenarios, accessibility remapping, localization and mobile controls.

Original milestone notes are retained in docs/MANUS_HANDOFF.md, not used as the current completion checklist.
