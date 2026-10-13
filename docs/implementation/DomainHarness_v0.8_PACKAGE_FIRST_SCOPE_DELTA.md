# DomainHarness v0.8 — Package-first Scope and Reuse Plan (DAG successor)

> **Status: PROPOSED SCOPE/DAG ADDENDUM — requires reviewed L2 delta [#1023](https://github.com/kaicreator-mm/domain-harness/issues/1023); NOT a frozen Task DAG rewrite, implementation/CI PASS or Release Qualification.**
> Original immutable planning snapshot: [v0.8 Task DAG](./DomainHarness_v0.8_TASK_DAG.md); [L2 Product-boundary successor](../architecture/DomainHarness_v0.8_L2_PACKAGE_FIRST_SUCCESSOR.md). Original frozen Product [#953](https://github.com/kaicreator-mm/domain-harness/issues/953) and L2 [#999](https://github.com/kaicreator-mm/domain-harness/issues/999) retain exact historical identity; application-level FR/HF/NF acceptance is not downgraded.

## 1. Current live implementation base (2026-10-13)

| Formal DAG | GitHub | Current live Issue | Reuse; no unnecessary rewrite |
| --- | --- | --- | --- |
| T-A Package ABI & BUILD | [#1000](https://github.com/kaicreator-mm/domain-harness/issues/1000) | CLOSED | `packages/domain-harness-compiler/src/qualified-package/{build,qualify,approval,payload}/`; current qualified Package root |
| T-B Microkernel `load(package)` | [#1001](https://github.com/kaicreator-mm/domain-harness/issues/1001) | CLOSED | `packages/domain-harness/src/public-v8/{load,microkernel,contracts}.ts`; preserve one-arg API |
| T-C Kernel authority / CAS | [#1002](https://github.com/kaicreator-mm/domain-harness/issues/1002) | CLOSED | `.../qualified-package/payload/kernel-mechanism-v1.mjs`; reuse current selected mechanism, Journal, recovery |
| T-D Standard Kind functional retention | [#1003](https://github.com/kaicreator-mm/domain-harness/issues/1003) | OPEN | `.../qualified-package/payload/standard-sdk-v1.mjs`; FR02, model measurement, Decision/Workflow/Operation and oracles |
| T-E Node physical resources + scoped UX | [#1004](https://github.com/kaicreator-mm/domain-harness/issues/1004) | CLOSED | `packages/domain-harness/src/host-v8/` + `public-v8/kernel-host.ts`; retain real CAS/auth/UX tests, reassign capability ownership only where proven |
| T-F two real Domain Apps | [#1005](https://github.com/kaicreator-mm/domain-harness/issues/1005) | OPEN | Existing Approval+Engineering fixtures and [PR #1012](https://github.com/kaicreator-mm/domain-harness/pull/1012); same K/S, distinct B; #1013/#1016 integrated; oracle [#1017](https://github.com/kaicreator-mm/domain-harness/pull/1017)/[#1018](https://github.com/kaicreator-mm/domain-harness/pull/1018) |
| T-G real validation/closure | [#1006](https://github.com/kaicreator-mm/domain-harness/issues/1006) | OPEN | Real Node22/24, CAS, hidden, clean consumer, 34 FR/HF + NF + FR08, fresh review, Release Qualification |

Formal Issue closure count 4/7 = 57% of Issues, **not** release completion. Current observed integration branch `v0.8@93f4cc911afc373815b948dc6c38a1ed72bee524`. Re-read head/claims at execution; this table is not a live lock.

## 2. v0.8 P0 REQUIRED — only bounded new work

| ID | Scope / falsifiable test | Existing assets | Owner and dependency |
| --- | --- | --- | --- |
| S01 | **Closed-world build/runtime responsibility map**: every current `trust/installer/Host` check explicitly classified BUILD/deployment, Package-init or runtime request policy. Do not silently remove frozen byte/issuer guarantees. | #1000 BUILDer, #1001 load, #1004 bootstrap, #1013 wiring | **#1023 L2 review first**; `PRODUCT_DECISION_REQUIRED` if frozen Product acceptance is not equivalent |
| S02 | **Extensible Package/Capability load**: a non-K/S/B capability with fixed Handler executes without new Microkernel kind-specific branching. Prove pure Schema remains uncallable. Current hardcoded Kind list examined. | `public-v8/contracts.ts`, K/S module endpoints and existing qualified BUILD | #1023 single narrow ABI fix *only if existing seam inadequate*, independent review |
| S03 | **Minimal Package lifecycle**: optional `init/dispose` or verified equivalent; deterministically ordered init, refusal of init failure, reverse cleanup; no generic init-script VM. | existing K/S construction and facade `stop()` | #1023; no duplicate Kernel instance engine |
| S04 | **Unified callable Operation**: at least one pure and one effectful OperationCall over stable envelope/input/output/error/effect class; fixed BUILD-selected Handler; Kernel retains authoritative Effect/Journal. | #942 unified Component/optional Operations, selected S `operation`, K dispatcher, Approval App | #1023 contract and minimal integration; **coordinate ongoing T-D/T-F**, no write collisions |
| S05 | **Capability-owned platform implementation evidence**: one actual Node implementation explicitly owned by its capability contract; preserve existing sqlite/CAS/UX behavior. Do **not** introduce general `host-node` package. | #1004 physical CAS and resources, #1002 K Journal | #1023 ownership mapping and small adapter only if needed |
| S06 | **Real app and safety regression**: same exact K/S in Approval and Engineering, relevant existing FR/HF/NF, no second Host-owned Domain Runtime, real effects/UNKNOWN/replay, unauthenticated caller refusals and cross-tenant isolation. | #1005 + #1006 and their in-flight PRs | **existing owners #1005/#1006**, plus focused #1023 deltas; no new demo |

**Conditional qualification:** S01's build/runtime trust redistribution conflicts with frozen L2 U01/U02; direct implementation of removing the trusted Host admission cannot proceed until a reviewed successor proves frozen Product observables or authorizes a bounded Product revision. This is the only cross-cutting architecture decision blocking #1023 completion, not a reason to stop unrelated #1003/#1005 work.

## 3. v0.8 OPTIONAL, non-blocking

- File/directory changes making existing **physical** Kernel/Standard Package source more visible; current compiled payload modules already run. **No compulsory full source migration**.
- Separate `compiler` into Forge-specific domain generation (future) and reusable generic BUILD (already exists) by documentation/public API first; do not move entire compiler to Forge.
- Relocate `host-v8` code behind owning capability modules **only with proven use and stable tests**. Keep shared reusable primitives as needed; do not substitute central catch-all Host Domain Package.
- Delete obsolete old runtime code only after import graph + retained-function checks prove no active dependency. No historical v0.7 ABI compatibility.
- SDK workspace renaming or npm publication reshaping only when a pack-clean-consumer regression proves low risk and there is no collision with existing tasks.

## 4. DEFER post-v0.8 (proposed next milestone, not current release gate)

| ID | Successor scope | Reason for deferral |
| --- | --- | --- |
| N01 | Full capability-owned Domain Package family (Storage, File, Network, Model, Script, Device etc.), library/reuse/version governance | v0.8 requires **one generalized proof**, not a market or family of implementations |
| N02 | Full Node/Browser/Embedded implementations per capability, broad source reorganization, elimination of temporary centralized Host implementation | Architectural cleanup beyond minimum two real Apps |
| N03 | Forge's executable Business Package code generation plus Creator/Simulator/UX full multi-repo BUILD integration | Current Product allows hand-authored first Genesis; other projects have separate DAC authority |
| N04 | Portable JS execution profile conformance + QuickJS embedded in Rust/Go/C Microkernel, native FFI and async module resolution | v0.8 is actual TS/Node; do not claim other engines execute unchanged Node code |
| N05 | ToolCall streaming, cancellation, long-running/remote dispatch, multi-runtime support and dynamic packages | No frozen v0.8 product evidence for a universal advanced Tool framework |
| N06 | Full future release layout/semantic version/multi-engine packages | Avoid destabilizing existing K/S and closure while T-F in flight |

Portable implementation design note: TS authored source **compiles to portable JS module**; Node builtins are not portable to QuickJS. Build pins any external/native implementations supplied by the **capability owner**. Future Microkernel port does not imply zero platform adapter work.

## 5. Scheduling — drain, JIT, one concern

```text
Existing now:    #1003 T-D ----┐
                 #1005 T-F ----┼----> #1006 T-G full validation / release
L2 correction:   #1023 L2 review + (if needed) one minimal ABI/lifecycle fix ---┘
```

- DO NOT stop/redo/duplicate ongoing #1003/#1005 builder work, and do not reclone #1012/#1017/#1018/research spikes; work must remain in disjoint write sets.
- Review successor L2 **before** any authority-sensitive `trust.ts`/`installer.ts`/`host-v8` edits. Record an explicit authorized Product disposition if frozen v0.8 security behavior would change.
- #1023 may close **without** implementation PR if exact-SHA source/tests already satisfy S02–S05. If not, create only one bounded JIT PR after in-flight conflicting changes merge; no broader Task DAG.
- #1006 may plan and execute independent non-conflicting tests in parallel; **Final v0.8 Release Qualification may not PASS** until #1023 is reviewed, any required changes land, and newly affected exact-head tests pass.
- No fake Claim, CI/Native/Hidden PASS; document `NOT_RUN` distinctly. Fresh independent review for material ABI/authority changes; docs-only review independent when adopting L2 successor. `PR PASS != Release PASS`.

## 6. Quick verification checklist (a T-G input, not new tests declared PASS)

- [ ] L2/Product-equivalence decision on trust admission vs closed-world build recorded and reviewed
- [ ] Independent capability + OperationCall ABI composition under one real sealed root (including Schema-only negative)
- [ ] Package init/dispose or evidenced lifecycle equivalent, positive + failed init reverse-cleanup cases
- [ ] Platform-specific Node implementation selected by BUILD and owned by capability contract
- [ ] Same K/S selected bytes and two meaningful Approval/Engineering B apps run
- [ ] No runtime ad-hoc provider selection; no second Host State/Effect/Journal authority
- [ ] Retained FR/HF/NF negatives, scoped caller restrictions, CAS/UNKNOWN/replay/fault and clean consumers checked against changed exact SHA
- [ ] Full regression, Hidden, Critical Journey, packaging, independent Review, Release Qualification performed/waived only according to existing ADS policy

**No new fake release percentage from this document.**
