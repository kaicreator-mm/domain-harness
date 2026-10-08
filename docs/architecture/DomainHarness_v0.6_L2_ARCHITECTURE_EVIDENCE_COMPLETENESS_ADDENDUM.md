# DomainHarness v0.6 L2 Architecture Evidence — Completeness Addendum

**Status:** REVIEW_CANDIDATE_COMPLETENESS_ADDENDUM  
**Base L2:** PR `#488` merged as `a521a9b88dbd0ad7a0619f033bc47960c3df6080` / tree `b1ac33d69e14c4194dca560f65b68cd49848aa92`  
**Base L2 blob:** `97d68e14b0dc0eca82d38e953beb48ca2e3ca2e5`  
**Base L2 Fresh Review:** `#491` PASS  
**Product Freeze:** `#486`  
**Omitted inputs repaired here:** `#483`, `#484`  
**Tracking-only excluded input:** `#485`  
**Pinned ADS:** `4.0.0@1edaee9291e25b6dd99303493bed75132cb54881`  
**L2 Freeze:** NO  
**Task DAG:** BLOCKED  
**Implementation:** BLOCKED

> This file is a narrow successor overlay over the exact L2 document independently reviewed in #491. It does not rewrite or supersede A1–A7. A future L2 Freeze, if authorized by a Fresh Independent Architecture Completeness Review, MUST pin both the #491-reviewed base L2 blob and this addendum blob as the complete v0.6 L2 authority.

---

## 1. Why this addendum exists

Issues #483 and #484 were created before the v0.6 L2 builder issue #487 but were omitted from PR #488. #491 therefore proves the correctness of the exact architecture it reviewed, but not the completeness of all already-recorded v0.6 L2 inputs.

This addendum closes only those two omissions:

```text
#483 -> A8 Durable accepted-message identity / messageId collision hardening
#484 -> A9 State-revision progression authority / defensive store invariant
```

It does not reopen Product scope and does not change the previously reviewed Fast Path / bounded semantic-decision architecture.

```text
PRODUCT_SCOPE_CHANGED=NO
EXISTING_A1_A7_CHANGED=NO
NEW_MAJOR_RUNTIME_SUBSYSTEM=NO
DIRECT_RESOLUTION=DEFER_FROM_V0_6
GENERIC_ADAPTIVE_RUNTIME=OUT
```

#485 remains `ARCHITECTURE_TRACKING_ONLY`, blocked on DAC #147, and is not authorized for the v0.6 implementation Task DAG by this addendum.

---

## 2. Source evidence for A8 — durable accepted-message identity

Relevant exact source on the current v0.6 line:

- `packages/domain-harness/src/v2/contracts/message.ts`
- `packages/domain-harness-node/src/store/node-sqlite-runtime-store.ts`
- `packages/domain-harness-expo/src/store/expo-sqlite-runtime-store.ts`

`DomainMessage` contains:

```text
messageId
target
type
payload
correlationId?
causationId?
contractVersion?
```

Both Node and Expo RuntimeStore adapters persist all of the following on first acceptance:

```text
target instance identity
messageId
type
payload JSON
correlationId (effective value after defaulting to instance correlation)
causationId
contractVersion
target package id
assigned targetSequence
acceptedAt
```

Both adapters currently perform duplicate acceptance by looking up only the target instance + `messageId`; if a row exists, they return the prior duplicate acknowledgement without checking the other logical-message material.

The current stores already contain canonical/structural JSON comparison machinery for other durable identity checks, so no new persistence subsystem or schema is required to establish compatible-message replay.

---

## A8 — Durable accepted-message identity and duplicate compatibility

### Decision

A durable duplicate acknowledgement is valid only when the incoming message is **logically identity-compatible** with the already accepted durable message under the same target and `messageId`.

The normative compatibility material is:

```text
AcceptedMessageIdentity =
  target WorkflowAddress
  + messageId
  + type
  + canonical payload
  + effective correlationId
  + normalized causationId
  + normalized contractVersion
  + target package binding
```

Definitions:

1. `target WorkflowAddress` is the exact `workflowId + instanceKey` addressed by the acceptance call. Host-private `internal_id` is storage machinery, not portable identity.
2. `messageId` remains the durable deduplication key within that target.
3. `payload` equality is canonical JSON semantic equality; object key serialization order MUST NOT create a collision.
4. `effective correlationId` is compared **after** applying the existing acceptance default (`message.correlationId ?? instance.correlationId`). Therefore omitted correlation and an explicit identical instance correlation are compatible.
5. `causationId` and `contractVersion` compare as normalized optional values (`undefined`/storage-null are the same absence; differing present values are incompatible).
6. `target package binding` is the durable package id recorded at first acceptance and must remain compatible with the target instance package binding. It is acceptance/execution context rather than a caller-selected message field, but a duplicate MUST NOT be replayed across incompatible package identity.
7. `targetSequence` and `acceptedAt` are **not** incoming logical-message identity. They are durable facts assigned on first acceptance and are returned unchanged on a valid duplicate.

### Required behavior

```text
same target + same messageId + compatible AcceptedMessageIdentity
  -> return existing duplicate acknowledgement
  -> do not allocate a new target sequence
  -> do not emit a second MESSAGE_ACCEPTED observation

same target + same messageId + incompatible AcceptedMessageIdentity
  -> fail closed before any new write
  -> MUST NOT return the prior result as a normal duplicate
  -> MUST NOT advance target sequence
  -> MUST NOT mutate workflow state
  -> MUST NOT start/commit a durable business effect
```

A stable collision category such as `MESSAGE_IDENTITY_COLLISION` is required at the contract/host error boundary. Exact TypeScript enum/class placement is L3 detail; the semantic category is L2 authority.

### Authority placement

The **portable Runtime contract owns the identity semantics**. Node and Expo RuntimeStore adapters enforce that contract at the durable duplicate-accept boundary in the same transaction/serialization domain that owns message acceptance.

Implementation SHOULD share one portable compatibility predicate/canonicalization helper rather than re-specifying the tuple independently in each host adapter. The exact helper name/file is L3 detail.

This is defensive durable-boundary validation, not a second message-routing or business-control authority.

### Compatibility / migration

No database migration is architecturally required: both current host stores already persist the material needed for the comparison.

Existing valid duplicate replay remains valid. The only newly rejected case is reuse of the same target/messageId for incompatible logical material, which was never a valid idempotent retry contract.

### Host parity

```text
NODE=REQUIRED
EXPO=REQUIRED
SAME_IDENTITY_RULE=REQUIRED
REAL_HOST_VALIDATION=REQUIRED_AT_IMPLEMENTATION_CLOSURE
```

---

## 3. Source evidence for A9 — state-revision progression

Relevant exact source on the current v0.6 line:

- `packages/domain-harness/src/contracts/process-command.ts`
- `packages/domain-harness/src/runtime/process-command.ts`
- `packages/domain-harness-node/src/store/node-sqlite-runtime-store.ts`
- `packages/domain-harness-expo/src/store/expo-sqlite-runtime-store.ts`

The portable core `prepareProcessedCommandTurn()` already validates the expected current revision and constructs:

```text
nextStateRevision = expectedStateRevision + 1
```

for a normal processed command turn.

The Node and Expo `commitProcessedCommandTurn()` persistence seams currently accept `ProcessedCommandTurnCommit.nextStateRevision` and write it under a CAS on `expectedStateRevision`, but they do not independently reject a supplied jump/backward revision before writing.

Other existing normal RuntimeStore mutation paths typically increment the revision inside the store (`state_revision = state_revision + 1`).

---

## A9 — State-revision progression authority

### Decision

**Runtime/core control-turn preparation owns semantic revision progression.** For a normal committed Runtime control transition, revision progression is exactly:

```text
N -> N + 1
```

The RuntimeStore does not choose a different next revision and does not own business/control semantics.

However, `ProcessedCommandTurnCommit` is a portable persistence boundary and host adapters receive both `expectedStateRevision` and `nextStateRevision`. A conforming RuntimeStore implementation MUST defensively validate the structural commit invariant before any write:

```text
expectedStateRevision is a safe non-negative integer
expectedStateRevision < Number.MAX_SAFE_INTEGER
nextStateRevision === expectedStateRevision + 1
```

This validation does not create a second revision authority. It proves that the supplied persistence command conforms to the revision already derived by Runtime/core.

### Normal transition rule

```text
REVISION_OWNER=RUNTIME_CORE
NORMAL_TRANSITION_RULE=EXACT_N_TO_N_PLUS_1
STORE_ROLE=DEFENSIVE_CONTRACT_BOUNDARY_NOT_SEMANTIC_OWNER
STORE_GUARD_REQUIRED=YES
```

For the existing `commitProcessedCommandTurn()` extension, Node and Expo MUST apply the same fail-closed validation before changing message disposition, instance state, process data, outcome, or observations.

Existing RuntimeStore methods that internally increment `state_revision = state_revision + 1` already satisfy the normal rule and do not need a second caller-supplied `nextStateRevision` check.

### Recovery / import / migration

There is **no revision-jump exception inside the normal processed-command commit seam**.

If a future migration/import/administrative restore needs to establish a non-`N+1` revision, that must occur through a separate explicit migration/import/restore contract with its own authority and validation. It MUST NOT masquerade as a normal `commitProcessedCommandTurn()`.

Existing recovery Runtime mutations remain subject to their existing explicit contracts; this A9 decision does not invent a generic migration API or alter current recovery semantics.

### Failure semantics

A nonconforming processed-command revision pair must fail closed before durable mutation. The exact error enum spelling is L3 detail; it may reuse or narrow the existing state-revision conflict category if the result remains deterministic and externally diagnosable.

### Host parity

```text
NODE=REQUIRED
EXPO=REQUIRED
SAME_N_PLUS_1_CONTRACT=REQUIRED
NO_PARTIAL_COMMIT_ON_REJECTION=REQUIRED
REAL_HOST_VALIDATION=REQUIRED_AT_IMPLEMENTATION_CLOSURE
```

---

## 4. Authority-map extension

The #491-reviewed authority map remains unchanged except for these clarifications:

```text
Portable Message/Runtime contract
  owns: durable accepted-message compatibility semantics

Runtime/core ProcessCommand preparation
  owns: semantic next revision derivation for normal control turns (N -> N+1)

RuntimeStore host adapters
  own: atomic persistence, CAS/serialization, and defensive validation that
       accepted-message duplicates and processed-command commits conform to
       portable identity/revision contracts
  do not own: business routing, transition selection, semantic revision policy,
              or a new idempotency/replay authority
```

---

## 5. Failure/recovery extension

A8/A9 add only two bounded fail-closed conditions:

```text
MESSAGE_IDENTITY_COLLISION
NONCONFORMING_STATE_REVISION_COMMIT
```

These are semantic categories; exact public/internal error code names are implementation detail.

They MUST be detected before the corresponding durable mutation starts. Transaction rollback remains a safety net, not the intended validation point.

Neither condition changes:

- DecisionResolver source order;
- semantic cache authority;
- HarnessMachine/model authority;
- Admission guard/invariant authority;
- durable effect replay/idempotency authority;
- Business Store/external authority ownership.

---

## 6. UNKNOWN register extension

| ID | Question | Evidence | Disposition |
|---|---|---|---|
| U-08 | Can incompatible `messageId` reuse be distinguished without a new schema/store? | Node/Expo already persist type, payload, effective correlation, causation, contractVersion and package binding for the accepted message. | STATIC_EVIDENCE_SUFFICIENT — YES; bounded compatibility guard. |
| U-09 | Who owns normal state-revision progression? | `prepareProcessedCommandTurn()` already derives `nextStateRevision = expected + 1`; stores persist the supplied commit under CAS. | STATIC_EVIDENCE_SUFFICIENT — Runtime/core owns derivation; stores defensively validate. |
| U-10 | Is an executable Research Demo required before L2 Freeze? | Both gaps are directly visible in symmetric Node/Expo source and require bounded invariant checks, not an uncertain runtime mechanism. | STATIC_EVIDENCE_SUFFICIENT — NO. |

```text
MATERIAL_UNKNOWNS=0
EXECUTABLE_DEMOS_REQUIRED=0
```

---

## 7. Implementation concern-boundary extension — NOT a Task DAG

The #491-reviewed C1–C5 remain unchanged. Add only:

### Concern C6 — Accepted-message identity collision hardening

- portable compatibility contract/predicate;
- canonical payload + normalized metadata comparison;
- Node/Expo duplicate-accept fail-closed guards;
- preserve valid duplicate replay;
- no state/effect/sequence mutation on collision;
- restart/real-host parity validation.

### Concern C7 — Processed-command revision contract hardening

- freeze Runtime/core as revision derivation owner;
- exact normal `N -> N+1` invariant;
- Node/Expo defensive commit validation before writes;
- no partial commit on invalid revision;
- separate any future migration/import authority from normal command-turn commit;
- contract + real-host parity validation.

#485 is not C8 and is not part of this v0.6 Task DAG authority.

---

## 8. Architecture acceptance extension

A future L2 Freeze additionally requires Fresh Independent Architecture Completeness Review to confirm:

1. #483 is resolved by A8 without creating a new messaging/idempotency subsystem;
2. compatible duplicate identity is explicit and portable across Node/Expo;
3. canonical payload/effective-correlation/optional metadata semantics are deterministic;
4. an incompatible same-messageId collision fails before state/sequence/effect mutation;
5. #484 is resolved by A9 with Runtime/core as semantic revision owner;
6. normal processed-command progression is exactly `N -> N+1`;
7. defensive store validation does not create a second business/control authority;
8. Node/Expo parity is required;
9. no migration/import revision-jump exception is smuggled through the normal command-turn seam;
10. A8/A9 do not alter Product Freeze, Direct Resolution disposition, or A1–A7;
11. #485 remains excluded pending its upstream DAC freeze and future dedicated adoption review.

---

## 9. Completeness-addendum terminal

```text
V0_6_L2_COMPLETENESS_ADDENDUM_CANDIDATE
BASE_V06=a521a9b88dbd0ad7a0619f033bc47960c3df6080
BASE_TREE=b1ac33d69e14c4194dca560f65b68cd49848aa92
BASE_L2_BLOB=97d68e14b0dc0eca82d38e953beb48ca2e3ca2e5
BASE_L2_REVIEW=#491_PASS
INPUT_483=RESOLVED_IN_L2_A8
INPUT_484=RESOLVED_IN_L2_A9
INPUT_485=TRACKING_ONLY_EXCLUDED
PRODUCT_SCOPE_CHANGED=NO
EXISTING_A1_A7_CHANGED=NO
NEW_MAJOR_RUNTIME_SUBSYSTEM=NO
DIRECT_RESOLUTION=DEFER_FROM_V0_6
MATERIAL_UNKNOWNS=0
EXECUTABLE_DEMOS_REQUIRED=0
L2_FREEZE=NO
TASK_DAG=BLOCKED
NEXT=FRESH_INDEPENDENT_ARCHITECTURE_COMPLETENESS_REVIEW
```
