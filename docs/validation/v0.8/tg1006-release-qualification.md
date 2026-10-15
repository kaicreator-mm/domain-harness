# DomainHarness v0.8 — T-G Release Qualification R1

**Decision (2026-10-15): `RELEASE_HOLD_RETAINED_FUNCTION_PN_GAPS`.** This is a concrete evidence-based qualification, not a newly requested full test campaign, a tag authorization or a claim that all 44 retained functions passed. T-G [#1006](https://github.com/kaicreator-mm/domain-harness/issues/1006) stays OPEN (**formal DAG 6/7**).

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

## 2. Release-blocking evidence gap — frozen useful functions IN

The approved [Product](../../product/DomainHarness_v0.8_PRODUCT_FREEZE.md) and [L2 Freeze](../../architecture/DomainHarness_v0.8_L2_FREEZE.md) explicitly require retained **useful functional behavior**, not historical pre-v1 API/ABI/asset compatibility. The immutable 44-row retained-function manifest is audit lineage, while the authorized [candidate-scope successor ledger](tg1006-44-row-successor-outcome-ledger.md) records what was **actually asserted** in executed candidate tests.

| Current retained-function outcome | Rows | Meaning |
|---|---:|---|
| `CANDIDATE-PN-PASS` | **17** | Exact current-candidate P AND N observable genuinely executed. |
| `CANDIDATE-PARTIAL` | **15** | Relevant candidate tests passed but required individual P/N behavior remains partially unproven. |
| `SOURCE-LEVEL-EXECUTED` | **7** | Compiler BUILD/unit source ran; independent consumer/physical scope is missing. |
| `LEGACY-EXECUTED / SELECTED-NOT-RUN` | **5** | Historical tests ran, but selected v0.8 BUILD/DAC bridge behavior is not verified. |
| **Total** | **44** | **27** entries still have unproven material acceptance, not failures. |

The 34/34 Hidden PASS is orthogonal: it proves the independently composed blind scenarios ran against the exact candidate, but **does not automatically establish each of 44 specified individual P/N acceptance rows**; private oracle/fixture mappings cannot be published to backfill the public ledger by guesswork.

### Bounded closure workstreams — not 27 new campaigns

1. **Kernel/authority 9**: FR01, FR03, FR04, FR14, HF16, HF19, HF21, HF26, HF27. Review *actual executed* Kernel/Host/real-SQLite T-F/KPK/HF18/HF20/UNKNOWN test assertions against each row's frozen P/N requirement. Only truly uncovered fault roots warrant a new selected fixture.
2. **Host/UX 5**: FR10, FR15, HF28, HF29, HF33. Match actual packed D2/D3 and Host/UX/role/resource tests to the row's acceptance. Do not require non-approved Expo/Hermes full parity or a Windows/Linux/WSL2 platform matrix solely from historical API claims; explicitly distinguish mandatory current Node Host behavior from out-of-scope legacy compatibility.
3. **BUILD, ABI and DAC bridge 13**: FR06, FR11, FR13, HF22, HF24, HF25, HF30, HF31, HF34, NEW-FUNCTION-01–04. Reconcile existing 374 compiler tests, clean packed consumer and exact selected BUILD/DomainData/DAC runtime tests with functional P/N. Old ABI byte parity is OUT, but accepted useful functionality remains IN.

**Process:** (a) source-only Web crosswalk over frozen row text → executed assertion/test ID and candidate exact SHA; (b) reuse original executed logs and private Hidden PASS (only public-safe aggregated claims), (c) identify a deduplicated **minimal** truly absent acceptance set, (d) dispatch targeted native tests ONLY for those, (e) update the successor ledger after actual proof; retain all unresolved rows honestly. A code change, if one is really needed, is a separate issue/PR with narrowly scoped diff verification. **Do not** rerun full 3,786 tests or repeat the 34 private Hidden scenarios because this documentation is amended.

## 3. Release disposition and non-waiver

```ini
EVENT=DH08_TG_RELEASE_QUALIFICATION_R1
SOURCE_OF_TRUTH=LIVE_GITHUB
CANDIDATE_SHA=b151320ee6835755ba043e2602c085c180c9c849
CANDIDATE_TREE=a8135b2a217edff395da0a4f31dd7955d3b3db5a
FORMAL_TASKS_CLOSED=6_OF_7
NATIVE_FULL=3786_PASS_0_FAIL_0_SKIP_NODE24
TARGETED=6_PASS_0_FAIL
CRITICAL_JOURNEYS=REAL_D2_D3_PACKED_PASS
HIDDEN=34_OF_34_PASS
HIDDEN_PUBLIC_FINDINGS=0
PRIVATE_EVIDENCE=HIDDEN_VALIDATION_PR60_PR61_MERGED
CI=PASS_EXECUTABLE_EQUIVALENT_PR1069_62a7660
RETAINED_44=17_PN_PASS_15_PARTIAL_7_SOURCE_ONLY_5_LEGACY_ONLY
MATERIAL_PN_GAPS=27
PRODUCTION_COMPAT_PRE_V1=OUT
OWNER_GITHUB_LOGIN_GATE=NONE
RELEASE_QUALIFIED=NO
TAG=NO
ISSUE_1006=OPEN
NEXT=REUSE_FIRST_FROZEN_ROW_PN_CROSSWALK
```

This is a **HOLD on unproven acceptance, not a product test failure**. No security/CAS/false-ACK defect is waived. Re-evaluate after only the material unproven tests are matched or executed; a legitimate Product rescope of a historically *compatibility-only* item requires an explicit recorded decision rather than implicit status promotion. A subsequent qualification must name the exact source and actual test receipts.
