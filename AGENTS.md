# GT Racer Insanity Agent Guide

## Mission
Build and maintain a full multiplayer racing game with a clean architecture, high iteration speed, and low technical debt.

## Stack
- Runtime/package manager: `bun`
- Client: `React + Vite + @react-three/fiber + three`
- UI: `Tailwind CSS` + shadcn-style component patterns
- Realtime server: `Bun + Socket.IO + @socket.io/bun-engine`
- Language: `TypeScript` targeting `ESNext`
- Testing: `bun:test`

## Non-Negotiables
- Always use `bun`, never `npm` or `node` commands.
- Tests must use `bun:test`.
- Test descriptions must follow `it('should ...')`.
- Prefer `type` over `interface`.
- Prefer arrow functions over standalone `function` declarations.
- Keep TS and runtime features aligned with `ESNext`.

## Commands
- Install deps: `bun install`
- Client dev server: `bun run dev`
- Multiplayer server: `bun run server`
- Build: `bun run build`
- Unit tests: `bun run test`
- Watch tests: `bun run test:watch`
- E2E tests: `bun run e2e` (opt-in, runs with `RUN_E2E=true`)
- Full check: `bun run check`

## Repository Layout
- `src/client/app`: React app shell, entrypoint, global styles
- `src/components`: reusable UI components
- `src/lib`: shared client utility helpers
- `src/client/game`: runtime gameplay systems and scene (entities, hooks, state, systems such as TrackManager, SceneryManager, correction/interpolation)
- `src/client/network`: client realtime networking
- `src/server`: Bun Socket.IO server and room lifecycle; authoritative simulation lives in `src/server/sim` (Rapier world, colliders, input queue, race progression, effects, powerups, hazards)
- `src/shared`: shared domain logic, manifests, validators, and types used by client and server (with colocated unit tests); protocol types in `src/shared/network/types.ts`, snapshot validators in `src/shared/network/snapshot.ts`; shared physics constants in `src/shared/physics/constants.ts`
- `testing`: opt-in end-to-end tests
- `public/branding`: icons and branding assets (`icon.svg`, `icon.png`)
- `.github/workflows`: CI and release automation

## Architecture Notes
- Keep rendering concerns in `src/client/game`.
- Keep deterministic/testable logic in `src/shared`.
- Room lifecycle and room store live in `src/server/roomStore.ts`; authoritative simulation (physics, collision, track boundary, effects, powerups, hazards) lives in `src/server/sim/` (e.g. `roomSimulation.ts`, `collisionSystem.ts`).
- Networking protocol shapes in `src/shared/network/types.ts`; snapshot and payload validators (including powerup/hazard item shapes) in `src/shared/network/snapshot.ts`.
- Shared physics constants (e.g. player collider half-width) live in `src/shared/physics/constants.ts` and are used by client boundary clamping, server colliders, and tests.
- Realtime room events are owned in `src/server/index.ts` and mirrored by `src/client/network/NetworkManager.ts` (including `restart_race`).
- Player identity is part of shared network player state (`name` on `PlayerState`).
- Scene presentation is defined through environment profiles in `src/client/game/scene/environment/sceneEnvironmentProfiles.ts`; scenery is rebuilt when the track changes (useNetworkConnection).
- E2E tests are intentionally gated and should not run in default `bun test` flows.

## Diagnostics
- `src/client/game/hooks/useDiagnostics.ts` exposes `window.__GT_DEBUG__` (player/opponent positions, connection state) and `window.__GT_DIAG__` (frame-gap/long-task counters, report download) for runtime investigations.
- Toggle diagnostics using `?diag=1` or `localStorage gt-diag=true` (and `gt-diag-verbose` for extra logs). Clearing the flag auto-resets capture state; toolchains/E2E can enable diagnostics at runtime via `enableDiagnosticsRuntime`.
- When debugging freeze/regression issues, start with the exposed summary data (frame gap counts, long task max) before digging deeper; this instrumentation is the canonical way to collect safety data for collisions, hazards, and powerups.

## UI/Asset Notes
- Favicon/app icon uses:
  - `/public/branding/icon.svg` (primary)
  - `/public/branding/icon.png` (fallback/touch icon)
- README should display the game icon from `public/branding/icon.png`.

## CI/Versioning
- CI workflow runs build + tests on push and pull requests.
- Release workflow runs `semantic-release` on `main` and publishes tags/releases based on Conventional Commits.
