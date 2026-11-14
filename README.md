# ORBYX 1.1.0 · Four-mission engineering update

This continues the supplied Manus Phaser 3.90 + TypeScript + Vite project. Its original procedural astronaut artwork, rooms, font treatment, sound effects, Earthwatch and Lunar models are retained. All four missions and PeerJS crew rooms are retained. This update applies the engineering audit without replacing the original game.

New in 1.1.0: mandatory/advisory requirement checks, finite data recorders, received-science accounting, representative battery charge traces, an optional missed-contact operations test, saved design variants and same-model A/B report comparison. Lazarus adds three survey kits, timed fieldwork and temperature-dependent electrical demand. Lander return burns now debit the actual wet-mass burn, walking uses suit electricity, and each escape-capsule subsystem is graded independently.

Source, tests, docs, bundled assets and the rebuilt `dist/` are included. See `docs/CHANGELOG.md`, `docs/ENGINEERING.md` and `docs/NASA_RESOURCE_MAP.md`.

## Play on Windows

1. Extract the entire archive into a **new folder**.
2. Open `orbyx` and double-click **START_ORBYX.bat**.
3. Your browser opens **http://localhost:8765/**. Keep the launcher window open.
4. Create a local profile, choose Play solo, select an astronaut and begin Earthwatch.

The archive includes `dist/`, so playing needs only Python 3.8+ and a desktop browser. **No pip, virtual environment, C++ compiler or npm installation is needed to play the included build.** macOS/Linux: `python3 serve.py` or `sh start.sh`. Do not open `dist/index.html` directly as a file; ES modules and local profiles need a web origin.

## Controls

- WASD / arrows: move. E or the **Interact** button: use a nearby console or repair point.
- Click a clear floor tile, an objective, or a map destination: walk a route at normal speed with collision.
- M: map. H / ?: help. Esc: close a panel or open pause.
- Station options: 1 / 2 / 3, then Enter to commit; mouse also works.
- The mission clock includes reading time. The host can pause; backgrounding the host auto-pauses an active mission.

## Four missions

| Mission | Gameplay |
| --- | --- |
| Earthwatch · Easy | Five workstations, coupled satellite mass/orbit/payload/power/link/launch decisions and evaluated flight. |
| Lunar Survey and Return · Intermediate | Seven workstations on Selene; staged burns, boil-off, lunar survey coverage, thermal control, energy, communications and return reserve. |
| Emergency Evacuation · Hard | A damaged three-deck ship. Each astronaut prepares six personal capsule systems, avoids or isolates hazards and launches from the evacuation dock. |
| Project Lazarus · Extreme | Allocate fuel, electricity, oxygen and supplies; explore distinct synthetic worlds, collect research, return all datasets and crew, then vote from the evidence. |

Progression preserves the Manus rule: **one Successful or two Partially Successful results** clears a mission. All players must have unlocked the selected multiplayer mission. Reports save locally and reopen through Mission history; export/import profiles through Settings.

Evacuation requires all astronauts and viable capsules for full success. A strict surviving majority can produce partial success; a 1–1 split in a two-person crew fails. Solo has a partial outcome when the capsule return is viable but rescue beacon availability is deficient. Death is permanent in this fictional emergency. Capsules rendezvous with a rescue transport over 72 modeled hours; onward Earth return is a story assumption, not a claimed direct 72-hour interplanetary trajectory.

Lazarus requires every required dataset, every living crew member aboard and enough mothership return propellant. Wrong final candidate or repeated voting tie gives partial success only after those critical conditions are met. One death, missing data or insufficient return reserve fails. Solo surveys three worlds sequentially with ten extra minutes. Multiplayer assigns one world per player. Planet measurements and habitability thresholds are synthetic game data, not proof of human habitability. Environmental windows replace time dilation. Surface consumption is compressed 60:1; transit time is modeled separately. Select a survey kit at Expedition Control before dispatch. At a research station, start collection and remain there until its 6/12/24-second timer completes. Returning the physical recorder delivers the dataset to the mothership. Full science success requires at least 90% useful measurement completeness; rapid reconnaissance omits two of the six environmental measurements.

## Save, revise and compare

Save a design variant from the Director or Expedition Control. Reopen it from Mission history. Saved station choices are preselected as references: walk to each console, review and commit them as usual. Lazarus can load its saved solo allocations and kit choices at Expedition Control before dispatch. Completed 1.1.0 reports also offer **Revise saved design**.

After two attempts on the same mission, model and crew scenario, open **Compare designs A / B** in the debrief. Old reports remain readable with their original grades. A new model never silently recalculates old scores or takes away earned mission unlocks. Export a profile backup in Settings before moving folders, browsers or devices.

Earthwatch models a five-year design life using three representative end-of-life energy orbits and a three-day collection/contact schedule. Lunar uses a seven-day data schedule and three representative survey energy orbits, alongside its sequenced burns and coasts. These are bounded teaching models, not full mission propagations. The player countdown is separate from modeled duration.

## Multiplayer · up to four players

All players must use **1.1.0** (network protocol 4). Each player opens the same game version on their own laptop. Choose **Multiplayer**, then Create room or Join room. Share the six-character room code, choose unique astronauts, mark ready and let the host start.

Gameplay runs in the host's browser. Guests send actions and movement intent; the host validates character reservations, station ownership, proximity, choices, resource allocations, movement collision, time, hazards and results. Position/state snapshots are distributed over PeerJS WebRTC data channels.

Validation created rooms with both signalling modes, but guest data-channel joining timed out in this browser environment. Treat live multiplayer as requiring a device/network acceptance test; the automated protocol checks are documented in `docs/QA.md`.

**Internet play still needs signalling and sometimes TURN.** The default uses PeerJS hosted signalling and Google's public STUN. Direct connections across different internet connections depend on NAT/firewall conditions. Optional TURN fields accept your relay provider's temporary credentials; no paid relay or subscription is supplied. Room codes invite peers but are not account authentication. Use trusted teammates.

Local signalling is included with `pnpm dev` at `/peerjs/orbyx`; select Local signalling on every player using the same development host. It is suitable for direct LAN connections. `pnpm signal` also starts an optional separate PeerServer at `http://localhost:9000/orbyx`; teammates must configure the same reachable custom URL. A public game/custom signalling endpoint should use HTTPS. The Python launcher only serves game files.

A guest disconnect pauses the attempt. Rejoining with the same tab identity and retained session secret restores its crew slot; the host resumes when everyone is connected. Host loss suspends guests and attempts reconnect while that host is still available. **Host migration and unfinished-game recovery after host reload are not implemented.** Abandoning the attempt does not add a completed report.

## Develop in VS Code

Use Node 22.12+ or a newer supported Node release and the project's pinned pnpm version. In the project folder:

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm build
```

Open the URL printed by Vite (normally `http://localhost:3000`). `pnpm build` typechecks and rebuilds `dist/`. The included Python launcher serves that rebuilt output. The game is a static client application; no database/authentication backend is needed. Solo uses bundled art/fonts and runs without internet after local loading. Reloading a previously visited remote site offline is not guaranteed; no service worker is claimed.

## Source layout

- `src/sim/models/`, `src/sim/missions/earthwatch.ts`, `lunar.ts`: retained Manus engineering models.
- `src/sim/missions/evac.ts`: capsule engineering model and station choices.
- `src/state/session.ts`: authoritative mission state, action permissions, shared timer and result transition.
- `src/state/expedition.ts`: survival, repairs, lander allocation, consumables, dataset delivery, voting and advanced mission reports.
- `src/data/expeditions.ts`: ship/planet maps, synthetic planetary evidence, pathfinding and authoritative collision.
- `src/net/room.ts`: PeerJS protocol, lobby reservations, state distribution and reconnection.
- `src/game/`: original artwork/scenes plus synchronized crew, hazards, planets and expedition cinematics.
- `src/ui/expedition.ts`: resource allocation, personal capsule controls, evidence/voting and multiplayer lobby.
- `src/persist/profile.ts`: local IndexedDB/localStorage profile and backups.
- `tests/`: retained model tests plus mission traversal, outcome, survival, authority and lobby checks.
- `docs/ENGINEERING.md`, `docs/QA.md`: assumptions, changes and verified limits.

Local profiles are not secure cross-device accounts. Clearing browser data or changing URL/port can hide or erase progress. Export a backup before moving between devices/origins. This independent educational project does not imply NASA endorsement. Open-source notices are in `THIRD_PARTY_NOTICES.txt`.
