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
| FR03 | K | CANDIDATE-PARTIAL | compiler C01; `s04-operation-call` (4/4) | full FR03 observable mapping |
| FR04 | K | CANDIDATE-PARTIAL | compiler C01; `i02-auth-ux-kernel`; `journal-tenant-isolation` | DomainMessage ACK/dedup full matrix |
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
| FR10 | U | CANDIDATE-PARTIAL | `i02-auth-ux-kernel` role/tenant denial | full DAC UX role-safe bridge mapping |
| FR14 | K | CANDIDATE-PARTIAL | compiler C01; `T-F E2E` single K journal/authority | whole-FR14 P/N mapping |
| FR15 | U | CANDIDATE-PARTIAL | `i02-auth-ux-kernel`; `s04-operation-call` | agent/resource exposure completion |
| HF16 | K | CANDIDATE-PARTIAL | compiler C01 crash/ambiguous journal selected | poison-queue drain witness |
| HF19 | K | CANDIDATE-PARTIAL | compiler C01; `journal-tenant-isolation` | atomic ProcessCommand terminal proof |
| HF21 | K | CANDIDATE-PARTIAL | `i02-auth-ux-kernel` tenant separation | SIM/PROD authority isolation |
| HF26 | K | CANDIDATE-PARTIAL | compiler C01; `i02` denial receipt | complete provenance/evidence per row |
| HF27 | K | CANDIDATE-PARTIAL | compiler C01; `v08-host-multiprocess` serialized lane + CAS races | per-instance exact falsifier |
| HF28 | H | CANDIDATE-PARTIAL | `T-F E2E` packed consumer; `v08-host-multiprocess` | Expo v0.8 scope/host evidence |
| HF29 | H | CANDIDATE-PARTIAL | compiler `host-local-tool-binding`; `s04-operation-call` | allowed local/HTTP/script matrix |
| HF33 | H | CANDIDATE-PARTIAL | `i03-closure-pin`; `s05-capability-identity` (5/5 incl. #1067 dispatch-derived key fix) | same-occurrence resource currentness |
| FR11 | BUILD | SOURCE-LEVEL-EXECUTED | compiler `domain-data-section` / `domain-data-schema-contract` green | compiled typed Domain Data exact v0.8 consumer P/N |
| FR13 | BUILD | SOURCE-LEVEL-EXECUTED | compiler `v08-qualified-package-a01`, `v08-capability-package-s02a` binding/Kind checks | full row split proof |
| HF22 | BUILD | CANDIDATE-PN-PASS | **R2 Web source↔executed-assertion crosswalk**: compiler `v08-qualified-package-a01` B12 permitted sealed relative transitive import P / missing sibling typed N + A01-N3 dynamic/unsealed import negative; `v08-capability-package-s02a` B1/B4 physical `load(root)` with sealed capability closure positive and N1–N7 undeclared/forged/duplicate/wrong-kind/role-shadow/dynamic import refusals. Executed in the candidate compiler 374/374; selected core load integration from the same suite, not old-ABI parity. | — |
| HF24 | BUILD | SOURCE-LEVEL-EXECUTED | compiler `business-source-section` BUILD projection | exact current P/N signoff |
| HF25 | BUILD | SOURCE-LEVEL-EXECUTED | compiler typed codegen sources | consumer P/N |
| HF31 | BUILD | CANDIDATE-PN-PASS | **R2 Web source↔executed-assertion crosswalk**: compiler `v08-qualified-package-a01` B1 canonical accepted submission → real `load(root)` P, B8 hostile accessor N with getter count exactly 0, B9 own `__proto__` N; core `v08-abi-a01` positive sealed load plus N4 hostile accessor/prototype rejection before module load. Both candidate suites ran green (374 compiler + 3145 core). | — |
| HF34 | BUILD | SOURCE-LEVEL-EXECUTED | compiler canonical digest/refusal checks | definition-graph exact P/N |
| HF30 | BUILD | LEGACY-EXECUTED / SELECTED-NOT-RUN | `dac-v0041-runtime-activation` historic | selected BUILD integrated proof |
| NEW-FUNCTION-01 | BUILD | LEGACY-EXECUTED / SELECTED-NOT-RUN | `dac-v0041-compatibility` historic | selected BUILD bridge |
| NEW-FUNCTION-02 | BUILD | LEGACY-EXECUTED / SELECTED-NOT-RUN | `dac-v0041-composition-intake` historic | selected BUILD bridge |
| NEW-FUNCTION-03 | BUILD | LEGACY-EXECUTED / SELECTED-NOT-RUN | `dac-v0041-runtime-binding` historic | selected runtime activation |
| NEW-FUNCTION-04 | BUILD | LEGACY-EXECUTED / SELECTED-NOT-RUN | `dac-v0041-runtime-activation` historic | NF04 Host deployment parity |

## Counts (candidate scope)

- `CANDIDATE-PN-PASS`: 20 rows — the original 17 selected-P/N rows
  (FR02, FR05, FR07, FR08, FR09, FR12, HF17, HF18, HF20, HF23, HF32, FR08-P/N-SD1,
  FR08-P/N-SD2, NEW-FUNCTION-05, NEW-FUNCTION-06) PLUS the R2 executed-test crosswalk
  FR06, HF22, HF31. All were asserted by test suites already green on the exact candidate;
  original four gap roots were closed by the same-candidate 6/6 targeted batch.
- `CANDIDATE-PARTIAL`: 14 rows (executed subset green; listed remainders NOT_RUN).
- `SOURCE-LEVEL-EXECUTED`: 5 rows (compiler suite green at candidate; physical/consumer
  acceptance NOT_RUN).
- `LEGACY-EXECUTED / SELECTED-NOT-RUN`: 5 rows.
- Aggregate: 20 + 14 + 5 + 5 = 44 rows with candidate-scope dispositions; 24 rows still
  carry NOT_RUN material (14 partial remainders + 5 physical acceptances + 5 selected
  bridges). The by-row table above is the authority.

## Outstanding for Release (HOLD — R2 evidence crosswalk)

1. **Hidden Validation — COMPLETE/PASS**, **34/34 executed** on the exact frozen candidate, 0 public findings, runner exit 0. See the updated `tg1006-hidden-prepack-attestation.md` and public-safe [#1006@6194609734](https://github.com/kaicreator-mm/domain-harness/issues/1006#issuecomment-6194609734); private PREPACK rev5 and real execution are archived in private merged PRs #60/#61. The prior same-login/Owner identity blocker was intentionally removed by user decision; execution identity is trusted self-declaration.
2. The **24 material NOT_RUN retained-function obligations** enumerated per row above remain open: 14 partially executed rows, 5 source-level only and 5 legacy-only. A 34/34 Hidden aggregate PASS does not by itself prove the frozen P/N acceptance for all 44 individual historical functions.
3. Release Qualification remains **HOLD pending exact P/N coverage/rescope for those 24 rows and a subsequent release decision**; source-evidence PR #1069 was bounded-reviewed/merged, with exact executable-byte-equivalent Woodpecker pass already recorded. A GitHub-account Owner distinctness gate is not required.

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

Private `DH08-FP-53-01` revision 1 was minted using exact live candidate freeze/review read-backs and executed 34/34 scenarios with aggregate PASS on `b151320ee6835755ba043e2602c085c180c9c849` (tree `a8135b2a217edff395da0a4f31dd7955d3b3db5a`). The full private archive lives at `kaicreator-mm/hidden-validation` PR #61 merged `923100ad06159621d5be42c1c1e377161cfcf34d`; only the public-safe result was posted at `domain-harness#1006@6194609734`. **At the time of that Hidden-only appendix, the 44 row classifications were unchanged; the later R2 source crosswalk below upgrades three rows using old executed test evidence. The historical public run record remains unchanged.** No extra suite was run to append this documentary update. Release remains HOLD on the 24 specific P/N remnants, pending a bounded candidate-evidence crosswalk or actual missing targeted tests.

## R2 reuse-first source-to-executed crosswalk — FR06/HF22/HF31 (no new native run)

The exact frozen-candidate test sources, independently read again by Web, make three former `NOT_RUN` *mapping* gaps demonstrably covered by **already executed** P/N assertions in the single original full run: `FR06` qualified root compile/approved load/forged or drifted root rejection; `HF22` sealed transitive provider and capability closure acceptance with missing/unsafe transitive or shadowed binding refusal; `HF31` accepted canonical records with hostile getter/prototype refusal before import and explicit zero getter invocation. Positive and negative test IDs are recorded per row above. Compiler `374/374` and core `3145/3145` ran on the exact candidate `b151320ee6835755ba043e2602c085c180c9c849` (see `tg1006-final-candidate-execution.md`). This is **candidate evidence reuse**, not a claim that Web reran Node/SQLite; no new test or full regression was started. The frozen manifest itself was not modified. Counts: **20 P/N PASS / 14 partial / 5 source-level / 5 legacy-only = 44**, leaving **24 material P/N gaps**.
