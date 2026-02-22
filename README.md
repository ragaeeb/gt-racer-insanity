# GT Racer Insanity

[![codecov](https://codecov.io/gh/ragaeeb/gt-racer-insanity/graph/badge.svg?token=H60UESOHWX)](https://codecov.io/gh/ragaeeb/gt-racer-insanity)
[![CI](https://github.com/ragaeeb/gt-racer-insanity/actions/workflows/ci.yml/badge.svg)](https://github.com/ragaeeb/gt-racer-insanity/actions/workflows/ci.yml)
[![Release](https://github.com/ragaeeb/gt-racer-insanity/actions/workflows/release.yml/badge.svg)](https://github.com/ragaeeb/gt-racer-insanity/actions/workflows/release.yml)
[![Bun](https://img.shields.io/badge/Bun-1.3.9%2B-000000?logo=bun)](https://bun.sh/)
[![TypeScript](https://img.shields.io/badge/TypeScript-ESNext-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-7.x-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![React](https://img.shields.io/badge/React-19.x-61DAFB?logo=react&logoColor=000000)](https://react.dev/)
[![Three.js](https://img.shields.io/badge/Three.js-0.183-000000?logo=three.js&logoColor=white)](https://threejs.org/)
[![R3F](https://img.shields.io/badge/@react--three/fiber-9.5-20232A?logo=react&logoColor=61DAFB)](https://docs.pmnd.rs/react-three-fiber)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.8-black?logo=socket.io&logoColor=white)](https://socket.io/)
[![Playwright](https://img.shields.io/badge/Playwright-E2E-2EAD33?logo=playwright&logoColor=white)](https://playwright.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![wakatime](https://wakatime.com/badge/user/a0b906ce-b8e7-4463-8bce-383238df6d4b/project/77bad006-7cd7-47f4-a8d7-5a1d9d228e06.svg)](https://wakatime.com/badge/user/a0b906ce-b8e7-4463-8bce-383238df6d4b/project/77bad006-7cd7-47f4-a8d7-5a1d9d228e06)

![GT Racer Insanity logo](public/branding/icon.png)

Multiplayer racing game prototype evolving into a full game with car selection, showroom scenes, multiple tracks, and realtime multiplayer racing.

## Tech Stack
- `bun` runtime and package manager
- `React + Vite + @react-three/fiber + three` for the client
- `Socket.IO + @socket.io/bun-engine` for realtime server communication
- `TypeScript` with `ESNext` target
- `bun:test` for unit tests

## Quick Start
```bash
bun install
bun run server
bun run dev
```

Client:
- [http://localhost:3000](http://localhost:3000)

Server health:
- [http://localhost:3001/health](http://localhost:3001/health)

## Scripts
- `bun run dev` -> start Vite dev client
- `bun run server` -> start Bun Socket.IO server
- `bun run test` -> run unit tests
- `bun run test:watch` -> run tests in watch mode
- `bun run test:e2e:install` -> install Chromium for Playwright smoke tests
- `bun run test:e2e` -> run browser smoke test (load/connect/move/no crash)
- `bun run build` -> typecheck and production build
- `bun run check` -> run tests then build

## Project Structure
```text
src/
  client/
    app/
    game/
    network/
  server/
  shared/
tests/
public/
  branding/
```

## Testing Strategy
Logic that can be deterministic is extracted into shared/server modules and covered by `bun:test`:
- car motion physics
- seeded PRNG
- player color hashing
- room state lifecycle

## Versioning
Semantic versioning is automated by GitHub Actions:
- commit using Conventional Commits (`feat:`, `fix:`, `feat!:` / `BREAKING CHANGE:`)
- `semantic-release` computes `major`/`minor`/`patch`
- `CHANGELOG.md`, `package.json`, GitHub release, and `vX.Y.Z` tags are generated automatically on `main`

## License
This project is licensed under the MIT License. See [LICENSE.md](LICENSE.md).

## Author
- Ragaeeb Haq
- [github.com/ragaeeb](https://github.com/ragaeeb)
