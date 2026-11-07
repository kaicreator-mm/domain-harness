# Domain Intelligence Standard (DIS) v0.2.0 — Element-first R1 + Unified Evolution R2

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
