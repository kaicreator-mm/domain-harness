# DomainHarness Post-v0.4 Successor L2 Architecture — Review Candidate

**Project:** DomainHarness  
**Status:** REVIEW CANDIDATE — NOT FROZEN  
**Issue:** #424  
**Baseline:** `main@22c8b4b136ed9bfe03e6099e8b04f68fe849d198`  
**Baseline tree:** `0523325e321ed65e4772fcf6c8ef6b44e3c60fb8`  
**Released v0.4 baseline:** `5cf7a8fc623651b8ced8b2152426a5568f75cba3` / same tree  
**Standard:** `4.0.0@1edaee9291e25b6dd99303493bed75132cb54881`  
**Successor release/version name:** UNSET  
**Review history:** PR #425 R1 `CHANGES_REQUESTED` / `5885474880`; R2 `CHANGES_REQUESTED` / `5885549492`; R3 PASS superseded by currentness comment `5885642452`; R4 `CHANGES_REQUESTED` / `5885723525`  

This document is a narrow post-v0.4 architecture candidate. It does not reopen the Frozen v0.2/v0.3 product model, does not create a successor release version, and does not authorize implementation tasks until a new exact-head adversarial review and repository gates pass.

---

# 1. Authority and Scope

Read this candidate together with:

- Frozen v0.2 PRD + L2 retained by v0.3;
- Frozen v0.3 PRD;
- Frozen v0.3 L2 Architecture Evidence + A1;
- formal v0.3 Task DAG and completed T-008/T-009/T-010/T-021 evidence;
- #422 R2 currentness correction `5885381720`;
- #423 R2 adversarial review `5885388617`;
- open gaps #178, #182 and narrowed #138;
- current compiled-package implementation contracts at the pinned baseline.

The reconciled authority is:

```text
PRODUCT_AMENDMENT_REQUIRED = NO
L2_AMENDMENT_REQUIRED      = YES
DAC_CONTRACT_CHANGE        = NO
```

Only two feature decision surfaces remain:

1. package/data integrity — #178 + #182;
2. durable workflow-send rejection — narrowed #138.

## 1.1 Already-frozen integration debt

The following semantics are already frozen and have production contract/core implementations:

- #177 host/local Domain Tool semantics — PRD §14.1 / L2 §16.1 / T-008;
- #137 normal domain rejection + command outcome — PRD §14.3 / L2 §16.3 / T-009;
- #180 idempotent provisioning — PRD §14.4 / L2 §16.4 / T-010.

Their current-main deficiencies are integration carryovers. This candidate SHALL NOT redesign those product semantics.

Historical optional ideas bundled into those issues are not implicitly authorized. In particular this candidate does not add automatic initial-state execution, terminal-address reuse, or workflow-triggered auto-provisioning.

## 1.2 Current compiled-artifact authority

Current production source establishes the legacy tuple:

```text
formatVersion         = '0.2'
runtimeContractMajor  = 2
executionEngineMajor  = 2
```

The current compiler emits exactly that tuple. Current `CompiledWorkflowIRV2` is the executable IR for engine major 2, and current Domain Message effects do not carry rejection routes.

The successor architecture SHALL preserve historical package identities exactly and SHALL NOT invent a parallel naming convention such as `target-domain-package/v2`.

## 1.3 DAC boundary

DAC v0.0.4.1 remains unchanged.

This candidate may add behaviorally relevant material to DomainHarness target-package identity, but SHALL preserve:

- exact package identity;
- non-torn `DomainActivationBinding` publication/consumption;
- exact currentness/pinning semantics;
- no package substitution merely because a newer compatible package exists;
- no transfer of selection, compatibility, activation, promotion or external-authority ownership into DomainHarness helpers.

---

# 2. Successor Compiled-Artifact Version Contract

## 2.1 Supported exact tuples

The successor Runtime SHALL support exactly these package/engine profiles for this lane:

```text
LEGACY_RETAINED
  formatVersion        = '0.2'
  runtimeContractMajor = 2
  executionEngineMajor = 2

SUCCESSOR
  formatVersion        = '0.3'
  runtimeContractMajor = 2
  executionEngineMajor = 3
```

Every other tuple fails closed.

`runtimeContractMajor` remains 2 because this amendment does not reopen the public Runtime/host contract major. The compiled package schema changes from `0.2` to `0.3`, and executable workflow semantics change from engine major 2 to engine major 3.

`formatVersion='0.3'` is a compiled-artifact schema identity, not a product release/version name.

## 2.2 Engine major 3

Engine-major-2 authority has no Domain Message rejection route. Required total rejection routing is therefore an incompatible executable-IR semantic and SHALL use engine major 3.

Conceptually:

```text
('0.2',2,2) -> CompiledWorkflowIRV2
('0.3',2,3) -> CompiledWorkflowIRV3
```

Engine major 3 retains unrelated engine-major-2 semantics unless this amendment explicitly changes them. This L2 authorizes only the new Domain Message rejection/result/route behavior described in §4.

No engine-major-2 package is reinterpreted as engine major 3.

## 2.3 Version-dispatched validation and decoding

Current validation accepts one expected tuple. Successor Runtime must coexist with retained legacy packages, so validation becomes exact-profile dispatch.

Conceptual contract:

```ts
interface CompiledArtifactProfile {
  formatVersion: '0.2' | '0.3';
  runtimeContractMajor: 2;
  executionEngineMajor: 2 | 3;
}

interface CompiledPackageValidationPolicy {
  supportedProfiles: readonly CompiledArtifactProfile[];
  hostCapabilities: readonly CapabilityId[];
  sha256: Sha256Port;
  targetProfileId?: string;
}
```

Normative dispatch:

```text
('0.2',2,2)
  -> legacy manifest validation
  -> historical packageId/canonicalization behavior
  -> CompiledWorkflowIRV2 decoder

('0.3',2,3)
  -> successor manifest/integrity validation
  -> successor packageId rules
  -> CompiledWorkflowIRV3 decoder

anything else
  -> incompatible / fail closed
```

Tuple dispatch occurs before feature-specific decoding. A package cannot claim format 0.2 while consuming successor semantics, or claim engine 2 while using engine-3 rejection routes.

## 2.4 Legacy identity preservation

- `('0.2',2,2)` retains historical package identity/canonicalization behavior exactly.
- `('0.3',2,3)` uses the successor identity rules in §3.
- Runtime never synthesizes a 0.3 identity from a 0.2 package.
- retained instance pins continue to resolve exact historical package bodies.

## 2.5 Shared foundation

One minimal `I-FMT-03` node SHALL precede both feature lanes. It owns only:

- `formatVersion='0.3'` discriminator;
- exact supported-profile tuple types;
- fail-closed profile dispatch;
- legacy `0.2/2/2` dispatch preservation;
- successor manifest/IR decoder extension points;
- engine-major-3 decoder scaffold;
- successor package identity dispatch scaffold.

`I-FMT-03` SHALL NOT implement Domain Data, Business Source, message rejection, Tool, provisioning or workflow feature semantics.

Partial PRs may add internal successor support behind this scaffold, but the public compiler SHALL NOT emit `('0.3',2,3)` until §3 and §4 semantics plus central assembly are complete.

---

# 3. L2-A — Package/Data Integrity

## 3.1 Preserved authority

The retained model remains:

```text
Target Compiled Domain Package
=
Compiled Domain Data
+ Compiled / Declared Domain Tools
+ Target Host Bindings
+ Package Identity / Compatibility Metadata
```

and:

```text
Domain Data
=
Domain Facts                    // current mutable authority stays outside DomainHarness
+
Compiled Domain Intelligence    // immutable/versioned package or registry content
```

This amendment closes the current contradiction where projections can name `domain-data` keys and external `business` sources without complete package declarations.

## 3.2 Successor manifest additions

Conceptual shape for `formatVersion='0.3'`:

```ts
interface CompiledDomainDataDescriptor {
  key: string;
  contentDigest: ContentDigest;
  valueSchema?: JsonSchema;
}

interface CompiledBusinessSourceDescriptor {
  source: string;
  valueSchema: JsonSchema;
  validatorBindingDigest?: ContentDigest;
}

interface PackageDataBounds {
  maxDomainDataEntries: number;
  maxDomainDataEntryCanonicalBytes: number;
  maxTotalDomainDataCanonicalBytes: number;
  maxBusinessSources: number;
  maxSchemaCanonicalBytes: number;
}

interface CompiledPackageManifest03 {
  formatVersion: '0.3';
  runtimeContractMajor: 2;
  executionEngineMajor: 3;
  schemaContractVersion: 'domainharness-json-schema/1';
  packageDataBounds: PackageDataBounds;
  domainData: readonly CompiledDomainDataDescriptor[];
  businessSources: readonly CompiledBusinessSourceDescriptor[];
  // retained manifest fields ...
}

interface TargetCompiledDomainPackage03 {
  manifest: CompiledPackageManifest03;
  bindings: TargetExecutableBindings;
  domainData: Readonly<Record<string, JsonValue>>;
}
```

Exact TypeScript names may normalize; logical fields/invariants are normative.

`schemaContractVersion` names the exact portable schema dialect/subset. Unsupported keywords or semantics fail compilation rather than being ignored.

## 3.3 Exact digest and package identity

Successor semantic material reuses the existing portable canonical identity seam:

```text
canonicalJsonStringify(value)
→ UTF-8
→ Sha256Port.digestUtf8(...)
→ ContentDigest
```

Equivalent repository contract: `computeCanonicalJsonDigest(value, sha256)`.

For Domain Data value `D`:

```text
contentDigest(D) = computeCanonicalJsonDigest(D, sha256)
```

For successor package identity:

```text
packageId03 = computeCanonicalJsonDigest(successorManifestWithoutPackageId, sha256)
```

This does not modify historical 0.2 package-id behavior.

Successor identity material includes:

- exact tuple `('0.3',2,3)`;
- `schemaContractVersion`;
- `packageDataBounds`;
- sorted Domain Data descriptors and content digests;
- any declared Domain Data schemas;
- sorted Business Source descriptors and canonical schemas;
- every present `validatorBindingDigest`;
- retained workflow/tool/projection/schema/binding semantic material and binding/content digests.

Current Business Snapshot values/revisions SHALL NOT enter package identity.

## 3.4 Package-owned Domain Data

Required invariants:

- key is non-empty and unique under exact compiler normalization;
- every bundled value has exactly one descriptor and vice versa;
- descriptor digest equals exact canonical digest of bundled JSON;
- runtime activation verifies descriptor/value integrity;
- runtime lookup is in-memory from the exact activated package;
- P1-pinned instances never read P2 data under the same logical key.

If `valueSchema` is present, compiler validates the bundled value against it.

## 3.5 Business Source declarations

Required invariants:

- `source` is non-empty and unique;
- `valueSchema` is mandatory and package identity material;
- declarations contain no current business values, credentials, connections, database handles or session state;
- current values/revisions remain application / Business Store / external SoR authority;
- changing schema changes successor package identity;
- changing current business values/revisions does not;
- if compiler emits executable validator material, exact `validatorBindingDigest` is package identity material and activation verifies it.

Provider contract remains logically:

```text
(packageId, source, selector)
→ { source, selector, revision, value }
```

## 3.6 Deterministic boundedness

Package-owned data/schemas are bounded compiler inputs.

Target Host Profile supplies exact `PackageDataBounds`; compiler records them in the successor manifest so selected bounds are package identity material.

Compile-time checks:

- Domain Data count <= `maxDomainDataEntries`;
- each canonical Domain Data value <= `maxDomainDataEntryCanonicalBytes`;
- aggregate canonical Domain Data <= `maxTotalDomainDataCanonicalBytes`;
- Business Source count <= `maxBusinessSources`;
- each canonical schema <= `maxSchemaCanonicalBytes`.

Exact numeric values are Target Host Profile decisions. Runtime activation verifies actual material against recorded bounds. A host with lower supported limits fails compatibility/activation rather than truncating.

## 3.7 Compiler dependency closure

Successor compilation rejects:

- undeclared/unbundled projection `domain-data` key;
- undeclared projection `business` source;
- orphaned/duplicate/ambiguous descriptor/value;
- missing/invalid/unsupported/over-bound Business Source schema;
- over-bound Domain Data;
- generated types that would silently widen unsupported schema semantics;
- emitted validator material without deterministic digest binding.

Statically knowable missing-key/source failures SHALL NOT be deferred to first runtime projection execution.

## 3.8 Runtime projection boundary

### Package-owned Domain Data

`CompiledDomainDataPort` remains a logical read seam, but successor production assembly derives it from the exact activated package. Arbitrary out-of-band host maps cannot claim successor integrity conformance.

```text
exact packageId + declared key
→ exact immutable package-owned JSON value
```

### External Business Snapshot

Before projection evaluation, Runtime validates returned business value against the exact schema pinned by the package.

Validation is mandatory. Hosts may cache validators by exact package/source/schema identity, but may not disable semantic validation.

Conforming implementations use one identity-safe mode:

**Mode A — portable schema interpretation**

- schema is interpreted under exact `schemaContractVersion`;
- host implementations may differ internally only if conformance proves identical semantics;
- portable core does not acquire mandatory Node-only dependencies.

**Mode B — compiler-emitted portable validator**

- validator executable material is emitted for the exact pinned schema contract;
- exact artifact digest is `validatorBindingDigest` and package identity material;
- activation verifies the artifact digest before execution;
- Node and Expo/Hermes must pass identical semantic fixtures.

A host cannot substitute an unbound validator with different semantics.

Schema violation is a structured provider-contract/runtime failure, never empty/stale substitution.

Retained revision rule remains:

```text
same source + selector + revision
=> semantically same snapshot value

changed snapshot value
=> provider exposes changed revision
```

If Runtime directly observes the same exact identity/revision returning conflicting canonical values within retained evidence/cache scope, it fails closed.

## 3.9 Generated typed contracts

Generated contracts SHALL include exact representable types for declared Domain Data and Business Source schemas used by public projection/provider surfaces.

If exact projection to the supported type system is impossible, generation fails closed for that typed surface rather than silently widening. Runtime schema validation remains authoritative.

---

# 4. L2-B — Durable Workflow-Send Rejection / Engine Major 3

## 4.1 Current contradiction

Current flow is:

```text
begin effect(status=started)
→ DomainMessageAcceptanceBoundary.accept(message)
→ complete effect with accepted ACK
```

Current target rejection throws. A rejection before effect completion can leave a `started` journal record whose retry observes changed target state.

Retained semantics require durable effect facts, normal rejection distinct from technical failure, deterministic replay after semantic commit, and no poisoning of a healthy source merely because the exact target rejects.

## 4.2 Engine-major-3 Domain Message IR

Successor `CompiledWorkflowIRV3` extends Domain Message effects with total rejection routing:

```ts
interface CompiledDomainMessageEffectV3 {
  kind: 'domain-message';
  targetExpression: string;
  messageType: string;
  payloadExpression?: string;
  contractVersion?: string;
  rejected: readonly CompiledRoute[];
}
```

Compiler/decoder rules:

- `rejected` is mandatory and non-empty;
- zero or more conditional routes may precede fallback;
- final route is unconditional, making rejection handling total;
- every route targets a declared state;
- invalid/non-total routing fails compile/activation;
- engine-major-2 definitions remain v2 IR and do not gain this field semantically.

## 4.3 Acceptance result contract

Target-level acceptance outcomes SHALL be typed:

```ts
type DomainMessageAcceptanceResult =
  | { disposition: 'accepted'; ack: MessageAcceptedAck }
  | { disposition: 'rejected'; rejection: DomainMessageAcceptanceRejection }
  | { disposition: 'transient_unavailable'; condition: DomainMessageAcceptanceTransientCondition };

type DomainMessageAcceptanceRejectionCode =
  | 'target_terminal'
  | 'workflow_not_found'
  | 'message_contract_not_found'
  | 'contract_version_mismatch'
  | 'payload_contract_violation';

type DomainMessageAcceptanceTransientCode =
  | 'target_not_found'
  | 'target_recovery_required';
```

Current generic `target_not_accepting` must be refined enough to distinguish terminal from recovery-required/transient inability.

Pinned-package corruption/missing, store invariant failure, malformed durable records, unknown Runtime/transport failure, and invalid source-effect construction remain technical/integrity failures.

## 4.4 Permanent vs transient

Permanent for the exact attempted child identity under current frozen invariants:

- existing target is terminal;
- workflow absent from target's exact pinned package;
- message contract absent from exact pinned workflow/package;
- requested contract version incompatible;
- payload violates exact pinned message contract.

`target_terminal` is permanent because current frozen semantics do not reuse/rebind the same exact WorkflowAddress after terminal completion/termination. Any future address-reuse feature must revisit this classification or add a stronger durable rejection receipt.

Transient/recovery-owned:

- `target_not_found` — separately authorized provisioning may create the address later;
- `target_recovery_required` — same target may recover later.

Transient retries reuse the same child message identity. Technical failures are never fabricated into semantic rejection.

## 4.5 Effect journal outcome

Terminal semantic outcome:

```ts
type DomainMessageEffectOutcome =
  | { status: 'accepted'; ack: MessageAcceptedAck }
  | { status: 'rejected'; rejection: DomainMessageAcceptanceRejection };
```

Both variants are stored under terminal `EffectJournalRecord.status='completed'` with structured output. Transient target conditions are not terminal semantic outcomes.

Journal identity remains bound to effect/source/state identity, derived child message id, resolved target, message type/version and payload identity.

Completed rejection replay returns the same rejection without re-consulting target acceptance. Conflicting terminal material fails closed.

## 4.6 Explicit total rejection routing

A permanent child-send rejection is a normal domain-level **effect result**, not implicitly the whole source-command result.

Execution semantics:

1. accepted send → durably complete accepted effect → child-accepted observation → continue old-state execution;
2. permanent rejection → durably complete rejected effect → select declared total `rejected` route → transition;
3. after rejection route selection, remaining old-state message effects and invoke path are not executed;
4. prior committed sibling effects remain committed/replayable;
5. transient target condition → no rejection route; existing retry/recovery ownership;
6. technical/integrity failure → no fabricated domain rejection.

There is no `no rejected route => reject whole source command` behavior because engine-major-3 compilation makes routing total.

T-009 remains source-command outcome authority. Final source outcome follows state/command resolution reached after explicit rejection routing; child rejection does not erase already committed work.

## 4.7 Replay and crash ordering

```text
begin effect
→ attempt target acceptance
→ accepted OR permanent-rejected semantic result
→ durably complete semantic effect result
→ only then allow rejection-route/source-state/command-outcome commit
```

- accepted target + crash before source effect completion → retry reuses derived child message id; duplicate ACK converges;
- permanent rejection + crash before source effect completion → retry may re-evaluate because no semantic fact was committed;
- permanent rejection after effect completion → replay exact rejection without target consultation;
- missing/recovery-required target → no permanent fact; later same child identity may legitimately become accepted;
- prior sibling effect already committed → remains committed across later child rejection/recovery.

## 4.8 No implicit provisioning

No `open-or-send`, `ensure-and-send` or automatic target creation is introduced.

T-010 provisioning remains separate. Workflow-triggered provisioning, if ever desired, requires a separate Product decision for authority, idempotency identity, package selection, initial input, failure handling and durable composition.

---

# 5. Migration and Coexistence

## 5.1 Runtime activation matrix

One Runtime may simultaneously contain:

- retained instances pinned to exact `('0.2',2,2)` packages;
- new instances pinned to exact `('0.3',2,3)` packages.

Each package is validated/decoded through the exact profile selected by its tuple. Runtime activation does not require all retained packages to share one tuple.

## 5.2 Compiler publication rule

Feature PRs may implement internal successor support incrementally, but public compiler continues emitting legacy `('0.2',2,2)` until:

- `I-FMT-03` exists;
- `I-PKG-DATA` and `I-BIZ-SRC` are complete;
- `I-MSG-REJECT` engine-3 semantics are complete;
- central `I-03-ASSEMBLY` proves one coherent successor artifact.

Only `I-03-ASSEMBLY` may switch public compiler emission to `('0.3',2,3)`.

## 5.3 Exact pin/currentness

- compatibility may authorize a successor package for **new selection** through existing authority only;
- compatibility never rewrites retained pins;
- 0.2 is never synthesized/reinterpreted as 0.3;
- 0.3 is never decoded as engine 2;
- manifest, Domain Data, schemas, validator material and bindings must all belong to one exact package identity;
- DAC currentness/activation evidence continues to carry one coherent exact package.

---

# 6. Failure Taxonomy

| Surface | Condition | Required disposition |
|---|---|---|
| package tuple | unsupported format/runtime/engine tuple | incompatible / fail closed |
| legacy package | 0.2 routed to successor canonicalizer/IR | forbidden / fail closed |
| successor package | 0.3 claims engine 2 | fail closed |
| package compile | undeclared Domain Data key | fail compile |
| package compile | undeclared Business Source | fail compile |
| package compile | invalid/duplicate/orphaned descriptor/schema | fail compile |
| package compile | data/schema exceeds recorded bounds | fail compile |
| package compile | emitted validator digest cannot be bound | fail compile |
| package activation | Domain Data/validator digest or bounds mismatch | fail activation |
| business snapshot | value violates pinned schema | provider-contract/runtime failure |
| business snapshot | same observed revision conflicts | provider-contract/runtime failure |
| engine-3 compile | rejection route absent/non-total | fail compile |
| child send | target terminal | durable semantic rejection |
| child send | exact workflow/message-contract/version/payload rejection | durable semantic rejection |
| child send | target missing | retry/provisioning-owned transient |
| child send | target recovery-required | retry/recovery-owned transient |
| child send | package/store invariant failure | technical/integrity failure |
| journal replay | completed rejection identity mismatch | fail closed journal invariant |

No technical failure is laundered into domain rejection and no transient condition is frozen into a permanent semantic fact.

---

# 7. DAC v0.0.4.1 Boundary Proof

This amendment changes DomainHarness compiled-package identity inputs, profile dispatch and executable workflow behavior only.

It does not change DAC ownership of:

- application identity;
- promotion/selection authority;
- compatibility authority;
- authority adoption/refusal;
- Runtime binding/activation authority boundaries.

For successor packages, exact 0.3 package id is carried by existing activation/binding paths.

The non-torn rule remains:

```text
selected/adopted exact package identity
+ exact tuple
+ exact package body/digests
+ exact Domain Data / schemas / validator material / bindings
+ exact activation/currentness evidence
```

must refer to one coherent exact package.

Legacy retained package validation remains isolated on historical identity semantics. Successor semantics never rewrite historical package ids.

`DAC_CONTRACT_CHANGE_REQUIRED = NO`.

---

# 8. Required Adversarial Review Vectors

The exact-head review SHALL attempt to falsify at least:

1. **Version currentness** — do source compiler/validator/IR facts really match `0.2/2/2`, and does successor require `0.3/2/3` rather than in-place reinterpretation?
2. **Legacy identity preservation** — can a 0.2 package be recomputed or decoded under 0.3 rules?
3. **Profile tear** — can tuple validation select one profile while decoder/canonicalizer uses another?
4. **Fact-authority theft** — can package declarations accidentally make current Business Facts package-owned?
5. **Identity omission** — can Domain Data/schema/validator behavior change without successor package id changing?
6. **Digest ambiguity** — can two supported hosts compute different digest material for the same semantic JSON?
7. **Bounds bypass** — can actual package data/schema exceed identity-bound limits after compilation?
8. **Retained-pin tear** — can a retained instance read newer package data/schema under an old pin?
9. **Schema divergence** — can Node and Expo validate the same declared schema differently while claiming conformance?
10. **Validator substitution** — can emitted executable validator bytes change without identity change?
11. **Static-gap deferral** — can undeclared key/source survive compilation?
12. **Absent-target race** — can `target_not_found` be frozen permanent and contradicted by later authorized provisioning?
13. **Rejection crash race** — can a committed permanent rejection later replay as accepted?
14. **Transient misclassification** — can recovery-required become permanent rejection?
15. **Technical-error laundering** — can package/store corruption become normal rejection?
16. **Partial-effect mislabel** — can a later rejected child effect erase/mislabel prior committed sibling effects?
17. **Unhandled rejection** — can a conforming engine-3 package omit total rejection routing?
18. **Implicit provisioning** — can send handling create a target without separately authorized provisioning?
19. **DAC drift** — do new package fields or profile dispatch confer selection/adoption/activation authority?
20. **DAG/write-set race** — can #178 and #138 independently redefine shared 0.3 format/decoder scaffolding?

P0/P1 findings block freeze.

---

# 9. Post-freeze Implementation Carryover / Proposed Task DAG

```text
NOT_AUTHORIZED_UNTIL_REVIEW_PASS_AND_EXACT_HEAD_REPOSITORY_GATE

                 I-FMT-03
                 /      \
                v        v
        I-PKG-DATA     I-MSG-REJECT
            |          ^
            v          |
        I-BIZ-SRC   I-REJECT (#137 integration debt)

I-LOCAL (#177 integration debt)     I-OPEN (#180 integration debt)
          \                |                /
           \               |               /
            +---------- I-03-ASSEMBLY -----+
                           |
             +-------------+-------------+
             v                           v
      Node host validation        Expo/Hermes validation
             \                           /
              +----------+--------------+
                         v
              cross-host / migration
                         v
                  Version Closure
```

Dependencies:

```text
I-FMT-03 -> I-PKG-DATA -> I-BIZ-SRC
I-FMT-03 + I-REJECT -> I-MSG-REJECT
I-FMT-03 + I-PKG-DATA + I-BIZ-SRC + I-MSG-REJECT
  + I-LOCAL + I-REJECT + I-OPEN
  -> I-03-ASSEMBLY
```

## 9.1 Node ownership

### I-FMT-03

Own only tuple/profile/version dispatch, legacy preservation, successor decoder/identity scaffolding. No feature semantics.

### I-PKG-DATA

Own #178 successor Domain Data descriptors/bundled content/digest/bounds/compiler dependency closure.

### I-BIZ-SRC

Depends on I-PKG-DATA. Own #182 Business Source declarations, portable schema contract, validator identity and runtime projection validation.

### I-REJECT

Existing #137 integration debt. Consume already-frozen T-009 normal-rejection semantics in actual production runtime entry path. No new Product/L2 decision.

### I-MSG-REJECT

Depends on I-FMT-03 + I-REJECT. Own narrowed #138 engine-3 typed acceptance, durable rejection outcome, total rejection routing, replay/crash semantics. No provisioning.

### I-LOCAL

Existing #177 integration debt. Consume T-008 host-local Tool contract/core in retained/production Runtime path.

### I-OPEN

Existing #180 integration debt. Consume T-010 idempotent provisioning contract/core in public Runtime path. No automatic initial-state or address-reuse expansion.

### I-03-ASSEMBLY

The only node allowed to publish coherent successor compiler/runtime assembly and switch public compiler output to `('0.3',2,3)`. Must not absorb new feature semantics.

## 9.2 One-concern / one-PR rule

Each node is one concern / one PR. Shared decoder/version files belong to I-FMT-03 or I-03-ASSEMBLY; feature PRs SHALL NOT independently redefine the tuple contract.

Implementation Issues are **not yet materialized or authorized** by this document alone.

---

# 10. Validation Ownership

This L2 draft/review is static GitHub work; no local Build Host is required.

Later implementation/release qualification must include:

- deterministic compiler/package identity and migration fixtures;
- focused profile-dispatch and corruption negatives;
- Node and Expo/Hermes equivalent schema-validation fixtures;
- real exact-package activation/currentness validation;
- real durable-store restart/crash-window validation for workflow-send rejection;
- cross-host `0.2/2/2` retained + `0.3/2/3` coexistence validation;
- packaging/installability and full repository regression at closure.

Mock/in-memory tests may prove deterministic contract logic but do not prove real restart durability.

---

# 11. Review / Freeze Rule

This document is not frozen merely because it is committed, reviewed on an older SHA, or has a PR.

Freeze requires all of:

```text
DOCUMENT_EXACT_HEAD = current PR HEAD
DOCUMENT_BLOB       = exact reviewed document blob
ADVERSARIAL_REVIEW  = PASS on that exact HEAD
P0                  = 0
P1                  = 0
REPOSITORY_GATE     = terminal PASS on the same exact HEAD (or explicit governance-authorized disposition)
PRODUCT_AMENDMENT_REQUIRED = NO confirmed
DAC_CONTRACT_CHANGE_REQUIRED = NO confirmed
```

Any document change supersedes older review/CI evidence.

Only after freeze record is written may the coordinator:

- materialize implementation Issues from §9;
- create a successor integration lane;
- choose/name a successor release version.

Until then:

```text
IMPLEMENTATION_ISSUES_AUTHORIZED = NO
SUCCESSOR_INTEGRATION_BRANCH     = NO
SUCCESSOR_RELEASE_VERSION        = UNSET
```
