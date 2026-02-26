# Architecture V2

## Goal
Deliver a V2-only multiplayer architecture where the server is authoritative for race state, collision outcomes, and gameplay effects.

## Runtime Topology
- Client (`src/client/*`): captures player input, predicts local movement, interpolates remote cars, reconciles to authoritative snapshots, renders HUD/scene.
- Server (`src/server/*`): owns room lifecycle, simulation stepping, authoritative snapshot/race-event broadcast.
- Shared (`src/shared/*`): protocol payload contracts, deterministic race progress helpers, and gameplay manifests.

## Authoritative Data Flow
1. Client joins via `join_room`.
2. Server creates/joins room simulation and responds with `room_joined` plus a fresh authoritative snapshot (or `join_error` when validation fails).
3. Client emits sequenced `input_frame` packets (`seq`, controls, `ackSnapshotSeq`).
4. Server consumes latest queued input per player each simulation tick and steps Rapier rigid bodies.
5. Server resolves race progress and gameplay systems (abilities/effects/hazards/powerups).
6. Server emits `server_snapshot` at snapshot rate and `race_event` for discrete race events.
7. Client reconciles local car against authoritative snapshot and interpolates remote players using buffered snapshots.

## Simulation Layers
- Transport: `src/server/index.ts`, `src/client/network/NetworkManager.ts`
- Room lifecycle: `src/server/roomStore.ts`
- Simulation core: `src/server/sim/roomSimulation.ts`
- Physics world: `src/server/sim/rapierWorld.ts`, `src/server/sim/trackColliderBuilder.ts`, `src/server/sim/collisionSystem.ts`
- Gameplay effects: `src/server/sim/abilitySystem.ts`, `src/server/sim/effectSystem.ts`, `src/server/sim/hazardSystem.ts`, `src/server/sim/powerupSystem.ts`
- Snapshot output: `src/server/sim/snapshotBuilder.ts`
- Scene decoration: `src/client/game/systems/SceneryManager.ts` deterministically places buildings, streetlights, and pillars around the track using seeded randomness so each theme feels consistent; `RaceWorld` updates scenery LOD visibility every frame from the active camera.

## Module Boundaries
- `src/client/game`: render-time scene and entity orchestration only.
- `src/client/game/state`: transient runtime/HUD state through Zustand.
- `src/shared/game/*`: deterministic rules/manifests reusable by both runtimes.
- `src/server/sim/*`: authoritative mutation of race state.

## Diagnostics & Observability
- `RaceWorld` mounts `useDiagnostics` to capture frame gaps, long tasks, collision contacts, and snapshot statistics; the hook exposes `window.__GT_DEBUG__` / `window.__GT_DIAG__` for tooling and E2E automation.
- Diagnostics can be enabled with `?diag=1` or `localStorage gt-diag=true` (use `gt-diag-verbose` for extra logging), providing a quick feedback loop for diagnosing freezes, long-collision frames, and reproduction of the crash/freeze path.

## Timing Defaults
- Simulation tick: `60 Hz`
- Snapshot broadcast: `20 Hz`
- Client input send: `30 Hz` (clamped)
- Client interpolation delay: `100 ms` (configurable)
- Reconciliation thresholds: `0.35 m` position, `4 deg` yaw

## Race Completion Semantics
- Progress uses track checkpoints + lap wrapping from shared `raceProgress` helpers.
- Server progress distance accounts for car forward collider extent so cars finishing against the end barrier still complete the race.
- Race winner is assigned by first authoritative finisher and included in snapshot `raceState`.

## Testing Coverage Anchors
- `src/server/sim/roomSimulation.test.ts`: movement, ordering, collision bump event emission, deterministic finish outcomes.
- `src/server/roomStore.test.ts`: join/leave lifecycle, late-join authoritative snapshot correctness.
- `src/client/network/NetworkManager.test.ts`: sequenced input framing and send throttling.
