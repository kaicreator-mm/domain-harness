# Domain Intelligence Standard (DIS) v0.2.0 — Element-first R1 + Evolution R2 + full-scope adversarial R3

> **STATUS: NEW PRODUCT/L1 CANDIDATE; NOT FROZEN.**
>
> Owner decision 2026-11-08: the old Data/Processing/Composite Intelligence Unit draft (#1494 / draft PR #1493) is **SUPERSEDED, NOT MERGED**. This new candidate is independently based on frozen DIS 0.1.0 at `9504c78f4651f6c1ebc48c7858fca2d8b061544b`. The old files and discussion are retained in GitHub history, not silently rewritten.
>
> Product/L1 successor authority: [#1496](https://github.com/kaicreator-mm/domain-harness/issues/1496). Boot/KDP: #1484; Package boundaries: #1480; Harness gap: #1478; original task/meta evolution: #1398; Runtime consumption proof: #1486.

## New R1 model

- Domain = **Element dependency DAG**. DAG edges are static dependencies, NOT runtime control/dataflow. No mandatory Element type.
- Element = cohesive domain/service micro-library with natural-language Description, 0..N public Functions, per-function implementations, typed dependencies and optional self-owned state/knowledge consumption. All SDK, Business, State, CLI/API/interaction service Elements follow the **same** core contract.
- Function = semantically described, callable public contract. Multiple Functions may bind distinct Query/Rule/Code/Workflow/LLM/Harness implementations. AOT locks exact target/provenance/version.
- Boot -> KDP Primary -> SDK (SDP) + Business Package technical initialization -> exactly one **App Init Element.init(context)** for every runnable Domain App -> published ingress bindings. No mandatory Main Workflow or generic physical Host abstraction.
- Runtime consumes selected Domain Intelligence. Knowledge-graph creation and asset management belong to Forge. Domain-specific state belongs to the Domain; optional SDK SQLite/JSON/etc. provide business-neutral functions.
- Harness/LLM and Meta evolution are **optional profiles** with standardized evidence and boundaries, not mandatory engines or an automatically self-modifying runtime.

## R2 convergence / self-adversarial review

**Authoritative current evolution design:** [Unified LLM/Harness/Evolution R2](LLM_HARNESS_EVOLUTION_R2.zh-CN.md). It supersedes R1 advice on Experience, Function synthesis, local qualification, Evolution Slot, cache/evidence and two-layer evolution; R1 remains historical. [Self-adversarial findings](ADVERSARIAL_REVIEW_R2.zh-CN.md) and [negative/positive conformance cases](EVOLUTION_CONFORMANCE_R2.zh-CN.md) are design documents; this is NOT an independent review or executable certification. App may create locally scoped qualified **interpreted rule data** only if the AOT-selected SDK can safely support schema/interpreter/budget/atomic task pin/rollback; otherwise produce candidates and shadow only. Every Experience must have trusted verification; cache hits cannot manufacture independent samples.

## Latest R3 authority / complete product review

The earlier R1 statement “Domain = Element dependency DAG” is superseded: the Domain also contains semantic relationships, constraints and collaboration semantics; only the static dependency subgraph is a DAG. The R3 repair addendum is authoritative for design conflicts, including Target-specific native Effect admission, complete AOT content closure, App Init failure, model/Provider pins, domain State and Knowledge.

- [Full-scope adversarial review R3](FULL_SCOPE_ADVERSARIAL_REVIEW_R3.zh-CN.md) — 24 grouped issues P0=6/P1=14/P2=4; overlaps earlier R2 findings.
- [Full-scope design repairs R3](FULL_SCOPE_REPAIRS_R3.zh-CN.md) — Product/L1 restrictive clarification.
- [Two-Domain self-demo and repair log R3](FULL_SCOPE_DEMO_SELF_VALIDATION_R3.zh-CN.md) — 74 Node cases (27 POS/47 NEG), including one invocation of the 25-case evolution fixture; no independent or production CI claims.
- Complete modular demo available as a conversation artifact, SHA256 ZIP `d8e5740d478cbd38fae7b6d928d70d9ec2452668d4c0e81715bb2be1cd078c71` (not GitHub CI artifact).

## Candidate documents

1. [Chinese complete standard](DIS-0.2.0.zh-CN.md)
2. [English architecture parity candidate](DIS-0.2.0.en.md)
3. [Element / Function Contract R1](ELEMENT_FUNCTION_CONTRACT_R1.zh-CN.md)
4. [App Init Contract R1](APP_INIT_CONTRACT_R1.zh-CN.md)
5. [LLM / Harness / Two-Layer Evolution R1 — historical predecessor](LLM_HARNESS_EVOLUTION_R1.zh-CN.md)
6. [Unified LLM × Harness × Function Evolution R2 — current design advice](LLM_HARNESS_EVOLUTION_R2.zh-CN.md)
7. [Adversarial self-review R2](ADVERSARIAL_REVIEW_R2.zh-CN.md)
8. [Conformance cases R2](EVOLUTION_CONFORMANCE_R2.zh-CN.md)
9. [Migration and supersession ledger](MIGRATION_LEDGER_R1.zh-CN.md)
10. [Five-consumer conformance scenarios](CONSUMER_SCENARIOS_R1.zh-CN.md)

R2 product-level self-review recorded 3 P0, 7 P1, 2 P2 design risks; the R2 constraints are **DESIGN_MITIGATION_DOCUMENTED**, not closed by test. The old frozen DIS 0.1.0 has not changed. All examples and schema expressions are **illustrative, not validated machine-readable schemas**. English parity for focused R1 documents, executable JSON/YAML schemas, demos, independent review and CI are future acceptance work, not claimed completed here.

## Gates

PRODUCT_L1=REVIEW_PENDING; L2=NOT_FROZEN; MACHINE_SCHEMA=NOT_DONE; CONSUMER_DEMO=NOT_RUN; CONFORMANCE=NOT_RUN; RUNTIME_ADOPTION=NOT_PROVEN; SDK_ABI_CHANGE=NOT_AUTHORIZED; MERGE=NO; RELEASE=NO.

## Design closure and self-verification (R2)

- [R2 adversarial design repair rules](EVOLUTION_DESIGN_REPAIRS_R2.zh-CN.md): all 12 risks have concrete design rejection rules. Design-mitigated does **not** mean production-verified.
- [R2 reproducible reference demo](../../../../examples/dis-v020-evolution-demo/README.md) (repo-root path; see the PR file list): Mock LLM + fixture oracle + bounded interpreted rule slot; real SDK/LLM integration not implied.

## R3.1 — actual KDP/SDK seam + Woodpecker demo

- [Real selected-K/Host Effect seam source mapping and limits](REAL_KDP_SDK_SEAM_R3.zh-CN.md).
- [Reproducible real-code import and physical temporary-file gate tests](../../../../examples/dis-v020-sdk-integration/README.md) (11 Node tests; **not executed with a full repository checkout** yet).
- `.woodpecker/dis-v020-integration.yaml` invokes the existing **real selected-K C01 assembly suite** in addition to the new seam demo, with **no exact Node major check inside this new workflow**. Original v0.10 release CI restrictions remain separate.
- Real existing gate source blob `4e76f700769eb24ff15cbcb0dfd0e6f696fe3ad2` executed in isolated V8: **8/8 source-level assertion PASS**. This is *not* full KDP/SDK/OS sandbox conformance and not a Woodpecker PASS receipt.

## R4 — Real BUILD/SDK Element–Function + Business App Init bridge

See [R4 bridge semantics and revised sealed-code trust scope](REAL_AOT_APP_INIT_BRIDGE_R4.zh-CN.md). [Demo source and tests](../../../../examples/dis-v020-real-aot-bridge/) consume real v0.10 BUILD+Microkernel. The prior strict OS native confinement test is archived as optional research and no longer blocks DIS CI under the product's self-built trusted closure model.

## R6 — Real physical KDP Journal and two Business Domain consumer

[R6 cross-process SQLite / orders + inventory consumer evidence](PHYSICAL_TWO_DOMAIN_R6.zh-CN.md) describes actual selected two Business Package compilation, guarded Function dispatch, file-backed WAL/CAS KDP Journal, two-process original receipt replay and negative AOT-restore vectors. The full real demo is under [examples/dis-v020-real-aot-bridge/](../../../../examples/dis-v020-real-aot-bridge/); evidence requires a matching Woodpecker exact-SHA PASS.
