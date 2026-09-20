# v0.3 Architecture Spike — XState Workflow Core + Durable AI Node Boundary

**Status:** SPIKE EVIDENCE — this note records executed results for issue #175. It does **not** freeze v0.3 architecture and it changes no production code.

**Baseline:** `v0.2` @ `f053f44` + spike test `packages/domain-harness/tests/architecture-v03/xstate-ai-boundary-spike.test.ts`
**Executed:** canonical core test runner (recursive discovery includes `tests/architecture-v03/`), S1/S2/S3 all PASS; re-executed by Woodpecker verify on the spike PR.
**Related:** #153 (v0.2 drift from the frozen private-XState decision to the shipped `CompiledWorkflowRuntime`).

## What was proven with executable code

The spike wires a real XState v5 machine (`idle → reviewing(invoke) → awaiting_decision → completed`) whose AI node is a `fromPromise` invoked actor delegating to the **real** `JournaledSkillRunner` over the **real** `AIOperationPort`/effect-journal contracts, with an in-memory journal store that mirrors the frozen adapter re-begin semantics (L2 §25 A1.4: existing compatible record returned unchanged).

## Answers to the issue's questions

**Q1 — Can XState own workflow state/event/invoke semantics while the DomainHarness durable journal remains replay authority?**
YES. XState owned flow, context and transitions throughout S1–S3; every AI execution fact (begin/complete, identity, output) lived exclusively in the journal store. No workflow authority leaked into the journal and no durability responsibility leaked into XState.

**Q2 — Can an AI node be an XState invoked Promise actor delegating to `JournaledSkillRunner` without moving provider/model authority into XState?**
YES. The invoked actor is a thin adapter (`fromPromise` → `runner.run(...)`); the `AIOperationPort` implementation received the full scoped request (identity, skill instructions/resources, validated input, output schema, signal) and remained the only provider-facing seam. XState saw only the structured result.

**Q3 — Crash window: persist snapshot while AI in-flight, let the result commit, restore from the earlier snapshot. Does the restored invoke reuse the committed result?**
YES — the core result of the spike (S2). Snapshot persisted during `reviewing`; AI completed and `completeEffect` committed durably; a fresh actor restored from the earlier snapshot re-entered the invoke (XState promise actors do not persist in-flight state — by design); `JournaledSkillRunner` found the `completed` journal record and returned it with `replayed: true`; **`AIOperationPort.execute()` call count remained 1** and the machine converged to `awaiting_decision` with the committed output.

**Q4 — Does XState persistence remain workflow-control persistence rather than effect/result replay authority?**
YES. The persisted snapshot carried only control state (state node + context incl. `sourceMessageId`); it contained no AI result. Replay authority was exercised solely by the journal: restoring a stale snapshot could not fork or duplicate the committed AI fact.

**Q5 — Does the current runner provide only same-effect replay reuse, not semantic caching across distinct message identities?**
CONFIRMED (S3). Identical skill + identical domain input under a different `sourceMessageId` produced a different deterministic `effectId` → second journal record → second `AIOperationPort.execute()` call (`calls === 2`, `replayed === false`). v0.2 semantics: durable replay reuse per effect identity, **not** cross-invocation semantic result caching.

## Capability classification (required finding)

Already supported by existing v0.2 seams (no new mechanism needed for the boundary itself):
- durable AI operation journaling + deterministic effect identity (`JournaledSkillRunner`, `deriveEffectId`, A1.4 re-begin);
- committed-result replay on re-entry with call-count proof (S2);
- provider-neutral AI seam with scoped context and output-schema validation (`AIOperationPort`, `SchemaValidator`);
- message-identity-scoped reuse semantics (S3) — any v0.3 semantic caching would be an explicit NEW product decision, not an inference.

Must be ADDED for v0.3 (cannot be inferred from this spike):
- a **durable XState snapshot store**: the spike persisted in memory; production needs a RuntimeStore-grade persisted snapshot record with schema/version tied to package identity and restore validation;
- **compile/adapter path** from Target Compiled Domain Package workflow definitions to XState machines (the spike hand-writes the machine; the frozen compiled IR remains the artifact authority);
- **crash-window ordering contract**: snapshot-persist vs journal-commit interleavings beyond the single window tested here (snapshot-after-commit, restore-with-started-journal → the A1.4 matrix already governs re-execution, but snapshot idempotency/versioning needs specification);
- **cancellation/timeout policy** integration (`AIOperationRequest.signal` exists but was not exercised);
- **lifecycle interplay** with the v0.2 `awaitIdle`/`dispose` semantics for actor-owned background promises.

## Guardrails honored

No change to `CompiledWorkflowRuntime`, public v0.2 contracts, RuntimeStore semantics, compiler IR, host adapters, frozen PRD/L2, or release artifacts. xstate remains a devDependency reachable only from this spike and the frozen v0.1 regression graph; the published v0.2 artifact is unchanged.
