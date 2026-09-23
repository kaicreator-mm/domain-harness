// Additive portable v0.3 public surface (T-021). Composition-only: every name
// comes from an already-merged leaf module; leaf barrels are never edited to
// fit the center. XState engine internals (the raw machine values in
// harness/harness-machine.ts and the internal adapter) are deliberately not
// reachable from this surface (ADR-01: XState is an internal dependency).
// v0.3 Domain Workflow contract seam (also shipped as the ./workflow subpath).
export * from '../workflow/index.js';
// Governance + CDI authority chain.
export * from '../governance/index.js';
export * from '../candidate/index.js';
export * from '../promoted-artifact/index.js';
export * from '../promotion-activation/index.js';
export * from '../promoted-child/index.js';
export * from '../semantic-cache/index.js';
// Decision + admission spine.
export * from '../decision-resolver/index.js';
export * from '../admission/index.js';
// Runtime Evidence (T-005 contract + T-020 integration).
export * from '../contracts/runtime-evidence.js';
export * from '../runtime-evidence/index.js';
export * from '../harness/execution-journal.js';
export * from '../harness/harness-execution.js';
// Retained Domain-App capability seams.
export * from '../contracts/process-command.js';
export * from '../runtime/process-command.js';
export * from '../runtime/durable-control-contracts.js';
export * from '../runtime/durable-control-coordinator.js';
export * from '../tool/host-local-contract/index.js';
export * from '../compiler/app-contracts.js';
// Issue #312: durable ordered public Runtime Observation Stream (optional
// capability; read-only evidence, atomic enabled-mode durability, fail-closed
// cursor/gap semantics — see src/observation/).
export * from '../observation/index.js';
// Issue #313: generic public Runtime cancel/interrupt control (optional
// fail-closed capability; durable request/outcome evidence, deterministic
// control-vs-commit winner, restart reconciliation — see src/control/).
export * from '../control/index.js';
// T-025: compiled-package identity derivation for consumers producing or
// verifying a v0.3 compiled package outside the legacy v0.1/v0.2 compiler
// toolchain (previously reachable only via internal src/ paths; additive,
// semantics unchanged).
export { computeCompiledPackageId } from '../package/validation.js';
// T-021 assembly root + T-008→T-019 effect-tool adapter.
export { createDomainRuntimeV3 } from '../runtime/create-domain-runtime-v3.js';
export { DomainRuntimeV3Error, } from '../runtime/create-domain-runtime-v3.js';
export { admissionEffectToolPort } from '../runtime/admission-effect-tool-adapter.js';
// Issue #305 / A2 I-002: DAC cross-layer reference adapter core — the
// dependency-light public boundary for DAC-owned semantic lifecycle roles
// (promotion decision / application selection / selected Domain Data /
// runtime contract / implementation / compatibility target / binding /
// activation). Nominal, version-bound to the exact DAC v0.0.2 baseline,
// fail-closed; no PROVISIONAL wire freeze; no role-conversion surface.
export * from '../dac/index.js';
// Issue #309 / A2 I-006: external authority / operation / observation /
// reconciliation refs — public evidence/correlation adapter around the
// EXISTING durable effect semantics (DAC v0.0.2 EXTERNAL_AUTHORITY). Nominal,
// fail-closed, claim-strength ceilings frozen; dispatch evidence is never
// commit evidence; local timeout/abandonment is never remote non-commit; no
// evidence object acquires Runtime transition authority.
export * from '../external-authority/index.js';
// Issue #306 / A2 I-003: DAC-aware composition intake — validates an
// already-decided exact composition/selection against the concrete compiled
// package and a declared runtime compatibility target. Validation only: never
// selects, never substitutes, never binds/activates; emits explicit
// compatibility-target evidence for downstream binding.
export * from '../composition-intake/index.js';
// Issue #308 / A2 I-005: renderer-independent DAC UX<->Runtime correlation
// bridge — adapters over the existing DomainMessage/query/workflow-snapshot/
// projection/subscription mechanisms for DomainIntent / SemanticTarget /
// Command / Outcome / View / Snapshot / Watch correlation, plus fail-safe
// observed-basis (stale-observation) classification. Correlation only: no
// transition authority moves, Domain UX semantics/rendering stay outside the
// Harness, Runtime transition authority stays inside.
export * from '../dac-bridge/index.js';
// Issue #307 / A2 I-004: Runtime binding and technical activation evidence —
// stages 4+5 of the composition-to-runtime boundary. Binding consumes ONLY a
// genuine #306 stage-3 verdict; activation consumes ONLY a genuine binding of
// this module plus an exact activation instance identity. Never manufactures
// selection from compatibility or activation; never substitutes
// default/latest/another revision; ApplicationSelectionRef !=
// RuntimeBindingRef != RuntimeActivationRef stays structural.
export * from '../runtime-binding/index.js';
//# sourceMappingURL=index.js.map