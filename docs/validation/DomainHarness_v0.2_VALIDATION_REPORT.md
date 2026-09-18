# DomainHarness v0.2 Validation Report

## Closure identity

```text
Version: v0.2
Task: T-024
Issue: #144
CANDIDATE_FROZEN_SHA=3019b064faccbc5ede9ce4f8c67e23c8703996f6
CANDIDATE_TREE_SHA=7709db6d064926c09de66fd13f917eb57119e0c6
Development Standard: 0446f04583f6cf464c835f26e2f657c8b703cb4e
```

The candidate was frozen only after T-018..T-023 were merged and both pre-closure Windows test-harness portability concerns (#141/#142 and #143/#145) were resolved. `v0.2_t024` was created directly from the exact candidate SHA above.

T-024 commits are closure/evidence documents. They do not retarget the executable candidate used by owner-held Hidden Validation.

## Executive result

| Item | Result |
| --- | --- |
| Candidate Prepared | PASS |
| Candidate Freeze | PASS — `3019b064faccbc5ede9ce4f8c67e23c8703996f6` |
| AC1–AC45 visible reconciliation | PASS |
| G1–G33 visible reconciliation | PASS |
| G33 authority-boundary review | PASS |
| visible unresolved Runtime P0 | 0 |
| visible unresolved Runtime P1 | 0 |
| G34 Hidden Validation | BLOCKED — owner-held, not executed by T-024 |
| Visible Closure | COMPLETE after T-024 concern review/merge |
| Release Qualification | BLOCKED on G34 |
| Release READY / tag / publish | NOT AUTHORIZED |

This report deliberately distinguishes visible closure from Release Qualification. A task/CI/visible gate PASS is not a v0.2 release PASS.

## Final-tree regression / packaging sanity

The final pre-freeze concern #143 was validated at exact HEAD `70a35479e4e481984af5a5d75985580c39ab7501`. That commit and the frozen merge-result candidate have the same Git tree SHA `7709db6d064926c09de66fd13f917eb57119e0c6`.

Accordingly the frozen candidate has content-identical final-tree evidence:

- Windows x64, Node v26.8.1 / npm 11.19.0;
- root lint PASS;
- root typecheck PASS;
- root `npm test` PASS — 143 tests, 0 failures;
- compiler clean packed-consumer PASS, including a temp path containing spaces;
- T-016 Node packed-consumer portability fix present in the same tree;
- Linux clean-checkout Minimal CI PASS — pipeline 130;
- #143 fresh Independent Review PASS with findings P0/P1/P2/P3 = 0/0/0/0.

This is evidence preservation by exact tree identity. It is not a rule that an arbitrary successor SHA inherits older evidence.

## Platform and Critical Journey closure

### Node

T-018 / PR #140 provides real Node host evidence against its exact reviewed/validated task HEAD:

- integrated Node Runtime G30 conformance PASS, repeated three complete runs with zero flakes;
- real SIGKILL durable-ACK restart journey PASS;
- real SIGKILL effect-journal replay journey PASS with no duplicate semantic Tool execution;
- real SIGKILL poison/recovery journey PASS;
- G6–G20 affected integrated matrix PASS;
- lint/typecheck/build and relevant focused suites PASS.

Later closure changes do not alter the validated Node Runtime semantics; the last pre-freeze change is test-harness-only and the frozen final tree passes the full root regression.

### Non-Node / Expo Android

T-019 / PR #133 provides real Expo Android/Hermes evidence on exact task HEAD `1fc85601b7297d5dfc0f4288b59968626eb96e92`:

- G4 PASS on a real Expo/Hermes + `expo-sqlite` host;
- G30 PASS using the same frozen T-017 semantic conformance report;
- AC-42 PASS;
- prepared revision 1 state persisted;
- real `adb shell am force-stop`;
- cold relaunch with new process identity and same database;
- rehydration and completion to revision 2 PASS;
- fresh Independent Review PASS; no P0/P1/P2/P3 finding.

Subsequent T-020/T-021 compiler compatibility changes, T-022 tests, T-023 docs and #141/#143 portability-test changes do not modify the real Expo Runtime implementation under this validation lineage.

## Migration and package-version closure

- T-020 / G31 / AC-43: PASS on `202279e2d68ad6d3193a7533cd54ecf4f37a3cae`; non-trivial v0.1 expr equivalence; exact-SHA Minimal CI and independent review PASS.
- T-021 / G32 / AC-44: PASS on `ff2046b900df8af944ac9668b28ff357ad685491`; focused migration 3/3 on Linux and Windows, Linux full regression 142/142, exact-SHA Minimal CI and independent review PASS.
- T-022 / G21/G27/G28/G29: PASS on `a59286f9d97ed52f481263947dff1310d48d601a`; real B-pinned sender → A-pinned target incompatibility rejected pre-ACK; package A/B pinning, retention and corrupt/incompatible activation fail-closed verified; independent review PASS.

## Query / Projection / Subscription closure

- T-014 final product validation after the domain-data review correction: PASS at `191faac6bf7ddd45c53fafac1a971f5101669375`; root regression 122/122; focused Projection 10/10; G22/G24/G25/G26 PASS; missing Domain Data fails closed; no external-I/O authority. A later CI-only workflow successor was independently reviewed/closed without product/runtime/test change.
- T-015: PASS at `dfb4ac395b2b16d5cbe12d461948560b1792ed4c`; root regression 122/122; focused Subscription 6/6; G22/G23 PASS; no durable subscriber log or Node EventEmitter dependency.

## G33 architecture / release authority review

G33 is **PASS**.

The integrated candidate preserves the frozen authority boundary:

- DomainHarness owns Runtime mechanics, not domain/business meaning.
- authoritative User/Business Data remains application/domain-owned;
- Projection consumes declared read-only inputs and remains derived/non-authoritative;
- stale Projection data cannot authorize mutation without fresh authoritative revalidation;
- Runtime Core stays portable while SQLite/Script/HTTP are host bindings/resources;
- runtime startup does not rediscover/recompile a Raw Domain Package;
- active instance package pinning is explicit and fail-closed;
- provider/model routing and AI orchestration remain outside DomainHarness;
- no generic distributed broker, transaction coordinator, read-model database, generic query platform or UI framework is introduced.

Full AC and gate mapping is recorded in `docs/validation/v0.2/closure/T024_AC_GATE_MATRIX.md`.

## Hidden Validation / release boundary

G34 remains **BLOCKED** because owner-held Hidden Validation has not been executed by T-024. The executable handoff is:

`docs/validation/v0.2/closure/T024_HIDDEN_VALIDATION_HANDOFF.md`

It is pinned to the same exact candidate SHA `3019b064faccbc5ede9ce4f8c67e23c8703996f6` and covers the frozen G34 classes: crash boundaries, invalid package/messages, incompatible package/version, Tool failures, ordering/dedup, terminal dispositions, Projection failures/revalidation and recovery paths.

Until G34 PASS is recorded on this exact candidate (or a newly reconciled successor candidate), v0.2 Release Qualification is `BLOCKED`. T-024 does not authorize `main` integration, tag, GitHub Release or package publication.

## Closure artifacts

- `docs/validation/v0.2/closure/T024_EVIDENCE_INVENTORY.md`
- `docs/validation/v0.2/closure/T024_AC_GATE_MATRIX.md`
- `docs/validation/v0.2/closure/T024_HIDDEN_VALIDATION_HANDOFF.md`
- `docs/validation/DomainHarness_v0.2_VALIDATION_REPORT.md`

## Known limitations / deferred release work

There is no visible unresolved P0/P1 Runtime blocker at Candidate Freeze. The remaining mandatory release work is G34 owner-held Hidden Validation and the release-authority decision that follows it. This is not renamed or waived as a deferred item.
