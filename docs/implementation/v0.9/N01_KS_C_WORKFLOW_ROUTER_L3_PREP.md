# DomainHarness v0.9 — N01 #1027 L3 Contract/Test Implementation Handoff R1

```ini
ARTIFACT=DH09_N01_L3_PREP_R1
STATUS=PREPARED_NOT_ISSUE_ADMITTED_NOT_SOURCE_IMPLEMENTED
OWNER_ISSUE=#1027
SCOPE=V09_ONLY
PRODUCT_R2_FREEZE=PR1048
L2_FREEZE=PR1053_MAIN_10a01883e08f1dbdc7c8cc9883f179154ded52ba
ARCH_EXACT_SOURCE_BLOB=4b127f22473c231f7fad8bbf8332260d2f4a6918
DAG_FREEZE=PR1054_MAIN_d7b45d823d739ead41189b91d4299b6f7fbb6c5c
NATIVE_BLOCKED_BY=#1006_VERIFIED
V08_BASELINE_RELEASE=NOT_QUALIFIED_#1006_OPEN
V08_REUSE_OBSERVED_ONLY=5fad3ea2964f18af7a5a5288a433bc35cf1ca16d
CODE_WRITE_AUTHORITY=NO
TEST_EXECUTION=NOT_RUN
REVIEW_POLICY=REQUIRED_FOR_EVENTUAL_CODE_PR
USER_PR_CI_WAIT=SKIPPED_NOT_CI_PASS
```

## 1. Bounded concern / input and output

N01 **does not build a second Domain Runtime**. Its one concern is the *selected and qualified K/S/C contracts* and a **Standard-owned pure bounded WorkflowRouter**, used by two distinct Business App definitions. Downstream #1032 owns protected Host/BUILD packaging and source import trust, #1035 owns public facade names/errors and clean consumer, #1028 owns the selected actual Node24/SQLite physical adapter, #1036 owns lifecycle/effect permit integration, and #1037 owns independent Release Qualification. Avoid adding an all-purpose provider registry or independent Router state machine.

**Inputs** to re-pin when #1006 closes: one immutable qualified v0.8 release artifact/tag, selected K and Standard bytes, sealed BUILD role/intent/capability bindings, two actual domain policies, K-authenticated immutable selection context and allowed capability Operation/handler identities. **Output**: one v0.9 K/S/C contract owner, pure Standard Router candidate discriminator, deterministic binding negatives, and bounded integration tests showing the selected Kernel (not Router) remains sole Admission/Journal/Effect authority. Node/SQLite, OS-specific behavior and Host trust-root details are **not owned by this N01 task**.

**Source reuse inventory (UNRELEASED, for planning only)** at `v0.8@5fad3ea2964f18af7a5a5288a433bc35cf1ca16d`:

| Source (selected v0.8 branch only) | Observed blob | Legitimate reuse / known missing target |
| --- | --- | --- |
| `packages/domain-harness-compiler/src/qualified-package/payload/standard-sdk-v1.mjs` | `06c7988992478fb0614bf6e4d106f3ec6f7f8c44` | Five `STANDARD_KINDS`, pure `interpret`; `interpret('workflow')` returns a candidate; no `WorkflowRouter` export observed |
| `packages/domain-harness-compiler/src/qualified-package/payload/kernel-mechanism-v1.mjs` | `9f5cdd7de267846f413ea6316c1aa85bace1e550` | Physical selected Kernel/central admission/effect/journal; no independent Router runtime permitted |
| `packages/domain-harness/src/public-v8/contracts.ts` | `cb20695e772862bb2b56569cc5f958b94d3efc5e` | Exact role, intent and capability Binding shape; handler `operationId → handler export` selected statically, no dynamic discovery |
| `packages/domain-harness-compiler/tests/v08-standard-sdk-d01.test.ts` | `e522a0be353a647923b6db2d2dd8d189b1b54f61` | Existing five-Kind interpreter P/N tests; **not** proof v0.9 WorkflowRouter already exists |
| `packages/domain-harness-compiler/tests/v08-capability-package-s02a.test.ts` | `2ef2f87af6b10176d74f7238bec98335a3e78cbc` | Static K/S/B/C Binding uniqueness/handler/role-impersonation negatives; re-pin final qualified source before source work |

The `main` branch has not been made to inherit the release-qualified v0.8 K/S sources; **do not** silently use an observed v0.8 branch SHA as a v0.9 release baseline. These are reuse pointers only, not cross-version compatibility obligations.

## 2. Tests first — smallest meaningful positive/negative matrix

| Case | Minimal selected test assertion | Why it is not duplicate release validation |
| --- | --- | --- |
| P01 | Two Business policies each resolve a declared intent to a BUILD-selected Capability Operation through the **same** K/S code without identity switching | One shared K/S/C contract witness; repeat only at final frozen artifact |
| P02 | Standard `selected` result carries exact `operationId, capabilityId, handlerId, basisDigest` and remains deeply immutable data, with **zero** State/Journal/physical effects | Pure Router ownership |
| P03 | No match → `{kind:'missing',intentId}` and no fallback to a guessed runtime Handler | Route exhaustion |
| P04 | Conflicting candidates of equal top priority → `{kind:'ambiguous',intentId,candidateOperationIds}` with sorted unique IDs and no silently chosen first | Deterministic tie contract |
| N01 | BUILD binds duplicate K/S closed roles, capability masquerading as Kernel, duplicate capability/operationId, or dangling Handler → qualification rejects before Package activation | Reuse #S02a negative semantics |
| N02 | Caller-provided fake `AuthorizedPrincipal`, forged route result or unapproved binding cannot advance selected K admission; no Journal/Effect | K sole admission boundary |
| N03 | A pure Standard `denied` eligibility result cannot grant or bypass Kernel authorization; revoked/unknown selected Operation fails typed | No second authority |
| N04 | Invalid/unsafe graph data (getter, `__proto__`, cyclic/unknown Kind, unsupported Operation handler) fails without invoking getter or physical effect | Static, fail-closed selected graph |
| I01 | Standard candidate → K authenticates current H context → Kernel decides transition/receipt/UNKNOWN; a rejected route creates zero new effect | **One** bounded selected K/S integration, not a 44-suite replay |

Group closely related negatives into existing test files where possible. **Do not** dispatch nine different Test Agents or run a full repository matrix for every row. These cases are acceptance propositions until real source tests execute. Keep one local selected JS/TS implementation run and only affected P/N in each code PR; #1037 owns final Full/Hidden/Critical Journeys/packaged release once per immutable candidate.

## 3. Contract first — proposed TypeScript-facing discriminant

The following is **L3 illustrative source planning**, not a compiled/exported API or a newly frozen L2 rule:

```ts
type WorkflowRouterResult =
  | Readonly<{
      kind: 'selected';
      operationId: string;
      capabilityId: string;
      handlerId: string;
      basisDigest: string;
    }>
  | Readonly<{ kind: 'missing'; intentId: string }>
  | Readonly<{ kind: 'ambiguous'; intentId: string; candidateOperationIds: readonly string[] }>
  | Readonly<{ kind: 'denied'; reasonCode: string }>;
```

- **BUILD** pins the unique closed K role, unique Standard role, intended B policies and exact selected C/Operation→Handler map within the signed subject; no runtime hot plugin/provider discovery.
- **Standard** validates supplied immutable data and returns this **pure candidate/eligibility** union. Explicit equal-rank ambiguity refuses deterministic first-match shortcuts; K alone decides whether to accept any selected candidate.
- **Kernel** independently validates candidate against selected binding identity and authentic H→K principal context, then performs any State/Admission/Journal/Effect/UNKNOWN operation. Router does **not** call Host ports, persist business state, execute a Handler, schedule recovery or grant authorization.
- **Host H** independently protects installed module bytes and caller/permit provenance; private authority cannot be minted from a plain Business field or a TypeScript interface. Its implementation belongs to #1032/#1036, **not** N01.
- The L2 discriminator fields and exact semantics above come from frozen L2 §11 D05; no separately invented v0.9 public errors (owner #1035) or new digest format (owner #1032).

**Failure ownership:** invalid qualified closure/bindings fail at BUILD/H before activation; missing/ambiguous/denied return pure Standard values; unauthorized selected operation is Kernel denial; physical dispatch/currentness/cross-tenant failure is the protected Host/K/selected C boundary and must not be converted to a fabricated success. UNKNOWN and replay remain Kernel-owned.

## 4. Code and documentation write-set plan — do not implement yet

The first v0.9 code slice should be **Contract → Core → Integration** only if source/ABI reuse analysis proves it needed, with tests first. It may add new v0.9 versioned K/S/C contract files and Standard pure Router binding, using the eventual release-qualified v0.8 sources as inputs. **Do not edit historical frozen v0.8 files or v0.8 protected Host.** JIT assign exclusive ownership of shared module/barrel/SDK export files before #1032/#1035 begin in parallel.

Suggested narrow slices:
1. **Contract (N01 only):** selected K/S/C signatures, Standard Router discriminant, BUILD consistency and tests of sealed Handler identities. Reject nonselected implementation surface.
2. **Core (N01 only):** thin Router around reused Standard `interpret('workflow')`/Operation logic if behavior matches; add a small pure function only for missing selection semantics. Reuse existing selected Kernel admission rather than clone.
3. **Integration (N01 + downstream interface checkpoint):** one selected K/S data-path witness and two Business policies using the same ABI. Stop at a **versioned internal** contract; public `./v9` packaging belongs to #1035/#1032.
4. **Validation/Failure:** required distinct Reviewer checks exact PR SHA; local selected runtime targeted tests report actual counts. CI can be intentionally deferred for intermediate PRs per user direction but cannot be reported as PASS.

**No release baseline yet**: `#1006` is still OPEN and is a real native GitHub `blocked_by` edge to #1027. Only after that qualified baseline is actually current, Task Pack write-set claim is JIT checked, and implementation prerequisites are met may an agent begin source changes. This Web artifact itself does **not** unblock #1027 or change native dependencies.

## 5. Handoff for parallel N06/N07/N02 after N01 admission

When N01 contract exact SHA is accepted, #1032 and #1035 can **prepare separate source branches concurrently** only if protected H/BUILD source files are owned solely by #1032 and public facade/types/docs solely by #1035. #1028 may work in parallel on **first selected Node24/SQLite physical adapter**, not a universal SDK OS matrix. #1036 remains dependent on all three physical/public strands; #1037 independent Release uses their integrated exact immutable packaged artifact. No extra prototype/deep-architecture review when the frozen L2 design already addresses the uncertainty.

```ini
HANDOFF_RESULT=L3_TEST_CONTRACT_REFERENCE_PREPARED
N01_IMPLEMENTATION_DONE=NO
N01_REAL_TESTS_RUN=NO
N01_REVIEW_TERMINAL=NOT_CLAIMED
V09_REAL_READY_SET=EMPTY
NEXT_WHEN_RELEASE_QUALIFIED=JIT_REPIN_SOURCE_AND_DISPATCH_N01
```
