# DomainHarness v0.2 T-024 — AC / Gate Matrix

## Authority and candidate

- Frozen PRD: `docs/product/DomainHarness_v0.2_PRD_FROZEN.md` (R4)
- Frozen L2: `docs/architecture/DomainHarness_v0.2_L2_ARCHITECTURE_EVIDENCE.md`
- Task: T-024 / Issue #144
- Standard: `ai-development-standard@0446f04583f6cf464c835f26e2f657c8b703cb4e`
- Frozen candidate: `3019b064faccbc5ede9ce4f8c67e23c8703996f6`
- Candidate tree: `7709db6d064926c09de66fd13f917eb57119e0c6`

Status vocabulary is intentionally restricted to `PASS`, `BLOCKED`, and `NOT_APPLICABLE` where justified. For the frozen PRD's required G1–G34 set, no gate is treated as optional.

## PRD AC1–AC45 reconciliation

| AC | Status | Visible evidence / rationale |
| ---: | --- | --- |
| 1 | PASS | T-016 portable Runtime review + T-019 reachable-import boundary check; Runtime Core has no mandatory Node built-in foundation. |
| 2 | PASS | G1 / T-002 compiler validation: Raw Package → Target Compiled Domain Package. |
| 3 | PASS | G2 / T-002 capability-negative fixtures reject missing required host capability. |
| 4 | PASS | T-002/T-007/T-008/T-016 build-bound Host Binding model; runtime consumes compiled bindings. |
| 5 | PASS | T-008/T-016 runtime resources are injected; endpoint/token/session/database handles are not compiled package truth. |
| 6 | PASS | G11 / T-016 startup consumes compiled package registry + Runtime Resources only; no Raw runtime discovery/compilation. |
| 7 | PASS | G5 Node/Expo RuntimeStore implementations satisfy common RuntimeStore semantics; portable public contract is not `better-sqlite3`. |
| 8 | PASS | G6 integrated Node CJ / T-018 plus Expression Tool task evidence. |
| 9 | PASS | G7 integrated Node CJ; target-compiled Script bindings also exercised by real Expo/Hermes host. |
| 10 | PASS | G8 integrated Remote Tool CJ and Contract → transport binding → Runtime Resource boundary. |
| 11 | PASS | G9 Tool journal/replay; T-018 real crash boundary confirms committed Tool output is reused. |
| 12 | PASS | G10 negative validation + recovery path; ambiguous non-idempotent outcome never blind-retries. |
| 13 | PASS | G19 stable Workflow Address/correlation model exercised through public runtime. |
| 14 | PASS | G3/G12 Node restart + G4 real Expo cold-restart conformance. |
| 15 | PASS | G12 durable ACK occurs after persistence and target sequence assignment; real kill-after-ACK fixture survives restart. |
| 16 | PASS | G13 explicitly distinguishes accepted ACK from successful processing. |
| 17 | PASS | T-018 real SIGKILL durable-ACK journey proves accepted message survives process termination/restart. |
| 18 | PASS | G14 accepted target sequence controls processing order. |
| 19 | PASS | G15 duplicate/concurrent same-message validation yields one logical transition. |
| 20 | PASS | G16 terminal target rejection occurs before accepted ACK. |
| 21 | PASS | G16 recovery-required target rejects new state-changing messages while previously accepted state remains durable. |
| 22 | PASS | G17 poison processing failure becomes observable recovery-required state. |
| 23 | PASS | G17 later state-changing messages remain blocked behind unresolved poison message. |
| 24 | PASS | G18 validates public terminal disposition for accepted/unprocessed messages across normal and recovery terminal paths. |
| 25 | PASS | G19 correlation + causation persistence/observation validated in deterministic message chain. |
| 26 | PASS | T-016 public API + G22 App path; App uses `send`/Query/Subscription rather than Runtime internals. |
| 27 | PASS | G20 journaled Workflow→Workflow Domain Message CJ. |
| 28 | PASS | G21 T-022 actual B-pinned sender → A-pinned target incompatibility rejects before durable target acceptance. |
| 29 | PASS | G22 bounded Query is read-only; T-014 Query owns only read-side RuntimeStore methods. |
| 30 | PASS | G23 T-015 validates coalescing/latest-state convergence and reconnect via Query + resubscribe, with no durable subscriber log. |
| 31 | PASS | G24 T-014 combines two Workflow snapshots + Business snapshot + compiled Domain Data in one Dynamic Domain State. |
| 32 | PASS | T-014 BusinessSnapshotPort is read-only input; G33 review confirms DomainHarness does not become authoritative business storage. |
| 33 | PASS | Projection returns derived state only; authoritative mutation remains caller/domain-authorized and is separately revalidated. |
| 34 | PASS | G25 Projection receives declared JSON inputs only; no Domain Tool, AI Skill, Remote Tool, transport or external I/O authority. |
| 35 | PASS | T-014 bounded selector implementation + L2 review; no generic filter/index/pagination/materialized-view subsystem. |
| 36 | PASS | G26 stale Projection cannot authorize mutation without a fresh authoritative BusinessSnapshotPort read and predicate check. |
| 37 | PASS | T-010 serialized per-instance lane + T-018 integrated conformance: independent instances may progress concurrently without global mutation order. |
| 38 | PASS | G27/T-022 retained A stays pinned while new instance uses B; no silent reinterpretation. |
| 39 | PASS | G28/T-022 retained package inspection and restart missing-package failure prove pinned packages must remain loadable. |
| 40 | PASS | G29/T-022 rejects incompatible package and package-id corruption before execution. |
| 41 | PASS | G30 T-017 frozen semantic report reproduced by real Node and real Expo host adapters. |
| 42 | PASS | T-019 real Expo Android/Hermes + `expo-sqlite` passes G4/G30 and cold restart without Runtime Core Node built-ins. |
| 43 | PASS | G31/T-020 non-trivial v0.1 expr migration exercises both approved/review branches and compares public output/route behavior. |
| 44 | PASS | G32/T-021 v0.1 script migration executes non-trivial reference cases and preserves public `done -> completed` behavior. |
| 45 | PASS | G33 architecture/release authority-boundary review: User/Business authority, domain meaning and mutation policy remain outside DomainHarness; Projection remains derived/read-only. |

## G1–G34 visible closure matrix

| Gate | Status | Evidence anchor |
| --- | --- | --- |
| G1 Compiler / package contract | PASS | T-002 PR #101 final SHA `5ae81dc3e1ca3049067afee3c6794a3738225824`; validation #103; final Independent Review PASS. |
| G2 Target host capability | PASS | T-002 G1/G2 exact-SHA validation and fail-closed capability fixtures. |
| G3 Runtime Node host | PASS | T-016 exact-SHA assembly validation #117 + T-018 integrated real Node host conformance. |
| G4 Runtime non-Node host | PASS | T-019 PR #133 exact SHA `1fc85601b7297d5dfc0f4288b59968626eb96e92`; real Expo Android/Hermes + `expo-sqlite`. |
| G5 SQLite RuntimeStore contract | PASS | T-003 Node store, T-004 Expo store, then integrated T-018/T-019 host runs on real SQLite bindings. |
| G6 Expression Tool CJ | PASS | T-018 affected-gate matrix on integrated Node Runtime. |
| G7 Script Tool CJ | PASS | T-018 Node Script CJ + T-019 target-compiled Expo Script mechanism. |
| G8 Remote Tool CJ | PASS | T-018 affected-gate matrix / focused Remote Tool suite. |
| G9 Tool result journal / replay | PASS | T-018 real process-kill effect-journal journey + integrated suite. |
| G10 Ambiguous non-idempotent negative | PASS | T-018 integrated negative/recovery matrix; no blind retry. |
| G11 Activation without Raw Package | PASS | T-016 validation/review; packed clean-consumer path. |
| G12 Durable ACK + restart | PASS | T-018 real SIGKILL after durable ACK. |
| G13 ACK vs processing state | PASS | T-018 integrated message semantics. |
| G14 Ordering | PASS | T-018 integrated accepted-sequence tests. |
| G15 Duplicate / dedup negative | PASS | T-018 same-message/concurrency coverage. |
| G16 Terminal / recovery-required rejection | PASS | T-018 integrated lifecycle rejection coverage. |
| G17 Poison / recovery-required | PASS | T-018 real poison/recovery process-kill fixture. |
| G18 Accepted-pending terminal disposition | PASS | T-018 integrated normal/recovery terminal-disposition coverage. |
| G19 Workflow Address + correlation/causation | PASS | T-018 integrated public trace coverage. |
| G20 Workflow→Workflow messaging | PASS | T-018 affected matrix over T-012 journaled message effect. |
| G21 Cross-version message compatibility | PASS | T-022 PR #123 exact SHA `a59286f9d97ed52f481263947dff1310d48d601a`; focused validation PASS. |
| G22 App → Query/Projection → Subscription | PASS | T-014 G22 + T-015 G22 exact-SHA Build Host PASS; T-016 public wiring. |
| G23 Subscription coalescing/latest-state | PASS | T-015 validation #97, focused 6/6. |
| G24 Multi-workflow Dynamic Domain State | PASS | T-014 validation #104 after domain-data fix, focused projection 10/10. |
| G25 Projection deterministic / no I/O | PASS | T-014 exact-SHA boundary tests and source/dependency review. |
| G26 Projection skew / authoritative revalidation | PASS | T-014 stale-projection race fixture, fresh BusinessSnapshotPort read. |
| G27 Package compatibility / active pinning | PASS | T-022 focused package-versioning validation. |
| G28 Pinned package retention | PASS | T-022 persistent restart + missing retained package fail-closed. |
| G29 Corrupt/incompatible package fail-closed | PASS | T-022 `INCOMPATIBLE_PACKAGE` / `PACKAGE_ID_MISMATCH` pre-execution negatives. |
| G30 Behavioral-equivalence portability | PASS | T-018 Node G30 repeated 3×, T-019 real Expo G30; both match frozen T-017 report. |
| G31 v0.1 expr migration | PASS | T-020 PR #124 / validation #125 exact-SHA PASS. |
| G32 v0.1 script migration | PASS | T-021 PR #128 / validation #130 exact-SHA PASS; Linux + Windows focused tuples. |
| G33 L2/release authority-boundary review | PASS | T-024 review below; supported by Frozen PRD/L2, T-014/T-016/T-023 evidence and candidate dependency boundaries. |
| G34 Hidden Validation | BLOCKED | Owner-held Hidden Validation has not executed. Exact-candidate handoff is `T024_HIDDEN_VALIDATION_HANDOFF.md`. |

## G33 authority-boundary review

**Result: PASS.** No visible architecture/release authority contradiction was found on the frozen candidate.

The review checked the frozen Runtime authority principles and project overrides against the integrated evidence:

1. **Runtime mechanics vs domain meaning:** DomainHarness owns workflow/message/recovery/query/projection/package mechanics, while domain meaning, entities, policy and Tool semantics stay package/application-owned.
2. **Business authority:** User/Business Data reaches Projection through read-only snapshots; DomainHarness does not become the authoritative business store. A state-changing action using potentially stale Projection data must re-read authoritative facts before commit (G26).
3. **Projection boundary:** Projection is deterministic over declared Workflow/Business/compiled Domain Data inputs; no Tool/Skill/Remote/external-I/O capability is supplied to its evaluator (G25).
4. **Portable core / host boundary:** Runtime Core remains platform-independent; SQLite, Script execution and HTTP transport are host bindings/resources rather than portable-core authority.
5. **Build/runtime boundary:** Raw Package discovery and compilation remain build-time. Runtime activation uses only Target Compiled Package + Runtime Resources (G11).
6. **Package authority:** active/recoverable instance package pinning is explicit and fail-closed; incompatible replacement or missing retained package is rejected (G27–G29).
7. **AI boundary:** provider/model routing remains outside DomainHarness; no autonomous model-mediated Tool-selection loop was introduced.
8. **Scope protection:** no generic broker/event-stream, distributed transaction coordinator, generic query/read-model platform, generic UI framework or second business database is required by the candidate.

Therefore PRD AC45 is visibly satisfied. This G33 PASS does **not** substitute for owner-held G34.

## Candidate / release conclusion

```text
Visible required gates G1-G33 = PASS
G34 Hidden Validation          = BLOCKED(owner-held; not executed)
Visible P0/P1 Runtime blockers = 0
Candidate Freeze               = PASS for 3019b064faccbc5ede9ce4f8c67e23c8703996f6
Visible Closure                = COMPLETE when T-024 artifacts are merged/reviewed
Release Qualification          = BLOCKED on G34
Release READY/tag/publish      = NOT AUTHORIZED by this matrix
```
