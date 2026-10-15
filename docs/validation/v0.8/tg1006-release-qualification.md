# DomainHarness v0.8 — T-G Release Qualification R6 (HF16 selected success, successor production candidate still HOLD)

**Decision (2026-10-16): `RELEASE_HOLD_RETAINED_FUNCTION_PN_GAPS` (R6 successor source: HF16 resolved, new production candidate not yet independently requalified).** This is a concrete evidence-based qualification, not a newly requested full test campaign, a tag authorization or a claim that all 44 retained functions passed. T-G [#1006](https://github.com/kaicreator-mm/domain-harness/issues/1006) stays OPEN (**formal DAG 6/7**).

## 1. Exact candidate and verified gates

| Gate | Evidence / disposition |
|---|---|
| Product/L2 + formal T-A–T-F | Product Freeze #953, L2 Freeze #999 and six closed formal T-A–T-F implementation Issues. Only T-G remains open. |
| Frozen source | `b151320ee6835755ba043e2602c085c180c9c849` / tree `a8135b2a217edff395da0a4f31dd7955d3b3db5a`. The later `v0.8` branch HEAD `3c48d8162c85dc451579079daa664d2442c02798` adds test/evidence docs only and has NOT been substituted into the hidden candidate binding. |
| One real full regression | Real Windows Node `24.21.0` + npm `11.19.0`, build/lint/typecheck/test all EXIT=0; **3,786 PASS, 0 FAIL, 0 SKIP**, [exact run record](tg1006-final-candidate-execution.md). No unreported new run. |
| One targeted gap batch | **6/6 PASS** on the frozen candidate with 4 source roots: WeakMap decision-source load refusal, post-commit cache read-fault ACK, two-capability shared OperationId role separation, 17th-turn durable eviction/recovery guard. S05's test-oracle correction was exercised by the full run. |
| Real consumer & journeys | Same full run includes clean `npm pack` consumer, actual Approval D2 and Engineering self-dogfood D3 Domain Apps sharing K/S, real SQLite restart and cross-process CAS/UNKNOWN/effect checks. |
| Exact-equivalent PR CI | Woodpecker `ci/woodpecker/pr/verify` **PASS** at evidence PR #1069 commit `62a7660f...` ([pipeline 1272](https://ci.kaicreator.com/repos/18/pipeline/1272/1)); no production source delta against the candidate. PR #1069 independently bounded-reviewed, then merged to `v0.8` at `3c48d816...`. Do not claim exact frozen SHA itself had a separate CI run. |
| Hidden Validation | **34/34 PRIVATE scenario executions PASS**, 0 public findings, runner EXIT=0, reviewed private PREPACK rev5 `DH08-PP-53-01` and FINAL `DH08-FP-53-01` rev1, candidate/tree/adapter/artifact SHA256 pinned, public [#1006@6194609734](https://github.com/kaicreator-mm/domain-harness/issues/1006#issuecomment-6194609734). Full non-sensitive attestation: [Hidden evidence](tg1006-hidden-prepack-attestation.md). Private PR #60 merged `f9ec2dcc`; result archive PR #61 merged `923100ad`. |
| Development execution identity | User-authorized `SELF_DECLARED_UNVERIFIED`: **no Owner identity or GitHub-login distinctness checks**. Product caller/tenant/role authorization still applies. This is not a proof of executor identity independence. |


**R6 SOURCE SUCCESSOR (no frozen-candidate evidence mutation):** HF16 code PR [#1079](https://github.com/kaicreator-mm/domain-harness/pull/1079) merged at `0b53d95883c7af216ef9417db3ad646470a1a219`. Exact R2 HEAD `616bcf23...` source review #5539677584 PASS_BOUND_DELTA, real selected Node24/SQLite 5/5 focused plus 145/145 impacted tests, original poisoned effect never re-executes, authorized one-shot corrected turn, typed unverified/fabricated/foreign poison denial before durable CAS, duplicate/restart zero double-effect; R1 full remote CI #1285 SUCCESS, R2 #1286 was still PENDING at merge and is **NOT CLAIMED PASS**. Frozen old candidate full 3,786 and private Hidden 34/34 are evidence for **old product bytes**, not automatic release qualification for this successor source. This source update changes K/Host; final Release Qualification must pin source SHA, recheck affected safety and final unified acceptance, reusing unchanged evidence where justified. R6 44-row *proof coverage* now **32 P/N / 8 partial / 3 source-only / 1 legacy-only**, **12 material gaps**: FR01, HF21, HF29, FR11, HF24/25/30/34 and NF01–04. Separate Draft PR #1083 pure-DAC packaged export is unbuilt/unverified, not counted.

## 2. Release-blocking evidence gap — frozen useful functions IN

**R2 historical evidence reuse:** after R1 was merged in PR #1070 (`723a3445`), a source-only Web review matched three previously under-classified rows — FR06/HF22/HF31 — to *already executed* exact-candidate compiler/core accepted-and-refused assertions. No code/test bytes changed and no suites were rerun. The authorized successor 44-row ledger records exact test names and the revised counts below; the frozen manifest is unchanged. This R2 supersedes only R1's **27-row gap count**, not its underlying 3,786 + 6 + Hidden 34/34 evidence.


**R3 audit, not a blanket 9-row promotion.** T-G R3 locally ran 8/8 targeted tests at unchanged production candidate bytes (3 test files, Node24, real SQLite for FR11, no full-suite/Hidden rerun), then merged via [PR #1072](https://github.com/kaicreator-mm/domain-harness/pull/1072) at `3fa73f2a`. Exact source review found some witnesses use old/successor runtime modules rather than selected v0.8 K/S/B, and NF01–04 current compiler-to-DAC inputs are *assembled in test code*, not a shipped production bridge. These are useful positive/negative tests, not proof of current selected-runtime integration. Existing exact candidate v0.8 BUILD+Kind tests **do** close FR13 via source-only witness mapping (D01 P/N and A01/S02A approved closure+role/type P/N), giving **21** full P/N PASS. The remaining **23** rows stay visible, with richer PARTIAL witness coverage; see revised ledger.

**R4 actual-current-selected-runtime crosswalk:** five more rows, FR03/FR14/FR10/FR15/HF28, each have genuinely previously executed P/N asserts within the **already completed frozen-candidate full run**, including selected K CAS/Journal/UNKNOWN and receipt, authenticated typed Host UX, bounded S agent tool read and the Node npm-packed dual-App consumer. Exact test IDs and negative behaviors are given per row in the successor ledger; no new runtime/Hidden execution. HF28's historical Expo/Hermes claim is **conditional** under frozen Product L1 on explicitly approved v0.8 Host support; Node is the only required physical Host shown here, and stored Hermes evidence cannot stand in for a live target. No extra Windows/Linux/WSL2 or Expo matrix introduced. New total: **26 P/N PASS / 14 PARTIAL / 3 SOURCE-ONLY / 1 LEGACY-ONLY; 18 material acceptance gaps**. This R4 supersedes only prior numerical counts while retaining historical R1/R2/R3 evidence.

**R5 real selected-runtime receipt:** test-only PR #1075 (merged `c9f498b74b72bcf824734b2a5d272492449e7a9a`) adds five T-G test/child files, actual Node24/SQLite selected `bootstrapTrustedHost` + `createKernelGateway` sealed K/S/B end-to-end **10/10 PASS** (local report #1006@6197730693). This legitimately closes FR04/HF19/HF26/HF27/HF33 current selected P/N by actual physical assertions. **Other four K/Host rows have actual missing product semantics**: FR01 child depth cap, HF16 authorized poison recovery, HF21 SIM/PROD effect gate, HF29 selected local/HTTP/script tools. No production source was modified; prior 3,786 full and 34/34 private Hidden remain the actual original candidate evidence, not evidence for future changed production bytes. The separate Woodpecker PR #1075 pipeline 1279 had been pending at source review and is **not** asserted CI PASS by this R5 evidence.

The approved [Product](../../product/DomainHarness_v0.8_PRODUCT_FREEZE.md) and [L2 Freeze](../../architecture/DomainHarness_v0.8_L2_FREEZE.md) explicitly require retained **useful functional behavior**, not historical pre-v1 API/ABI/asset compatibility. The immutable 44-row retained-function manifest is audit lineage, while the authorized [candidate-scope successor ledger](tg1006-44-row-successor-outcome-ledger.md) records what was **actually asserted** in executed candidate tests.

| Current retained-function outcome | Rows | Meaning |
|---|---:|---|
| `CANDIDATE-PN-PASS` | **32** | Exact current-candidate P AND N observable genuinely executed. |
| `CANDIDATE-PARTIAL` | **8** | Relevant candidate tests passed but required individual P/N behavior remains partially unproven. |
| `SOURCE-LEVEL-EXECUTED` | **3** | Compiler BUILD/unit source ran; independent consumer/physical scope is missing. |
| `LEGACY-EXECUTED / SELECTED-NOT-RUN` | **1** | Historical tests ran, but selected v0.8 BUILD/DAC bridge behavior is not verified. |
| **Total** | **44** | **12** entries still have unproven material acceptance, not failures. |

The 34/34 Hidden PASS is orthogonal: it proves the independently composed blind scenarios ran against the exact candidate, but **does not automatically establish each of 44 specified individual P/N acceptance rows**; private oracle/fixture mappings cannot be published to backfill the public ledger by guesswork.

### Bounded closure workstreams — not 13 new campaigns

1. **Kernel/authority 2**: FR01, HF21. HF16 R6 selected source P/N merged PR #1079. FR04/HF19/HF26/HF27 have now been exercised via real selected Kernel physical P/N on PR #1075, FR03/FR14 already crosswalked; FR01 child-depth, HF16 authorized recovery and HF21 simulation/class effect gates are actual feature gaps. Review *actual executed* Kernel/Host/real-SQLite T-F/KPK/HF18/HF20/UNKNOWN test assertions against each row's frozen P/N requirement. Only truly uncovered fault roots warrant a new selected fixture.
2. **Host/UX 1**: HF29. HF33 selected pinned physical resource P/N is now evidenced in #1075; FR10/FR15 authenticated UX and agent read-only bridge P/N plus HF28 qualified Node packed consumer P/N were earlier crosswalked. Expo remains conditional/outside current required Host without explicit approval. Match actual packed D2/D3 and Host/UX/role/resource tests to the row's acceptance. Do not require non-approved Expo/Hermes full parity or a Windows/Linux/WSL2 platform matrix solely from historical API claims; explicitly distinguish mandatory current Node Host behavior from out-of-scope legacy compatibility.
3. **BUILD, ABI and DAC bridge 9**: FR11, HF24, HF25, HF30, HF34, NEW-FUNCTION-01–04. FR13 selected Kind P/N is now evidenced by old executed candidate tests; FR11 and NF01–04 have additional R3 tests but remain PARTIAL for missing selected-runtime/production bridge proof. FR06/HF22/HF31 are now supported by same-candidate compiled+actual loaded positive and negative evidence already executed; see the R2 row crosswalk in the successor ledger. Reconcile existing 374 compiler tests, clean packed consumer and exact selected BUILD/DomainData/DAC runtime tests with functional P/N. Old ABI byte parity is OUT, but accepted useful functionality remains IN.

**Process:** (a) source-only Web crosswalk over frozen row text → executed assertion/test ID and candidate exact SHA; (b) reuse original executed logs and private Hidden PASS (only public-safe aggregated claims), (c) identify a deduplicated **minimal** truly absent acceptance set, (d) dispatch targeted native tests ONLY for those, (e) update the successor ledger after actual proof; retain all unresolved rows honestly. A code change, if one is really needed, is a separate issue/PR with narrowly scoped diff verification. **Do not** rerun full 3,786 tests or repeat the 34 private Hidden scenarios because this documentation is amended.

## 3. Release disposition and non-waiver

```ini
EVENT=DH08_TG_RELEASE_QUALIFICATION_R6_PROVISIONAL
SOURCE_OF_TRUTH=LIVE_GITHUB
CANDIDATE_SHA=b151320ee6835755ba043e2602c085c180c9c849
CANDIDATE_TREE=a8135b2a217edff395da0a4f31dd7955d3b3db5a
FORMAL_TASKS_CLOSED=6_OF_7
NATIVE_FULL=3786_PASS_0_FAIL_0_SKIP_NODE24
R3_TARGETED=8_PASS_EXIT0_TEST_ONLY_COMMIT_3fa73f2a
R5_TARGETED=10_PASS_EXIT0_TEST_ONLY_COMMIT_c9f498b7
TARGETED=6_PASS_0_FAIL
CRITICAL_JOURNEYS=REAL_D2_D3_PACKED_PASS
HIDDEN=34_OF_34_PASS
HIDDEN_PUBLIC_FINDINGS=0
PRIVATE_EVIDENCE=HIDDEN_VALIDATION_PR60_PR61_MERGED
CI=PASS_EXECUTABLE_EQUIVALENT_PR1069_62a7660
RETAINED_44=32_PN_PASS_8_PARTIAL_3_SOURCE_ONLY_1_LEGACY_ONLY
MATERIAL_PN_GAPS=12
PRODUCTION_COMPAT_PRE_V1=OUT
OWNER_GITHUB_LOGIN_GATE=NONE
RELEASE_QUALIFIED=NO
TAG=NO
SUCCESSOR_MERGE=0b53d95883c7af216ef9417db3ad646470a1a219
HF16_R2_CI_AT_MERGE=PENDING_NOT_PASS
ISSUE_1006=OPEN
NEXT=FIX_OR_PRODUCT_DISPOSE_FR01_HF21_HF29_AND_PROVE_BUILD_DAC_NINE_NEW_CANDIDATE_VALIDATION
```

This is a **HOLD on unproven acceptance, not a product test failure**. No security/CAS/false-ACK defect is waived. Re-evaluate after only the material unproven tests are matched or executed; a legitimate Product rescope of a historically *compatibility-only* item requires an explicit recorded decision rather than implicit status promotion. A subsequent qualification must name the exact source and actual test receipts.
