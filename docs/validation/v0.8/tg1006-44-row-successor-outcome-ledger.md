# v0.8 T-G #1006 — 44-row successor outcome ledger (candidate-scope, evidence-only)

> Successor outcome ledger required by `#1006@6189172826`. The frozen
> `docs/implementation/DomainHarness_v0.8_RETAINED_FUNCTION_MANIFEST.json` is
> PRESERVED BYTE-FOR-BYTES and stays 44/44 NOT_RUN inside its own bytes; this file is
> the authorized successor ledger that maps each frozen row to what the ONE candidate
> full run + the targeted gap batch actually asserted at
> `b151320ee6835755ba043e2602c085c180c9c849` / tree `a8135b2a…`.
> Execution record: `tg1006-final-candidate-execution.md`. This is NOT a Release PASS.

## Status vocabulary (candidate scope only)

- `CANDIDATE-PN-PASS` — the row's selected-path positive AND negative observables were
  asserted by tests that actually ran green at the exact candidate SHA in the pinned
  full run and/or the targeted gap batch.
- `CANDIDATE-PARTIAL` — the named tests ran green at the candidate but cover only part
  of the frozen row; the uncovered remainder is `NOT_RUN` (recorded per row).
- `SOURCE-LEVEL-EXECUTED` — BUILD/compiler-unit sources ran green at the candidate
  (374/374 compiler suite); the row's independent physical/consumer acceptance is
  `NOT_RUN`.
- `LEGACY-EXECUTED / SELECTED-NOT-RUN` — historic witness tests ran green at the
  candidate (84 dac lines); the selected v0.8 BUILD bridge observable is `NOT_RUN`.

Nothing outside these executed assertions is promoted. A PR-source PASS at any
predecessor SHA is provenance only.

## Row ledger

| ID | Owner | Candidate-scope status | Executed evidence at `b151320` (test names ran green in the pinned run / gap batch) | Remainder NOT_RUN |
|---|---|---|---|---|
| FR01 | K | CANDIDATE-PARTIAL | compiler `v08-kernel-package-c01` (374/374); `T-F E2E` packed dual-App journey; HF18 durable wait/callback legs | full WAIT/RESUME/child matrix isolation |
| FR02 | S | CANDIDATE-PN-PASS | compiler WEB-ORACLE-1; `v08-tf-fr02-fr07-selected-physical` FR02 F01/F02/F03 | — |
| FR03 | K | CANDIDATE-PN-PASS | **R4 exact selected-runtime replay crosswalk**: physically selected K `v08-kernel-package-c01` N1/N2/N3 same-effect completion CAS wins/idempotence/conflict, N4 forged/wrong role with zero journal/dispatch, N5 crash-after-effect gives AMBIGUOUS/no blind retry, N6 failed effect denies retry, P3 durable restart and P5d same-payload replay vs mutation conflict; selected `s04-operation-call` P1/P2/P3 + negatives on real SQLite proves actual Operation→Effect execution. All were green in original candidate 3,786 full run. | — |
| FR04 | K | CANDIDATE-PN-PASS | **R5 physical selected K P/N**, test `tg5-kernel-taxonomy-selected-physical`: physical authenticated K/SQLite send/ACK same-turn identity and duplicate messageId resends commit/dispatch/journal zero extra; invalid target typed not found and wrong package contract typed `INTENT_UNBOUND`, no effect. Reuse selected `i02-auth-ux-kernel` unknown intent deny. R5 10/10 targeted Node24 PASS, merge PR #1075; production bytes frozen. | — |
| FR05 | S | CANDIDATE-PN-PASS | `fr05-hf17-hf23-selected-physical` FR05-P/FR05-N(stale)/FR05-N(cross-tenant) | — |
| FR07 | S | CANDIDATE-PN-PASS | `v08-tf-fr02-fr07-selected-physical` FR07 P1–P3/N1–N7 (12 lines) | — |
| FR08 | S | CANDIDATE-PN-PASS | `fr08-fr09-fr12-decision-source-physical` (ordering/drift/denial) **+ gap batch leg 1 (WeakMap-count load refusal) and leg 2 (post-commit cache re-read fault preserves admitted ACK + one State/Effect)** | — |
| FR09 | S | CANDIDATE-PN-PASS | same file FR09-P pinned digest / FR09-N revoked (child routing is HF32) | — |
| FR12 | S | CANDIDATE-PN-PASS | same file FR12 current-cache legs; `fr08-sd-nf05-physical` no-fresh-model currentness N | — |
| HF17 | S | CANDIDATE-PN-PASS | `fr05-hf17-hf23-selected-physical` HF17-P/HF17-N(no-session)/HF17-N(revoked) | — |
| HF18 | K | CANDIDATE-PN-PASS | `hf18-durable-deadline-callback-physical` 13/13 at candidate (incl. fresh-process restart, pre-CAS authorization, crash dual-fault recovery) **+ gap batch 17th-turn eviction guard** | — |
| HF20 | K | CANDIDATE-PN-PASS | `hf20-mutation-observation` 11/11 at candidate (same-instance CAS tail, 2 fresh processes/restart, forged/foreign/failed CAS) | — |
| HF23 | S | CANDIDATE-PN-PASS | `fr05-hf17-hf23-selected-physical` HF23-P + hidden/effectful/revoked N **+ gap batch two-capability same-operationId composite discovery/role/call negatives** | — |
| HF32 | K | CANDIDATE-PN-PASS | `hf32-child-routing-physical` 8/8 at candidate | — |
| FR08-P-SD1 | S | CANDIDATE-PN-PASS | `fr08-sd-nf05-physical` SD1 (8 lines) | — |
| FR08-N-SD1 | S | CANDIDATE-PN-PASS | same (typed unavailable, 0 effects/journal) | — |
| FR08-P-SD2 | S | CANDIDATE-PN-PASS | same (declared event through K central admission) | — |
| FR08-N-SD2 | S | CANDIDATE-PN-PASS | same (undeclared event denied, 0 effect) | — |
| NEW-FUNCTION-05 | S | CANDIDATE-PN-PASS | same NF05 digest-bound PRE/POST + promoted-negative + mutation regression | — |
| NEW-FUNCTION-06 | S | CANDIDATE-PN-PASS | `nf06-decision-receipt-physical` (14 NF06 lines at candidate: append/read, fail-closed mandatory pre-admission refusal, true SQLite restart) | — |
| FR06 | M | CANDIDATE-PN-PASS | **R2 Web source↔executed-assertion crosswalk**: compiler `v08-qualified-package-a01` B1 positive qualified closure → approved sealed root → `load(root)`; B2/B3/B4 negative subject/issuer/TOCTOU drift; core `v08-abi-a01` approved load positive and N1–N7 fail-closed prior to import; actual installed-byte/currentness N in `v08-abi-s01-installed-package`. Full run executed compiler 374/374 + core 3145/3145 at `b151320`. Pre-v1 API/ABI parity OUT by Product Freeze. | — |
| FR10 | U | CANDIDATE-PN-PASS | **R4 exact selected-runtime UX contract**: `i02-auth-ux-kernel` I02-P authentic signed-role UX send/query roundtrip through selected K, I02-N forged role/self-claimed caller/cross-tenant/raw bypass refusal (including two valid tenants sharing app+instance); `v08-host-b01` P authenticated scoped send/query/subscribe, N1/N2 forged/cross-app/context, N3 expired/stale/revoked grant and N5 per-delivery revocation. Tests executed at original 3,786 candidate run; actual separate domain-ux product integration is OUT of this bounded SDK transport acceptance. | — |
| FR14 | K | CANDIDATE-PN-PASS | **R4 exact selected-runtime replay crosswalk**: selected K C01 P3 physical restart/replay, P4 journal-semantics oracle and P5d same-occasion replay; N5 ambiguous effect/no second dispatch, N10 foreign Kernel module digest journal refusal and N10b hot swap pin rejection. Together with T-F `tf-two-real-apps-packed-e2e` real shared K/S Journal/effect isolation and selected B01 KPK08 two-business separation, prove one authoritative effect/Journal identity P/N at frozen candidate. | — |
| FR15 | U | CANDIDATE-PN-PASS | **R4 selected read-only agent-tool bridge**: `fr05-hf17-hf23-selected-physical` HF23-P approved pure agent operation discovery under signed principal, HF23-N hidden/effectful/wrong-role/revoked discovery and effectful ABI marking refusal; `s04-operation-call` S04-W1/W3 guarded Operation→Effect binding and clean stock-Node consumer; Host B01 N4 no raw Kernel/Journal access. Together prove typed scoped exposed read-only tool and non-authoritative UX resource bridge P/N, not unrestricted privileged Host execution. | — |
| HF16 | K | CANDIDATE-PARTIAL | Original poison recovery and mailbox scheduling component tests passed in the pinned full run; **R3 PR #1072** composed them in `hf16-poison-drain-integration.test.ts` 1/1: poison blocked queue, unauthorized retry refused, allowed domain-policy retry drains followers to quiescence. | New integration imports legacy coordinator/scheduler and uses deterministic RecoveryStoreFake; selected v0.8 K/physical store poison replay/queue drain not established. |
| HF19 | K | CANDIDATE-PN-PASS | **R5 physical selected K P/N**, `tg5-kernel-taxonomy-selected-physical`: applied exactly one state commit+terminal completed journal/provenance, rejected business denial is terminal processed without poisoning; concurrent/settled duplicate returns typed, zero second commit. Prior selected C01-N1/N2/N3/N10 and HF20 B1 conditional CAS cover revision/conflicting/forged terminal sources. Actual selected full + R5 physical test, no production change. | — |
| HF21 | K | CANDIDATE-PARTIAL | R3 readback mapped `authority-class/authority-class.test.ts` to real executed legacy PRODUCTION/SIMULATION class P/N (`AUTHORITY_CLASS_MISMATCH`/`FORBIDDEN`); selected `i02-auth-ux-kernel` only proves tenant-role isolation. | Current selected v0.8 K/Host SIM-versus-PROD effect-publication capability gate still lacks direct binding. |
| HF26 | K | CANDIDATE-PN-PASS | **R5 physical selected K P/N**, `tg5-kernel-taxonomy-selected-physical`: admitted journal records exact effectId/control turn/idempotency/input/output; both denial receipts preserve governanceBindingDigest, deterministic turn identity, `llmAvoided` and ModelPort evidence, repeat denial has zero mutation. Prior selected C01-P2c fallback and `fr08-fr09-fr12-decision-source-physical` truthful fallback/refusal provenance executed green. No caller evidence grants effect authority. | — |
| HF27 | K | CANDIDATE-PN-PASS | **R5 physical selected K P/N**, `tg5-hf27-lane-selected-physical`: two simultaneous same-instance messages serialize; exactly one State/Journal/Effect revision admitted, loser typed without raw CAS conflict; different instances progress concurrently. Existing `v08-host-multiprocess` eight independent process races provide CAS negative/progress witness; original old WorkflowInstanceEngine P/N only auxiliary, not claimed selected. | — |
| HF28 | H | CANDIDATE-PN-PASS | **R4 Product-qualified Node Host only**: `tf-two-real-apps-packed-e2e` actual clean npm-packed Node consumer with dual real Approval/Engineering K/S apps, real SQLite restart; `v08-host-multiprocess` fresh stock Node consumers; `v08-host-b01` B01-P protected bootstrap/typed UX and B01-N6(pre)/N8(pre) privilege-free or non-CAS Host typed failure before effect. Product L1 HF28 says live Expo/Hermes same-package is conditional on *separately approved supported-v0.8 Host target*, not a default release matrix; no such approval is evidenced. Actual approved Node P/N only, not Expo parity. | — |
| HF29 | H | CANDIDATE-PARTIAL | compiler `host-local-tool-binding`; `s04-operation-call` | allowed local/HTTP/script matrix |
| HF33 | H | CANDIDATE-PN-PASS | **R5 physical selected Host resource identity/currentness P/N**, `tg5-hf33-resource-pin-selected-physical`: live deployment disallows hot-swapping its pinned required resource (`HOST_RESOURCE_PROVISIONED`), explicit unprovision→provision refresh then uses exact new handler, missing resource yields honest durable failure (`ADMISSION_EFFECT_FAILED`) never false ACK or double retry; privileged namespace reserved. Reuse selected S05-N2/S05-C1 scoped Host identity/restart, old GovernanceExecutionPin tests auxiliary. | — |
| FR11 | BUILD | CANDIDATE-PARTIAL | Existing `domain-data-section` + schema compiler P/N ran at frozen candidate; **R3 new** `successor-host/fr11-domain-data-consumer` 2/2 on same production bytes through PUBLIC compiler and real Node SQLite successor runtime confirms typed projection read and self-consistent-schema-violation rejection; PR #1072 merged (test-only). | Consumer uses `createNodeDomainRuntime` successor pathway, not yet proven to run via v0.8 selected one-argument `load(package)` + K/S/B. Only selected-runtime integration remains to map if Product requires. |
| FR13 | BUILD | CANDIDATE-PN-PASS | **R3 existing-execution crosswalk**: selected Standard SDK `v08-standard-sdk-d01` P3 exercises Schema/Decision/Workflow/Operation Kind proposal semantics; N1 accessor/unsafe keys refusal and N2 unknown Kind/missing projection fail-closed. BUILD `v08-qualified-package-a01` B1 and B13/B14 prove valid typed bindings, wrong-kind/ambiguous/dangling target refusal before import; selected actual capability-bearing `load(root)` P1 and N1–N7 in `v08-abi-s02a-capability`. All candidate compiler/core suites executed in original full run (374+3145 green); v0.7 ABI parity not required. | — |
| HF22 | BUILD | CANDIDATE-PN-PASS | **R2 Web source↔executed-assertion crosswalk**: compiler `v08-qualified-package-a01` B12 permitted sealed relative transitive import P / missing sibling typed N + A01-N3 dynamic/unsealed import negative; `v08-capability-package-s02a` B1/B4 physical `load(root)` with sealed capability closure positive and N1–N7 undeclared/forged/duplicate/wrong-kind/role-shadow/dynamic import refusals. Executed in the candidate compiler 374/374; selected core load integration from the same suite, not old-ABI parity. | — |
| HF24 | BUILD | SOURCE-LEVEL-EXECUTED | compiler `business-source-section` BUILD projection | exact current P/N signoff |
| HF25 | BUILD | SOURCE-LEVEL-EXECUTED | compiler typed codegen sources | consumer P/N |
| HF31 | BUILD | CANDIDATE-PN-PASS | **R2 Web source↔executed-assertion crosswalk**: compiler `v08-qualified-package-a01` B1 canonical accepted submission → real `load(root)` P, B8 hostile accessor N with getter count exactly 0, B9 own `__proto__` N; core `v08-abi-a01` positive sealed load plus N4 hostile accessor/prototype rejection before module load. Both candidate suites ran green (374 compiler + 3145 core). | — |
| HF34 | BUILD | SOURCE-LEVEL-EXECUTED | compiler canonical digest/refusal checks | definition-graph exact P/N |
| HF30 | BUILD | LEGACY-EXECUTED / SELECTED-NOT-RUN | `dac-v0041-runtime-activation` historic | selected BUILD integrated proof |
| NEW-FUNCTION-01 | BUILD | CANDIDATE-PARTIAL | **R3 PR #1072 targeted**: `nf01-04-dac-build-bridge.test.ts` (5/5 P/N across NF01–04, actual PUBLIC compiler output) demonstrates real public compiler package identities/digests drive DAC TWO-VIEW association and contradictory-evidence precedence P/N. Existing historical DAC verifier tests remain reusable; no production adapter was introduced. | No production current BUILD→DAC binding/consumption path yet; test-side bridge only; verify Product pure-verifier boundary. |
| NEW-FUNCTION-02 | BUILD | CANDIDATE-PARTIAL | **R3 PR #1072 targeted**: `nf01-04-dac-build-bridge.test.ts` (5/5 P/N across NF01–04, actual PUBLIC compiler output) demonstrates real public compiler identities/descriptors drive selection→manifest→coverage with complete/refused material, mixed-identity denial P/N. Existing historical DAC verifier tests remain reusable; no production adapter was introduced. | Test-side constructed facts, not production selected BUILD manifest intake; issuer-currentness/early-manifest guards remain to map. |
| NEW-FUNCTION-03 | BUILD | CANDIDATE-PARTIAL | **R3 PR #1072 targeted**: `nf01-04-dac-build-bridge.test.ts` (5/5 P/N across NF01–04, actual PUBLIC compiler output) demonstrates real compiler material supports DAC runtime Binding fact P and activation-as-binding invalid N. Existing historical DAC verifier tests remain reusable; no production adapter was introduced. | No actual Host approved-byte binding coupling and pre-load enforcement demonstrated by this bridge test. |
| NEW-FUNCTION-04 | BUILD | CANDIDATE-PARTIAL | **R3 PR #1072 targeted**: `nf01-04-dac-build-bridge.test.ts` (5/5 P/N across NF01–04, actual PUBLIC compiler output) demonstrates same real-material DAC Activation-fact verifier P, stale source and unauthorized SoD co-hosting N. Existing historical DAC verifier tests remain reusable; no production adapter was introduced. | No complete current v0.8 selected Host/currentness effect-zero admission integration shown by test-derived facts. |

## Counts (candidate scope)

- `CANDIDATE-PN-PASS`: 31 rows — the original 17 selected-P/N rows
  (FR02, FR05, FR07, FR08, FR09, FR12, HF17, HF18, HF20, HF23, HF32, FR08-P/N-SD1,
  FR08-P/N-SD2, NEW-FUNCTION-05, NEW-FUNCTION-06) PLUS the R2 executed-test crosswalk
  FR06, HF22, HF31, plus R3 FR13. All were asserted by test suites already green on the exact candidate;
  original four gap roots were closed by the same-candidate 6/6 targeted batch.
- `CANDIDATE-PARTIAL`: 9 rows (executed subset green; listed remainders NOT_RUN).
- `SOURCE-LEVEL-EXECUTED`: 3 rows (compiler suite green at candidate; physical/consumer
  acceptance NOT_RUN).
- `LEGACY-EXECUTED / SELECTED-NOT-RUN`: 1 row.
- Aggregate: 31 + 9 + 3 + 1 = 44 rows with candidate-scope dispositions; 13 rows still
  carry NOT_RUN material (9 partial remainders + 3 compiler-source-only + 1 legacy-only). The by-row table above is the authority.

## Outstanding for Release (HOLD — R2 evidence crosswalk)

1. **Hidden Validation — COMPLETE/PASS**, **34/34 executed** on the exact frozen candidate, 0 public findings, runner exit 0. See the updated `tg1006-hidden-prepack-attestation.md` and public-safe [#1006@6194609734](https://github.com/kaicreator-mm/domain-harness/issues/1006#issuecomment-6194609734); private PREPACK rev5 and real execution are archived in private merged PRs #60/#61. The prior same-login/Owner identity blocker was intentionally removed by user decision; execution identity is trusted self-declaration.
2. The **13 material NOT_RUN retained-function obligations** enumerated per row above remain open: 9 partially executed rows, 3 source-level only and 1 legacy-only. A 34/34 Hidden aggregate PASS does not by itself prove the frozen P/N acceptance for all 44 individual historical functions.
3. Release Qualification remains **HOLD pending exact selected-v0.8 function proof for those 13 rows and a subsequent release decision**; source-evidence PR #1069 was bounded-reviewed/merged, with exact executable-byte-equivalent Woodpecker pass already recorded. A GitHub-account Owner distinctness gate is not required.

## Exact-SHA CI appendix

PR #1069 (base `v0.8`), head `62a7660f35860632d29a1cc0e8bfffd150326b66` = frozen
candidate `b151320ee…` + the 8 evidence files of this round only (4 test/fixture +
4 docs; zero production `src` change). The `pull_request`-triggered Woodpecker
pipeline — `ci/woodpecker/pr/verify` — ran the full `npm ci && npm run build &&
npm run lint && npm run typecheck && npm test` chain with its built-in
`git rev-parse HEAD = $CI_COMMIT_SHA` exact-commit check:

- Pipeline: `https://ci.kaicreator.com/repos/18/pipeline/1272/1`
- Event: `pull_request` (push allowlist main/v0.2/v0.3/v0.4 does not include v0.8 —
  no push CI is claimed)
- Result: **pass — "Pipeline was successful"** (settled 2026-10-15T11:15:20Z UTC
  after ~33 min)
- Scope note: this is CI PASS at the evidence-PR head, whose production code paths are
  byte-identical to the frozen candidate (diff limited to tests + docs as recorded in
  the execution record). It is candidate-scope CI evidence, NOT a Release PASS.


## 2026-10-15 Hidden PASS successor appendix (non-destructive)

Private `DH08-FP-53-01` revision 1 was minted using exact live candidate freeze/review read-backs and executed 34/34 scenarios with aggregate PASS on `b151320ee6835755ba043e2602c085c180c9c849` (tree `a8135b2a217edff395da0a4f31dd7955d3b3db5a`). The full private archive lives at `kaicreator-mm/hidden-validation` PR #61 merged `923100ad06159621d5be42c1c1e377161cfcf34d`; only the public-safe result was posted at `domain-harness#1006@6194609734`. **At the time of that Hidden-only appendix, the 44 row classifications were unchanged; the later R2 source crosswalk below upgrades three rows using old executed test evidence. The historical public run record remains unchanged.** No extra suite was run to append this documentary update. Historical R2 HOLD covered 24; R3 narrowed this to 23; R4 current selected source crosswalk narrowed to 18; R5 current physical tests below narrow to 13., pending a bounded candidate-evidence crosswalk or actual missing targeted tests.

## R2 reuse-first source-to-executed crosswalk — FR06/HF22/HF31 (no new native run)

The exact frozen-candidate test sources, independently read again by Web, make three former `NOT_RUN` *mapping* gaps demonstrably covered by **already executed** P/N assertions in the single original full run: `FR06` qualified root compile/approved load/forged or drifted root rejection; `HF22` sealed transitive provider and capability closure acceptance with missing/unsafe transitive or shadowed binding refusal; `HF31` accepted canonical records with hostile getter/prototype refusal before import and explicit zero getter invocation. Positive and negative test IDs are recorded per row above. Compiler `374/374` and core `3145/3145` ran on the exact candidate `b151320ee6835755ba043e2602c085c180c9c849` (see `tg1006-final-candidate-execution.md`). This is **candidate evidence reuse**, not a claim that Web reran Node/SQLite; no new test or full regression was started. The frozen manifest itself was not modified. Counts: **20 P/N PASS / 14 partial / 5 source-level / 5 legacy-only = 44**, leaving **24 material P/N gaps**.

## R3 necessary-scope and execution-route audit (2026-10-16, PR #1072)

The local 8/8 targeted tests at `domain-harness#1006@6196373272` are now committed to `v0.8` through test-only PR #1072 (merge `3fa73f2a4fe28db7864249fefc412793ff5ea292`). They were executed on the frozen candidate's unchanged **production** bytes at `b151320`; do **not** claim they existed in the original 3,786-test run. This review compared the test sources to their actual imports and *frozen current-v0.8* functional obligations; it did **not** mistake successful old-version tests for an actual selected-K v0.8 execution.

**One direct additional PASS:** FR13 selected Standard SDK Kind semantics + physical K/S/B closure BUILD/bind P/N are already proven by `v08-standard-sdk-d01`, `v08-qualified-package-a01` and `v08-abi-s02a-capability` in the original candidate full run. Exact outcomes: valid Schema/Decision/Workflow/Operation proposals, unknown Kind, hostile/unsafe records, wrong-kind/dangling binding, imported package role-shadow refusal. This is a real source→already-executed P/N crosswalk, *no new test campaign*.

**Genuine additional evidence, but only PARTIAL selected-v0.8 qualification:** FR11 2/2 uses a real SQLite successor Node runtime and public compiled material, **not** selected one-argument K/S/B bootstrap; HF16 1/1 uses the real legacy coordinator and scheduler atop the shared fake store, **not** selected K; NEW-FUNCTION-01–04 pass 5/5 using public compiler-derived facts fed into existing DAC pure verifier functions, **but the bridge is in test code only and no production qualification→DAC→installed-v0.8 handoff is shown**. HF21/HF27/HF33 R3 reuse-only proofs exercise older `authority-class`, `WorkflowInstanceEngine`, and `GovernanceExecutionPin` suites, while selected v0.8 paths are a different seam. These 8 rows are **not falsely marked PASS**.

**Necessity:** current Domain Package correctness/security obligations remain IN (especially true selected K journal/UNKNOWN/authorization, current Host/UX, BUILD typed data and disclosure). Old pre-v1 public API/ABI/digest compatibility is OUT. Expo/Hermes parity is conditional on supported-v0.8 Host approval (not a default matrix); DAC facts are externally sourced, so an all-in-one Forge/Creator cross-repo production service is not automatically required, but accepted DAC verifier P/N and current BUILD/Host authority binding cannot be silently waived. This distinction is a review finding, not a Product rescope approval. Full/no-hidden reruns are unnecessary for docs/tests-only updates. R3 counts: **21 candidate P/N PASS / 19 candidate PARTIAL / 3 source-level / 1 legacy-only = 44**, with **23** remaining material selected/current-version acceptance rows.

## R4 zero-rerun, selected-v0.8 executable assertion crosswalk (2026-10-16)

This is a **new source-to-executed-test mapping, not new runtime execution**. The original real candidate full run at `b151320ee6835755ba043e2602c085c180c9c849` included all cited selected K/Host/UX files with 3,786 PASS, and a genuine T-F npm-packed dual-App Node consumer. Re-reading the concrete test assertions against the frozen per-row Product P/N slots is enough to remove five remaining mapping ambiguities:

- **FR03:** selected K tool/Operation effect receipt replay plus CAS winner, ambiguous/non-idempotent, duplicate and forged role refusals, backed by real SQLite S04 OperationCall.
- **FR14:** one selected K Effect/Journal authority across two real Apps with exact digest and replay sealing, stale Kernel seal/UNKNOWN/forged provider negatives.
- **FR10:** current selected Host typed UX intent/send/query/subscribe and signed principal provenance, forged/stale/revoked/cross-tenant denial, without pretending separate domain-ux application integration.
- **FR15:** selected S/H agent pure tool discoverability, hidden/effectful/stale/revoked denial, no privileged Journal escape, bounded UX tool bridge. Unrestricted host tool execution is HF29's own row, not silently folded into FR15.
- **HF28:** approved current **Node** selected K/S packaged consumer with real SQLite; unsupported or non-CAS Host fails closed. L1 HF28 specifies Expo/Hermes only if a new-v0.8 supported Host target is separately approved; historical stored Hermes parity is an oracle, not a release gate. No approval for Expo as a current v0.8 Host target is claimed here.

All five rows match an actual already-executed current-v0.8 P and N at exact candidate; **no full regression, Hidden or new platform test** was run. Product's useful functionality remains IN; compatibility-only old API/ABI OUT. The frozen machine manifest remains unchanged; actual successor qualification = **26 P/N PASS, 14 PARTIAL, 3 source-only, 1 legacy-only; 18 material P/N gaps**, grouped K 7, Host/UX 2 and BUILD/DAC 9. RELEASE=HOLD pending the remaining observables.

## R5 physically selected v0.8 Node24/SQLite falsifiers and confirmed implementation gaps (2026-10-16)

Real local R5 evidence at [#1006@6197730693](https://github.com/kaicreator-mm/domain-harness/issues/1006#issuecomment-6197730693), test-only PR [#1075](https://github.com/kaicreator-mm/domain-harness/pull/1075) merged `c9f498b74b72bcf824734b2a5d272492449e7a9a`. Node24 + real physical SQLite, **10/10 PASS** and 5 test/child files; no product source change; pre-existing full 3,786 and Hidden 34/34 not rerun. The new tests actually exercise `bootstrapTrustedHost` → `createKernelGateway` with a compiler-sealed K/S/B closure. Thus five currently selected-runtime P/N rows can be upgraded: **FR04, HF19, HF26, HF27, HF33**, with positive and negative receipts/paths summarized per row. R5 targeted-suite result is separate from the original full-suite evidence.

**Actual implementation gaps (not additional generic verification tasks):**

- **FR01**: illegal-final-transition negative/restart/child routing covered, **excessive child depth** falsifier absent from current selected K. Product decision or minimal selected nested child bound required. Never infer a limiter from tested HF32 child routing.
- **HF16**: selected K durably records failed effect, refuses duplicate and safely drains followers through fresh-process restart; however it expressly refuses any `recovery` turn-source, so Business-authorized poison reopen/retry is **unimplemented**. Old coordinator+fake-store test is only auxiliary.
- **HF21**: selected physical K/H does **not** carry PRODUCTION-vs-SIMULATION authority class; old `authority-class` test is not a current physical witness. Must add selected class gate before PROD effect/publication or Product-dispose explicitly.
- **HF29**: BUILD compiler permits host-local tool bind but selected `host-v8` has no approved local/HTTP/script execution seam. Legacy old module and read-only agent-query HF23 are not substitutes. Minimal typed Host tool port or Product disposition required.

The other remaining **nine** material rows are BUILD/DAC: FR11, HF24/HF25/HF30/HF34, NEW-FUNCTION-01–04. R3 test-side compiler→DAC mapping is evidence, but cannot claim shipping production BUILD→DAC consumption; avoid adding unrequired all-app Creator/Forge E2E gates. Product's accepted previously useful semantics stay IN. Current totals **31 exact-candidate P/N PASS / 9 PARTIAL / 3 SOURCE-ONLY / 1 LEGACY-ONLY = 44**, **13 material gaps** (Kernel FR01/HF16/HF21 = 3; Host HF29 = 1; BUILD/DAC = 9). `RELEASE=HOLD`; a production fix changes the source candidate and triggers only affected revalidation, not automatic acceptance on prior Hidden.
