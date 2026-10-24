# DomainHarness v0.10.2 — L2 Amendment A3 (candidate): Safe parallel Task DAG

```ini
STATUS=PROPOSED_NOT_ADOPTED
ISSUE=#1345
FROZEN_L2_BLOB=68e7dbc591f4c0c694818ec574b8585f95239c8b
FROZEN_PRD_BLOB=746535c97e87c24b373a02175f8681015a16a589
FROZEN_FREEZE_BLOB=5e204b117f4ba4e8226831d1cf6ea5904b843942
A1_BLOB=face555d43bcbd92990db20f32600e337cc72a14
A2_BLOB=da304cc724eeb1309417b16cf543bdf34d7056f0
BASE=v0.10.2@cfa3beddf79996a624b6b265e6f1034e8998e30f
NODE24_PHYSICAL=NOT_RUN_DOCS_ONLY
INDEPENDENT_A3_REVIEW=PENDING
```

## 1. Purpose and retained authority

The user authorizes a parallel implementation schedule, not a waiver of existing ADS source admission, task gates or release qualification. The frozen L2 §12 implementation dependency chain still owns source authority unless this additive amendment receives independent exact-HEAD approval and is formally adopted. Product, L2, Freeze, K/S payload, ABI and wire literals remain untouched.

Adopted A1 and A2 continue to govern the early sequence `T07a3 #1343 → T00 #1319`. T05 must follow T00, T04 must follow T05+T01k. Existing final T11→T07b→T08b→T09→R01 qualification remains ordered. A3 **splits two existing concern groups**, without omitting any original test or changing behavior.

## 2. New early Task T03a: bounded Host foundations

**Depends on:** T00 #1319 MERGED+CLOSED. May execute beside T05 #1323, with exact pinned source HEAD from the accepted T00 version branch.

| Source ownership | Exact new-file path; no wildcard write permission |
| --- | --- |
| SQLite/CAS adapter | `packages/host-node/src/sqlite-cas.ts` |
| Scoped memory adapter | `packages/host-node/src/scoped-memory.ts` |
| Durable controls port | `packages/host-node/src/durable-controls.ts` |
| Physical CAS tests | `packages/host-node/tests/sqlite-cas.test.ts` |
| Scoped memory tests | `packages/host-node/tests/scoped-memory.test.ts` |
| Durable controls tests | `packages/host-node/tests/durable-controls.test.ts` |

Only move existing implementation semantics that do not require the Microkernel Facade or Host activation protocol: generic injected persistence/transaction CAS and deterministic scoped memory and durable control helpers. Preserve typed refusals and actual crash/recall negative cases; SQLite is optional/host-provided, **not a hard Runtime dep**. Direct imports limited to Contracts and Node built-ins where needed; no Microkernel→Host, Host→BUILD or Cargo/native binary cross-tier dependency. Only six paths authorized; if a needed legacy import or public-index change falls outside them, STOP, don't silently expand scope. T03a may use source-parity tests with an independent port but may not claim final Rich integration PASS.

**Prohibited T03a:** `packages/host-node/src/index.ts`, any `H/host-v8/**`, `C/v10build/**`, `C/v10{meta,shadow,evidence}/**`, CT02 invoker, deployment, README, package.json/lockfile, Catalog and frozen documents. T03a source/test work is disjoint from T05 BUILD/Acorn/import-policy files.

## 3. Existing T03 becomes T03b: Host integration

**Depends on:** BOTH T03a (new Task) and T04 #1324 MERGED+CLOSED. Keep original #1325 Issue for T03b after Controller appends formal scope/edge clarification. T03b owns all remaining frozen §12 T03 Host modules/shims, Meta/Shadow/Evidence/CT02, old H/host-v8 adapters, catalog serialized turn, Rich examples, scoped physical tests. Its `packages/host-node/src/index.ts` and non-T03a new files can bind T03a exports to the Microkernel Facade. T03b is forbidden to modify the six T03a files without an explicit separate file-level amendment. The original T03 scoped test matrix and reviewer focus remain mandatory: selected Facade verification, Shadow lookalikes, `externalImports.npm` digest-bound allowance and optional SQLite.

## 4. New parallel Task T06a: pure subscription projection

**Depends on:** T04 #1324 MERGED+CLOSED. May execute **beside T03b**, avoiding all T03b Host and catalog write paths. Exactly two new files:

- `packages/microkernel/src/subscription-projection.ts`
- `packages/microkernel/tests/subscription-projection.test.ts`

Author only pure transformations over immutable observer input: projection whitelist, typed-error redaction, STOP/refusal boundaries, delivery-ready predicates, and deterministic negative cases, using Contracts types. No Async Pump, Timer, shared registry, Host governed activation, dispatch, public export, actual subscription delivery or external Effect. No `packages/microkernel/src/index.ts`, existing Microkernel Facade paths, `packages/host-node/**`, catalog, manifests, K/S, test root integration files. If an API needs real Host binding, defer to T06b. Scoped tests can PASS pure behavior but never assert governed end-to-end subscribe/stop PASS.

## 5. Existing T06 becomes T06b: integration and governed controls

**Depends on:** BOTH T03b (#1325) and T06a (new Task) MERGED+CLOSED. Retain original #1326 Issue for T06b; it implements Microkernel observer registry/pump, async delivery recheck, public subscribe and stop, governed Host activation, typed error redaction against real Host seam, and the original frozen section 8 N1–N7 plus:

- `tests/assembly/v010-subscribe-stop.test.ts`
- `tests/hosts/node/v010-t08-governed-subscribe.test.ts`

T06b can consume pure T06a helper but may not rewrite its two source/test files without a reviewed amendment. Preserve original no-extra-error-code/wire literal rule. T11 #1327 depends on merged T06b and completed T08a #1322 as before.

## 6. Dependency graph and schedule

```text
T07a3 ──> T00 ──┬──> T05 ──> T04 ──┬──> T03b ───┐
                └──> T03a ────────┘             ├──> T06b ──> T11 ──> T07b ──> T08b ──> T09 ──> R01
                                    └──> T06a ──┘
T01k ─────────────────────────────> T04
T08a ─────────────────────────────────────────────────> T11 (independent edge)
```

Only after review and admission: `T03a` ∥ `T05` from post-T00 version HEAD; `T06a` ∥ `T03b` from post-T04 HEAD. All other frozen edges remain. DAG has no directed cycle or unordered shared file owner. No two live tasks may write the Catalog or C/v10build at once, and T07-exclusive manifests/lockfile remain unchanged. Two implementation workers per parallel phase, not all remaining tasks simultaneously.

## 7. Independent evidence, prework and closure

- T11 migration codemod mapping, T08b documentation outline, T09 external producer/test scaffold planning, R01 release checklist can be prepared **read-only or unmerged draft** in disjoint working branches before their original predecessor tasks. Such preparation cannot set final package exports, claim Tiny/Rich installed provenance, or close Tasks early.
- One concern per PR, real scoped test exits for each Task, reuse previously passed SHA-pinned evidence. Only *one* heavy Node24 `task-check` at a time; defer broad Full/Hidden/Critical Journeys to R01 after T09. Local Build Host needed for SQLite/Node24/physical tests, not to author the L2 amendment or plain docs.
- Exact SHA source review by different reviewer and P0/P1/P2 disposition before each code PR merge; clean worktree and status ledger, `NOT_RUN` explicitly recorded. CI failure may be reconciled through existing documented waiver only; never call failed CI PASS. `PR_PASS ≠ RELEASE_PASS`.

## 8. A3 adoption gate

Read-only, genuinely independent L2/DAG Reviewer must review this exact SHA, verify source/write sets and owner ordering against frozen §12 and original #1323–#1327, confirm pure T03a can be developed without T04, pure T06a doesn't require T03b implementation, and that no original acceptance case/test vanishes. Report `P0/P1/P2`, `PASS/BLOCK`, `A3_FREEZE_READY=YES/NO`, `PARALLEL_TASK_ADMISSION=YES/NO` at PR and #1345. On PASS, Controller may merge **only this additive document**, create two new Implementation Task Issues, amend existing #1325/#1326 entry criteria and #1300 DAG, then dispatch parallel work when their predecessors close. Do not merge this doc before independent PASS; do not retroactively authorize work by candidate issue text alone.