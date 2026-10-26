# DomainHarness SDK Documentation

Consumer/Agent entry point for the DomainHarness SDK packages.

## Current line: v0.10.2 (released)

v0.10.2 is merged to `main` (merge commit `096995f4`) and tagged `refs/tags/v0.10.2` → `cee14399d9d0af4e20e34b9111861b16a465b690`; its release qualification is **CONDITIONAL** — see `../validation/v0.10.2/RELEASE_QUALIFICATION.md`. The public surface is **four package roots only**, all `0.10.2-rc.0` with `engines.node >=24.0.0` (Node24 is the only physically qualified lane):

- `@kaicreator/domain-harness-contracts` (`packages/contracts`)
- `@kaicreator/domain-harness-build` (`tooling/build`, producer/BUILD only)
- `@kaicreator/domain-harness-microkernel` (`packages/microkernel`, runtime `load`)
- `@kaicreator/domain-harness-host-node` (`packages/host-node`, optional Rich Host)

The four old `domain-harness{,-compiler,-node,-expo}` workspaces are **private legacy test shims**, not consumable packages.

1. `../quickstart/v0102/index.md` — first-install quickstart (中文：`index.zh-CN.md`).
2. `V0102_PUBLIC_API.md` — selected public API and Package/ABI map.
3. `../guides/V0102_PACKAGE_AUTHORING.md` + `../guides/SUPPORTED_EXTENSION_POINTS.md` — authoring entry points.
4. `../guides/V0102_TINY_RICH.md` — Tiny/Rich and external producer.
5. `../migration/MIGRATING_V0101_TO_V0102.md` — v0.10.1 → v0.10.2 migration.
6. `../validation/v0.10.2/RELEASE_QUALIFICATION.md` — final release qualification record.

### Install spec (v0.10.2)

There is no npm release; consume exact-SHA git dependencies with the `&path:` subdirectory form (pnpm resolves it — npm does not support git subdirectory dependencies):

```sh
pin=cee14399d9d0af4e20e34b9111861b16a465b690   # refs/tags/v0.10.2 resolves to this commit
pnpm add "github:kaicreator-mm/domain-harness#$pin&path:packages/contracts" \
          "github:kaicreator-mm/domain-harness#$pin&path:tooling/build" \
          "github:kaicreator-mm/domain-harness#$pin&path:packages/microkernel"
# optional Rich Host (real SQLite CAS / durable ports):
pnpm add "github:kaicreator-mm/domain-harness#$pin&path:packages/host-node"
```

- Pin **every** package to the same exact SHA you validated against; do not treat a moving branch as a released dependency.
- Import only from the package roots; `@kaicreator/domain-harness-microkernel/host-seam` is the single additional public subpath, for trusted Host bootstrap only. Deep `src/` or `dist/` imports are not an SDK contract and must fail.
- `better-sqlite3` is an optional peer dependency of the Host package, required only for the real SQLite path.

## Legacy lines

### v0.3 line (legacy)

1. `DomainHarness_v0.3_SDK_USAGE.md` — v0.3 integration entry point: what v0.3 adds, runnable examples, ownership boundaries.
2. `DomainHarness_v0.3_SDK_REFERENCE.md` — complete v0.3 public API reference (assembly, governance, admission, promotion/activation, Runtime Evidence, error codes).
3. `../migration/DomainHarness_v0.2_TO_v0.3.md` — v0.2 → v0.3 migration, including the forbidden floating-authority substitutions.
4. `../integration/DomainHarness_v0.3_HOST_INTEGRATION.md` — durable Node/Expo host setup and the validation evidence behind durability claims.

Executable v0.3 examples (run in CI, import the published package by name) live in `packages/domain-harness/tests/examples/`.

### v0.1 line (legacy)

1. `DomainHarness_v0.1_SDK_USAGE.md` — short integration entry point and ownership boundaries.
2. `DomainHarness_v0.1_SDK_REFERENCE.md` — complete public API, Harness DSL, lifecycle, recovery and error reference.
3. `DomainHarness_v0.1_AGENT_MIGRATION_GUIDE.md` — step-by-step playbook and handoff prompt for coding Agents refactoring an existing project.

The v0.1 Runtime executes Loader-frozen Script source as JavaScript ESM in a Worker; it performs no TypeScript transpilation for Script assets at runtime. Its release state is tracked in `docs/validation/DomainHarness_v0.1_VALIDATION_REPORT.md` and `docs/release/DomainHarness_v0.1_CLOSEOUT.md`.

### v0.2/v0.3-era install spec (issue #299, historical)

Historical record only — the `@kaicreator/domain-harness` / `@kaicreator/domain-harness-compiler` roots it describes are now private legacy shims. It documented exact-SHA git installs of the committed `dist/` trees:

```sh
pnpm add "github:kaicreator-mm/domain-harness#<exact-sha>&path:packages/domain-harness" \
          "github:kaicreator-mm/domain-harness#<exact-sha>&path:packages/domain-harness-compiler"
```

## Ownership boundary

DomainHarness owns generic durable execution mechanics only. The consuming project remains authoritative for domain/business state and rules, application APIs and UI, databases/repositories, authentication/authorization, credentials and external clients, Tool implementations, and AI provider/model routing policy. The current authoritative statement is the root `README.md` ownership table and `../product/DomainHarness_v0.10.2_SOURCE_OWNER_CROSSWALK.md`.

## For coding Agents

Do not prompt an Agent with only "convert this project to DomainHarness". Give it:

- the exact pinned SHA/tag from the install spec above;
- `V0102_PUBLIC_API.md` (plus the relevant guides);
- `../migration/MIGRATING_V0101_TO_V0102.md` when porting an older integration;
- the downstream project's own PRD/architecture/development standard;
- one Critical Journey to migrate first.

Require a migration map before code changes and require every external side effect to have an explicit Tool effect classification.
