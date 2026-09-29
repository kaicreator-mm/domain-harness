# DomainHarness Post-v0.4 Successor L2 Architecture — Review Candidate

**Project:** DomainHarness  
**Status:** REVIEW CANDIDATE — NOT FROZEN  
**Issue:** #424  
**Baseline:** `main@22c8b4b136ed9bfe03e6099e8b04f68fe849d198`  
**Baseline tree:** `0523325e321ed65e4772fcf6c8ef6b44e3c60fb8`  
**Released v0.4 baseline:** `5cf7a8fc623651b8ced8b2152426a5568f75cba3` / same tree  
**Standard:** `4.0.0@1edaee9291e25b6dd99303493bed75132cb54881`  
**Successor version name:** UNSET  

This document is a narrow post-v0.4 architecture candidate. It does not reopen the Frozen v0.2/v0.3 product model, does not create a successor version, and does not authorize implementation tasks until adversarial review passes.

---

## 1. Authority and Scope

Read this candidate together with:

- Frozen v0.2 PRD + L2 retained by v0.3;
- Frozen v0.3 PRD;
- Frozen v0.3 L2 Architecture Evidence + A1;
- the formal v0.3 Task DAG and completed T-008/T-009/T-010/T-021 evidence;
- #422 R2 currentness correction `5885381720`;
- #423 R2 adversarial review `5885388617`;
- open gaps #178, #182 and #138.

The review established:

```text
PRODUCT_AMENDMENT_REQUIRED = NO
L2_AMENDMENT_REQUIRED      = YES
DAC_CONTRACT_CHANGE        = NO
```

Only two L2 decision surfaces remain:

1. package/data integrity — #178 + #182;
2. durable workflow-send rejection — narrowed #138.

### 1.1 Explicitly out of L2 decision scope

The following semantics are already frozen and already have production contract/core implementations:

- host/local Domain Tool semantics — PRD §14.1 / L2 §16.1 / T-008;
- normal domain rejection and first-class command outcome — PRD §14.3 / L2 §16.3 / T-009;
- idempotent instance provisioning — PRD §14.4 / L2 §16.4 / T-010.

Current-main deficiencies in #177/#137/#180 are integration carryovers. This candidate SHALL NOT redesign their product semantics.

### 1.2 DAC boundary

DAC v0.0.4.1 remains unchanged.

This candidate may add behaviorally relevant material to DomainHarness target-package identity. It SHALL preserve:

- exact package identity;
- non-torn `DomainActivationBinding` publication/consumption;
- exact currentness/pinning semantics;
- no package substitution merely because a newer compatible package exists;
- no transfer of selection, compatibility, activation, promotion or external-authority ownership into DomainHarness package-data helpers.

---

# 2. L2-A — Package/Data Integrity

## 2.1 Frozen authority to preserve

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

Therefore this amendment does not create package-owned business facts. It closes an implementation/contract contradiction: current package contracts expose projection dependencies for package-owned `domain-data` and external `business` snapshots, while the manifest does not fully declare either dependency surface.

## 2.2 Successor target-package format

A package that uses this L2 contract SHALL use a new manifest format identity:

```text
target-domain-package/v3
```

`target-domain-package/v2` is not reinterpreted as v3 merely because it is loaded by a newer Runtime.

A Runtime MAY retain support for v2 packages for retained instances and migration compatibility, but v2 packages do not acquire v3 package/data-integrity guarantees.

New compiler output implementing this amendment SHALL emit v3.

## 2.3 Normative package contract

Conceptual contract:

```ts
interface CompiledDomainDataDescriptor {
  key: string;
  contentDigest: string;
  valueSchema?: JsonSchema;
}

interface CompiledBusinessSourceDescriptor {
  source: string;
  valueSchema: JsonSchema;
}

interface CompiledPackageManifestV3 {
  formatVersion: 'target-domain-package/v3';
  // retained manifest identity fields ...
  domainData: readonly CompiledDomainDataDescriptor[];
  businessSources: readonly CompiledBusinessSourceDescriptor[];
}

interface TargetCompiledDomainPackageV3 {
  manifest: CompiledPackageManifestV3;
  bindings: TargetExecutableBindings;
  domainData: Readonly<Record<string, JsonValue>>;
}
```

Exact TypeScript naming may be normalized during implementation, but the logical fields and invariants are normative.

### 2.3.1 Package-owned Domain Data

Each `domainData` entry identifies one immutable JSON value bundled in the generated target package.

Required invariants:

- `key` is non-empty and unique within the package;
- every bundled key has exactly one descriptor;
- every descriptor has exactly one bundled value;
- `contentDigest` is the canonical content digest of the bundled JSON value;
- descriptor order does not affect semantic identity;
- duplicate normalized keys fail compilation;
- runtime activation recomputes/verifies descriptor/value integrity before the package is admitted;
- runtime lookup is an in-memory read of the activated package, never external I/O;
- an instance pinned to package P1 never reads P2 Domain Data for the same logical key.

If `valueSchema` is declared, the compiler SHALL validate the bundled value against it. Generated contract tooling MAY project a TypeScript type only where the schema can be represented without widening its semantics.

### 2.3.2 Business Source declarations

`businessSources` declares the external snapshot contract that a projection is allowed to request. It does not move business-data ownership into the package.

Required invariants:

- `source` is non-empty and unique within the package;
- `valueSchema` is mandatory and is package identity material;
- the source declaration contains no current business value, credential, connection, database handle or session state;
- current business values and revisions remain application/Business SoR authority;
- changing a source schema changes target-package semantic identity;
- changing a current business value/revision does not change package identity.

The provider contract remains logically:

```text
(packageId, source, selector)
→ { source, selector, revision, value }
```

with the existing identity-echo/revision rules plus the new schema rule below.

## 2.4 Canonical identity and `packageId`

For v3, package identity material SHALL include canonicalized:

- the existing manifest semantic fields;
- sorted Domain Data descriptors;
- each Domain Data `contentDigest`;
- sorted Business Source descriptors and their schemas;
- retained binding/content digests.

The actual current Business Snapshot values/revisions SHALL NOT be included.

Canonicalization rules SHALL be deterministic and independent of authoring/file enumeration order.

A descriptor digest mismatch, missing bundled value, duplicate key/source, unsupported schema or non-canonical identity material fails closed before activation.

## 2.5 Compiler dependency closure

The compiler SHALL reject a target package when:

- a projection references `{kind:'domain-data', key}` and `key` is not declared/bundled;
- a projection references `{kind:'business', source}` and `source` is not declared;
- a Domain Data descriptor/value pair is orphaned or duplicated in a way that makes identity ambiguous;
- a required Business Source schema is missing or invalid;
- generated types would silently widen an unsupported schema where exactness is required.

No `domain_data_not_found` or undeclared business-source error that is statically knowable from the Raw Package may be deferred to first runtime projection execution.

## 2.6 Runtime projection boundary

### Package-owned Domain Data

`CompiledDomainDataPort` remains a useful logical seam, but production assembly SHALL derive/bind it from the exact activated target-package module. A host-supplied arbitrary out-of-band map cannot claim package-integrity conformance.

Lookup remains:

```text
exact packageId + declared key
→ immutable package-owned JSON value
```

### External Business Snapshot

Before a Business Snapshot value reaches projection evaluation, Runtime SHALL validate it against the exact source schema pinned by the projection's package.

This semantic check is mandatory for conformance. Hosts MAY optimize by caching compiled validators keyed by exact package/source/schema identity; they SHALL NOT disable validation and still claim this L2 contract.

Schema failure is a structured fail-closed Runtime/provider-contract failure. It is not coerced into an empty value or stale prior snapshot.

The Runtime cannot prove a provider's global revision discipline from one read. It SHALL nevertheless preserve the contract:

```text
same source + selector + revision
=> semantically same snapshot value

changed snapshot value
=> provider must expose a changed revision
```

If Runtime directly observes the same exact identity/revision returning conflicting canonical values within its retained evidence/cache boundary, it MUST fail closed as a provider contract violation.

## 2.7 Generated typed contracts

Generated App contracts SHALL include representable types for:

- declared package-owned Domain Data values used by public view/projection contracts;
- declared Business Source values used by generated integration/provider contracts.

Generation remains fail-closed for schemas that cannot be projected exactly under the generator's supported type system. Runtime schema validation remains authoritative even when a TypeScript type is generated.

## 2.8 Compatibility / migration

- Existing v2 package ids remain exact historical identities.
- v3 compilation produces a new package id because the new declaration/content material is behaviorally relevant.
- Retained instances continue to execute against their exact pinned package.
- Activation may support v2 and v3 concurrently during migration.
- Compatibility metadata may state that a v3 package is behaviorally compatible for **new selection**, but compatibility never rewrites a retained instance pin.
- A v2 package cannot be synthesized into a v3 identity at runtime.

---

# 3. L2-B — Durable Workflow-Send Rejection

## 3.1 Current contradiction

Current `JournaledDomainMessageEffect` follows this shape:

```text
begin effect(status=started)
→ target acceptance.accept(message)
→ complete effect with accepted ACK
```

`DomainMessageAcceptanceBoundary.accept()` currently reports normal target rejection by throwing `MessageAcceptanceError`. Because acceptance happens before a terminal rejection fact is committed, a rejected send may leave the effect journal at `started`, making replay depend on target state at retry time.

That violates the combined retained semantics:

- workflow-to-workflow messages are durable Runtime effects;
- normal domain rejection is distinct from technical failure;
- a committed semantic result must replay deterministically;
- a healthy source instance must not enter `recovery_required` merely because a target validly rejects a message.

## 3.2 Acceptance result contract

Normal target-level acceptance rejection SHALL become a typed semantic result rather than an untyped exception.

Conceptual contract:

```ts
type DomainMessageAcceptanceResult =
  | {
      disposition: 'accepted';
      ack: MessageAcceptedAck;
    }
  | {
      disposition: 'rejected';
      rejection: DomainMessageAcceptanceRejection;
    };

type DomainMessageAcceptanceRejectionCode =
  | 'target_not_found'
  | 'target_terminal'
  | 'target_recovery_required'
  | 'workflow_not_found'
  | 'message_contract_not_found'
  | 'contract_version_mismatch'
  | 'payload_contract_violation';
```

The existing generic `target_not_accepting` condition MUST be refined enough to distinguish terminal rejection from recovery-required/transient inability.

The following remain technical/integrity failures rather than normal rejection outcomes:

- pinned package unexpectedly missing/corrupt;
- store invariant violation;
- malformed persisted journal/acceptance data;
- unknown Runtime/transport failure;
- invalid source effect construction.

## 3.3 Permanent vs transient classification

### Permanent semantic rejection

The following are terminal for the exact attempted child message identity unless authoritative package/target identity changes through a **new** source execution:

- target not found;
- target terminal;
- workflow not found in the exact pinned target package;
- message contract not found;
- contract version mismatch;
- payload contract violation.

A permanent rejection SHALL be committed as a terminal effect fact.

### Transient / recovery-owned condition

`target_recovery_required` is not converted into a permanent domain rejection. The target may recover and later accept the exact child message.

The source effect therefore retains existing durable retry/recovery ownership for this case. Retry policy must not create a new child message identity.

Technical/integrity failures likewise remain failure/recovery paths and MUST NOT be fabricated into semantic rejection.

## 3.4 Effect journal result

A Domain Message effect has a closed semantic result:

```ts
type DomainMessageEffectOutcome =
  | {
      status: 'accepted';
      ack: MessageAcceptedAck;
    }
  | {
      status: 'rejected';
      rejection: DomainMessageAcceptanceRejection;
    };
```

Both variants are terminal semantic completion of the effect and SHALL be stored under `EffectJournalRecord.status = 'completed'` with the structured outcome in durable output material.

The journal identity remains bound to the same:

- effect id;
- source workflow address;
- source message id;
- state/effect execution identity;
- exact child `messageId` derived from effect identity;
- resolved target;
- message type/contract version/payload identity.

A replay of a completed rejection returns the same rejection without calling target acceptance again.

A conflicting completed record fails closed as a journal invariant violation.

## 3.5 Source Workflow semantics

A permanent child-send rejection is a **normal domain-level effect result**, not a Runtime crash.

The compiler/runtime SHALL expose a distinct rejection route for a `domain-message` effect.

Conceptually:

```ts
interface CompiledDomainMessageEffect {
  // existing target/type/payload contract ...
  rejected?: readonly CompiledRoute[];
}
```

Routing scope SHALL include only structured public material, for example:

```text
child message id
resolved target
rejection code
contract version where relevant
```

It SHALL NOT expose RuntimeStore internals, XState actor references, stack traces or hidden transport state.

Execution semantics:

1. accepted child send → commit accepted effect result → emit normal child-accepted notification → continue current state's normal execution;
2. permanently rejected child send + matching `rejected` route → commit rejection fact → transition through that explicit route → continue from the target state;
3. permanently rejected child send + no `rejected` route → commit rejection fact → resolve the current source command/turn as T-009 `rejected`, keep the instance healthy/waiting under existing command-outcome semantics;
4. transient/technical failure → no fabricated rejection route; use existing retry/recovery/failure semantics.

Remaining message effects in the current state are not executed after a rejection route or source-turn rejection has been selected.

## 3.6 Replay and crash windows

Required ordering:

```text
begin effect
→ attempt target acceptance
→ obtain accepted OR permanent-rejected semantic result
→ durably complete effect result
→ only then allow dependent source state/command outcome commit
```

Crash after target acceptance but before effect completion retains the existing idempotent child `messageId`; retry may safely re-ask acceptance and receive duplicate ACK.

Crash after a permanent rejection is durably completed MUST replay the rejection without re-consulting target state.

A transient target condition is not durably mislabeled as permanent; recovery may retry the same exact child identity.

## 3.7 No implicit provisioning

This amendment does not create `open-or-send`, `ensure-and-send` or automatic target creation.

T-010 provisioning remains an explicit separate Runtime capability.

If a Domain Product later requires workflow-triggered provisioning, that change must define its own authority, idempotency key, package selection, initial input, failure handling and durable composition. It cannot be inferred from this message-effect contract.

---

# 4. Failure Taxonomy

| Surface | Condition | Required disposition |
|---|---|---|
| package compile | undeclared Domain Data key | fail compile |
| package compile | undeclared Business Source | fail compile |
| package compile | invalid/duplicate descriptor | fail compile |
| package activation | Domain Data digest mismatch | fail activation |
| business snapshot | value violates pinned schema | provider-contract/runtime failure |
| business snapshot | same observed revision returns conflicting value | provider-contract/runtime failure |
| child send | target terminal/missing | durable semantic rejection |
| child send | message contract/version/payload rejection | durable semantic rejection |
| child send | target recovery-required | retry/recovery-owned transient condition |
| child send | pinned package/store invariant failure | technical/integrity failure |
| journal replay | completed rejection identity mismatch | fail closed journal invariant |

No failure class is silently downgraded to success and no technical failure is mislabeled as a domain rejection.

---

# 5. DAC v0.0.4.1 Boundary Proof

This amendment changes DomainHarness package identity inputs and Runtime execution behavior only.

It does not change DAC ownership of:

- application identity;
- promotion/selection authority;
- compatibility authority;
- authority adoption/refusal;
- Runtime binding/activation authority boundaries.

For v3 target packages, the exact new `packageId` simply becomes the package identity carried by the existing exact activation/binding path.

The non-torn rule remains:

```text
selected/adopted package identity
+ exact package body/digests
+ activation binding/currentness evidence
```

must refer to one coherent exact package. The Runtime must never combine a v3 manifest from P2 with Domain Data, Business Source schemas or bindings from P1.

`DAC_CONTRACT_CHANGE_REQUIRED = NO`.

---

# 6. Adversarial Review Vectors

The review SHALL attempt to falsify this candidate with at least these vectors:

1. **Fact-authority theft** — can package declarations accidentally make current Business Facts package-owned?
2. **Identity omission** — can Domain Data/schema behavior change without `packageId` changing?
3. **Order instability** — can file/enumeration order change package identity?
4. **Retained-pin tear** — can a retained instance read a newer package's data/schema under an old pin?
5. **v2 reinterpretation** — can an old v2 package silently acquire v3 guarantees?
6. **Schema bypass** — can a Business Snapshot reach projection evaluation without validation?
7. **Static gap deferral** — can an undeclared key/source survive compilation and fail only at runtime?
8. **Rejection timing race** — can a permanent rejection remain `started` and later replay as accepted?
9. **Transient misclassification** — can `recovery_required` be durably frozen as permanent rejection?
10. **Technical-error laundering** — can store/package corruption be exposed as normal domain rejection?
11. **Source poisoning** — does a target's valid permanent rejection force the healthy source instance into `recovery_required`?
12. **Blind retry** — can a completed rejection trigger a second acceptance attempt?
13. **Implicit provisioning** — can send rejection handling create a target instance without an explicit separately-authorized provisioning action?
14. **DAC authority drift** — do new manifest fields confer selection/activation authority?

P0/P1 findings block freeze.

---

# 7. Post-freeze Implementation Carryover Map

The following DAG is a proposal only:

```text
NOT_AUTHORIZED_UNTIL_THIS_L2_REVIEW_PASSES

A. Already-frozen Runtime integration debt
   I-LOCAL   #177 retained Runtime host-local Tool wiring
   I-REJECT  #137 CompiledWorkflowRuntime normal-rejection integration
   I-OPEN    #180 DomainRuntime open/ensure integration

B. Package/Data Integrity
   I-PKG-DATA   #178 v3 package Domain Data + compiler closure
        ↓
   I-BIZ-SRC    #182 Business Source declarations/schema/runtime validation

C. Workflow-send rejection
   I-REJECT ─┐
             ├─ I-MSG-REJECT  #138 durable send rejection + route composition
   L2-B ─────┘

D. Integration/validation
   all implementation nodes
        ↓
   central Runtime/public assembly repair
        ↓
   Node + Expo real-host validation
        ↓
   package/migration/cross-host validation
        ↓
   Version Closure
```

`I-LOCAL`, `I-REJECT` and `I-OPEN` do not require a new Product/L2 decision; their L3 must cite existing T-008/T-009/T-010 authority and prove the production entry point actually consumes it.

The exact one-concern implementation DAG may be materialized only after adversarial review/freeze of this document.

---

# 8. Review / Freeze Rule

This document is not frozen merely because it is committed or has a PR.

Freeze requires:

- exact-head adversarial review;
- P0=0 and P1=0;
- explicit reconciliation of every review finding;
- final exact document SHA/blob identity;
- confirmation that Product amendment remains unnecessary;
- confirmation that DAC contract change remains unnecessary.

Only then may the coordinator create implementation Issues or name/freeze a successor release lane.
