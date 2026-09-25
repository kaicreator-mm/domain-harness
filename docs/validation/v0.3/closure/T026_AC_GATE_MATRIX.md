# DomainHarness v0.3 T-026 — AC / Gate Matrix

## Authority and candidate

- Frozen PRD: `docs/product/DomainHarness_v0.3_PRD_FROZEN.md` (§21 AC1–AC28)
- Frozen PRD Amendment A1: `docs/product/amendments/DomainHarness_v0.3_PRD_AMENDMENT_A1_ROUND2_REVIEW_CANDIDATE.md` (§17 AC1–AC18; frozen by `DomainHarness_v0.3_PRD_AMENDMENT_A1_FREEZE_RECORD.md`)
- Frozen L2: `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_EVIDENCE_FROZEN.md` + `DomainHarness_v0.3_ARCHITECTURE_BASELINE_FROZEN.md`
- Frozen L2 Amendment A1: `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_AMENDMENT_A1.md` (§19 V1–V12; frozen by `DomainHarness_v0.3_L2_ARCHITECTURE_AMENDMENT_A1_FREEZE_RECORD.md`)
- Task: T-026 / Issue #244
- Standard: `ai-development-standard@0446f04583f6cf464c835f26e2f657c8b703cb4e`
- Frozen candidate: `a7035746cc8fb0c7ae83da1da4b832ba0f1595bd`
- Candidate tree: `c181177b3eaf539a0f389d868b28be0d6ad12aa7`

Status vocabulary: `PASS` (executed evidence bound to the exact identity cited), `BLOCKED` (required evidence does not exist and no executed compensating gate covers it), `NOT_APPLICABLE` (justified). Historical task-level `WAIVED` states are not a PASS; they are disclosed in §7 and in `T026_EVIDENCE_INVENTORY.md`. Every PASS below names its evidence identity; PR-level PASS is never equated with release PASS — the release-level gates of §5 were re-executed on the frozen candidate itself.

## 1. Frozen PRD §21 — AC1–AC28

| AC | Status | Visible evidence / rationale |
| ---: | --- | --- |
| 1 | PASS | T-006 XState boundary (#249, merge `2d350e3357a4efc71eb5f68a21ffa97ef4f90046`, review PASS @`c8476a49f4fdba07cd3a0716920e64e410251261`); T-019 central admission/wiring (#286, merge `00789f437fc6b4dbb717f9f118e29850baa344ff`, review PASS @`e89c21160e9fafec51e418d6345330f72a65fc73`); T-021 assembly ships xstate as a real dependency with packed-consumer proof (#288, merge `28f23b43e26312571b494fc34e6ce5efc6e08630`, review PASS @`318f7eb61dd86c4d69cdbac36ca3c1c6188acc4d`). |
| 2 | PASS | T-007 HarnessMachine production contract (#253+#262, merge `0087720854dd235e02a35d612bddb4a023d80171`, re-review APPROVE @`42b30c684ebc783a6787aaf5f49c9051658e9ef7`); T-016 journal integration; T-021 single public runtime assembly — no second runtime. |
| 3 | PASS | T-018 production DecisionResolver `Rule → Exact Cache → Promoted Subworkflow → HarnessMachine` with structured results under current schema/guard/transition authority (#285, merge `ea1092a1dce9f80f31e3a0183e8b1a0e958260d2`, review PASS @`327f7680283f260f4b9e053a410660aa64d968ec`). |
| 4 | PASS | T-007/T-016 authority-negative suites: `MUTATION_CAPABILITY_FORBIDDEN`, zero transition/mutation capability, structural no-journal assertions (candidate focused run 17/17, `harness-execution-journal.test.ts`); T-019 V6 fixture. |
| 5 | PASS | T-018 resolver ordering with LLM-avoidance assertions: deterministic rule/cache/promoted paths resolve before Harness fallback (review PASS @`327f768…`). |
| 6 | PASS | T-013 exact semantic cache production core (#268, merge `cce34b3f3e7fdf4b5bb521eaa6f52e247ee098b6`, review PASS @`05d9c0778429013e11a6abff0274b796aeeac7cf`) + T-016 committed test "execution journal storage is strictly separate from T-013 semantic cache storage/identity". |
| 7 | PASS | T-013 cache correctness fixtures; T-018 cross-execution reuse assertions (reviewer independently re-ran focused suites @`dde29054…` for the T-020 evidence seam). |
| 8 | PASS | T-002 semantic identity content-addressed from behaviorally relevant inputs (#248, merge `f0430650f34166d573d83e8733836bd233de2dca`, review PASS @`0c1714478db758d931d3911db993223977b51b90`); T-013 exact invocation key. |
| 9 | PASS | T-013 `ObservedDependencySet` + two-phase eligibility: unrelated context does not invalidate (cache correctness fixtures). |
| 10 | PASS | T-013 eligibility/two-phase admission + T-018 explicit bypass paths for non-cacheable/time-sensitive decisions. |
| 11 | PASS | T-018 single pre-read, no hidden guard retry: cache hits revalidated by current schema/guards; T-019 central admission wiring. |
| 12 | PASS | T-004 deterministic candidate validator (#251, merge `09b9ce20c817cd3ad1721b7af6d39d3bd9b7eb73`, review PASS @`8a1c32cc756aafe3fff547b020babb5b1a3fd096`); T-012 registry lifecycle (#269, merge `a857ce40e4d94202e7f2ad2b7ab42a480cab9834`, retro review §6); T-015 explicit promotion/selection authority (#281, merge `8c0c3ed226630ac9521ccde2d6272172bb42551e`, review PASS @`ef914b7bfb65b40a7eebfdfbb8fd12a3ebd58ba0`). |
| 13 | PASS | T-012 exact artifact identity fail-closed; T-017 applicability/compatibility + exact child identity (#284, merge `cd15a0c2e9267f8e2c39e0f2bbfc0bb833e70bc2`, review PASS @`eed17f5229b8623d17b0b58f10111c01b017ca2b`). |
| 14 | PASS | T-004 unified envelope reject matrix (13/13 candidate-validator vectors at closeout); T-019 admission: schema → pinned Hard Invariant → guard before any transition. |
| 15 | PASS | T-007 bounded-step/cancel/illegal-authority tests; T-016 cancellation semantics: "cancellation leaves an ambiguous started slot and failure outcomes replay without duplicate calls" (candidate 17/17). |
| 16 | PASS | T-019 durable effect handoff behind authority + idempotency (#286, PASS @`e89c211…`); T-022 Node durability vectors (#289, merge `efc991716e2f8428a8864f7ad9661dc0d611a9f5`, review PASS @`30fe358766e0d5e607fb86ee08e00bd6887b8110`). |
| 17 | PASS | T-019 wiring keeps XState control persistence distinct from committed-work replay authority; T-022 V1–V16 durability vectors on device-grade adapters; T-024 parity matrix (#292, merge `8c530b83fcfb435bd5ebd6a72282a0fe239b15aa`, review APPROVE @`a642d6b89e46f3421954b7a35a19777d29a9880f`). |
| 18 | PASS | T-016 no-duplicate journal (concurrent callers execute external work at most once; crash-window replays); T-022 kill/restart vectors; T-023 real force-stop evidence (#290, merge `2d3ba3b94ddd54d5fc4aa3b7388b54d2a73062c4`, review APPROVE @`2cfb65b18703899fc6a71d62786360a9059b88d5`). |
| 19 | PASS | T-016: no provider routing in journal integration (task boundary verified in review scope); provider/model selection remains AI Runtime per Frozen L2 boundary. |
| 20 | PASS | T-002 Domain Facts vs Compiled Domain Intelligence descriptors/identities (#248, PASS @`0c171447…`). |
| 21 | PASS | T-008 host/local Domain Tool binding (#249, merge `2d350e3…`, PASS @`c8476a49…`); T-021 retained Domain-App capability integration through the v0.3 runtime assembly. |
| 22 | PASS | T-009 durable process data (#254+#265, final merge `c3389d07ae318e6d9f8aa2facd9dfa4211006920`, review PASS @`e95aa7464c93361c00d9616f06b994a8c22de358`); T-022 host restart durability evidence. |
| 23 | PASS | T-009 first-class accepted/processed/rejected outcomes: normal rejection does not produce recovery-required behavior. |
| 24 | PASS | T-009 command outcome observability contract; T-021 public assembly exposes outcomes. |
| 25 | PASS | T-010 provisioning/deadlines/correlation (#255+#266, merge `4e73ad4e730b191ad6cb48b469f69791b281e843`, retro review §6) + T-011 generated typed App contracts (#256, merge `230b8c56a080054fe6411bf345fa54f7f8b49c11`, review PASS @`233ebf3e5adcea027cf618fb5807941ade7f9d10`). |
| 26 | PASS | T-002 semantic projection is deterministic/no-I/O/non-authoritative (`SemanticRevisionPort` contract tests). |
| 27 | PASS | T-010 durable deadline/timer/callback + external-job correlation; T-022 timer/callback durability vectors on real Node host. |
| 28 | PASS | T-024 pre-A1 fail-closed migration (M1 drift guard, M2 legacy-store rejection) + cross-host retention compatibility (#292, APPROVE @`a642d6b…`). |

## 2. Frozen PRD Amendment A1 §17 — AC1–AC18

| AC | Status | Visible evidence / rationale |
| ---: | --- | --- |
| 1 | PASS | T-002 contract separation: Domain Facts are external mutable inputs; promoted artifacts carry exact content identity only (T-012/T-017 never ingest fact mutability). |
| 2 | PASS | T-002 CDI descriptors + T-012 promotion lifecycle + T-015 promotion authority. |
| 3 | PASS | T-003 canonical `GovernanceBaselineIdentity` + logical registry/retention (#250, merge `dc478c1078e71ac5368e00430aec453f7e5f7f8c`, review PASS @`6d09e36e1c050e3c36d88fc66f970b75db20f156`); authority separation enforced in T-015. |
| 4 | PASS | T-015: governance baseline changes require explicit human/operator authority with pre-change-policy evaluation under the incumbent baseline (V4 executed evidence below). |
| 5 | PASS | T-006/T-019/T-021: Workflow/Domain Machine is the one business control-flow authority; Harness is an invoked child. |
| 6 | PASS | T-006 pure-predicate enforcement; review P1s (control-event spoofing, Proxy-trap side effects) fixed in #263 (`d00f494ce4e127b8b93bb8ea0932de8e18a05057`, pipeline #450 SUCCESS @`1961e61f0985639bb39552af8860955e12da14a5`); V5 compile-time/contract gate. |
| 7 | PASS | T-007 contract + T-016/T-019 authority-negative suites (AC4 above). |
| 8 | PASS | T-005 Runtime Evidence contract + provenance/privacy boundary (#247, merge `74514b07048ee62ce04d742a9685ae4804619d89`, PASS @`3582b4dc759f106ec0a136f79a204a8a94436453`); evidence never becomes active CDI (T-020 capture is append-only observation). |
| 9 | PASS | T-004 unified envelope + deterministic validator across Rule/Procedure/Skill/Workflow before promotion eligibility; T-015 gate order. |
| 10 | PASS | T-015 authority-negative tests: LLM/Meta-originated promotion rejected without explicit human/operator authority (baseline-change matrix). |
| 11 | PASS | T-015: promote ≠ activate — distinct authorities, distinct audit identities. |
| 12 | PASS | T-014 `DomainActivationBinding` + durable `GovernanceExecutionPin` (#279, merge `24ba308313ab6a93f66107373584d14464e9aa39`, PASS @`9c93676f7356c01de73a10b02e92cb7ff8803d15`): activation never rewrites running pins; V1 executed evidence below. |
| 13 | PASS | T-020: Meta Harness / L1–L4 present as contract seam only; shadow-L4 is the sole v0.3 L4 surface (#287, merge `328c47b40dd8d1ef76a34add0ccda7a3662a2d13`, PASS @`dde29054a73f94b95a3afb81765646f64cd56823`). |
| 14 | PASS | T-020 V10: shadow path yields Runtime Evidence output only; no authoritative parent transition/effect. |
| 15 | PASS | T-020 V11: fallback identity must be exact (packageId + governance digest + artifact contentDigest); `latest`/`active`/`current` fallback rejected; alias-move/`recoverExact` parity probe in T-024. |
| 16 | PASS | T-006 engine-neutral Workflow API semantics with XState behind the adapter boundary; T-021 public assembly does not expose engine identity as product contract. |
| 17 | PASS | Boundary preservation across T-010/T-013/T-014/T-016/T-019 + T-024 cross-host parity matrix covering cache/journal/effect/pin/recovery/timer classes on both hosts. |
| 18 | PASS | T-021: one portable public v0.3 runtime assembly; repository contains no second business control-flow runtime (packed-consumer + export-surface review @`318f7eb…`). |

## 3. Frozen L2 Amendment A1 §19 — V1–V12 executed evidence

| V | Status | Executed evidence identity |
| --- | --- | --- |
| V1 pin survives baseline movement | PASS | T-024 M5 cross-host vector (both stacks); T-022 V10 Node vector; T-023 E4 device vector. |
| V2 missing pinned baseline fails closed | PASS | T-024 M2 both stacks: exact body unavailable → recovery_required, no substitution. |
| V3 governance self-approval rejected | PASS | T-015 core authority-negative suite + audit append-once parity probe (T-024). |
| V4 pre-change evaluation | PASS | T-015 core: incumbent baseline B1 is evaluation authority; B2 cannot approve itself. |
| V5 guard purity | PASS | T-006 compile-time/contract gate + #263 provenance/trap-free predicate fixes. |
| V6 reasoning explicit | PASS | T-018 core: structured DomainDecision → schema → Hard Invariants → guard → transition; Harness cannot set state directly. |
| V7 candidate invalid after governance change | PASS | T-015 revalidation requirement + T-004 validation identity binding. |
| V8 evidence cannot replay work | PASS | T-024 parity V8 probe both stacks + T-020 capture semantics. |
| V9 tenant evidence isolation | PASS | T-024 parity V9 probe both stacks + T-005 use-gate. |
| V10 shadow L4 cannot mutate | PASS | T-020 core: shadow path output is evidence-only. |
| V11 exact stable fallback | PASS | T-024 M5 + alias-move/`recoverExact` parity probe: floating fallback rejected, exact identity accepted. |
| V12 durability unchanged | PASS | T-022 V8/V9 Node vectors + T-023 E5 device vector + T-024 parity V12 replay probe. |

## 4. Retained Frozen L2 durability / cache / effect gates (real host evidence)

| Gate class | Status | Evidence identity |
| --- | --- | --- |
| Node Build Host durability wave | PASS | T-022 / PR #289: real Node SQLite adapters, kill/restart, 75/75 focused V1–V16 vectors @`30fe358766e0d5e607fb86ee08e00bd6887b8110`; merge `efc991716e2f8428a8864f7ad9661dc0d611a9f5`. |
| Expo Android/Hermes wave | PASS | T-023 / PR #290: real device (Android API 36, Hermes release APK, `expo-sqlite`), Phase 1 34 checks → `adb force-stop` → Phase 2 24 checks @`2cfb65b18703899fc6a71d62786360a9059b88d5`; merge `2d3ba3b94ddd54d5fc4aa3b7388b54d2a73062c4`. |
| Cross-host parity + migration + retention | PASS | T-024 / PR #292: parity matrix both stacks, pre-A1 fail-closed migration (M1/M2), package/governance/artifact retention (M4/M5) @`a642d6b89e46f3421954b7a35a19777d29a9880f`; merge `8c530b83fcfb435bd5ebd6a72282a0fe239b15aa`. Honesty boundary retained: parity-driver evidence is logical-parity infrastructure; real host claims rest on T-022/T-023 only. |

## 5. Release-level gates executed on the frozen candidate `a7035746…` (clean room)

Clean detached worktree, `git rev-parse HEAD` = candidate, `git status` clean, Windows x64, Node v26.8.1 / npm 11.19.0 (`.t026-evidence/candidate-gates.log`, `GATES_EXIT:0`):

| Gate | Status | Result identity |
| --- | --- | --- |
| `npm ci` | PASS | 151 packages, 0 vulnerabilities, clean install |
| `npm run build` | PASS | all workspaces compile |
| `npm run lint` | PASS | 0 errors |
| `npm run typecheck` | PASS | 0 errors |
| `npm test` (full regression) | PASS | **766 passed / 0 failed** across all workspaces (includes T-016 journal 17/17, T-010 repair 10/10, T-012 registry 16/16 focused suites — re-run individually at candidate for this record) |
| Packaging | PASS | `@kaicreator/domain-harness` 466 files; `domain-harness-node` 31; `domain-harness-expo` 35; `domain-harness-compiler` 29; all four `npm pack` artifacts built in the clean room (file-count reconciliation vs the dev checkout's stale 650 in `T026_EVIDENCE_INVENTORY.md` §4) |
| Minimal CI on candidate | PASS | `ci/woodpecker/push/verify` pipeline 523 SUCCESS, commit status bound to `a7035746…` |
| Owner-held Hidden Validation | BLOCKED | Owner-held; not executed by this task. Handoff: `T026_HIDDEN_VALIDATION_HANDOFF.md`. Not a product failure; release action remains unauthorized until the owner records a result against `a7035746…`. |

## 6. Task-level administrative gaps and their reconciliation

Three PRs merged 2026-09-21 ~01:20–01:55Z without a recorded independent review verdict. T-026 reconciliation (full mechanics in `T026_EVIDENCE_INVENTORY.md` §5):

| Gap | Historical record | Compensating executed evidence | Retro review |
| --- | --- | --- | --- |
| T-012 / PR #269 (merge `a857ce40…`) | Zero comments/reviews/CI records on the PR | Post-merge `ci/woodpecker/push/verify` SUCCESS on the exact merge commit (2026-09-21T01:25:00Z); write set unchanged in candidate except purely additive T-017/T-018 seams (themselves independently reviewed); registry suite 16/16 at candidate; downstream T-015/T-017/T-024-M4 all PASS over this code | **PASS** (P0=0 P1=0 P2=0 P3=4), diff `d00f494c…`..`a857ce40…`, posted PR #269 (2026-09-22); all 22 pack §2 scenarios covered; fail-closed vectors verified |
| T-016 / PR #273 (merge `69e4cf80…`) | `VALIDATION_RESULT — BLOCKED — HEAD_DRIFT` only; recorded `npm test` FAIL at voided trees (test-authoring defect: unsatisfiable substring assertion); no review at any HEAD | Final HEAD replaced the assertion with strictly structural checks (`fec5eca`) and restored the bisect-deleted tests (`900f5dd`); write set byte-identical merge→candidate; focused suite 17/17 at candidate; merge-commit push pipeline 486 was *canceled* (infra), and the descendant merge commit `4e73ad4e…` — whose tree contains the T-016 final code — has push/verify SUCCESS (01:56:02Z); candidate CI pipeline 523 SUCCESS | **PASS** (P0=0 P1=0 P2=0 P3=3), diff `a857ce40…`..`69e4cf80…`, posted PR #273 (2026-09-22); structural assertions verified stronger than original intent; all 12 pack scenarios present; no coverage dropped |
| T-010 repair / PR #266 (merge `4e73ad4e…`) | pr/verify pipeline 456 PENDING at final HEAD; review request posted, no verdict recorded; merged 01:53:51Z | Post-merge `ci/woodpecker/push/verify` SUCCESS on the exact merge commit `4e73ad4e…` (01:56:02Z); repair write set byte-identical merge→candidate; durable-control-coordinator suite 10/10 at candidate | **PASS** (P0=0 P1=0 P2=0 P3=3), diff `69e4cf80…`..`4e73ad4e…`, posted PR #266 (2026-09-22); **original PR #255 P1 explicitly confirmed closed** (every persisted-read path validated before use; no replay of unvalidated terminal sources) |

Six task issues (#219/#220/#228/#230/#231/#234) remained OPEN after their PRs merged; T-026 closes them with comment-only records bound to the merge/validation/review evidence cited here and in the inventory. The T-016 task pack's stale `Status: DOING` line is corrected by the issue closeout record (the pack file itself is frozen history; this matrix is the authoritative closure state).

## 7. WAIVED / superseded gate register (disclosure, not PASS claims)

Task-level CI waivers recorded during execution (operator-instructed while Woodpecker was unavailable/pending). None is counted as a PASS anywhere in this matrix; each was later superseded by an executed exact-SHA PASS or by the release-level gates of §5:

| Task / PR | Waiver record | Superseding executed evidence |
| --- | --- | --- |
| T-004 #251 | pipeline 399 CI_INFRA_WAIVER (#261) | CI_RETRY_RESULT pipeline 413/1 SUCCESS @`8a1c32c…` |
| T-006 #252 | pending-CI operator waiver at merge; pipeline 222 later recorded failure | repair #263 pipeline #450 SUCCESS @`1961e61f…` |
| T-007 #253/#262 | pending-then-failed CI under operator waiver | pipelines #426 SUCCESS @`12e2d72`, #438 SUCCESS @`42b30c6` |
| T-008 #249 | operator-instructed CI skip while pending | backfilled pipeline 216/1 SUCCESS @`c8476a49…` |
| T-009 #254 | operator CI waiver | repair lineage pipeline #431 SUCCESS @`e95aa746…` |
| T-010 #255 | pending-CI waiver | backfilled pipeline 234 SUCCESS @`b8374630…` |
| T-010 repair #266 | pr/verify 456 PENDING at merge | push/verify SUCCESS on merge commit `4e73ad4e…` + candidate §5 gates |
| T-012 #269 | no pr/verify record | push/verify SUCCESS on merge commit `a857ce40…` + candidate §5 gates |
| T-016 #273 | no pr/verify at final HEAD; merge-commit push 486 canceled (infra) | push/verify SUCCESS on descendant merge `4e73ad4e…` (tree contains T-016 final code) + candidate §5 gates |

## 8. P0/P1 register — all recorded blocking findings and their resolution

| Finding | Severity | Resolution identity | Status |
| --- | --- | --- | --- |
| T-001 packageId byte-compat | P1 | closed in re-review PASS @`4a0d1650…` (#246) | CLOSED |
| T-001 error-taxonomy escape | P1 | closed in same re-review | CLOSED |
| T-002 descriptor digest/body mismatch not fail-closed | P1 | fix `2ca5739a…` + regression @`0c171447…`, re-review PASS (#248) | CLOSED |
| T-003 retention referenceId rebindable / stale-release TOCTOU | P1 | tombstone + conditional `releaseReference(expectedReference)` @`6d09e36e…`, re-review PASS (#250) | CLOSED |
| T-004 governance compatibility self-assertion; caller-supplied body validator | P1 ×2 | verified closed in final PASS review @`8a1c32cc…` (#251) | CLOSED |
| T-006 internal control-event spoofing; Proxy-trap side effects in pure predicate path | P1 ×2 | repair #263 @`1961e61f…`, review PASS, pipeline #450 SUCCESS | CLOSED |
| T-009 missing TARGET_SEQUENCE_MISMATCH / STATE_REVISION_MISMATCH negative coverage | P1 | test-only repair `ee9017d3…` in #265, review PASS @`e95aa746…` | CLOSED |
| T-010 malformed persisted terminal source replayed without validation | P1 | repair #266 merge `4e73ad4e…` (fail-closed persisted terminal-source validation); retro independent review PASS with P1 closure explicitly confirmed (PR #266 record, 2026-09-22) | CLOSED |
| T-011 JSON Schema `integer` widened to `number` | P1 | deterministic `UNSUPPORTED_SCHEMA` rejection + regression suite @`233ebf3e…`, review PASS (#256) | CLOSED |
| T-016 required-gate `npm test` FAIL at voided trees | unclassified gate failure | test-authoring defect fixed structurally @`fec5eca`; deleted coverage restored @`900f5dd`; verified 17/17 at candidate; retro independent review PASS (PR #273 record, 2026-09-22) | CLOSED |

Unresolved P0/P1 at the frozen candidate: **0**. All recorded blocking findings have resolution identities; the three task-level evidence voids carry fresh retro independent review verdicts of PASS (P0=0 P1=0) bound to the exact merged diffs, with write sets verified unchanged (or purely additively extended by separately-reviewed commits) in the candidate.

## 9. Release decision

Per RELEASE_STANDARD (pinned `0446f045…`):

- Visible closure gates (§1–§5): **PASS** at the frozen candidate.
- Task-level administrative gaps (§6–§7): disclosed, compensated by executed evidence bound to exact SHAs, retro independent review verdicts recorded in §6.
- Owner-held Hidden Validation: **BLOCKED — owner-held, not executed** (see `T026_HIDDEN_VALIDATION_HANDOFF.md`).
- **Release decision: CONDITIONAL** — the visible candidate qualifies; merging `v0.3` to `main` and tagging/baselining is **not authorized** by this matrix until the owner records a Hidden Validation result against `a7035746cc8fb0c7ae83da1da4b832ba0f1595bd` per the handoff contract.
