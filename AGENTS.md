# Repository Guidelines

## Project Structure & Module Organization
- `src/index.ts` wires the MCP stdio server and registers `get_transcripts`; add new tools or transport config here.
- `src/youtube.ts` owns transcript retrieval, formatting helpers, and custom errors; keep network/rate-limit logic in this module.
- `assets/` holds documentation media, while `docs/KNOWN_ISSUES.md` captures platform caveats referenced in support threads.
- Build artifacts live in `dist/`; regenerate with `npm run build` instead of editing compiled files.
- Deployment helpers (`Dockerfile`, `smithery.yaml`, `README.md`) document client configuration for Claude, Cursor, and hosted inspectors.

## Build, Test, and Development Commands
- `npm install` installs TypeScript + MCP SDK dependencies; rerun after touching `package.json`.
- `npm run build` runs `tsc` under `strict` mode and marks `dist/*.js` executable; treat a clean build as the pre-review gate.
- `npm run clean` clears `dist/`, useful before diagnosing stale output or release packaging.
- `npx @modelcontextprotocol/inspector node dist/index.js` spins up the Inspector against the compiled server for interactive tool checks.
- `npm run release:patch|minor|major` bumps the version and pushes a matching git tag; these scripts call `npm version` internally.

## Coding Style & Naming Conventions
- TypeScript is the source of truth; keep `strict` happy, prefer explicit return types for exports, and use ES module syntax.
- Follow two-space indentation, `camelCase` identifiers, and `PascalCase` classes such as `YouTubeTranscriptFetcher`.
- Imports stay double-quoted while runtime strings use single quotes; continue logging via `console.error`/`console.warn` for diagnostics.
- Document nuanced logic with short JSDoc blocks as seen in `src/youtube.ts`.

## Testing Guidelines
- Automated tests are not yet wired; run `npm run build` and exercise `get_transcripts` via MCP Inspector or the README's Claude prompt before submitting.
- If you add tests, colocate them under `tests/` or `src/__tests__/`, mock remote calls, and note manual verification steps in your PR.

## Commit & Pull Request Guidelines
- Follow the existing subject style (`feat:`, `fix:`, `docs:`) and explain the behaviour change in one concise clause.
- Link GitHub issues, describe manual validation (URLs, languages tried), and attach transcript samples or screenshots for formatting tweaks.
- Guarantee `dist/` matches the TypeScript sources by running `npm run build` prior to pushing.

## Release & Publishing Notes
- `npm publish` depends on `npm run prepublishOnly`; verify credentials and YouTube access before tagging.
- Update `docs/KNOWN_ISSUES.md` when new platform constraints or rate-limit behaviours surface during release checks.
