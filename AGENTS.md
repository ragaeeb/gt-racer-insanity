# GT Racer Insanity Agent Guide

## Mission
Build and maintain a full multiplayer racing game with a clean architecture, high iteration speed, and low technical debt.

## Stack
- Runtime/package manager: `bun`
- Client: `React + Vite + @react-three/fiber + three`
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
- Full check: `bun run check`

## Repository Layout
- `src/client/app`: React app shell, entrypoint, global styles
- `src/client/game`: runtime gameplay systems and scene
- `src/client/network`: client realtime networking
- `src/server`: Bun Socket.IO server and room management
- `src/shared`: shared domain logic/types used by client and server
- `tests`: unit tests for shared/server logic
- `public/branding`: icons and branding assets (`icon.svg`, `icon.png`)
- `.github/workflows`: CI and release automation

## Architecture Notes
- Keep rendering concerns in `src/client/game`.
- Keep deterministic/testable logic in `src/shared`.
- Keep room lifecycle and server state handling in `src/server/roomStore.ts`.
- Networking protocol shapes should live in `src/shared/network/types.ts`.

## UI/Asset Notes
- Favicon/app icon uses:
  - `/public/branding/icon.svg` (primary)
  - `/public/branding/icon.png` (fallback/touch icon)
- README should display the game icon from `public/branding/icon.png`.

## CI/Versioning
- CI workflow runs build + tests on push and pull requests.
- Release workflow increments semantic version on each commit to `main` and tags `vX.Y.Z`.
