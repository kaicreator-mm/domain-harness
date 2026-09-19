# DomainHarness v0.2 — L2 Architecture Amendment A2

**Status:** **ACTIVE — NORMATIVE AMENDMENT**  
**Target version:** v0.2  
**Concern:** Issue #153 — shipped Runtime engine evidence reconciliation  
**Date:** 2026-09-19  
**Amends:** `docs/architecture/DomainHarness_v0.2_L2_ARCHITECTURE_EVIDENCE.md`  
**Baseline reviewed:** `v0.2@52c228d28c5e59d4ee634e863df630c0c2635194`  
**Pinned development standard:** `kaicreator-mm/ai-development-standard@0446f04583f6cf464c835f26e2f657c8b703cb4e`

This file is a normative L2 amendment for the shipped v0.2 implementation. Read the frozen L2 together with this amendment. The original L2 text remains in Git history and in the frozen document as the historical architecture checkpoint; where the two conflict for the shipped v0.2 Runtime engine, **A2 is authoritative**.

---

## 1. Contradiction being reconciled

The frozen L2 recorded two implementation decisions that were not retained by the implementation that became the portable v0.2 Runtime:

1. **AD-03** stated that “XState v5 remains an internal control-flow reducer unless implementation evidence later proves a local incompatibility.”
2. The §4 decision matrix rejected replacing XState with a custom engine and adopted “Retain private XState reducer behind compiled IR.”

Those statements accurately record the original architecture intent at L2 freeze time, and the v0.1 historical facts remain unchanged. They do **not** describe the Runtime engine actually assembled and validated for shipped v0.2.

### Supersession status

For the **shipped v0.2 Runtime only**:

- the AD-03 XState-retention sentence is **SUPERSEDED BY A2**;
- the §4 Workflow-engine decision rows that reject a custom interpreter and adopt a private XState reducer are **SUPERSEDED BY A2**;
- references to v0.1 having private XState control-flow compilation remain historical facts and are **not** superseded;
- the durable-effect/result-journal separation, portable-state model, and all public/frozen product semantics remain in force.

This is an architecture-evidence reconciliation, not a request to rewrite working Runtime mechanics to match stale documentation.

---

## 2. Shipped v0.2 Runtime engine decision

The portable v0.2 Runtime Core executes compiled Workflow IR through:

```text
packages/domain-harness/src/runtime/compiled-workflow-runtime.ts
→ CompiledWorkflowRuntime
```

`createDomainRuntime()` constructs `CompiledWorkflowRuntime`, uses `initialState()` when opening a Workflow Instance, and uses `processMessage()` for durable Domain Message processing. `CompiledWorkflowRuntime` interprets the compiled state definition, event routes, invokes, message effects, completion/error routes and lifecycle transitions directly.

Therefore the v0.2 architecture decision is:

> **AD-03-A2 — v0.2 uses `CompiledWorkflowRuntime` as the private compiled-IR workflow interpreter. XState is not the control-flow reducer/interpreter of the shipped v0.2 Runtime Core.**

The interpreter remains a private implementation detail. No public API, persistence contract, Domain Package authoring contract, Workflow Address, lifecycle enum, Domain Message contract, RuntimeStore contract, Tool/effect journal contract, Query/Subscription/Projection contract, or package-pinning contract exposes or requires a particular workflow-engine library.

The root package may still carry legacy dependencies used by v0.1-compatible or historical code paths. The presence of an `xstate` package dependency is not evidence that the v0.2 `/v2` Runtime execution path uses XState.

---

## 3. When the implementation superseded the original decision

The superseding implementation was established during **T-016 portable Runtime assembly** on 2026-09-18:

- `591358c8da8a2650a921ee583dd9a0ef9153552a` introduced the T-016 portable Runtime assembly checkpoint containing `CompiledWorkflowRuntime`;
- T-016 final reviewed PR #116 completed at `9ad6d46b49715f0a2f1422b8fb1bea24f321b507` and merged into `v0.2`;
- subsequent Node and Expo/Hermes conformance, process/restart, migration, package-retention, and integration evidence validated the public/frozen semantics on that Runtime architecture rather than on a private XState reducer.

The frozen AD-03 wording anticipated that implementation evidence could reopen the XState-retention assumption, but it specifically mentioned a later-proven local incompatibility. The repository history reviewed for #153 does **not** preserve evidence proving that condition or a contemporaneous architecture rationale for the switch. A2 therefore does not invent one after the fact. What is independently established is that T-016 assembled the direct compiled-IR interpreter, later v0.2 validation exercised that implementation, and the architecture record was never reconciled to match it.

For release-closeout purposes, the reason to accept the implementation as the superseding v0.2 architecture is the current evidence: the interpreter is already the validated portable Runtime path, the engine choice is private, and no public/frozen semantic change results from recording the implementation truth. Replacing it with XState now merely to restore agreement with stale wording would be a Runtime rewrite without a product or contract justification.

---

## 4. Public/frozen semantics are unchanged

A2 changes only the documented private workflow-engine decision. It does **not** change any frozen v0.2 product behavior or release contract, including:

1. build-time Raw Domain Package compilation and runtime consumption of a Target Compiled Domain Package;
2. stable `WorkflowAddress` and package pinning;
3. one serialized state-changing mutation lane per Workflow Instance, with no global ordering promise;
4. durable Domain Message acceptance, target-sequence ordering, deduplication, disposition and accepted-vs-processed separation;
5. terminal and `recovery_required` message acceptance rules;
6. durable Tool/effect journal ordering, replay and ambiguous non-idempotent recovery behavior;
7. journaled Workflow-to-Workflow Domain Message effects;
8. bounded read-only Query, non-durable Subscription and deterministic declared-input Projection;
9. portable Runtime Core / host-binding separation across Node and Expo/Hermes;
10. fail-closed package/capability compatibility and retained-package requirements.

The durable effect/result journal remains recovery authority. Portable persisted workflow state remains Runtime-owned and does not become a persisted XState snapshot or a library-specific machine snapshot.

---

## 5. Evidence reviewed for A2

### 5.1 Current successor baseline

Issue #151 was already merged before this reconciliation. The exact baseline independently re-read for #153 was the then-current `v0.2` successor HEAD:

```text
52c228d28c5e59d4ee634e863df630c0c2635194
```

That HEAD also includes the later #152 portable package-root fix; #153 does not revert or reinterpret either concern.

### 5.2 Runtime implementation

The reviewed portable path shows:

```text
createDomainRuntime()
  → new CompiledWorkflowRuntime(...)

openInstance(...)
  → runtimeWorkflow.initialState(...)

mailbox drain
  → runtimeWorkflow.processMessage(...)
```

`CompiledWorkflowRuntime` owns compiled state parsing, event-route selection, deterministic settle looping, Tool/Skill/message-effect invocation and lifecycle result production. No XState reducer is invoked by this v0.2 execution path.

### 5.3 README and validation-document audit

The following current documentation surfaces were checked for an incorrect claim that the v0.2 Runtime Core uses XState:

- repository root `README.md`;
- `docs/validation/v0.2/closure/T024_AC_GATE_MATRIX.md`;
- `docs/validation/v0.2/closure/T024_EVIDENCE_INVENTORY.md`;
- `docs/validation/v0.2/closure/T024_HIDDEN_VALIDATION_HANDOFF.md`;
- `docs/validation/v0.2/expo/T019_VALIDATION.md`;
- `docs/validation/v0.2/node/T018_VALIDATION.md`;
- `docs/validation/v0.2/node/I135_PROCESSING_RECLAIM_VALIDATION.md`;
- `docs/validation/v0.2/migration-expr/G31_AC43.md`;
- `docs/validation/v0.2/migration-script/G32_AC44.md`.

**Result:** no reviewed README/validation document claims that XState is the v0.2 Runtime Core engine. The root README only gains an authority link to this A2 so readers do not stop at the superseded workflow-engine wording in the original L2; no validation record requires wording changes.

---

## 6. Architecture consequences

- `CompiledWorkflowRuntime` is the shipped v0.2 private workflow interpreter.
- XState-specific behavior is not part of v0.2 public, frozen, persistence, portability, or domain semantics.
- v0.1 historical XState facts remain valid and must not be rewritten as though v0.1 used the v0.2 interpreter.
- Future changes to the private interpreter remain architecture changes only when they affect an architecture boundary or frozen semantics; merely changing a private implementation library does not grant authority to alter public behavior.
- Release/closeout evidence must describe the implementation actually shipped rather than restating the superseded XState-retention assumption.

---

## 7. A2 disposition

```text
Issue #153 architecture contradiction
→ independently confirm shipped v0.2 Runtime path
→ CompiledWorkflowRuntime confirmed
→ original XState-retention decision superseded for shipped v0.2
→ historical switch rationale beyond T-016 implementation evidence: NOT VERIFIED
→ public/frozen semantics changed: NO
→ Runtime code changed: NO
→ README/validation false-XState claims found: NO
→ Architecture Evidence reconciliation: PASS
```
