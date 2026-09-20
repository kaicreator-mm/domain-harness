# Repository test matrix

Policy source: `.dev-standard/PROJECT_OVERRIDES.md` (`minimal-per-task + version-closure-full`).
This file names exactly which suite runs in which tier, so "green CI" has a defined meaning
and no deterministic suite can silently orphan (issue #162).

## Tier 1 — canonical fast regression (every PR/merge; Woodpecker `verify` → root `npm test`)

| Suite | Command | Expected files/tests (update when suites change) |
| --- | --- | --- |
| Core portable unit + nested suites | `npm test -w @kaicreator/domain-harness` (recursive `tests/**/*.test.ts` + `tsconfig.test.json` typecheck) | 44 files / 222 tests, incl. `tests/discovery/nested/sentinel.test.ts` proving recursion |
| Node RuntimeStore adapter + shared conformance + T-016 pack consumer | `npm test -w @kaicreator/domain-harness-node` | 34 tests, incl. `shared-conformance.test.ts` (the Expo-authored RuntimeStore conformance suite run against the Node adapter) and `runtime-lifecycle.test.ts` (awaitIdle/dispose semantics) |
| Compiler public consumer | `npm test -w @kaicreator/domain-harness-compiler` | 1 test |
| Expo package typecheck (store src + conformance suite + structural sentinel) | `npm test -w @kaicreator/domain-harness-expo` | `tsc -p tsconfig.json` + `tsc -p tests/store/tsconfig.json` |
| Root deterministic suites | `npm run test:root` | G30 conformance self-tests (3), compiler round-trip, T-018 Node host G30 (1), v01-expr migration equivalence, remote tool HTTP/JSON (ts: 34 total); v01-script migration equivalence + script tool (mjs: 9 total) |

Tier 1 requires built workspace `dist/` (workspace test scripts build first); `test:root` runs
after workspaces so compiled-fixture imports (`dist/compat/...`) resolve.

## Tier 2 — host-focused validation (manual / per-task acceptance)

- `tests/hosts/expo-store/` — T-004 store-only real Android/Hermes validation (two-phase
  process-restart evidence; prints `DOMAIN_HARNESS_T004_VALIDATION`). Node-based mocks are
  insufficient for PRD AC-42.
- `tests/hosts/expo/` — T-019 full runtime conformance app on Expo/Hermes.

## Tier 3 — version integration/closure gates

- `tests/critical-journeys/node/process-kill-recovery.test.ts` — process-kill/restart journeys.
- `tests/integration/package-versioning/` — package retention / versioning integration.
- Cross-host conformance evidence, migration evidence, Hidden Validation (owner-held).

Tier 3 suites are deterministic but expensive or evidence-bearing; per the CI profile they run at
version closure, not per PR. They are listed here so they cannot be forgotten at closure.
