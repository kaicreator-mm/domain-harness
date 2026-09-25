# T-021 — v0.3 Runtime assembly + retained Domain-App capabilities

**Version:** v0.3
**Execution Issue:** #239
**Branch:** `v0.3_t021`
**PR Base:** `v0.3`
**Exact Base:** `328c47b40dd8d1ef76a34add0ccda7a3662a2d13`
**Depends On:** T-008, T-009, T-010, T-011, T-019, T-020
**Parallel:** NO
**Risk:** H
**L3:** REQUIRED
**Status:** IMPLEMENTATION READY

## 1. Frozen authority consumed

- Issue #239 scope/acceptance verbatim: final portable v0.3 Runtime/public API assembly and central exports; startup consumes target compiled package + Runtime Resources only; one Domain Workflow/XState runtime; public API does not expose XState internals; retained Domain-App capabilities integrate without bypassing durability/governance/effect boundaries; no provider routing/second runtime.
- `docs/implementation/DomainHarness_v0.3_TASK_DAG.md` — T-021 owns central exports/wiring and absorbs barrel conflicts (§3/§4 C4); T-022/T-023 host waves validate the exact T-021 integration SHA (§7.1/§7.2), so the assembled surface must stay portable (no mandatory Node built-ins; Expo/Hermes loadable).
- Merged task authority: T-019 (`admitCentralDecision` — admitted plan deliberately carries no engine state; control publication stays with the existing v0.2 engine + T-014 snapshot gate), T-020 (`RuntimeEvidenceCapture` / shadow / fallback / use gates), T-014 (`GovernanceExecutionCoordinator`, `DomainActivationBindingCoordinator`), T-008 (`createHostLocalDomainToolExecutor` → `ToolExecutorPort`), T-009 (`runtime/process-command`), T-010 (`runtime/durable-control-*`), T-011 (`compiler/app-contracts`).

No product/architecture authority is reopened. This task changes no frozen semantics; it composes already-merged contracts.

## 2. Survey facts (verified on Exact Base)

- Export-name audit across `public-v2` + the ten v0.3 module barrels + `contracts/runtime-evidence` + `contracts/process-command` + `tool/host-local-contract` + `runtime/process-command` + `runtime/durable-control-*` + `compiler/app-contracts`: **133 names, zero collisions** → clean `export *` composition is possible.
- `grep -rl "from 'node:'"` over every module listed above: **zero hits** → all portable.
- XState exposure points: `harness/index.ts` re-exports the raw machine values `HarnessMachine`/`BusinessHarnessMachine` (xstate-typed) — these are engine internals and are **excluded** from the public v3 surface. `decision-resolver` exports `createXStateHarnessMachineRunner(): HarnessMachineRunnerPort` whose signature carries no xstate type — safe to export. The `xstate` package remains an internal implementation dependency only (ADR-01).
- `createDomainRuntime` (v0.2 composition root) already consumes target-compiled packages (`PackageRegistry`) + `RuntimeStore` + `RuntimeHostBindings` + `RuntimeResources`; T-009/T-010 capabilities already live inside it. Core has no in-memory `RuntimeStore` smoke double in the published graph; tests reuse `tests/instance/fake-runtime-store.ts` + `tests/helpers/runtime-host-fake.ts`.

## 3. Contract / Interface

### 3.1 New public module `src/public-v3/`

`src/public-v3/index.ts` — additive v0.3 surface (mirrors the `public-v2` pattern):

```text
export * from '../governance/index.js';
export * from '../candidate/index.js';
export * from '../promoted-artifact/index.js';
export * from '../promotion-activation/index.js';
export * from '../promoted-child/index.js';
export * from '../semantic-cache/index.js';
export * from '../decision-resolver/index.js';
export * from '../admission/index.js';
export * from '../runtime-evidence/index.js';
export * from '../contracts/runtime-evidence.js';
export * from '../contracts/process-command.js';
export * from '../tool/host-local-contract/index.js';
export * from '../compiler/app-contracts.js';
// T-016 harness authority without the raw engine machine values:
export * from '../harness/contract.js';
export * from '../harness/execution-journal.js';
export * from '../harness/harness-execution.js';
// T-009/T-010 retained-capability runtime seams:
export * from '../runtime/process-command.js';
export { DurableControlCoordinator, DurableControlError } from '../runtime/durable-control-coordinator.js';
export type { ...durable-control request/result/code types } from '../runtime/durable-control-coordinator.js';
export { createDomainRuntimeV3 } from '../runtime/create-domain-runtime-v3.js';
export type { CreateDomainRuntimeV3Options, DomainRuntimeV3 } from '../runtime/create-domain-runtime-v3.js';
```

If any collision surfaces during implementation (the §2 audit says none), the v3 barrel keeps leaf-module names verbatim and resolves by explicit selective export — leaf barrels are never edited to fit the center.

### 3.2 Root + subpath wiring

- `src/index.ts` gains `export * from './public-v3/index.js';` after the existing public-v2 line (root becomes the v0.2∪v0.3 union; `DOMAIN_HARNESS_VERSION` unchanged — release versioning is T-026 scope).
- `package.json` exports gains `"./v3"` → `dist/public-v3/index.{d.ts,js}`.
- `tsconfig.build.json` `include` gains `src/public-v3/index.ts`; the published artifact then carries the transitive v0.3 closure. The internal `workflow/internal/xstate-adapter` stays internal (shipped per issue #166 but not re-exported by any public barrel).

### 3.3 Assembly root `createDomainRuntimeV3` (`src/runtime/create-domain-runtime-v3.ts`)

```ts
interface CreateDomainRuntimeV3Options extends CreateDomainRuntimeOptions {
  readonly v3: {
    readonly baselines: GovernanceBaselineStore;
    readonly activationAuthority: DomainActivationAuthority;
    readonly exactPackageCdi: ExactPackageCdiAuthority;
    readonly durableExecution: DurableExecutionStore;       // T-014 pin/snapshot store
    readonly effectJournal: AdmissionDurableEffectJournal;  // host-durable adapter (T-022/T-023) or volatile reference
    readonly effectTools: AdmissionEffectToolPort;          // see §3.4
    readonly evidence: RuntimeEvidencePort;
    readonly tenantScope?: string;
  };
}

interface DomainRuntimeV3 {
  /** The ONE existing v0.2 runtime — retained capabilities unchanged. */
  readonly runtime: DomainRuntime;
  /** T-014 activation binding + execution pin authorities. */
  readonly activation: DomainActivationBindingCoordinator;
  readonly governance: GovernanceExecutionCoordinator;
  /**
   * The single authoritative admission path (T-019) with the assembled ports.
   * Evidence is captured automatically: decision evidence on every outcome,
   * failure evidence on thrown admission errors. Control publication of an
   * admitted plan stays with `runtime` (ADR-02) — the plan carries no engine
   * state by T-019 contract.
   */
  admitTurn(request: CentralAdmissionRequest): Promise<CentralAdmissionOutcome>;
  /** T-020 capture bound to a domain context (shadow/rollback/metric points). */
  evidenceCapture(context: RuntimeEvidenceCaptureContext): RuntimeEvidenceCapture;
}
```

Behavior:
1. `createDomainRuntime(options)` boots first, unchanged — startup consumes target compiled package + Runtime Resources only; no second runtime, no provider routing (`ai` option stays the single provider-neutral AI port).
2. Authority stack is constructed from portable ports only: `DomainActivationBindingCoordinator(activationAuthority, exactPackageCdi, baselines, sha256)`, `GovernanceExecutionCoordinator(durableExecution, sha256)` — `sha256` comes from `options.bindings` (Runtime Resources), never from a Node built-in.
3. `admitTurn` runs `admitCentralDecision(request, { governance, baselines, sha256, effectJournal, effectTools })`, then appends decision/failure evidence through a capture bound to `{ domainId: request definition domain…, packageId/baseline from the execution pin, tenantScope }`. Evidence append failure never rewrites the admission outcome (evidence is audit material, V8); a thrown admission error is captured as failure evidence, then rethrown unchanged.
4. No mutation path is added: admitted plans are published exclusively through the existing runtime/engine, exactly as T-019 froze.

### 3.4 T-008 → T-019 effect-tool adapter

`admissionEffectToolPort(options: { executor: ToolExecutorPort; descriptors: Readonly<Record<string, CompiledToolDescriptor | undefined>>; toolArtifacts?: Readonly<Record<string, CompiledArtifactIdentity | undefined>> }): AdmissionEffectToolPort`

- `resolve(effectType)` → binding when a target-compiled descriptor exists; **effect semantics come from the compiled Tool descriptor, never from a side-channel map**; optional exact `CompiledArtifactIdentity` is carried as `toolArtifact`. Unbound → `undefined` (admission fails closed, unchanged).
- `execute(request)` → maps the admission request into a truthful `ToolExecutionRequest`: descriptor from the effect type; `sourceMessageId = durableControlTurnId`; `idempotencyKey = request.idempotencyKey ?? effectId`; per-effect attempt ordinals tracked by the adapter (the admission journal owns durable begin/commit/retry truth). Missing descriptor at execute → `HOST_LOCAL_BINDING_MISSING` fail-closed.

### 3.5 What this task deliberately does NOT do

- No engine/XState rewiring: microstep settling, snapshot publication and message disposition stay in the existing engine.
- No timer/callback/recovery execution loops (T-019 scope boundary, unchanged).
- No host durability claims: real SQLite/kill/reopen evidence is T-022/T-023 against this task's exact merge SHA.
- No docs/migration examples (T-025), no version bump (T-026).

## 4. Tests

New focused tests under `packages/domain-harness/tests/v3-assembly/`:

1. **surface.test.ts** — root surface: v0.3 authority names present (`createDomainRuntimeV3`, `GovernanceExecutionCoordinator`, `DomainActivationBindingCoordinator`, `admitCentralDecision`, `RuntimeEvidenceCapture`, `runShadowEvaluation`, `requestExperimentalRollback`, `createHostLocalDomainToolExecutor`, `DurableControlCoordinator`, app-contract symbols); negative guards: `createDomainHarness` absent, `HarnessMachine`/`BusinessHarnessMachine`/`createActor` absent (no XState internals), `SqliteStore` absent; `./v3` subpath module resolves with the same names.
2. **assembly.test.ts** — boot the assembled runtime over `fake-runtime-store` + host fake + in-memory authority ports; `activation` publishes/reads a binding; `governance.pinExecution` persists the exact pin; `admitTurn` happy path → admitted plan + effect executed once + **decision evidence appended automatically**; denied path (Hard Invariant) → denial evidence; thrown path (unbound tool) → failure evidence appended + original error code propagates; evidence-append-failure probe → admission outcome unchanged; v0.2 retained path still works through `runtime` (message lifecycle on the fake store).
3. **effect-tool-adapter.test.ts** — T-008 executor → admission port: bound effectType resolves + executes through the host/local executor; unbound → `undefined` (admission `ADMISSION_EFFECT_TOOL_UNBOUND` unchanged); exact tool artifact identity carried when provided.
4. **root-portability.test.ts extension** — the packed-consumer script gains: v0.3 names present on the package root, `createDomainHarness`/`HarnessMachine`/`createActor` absent, and `require/import` of the `./v3` subpath works in the clean consumer (portability proof over the real tarball, including the extended build graph).

Full repository gates before PR: `npm run build && npm run lint && npm run typecheck && npm test && npm pack -w @kaicreator/domain-harness` (tarball now expected to contain `dist/public-v3`, `dist/admission`, `dist/runtime-evidence`, etc.).

## 5. Failure handling

- Misconfigured assembly options (missing v0.3 authority port) → constructor-time fail-closed error; no partial authority stack.
- Admission errors propagate with their original codes; evidence capture never masks them.
- Evidence port failure → logged/secondary; never changes admission/runtime truth (V8).
- No required gate is reported PASS when not executed; CI infrastructure failure is reported as infrastructure failure.

## 6. Reference / Ownership boundary

- Owns: central exports, package subpath wiring, build-graph inclusion, the composition root, the T-008→T-019 adapter, and barrel-conflict absorption (DAG §3).
- Does not own: leaf module contracts (unchanged), engine internals, host durability adapters (T-022/T-023 consume this surface), docs (T-025), release versioning (T-026).

## 7. Scope guard

Out of scope: any change to frozen product/architecture semantics; XState version/engine changes; provider routing; new persistence adapters; changes to `legacy-v1` or the v0.1 regression surface; `DOMAIN_HARNESS_VERSION` bump.

## 8. Implementation addendum (recorded at PR time)

- **Type-level collision found and resolved per §3.1 rule:** `ObservedDependencySet` exists as two distinct types (`harness/contract.ts` T-016 and `semantic-cache` T-013). The runtime-value audit (§2) could not see type-only names. Resolution: the v3 barrel re-exports the harness contract's names selectively and aliases the harness type as `HarnessObservedDependencySet`; neither leaf module was edited.
- **`xstate` moved from `devDependencies` to `dependencies`:** the v0.3 dist closure imports the selected engine at module load (`decision-resolver/harness-runner` → `harness/harness-machine`; ADR-01 names XState the v0.3 engine). The packed-consumer portability test proved a clean install cannot resolve it otherwise. This is dependency metadata, not a public-API change; engine internals remain unreachable from the public surface (guarded by tests).
- **Test stores:** the assembly smoke uses a new fully-implemented in-memory `RuntimeStore` (`tests/v3-assembly/helpers.ts`) because the T-010 instance-only fake deliberately throws on mailbox/effect methods the boot path touches.
- **Adapter delivered** in the descriptor-based shape (§3.4); the L3 fallback (drop the adapter) was not needed — the frozen T-008/T-019 shapes align without widening either contract.
- **§4 test-plan narrowing (recorded at T-022 carryover time):** the planned “v0.2 retained path message lifecycle on the fake store” assembly test was not delivered — `MemoryRuntimeStore.acceptMessage` throws by design because that lifecycle is outside the v3 assembly smoke surface. Retained-path coverage remains in the v0.2 suite; `assembly.test.ts` asserts only method presence on `runtime`.
