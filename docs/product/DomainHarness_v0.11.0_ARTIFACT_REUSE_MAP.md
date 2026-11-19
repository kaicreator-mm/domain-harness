# DomainHarness 0.11.0 — Existing Artifact Adoption / Reuse Map (Product Stage 1 Candidate)

> **Status:** Source inventory and migration planning; **NOT** an adopted L2, implementation Task DAG, validation/review credential, or release authority.
>
> Product owner: [#1564](https://github.com/kaicreator-mm/domain-harness/issues/1564); canonical version: [#1563](https://github.com/kaicreator-mm/domain-harness/issues/1563); document subject PR #1565. Re-evaluate each candidate against frozen L2 and the current integration SHA before assigning write sets.

## 1. Canonical destinations and non-duplicating strategy

Source `main@b1b2c182c1cb49c1b63b1efaf57ff9132d9cf4b0` was read in GitHub:

| System owner | Existing package/path | v0.11 product responsibility | Boundary |
|---|---|---|---|
| BUILD | `tooling/build/` (`@kaicreator/domain-harness-build@0.10.3`) | Select target, Element/Function implementations, closed Package resources, BUILD/AOT artifacts | Extend existing BUILD; no `buildConsumer` per-business compiler |
| Contract | `packages/contracts/` (`@kaicreator/domain-harness-contracts@0.10.3`) | Single TypeScript/ABI contract for selected Functions, typed outcomes and exported selection identities | Do not duplicate as public/private competing truth |
| SDK | `packages/domain-harness/` (`@kaicreator/domain-harness@0.2.0` workspace) | Execute pinned App through one KDP/Kernel, lifecycle and selected public Function interfaces | Existing package as owner; do not publish a separate `dis-v011-runtime` |
| Package/KDP | existing selected KDP/Package System paths determined by L2 source trace | Technical init, one App Init, single execution/Effect/CAS/Replay authority | Never add a parallel second K/loader/Host |
| Prototype | `packages/dis-v011-runtime/` (private) | Historical *source* of reusable implementation and tests only | No separate product/Runtime and no new official package ABI from its version field |

## 2. Reuse decision register

Each row must receive a final `ADOPT_AS_IS | PORT_AND_DELTA_VALIDATE | REFERENCE_ONLY` disposition in L2/Task Pack. The decision below is *provisional* based on available source and evidence, not a merge authorization.

| Source evidence identity | Existing code/test evidence | Provisional disposition | Destination / minimum necessary validation |
|---|---|---|---|
| Product #1477, Freeze comment #6656582209; Boot/KDP #1484; accepted CV-01..12 | Product ontology, single Kernel authority, trusted BUILD→App assembly | **ADOPT_AS_IS** | Inherit references into v0.11 PRD/L2. Do not re-freeze historical exact blobs |
| DIS Product #1496 + Draft #1497 | Element-first semantic and technical design; Full 21-row separate from bounded product exit | **ADAPT_CONTRACT** | Select applicable normative/candidate clauses at version L2; preserve UNKNOWN for incomplete formal authority. No second DIS Runtime |
| #1529 dev.1 @`4540f5fae282d3a62b379e8af1b39316c3ba3737` | `packages/dis-v011-runtime/src/element/**` parser/dependency/AOT/typed source + `src/bounded/**`; two-domain fixtures | **PORT_AND_DELTA_VALIDATE** | BUILD Element closure into `tooling/build`, canonical types into `packages/contracts`; keep unchanged fixture, test changed BUILD/consumer seam; do not rebuild parser just to change directory |
| #1540 dev.2 @`42fc57c2d2e7291ed4a7cf5578dd5a449029c864` | `src/app-init/**`, `src/function-call/**`, `src/domain-app.ts`; 138/138 scoped tests after Node24 build | **PORT_AND_DELTA_VALIDATE** | Actual SDK `packages/domain-harness` composition and main public call; old 138/138 is historical exact-SHA scoped proof only; add changed ABI/real host negative cases |
| S1 PR #1562@`97bb82e8929fd30b422c45de3d05a377f4c8ef27` | `src/app-init/session.ts`, `src/domain-app.ts` + six tests; Woodpecker #2644 verify + min-node SUCCESS | **CANDIDATE_PORT_AFTER_REVIEW** | Remove raw invoker READY bypass, drain admitted calls before dispose; retain source/test logic but review old private gate and new SDK concurrency/lifecycle compatibility |
| B1 PR #1560@`a2446beb03c0b881577c31bf9dd89bb30b9e2fc3` | `src/bounded/envelope.ts` + four tests; Woodpecker #2642 verify + min-node SUCCESS | **CANDIDATE_PORT_AFTER_REVIEW** | Never expose COMPLETED after caught budget error; determine if bounded selected Function required in Basic or optional profile. Keep existing ledger; minimal delta test after port |
| I1 PR #1561@`848beb20bc96196a1d28b2d830b970488e263aec` | `src/interaction/selected-intent.ts` + six tests; Woodpecker #2643 verify + min-node SUCCESS | **CANDIDATE_PORT_AFTER_REVIEW** | Optional Interaction Element, exact intent→candidate and explicit ambiguity choices; real SDK must only execute through existing authorized selected Function gate |
| #1559 old I0 | planned private two-domain `src/index.ts` wiring in `dis-v011-runtime` | **REFERENCE_ONLY** | Replace public-version exit with actual canonical `tooling/build` + `packages/domain-harness` E2E. Reuse known inputs/source pins rather than rewriting business domains |
| Full DIS #1499/#1544 / Owner-scoped Host #1527 | normative Full and single Function signed Host work separate | **REFERENCE_ONLY unless exact applicability proven** | Neither Original SAP/ECP/Effect/21-of-21 nor new SDK public path is automatically qualified. No counterfeit authority |
| Legacy `business-dis-player` / `recognizePlayer` / `dis.consume` in private `src/index.ts`, `provider-bindings.ts` | useful constrained xDownload Player Demo, not a general target-neutral builder | **REFERENCE_ONLY for generic BUILD** | Move common mechanism only; leave historical bytes unchanged and prove generic BUILD with Tally and xDownload inputs, no domain constants in generic owner |

## 3. Task impact selection and test reuse rules

- P0/L2 should output `old_source_blob + old_source_commit → target_package/path → contract difference → accepted disposition → delta tests → owner`. This is a practical *implementation handoff*, not an extra governance system.
- **No direct merge of private dev.3 into official 0.11.0.** Reuse individual clean functions/tests via legal new Task branches from `version/v0.11.0` after Product/L2/Native DAG admission.
- Preserve original `#1529/#1540` successful evidence as historical; no new CI to reconfirm unchanged old SHA. Migration tests focus on changed SDK/BUILD boundary, public ABI, multiple functions, lifecycle, wrong domain/locked resource, stale/UNKNOWN and Effect denial.
- Selected optional features should be tested only when part of the v0.11 version Product target; not all future Harness/Experience/Meta modes are required for Basic App. Existing Full Conformance is not silently excluded by an engineering scope decision.
- **No source ownership duplication**: only `tooling/build` is the canonical BUILD owner; only `packages/contracts` (or one L2-defined owner) is the normative shared contract; only `packages/domain-harness` is the SDK owner; business source remains business-owned; KDP remains unique Effect authority.
- Once exact current SDK/BUILD docs and contracts are frozen, decompose coherent write sets C1–C5 without forcing one Task per historical PR or rerunning full version history. An unreviewed candidate is not accepted code; CI green is not reviewer or qualified release evidence.

## 4. Open high-impact decisions for L2

1. How v0.11.0's public SDK/BUILD/Contract versions and exports relate to current workspace `0.2.0`, BUILD/Contracts `0.10.3`, private Demo `0.11.0-dev.2` (these are *actual different current versions*).
2. Which existing v10 KDP/Package source entrypoint is the exact owner/connector for one generated Domain App; do not infer replacement from the Demo's `src/boot.ts`.
3. Exact typed Function/Element public ABI: where Contract is canonical, which fields are producer/BUILD-time static, which are runtime live decisions, and which are optional.
4. Source-owner and Oracle qualification profile for authentic Tally/xDownload selected Functions; maintain observational/UNKNOWN results if original professional truth is missing.
5. How the private already-written modules are adopted so that risk-based *new-version review* covers actual changed ABI or concurrency boundary, not unmodified historical code.

**Current status:** Product/L1 Candidate → Review pending; L2 NOT_FROZEN; no Task admitted or public v0.11 source yet.
