# T-025 — SDK docs + v0.2→v0.3 migration/integration examples

Task: T-025 (DAG row: "SDK docs + v0.2→v0.3 migration/integration examples", depends on T-021; GitHub Execution Issue #243).
Branch: `v0.3_t025`. Base: `8c530b83fcfb435bd5ebd6a72282a0fe239b15aa` (v0.3 after T-024 merge, PR #292).

## 1. Upstream evidence bound by this task

- **T-021 runtime assembly** (v3-assembly): merged ancestor of base.
- **T-022 Node Build Host**: PR #289 @ efc9917 (validation evidence bound there).
- **T-023 Expo Android/Hermes device**: PR #290 merged @ 2d3ba3b; validation HEAD 2cfb65b (issue #241 comment-5771692057).
- **T-024 cross-host parity + migration/retention**: PR #292 merged @ 8c530b8 (validation HEAD a642d6b; issue #242 close record).

Docs must cite host-durability claims ONLY as pointers to that evidence; docs themselves make no durability claim.

## 2. Gap statement (why this task exists)

- `docs/sdk/` holds v0.1-era docs only; `docs/integration/` holds v0.2 only; `docs/migration/` holds v0.1→v0.2 only. Nothing consumer-facing describes the v0.3 public surface (assembly, governance pin/binding, candidate→promotion→activation, runtime evidence, semantic cache, journals).
- The acceptance rules require executable guarantees: examples must consume a compiled package at startup and compile/typecheck; migration docs must explicitly forbid silent `current`/`latest`/`active` authority substitution; docs must state durability claims come only from dedicated validation evidence.
- One public-surface gap blocks honest examples: `computeCompiledPackageId` (the only way to derive a valid v0.3 `manifest.packageId` outside the legacy compiler) is not exported from the public barrel — every v0.3 host fixture so far imported it from internal `src/` paths.

## 3. Design

### 3.1 Scoped public-surface fix (separately justified, single commit)

Add one additive export to `packages/domain-harness/src/public-v3/index.ts`:

```ts
export { computeCompiledPackageId } from '../package/validation.js';
```

Justification: additive re-export of existing, tested code; no semantic change; required for any consumer producing/verifying a v0.3 compiled package id without the legacy v0.1/v0.2 compiler toolchain. No other product change. If review rejects this, examples fall back to presenting the compiled package as a pre-built artifact fixture (documented as compiler output), and the gap is recorded as a finding instead.

### 3.2 Runnable examples (`packages/domain-harness/tests/examples/`)

Examples are real tests: typechecked by `tsconfig.test.json` (the core package's `npm test` runs `tsc -p tsconfig.test.json --noEmit`) and executed by `node --test` in CI. They import the SDK by package name (`@kaicreator/domain-harness`), exactly as a consumer does (precedent: `tests/root-portability.test.ts:62`). All stores are volatile in-memory; the files say so loudly and point at the host-integration guide for durable wiring.

- `support.ts` — minimal volatile port implementations (RuntimeStore surface needed for boot, DurableExecutionStore, DomainActivationAuthority, ExactPackageCdiAuthority), a `buildCompiledPackage()` build-step helper (the part the offline compiler/toolchain normally does), and a deterministic sha256 via `node:crypto`. Labeled test-only, non-durable.
- `domain-workflow-boot.example.test.ts` — compiled package at startup → `createDomainRuntimeV3` with volatile ports → governance pin → one admitted domain-workflow turn → bound snapshot persisted. (Domain Workflow-facing example.)
- `governance-baseline-binding-pin.example.test.ts` — baseline publish + retention reference, activation binding, `pinExecution`, exact recovery, and the fail-closed path when the pinned baseline body is missing.
- `candidate-promotion-activation.example.test.ts` — candidate validation identity → promote → alias bind/select → revocation survives; promotion/activation audit record append-once.
- `runtime-evidence.example.test.ts` — evidence append with scope discriminators, append-once identity conflict, and the write-only/no-replay rule shown behaviorally (journal `begin` on an evidence-referenced slot returns `created`).
- `docs-guard.test.ts` — executable acceptance guard over the four new docs: no `xstate` mention (case-insensitive) in public docs; migration doc contains the explicit forbidden-substitution section; host-integration doc contains the durability-evidence-only statement citing the T-022/T-023 evidence anchors.

### 3.3 Docs

- `docs/sdk/DomainHarness_v0.3_SDK_USAGE.md` — consumer entry point: install/exact-SHA rule, ownership boundary, quickstart mapped to the runnable example files, error-handling posture.
- `docs/sdk/DomainHarness_v0.3_SDK_REFERENCE.md` — v0.3 public API map: assembly (`createDomainRuntimeV3` options), governance (baseline registry/store, activation coordinator, execution pin coordinator, recovery), candidate/promotion/activation, promoted artifact registry, semantic cache, evidence port, journals, admission; error-code tables; versioning/format constants.
- `docs/sdk/README.md` — add the v0.3 pair to the read order (v0.1 docs retained for the legacy surface).
- `docs/migration/DomainHarness_v0.2_TO_v0.3.md` — migration guide: v0.2 persisted rows are historical (no semantic import); migration to v0.3 authority schema is explicit and exact-authority-only; **explicitly forbids** silent `current`/`latest`/`active` substitution in any migration or recovery path; pre-A1 fail-closed behavior (pin missing → no recovery, no snapshot) with the T-024 M1/M2 evidence pointers.
- `docs/integration/DomainHarness_v0.3_HOST_INTEGRATION.md` — Node and Expo host wiring (adapter factories, injected expo-sqlite module, exclusive write queue), and the honesty section: durability claims are established only by dedicated validation evidence (T-022 Node, T-023 device, T-024 logical parity) at the named SHAs; the T-024 parity driver is labeled logical-parity infrastructure.

## 4. Acceptance mapping (issue #243 → evidence)

| Acceptance | Evidence |
|---|---|
| examples consume compiled package at startup | every example test boots from `buildCompiledPackage()` output (packageId computed via the public export) |
| public docs avoid XState internal identity | docs-guard test (no `xstate` string in the four docs) + review |
| migration docs forbid silent `current`/`latest`/`active` substitution | migration doc §"Forbidden substitution patterns" + docs-guard test |
| docs explain durability claims come only from dedicated validation evidence | host-integration doc §"Durability claims and evidence" + docs-guard test |
| examples compile/typecheck where applicable | `tsc -p tsconfig.test.json --noEmit` in core `npm test` + CI |

## 5. Failure handling / blocker protocol

- A doc claim that cannot be backed by executable evidence or a frozen doc becomes a P1 finding in the PR record, not a guessed sentence.
- The scoped export (3.1) is the only product-surface touch; anything beyond it is out of scope and escalated instead of implemented.

## 6. Reference / ownership boundary

- Owns: this pack; `docs/sdk/DomainHarness_v0.3_*`, `docs/sdk/README.md` (additive), `docs/migration/DomainHarness_v0.2_TO_v0.3.md`, `docs/integration/DomainHarness_v0.3_HOST_INTEGRATION.md`, `packages/domain-harness/tests/examples/**`, and the one-line barrel export (3.1).
- Does not own: architecture/PRD semantics, host adapters, validation evidence re-runs, release qualification (T-026).

## 7. Scope guard

No architecture reopening; no implementation scope; no gate weakening. Frozen product/architecture semantics are quoted, not reinterpreted.

## 8. Gates

Standard: `npm run build && npm run lint && npm run typecheck && npm test && npm pack -w @kaicreator/domain-harness` from repo root on the PR HEAD; the example tests run inside the core package test target. CI (Woodpecker verify) on the exact PR HEAD. No host/device re-run (docs task; host evidence inherited at the SHAs in §1).
