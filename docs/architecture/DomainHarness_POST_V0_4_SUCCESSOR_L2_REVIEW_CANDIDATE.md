# DomainHarness Post-v0.4 Successor L2 Architecture — Review Candidate

**Project:** DomainHarness  
**Status:** REVIEW CANDIDATE — NOT FROZEN  
**Issue:** #424  
**Baseline:** `main@22c8b4b136ed9bfe03e6099e8b04f68fe849d198`  
**Baseline tree:** `0523325e321ed65e4772fcf6c8ef6b44e3c60fb8`  
**Released v0.4 baseline:** `5cf7a8fc623651b8ced8b2152426a5568f75cba3` / same tree  
**Standard:** `4.0.0@1edaee9291e25b6dd99303493bed75132cb54881`  
**Successor release/version name:** UNSET  
**Review history:** PR #425 R1 `CHANGES_REQUESTED` / `5885474880`; R2 `CHANGES_REQUESTED` / `5885549492`; R3 PASS superseded by currentness comment `5885642452`  

This document is a narrow post-v0.4 architecture candidate. It does not reopen the Frozen v0.2/v0.3 product model, does not create a successor release version, and does not authorize implementation tasks until adversarial review and repository gates pass.

---

# 1. Authority and Scope

Read this candidate together with:

- Frozen v0.2 PRD + L2 retained by v0.3;
- Frozen v0.3 PRD;
- Frozen v0.3 L2 Architecture Evidence + A1;
- the formal v0.3 Task DAG and completed T-008/T-009/T-010/T-021 evidence;
- #422 R2 currentness correction `5885381720`;
- #423 R2 adversarial review `5885388617`;
- open gaps #178, #182 and #138;
- current compiled-package implementation contracts at the pinned baseline.

The reviewed authority establishes:

```text
PRODUCT_AMENDMENT_REQUIRED = NO
L2_AMENDMENT_REQUIRED      = YES
DAC_CONTRACT_CHANGE        = NO
```

Only two feature decision surfaces remain:

1. package/data integrity — #178 + #182;
2. durable workflow-send rejection — narrowed #138.

## 1.1 Explicitly out of L2 decision scope

The following semantics are already frozen and already have production contract/core implementations:

- host/local Domain Tool semantics — PRD §14.1 / L2 §16.1 / T-008;
- normal domain rejection and first-class command outcome — PRD §14.3 / L2 §16.3 / T-009;
- idempotent instance provisioning — PRD §14.4 / L2 §16.4 / T-010.

Current-main deficiencies in #177/#137/#180 are integration carryovers. This candidate SHALL NOT redesign their product semantics.

Historical optional ideas bundled into those issues are not implicitly authorized here. In particular this document does not add automatic initial-state execution, terminal-address reuse, or workflow-triggered auto-provisioning.

## 1.2 Exact current compiled-artifact authority

Current production source establishes the legacy tuple:

```text
formatVersion         = '0.2'
runtimeContractMajor  = 2
executionEngineMajor  = 2
```

The compiler emits exactly that tuple. `CompiledWorkflowIRV2` is explicitly the executable IR for engine major 2. Runtime package validation currently equality-checks a package against one expected `(formatVersion, runtimeContractMajor, executionEngineMajor)` tuple.

The successor architecture SHALL preserve legacy package identities exactly and SHALL NOT invent a second naming convention such as `target-domain-package/v2`.

## 1.3 DAC boundary

DAC v0.0.4.1 remains unchanged.

This candidate may add behaviorally relevant material to DomainHarness target-package identity. It SHALL preserve:

- exact package identity;
- non-torn `DomainActivationBinding` publication/consumption;
- exact currentness/pinning semantics;
- no package substitution merely because a newer compatible package exists;
- no transfer of selection, compatibility, activation, promotion or external-authority ownership into DomainHarness package-data helpers.

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

Every other tuple fails closed as unsupported/incompatible.

`runtimeContractMajor` remains 2 because this amendment does not reopen the external Runtime/host contract major. The compiled package schema changes from `0.2` to `0.3`, and executable workflow semantics change from engine major 2 to engine major 3.

The successor release/version name remains independent and UNSET; `formatVersion='0.3'` is a compiled-artifact schema identity, not a release name.

## 2.2 Why engine major 3 is mandatory

Current engine-major-2 authority is `CompiledWorkflowIRV2`. Its `domain-message` effect contains target/type/payload/version fields only and has no rejection route. Current engine-2 decoding is therefore not authoritative for the new total rejection-routing semantics.

The successor executable IR SHALL be `CompiledWorkflowIRV3` (exact naming may normalize in code) and SHALL be selected only for `executionEngineMajor=3`.

Engine major 3 initially retains the supported invoke kinds and all unrelated engine-major-2 semantics unless this amendment explicitly changes them. The only newly authorized engine semantic in this L2 is the durable Domain Message rejection/result/route contract in §4.

No engine-major-2 package is reinterpreted as engine major 3.

## 2.3 Version-dispatched validation and decoding

Current `CompiledPackageValidationPolicy` accepts one expected tuple. The successor Runtime must activate retained legacy packages together with new packages, so validation becomes exact-profile dispatch rather than one global equality tuple.

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
('0.2', 2, 2)
  -> legacy manifest shape validation
  -> legacy packageId canonicalization/compatibility behavior
  -> CompiledWorkflowIRV2 decoder

('0.3', 2, 3)
  -> successor manifest shape validation
  -> successor packageId canonicalization/integrity rules
  -> CompiledWorkflowIRV3 decoder

anything else
  -> INCOMPATIBLE_PACKAGE / fail closed
```

The exact tuple is read from the package itself and matched against the supported profile set before feature-specific decoding. A package cannot claim format 0.2 while being decoded under successor semantics, or claim engine 2 while using engine-3 rejection routes.

## 2.4 Legacy identity preservation

Current v0.2 validation contains historical canonicalization behavior that is intentionally preserved for existing package ids. The successor path SHALL NOT recompute legacy package ids under the new canonicalization rules.

Therefore:

- `('0.2',2,2)` retains the existing legacy package identity algorithm byte/semantics exactly;
- `('0.3',2,3)` uses the shared canonical JSON / portable SHA-256 identity seam defined in §3;
- no migration process synthesizes a 0.3 package id from a 0.2 package at runtime;
- retained instance pins continue to resolve their exact historical package bodies.

## 2.5 Shared implementation foundation

One minimal `I-FMT-03` implementation node SHALL precede both feature lanes. It owns only:

- the `formatVersion='0.3'` discriminator;
- exact supported-profile tuple types and fail-closed version dispatch;
- v2 legacy dispatch preservation;
- v0.3 manifest/IR decoder extension points;
- the engine-major-3 decoder entry point/scaffold;
- successor package identity dispatch scaffold.

`I-FMT-03` SHALL NOT implement Domain Data, Business Source, message rejection, Tool, provisioning or workflow feature semantics.

Partial feature PRs may add internal successor support behind this scaffold, but the public compiler SHALL NOT emit the `('0.3',2,3)` successor tuple until the required L2-A and L2-B semantics and central assembly are complete. This prevents publication of a falsely complete successor artifact.

---

# 3. L2-A — Package/Data Integrity

## 3.1 Frozen authority to preserve

The retained product model already requires:

```text
Target Compiled Domain Package
=
Compiled Domain Data
+ Compiled / Declared Domain Tools
+ Target Host Bindings
+ Package Identity / Compatibility Metadata
```

Frozen v0.3 L2 further separates:

```text
Domain Data
=
Domain Facts                    // mutable/current authority stays outside DomainHarness
+
Compiled Domain Intelligence    // immutable/versioned package or registry content
```

Therefore this amendment does not create package-owned business facts. It closes a contract contradiction: current package contracts expose projection dependencies for package-owned `domain-data` and external `business` snapshots, while the manifest does not fully declare either dependency surface.

## 3.2 Normative successor manifest additions

Conceptual additions for `formatVersion='0.3'`:

```ts
interface CompiledDomainDataDescriptor {
  key: string;
  contentDigest: ContentDigest;
  valueSchema?: JsonSchema;
}

interface CompiledBusinessSourceDescriptor {
  source: string;
  valueSchema: JsonSchema;
  /** Present only when compiler emits executable portable validator material. */
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
  // retained manifest identity fields ...
  packageDataBounds: PackageDataBounds;
  domainData: readonly CompiledDomainDataDescriptor[];
  businessSources: readonly CompiledBusinessSourceDescriptor[];
}

interface TargetCompiledDomainPackage03 {
  manifest: CompiledPackageManifest03;
  bindings: TargetExecutableBindings;
  domainData: Readonly<Record<string, JsonValue>>;
}
```

Exact TypeScript naming may normalize during implementation, but the logical fields and invariants are normative.

`schemaContractVersion` names the exact portable DomainHarness schema dialect/subset. Version `domainharness-json-schema/1` is based on the supported DomainHarness subset of JSON Schema 2020-12. A schema using a keyword whose semantics are not supported by that exact version fails compilation rather than being silently ignored.

## 3.3 Exact digest and canonicalization contract

For successor package-owned semantic material this amendment reuses the existing portable v0.3 identity seam:

```text
canonicalJsonStringify(value)
→ UTF-8 text
→ Sha256Port.digestUtf8(...)
→ ContentDigest
```

Equivalent implementation contract: `computeCanonicalJsonDigest(value, sha256)` from `src/contracts/identity.ts`.

For a Domain Data value `D`:

```text
contentDigest(D)
=
computeCanonicalJsonDigest(D, sha256)
```

For the successor package id:

```text
packageId03
=
computeCanonicalJsonDigest(successorManifestWithoutPackageId, sha256)
```

This successor rule does not alter the legacy 0.2 package-id algorithm.

For 0.3, package identity material includes canonicalized:

- the exact successor tuple `('0.3',2,3)`;
- exact `schemaContractVersion`;
- `packageDataBounds`;
- Domain Data descriptors sorted by exact `key`;
- every Domain Data `contentDigest`;
- Business Source descriptors sorted by exact `source`, including canonical schemas;
- every present `validatorBindingDigest`;
- retained workflow/tool/projection/schema/binding semantic material and binding/content digests.

Current Business Snapshot values/revisions SHALL NOT be included.

Changing behaviorally relevant Domain Data bytes, schema semantics, a Business Source schema, or compiler-emitted validator executable material therefore changes successor package identity. Authoring/file enumeration order does not.

## 3.4 Package-owned Domain Data

Each `domainData` entry identifies one immutable JSON value bundled in the generated target package.

Required invariants:

- `key` is non-empty and unique within the package;
- every bundled key has exactly one descriptor;
- every descriptor has exactly one bundled value;
- descriptor `contentDigest` exactly matches `computeCanonicalJsonDigest(value, sha256)`;
- descriptor order does not affect semantic identity;
- duplicate exact/normalized keys fail compilation;
- runtime activation recomputes/verifies descriptor/value integrity before the package is admitted;
- runtime lookup is an in-memory read of the activated package, never external I/O;
- an instance pinned to package P1 never reads P2 Domain Data for the same logical key.

If `valueSchema` is declared, the compiler SHALL validate the bundled value against it. Generated contract tooling MAY project a TypeScript type only where the schema can be represented without widening its semantics.

## 3.5 Business Source declarations

`businessSources` declares the external snapshot contract that a projection is allowed to request. It does not move business-data ownership into the package.

Required invariants:

- `source` is non-empty and unique within the package;
- `valueSchema` is mandatory and package identity material;
- declaration contains no current business value, credential, connection, database handle or session state;
- current business values and revisions remain application/Business SoR authority;
- changing a source schema changes successor package identity;
- changing a current business value/revision does not change package identity;
- when `validatorBindingDigest` is present, exact compiler-emitted executable validator material MUST match it and it is package identity material.

Provider contract remains logically:

```text
(packageId, source, selector)
→ { source, selector, revision, value }
```

with existing identity-echo/revision rules plus the schema rule below.

## 3.6 Deterministic boundedness

Package-owned data and schemas are bounded compiler inputs, not an unbounded runtime ingestion surface.

The Target Host Profile SHALL provide exact `PackageDataBounds` used for compilation. The compiler records those bounds in the successor manifest, making the selected bounds package identity material.

Required compile-time checks:

- Domain Data entry count <= `maxDomainDataEntries`;
- each canonical Domain Data value byte length <= `maxDomainDataEntryCanonicalBytes`;
- aggregate canonical Domain Data byte length <= `maxTotalDomainDataCanonicalBytes`;
- Business Source count <= `maxBusinessSources`;
- each canonical schema byte length <= `maxSchemaCanonicalBytes`.

Exact numerical values are Target Host Profile decisions, not global Product constants. A profile id/bounds pair is immutable for one compiled package identity; compiler cannot silently raise limits under the same identity.

Runtime activation SHALL recompute enough canonical sizes/identity material to reject corrupt packages whose actual bundled material violates recorded bounds. A host whose supported activation limits are lower than package requirements fails compatibility/activation; it does not truncate material.

## 3.7 Compiler dependency closure

Successor compilation SHALL reject when:

- projection references `{kind:'domain-data', key}` and key is undeclared/unbundled;
- projection references `{kind:'business', source}` and source is undeclared;
- Domain Data descriptor/value is orphaned/duplicated/ambiguous;
- Business Source schema is missing, invalid, unsupported or over bounds;
- Domain Data exceeds target-profile bounds;
- generated types would silently widen an unsupported schema;
- compiler-emitted validator material cannot be deterministically digested/bound.

No statically knowable undeclared Domain Data/Business Source error may be deferred to first projection execution.

## 3.8 Runtime projection boundary

### 3.8.1 Package-owned Domain Data

`CompiledDomainDataPort` remains a logical seam, but successor production assembly SHALL derive/bind it from the exact activated successor package. An arbitrary host-supplied out-of-band map cannot claim package-integrity conformance.

Lookup remains:

```text
exact packageId + declared key
→ immutable package-owned JSON value
```

### 3.8.2 External Business Snapshot

Before a Business Snapshot reaches projection evaluation, Runtime SHALL validate its value against the exact source schema pinned by the package.

This check is mandatory for successor conformance. Hosts MAY cache validators keyed by exact package/source/schema identity; they SHALL NOT disable validation and claim conformance.

Validation SHALL use exactly one identity-safe portable mode:

**Mode A — portable schema interpreter**

- Runtime evaluates pinned schema under exact `schemaContractVersion`;
- implementation may differ internally by host only if conformance proves identical semantics;
- portable core SHALL NOT acquire a mandatory Node-only dependency.

**Mode B — compiler-emitted portable validator artifact**

- compiler emits portable executable validator for the exact pinned schema contract;
- exact content digest is `validatorBindingDigest` and package identity material;
- activation verifies artifact digest before execution;
- Node and Expo/Hermes execute semantically equivalent validator material and pass the same fixtures.

A host SHALL NOT switch to an unbound validator with different semantics. Unsupported schema semantics fail compilation.

Schema failure is a structured fail-closed Runtime/provider-contract failure, never an empty/stale value substitution.

Runtime cannot prove a provider's global revision discipline from one read, but SHALL preserve:

```text
same source + selector + revision
=> semantically same snapshot value

changed snapshot value
=> provider must expose a changed revision
```

If Runtime directly observes one exact source/selector/revision returning conflicting canonical values within its retained evidence/cache boundary, it MUST fail closed as provider-contract violation.

## 3.9 Generated typed contracts

Generated App contracts SHALL include representable types for:

- declared package-owned Domain Data values used by public view/projection contracts;
- declared Business Source values used by generated integration/provider contracts.

Generation remains fail-closed for schemas that cannot be projected exactly. Runtime schema validation remains authoritative even when TypeScript types are generated.

---

# 4. L2-B — Durable Workflow-Send Rejection / Engine Major 3

## 4.1 Current contradiction

Current `JournaledDomainMessageEffect` follows:

```text
begin effect(status=started)
→ target acceptance.accept(message)
→ complete effect with accepted ACK
```

`DomainMessageAcceptanceBoundary.accept()` reports target rejection by throwing `MessageAcceptanceError`. Rejection before terminal effect completion may leave a `started` effect whose retry outcome depends on later target state.

Retained semantics require:

- workflow-to-workflow messages are durable Runtime effects;
- normal domain rejection is distinct from technical failure;
- committed semantic results replay deterministically;
- healthy source instance is not poisoned merely because target validly rejects.

## 4.2 Engine-major-3 IR extension

Successor `CompiledWorkflowIRV3` keeps engine-major-2 unrelated semantics and adds an authoritative total rejection route to each compiled Domain Message effect.

Conceptual shape:

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

Compiler/decoder rules for engine major 3:

- `rejected` is mandatory for each Domain Message effect;
- it is non-empty;
- final route is unconditional, making handling total;
- routes target declared workflow states;
- invalid/empty/non-total rejection routing fails compilation/activation;
- engine-major-2 definitions remain decoded only by `CompiledWorkflowIRV2` and do not gain this field semantically.

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

Existing `target_not_accepting` MUST be refined enough to distinguish terminal from recovery-required/transient inability.

Technical/integrity failures remain distinct:

- pinned package missing/corrupt;
- store invariant violation;
- malformed persisted journal/acceptance data;
- unknown Runtime/transport failure;
- invalid source effect construction.

## 4.4 Permanent vs transient classification

Permanent for the exact attempted child identity under current frozen invariants:

- target terminal;
- workflow absent from target's exact pinned package;
- message contract absent from exact pinned workflow/package;
- incompatible requested contract version;
- payload violates exact pinned message contract.

`target_terminal` is permanent because current frozen instance semantics do not rebind/reuse the same exact `WorkflowAddress` after terminal completion/termination. Future address reuse requires a new Product/L2 decision and reclassification or stronger rejection receipt.

Transient/recovery-owned:

- `target_not_found` — explicit provisioning may later create address;
- `target_recovery_required` — target may recover.

Retry for transient conditions SHALL reuse the same child message identity. Technical failures are never fabricated into semantic rejection.

## 4.5 Effect journal result

Terminal Domain Message effect result:

```ts
type DomainMessageEffectOutcome =
  | { status: 'accepted'; ack: MessageAcceptedAck }
  | { status: 'rejected'; rejection: DomainMessageAcceptanceRejection };
```

Both variants are stored under terminal `EffectJournalRecord.status='completed'` with structured durable output. Transient target conditions are not completed semantic outcomes.

Journal identity remains bound to:

- effect id;
- source workflow address;
- source message id;
- state/effect execution identity;
- exact child `messageId` derived from effect identity;
- resolved target;
- message type/contract version/payload identity.

Replay of completed rejection returns same rejection without target acceptance call. Conflicting completed record fails closed.

## 4.6 Explicit total rejection routing

A permanent child-send rejection is normal domain-level effect result, not Runtime crash, and MUST NOT be implicitly converted into whole-source-command rejection after prior effects may have committed.

Execution semantics:

1. accepted child send → durably complete accepted effect → child-accepted notification → continue old state's normal execution;
2. permanent rejection → durably complete rejection → select declared total `rejected` route → transition;
3. after rejection route selection, remaining old-state message effects and invoke path are not executed;
4. prior committed effects remain committed and replay from journals;
5. transient target condition → no rejection route; retry/recovery ownership;
6. technical/integrity failure → no fabricated domain rejection; existing fail-closed recovery/failure semantics.

There is no default `no rejected route => reject whole source command` behavior because engine-major-3 IR makes rejection routing total at compile time.

T-009 remains source-command outcome authority. Final source command outcome follows the state/command resolution reached after explicit rejection routing; child rejection does not erase already committed work.

## 4.7 Replay / crash ordering

Required ordering:

```text
begin effect
→ attempt target acceptance
→ accepted OR permanent-rejected semantic result
→ durably complete effect result
→ only then allow rejection-route/source-state/command-outcome commit
```

Crash after target acceptance before effect completion reuses idempotent child `messageId`; duplicate acceptance is safe.

Crash after permanent rejection completion replays rejection without target re-consultation.

Missing/recovery-required target is transient, so recovery may retry same child identity.

Crash after a prior sibling effect committed preserves that fact; explicit rejection route prevents false claims that earlier work did not happen.

## 4.8 No implicit provisioning

This amendment creates no `open-or-send`, `ensure-and-send` or automatic target creation.

T-010 provisioning remains separate explicit Runtime capability. Future workflow-triggered provisioning requires its own Product decision covering authority, idempotency key, package selection, initial input, failure handling and durable composition.

---

# 5. Migration / Coexistence Rules

## 5.1 Runtime activation matrix

One Runtime may have simultaneously:

- retained instances pinned to exact `('0.2',2,2)` packages;
- new instances pinned to exact `('0.3',2,3)` packages.

Activation preflight SHALL validate each package through the decoder/canonicalization path selected by its exact tuple. A single Runtime activation does not require all retained packages to share one format/engine tuple.

## 5.2 Compiler publication rule

Feature PRs may implement internal 0.3/engine-3 support incrementally, but the public compiler SHALL continue emitting legacy `('0.2',2,2)` until:

- `I-FMT-03` tuple/decoder/identity dispatch exists;
- `I-PKG-DATA` and `I-BIZ-SRC` are complete;
- `I-MSG-REJECT` engine-3 rejection semantics are complete;
- central `I-03-ASSEMBLY` verifies the exact successor manifest/IR as one coherent artifact.

Only `I-03-ASSEMBLY` may switch the public compiler emission path to successor `('0.3',2,3)`.

This preserves main-branch safety and one-concern PR boundaries.

## 5.3 Package selection/currentness

Compatibility metadata may describe behavioral compatibility for **new selection**, but:

- compatibility never rewrites a retained instance pin;
- 0.2 package is never synthesized/reinterpreted as 0.3;
- 0.3 package is never decoded as engine 2;
- package body/Domain Data/schemas/validator material/bindings must all belong to one exact package identity;
- DAC activation/currentness continues to carry one coherent exact package identity.

---

# 6. Failure Taxonomy

| Surface | Condition | Required disposition |
|---|---|---|
| package tuple | unsupported format/runtime/engine tuple | incompatible / fail closed |
| legacy package | 0.2 package routed to successor canonicalizer/IR | fail closed; forbidden dispatch |
| successor package | 0.3 package claims engine 2 | fail closed |
| package compile | undeclared Domain Data key | fail compile |
| package compile | undeclared Business Source | fail compile |
| package compile | unsupported/invalid/duplicate descriptor/schema | fail compile |
| package compile | data/schema exceeds target bounds | fail compile |
| package compile | emitted validator digest cannot be bound | fail compile |
| package activation | Domain Data/validator digest/size/bounds mismatch | fail activation |
| business snapshot | value violates pinned schema | provider-contract/runtime failure |
| business snapshot | same observed revision returns conflicting value | provider-contract/runtime failure |
| engine-3 compile | rejection route absent/non-total | fail compile |
| child send | target terminal | durable semantic rejection |
| child send | workflow/message-contract/version/payload rejection | durable semantic rejection |
| child send | target missing | retry/recovery-owned transient condition |
| child send | target recovery-required | retry/recovery-owned transient condition |
| child send | pinned package/store invariant failure | technical/integrity failure |
| journal replay | completed rejection identity mismatch | fail closed journal invariant |

No failure class is silently downgraded to success and no technical failure is laundered into domain rejection.

---

# 7. DAC v0.0.4.1 Boundary Proof

This amendment changes DomainHarness compiled package identity inputs, validator dispatch and executable workflow behavior only.

It does not change DAC ownership of:

- application identity;
- promotion/selection authority;
- compatibility authority;
- authority adoption/refusal;
- Runtime binding/activation authority boundaries.

For successor packages, the exact 0.3 package id becomes the package identity carried by existing activation/binding paths.

The non-torn rule remains:

```text
selected/adopted exact package identity
+ exact tuple
+ exact package body/digests
+ exact Domain Data / schemas / validator material / bindings
+ activation binding/currentness evidence
```

must refer to one coherent exact package.

Legacy retained package validation remains isolated on its historical identity path; successor semantics never rewrite historical package ids.

`DAC_CONTRACT_CHANGE_REQUIRED = NO`.

---

# 8. Adversarial Review Vectors

Review SHALL attempt to falsify at least:

1. **Version reinterpretation** — can a 0.2 package be decoded under successor semantics?
2. **Engine-major laundering** — can rejection routes appear under engine major 2 or be ignored by V2 decoder?
3. **Mixed retained activation** — can 0.2 retained pins and 0.3 new packages coexist without one global tuple rejecting one side?
4. **Legacy identity drift** — does successor canonicalization change historical package ids?
5. **Fact-authority theft** — can declarations make current Business Facts package-owned?
6. **Identity omission** — can Domain Data/schema/validator behavior change without successor package id changing?
7. **Order instability** — can file/enumeration order change successor identity?
8. **Retained-pin tear** — can retained instance read newer package data/schema/validator under old pin?
9. **Schema-version ambiguity** — can validation run without exact schemaContractVersion?
10. **Schema bypass** — can Business Snapshot reach projection without validation?
11. **Validator substitution** — can executable validator material change without exact identity change?
12. **Portable validator drift** — can Node/Expo accept different values for same pinned schema?
13. **Resource exhaustion** — can package data/schema bypass target bounds?
14. **Static gap deferral** — can undeclared key/source survive compilation?
15. **Format ownership race** — can #178/#138 independently redefine successor tuple/decoder?
16. **Premature compiler publication** — can partial 0.3 semantics be emitted before central assembly?
17. **Rejection timing race** — can permanent rejection remain started and later replay accepted?
18. **Missing-target race** — can absent target be frozen permanent before later provisioning?
19. **Transient misclassification** — can recovery-required be frozen permanent?
20. **Technical-error laundering** — can corruption become normal domain rejection?
21. **Source poisoning** — does valid target rejection force healthy source into recovery_required?
22. **Blind retry** — can completed rejection call acceptance twice?
23. **Partial-effect misreporting** — can prior committed effects be erased/mislabeled?
24. **Rejection-route hole** — can conditional routes all miss?
25. **Implicit provisioning** — can send handling create target without explicit provisioning authority?
26. **DAC authority drift** — do manifest fields/version dispatch confer selection/activation authority?
27. **Terminal-address future drift** — would future address reuse invalidate permanence without new decision?

P0/P1 findings block freeze.

---

# 9. Review Finding Reconciliation

## 9.1 R1 — `5885474880`

| Finding | Resolution |
|---|---|
| target_not_found timing race | transient/recovery-owned; no permanent receipt fabricated |
| implicit whole-turn rejection | removed; engine 3 requires total explicit rejection routing |
| digest under-specified | existing canonical JSON / portable SHA-256 seam |
| portable validation boundary | mandatory portable semantics + Node/Expo parity |
| data/schema bounds | Target Host Profile bounds + compile/activation checks |

## 9.2 R2 — `5885549492`

| Finding | Resolution |
|---|---|
| shared successor format dependency | one shared foundation, now corrected to `I-FMT-03` |
| implicit schema contract version | explicit `schemaContractVersion` identity field |
| emitted validator integrity | exact `validatorBindingDigest`, identity-bound and activation-verified |

## 9.3 R3 currentness supersession — `5885642452`

| Finding | Resolution |
|---|---|
| invented `target-domain-package/v3` convention | aligned successor format to repository convention `formatVersion='0.3'`; legacy remains exact `'0.2'` |
| new rejection semantics hidden inside engine major 2 | successor tuple requires `executionEngineMajor=3`; engine-2 IR remains legacy-only |
| single validation tuple cannot preserve retained migration | successor policy is exact supported-profile dispatch over legacy `('0.2',2,2)` and successor `('0.3',2,3)` |

---

# 10. Post-freeze Implementation Carryover Map

The following DAG is a proposal only:

```text
NOT_AUTHORIZED_UNTIL_THIS L2 REVIEW PASSES

I-FMT-03
  exact tuple/profile dispatch
  legacy 0.2 identity preservation
  successor 0.3 identity/decoder scaffolding
  engine-3 decoder entry scaffold
      │
      ├──────────────────────────────┐
      ▼                              ▼
I-PKG-DATA #178                  I-REJECT #137
      │                         existing T-009 integration debt
      ▼                              │
I-BIZ-SRC #182                    │
      │                            ▼
      │                       I-MSG-REJECT #138
      │                       (also depends I-FMT-03)
      └──────────────┬─────────────┘
                     ▼
               I-03-ASSEMBLY
        enable public compiler emission
        of exact ('0.3',2,3) only here

Parallel already-frozen integration debt after materialization:
  I-LOCAL #177 retained Runtime host-local Tool wiring
  I-OPEN  #180 DomainRuntime open/ensure integration

All implementation nodes
      ↓
central Runtime/public reconciliation
      ↓
Node + Expo real-host validation
      ↓
package/migration/cross-host validation
      ↓
Version Closure
```

Dependency form:

```text
I-FMT-03 -> I-PKG-DATA -> I-BIZ-SRC
I-FMT-03 + I-REJECT -> I-MSG-REJECT
I-BIZ-SRC + I-MSG-REJECT -> I-03-ASSEMBLY
I-LOCAL || I-REJECT || I-OPEN may execute in parallel after task materialization
```

`I-FMT-03` owns only exact version/identity/decoder dispatch scaffolding. `I-03-ASSEMBLY` is the only node authorized to switch public compiler output from legacy tuple to successor tuple.

`I-LOCAL`, `I-REJECT`, `I-OPEN` do not require new Product/L2 authority; their L3 must cite T-008/T-009/T-010 and prove production entry points consume those existing contracts.

Exact one-concern implementation Issues may be materialized only after adversarial review/freeze of this document and exact-head repository gate PASS.

---

# 11. Review / Freeze Rule

This document is not frozen merely because it is committed or has a PR.

Freeze requires:

- exact-head adversarial review;
- P0=0 and P1=0;
- explicit reconciliation of every review finding;
- exact document commit/blob identity;
- exact-head repository gate PASS;
- confirmation Product amendment remains unnecessary;
- confirmation DAC contract change remains unnecessary.

Only then may coordinator create implementation Issues or name/freeze a successor release lane.
