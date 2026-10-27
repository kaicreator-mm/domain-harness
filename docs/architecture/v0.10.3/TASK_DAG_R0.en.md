# v0.10.3 — ADS v4.18 Parallel Task DAG R0 (CANDIDATE, NOT ADMITTED)

[中文](TASK_DAG_R0.zh-CN.md) · [L2 Freeze](L2_FREEZE.en.md) · [DAG Issue #1411](https://github.com/kaicreator-mm/domain-harness/issues/1411)

**Source of truth:** version/v0.10.3 **after** reviewed L2 #1407 and exact [L2 Freeze](L2_FREEZE.en.md). Proposed source tasks: **8**, prerequisite edges **9**, topo layers **4**, independent initial frontier **4**, no cycle. This document is a **planning and verification manifest**, not yet native GitHub dependency/Claim authority.

## 1. Node and file ownership

| Lane | GitHub Issue | Exclusive work set; exception requires owning-source handoff | Readiness |
|---|---|---|---|
| A neutral Contracts | [#1412](https://github.com/kaicreator-mm/domain-harness/issues/1412) | NEW `packages/contracts/src/llm-generate-v1*.ts`, own `tests/contracts/v0103-llm-generate*.ts`; **no contracts/index.ts** | independent root |
| I verified Provider P1 | [#1413](https://github.com/kaicreator-mm/domain-harness/issues/1413) | `packages/host-node/src/deployment.ts`, NEW private `verified-provider-bundle.ts`, own `tests/hosts/node/v0103-verified-provider-bundle*`; **no host/index.ts** | independent root |
| J offline Guided Journey | [#1414](https://github.com/kaicreator-mm/domain-harness/issues/1414) | NEW `examples/v0103-guided-journey/**`, own offline assembly tests; frozen Schema READ-ONLY | independent root |
| M reuse-first Meta | [#1415](https://github.com/kaicreator-mm/domain-harness/issues/1415) | NEW `examples/v0103-meta-reuse/**`, own Host test; public existing Meta exports READ-ONLY | independent root |
| B OpenAI Chat Completions | [#1416](https://github.com/kaicreator-mm/domain-harness/issues/1416) | NEW `domain-packages/capabilities/llm-openai-compatible/**`, `packages/host-node/src/llm/providers/openai/**`, own tests | needs A |
| C Anthropic Messages | [#1417](https://github.com/kaicreator-mm/domain-harness/issues/1417) | NEW `domain-packages/capabilities/llm-anthropic-messages/**`, `packages/host-node/src/llm/providers/anthropic/**`, own tests | needs A, **not B** |
| R single-root integration | [#1418](https://github.com/kaicreator-mm/domain-harness/issues/1418) | Sole writer shared `packages/contracts/src/index.ts`, `packages/host-node/src/index.ts`, package/build manifests and **integration** tests/docs | needs A, I, J, M, B, C |
| Q independent RQ | [#1419](https://github.com/kaicreator-mm/domain-harness/issues/1419) | NEW `docs/release/v0.10.3/**`, review-only version evidence; no implementation source changes | needs R |

## 2. Actual required native issue dependencies

GitHub semantics: **Issue in left column is BLOCKED BY Issue in right column**, not the reverse. The REST API requires POST `/repos/kaicreator-mm/domain-harness/issues/{blockedNumber}/dependencies/blocked_by` body `{"issue_id": <numeric database id of prerequisite issue>}` (not a GitHub Issue number). Read with GET same URL. All nine native edges must be applied and read back exactly; currently **0/9** until real mutation.

| Blocked | Native prerequisite |
|---|---|
| #1416 B OpenAI | #1412 A neutral DTO |
| #1417 C Anthropic | #1412 A neutral DTO |
| #1418 R integration | #1412 A neutral DTO |
| #1418 R integration | #1413 I trust |
| #1418 R integration | #1414 J offline journey |
| #1418 R integration | #1415 M meta proof |
| #1418 R integration | #1416 B OpenAI |
| #1418 R integration | #1417 C Anthropic |
| #1419 Q RQ | #1418 R integration |

**Correct 4 topological layers:** `[A,I,J,M] → [B,C] → [R] → [Q]`. This is **not** an order to serialize the independent root tasks. R never admits source while any prerequisite remains genuinely incomplete; native graphs must be cyclic-free and match this manifest. S pure helpers are scoped within actual needs, **not** a speculative independent package; D #1394 CAS is DONE; G ADS v4.18 is DONE and neither creates a Task.

## 3. Evidence and authority

- Native issue IDs and proposed written paths are specified on each Issue; each Task remains `CLAIM=NOT_ISSUED` until native relation readback and independent DAG review. Native dependencies take precedence over links/Markdown. Issue number != database issue_id.
- At task admission, real Task Branch/Claim must be bound to fresh version SHA and reviewed owner. New work must not silently shift accepted L2 ABI. A's minimal Contracts source is independently accepted before B/C implementation; B/C may execute **simultaneously** using disjoint provider directories.
- Inversion/check: I security owns Host deployment seam, B/C only their own provider client subdirectories, R alone shared Host and Contracts export root, no overlapping concurrent writers. CAS docs already on version, no new Store.
- Real Node24 fake-endpoint Provider consumers and tamper cases, Journal sanitization, true K externalEffect/UNKNOWN, ai-rexform and Tally integration are **NOT_RUN** at DAG planning. Reviewed doc CI is not runtime evidence.
- A separate adversarial DAG audit should output P0/P1/P2 and `DAG_ADMITTED=YES|NO` **only after exact native GET evidence**. The present connector can read native relationships, but cannot POST native relationship mutation; a short authenticated local GitHub CLI action is needed, not an invented completed mutation.

```ini
VERSION=v0.10.3
PRODUCT_L1_FREEZE=YES
CONTRACT_DATA_FREEZE=YES
L2_FREEZE=YES
TASKS_CREATED=8
TASK_EDGE_SPEC=9
NATIVE_EDGES_ACTUALLY_CREATED=0
DAG_REVIEW=NOT_RUN
TASK_DAG_ADMITTED=NO
SOURCE_IMPLEMENTATION_CLAIMS=NO
```
