# DomainHarness v0.8 — Package-first Scope and Reuse Plan (DAG successor)

> **Status: PROPOSED SCOPE/DAG ADDENDUM — requires reviewed L2 delta [#1023](https://github.com/kaicreator-mm/domain-harness/issues/1023); NOT a frozen Task DAG rewrite, implementation/CI PASS or Release Qualification.**
> Original frozen-content-preserving planning checkpoint with an additive, byte-changing successor appendix: [v0.8 Task DAG](./DomainHarness_v0.8_TASK_DAG.md); [L2 Product-boundary successor](../architecture/DomainHarness_v0.8_L2_PACKAGE_FIRST_SUCCESSOR.md). Original frozen Product [#953](https://github.com/kaicreator-mm/domain-harness/issues/953) and L2 [#999](https://github.com/kaicreator-mm/domain-harness/issues/999) retain exact historical identity; application-level FR/HF/NF acceptance is not downgraded.

## 1. Current live implementation base (2026-10-13)

| Formal DAG | GitHub | Current live Issue | Reuse; no unnecessary rewrite |
| --- | --- | --- | --- |
| T-A Package ABI & BUILD | [#1000](https://github.com/kaicreator-mm/domain-harness/issues/1000) | CLOSED | `packages/domain-harness-compiler/src/qualified-package/{build.ts,qualify.ts,approval.ts,payload/}`; current qualified Package root |
| T-B Microkernel `load(package)` | [#1001](https://github.com/kaicreator-mm/domain-harness/issues/1001) | CLOSED | `packages/domain-harness/src/public-v8/{load,microkernel,contracts}.ts`; preserve one-arg API |
| T-C Kernel authority / CAS | [#1002](https://github.com/kaicreator-mm/domain-harness/issues/1002) | CLOSED | `.../qualified-package/payload/kernel-mechanism-v1.mjs`; reuse current selected mechanism, Journal, recovery |
| T-D Standard Kind functional retention | [#1003](https://github.com/kaicreator-mm/domain-harness/issues/1003) | OPEN | `.../qualified-package/payload/standard-sdk-v1.mjs`; FR02, model measurement, Decision/Workflow/Operation and oracles |
| T-E Node physical resources + scoped UX | [#1004](https://github.com/kaicreator-mm/domain-harness/issues/1004) | CLOSED | `packages/domain-harness/src/host-v8/` + `public-v8/kernel-host.ts`; retain real CAS/auth/UX tests, reassign capability ownership only where proven |
| T-F two real Domain Apps | [#1005](https://github.com/kaicreator-mm/domain-harness/issues/1005) | OPEN | Existing Approval+Engineering fixtures and [PR #1012](https://github.com/kaicreator-mm/domain-harness/pull/1012); same K/S, distinct B; #1013/#1016 integrated; oracle [#1017](https://github.com/kaicreator-mm/domain-harness/pull/1017)/[#1018](https://github.com/kaicreator-mm/domain-harness/pull/1018) |
| T-G real validation/closure | [#1006](https://github.com/kaicreator-mm/domain-harness/issues/1006) | OPEN | Real Node22/24, CAS, hidden, clean consumer, 34 FR/HF + NF + FR08, fresh review, Release Qualification |

Formal Issue closure count 4/7 = 57% of Issues, **not** release completion. Initial source-admission baseline was `v0.8@93f4cc911afc373815b948dc6c38a1ed72bee524`; subsequent #1022 and #1017 merged and moved branch to `016549f70339318087a02b81f1ae46a136830127`. Re-read head/claims at execution; this table is not a live lock.

## 2. v0.8 P0 REQUIRED — only bounded new work

| ID | Scope / falsifiable test | Existing assets | Owner and dependency |
| --- | --- | --- | --- |
| S01 | **Closed-world build/runtime responsibility map**: every current `trust/installer/Host` check individually classified BUILD, **independently verified immutable deployment/install**, Package-init, or runtime caller policy, with preserved pre-import frozen negative witness. No BUILD-only self-attestation substitutes for independently approved *actual installed bytes*; before any source migration, current `trust/installer` checks remain binding. | #1000 BUILDer, #1001 load, #1004 bootstrap, #1013 wiring | **#1023 L2 review first**; `PRODUCT_DECISION_REQUIRED` if frozen Product acceptance is not equivalent |
| S02 | **Extensible Package/Capability load**: a non-K/S/B capability with fixed Handler executes without new Microkernel kind-specific branching. Prove pure Schema remains uncallable. Current hardcoded Kind list examined. | `public-v8/contracts.ts`, K/S module endpoints and existing qualified BUILD | #1023 single narrow ABI fix *only if existing seam inadequate*, independent review |
| S03 | **Minimal Package lifecycle**: optional `init/dispose` or verified equivalent; BUILD-bound capability-limited immutable ctx, deterministically ordered init, refusal of init failure, reverse best-effort cleanup, no exposure of partially initialized facade, idempotent disposal, typed cleanup failures. Top-level imported JS may already run, so claim no later Package init, NOT rollback of module evaluation. No generic init-script VM. | existing K/S construction and facade `stop()` | #1023; no duplicate Kernel instance engine |
| S04 | **Unified callable Operation**: at least one pure and one effectful OperationCall over stable envelope/input/output/error/effect class; fixed BUILD-selected Handler and exposure policy. Any mutation or `effectClass != none` **must traverse independently authenticated authorized non-agent caller → Business/Capability scope/exposure → K Admission → Journal/Effect/UNKNOWN**; **v0.8 LLM/Agent Tool projection remains read-only**, retaining `SDK_AGENT_MUTATION_REFUSED` for any effectful agent-exposed operation; direct LLM/app privileged Handler import denied with zero effect/journal. Kernel retains authoritative Effect/Journal. | #942 unified Component/optional Operations, selected S `operation`, K dispatcher, Approval App | #1023 contract and minimal integration; **coordinate ongoing T-D/T-F**, no write collisions |
| S05 | **Capability-owned platform implementation evidence**: one actual Node implementation explicitly owned by its capability contract; preserve existing sqlite/CAS/UX behavior and independent environment/deployment verifier. **Exactly one BUILD-selected non-shadowable** Identity Capability verifies caller dynamically with H-provisioned secrets; K accepts authenticated fact ONLY from protected H/K channel (not Business/agent JSON); instrumented ModelPort measurement is witnessed by actual port. Do **not** introduce general `host-node` Domain Package. | #1004 physical CAS and resources, #1002 K Journal | #1023 ownership mapping and small adapter only if needed |
| S06 | **Real app and safety regression**: same exact K/S in Approval and Engineering, relevant existing FR/HF/NF, no second Host-owned Domain Runtime, real effects/UNKNOWN/replay, unauthenticated caller refusals and cross-tenant isolation. | #1005 + #1006 and their in-flight PRs | **existing owners #1005/#1006**, plus focused #1023 deltas; no new demo |

**Conditional qualification:** S01's build/runtime trust redistribution conflicts with **frozen Product FR06/NF03/NF04**, not just L2 U01/U02. Preferred option A is a separately trusted pre-execution **immutable deploy/install verifier** tied to the actually executed artifact (no Package membership reapproval in Microkernel); **option A(a)** is specifically the build-prelinked opaque handle whose loader imports from the statically locked, independently verified artifact location ONLY—not arbitrary `moduleSource` inside a caller root. A forged root submitted after deployment must get typed refusal before any unapproved code import. Existing Host/load gate remains binding until an actual clean-consumer equivalence witness exists. Otherwise option B requires an explicit bounded Product successor decision. No silent runtime gate deletion. Other cross-cutting concerns also remain: a unique non-shadowable Identity Capability and protected verified-caller fact, frozen single-primary Product owner continuity, and constrained OperationCall admission/read-only agent exposure. None is a reason to stop unrelated #1003/#1005 work.


## 2a. Independent reviewer R1 closure matrix — issue #1023

| Finding | Required bounded documentary repair | Follow-on authority/tests |
| --- | --- | --- |
| P1-TRUST-01 | Option A **independently verified immutable deployment/install boundary before any module import**, binding actual artifact bytes+publisher+build subject; no BUILDer self-trust. Option B bounded Product decision if equivalence cannot be shown. | Frozen FR06-N / NF03-N / NF04-N stay binding, original loader gates stay until exact candidate passes |
| P1-AUTHN-01 | Named **Identity Capability** verifies true issuer/tenant/app/instance/expiry/revocation each request; H environment provisions verifier keys and protected transport; K performs dynamic authorization. | PF02, FR10-N, FR15-N, read/write/subscribe denial |
| P1-OWNER-H-01 | Source-linked accountable H role matrix FR06, NF03/NF04, HF28, HF29, HF33, NF06, FR08, PF02 and tests in [L2 successor §5](../architecture/DomainHarness_v0.8_L2_PACKAGE_FIRST_SUCCESSOR.md). Platform implementation owner does not erase independent assurance role. | Existing current Node/physical Host tests all retained; no claimed unsupported Expo parity |
| P1-OPCALL-01 | Pure/read and effectful call envelopes distinguished; effectful and all mutation require authenticated scope, exposure and **K Admission → Journal/Effect/UNKNOWN**. | Unauthorized LLM/app direct tool: typed denial, zero effect/journal; no bypass |
| P2-LIFECYCLE | Immutable capability-limited init ctx; top-level module evaluation caveat; reverse best-effort dispose + typed failure | Real ordered init/fail-cleanup assertions, no hidden side effects claim |
| P2-MODEL | Model Capability's *actual* instrumented port reports measured usage under H-provisioned verified boundary | Otherwise `unmeasured|unsupported`, FR08 +/- |
| P2-EXTENSIBILITY | Generic additional callable capability must neither replace single K nor create a second effect authority | BUILD selected role/endpoint/Handler, missing/forged/ambiguous denial |
| P2-CHECK-MAP | Per-check stage/owner+negative matrix in L2 successor §5 | T-F/T-G actual tests after code, not docs-only PASS |
| P3-CORRECTIONS | Do not duplicate NF05/06; distinguish frozen-content preserving appendix from byte-immutability; precise files `build.ts/qualify.ts/approval.ts` | Contract nomenclature checked against current actual ABI |

**Nothing in this repair has yet run a native Build Host test.** The Product-equivalence option remains proposed until independent reviewer accepts it and real deployment tests prove it. Source changes require a separate JIT PR if still necessary.

## 2b. R1 independent review (9cfd972) → R2 documentary disposition

**Previous R1 terminal:** `NEEDS_REVISION`, P1=2/P2=3/P3=2 (see [#1023](https://github.com/kaicreator-mm/domain-harness/issues/1023#issuecomment-6150297164)). This R2 changes ONLY the proposal/docs; it is **not** itself an independent review or a clean-consumer proof.

| R1 blocker | R2 proposed closure | Remaining real gate |
| --- | --- | --- |
| P1-TRUST-02 | Select **option A(a)**: independently installed and integrity-verified executable App has a sealed static import map; `load(package)` consumes an **opaque prelinked handle referencing that same installed location** and cannot import arbitrary caller-provided `moduleSource`; post-acceptance forged root must be refused before executable import | Actual Build/deploy/packed-consumer proof and independent negative, otherwise Product decision |
| P1-OWNER-02 | Copy frozen **single primary owner verbatim** in successor ledger: FR06=M, NF03/NF04=BUILD, FR10/FR15=U, HF29/HF33=H, NF06=S; separate H implementation/assurance columns. **No Product primary owner transfers proposed for v0.8.** | Product/L2 review of per-ID owner equivalence; source reorganization is NOT a Product owner change |
| P2-AUTHN-02 | Exactly one BUILD-selected non-shadowable Identity Capability; only protected H→K gateway may provide signed/scoped verified-caller fact; B/other Capability cannot fabricate | Runtime fake verified fact/Identity shadow negative in T-G |
| P2-OPCALL-02 | Agent/LLM-facing v0.8 operations remain **read-only**, `SDK_AGENT_MUTATION_REFUSED` retained. Effectful calls from authorized **non-agent** routes only after verified scope and K Admission | Existing HF23-N/FR15-N + actual OperationCall negative |
| P2-MAP-02 | Use **test title + source line**, not inconsistent A01 header ID: TOCTOU=`v08-abi-a01.test.ts:266 N3a`; hostile accessor=:290 N4; duplicate intent=:331 N5; failed activation=:348 N6; wrong kind/dangling=:360 N7; B01-N8(post) in `v08-host-b01.test.ts:523` | Existing tests retained; add static installed-artifact substitution negative |
| P3-04/05 | Frozen-content preserving DAG appendix explicitly described; S01 is **not** the only cross-cutting architecture decision | No new DAG or source mutation |

The existing `load.ts/installer.ts/trust.ts` still accept/validate root-carried source bytes, **not** the prelinked-only target; they remain operational until a separately reviewed, tested source revision implements the selected design. No immediate runtime-trust removal is authorized by docs-only work.

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

- [ ] Independent immutable deployment/install proof for actual approved executable bytes and Product FR06/NF03/NF04 equiv, or explicit Product successor authorization; source-only review is not enough to claim real proof
- [ ] Independent capability + OperationCall ABI composition under one real sealed root (including Schema-only negative)
- [ ] Package init/dispose or evidenced lifecycle equivalent, positive + failed init reverse-cleanup cases
- [ ] Platform-specific Node implementation selected by BUILD, owned by capability contract; **frozen L1 primary owners M/BUILD/U/S/H unchanged**; H assurance and named Identity/Model/Resource/Observation implementations with real negatives survive
- [ ] Same K/S selected bytes and two meaningful Approval/Engineering B apps run
- [ ] No runtime ad-hoc provider selection; no second Host State/Effect/Journal authority
- [ ] Retained FR/HF/NF negatives, scoped caller restrictions, CAS/UNKNOWN/replay/fault and clean consumers checked against changed exact SHA
- [ ] Full regression, Hidden, Critical Journey, packaging, independent Review, Release Qualification performed/waived only according to existing ADS policy

**No new fake release percentage from this document.**
