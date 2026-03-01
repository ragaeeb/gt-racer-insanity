# Protocol V2

## Versioning
- Active protocol version: `2`
- The runtime is V2-only; unsupported/legacy versions are coerced/rejected at join boundaries.

## Event Contract

### Client -> Server
- `restart_race`
  - payload: `{ roomId }`
- `join_room`
  - payload: `{ roomId, playerName, protocolVersion?, selectedVehicleId?, selectedColorId?, selectedTrackId? }`
- `input_frame`
  - payload: `{ roomId, frame }`
  - `frame`: `{ roomId, protocolVersion, seq, timestampMs, ackSnapshotSeq, controls, cruiseControlEnabled, precisionOverrideActive }`
  - note: `roomId` is intentionally duplicated in both payload and frame so frame objects stay self-contained for diagnostics/replay logs.
- `ability_activate`
  - payload: `{ roomId, abilityId, seq, targetPlayerId }`

### Server -> Client
- `room_joined`
  - payload: `{ localPlayerId, protocolVersion, seed, players, snapshot }`
  - note: server always includes the full authoritative snapshot (`players`, `raceState`, plus powerup/hazard state) so the client starts in sync.
- `player_joined`
  - payload: `PlayerState`
- `player_left`
  - payload: `playerId`
- `join_error`
  - payload: `{ reason, message? }`
  - `reason` values: `invalid_payload`, `payload_too_large`, `unsupported_protocol`, `invalid_room_id`
- `server_snapshot`
  - payload: `{ roomId, snapshot }`
- `race_event`
  - payload: `{ roomId, kind, playerId, serverTimeMs, metadata? }`
  - `kind` values:
    - `countdown_started`: `metadata` omitted
    - `race_started`: `metadata` omitted
    - `lap_completed`: `metadata.lap` (number)
    - `player_finished`: `metadata.lap` (number)
    - `race_finished`: `metadata` omitted
    - `collision_bump`: `metadata.againstPlayerId` (string), `metadata.flippedPlayerId` (string | null), `metadata.stunnedPlayerId` (string | null), `metadata.rammerPlayerId` (string), `metadata.rammerDriveLockMs` (number), `metadata.contactForceMagnitude` (number | null)
    - `ability_activated`: `metadata.abilityId` (string), `metadata.targetPlayerId` (string | null)
    - `ability_rejected`: `metadata.abilityId` (string), `metadata.reason` (`cooldown` | `invalid_ability` | `invalid_player` | `target_not_found` | `usage_limit`), `metadata.vehicleId` (string | null)
    - `hazard_triggered`: `metadata.effectType` (string), `metadata.flippedPlayerId` (string | null), `metadata.hazardId` (string | null)
    - `powerup_collected`: `metadata.powerupType` (string)
    - `projectile_hit`: `metadata.effectType` (`stunned`), `metadata.projectileId` (number), `metadata.targetPlayerId` (string)

## Snapshot Semantics
`server_snapshot` is the authoritative state transport and includes:
- `seq`: authoritative snapshot sequence
- `serverTimeMs`: server clock timestamp
- `players[]`: transforms, speed, active effects, race progress, last processed input sequence
- `raceState`: status, ordering, winner, started/ended timestamps, laps, track id
- `powerups[]`: each entry (`{ id, powerupId, x, z, isActive }`) represents a spawn point’s current coordinates and whether it is awake; clients use this to render floating orbs and HUD toasts.
- `hazards[]`: each entry (`{ id, hazardId, x, z }`) mirrors the server’s hazard spawns so clients can build spike-strip visuals, warning chevrons, and apply effects when collisions occur.

## Sequencing and Reconciliation
- Client `input_frame.seq` increases monotonically.
- Client sends `ackSnapshotSeq` from latest applied snapshot.
- Server records `lastProcessedInputSeq` per player in snapshots.
- Client reconciles local predicted state against authoritative snapshot when thresholds are exceeded.

## Reliability Model
- Input and ability intents are validated server-side.
- Snapshot stream uses frequent updates; clients interpolate remote motion with a short delay buffer.
- `race_event` carries discrete authoritative events (lap complete, finish, collision bump, ability/hazard/power-up events).

## Validation and Limits
- Join/input payload size limits are enforced server-side.
- Input frame rate is clamped on both client and server.
- Unknown/invalid payload shapes are ignored.
- Invalid join payloads emit `join_error` so clients can surface a reason instead of waiting indefinitely.

## Late Join Behavior
- On join, server generates a fresh simulation snapshot and includes it in `room_joined`.
- This prevents stale spawn-side positions for players already racing.
