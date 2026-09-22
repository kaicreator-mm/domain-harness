# DomainHarness v0.3 L2 Architecture Amendment A2 — DAC v0.0.2 Cross-Layer Reference Adoption

**Status:** REVIEW CANDIDATE — FRESH INDEPENDENT ARCHITECTURE REVIEW REQUIRED  
**Issue:** [#296](https://github.com/kaicreator-mm/domain-harness/issues/296)  
**Parent inventory:** [#291](https://github.com/kaicreator-mm/domain-harness/issues/291)  
**Product amendment:** [`DomainHarness_v0.3_PRD_AMENDMENT_A2_DAC_V002_REVIEW_CANDIDATE.md`](../product/amendments/DomainHarness_v0.3_PRD_AMENDMENT_A2_DAC_V002_REVIEW_CANDIDATE.md)  
**Prepared:** 2026-09-22  
**DomainHarness exact base:** `main@7fdcde2e853382b0ba0fd2baeb6f91af2fdbace6`  
**DomainHarness base tree:** `457e405659fdf71b02fe8eb5b3103bf59a3d69ec`  
**DAC exact baseline:** `kaicreator-mm/domain-application-contract@9c3ef91b8b40d893e4fe2b0370200e765816ec2b`  
**DAC tree:** `44086afe53166c9f290d7d06dd757ebfc8c24eb8`  
**Pinned development standard:** `kaicreator-mm/ai-development-standard@0446f04583f6cf464c835f26e2f657c8b703cb4e` (`2.0.0`)

> The exact candidate HEAD is pinned in the #296 review handoff after this file and the Product amendment are committed. The candidate HEAD is not embedded here because that would make the document self-referential.

---

## 1. L2 amendment scope

This is an additive architecture amendment to the frozen DomainHarness v0.3 architecture baseline and frozen L2 Amendment A1. It resolves only G1–G5 from #291/#296:

- G1 — selected Domain Data identity/provenance consumption;
- G2 — Runtime contract/implementation/binding/activation reference separation;
- G3 — UX ↔ Runtime cross-layer reference bridge;
- G4 — external authority reference/reconciliation observability;
- G5 — PROVISIONAL Application Manifest consumption boundary.

It does not authorize product-source changes. It does not replace the frozen Runtime architecture. It does not define a new DAC wire schema. It does not create dependencies on Forge, Simulator, or Domain UX implementations.

The architectural rule is:

> DAC owns cross-layer role semantics. DomainHarness owns production Runtime execution semantics. The integration layer maps the two without transferring authority in either direction.

`AUTHORITY_CONFLICT = 0` is a release-blocking invariant for this amendment.

---

## 2. Frozen architecture that remains authoritative

The following current DomainHarness mechanisms remain authoritative and are adapted, not redesigned:

| Existing mechanism | Current role | A2 disposition |
|---|---|---|
| `CompiledPackageManifest` | exact content-derived package identity plus Runtime/engine/target/capability metadata | retain; map into selected/compatibility evidence, but never treat package existence as selection |
| `PackageRegistry` / `defaultPackageId` | local registry lookup/default mechanism | retain; explicitly **not** application-selection authority |
| `validateCompiledPackage(...)` | fail-closed executable compatibility validation | retain as compatibility authority |
| `preflightPackageActivation(...)` | validates registry packages/default/retained pins before Runtime startup | retain; extend/adapt only after Product/L2 review PASS |
| exact RuntimeStore package pins | durable exact package identity for running/retained workflows | retain; no silent rebase |
| `DomainMessage` | stable message/command identity and causal correlation | adapt to `CommandRef`; do not replace wholesale |
| `WorkflowInstanceSnapshot` | Runtime process snapshot with `packageId` + `stateRevision` | adapt to Runtime snapshot/ref bridge |
| `ProjectionSnapshot` | renderer-independent projection snapshot with revision/source revision evidence | adapt to `ViewRef`/`SnapshotRef` roles |
| `DomainSubscription` / `DomainChange` | renderer-independent watch/change notification | adapt to `WatchRef` role |
| `RuntimeHostBindings` | technical Runtime resources/capabilities | already conforming; never UX presentation host authority |
| durable effect identity/journal | stable `effectId`, source message, idempotency key, durable completion/recovery facts | retain as logical Runtime operation basis |
| `DurableToolRunner` ambiguity policy | non-idempotent uncertain execution returns `recovery_required / ambiguous-non-idempotent` | retain; expose additional reconciliation references only |

Current source evidence at the exact base:

- [`v2/contracts/package.ts`](https://github.com/kaicreator-mm/domain-harness/blob/7fdcde2e853382b0ba0fd2baeb6f91af2fdbace6/packages/domain-harness/src/v2/contracts/package.ts)
- [`package/activation.ts`](https://github.com/kaicreator-mm/domain-harness/blob/7fdcde2e853382b0ba0fd2baeb6f91af2fdbace6/packages/domain-harness/src/package/activation.ts)
- [`v2/contracts/message.ts`](https://github.com/kaicreator-mm/domain-harness/blob/7fdcde2e853382b0ba0fd2baeb6f91af2fdbace6/packages/domain-harness/src/v2/contracts/message.ts)
- [`v2/contracts/workflow.ts`](https://github.com/kaicreator-mm/domain-harness/blob/7fdcde2e853382b0ba0fd2baeb6f91af2fdbace6/packages/domain-harness/src/v2/contracts/workflow.ts)
- [`v2/contracts/projection.ts`](https://github.com/kaicreator-mm/domain-harness/blob/7fdcde2e853382b0ba0fd2baeb6f91af2fdbace6/packages/domain-harness/src/v2/contracts/projection.ts)
- [`v2/contracts/subscription.ts`](https://github.com/kaicreator-mm/domain-harness/blob/7fdcde2e853382b0ba0fd2baeb6f91af2fdbace6/packages/domain-harness/src/v2/contracts/subscription.ts)
- [`v2/contracts/host.ts`](https://github.com/kaicreator-mm/domain-harness/blob/7fdcde2e853382b0ba0fd2baeb6f91af2fdbace6/packages/domain-harness/src/v2/contracts/host.ts)
- [`v2/contracts/effect.ts`](https://github.com/kaicreator-mm/domain-harness/blob/7fdcde2e853382b0ba0fd2baeb6f91af2fdbace6/packages/domain-harness/src/v2/contracts/effect.ts)
- [`durable-tool-runner.ts`](https://github.com/kaicreator-mm/domain-harness/blob/7fdcde2e853382b0ba0fd2baeb6f91af2fdbace6/packages/domain-harness/src/execution/tool-runner/durable-tool-runner.ts)

---

## 3. Complete #291 role classification

The four allowed classifications are exactly:

- `ALREADY_CONFORMING`
- `TYPE_ALIAS_OR_ADAPTER`
- `API_GAP`
- `AUTHORITY_CONFLICT`

The #291 result is carried forward without reinterpretation:

| # | DAC role / boundary | Classification | Current evidence / gap | A2 architecture disposition |
|---:|---|---|---|---|
| 1 | `SelectedDomainDataRef` exact selected/pinned identity | `API_GAP` | package has `domainId`, `domainVersion`, content-derived `packageId`, target/capability data, but not the full DAC authoritative selection/provenance set | consume exact selected ref and validate it against the concrete compiled package; Runtime never creates the selection decision |
| 2 | `PromotionDecisionRef` vs `ApplicationSelectionRef` | `API_GAP` | Runtime activation does not claim promotion, but public boundary cannot preserve/distinguish both provenance stages | carry both as read-only cross-layer provenance; never infer either from registry/default/compatibility |
| 3 | `RuntimeContractRef` | `TYPE_ALIAS_OR_ADAPTER` | `runtimeContractMajor` already participates in compatibility | map existing contract compatibility identity to DAC role; avoid parallel authority |
| 4 | `RuntimeImplementationRef` | `API_GAP` | `executionEngineMajor` / `targetProfileId` exist but no distinct concrete implementation identity/version/build ref | add/consume explicit concrete Runtime implementation ref for compatibility/binding evidence |
| 5 | `RuntimeBindingRef` vs `RuntimeActivationRef` | `API_GAP` | compatibility/preflight and exact pins exist, but binding and activation are not first-class cross-layer refs | make binding and activation separately referrable; preserve `ApplicationSelection != RuntimeBinding != RuntimeActivation` |
| 6 | `CompatibilityTargetRef` / DomainHarness compatibility target | `TYPE_ALIAS_OR_ADAPTER` | validation policy + manifest contract/engine/profile/capability dimensions already fail closed | expose/map these dimensions as explicit compatibility target evidence |
| 7 | `DomainIntentRef` | `API_GAP` | causal IDs exist but no DAC intent role / stale observation basis | consume intent correlation plus snapshot/revision/semantic-target basis where relevant; no UX ownership |
| 8 | `CommandRef` | `TYPE_ALIAS_OR_ADAPTER` | `DomainMessage.messageId`, target, correlation and causation provide stable command/message identity | adapt existing identity; do not create duplicate command authority |
| 9 | `OutcomeRef` | `API_GAP` | message dispositions, query/failure and effect outcomes exist but no unified cross-layer outcome correlation | expose narrow outcome correlation carrying Runtime/external ambiguity accurately |
| 10 | `ViewRef` / `SnapshotRef` / `WatchRef` | `TYPE_ALIAS_OR_ADAPTER` | query, workflow snapshot, projection snapshot, subscription/change primitives already exist | adapt renderer-independent primitives; preserve source/revision identity |
| 11 | Runtime Host Binding vs UX/UI host adapter | `ALREADY_CONFORMING` | `RuntimeHostBindings` is technical capability/resource boundary | preserve; reject presentation-adapter classification as Runtime Host Binding |
| 12 | external authority dispatch vs committed / unknown / reconciliation | `API_GAP` | core execution semantics are already safe, but cross-layer authority/operation/observation/reconciliation refs are absent | add public reference/observation bridge only; keep existing effect authority and ambiguity semantics |
| 13 | PROVISIONAL Application Manifest consumption | `API_GAP` | Runtime activates validated packages directly; no composition-intake adapter | accept only already-selected compatible composition metadata; Manifest gains no selection/state authority |

**Authority-conflict count: `0`.**

The fact that item 12 has an `API_GAP` does not mean the durable execution algorithm is non-conforming. The gap is the cross-layer public references/observability; the current non-idempotent ambiguity policy remains an `ALREADY_CONFORMING` execution behavior inside that row.

---

## 4. Authority / ownership matrix

| Object / decision | Semantic owner | Decision authority | DomainHarness may | DomainHarness must not |
|---|---|---|---|---|
| authored Domain Data candidate | authoring system/human | authoring authority | consume only after required upstream lifecycle | infer production authority from authorship |
| evolved candidate | evolution/governance system | evolution authority | consume only after required promotion/selection | promote because simulation/validation passed |
| `PromotionDecisionRef` | DAC role; upstream governance instance | promotion/governance authority | verify/preserve provenance | create promotion decision from Runtime compatibility |
| `ApplicationSelectionRef` | DAC role; application/composition layer | application-selection authority | consume exact selection | choose a revision on behalf of application composition |
| `SelectedDomainDataRef` | DAC role | application-selection authority | verify exact identity and bind to compiled package | substitute local default/latest on mismatch |
| compiled package integrity | DomainHarness compiler/runtime contracts | DomainHarness compatibility/integrity authority | compute/validate package identity | imply promotion or selection |
| `RuntimeContractRef` | DAC cross-layer role + DomainHarness contract implementation | contract compatibility authority | map Runtime contract dimensions | collapse with concrete implementation identity |
| `RuntimeImplementationRef` | DAC cross-layer role; DomainHarness deployment/runtime implementation | technical Runtime identity authority | expose exact implementation/version/build identity | substitute external SoR identity |
| `CompatibilityTargetRef` | DAC role; concrete compatibility declaration | DomainHarness compatibility authority for its target | validate exact target/profile/capabilities | mean “whatever Runtime currently provides” |
| `RuntimeBindingRef` | DAC role; produced at Runtime technical boundary | DomainHarness technical binding authority | bind already-selected compatible inputs | perform application selection |
| `RuntimeActivationRef` | DAC role; produced at Runtime technical boundary | DomainHarness technical activation authority | activate exact binding / preserve activation evidence | collapse with selection or rewrite selected refs |
| Domain Runtime transitions | DomainHarness | DomainHarness | execute authoritative state machine/Guard/Invariant | cede transition authority to UX or adapter |
| `DomainIntentRef` | DAC cross-layer role; semantic intent originates from Domain UX | Domain UX for intent semantics; Runtime for transition consequence | correlate/validate basis/accept or reject command | define UI affordance/rendering semantics |
| `CommandRef` | DAC role; Runtime command identity mapping | DomainHarness for Runtime command processing | adapt existing message identity | make intent itself authoritative transition |
| `OutcomeRef` | DAC role; authoritative outcome source depends on operation | Runtime and/or external authority within their scopes | correlate and report exact status | strengthen external uncertainty into fabricated fact |
| `ViewRef` / `SnapshotRef` / `WatchRef` | DAC roles; Domain UX consumes semantics, Runtime exposes renderer-neutral observations | source authority owns source data; DomainHarness owns Runtime projection mechanics | expose renderer-neutral revisions/observations | own renderer/presentation layer |
| Runtime Host Binding | DomainHarness host layer | DomainHarness technical host authority | bind resources/capabilities | classify UX presentation host as Runtime authority |
| external Business SoR identity/state | external system | external business authority | dispatch, observe, correlate, reconcile | infer commit/non-commit without evidence |
| Application Manifest identity/composition metadata | DAC/application composition | composition authority | validate/consume exact refs | store live instance state or become fourth semantic pillar |

---

## 5. Target architecture: five-stage composition-to-runtime boundary

The DAC-aware Runtime boundary is modeled as five distinct stages, each with separate evidence/ref identity:

```text
[1 Promotion Decision]
  authority: upstream governance
  evidence: PromotionDecisionRef
          |
          v
[2 Application Selection]
  authority: application/composition layer
  evidence: ApplicationSelectionRef + SelectedDomainDataRef
          |
          v
[3 Compatibility Validation]
  authority: DomainHarness for Runtime compatibility
  inputs: exact selected refs + RuntimeContractRef + RuntimeImplementationRef
          + CompatibilityTargetRef + required capabilities
  result: compatible | incompatible/fail-closed
          |
          v
[4 Runtime Binding]
  authority: DomainHarness technical Runtime
  evidence: RuntimeBindingRef
  binds: already-selected compatible exact inputs -> concrete Runtime environment
          |
          v
[5 Runtime Activation]
  authority: DomainHarness technical Runtime
  evidence: RuntimeActivationRef
  result: exact technical activation / running pin
```

### 5.1 Forbidden shortcuts

No edge may skip authority by inference:

```text
package exists         -X-> promotion
Simulator PASS         -X-> promotion
compatibility PASS     -X-> selection
registry default       -X-> application selection
selection              -X-> activation
incompatibility        -X-> auto substitute latest/default
binding                -X-> rewrite selected Domain Data
```

### 5.2 Existing A1 `DomainActivationBinding` disambiguation

Frozen L2 A1 defines an internal/local `DomainActivationBinding` carrying DomainHarness technical activation metadata and governance baseline pinning. A2 does not invalidate that frozen structure.

However, at the DAC cross-layer boundary:

```text
A1 DomainActivationBinding != ApplicationSelectionRef
A1 DomainActivationBinding != PromotionDecisionRef
```

Its future implementation may contribute to `RuntimeBindingRef` / `RuntimeActivationRef` evidence after compatibility validation, but it cannot stand in for upstream application selection. If naming ambiguity reaches the public boundary, the implementation task must add an explicit adapter or more precise external name rather than silently reinterpret A1.

---

## 6. Public-contract delta proposal

This section is architecture design, not implementation authorization. Exact TypeScript field names and wire encodings remain implementation-review material where DAC has not frozen them.

### 6.1 Boundary A — DAC reference role adapter

Introduce a dependency-light public contract boundary whose purpose is to **consume canonical DAC roles**. Preferred semantics:

- import/alias canonical shared contract types when an approved dependency form exists;
- otherwise use a version-bound transparent adapter whose mapping to the exact DAC role is explicit and testable;
- never create a second DomainHarness-owned identity authority with subtly different semantics;
- carry DAC version/baseline compatibility explicitly enough to fail closed when the role contract is unsupported.

The adapter surface must cover, as needed by G1–G5:

```text
PromotionDecisionRef
ApplicationSelectionRef
SelectedDomainDataRef
RuntimeContractRef
RuntimeImplementationRef
CompatibilityTargetRef
RuntimeBindingRef
RuntimeActivationRef
DomainIntentRef
CommandRef
OutcomeRef
ViewRef
SnapshotRef
WatchRef
external authority / logical operation / provider operation / observation / reconciliation refs
Application Manifest identity/composition refs
```

This is a semantic-role list, **not** a mandate to create one new concrete TypeScript interface per line.

### 6.2 Boundary B — composition intake

A new/extended Runtime composition intake must accept already-decided composition identity/provenance separately from the compiled package itself.

Conceptually it carries:

```text
composition identity / Manifest identity+digest (when Manifest is used)
selected Domain Data ref
promotion decision provenance ref
application selection ref
Runtime contract ref
concrete Runtime implementation ref
compatibility target ref
required capability/binding declarations
optional compatible UX interaction-contract refs required by the composition
```

The intake performs **validation**, not selection.

Required validation sequence:

1. validate DAC/composition reference integrity sufficient for the supported baseline;
2. verify `SelectedDomainDataRef` exact identity against the concrete compiled package identity/digest mapping;
3. validate current compiled package integrity;
4. validate Runtime contract/implementation/target/profile/capability compatibility;
5. reject missing/contradictory required identity evidence;
6. only after PASS, permit creation of Runtime binding evidence;
7. only after a valid binding, permit technical activation evidence.

No step may resolve an incompatibility by selecting another package.

### 6.3 Boundary C — Runtime binding and activation evidence

Binding and activation become separately observable facts.

`RuntimeBindingRef` architecture meaning:

> immutable/referrable evidence that an already-selected exact composition was successfully bound to an explicit compatibility target and concrete Runtime implementation environment.

`RuntimeActivationRef` architecture meaning:

> immutable/referrable evidence identifying the concrete technical activation that executed or is eligible to execute under that binding, without implying application selection.

Binding/activation evidence must reference, directly or transitively, enough exact identity to correlate:

- selected Domain Data;
- application selection provenance;
- compatibility target;
- Runtime contract;
- concrete Runtime implementation;
- relevant Application Manifest identity/digest when Manifest composition is used.

It must remain separate from Manifest definition (DAC C38).

### 6.4 Boundary D — intent / command / outcome correlation

Current `DomainMessage` remains the command/message primitive. Its `messageId`, `target`, `correlationId`, and `causationId` are the primary candidate mapping for `CommandRef`.

A DAC-aware entry path needs an additive way to preserve:

- originating `DomainIntentRef` where a command came from Domain UX;
- semantic target identity where supplied;
- observed `SnapshotRef` / revision basis when the action depends on a prior observation;
- resulting `OutcomeRef` correlation.

The architecture must avoid making every internal Runtime message dependent on UX. Internal commands/messages without a UX origin remain valid. The cross-layer references are optional by origin but mandatory when needed to prove stale-observation or external-correlation semantics.

Stale-basis handling is fail-safe:

```text
observed basis matches authoritative requirement -> proceed under Runtime rules
observed basis is stale/conflicting             -> reject / stale / explicit rebase-review
basis required but absent                       -> fail closed for that operation
```

No presentation data or renderer object crosses this boundary.

### 6.5 Boundary E — view / snapshot / watch adapter

Current primitives map as follows:

| DAC role | Existing DomainHarness primitive | L2 mapping |
|---|---|---|
| `ViewRef` | `DomainQueryResult`, especially projection result | adapter identifies renderer-neutral query/projection view |
| `SnapshotRef` | `WorkflowInstanceSnapshot`, `ProjectionSnapshot`, `BusinessSnapshot` provenance | adapter preserves source identity + revision basis |
| `WatchRef` | `DomainSubscription` + `DomainChange.revision` | adapter identifies watch plus observed revision/change |

`ProjectionSnapshot` already records `packageId`, its own `revision`, workflow source `stateRevision`, and business-source revisions. This is useful evidence; the adapter must preserve, not erase, these revision relationships.

### 6.6 Boundary F — external authority observation/reconciliation

The existing durable effect execution core remains in place. Add a cross-layer evidence adapter around it rather than replacing its identity/journal.

The adapter must distinguish:

```text
Runtime logical operation identity
provider/request operation identity (if available)
external authority identity/scope
local dispatch/attempt evidence
provider acceptance evidence (if available)
external authoritative observation/commit evidence
reconciliation identity/result
```

State must not be collapsed. In particular:

```text
local journal: started
```

means only that the Runtime has a durable local execution fact; it is not proof of a remote commit.

The current `effectId` remains the stable Runtime logical/idempotency identity candidate. Existing non-idempotent ambiguous execution keeps returning recovery/reconciliation-required semantics; a future `OutcomeRef` must represent that uncertainty rather than convert it to `failed` or `completed` without evidence.

---

## 7. Application Manifest consumption boundary

Application Manifest is treated as composition metadata owned by the DAC/application-composition layer.

### 7.1 Allowed

DomainHarness may:

- receive a Manifest identity/digest and its canonical cross-layer refs;
- verify the supplied exact selected Domain Data identity maps to the compiled package;
- validate declared Runtime target/implementation/capabilities/bindings;
- consume compatible UX interaction-contract references only as compatibility requirements where the Runtime contract needs them;
- produce separate binding/activation evidence that references the exact composition.

### 7.2 Forbidden

DomainHarness must not:

- author the application selection because it received a Manifest;
- use Manifest order/defaults to silently choose a different Domain Data revision;
- store live workflow/business/execution/UX instance state in the Manifest;
- put Runtime binding/activation execution state into the Manifest definition;
- define a parallel Manifest-only semantic/revision/digest identity hierarchy;
- import Forge, Simulator, or Domain UX implementation code to interpret the Manifest;
- treat the Manifest as a fourth semantic pillar.

### 7.3 Provisional wire/schema handling

A2 freezes the required semantic boundary, not an independent concrete Manifest wire shape. If DAC v0.0.2 marks specific field/schema details provisional/open, the DomainHarness implementation must bind to an approved canonical contract/adapter revision and must not silently hard-freeze a divergent local encoding.

---

## 8. Compatibility and migration treatment for current v0.3 contracts

### 8.1 General rule: additive first

Existing v0.3 public Runtime contracts remain valid at this architecture stage. The implementation plan after review PASS should prefer additive adapters/overloads/wrappers over breaking changes.

### 8.2 `CompiledPackageManifest`

Keep existing content-derived `packageId` semantics and package integrity checks. Do not overload `packageId` to mean `SelectedDomainDataRef` or `ApplicationSelectionRef`.

Migration treatment:

- legacy package-only callers can continue to use the existing path where existing product semantics permit;
- DAC-aware application composition uses an explicit selected/composition intake path;
- exact mapping between selected Domain Data identity and compiled package must be validated, not inferred from a mutable locator;
- a future compatibility policy may require DAC-aware intake for cross-layer application composition while leaving low-level/internal package tests unchanged.

### 8.3 `PackageRegistry.defaultPackageId`

Retain as a local backward-compatible registry default. It MUST NOT acquire new meaning as application selection.

For DAC-aware composition, explicit `ApplicationSelectionRef` / `SelectedDomainDataRef` outrank any registry default because they represent a different authority category, not because of simple precedence.

### 8.4 Runtime activation/preflight

Current preflight remains fail-closed for invalid registry packages, missing default, and missing retained pins. A later implementation may add composition validation before/around binding/activation, but must preserve retained exact pins.

Running/retained workflow instances must not be rebound to a new selected package solely because a new composition/Manifest arrives.

### 8.5 `DomainMessage`

Keep existing message identity. Add DAC-aware origin/basis/outcome correlation in an additive manner. Avoid requiring all messages to originate in UX.

### 8.6 Snapshot/query/subscription

Keep existing renderer-independent primitives. Adapt their identities/revisions to DAC roles. Do not introduce UI component/presentation concepts.

### 8.7 Effects

Keep existing effect journal identity, idempotency and recovery semantics. Add external authority/provider/reconciliation references without changing the meaning of `completed`, `failed`, `recovery_required`, or idempotent retry behavior unless a separate reviewed implementation finding requires it.

### 8.8 Data migration

A2 does not authorize a persisted-store migration. A later Task DAG must explicitly prove whether any new refs must be persisted for:

- workflow creation pins;
- command acceptance/stale-basis evidence;
- Runtime binding/activation evidence;
- external authority reconciliation;
- durable outcome correlation.

If persistence is required, migration must preserve existing exact pins and journal identities. “Unknown legacy provenance” must remain explicit; it must not be backfilled by pretending current/default/latest was historically selected.

---

## 9. Negative architecture cases

These cases are mandatory validation targets for the later implementation plan and are review criteria now.

| ID | Invalid scenario | Required architecture result |
|---|---|---|
| N01 | mutable `latest/current/head` enters authoritative Runtime as selected Domain Data | reject until exact selected revision + digest + selection exist |
| N02 | immutable revision identity resolves to another digest | fail closed |
| N03 | Simulator PASS/evolved candidate is directly activated | reject; promotion + application selection required |
| N04 | `PackageRegistry.defaultPackageId` is emitted as `ApplicationSelectionRef` | reject classification |
| N05 | compatibility PASS creates `ApplicationSelectionRef` | reject; validation is not selection |
| N06 | application selection directly creates `RuntimeActivationRef` with no separate binding/activation evidence | reject |
| N07 | incompatibility silently falls back to default/latest/another revision | fail closed; explicit reselection required |
| N08 | `RuntimeContractRef` and concrete `RuntimeImplementationRef` are treated as the same identity | reject |
| N09 | target says only “current DomainHarness” without implementation identity/build/capabilities | block/incompatible |
| N10 | stale snapshot/semantic target intent is silently applied | reject/stale/rebase-review |
| N11 | UX renderer/affordance decides authoritative transition | reject architecture |
| N12 | UX presentation host is placed inside `RuntimeHostBindings` as Runtime authority | reject classification |
| N13 | dispatch/provider queue acceptance is reported as external commit | reject |
| N14 | timeout after possible non-idempotent effect is turned into proven remote failure | preserve unknown/ambiguous; reconcile |
| N15 | ambiguous non-idempotent effect is blindly retried | reject unless independently proven safe-retry condition exists |
| N16 | Runtime implementation/host identity replaces external Business SoR identity | reject |
| N17 | Application Manifest carries live process/execution/UX instance state | reject |
| N18 | binding/activation evidence mutates Manifest definition | reject; separate evidence |
| N19 | legacy retained package pin is silently rebound during DAC migration | reject |
| N20 | missing historical DAC provenance is fabricated from current/default package | reject; preserve legacy/unknown status explicitly |

---

## 10. DAC conformance evidence matrix

Exact evidence baseline:

- [`CROSS_LAYER_REFERENCES.md@9c3ef91`](https://github.com/kaicreator-mm/domain-application-contract/blob/9c3ef91b8b40d893e4fe2b0370200e765816ec2b/spec/v0.0.2/CROSS_LAYER_REFERENCES.md)
- [`CONFORMANCE_MATRIX.md@9c3ef91`](https://github.com/kaicreator-mm/domain-application-contract/blob/9c3ef91b8b40d893e4fe2b0370200e765816ec2b/spec/v0.0.2/CONFORMANCE_MATRIX.md)
- [`EXTERNAL_AUTHORITY.md@9c3ef91`](https://github.com/kaicreator-mm/domain-application-contract/blob/9c3ef91b8b40d893e4fe2b0370200e765816ec2b/spec/v0.0.2/EXTERNAL_AUTHORITY.md)
- [`APPLICATION_MANIFEST.md@9c3ef91`](https://github.com/kaicreator-mm/domain-application-contract/blob/9c3ef91b8b40d893e4fe2b0370200e765816ec2b/spec/v0.0.2/APPLICATION_MANIFEST.md)

| DAC clause | A2 architectural enforcement | Negative-case coverage |
|---|---|---|
| C02 | authoritative selected Domain Data must be exact, not mutable `latest/current/head` | N01 |
| C03 | revision/digest mismatch fails closed | N02 |
| C07 | evolved candidate requires promotion + application selection before Runtime | N03 |
| C09 | stale snapshot/semantic-target basis cannot be silently applied | N10 |
| C11 | dispatch/provider acceptance is not external authoritative commit | N13 |
| C12 | timeout/crash after possible effect remains unknown/ambiguous unless non-commit proven | N14 |
| C13 | ambiguous non-idempotent effect is not automatically retryable | N15 |
| C16 | missing/incompatible Runtime port/capability blocks activation | N09 |
| C22 | promotion, selection, compatibility, binding, activation separately referrable | N05, N06 |
| C23 | explicit compatibility target + concrete Runtime implementation identity/version/build + capabilities required | N08, N09 |
| C31 | selected != bound/activated | N06 |
| C32 | incompatibility does not auto-substitute revision | N07 |
| C33 | presentation UX host adapter != Runtime Host Binding | N12 |
| C36 | exact promoted + selected + identity-valid + compatible composition is eligible for binding then activation | positive path §5 |
| C37 | compatibility failure requires explicit reselection/reconciliation, not auto-latest/substitution | N07 |
| C38 | binding/activation/execution evidence stays outside Manifest definition | N18 |

---

## 11. Positive architecture journey

A valid DAC-aware DomainHarness application start follows this sequence:

1. Upstream governance has a durable `PromotionDecisionRef` for an exact Domain Data revision.
2. Application/composition authority creates `ApplicationSelectionRef` / `SelectedDomainDataRef` for that exact promoted identity.
3. DomainHarness receives the already-selected composition (direct refs or canonical Application Manifest composition metadata).
4. DomainHarness verifies identity integrity and that the selected ref maps exactly to the concrete compiled package.
5. DomainHarness validates `RuntimeContractRef`, concrete `RuntimeImplementationRef`, `CompatibilityTargetRef`, required capabilities and technical binding preconditions.
6. If any validation fails, activation is blocked. DomainHarness does not choose a replacement.
7. If validation passes, DomainHarness creates/refers to separate `RuntimeBindingRef` evidence.
8. Technical activation produces a separate `RuntimeActivationRef`; exact package/runtime pins are retained.
9. Domain UX may send an intent-correlated command. DomainHarness preserves intent/snapshot basis correlation but remains transition authority.
10. Runtime emits renderer-independent outcome/view/snapshot/watch evidence.
11. If a tool touches external authority, Runtime preserves logical operation identity and external observation/reconciliation identity without treating dispatch as commit.
12. If an uncertain non-idempotent external operation cannot be proven committed or non-committed, Runtime keeps it ambiguous/recovery-required until reconciliation resolves it.

This journey preserves the frozen authority graph while making cross-layer composition auditable.

---

## 12. Review checklist

Fresh Independent Architecture Review on the exact candidate HEAD must verify at minimum:

### 12.1 Scope

- [ ] only G1–G5 are amended;
- [ ] no product-source implementation is present;
- [ ] no unrelated v0.3 architecture is reopened.

### 12.2 Authority

- [ ] `AUTHORITY_CONFLICT=0`;
- [ ] DomainHarness remains authoritative production Runtime/state-machine/execution authority;
- [ ] promotion authority remains upstream;
- [ ] application-selection authority remains upstream/application composition;
- [ ] Domain UX semantics/renderer authority remains outside DomainHarness;
- [ ] external Business SoR truth remains external.

### 12.3 Identity / lifecycle

- [ ] selected Domain Data identity is exact and can be verified against concrete compiled package;
- [ ] promotion, selection, compatibility, binding and activation remain separate;
- [ ] Runtime contract != concrete Runtime implementation != binding != activation;
- [ ] `defaultPackageId` is not application selection;
- [ ] no auto-latest/substitution on incompatibility;
- [ ] retained/running exact pins are not silently rebased.

### 12.4 UX bridge

- [ ] DomainIntent/Command/Outcome mapping is correlation only;
- [ ] stale observation basis can be preserved and rejected/reviewed;
- [ ] view/snapshot/watch remain renderer-independent;
- [ ] Runtime Host Binding is not presentation host authority.

### 12.5 External authority

- [ ] dispatch != external commit;
- [ ] unknown/ambiguous state is representable;
- [ ] ambiguous non-idempotent effect is not blindly retried;
- [ ] external authority identity is distinct from Runtime/provider/host identity.

### 12.6 Manifest

- [ ] composition metadata only;
- [ ] no fourth semantic pillar;
- [ ] no live instance-state leakage;
- [ ] no parallel DAC identity model;
- [ ] binding/activation evidence remains separate from Manifest definition.

### 12.7 Evidence

- [ ] exact DomainHarness base `7fdcde2...` verified;
- [ ] exact DAC baseline `9c3ef91...` / tree `44086af...` verified;
- [ ] required C02/C03/C07/C09/C11-C13/C16/C22-C23/C31-C33/C36-C38 mappings verified;
- [ ] exact candidate HEAD pinned before review starts.

---

## 13. Gate after this candidate

No implementation work is unlocked by authoring this file.

```text
A2 Product/L2 candidate
  -> exact candidate HEAD
  -> Fresh Independent Architecture Review
  -> PASS only
  -> focused implementation Task DAG
  -> JIT exact-base implementation branch(es)
```

If review is not PASS, repair occurs on the documentation candidate, a new exact HEAD is pinned, and Fresh Independent Architecture Review is repeated. Implementation remains blocked.
