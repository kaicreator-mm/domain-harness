# DomainHarness v0.3 PRD Amendment A2 — DAC v0.0.2 Cross-Layer Reference Adoption

**Status:** REVIEW CANDIDATE — FRESH INDEPENDENT ARCHITECTURE REVIEW REQUIRED  
**Issue:** [#296](https://github.com/kaicreator-mm/domain-harness/issues/296)  
**Parent inventory:** [#291](https://github.com/kaicreator-mm/domain-harness/issues/291)  
**Prepared:** 2026-09-22  
**DomainHarness exact base:** `main@7fdcde2e853382b0ba0fd2baeb6f91af2fdbace6`  
**DomainHarness base tree:** `457e405659fdf71b02fe8eb5b3103bf59a3d69ec`  
**DAC exact baseline:** `kaicreator-mm/domain-application-contract@9c3ef91b8b40d893e4fe2b0370200e765816ec2b`  
**DAC tree:** `44086afe53166c9f290d7d06dd757ebfc8c24eb8`  
**Pinned development standard:** `kaicreator-mm/ai-development-standard@0446f04583f6cf464c835f26e2f657c8b703cb4e` (`2.0.0`)

> Candidate identity is intentionally not embedded in this file because doing so would make the commit self-referential. The exact candidate HEAD is pinned in the #296 review-handoff comment and PR after all candidate files are committed.

---

## 1. Amendment role

This document is a narrow Product amendment to the frozen DomainHarness v0.3 PRD and frozen v0.3 Product Amendment A1. It resolves only the DAC adoption pressure confirmed by #291 / #296.

It does **not** redesign DomainHarness, does **not** reopen the v0.3 product architecture, and does **not** authorize implementation before Fresh Independent Architecture Review PASS.

The product intent is:

> DomainHarness consumes and preserves DAC v0.0.2 cross-layer reference semantics at its public boundary while remaining the authoritative production Domain Runtime/state-machine/execution authority. It must not become Domain Data promotion authority, application-selection authority, Domain UX authority, or external Business System-of-Record authority.

Where this amendment uses a DAC role name such as `SelectedDomainDataRef`, `RuntimeBindingRef`, or `DomainIntentRef`, the **DAC remains the semantic owner**. DomainHarness may alias, adapt, consume, preserve, correlate, or emit the role as required by Runtime execution. DomainHarness must not define an incompatible parallel identity model.

This amendment freezes **consumption semantics and authority boundaries**, not a new wire encoding. DAC v0.0.2 remains authoritative for its reference roles; any DAC fields/schema details that remain provisional/open are not independently frozen here.

---

## 2. Authority invariants preserved without modification

All frozen v0.3 authority rules remain in force. In particular:

1. DomainHarness owns authoritative production command/event processing, Domain Workflow/Domain Machine state transitions, Runtime-owned Guard/Hard-Invariant enforcement where defined, durable execution, recovery, and technical activation of compatible exact inputs.
2. Domain Data authoring/evolution/promotion remains outside DomainHarness Runtime authority.
3. Application composition/selection remains outside DomainHarness Runtime authority. Receiving a selected reference is not the act of selecting it.
4. Domain UX owns UX semantics and interaction intent. DomainHarness may accept a typed intent/command bridge but does not acquire affordance, renderer, presentation, or UI-host authority.
5. External Business SoR remains authoritative for the external business facts it owns. Runtime request dispatch, local journal state, provider queue acceptance, or timeout does not fabricate an external commit fact.
6. Runtime Host Binding remains a technical resource/capability boundary and must not be conflated with UX/UI host adapters.
7. Exact retained/running package pins remain exact. Compatibility failure must not silently rebase, auto-upgrade, downgrade, select `latest`, or substitute a different revision.

The following inequalities are normative Product invariants:

```text
PromotedDomainData != ProductionSelectedDomainData
PromotionDecisionRef != ApplicationSelectionRef
ApplicationSelectionRef != RuntimeBindingRef
ApplicationSelectionRef != RuntimeActivationRef
RuntimeContractRef != RuntimeImplementationRef
RuntimeImplementationRef != RuntimeBindingRef
RuntimeBindingRef != RuntimeActivationRef
Simulator PASS != promotion/selection
executable/compatible package != selected package
UX Intent != Runtime transition authority
request dispatched != external authoritative commit
ambiguous external effect != proven failure
RuntimeImplementationIdentity != ExternalBusinessSoRIdentity
```

`AUTHORITY_CONFLICT` must remain `0` for this amendment.

---

## 3. G1 — consume selected Domain Data identity and provenance without selecting it

### 3.1 Product requirement

A Runtime entry path that executes an already-selected Domain Data artifact must be able to preserve enough DAC-owned identity/provenance to prove what exact authoritative input was selected and why it is eligible for use.

The consumed cross-layer chain is conceptually:

```text
PromotionDecisionRef
        ↓ provenance only
ApplicationSelectionRef
        ↓ identifies exact application choice
SelectedDomainDataRef
        ↓ exact selected authoritative input
compatibility validation
        ↓
RuntimeBindingRef
        ↓
RuntimeActivationRef
```

DomainHarness MUST NOT synthesize `PromotionDecisionRef` or `ApplicationSelectionRef` merely because a package exists, validates, is executable, appears in a registry, or is configured as a default.

### 3.2 Exactness requirement

Before authoritative Runtime use, the selected Domain Data identity must resolve to exact immutable identity material sufficient to detect identity/integrity drift, including the DAC-defined authority/semantic/revision/digest roles as applicable. Existing `domainId`, `domainVersion`, content-derived `packageId`, target and capability metadata may participate in the Runtime mapping, but do not by themselves grant promotion or application-selection authority.

A mutable selector such as `latest`, `current`, or `head` is not an authoritative Runtime pin. It must first be resolved by the upstream selection authority to an exact selection and then consumed as such.

If an asserted immutable identity resolves to a different digest or the selected ref cannot be proven to match the concrete compiled package, Runtime must fail closed.

### 3.3 Existing defaults are not selection authority

The current `PackageRegistry.defaultPackageId` remains a local Runtime/package-registry mechanism. It must not be reinterpreted as `ApplicationSelectionRef`. A future implementation may retain it for backward compatibility, but DAC-aware composition must preserve an explicit distinction between:

- a package that happens to be the local registry default;
- a package proven compatible;
- an application-selected exact Domain Data identity;
- the package technically bound/activated for a Runtime execution.

---

## 4. G2 — make Runtime contract, implementation, binding and activation separately referrable

### 4.1 Five stages remain distinct

For DAC-aware composition, the following stages must remain separately observable/referrable:

1. **Promotion decision** — upstream governance says an exact Domain Data candidate/revision is promoted/eligible.
2. **Application selection** — application/composition authority selects an exact promoted Domain Data identity.
3. **Compatibility validation** — DomainHarness determines whether the already-selected composition is executable against a declared compatibility target and required capabilities.
4. **Runtime binding** — DomainHarness binds the already-selected, compatible inputs to a concrete Runtime implementation/technical environment.
5. **Runtime activation** — DomainHarness records/establishes the concrete technical activation used for authoritative execution.

Passing stage 3 does not perform stage 2. Passing stage 3 also does not by itself create stage 5.

### 4.2 Runtime references

DomainHarness public architecture must be able to consume/preserve the DAC roles:

- `RuntimeContractRef` — identity of the Runtime interaction/contract compatibility surface;
- `RuntimeImplementationRef` — concrete Runtime implementation identity/version/build where required;
- `CompatibilityTargetRef` — explicit target against which compatibility is evaluated;
- `RuntimeBindingRef` — binding evidence/identity for already-selected compatible inputs plus concrete Runtime environment;
- `RuntimeActivationRef` — technical activation evidence/identity, separate from both selection and binding.

Existing `runtimeContractMajor`, `executionEngineMajor`, `targetProfileId`, required capabilities and validation policy are implementation inputs to this mapping; they do not collapse the DAC roles into one field.

### 4.3 Clarification of frozen A1 terminology

Frozen A1 uses local DomainHarness activation/binding language for operator-governed technical Runtime activation. This Product amendment clarifies that such local terminology does **not** grant DomainHarness DAC application-selection authority.

For cross-layer composition:

```text
ApplicationSelectionRef != DomainHarness technical binding/activation metadata
```

An implementation may adapt existing internal activation metadata, but externally observable DAC-aware contracts must preserve the separate authorities and evidence stages.

---

## 5. G3 — UX ↔ Runtime bridge is correlation, not UX ownership

DomainHarness must provide only the minimum renderer-independent bridge necessary to consume/correlate DAC roles such as:

- `DomainIntentRef`;
- `CommandRef`;
- `OutcomeRef`;
- `ViewRef`;
- `SnapshotRef`;
- `WatchRef`;
- semantic-target and observed-revision/snapshot basis where relevant.

The existing `DomainMessage.messageId`, `correlationId`, `causationId`, workflow/query/projection/snapshot/subscription primitives remain valid Runtime concepts and should be adapted rather than duplicated where semantics align.

Product rules:

1. A Domain UX intent is an input/correlation reference, not authoritative transition permission.
2. DomainHarness decides only the Runtime transition/effect consequences that fall within its frozen authority and the selected Domain Data/Runtime contract.
3. A command derived from a stale snapshot/semantic target must not be silently applied as though it were based on the current authoritative observation. Where stale basis matters, the public boundary must preserve enough basis identity/revision for the authoritative layer to reject, classify stale, or require explicit rebase/review.
4. Runtime views/snapshots/watches remain renderer-independent. No UI component model, presentation renderer, interaction layout, or UX host adapter is added to DomainHarness.
5. `RuntimeHostBindings` remain runtime resources/capabilities and must not become presentation-host semantics.

---

## 6. G4 — external authority references preserve uncertainty

The existing durable effect model is retained. This amendment adds only cross-layer reference/observation requirements necessary to identify and reconcile external-authority operations.

For an external-authority effect, the public model must be able to correlate, as applicable:

- the external authority identity/scope;
- the stable Runtime logical/effect operation identity;
- the provider/request operation identity where one exists;
- observations of external state/outcome;
- reconciliation attempts/outcomes;
- the originating `CommandRef`/`OutcomeRef` correlation.

Normative rules:

```text
request dispatched != provider accepted != external authoritative commit
local timeout/error != proven remote non-commit
journal started != external authoritative commit
ambiguous non-idempotent effect != automatically retryable effect
```

A non-idempotent operation whose remote commit state is uncertain remains `unknown/ambiguous` or recovery/reconciliation-required until authoritative evidence resolves it. DomainHarness must not strengthen uncertainty into definite remote failure merely to simplify local control flow.

When an external SoR is authoritative, its observation is evidence about its own business state; the Runtime records/correlates that evidence and applies the Domain transition rules it owns. The external authority identity must never be replaced by `RuntimeImplementationRef`, Runtime Host Binding, or provider adapter identity.

---

## 7. G5 — Application Manifest is a composition input, not a new semantic pillar

DomainHarness may consume a DAC Application Manifest/composition **only as narrow composition metadata for already-selected refs**.

The Manifest boundary must obey all of the following:

1. It does not become a fourth Domain Application semantic pillar.
2. It does not contain authoritative live Business/Process/Execution/UX instance state.
3. It does not create, imply, or perform Domain Data promotion or application selection.
4. It reuses DAC-owned cross-layer reference roles rather than defining a DomainHarness-private identity hierarchy.
5. DomainHarness validates the supplied exact identities, compatibility target, concrete Runtime implementation compatibility, required capabilities, and binding preconditions; it fails closed on mismatch.
6. Compatibility failure never authorizes Runtime to choose another revision. The caller/upstream selection authority must explicitly reselect or reconcile.
7. Runtime binding/activation/execution evidence remains separate from the Manifest definition and references the exact composition identity/digest as applicable.
8. No product-code dependency on Forge, Simulator, or Domain UX implementation packages is introduced. Shared contract types or dependency-light adapters only.

---

## 8. Public-product contract delta proposal

The architecture amendment defines implementation-level placement, but Product freezes the following minimal public behavior delta:

### 8.1 Additive consumption/correlation only

A future implementation may add a dependency-light DAC reference module or adapter surface that exposes DAC-owned roles to DomainHarness public contracts. The implementation should use type aliasing/adaptation where current DomainHarness identity already satisfies the role and add narrow fields/wrappers only for confirmed API gaps.

It must **not**:

- fork DAC type semantics;
- invent a second promotion/selection authority model;
- replace current stable Runtime identifiers wholesale;
- require consumers to adopt presentation/UX implementation dependencies;
- make a provisional DAC wire shape a DomainHarness-frozen encoding by accident.

### 8.2 Compatibility strategy

Current v0.3 public contracts remain supported unless a later implementation task proves a breaking change unavoidable. The preferred migration order is:

1. preserve current identifiers and methods;
2. introduce DAC refs as additive aliases/adapters/correlation metadata;
3. make DAC-aware composition explicit on new/extended entry points rather than silently changing the meaning of `defaultPackageId`;
4. preserve exact retained package pins and old execution journal identities;
5. reject incomplete or contradictory DAC-aware input fail-closed rather than infer missing authority decisions;
6. deprecate any legacy ambiguity only after a separately reviewed compatibility plan.

No running instance or retained package may be silently rebound to a different selected revision during migration.

---

## 9. Authority / ownership matrix

| Concern | Authoritative owner | DomainHarness Product role after A2 | Forbidden interpretation |
|---|---|---|---|
| Domain Data authoring | Forge/human/other authoring authority | consume compiled/executable artifact | package existence means authored/published truth |
| Domain Data evolution | governance/evolution authority outside production Runtime | consume result only after required governance | Runtime autonomously evolves production Domain Data |
| Promotion decision | upstream governance authority | preserve/verify `PromotionDecisionRef` provenance | compatibility/PASS means promotion |
| Application selection | application/composition authority | consume exact `ApplicationSelectionRef` / `SelectedDomainDataRef` | registry default or Runtime compatibility means selection |
| Compatibility validation | DomainHarness | fail-closed validation against explicit target/capabilities | validation performs selection |
| Runtime binding | DomainHarness technical Runtime authority | bind already-selected compatible composition | binding is application selection |
| Runtime activation | DomainHarness technical Runtime authority | activate exact bound inputs and preserve evidence | activation retroactively grants promotion/selection |
| Runtime state machine / transitions | DomainHarness | authoritative production execution | UX or external adapter owns Runtime transitions |
| Runtime Guard / Hard Invariant | DomainHarness where defined by frozen product | evaluate/enforce | UX intent bypasses invariant evaluation |
| Domain UX semantics / affordances | Domain UX | consume typed intent; emit correlated Runtime outcome/view evidence | DomainHarness owns renderer/affordance semantics |
| Runtime Host Binding | DomainHarness host/runtime layer | technical resources/capabilities | presentation adapter is Runtime Host Binding |
| External Business SoR truth | external authority | dispatch/correlate/observe/reconcile; never fabricate remote truth | request/timeout/local journal proves remote commit/non-commit |
| DAC cross-layer ref semantics | Domain Application Contract | consume/alias/adapt/preserve | DomainHarness forks identity authority |
| Application Manifest composition metadata | Domain Application Contract / composition authority | narrow validation/consumption | Manifest stores live instance truth or becomes fourth pillar |

---

## 10. Negative acceptance cases

The amendment and any later implementation must prove these failures explicitly:

1. **Mutable selector:** `latest/current/head` is presented for authoritative Runtime Domain Data. → reject until exact immutable selection is supplied.
2. **Digest drift:** same claimed immutable revision resolves to different content digest. → fail closed.
3. **Simulator shortcut:** Simulator PASS/evolved candidate is presented directly for production execution without promotion + application selection. → reject.
4. **Registry-default shortcut:** local `defaultPackageId` is treated as proof of application selection. → reject classification.
5. **Selection/activation collapse:** one ref/state is used for both application selection and technical activation. → reject.
6. **Compatibility auto-substitution:** selected package is incompatible, Runtime silently chooses another revision/default/latest. → fail closed; explicit reselection required.
7. **Missing Runtime implementation identity:** composition is called compatible without a declared compatibility target / concrete Runtime implementation identity/version/build / required capabilities. → block/incompatible.
8. **Stale UX basis:** intent based on stale snapshot/revision/semantic target is silently applied to current target. → reject/stale/rebase-review as applicable.
9. **UX authority leak:** a UX intent or renderer adapter directly performs authoritative Runtime transition. → reject classification.
10. **Host classification leak:** presentation-only UX host adapter is treated as Runtime Host Binding. → reject classification.
11. **Dispatch=commit:** transport dispatch/provider acceptance is reported as external authoritative commit. → reject.
12. **Timeout=remote failure:** timeout/worker crash after possible external effect is reported as proven non-commit. → reject; preserve unknown/ambiguous.
13. **Blind non-idempotent retry:** ambiguous non-idempotent effect is automatically retried. → reject unless a separately valid safe-retry condition is proven.
14. **SoR identity substitution:** Runtime implementation/host/provider adapter identity substitutes for external Business SoR identity. → reject.
15. **Manifest state leakage:** Application Manifest contains live Business/Process/Execution/UX instance state. → reject.
16. **Manifest evidence absorption:** binding/activation/execution evidence is stored as Manifest definition instead of separate evidence referencing exact composition identity. → reject.

---

## 11. Exact DAC conformance evidence mapping

Normative DAC source cut: [`domain-application-contract@9c3ef91...`](https://github.com/kaicreator-mm/domain-application-contract/tree/9c3ef91b8b40d893e4fe2b0370200e765816ec2b/spec/v0.0.2)

- **C02** — no mutable `latest/current/head` for authoritative Runtime Domain Data; resolve exact revision + digest + selection first. Supports §§3, 8, 10.1.
- **C03** — immutable revision/digest mismatch fails closed. Supports §§3.2, 10.2.
- **C07** — evolved candidate cannot enter Runtime without promotion + application selection. Supports §§2, 3, 10.3.
- **C09** — stale Snapshot/semantic-target intent must not be silently applied. Supports §5 and 10.8.
- **C11–C13** — dispatch is not external commit; uncertain effect is `unknown/ambiguous`; ambiguous non-idempotent operation is not blindly retryable. Supports §6 and 10.11–10.13.
- **C16** — missing/incompatible Runtime Port/capability blocks activation. Supports §§4, 7, 10.7.
- **C22** — promotion, selection, compatibility, binding and activation are five separately referrable stages. Supports §4.
- **C23** — compatibility requires declared DomainHarness target, concrete Runtime implementation identity/version/build and required capabilities. Supports §§4.2, 7, 10.7.
- **C31** — selected and activated must not collapse into one identity/state. Supports §§2, 4, 10.5.
- **C32** — incompatibility must not auto-substitute another revision. Supports §§7, 8, 10.6.
- **C33** — presentation-only UX host adapter is not Runtime Host Binding authority. Supports §§2, 5, 10.10.
- **C36** — exact promoted + explicitly selected + identity-valid + compatible composition is eligible for Runtime Binding then Technical Activation. Supports §§3–4 and 7.
- **C37** — compatibility failure cannot resolve to auto-latest/substitution/upgrade/downgrade; explicit reselection/reconciliation is required. Supports §§7–8 and 10.6.
- **C38** — binding/activation/execution evidence remains separate from Manifest definition and references exact Manifest identity/digest. Supports §7 and 10.16.

Exact evidence files:

- [`CROSS_LAYER_REFERENCES.md`](https://github.com/kaicreator-mm/domain-application-contract/blob/9c3ef91b8b40d893e4fe2b0370200e765816ec2b/spec/v0.0.2/CROSS_LAYER_REFERENCES.md)
- [`CONFORMANCE_MATRIX.md`](https://github.com/kaicreator-mm/domain-application-contract/blob/9c3ef91b8b40d893e4fe2b0370200e765816ec2b/spec/v0.0.2/CONFORMANCE_MATRIX.md)
- [`EXTERNAL_AUTHORITY.md`](https://github.com/kaicreator-mm/domain-application-contract/blob/9c3ef91b8b40d893e4fe2b0370200e765816ec2b/spec/v0.0.2/EXTERNAL_AUTHORITY.md)
- [`APPLICATION_MANIFEST.md`](https://github.com/kaicreator-mm/domain-application-contract/blob/9c3ef91b8b40d893e4fe2b0370200e765816ec2b/spec/v0.0.2/APPLICATION_MANIFEST.md)
- [`FREEZE_MANIFEST.md`](https://github.com/kaicreator-mm/domain-application-contract/blob/9c3ef91b8b40d893e4fe2b0370200e765816ec2b/spec/v0.0.2/FREEZE_MANIFEST.md)

---

## 12. Review and implementation gate

This is an architecture candidate, not implementation authorization.

```text
Product A2 candidate + L2 A2 candidate
  -> pin exact candidate HEAD
  -> Fresh Independent Architecture Review on that exact HEAD
  -> PASS only
  -> focused implementation Task DAG
  -> JIT exact-base implementation branches
```

Before review PASS:

- no product-source changes for A2;
- no implementation Task DAG treated as authorized;
- no implementation branch/PR;
- no merge of this candidate into `main` on the assumption that the architecture is already accepted.

A review finding that would transfer promotion, application-selection, Domain UX, or external Business-SoR authority into DomainHarness is a blocking architecture defect, not an implementation detail.
