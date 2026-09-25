# T-023 — Expo Android/Hermes validation wave

Task issue: #241. Execution branch: `v0.3_t023`. Integration base: `v0.3`.

## 1. Exact base

- Base SHA: `efc991716e2f8428a8864f7ad9661dc0d611a9f5` (v0.3 after T-022 merge; re-read GitHub facts at every resume).
- First branch commit `69932f4`: T-022 review carryovers (P2-1/P2-2 documentation, P3-2 tombstone-byte retention).
- T-023 is the dedicated **real Expo Android/Hermes local validation task** (DAG §7.2 concentration; TASK_ISSUES.md: "#241 owns the concentrated Expo/Hermes/expo-sqlite/force-stop batch"). It is not a new feature task. Required output: exact-SHA device/emulator evidence and any reproducible blocker. Node-based mocks are insufficient for final host claims. No guessed PASS.

## 2. Survey facts (verified on the base SHA)

- `packages/domain-harness-expo` ships exactly one persistence adapter: the v0.2 `ExpoSqliteRuntimeStore` (frozen `RuntimeStore` port) over structural `ExpoSqliteDatabaseLike`/`ExpoSqliteExecutorLike` types (SDK 55 subset), serialized through `ExclusiveTransactionQueue` + `withExclusiveTransactionAsync`, schema ledger `dh_v2_store_meta` at version 1. No v0.3 authority adapters exist for Expo.
- T-014 L3 line 185 hands T-023 "Expo/Hermes/`expo-sqlite` durability implementation and proof" — the same implementation-and-proof charter T-022 executed for Node.
- T-022 (merged @ efc9917) delivered the 13 Node SQLite adapters + migration v2 (24 `dh_v3_*` tables) + the V1–V16 matrix. Expo adapters mirror those exact semantics over the async Expo executor; the DDL is host-neutral SQLite.
- Prepared harness: `tests/hosts/expo-store/` (T-004 store app) documents the proven Windows toolchain: JDK 21 (`~/.jdks/jdk-21.0.12.1+1`), Gradle wrapper pinned 8.14.3, short-path app copy (MAX_PATH), release-APK-with-embedded-Hermes-bundle build, `adb logcat` JSON evidence lines, `adb shell am force-stop` + relaunch phase protocol. `tests/hosts/expo/` holds the v0.2 runtime-conformance host.
- Build host state at task start: Hyper-V `vmcompute` RUNNING, firmware virtualization enabled, 188 GB free, Node 26.8.1, JDK 21 present, AVD definition `dh_t004_api36` (API 36 google_apis x86_64) present, but **no Android SDK installation** (`ANDROID_HOME` unset, no adb/emulator binaries). Reinstalling the SDK to `C:\Android\Sdk` (platform-tools, emulator, platforms;android-36, system-images;android-36;google_apis;x86_64, build-tools;36.0.0) is task infrastructure work, recorded as evidence, not a product change.

## 3. Design

1. **Expo v0.3 authority adapters** in `packages/domain-harness-expo/src/store/`, one file per concern mirroring the T-022 Node set: governance stores (baselines, activation authority, exact-CDI, authority audit), promoted stores (promoted artifact registry store, dynamic child pins), execution stores (exact semantic cache, harness execution journal, admission effect journal), runtime evidence store, plus the three same-durability-domain seams on `ExpoSqliteRuntimeStore` itself (T-009 `RuntimeStoreProcessCommandExtension`, T-014 `DurableExecutionStore`, T-010 `DurableControlStore`).
2. **Async transaction discipline**: every multi-write operation runs inside the store's `ExclusiveTransactionQueue` + `withExclusiveTransactionAsync` (the async equivalent of T-022's single `transaction().immediate()`); no query-then-insert windows.
3. **Migration v2**: append the same 24 `dh_v3_*` tables (host-neutral DDL shared with the Node chain); `dh_v2_store_meta` schema_version 1 → 2 with in-place upgrade from existing v1 Expo files and newer-than-adapter rejection.
4. **Factory** `openExpoSqliteAuthorityStores(module, databaseName)` mirroring the Node factory over one logical database.
5. **Device harness** `tests/hosts/expo-v3-host/`: self-contained Expo SDK 55 app (`jsEngine: hermes`, own Android package id) that compiles the expo package + required portable-core sources into `generated/` (T-004 pattern, no Metro monorepo resolution) and executes the §4 batch, printing `DOMAIN_HARNESS_T023_VALIDATION {...}` JSON lines to logcat. Force-stop/relaunch phases follow the T-004 README protocol (release APK, `adb shell am force-stop`, phase markers persisted in the app database).

## 4. Validation matrix (issue #241 bullets → evidence)

| # | Bullet | Evidence |
|---|---|---|
| E1 | portable core loads with no mandatory Node built-ins | Metro/Hermes release bundle builds and boots; runtime smoke marker; bundle import scan for `node:*`/builtins |
| E2 | logical persistence contract matches Node | the same conformance check-list pattern as the Node/T-004 suites executed against the Expo adapters on-device; identical check ids green |
| E3 | Promoted Registry, semantic cache, GovernanceExecutionPin persist/reopen | promote + cache put + pin → connection reopen + process relaunch → exact lookups |
| E4 | force-stop/relaunch preserves exact package + governance + child pins | phase-1 bind, `am force-stop`, phase-2 exact recovery incl. dynamic child pin digest |
| E5 | committed AI/query/effect work is not duplicated | journaled completed effect + harness slot replay after force-stop; device-side executor call counts stay at replay-only |
| E6 | process data, deadlines/callbacks, command outcomes survive | T-009/T-010 seam writes → force-stop → relaunch → exact replay, deadline source identities + CAS once-only |
| E7 | host/local capability binding works without app-specific leakage into core | host-local tool binding executes via the package capability contract; core imports zero app modules (bundle scan + structural test) |
| E8 | generated App contracts remain portable | compiler-workspace app-contract artifact loaded/validated on-device |
| E9 | incompatible/corrupt/missing exact authority fails closed consistently | pin conflict, corrupt baseline body, missing pin, alias/pin mismatch → same error codes as Node |
| E10 | migration open/reopen/pragmas | fresh open v1+v2, reopen idempotent, v1-file in-place upgrade with pre-upgrade rows surviving, journal mode/synchronous inspection |

## 5. Failure handling / blocker protocol

- Any bullet that cannot pass on this SHA becomes a **reproducible blocker**: failing/skip-marked check + reproduction steps + root cause, reported in the PR and issue record. No guessed PASS; environment failures are recorded as environment facts, never as product PASS or product failure.
- Adapter bugs discovered by validation are fixed in this task. Core-contract bugs become scoped commits with their own focused tests, called out separately.
- Error codes thrown by adapters are exactly those of the frozen port contracts.

## 6. Reference / ownership boundary

- Owns: `packages/domain-harness-expo/**` adapters + migrations, `tests/hosts/expo-v3-host/**` device harness, this task pack; scoped core fixes if validation uncovers real core bugs.
- Does not own: core contract semantics, Node host (T-022, merged), cross-host parity verdicts (T-024), docs (T-025), release (T-026).

## 7. Scope guard

Out of scope: changing frozen product/architecture semantics; new core contracts; engine changes; docs; versioning; edits to the T-004 `tests/hosts/expo-store/` app (left untouched as historical evidence harness). PR write set is expected to be `packages/domain-harness-expo/**` + `tests/hosts/expo-v3-host/**` + this task pack + the carryover commit already landed; any core edit is individually justified in the PR record.

## 8. Gates

Standard: `npm run build && npm run lint && npm run typecheck && npm test && npm pack -w @kaicreator/domain-harness` from repo root on the PR HEAD, plus `tsc -p packages/domain-harness-expo/tests/store/tsconfig.json` and the host-app typecheck. Device/emulator evidence (E1–E10) is bound to the exact PR HEAD SHA in the PR record; CI cannot substitute for it (Woodpecker has no Android emulator).
