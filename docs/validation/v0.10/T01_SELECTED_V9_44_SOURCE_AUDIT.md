# DomainHarness v0.10 — T01 retained 44 selected-v9 reachability audit

> **SOURCE_ONLY / NO_NEW_TESTS_RUN / NOT_RELEASE_EVIDENCE.** Owning Task [#1165](https://github.com/kaicreator-mm/domain-harness/issues/1165), revised Task Pack [#6253116633](https://github.com/kaicreator-mm/domain-harness/issues/1165#issuecomment-6253116633), accepted Builder generation 2 [#6253137402](https://github.com/kaicreator-mm/domain-harness/issues/1165#issuecomment-6253137402). Source baseline `v0.10@32b6e776000669014c0384110e0340be59d5fd4b`. This is a **successor evidence file**, not an edit to Product/L1 history.

## 1. Authority and reachable surface

- Original 44-row manifest `docs/implementation/DomainHarness_v0.8_RETAINED_FUNCTION_MANIFEST.json` blob `a9954b82eab6e57e9ac1af1bf7b7d5b268d61c49`, **unchanged**; previous v08 source map `docs/validation/v08-retained-44-web-source-evidence-map.md` blob `7c218c569077be98e4252ca6d1d67a56d9368571` is historical **not** new v09 external-public acceptance.
- Original Product/L1 crosswalk `docs/roadmap/DomainHarness_v0.10_HISTORICAL_CAPABILITY_CROSSWALK.md` blob `2832ce0b4269737d934b071a6c2e830deefec629` is **READ-ONLY, preserved**. It says `AUDIT_PENDING` for selected-v9 reachability. This file supplies that bounded post-L2 audit without changing the original Product snapshot.
- Frozen v0.10 Product R3 blob `673da42ad90acde5ef942beb8ac63b58836a649f`; accepted A01 `6777acf013a24229e7aa28b4c5b7768e6070b350`; L2 reviewed R3 `9e58c629b0a2074617ca3d38ac85d9527f284aab`, L2 Freeze `b7712055debbd8d36762e0a721cf69ab1a38516e`; DAG `f375bb0acd1099da76f0849a1929ad11831b12f7`.
- Selected **published** v9 surface at exact baseline: `packages/domain-harness/src/public-v9/index.ts` blob `10746676bb6312bcb459c624f684f0286d7c8aaa`, `contracts.ts` `8437f9860a788b3eca2fdcc91d135aa3eb0d446a`, `runtime-channel.ts` `ccfc02318e2e5ee45ae9bc6b28c972ab73159c8f`, protected `operation-bridge.ts` `66a7404d265d9f1dbddbe34cf03bf359fa89e381`. Consumer can call **load(installedRef) → send/query/subscribe/stop**, not every internal legacy library symbol.
- **R** = actual selected-v9 public-route full historical row mapped to positive+negative *test source*; **S** = selected-v9 subset has source, full row positive+negative **ABSENT**; **L** = legacy-only, no selected public v9 P+N; **O** = historical BUILD/Host/target obligation not exposed as public-v9 complete P+N. R does **not** mean test executed this turn, feature implemented for v0.10 or release PASS.

## 2. Inspected selected-v9 source/test references

- **E1:** [`packages/domain-harness/tests/v09-operation-bridge.test.ts`](https://github.com/kaicreator-mm/domain-harness/blob/32b6e776000669014c0384110e0340be59d5fd4b/packages/domain-harness/tests/v09-operation-bridge.test.ts) blob `8e3e0c478515508811914c081389220e49c182cd` — P1/P2/P3, N1–N5, R1/R2, U1 protected two-App H→K live effect/denial/restart.
- **E2:** [`packages/domain-harness/tests/v09-host-registry-n06.test.ts`](https://github.com/kaicreator-mm/domain-harness/blob/32b6e776000669014c0384110e0340be59d5fd4b/packages/domain-harness/tests/v09-host-registry-n06.test.ts) blob `349273040537274eebb849075d26fd3ad281a7c8` — canonical V1/V2, unsafe record refusal, positive activation, tampered bytes/currentness/ABI negatives — historical v9 Host mechanism only.
- **E3:** [`packages/domain-harness/tests/v09-deployment-bootstrap.test.ts`](https://github.com/kaicreator-mm/domain-harness/blob/32b6e776000669014c0384110e0340be59d5fd4b/packages/domain-harness/tests/v09-deployment-bootstrap.test.ts) blob `ffc140a0051e8c26cd1cf796d33dd30326ee2eb6` — selected deployed two-App positive.
- **E3N:** [`packages/domain-harness/tests/v09-public-runtime-channel.test.ts`](https://github.com/kaicreator-mm/domain-harness/blob/32b6e776000669014c0384110e0340be59d5fd4b/packages/domain-harness/tests/v09-public-runtime-channel.test.ts) blob `722202df99ac260547d7e748e9b1f0325bbffe50` — public no Host/same-shape fake/privilege export negatives.
- **E4:** [`packages/domain-harness-compiler/tests/v09-selected-abi-n01.test.ts`](https://github.com/kaicreator-mm/domain-harness/blob/32b6e776000669014c0384110e0340be59d5fd4b/packages/domain-harness-compiler/tests/v09-selected-abi-n01.test.ts) blob `b68f1e3c5929350cbe04aea24bda8a2d5caa12c7` — BUILD P1–P3, N1–N4; selected Router K1–K4/I01.
- **E5:** [`packages/domain-harness/tests/v09-host-effect-permit.test.ts`](https://github.com/kaicreator-mm/domain-harness/blob/32b6e776000669014c0384110e0340be59d5fd4b/packages/domain-harness/tests/v09-host-effect-permit.test.ts) blob `9590541d9218eac8c0388d7223a176ff801c4102` — PERMIT01 positive, PERMIT02 etc denial/refusal and CAS.
- **E6:** [`packages/domain-harness/tests/v09-lifecycle-integration.test.ts`](https://github.com/kaicreator-mm/domain-harness/blob/32b6e776000669014c0384110e0340be59d5fd4b/packages/domain-harness/tests/v09-lifecycle-integration.test.ts) blob `c6070c13f39a2e3cf71a2d873454235ea122f8cd` — LIFEI01/02 positives, LIFEI03/04/05/07 negatives.
- **E7:** [`packages/domain-harness-node/tests/store/v09-physical-cas.test.ts`](https://github.com/kaicreator-mm/domain-harness/blob/32b6e776000669014c0384110e0340be59d5fd4b/packages/domain-harness-node/tests/store/v09-physical-cas.test.ts) blob `dd3d18c03bd7eef8c9af819196311234c0e65109` — SQLite true CAS positive/negative, cross-process, restart, SIGKILL source cases.
- **E8:** [`packages/domain-harness-compiler/tests/v09-build-zero-import-n06.test.ts`](https://github.com/kaicreator-mm/domain-harness/blob/32b6e776000669014c0384110e0340be59d5fd4b/packages/domain-harness-compiler/tests/v09-build-zero-import-n06.test.ts) — selected v09 BUILD/zero-import source.
- **E9:** [`packages/domain-harness/tests/v09-external-consumer.test.ts`](https://github.com/kaicreator-mm/domain-harness/blob/32b6e776000669014c0384110e0340be59d5fd4b/packages/domain-harness/tests/v09-external-consumer.test.ts) blob `d99284afc6db9f43da400b623cbed08e169a2da3` — clean packed two-B public load/send/query/subscribe/stop.

The above paths and named test assertions were source-inspected at this baseline. **v09 BRIDGE P1 or a legacy internal function alone never proves advanced Rule/cache/Agent/Memory/Shadow and never proves a complete historical row when labeled S.** For E3's negatives use E3N. E4's pure Router is not the advanced SemanticDecision resolver. E2's Host static trust mechanism is historical and **must not be copied into the v0.10 SDK** under accepted A01.

## 3. Exactly 44 frozen historical IDs (one row per ID)

| Historic ID | Historical owner | R/S/L/O | v0.10 semantic/Tool authority | Selected-v9 P+N source or explicit ABSENT + limitation | Future Task(s) |
|---|---|---|---|---|---|
| `FR01` | K | S | SPLIT: K+S | **full P+N ABSENT** (selected subset); E1 P3/reload, N4 router; no child WAIT/RESUME selected P+N | T03 |
| `FR02` | S | L | SEMANTIC | **P+N ABSENT** (legacy-only); portable expression and safe-script not in selected v9 public API; E4 Router is not an expression evaluator | T02 |
| `FR03` | K | S | SPLIT: K+TOOL_EFFECT | **full P+N ABSENT** (selected subset); E1 U1/R1 prove governed UNKNOWN/permit; generic durable external Tool runner not selected | K01,C01 |
| `FR04` | K | S | KERNEL_PROTOCOL | **full P+N ABSENT** (selected subset); E1 P3/N3 confirm selected send/denial only; v9 lacks canonical-input replay conflict and original same-CAS receipt | K02 |
| `FR05` | S | S | SPLIT: SEMANTIC+K | **full P+N ABSENT** (selected subset); E1 P2/N5 + E9 packed query; no selected multi-source scoped projection/two-B key collision P+N | T10 |
| `FR06` | M | R | BUILD_OR_LIFECYCLE | **selected-v9 P+N test SOURCE mapped**; P E2 activation + E3 bootstrap; N E2 tampered stored bytes / E3 no-context load; v9-only static Host trust, successor A01 moves static checks to BUILD | T00 |
| `FR07` | S | S | SEMANTIC | **full P+N ABSENT** (selected subset); E1 P1/N4 basic route, not bounded child/loop/WAIT/RESUME | T03 |
| `FR08` | S | L | SEMANTIC+TOOL_READ | **P+N ABSENT** (legacy-only); no selected v9 Rule/cache/promoted procedure/model four-source resolver P+N | T02 |
| `FR09` | S | L | SEMANTIC | **P+N ABSENT** (legacy-only); no selected v9 governed child procedure selection P+N | T02,T08 |
| `FR10` | U | S | SPLIT: UX+K | **full P+N ABSENT** (selected subset); E1 P1/N3 scoped business intent only; DAC role-safe UX bridge absent | T05 |
| `FR11` | BUILD | O | BUILD_OR_LIFECYCLE | **P+N ABSENT** (BUILD/target scope); E4 K/S/C ABI source exists, not typed compiled Domain Data selected P+N | T00 |
| `FR12` | S | S | SEMANTIC | **full P+N ABSENT** (selected subset); E4 pure deterministic Router; evidence-gated no-fresh-model semantic check absent | T02,T06 |
| `FR13` | BUILD | S | BUILD_OR_LIFECYCLE | **full P+N ABSENT** (selected subset); E4 P1/N4 BUILD K/S binding partial; complete Component/Kind metadata P+N not mapped | T00 |
| `FR14` | K | R | KERNEL_PROTOCOL | **selected-v9 P+N test SOURCE mapped**; P E1 P1/U1 + E5 PERMIT01; N E1 R1 and E5 PERMIT02 deny before Effect. v0.10 K01 real race still NOT_RUN | K01,C01 |
| `FR15` | U | S | TOOL_READ/TOOL_EFFECT | **full P+N ABSENT** (selected subset); E1 selected intent/C + denial, but UX/Agent Tool/resource type bridge absent | T05,C01 |
| `HF16` | K | S | KERNEL_PROTOCOL | **full P+N ABSENT** (selected subset); E1 U1 UNKNOWN selected path, poison-message recovery/queue drain P+N absent | K02 |
| `HF17` | S | S | SEMANTIC+K | **full P+N ABSENT** (selected subset); E6 LIFEI01/LIFEI03 selected subscription P+N, reconnect/coalescing rule absent | T03 |
| `HF18` | K | L | SPLIT: K+S | **P+N ABSENT** (legacy-only); durable deadline/callback recovery from external control turn not reached via v9 selected API | K02,T03 |
| `HF19` | K | S | KERNEL_PROTOCOL | **full P+N ABSENT** (selected subset); E7 SQLite CAS P+N and E1 message send, not ProcessCommand atomic terminal outcome | K01,K02 |
| `HF20` | K | S | KERNEL_PROTOCOL+TOOL_READ | **full P+N ABSENT** (selected subset); E6 LIFEI02/LIFEI03 observer behavior, ordered durable observation cursor/restart absent | T06 |
| `HF21` | K | S | KERNEL_PROTOCOL | **full P+N ABSENT** (selected subset); E1 scope-revocation + E5 effect permit P+N, but SIM/PROD distinct authority class matrix absent | K01 |
| `HF22` | BUILD | S | BUILD_OR_LIFECYCLE | **full P+N ABSENT** (selected subset); E8 selected v9 BUILD import graph and E4 ABI refusal; full transitive provider closure P+N unmapped, A01 BUILD only | T00 |
| `HF23` | S | L | SEMANTIC+TOOL_READ | **P+N ABSENT** (legacy-only); no selected v9 Agent-safe Tool projection P+N | T02,T05 |
| `HF24` | BUILD | O | BUILD_OR_LIFECYCLE | **P+N ABSENT** (BUILD/target scope); legacy compiled business source projection is producer/BUILD-only; no selected public v9 P+N | T00 |
| `HF25` | BUILD | O | BUILD_OR_LIFECYCLE | **P+N ABSENT** (BUILD/target scope); typed App contract generation upstream; no selected public v9 P+N | T00 |
| `HF26` | K | S | SEMANTIC+KERNEL_PROTOCOL | **full P+N ABSENT** (selected subset); E1 denied/receipt/diagnostic path, not truthful Rule/Model-source evidence P+N | T06 |
| `HF27` | K | S | KERNEL_PROTOCOL | **full P+N ABSENT** (selected subset); E7 cross-process CAS P+N, not per-instance serialized concurrent execution-lane semantics | K01,K02 |
| `HF28` | H | O | BUILD_OR_LIFECYCLE | **P+N ABSENT** (BUILD/target scope); E3/E9 Node24 clean consumer P+N; historical Expo target excluded from v0.10 Node24 profile | T00,T11 |
| `HF29` | H | L | TOOL_EFFECT | **P+N ABSENT** (legacy-only); E1/E5 K-permitted effect primitive exists; generic local/HTTP adapter Operation P+N absent | C01 |
| `HF30` | BUILD | O | BUILD_OR_LIFECYCLE | **P+N ABSENT** (BUILD/target scope); historic DAC designation/SoD verifier not published selected v9 API; A01 static trust upstream | T00 |
| `HF31` | BUILD | R | BUILD_OR_LIFECYCLE | **selected-v9 P+N test SOURCE mapped**; P E2 canonical byte-vector V1/V2; N E2 unsafe record refusal / E4 malformed binding. Historic v9 BUILD source only, no v0.10 SDK runtime scanner | T00 |
| `HF32` | K | L | SPLIT: K+S | **P+N ABSENT** (legacy-only); no selected v9 child-send result routing P+N | T03 |
| `HF33` | H | S | SPLIT: BUILD+K | **full P+N ABSENT** (selected subset); E1 grant/revoke/inflight P+N live authority subset, static Package/resource currentness moves to BUILD under A01 | T08,K01 |
| `HF34` | BUILD | O | BUILD_OR_LIFECYCLE | **P+N ABSENT** (BUILD/target scope); E4 ABI sealed-structure refusal partial, full definition graph snapshot/digest P+N absent | T00 |
| `NEW-FUNCTION-01` | BUILD | O | BUILD_OR_LIFECYCLE | **P+N ABSENT** (BUILD/target scope); historic DAC compatibility TWO-VIEW verifier; selected v9 public P+N absent | T00 |
| `NEW-FUNCTION-02` | BUILD | O | BUILD_OR_LIFECYCLE | **P+N ABSENT** (BUILD/target scope); historic DAC ApplicationSelection intake; selected v9 public P+N absent | T00 |
| `NEW-FUNCTION-03` | BUILD | O | BUILD_OR_LIFECYCLE | **P+N ABSENT** (BUILD/target scope); historic DAC binding fact, not selected v9 public P+N; Binding ≠ Activation | T00 |
| `NEW-FUNCTION-04` | BUILD | O | BUILD_OR_LIFECYCLE | **P+N ABSENT** (BUILD/target scope); historic DAC activation/issuer-currentness; selected v9 public P+N absent; upstream BUILD/deploy under A01 | T08 |
| `FR08-P-SD1` | S | L | SEMANTIC | **P+N ABSENT** (legacy-only); SD1 advanced SemanticDecision positive: no selected v9 public P+N | T02 |
| `FR08-N-SD1` | S | L | SEMANTIC | **P+N ABSENT** (legacy-only); SD1 advanced SemanticDecision negative: no selected v9 public P+N | T02 |
| `FR08-P-SD2` | S | L | SEMANTIC | **P+N ABSENT** (legacy-only); SD2 advanced SemanticDecision positive: no selected v9 public P+N | T02 |
| `FR08-N-SD2` | S | L | SEMANTIC | **P+N ABSENT** (legacy-only); SD2 advanced SemanticDecision negative: no selected v9 public P+N | T02 |
| `NEW-FUNCTION-05` | S | S | SEMANTIC | **full P+N ABSENT** (selected subset); E4 basic Router selected P+N; typed SemanticDecision runtime binding absent | T02 |
| `NEW-FUNCTION-06` | S | L | SEMANTIC+KERNEL_PROTOCOL | **P+N ABSENT** (legacy-only); no selected v9 DecisionResolutionReceipt/ObservedDependencySet P+N | T06 |

**Source-side invariant:** 44 input rows, 44 unique IDs, 44 output rows. Classification counts **R=3 / S=19 / L=12 / O=10**; sum=44. There are **no fabricated v0.10 execution claims**. In S/L/O the *complete* selected-v9 public P+N witness is explicitly ABSENT; v08 legacy physical cases are not promoted to v9.

## 4. Authority split and route to existing tasks (no 44 extra Issues)

| Ownership family | Interpretation | Next v0.10 falsifiable owner |
|---|---|---|
| **KERNEL_PROTOCOL** | Exactly one K Primary owns Admission, State, immutable receipt, CAS, live grant/revocation/fence, Journal, Effect and UNKNOWN; cannot be delegated to optional S/C/Business plugins | K01 #1167 real concurrent two-Host SQLite CAS/fence and non-idempotent Effect; K02 #1168 original receipt/canonical input conflict/17+ derived disposition loss |
| **SEMANTIC** | S/Business owns Rule→reuse→procedure→bounded Model resolution, Workflow child/WAIT/RESUME, Context, DecisionTrace/Shadow. Callable JS helper ≠ privileged Tool | T02 #1169, T03 #1170, T05 #1172, T06 #1173, T07 #1174 |
| **TOOL_READ / TOOL_EFFECT** | Independently scoped Model/Search or Memory read is capability IO, not itself Kernel business Journal; selected externally meaningful effects require K live permit/correlation/fence/UNKNOWN. Memory write obeys its own scoped C authority and cannot bypass K-owned business Effect policy | T04 #1171 Memory, C01 #1177 **two unrelated external effects adapters sharing one K→C contract** and lost response/callback/missing disposition |
| **BUILD_OR_LIFECYCLE** | Closed-world Node24 SDK+Package graph, ordinary npm/native deps chosen once upstream, approved version activation, immutable in-flight pin; accepted A01 disallows SDK repeated Package AST/hash/provenance/currentness checks | T00 #1166 and T08 #1175. Historic v9 Host verification test source is not v0.10 runtime certification |
| **B query / consumer** | Explicit scoped B selection, authorize before lookup, typed ambiguity without leaking hidden B; Tiny/Rich clean consumer and governed effect-denial negatives | T10 #1176, T11 #1180 |
| **Optional P1** | Meta feedback and queryMany are optional and do not block v0.10 P0 R01 | T09 #1178 and T10B #1179 |
| **Version closure** | Single immutable v0.10 integrated candidate / real Node24+SQLite full/hidden/CJ/packing/security | R01 #1181; no per-task full regression |

## 5. Tests → Contract → Implementation → Failure Handling → Reference

- **Tests:** Source structural count / uniqueness and test path source inspection only. No `npm test`, real Host E3, Full/Hidden/pack or fresh Model-call proof was run in T01. A test *definition* cannot be asserted as a newly passing execution.
- **Contract:** All 44 historic IDs preserved exactly. Each full selected-v9 P+N pair either mapped with a source path or explicitly ABSENT. Semantic vs Tool READ/Effect vs K vs BUILD is not collapsed.
- **Implementation:** This **single** audit file; only issue #1165 bounded write set. Existing L1 crosswalk remains frozen exact blob.
- **Failure handling:** Any unsupported selected-v9 full-row claim is conservatively S/L/O with full P+N ABSENT and mapped to its actual owning v0.10 Task, not used to force 44 new Tasks, invent a compatibility bridge or declare release PASS.
- **Reference:** v08 immutable manifest+non-normative source map, current selected v9 published ABI/bridge/Builder/Host test sources, frozen v0.10 Product A01/L2/DAG.

**Status: candidate source-only audit complete; requires exact-head PR/CI/review-policy decision and merge into `v0.10` before T01 Issue completion.** Runtime implementation and all real product/Release gates remain NOT_RUN.
