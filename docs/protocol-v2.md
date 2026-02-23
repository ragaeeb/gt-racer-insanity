# Protocol V2

## Versioning
- Active protocol version: `2`
- The runtime is V2-only; unsupported/legacy versions are coerced/rejected at join boundaries.

## Event Contract

### Client -> Server
- `join_room`
  - payload: `{ roomId, playerName, protocolVersion?, selectedVehicleId?, selectedColorId? }`
- `input_frame`
  - payload: `{ roomId, frame }`
  - `frame`: `{ roomId, protocolVersion, seq, timestampMs, ackSnapshotSeq, controls, cruiseControlEnabled, precisionOverrideActive }`
- `ability_activate`
  - payload: `{ roomId, abilityId, seq, targetPlayerId }`

### Server -> Client
- `room_joined`
  - payload: `{ localPlayerId, protocolVersion, seed, players, snapshot? }`
- `player_joined`
  - payload: `PlayerState`
- `player_left`
  - payload: `playerId`
- `server_snapshot`
  - payload: `{ roomId, snapshot }`
- `race_event`
  - payload: `{ roomId, kind, playerId, serverTimeMs, metadata? }`

## Snapshot Semantics
`server_snapshot` is the authoritative state transport and includes:
- `seq`: authoritative snapshot sequence
- `serverTimeMs`: server clock timestamp
- `players[]`: transforms, speed, active effects, race progress, last processed input sequence
- `raceState`: status, ordering, winner, started/ended timestamps, laps, track id

## Sequencing and Reconciliation
- Client `input_frame.seq` increases monotonically.
- Client sends `ackSnapshotSeq` from latest applied snapshot.
- Server records `lastProcessedInputSeq` per player in snapshots.
- Client reconciles local predicted state against authoritative snapshot when thresholds are exceeded.

## Reliability Model
- Input and ability intents are validated server-side.
- Snapshot stream uses frequent updates; clients interpolate remote motion with a short delay buffer.
- `race_event` carries discrete authoritative events (lap complete, finish, collision bump, ability/hazard/powerup events).

## Validation and Limits
- Join/input payload size limits are enforced server-side.
- Input frame rate is clamped on both client and server.
- Unknown/invalid payload shapes are ignored.

## Late Join Behavior
- On join, server generates a fresh simulation snapshot and includes it in `room_joined`.
- This prevents stale spawn-side positions for players already racing.
