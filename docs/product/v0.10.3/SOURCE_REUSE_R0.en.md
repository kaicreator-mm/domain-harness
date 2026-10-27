# v0.10.3 — Historical capability / selected-source reuse R0

[中文](SOURCE_REUSE_R0.zh-CN.md) · [Product/L1 R0](PRODUCT_L1_R0.en.md)

> Assess **actual v0.10.2 selected/public ABI**. Visible source or an old v0.3 test is not by itself a new exported SDK API or current Node24 clean-consumer proof.

| Concern | Grounded source / evidence | Initial disposition | Honest current boundary |
| --- | --- | --- | --- |
| Four-source precedence | [v0.3 frozen Product §8](../DomainHarness_v0.3_PRD_FROZEN.md); [selected S semantic-decision](../../../domain-packages/standard/features/semantic-decision/modules/sfeature-semantic-decision-v1.mjs) | **REUSE+MAP** | Current Feature does Rule → exact reuse → Procedure → model/tool; Procedure cannot be assumed identical to historically governed “promoted subworkflow” absent review |
| Bounded Context | [S context assembly](../../../domain-packages/standard/features/context-assembly/modules/sfeature-context-assembly-v1.mjs), [selected test](../../../tests/assembly/v010-t05-context-feature.test.ts) | **REUSE** | Actual selected Rich App fixture; character/count bounds, NOT model token-window summarization |
| Scoped Memory | [Node Host](../../../packages/host-node/src/scoped-memory.ts), [T04 integration](../../../tests/assembly/v010-t04-selected-memory.test.ts) | **REUSE** | Scoped TTL/CAS/CRUD; not full original exact semantic cache with observed dependency invalidation |
| Agent workflow | [T05 integration](../../../tests/assembly/v010-t05-agent-workflow.test.ts) | **REUSE** | Real selected multi-turn Rule/Model spy/Tool/SQLite/Journal; NOT public third-party paid LLM provider API |
| ModelPort precedent | [Standard SDK](../../../domain-packages/standard/basic/standard-sdk-v1.mjs), [legacy internal Host model port](../../../packages/domain-harness/src/public-v8/model-port.ts) | **REFERENCE_ONLY** | Prior evidence/proposal seam does not mean two public optional protocol C modules already ship |
| Exact cache | [frozen v0.3 PRD](../DomainHarness_v0.3_PRD_FROZEN.md), [T013 historic](../../implementation/v0.3/task-packs/T013_exact_semantic_cache.md) | **REACHABILITY_AUDIT** | Old source/receipts do not prove currently selected exact cache, never substitute Journal replay |
| Promotion/Registry/Shadow | [v0.3 frozen L2](../../architecture/DomainHarness_v0.3_L2_ARCHITECTURE_EVIDENCE_FROZEN.md), [T015 historic](../../implementation/v0.3/task-packs/T015_promotion_activation_authority.md) | **REACHABILITY_AUDIT** | Proposal/validation/operator promotion/activation are distinct; no claim v0.10.2 automates full Meta producer |
| Guided Journey | [#1395](https://github.com/kaicreator-mm/domain-harness/issues/1395), [DTO draft PR #1397](https://github.com/kaicreator-mm/domain-harness/pull/1397) | **REUSE_FIRST** | Existing S/B first; two real consumers before a generic S Package; DTO draft not frozen |
| OpenAI/Anthropic wire adapters | [two-protocol preview PR #1400](https://github.com/kaicreator-mm/domain-harness/pull/1400) | **NEW_OPTIONAL_C** | No two published C packages, no live credentials tested; selectable 0/1/2 |
| External npm executable integrity | [reproduced P1 #1393](https://github.com/kaicreator-mm/domain-harness/issues/1393) | **SHARED_BUILD/HOST_FIX** | `externalImports.npm` allowlist is not verification of installed executable bytes |
| Host CAS↔K DocStore DX | [P2 #1394](https://github.com/kaicreator-mm/domain-harness/issues/1394) | **DOCS_FIRST** | Public K `kind:create/cas` differs from Host CAS `mustBeAbsent/mustMatchRevision` |

## Evidence and reuse rules

- `REACHED` = exact target-version selected public producer→packed/install→runtime positive/negative proof; `SOURCE_ONLY` = source but no such physical witness; `LEGACY_ONLY` = historical ABI alone; `OUT` = superseded/excluded. The REUSE/REFERENCE annotations in the table are **provisional product choices**, not substitutes for reachability classes.
- Reuse ordinary selected S helpers, Host Memory and mature provider libraries. No auto private-helper-as-Tool, new Kernel, duplicated Meta store or arbitrary generic Provider gateway.
- New optional S Package requires at least two concrete downstream shared-need journeys; app-owned thin adapters are allowed immediately, under released v0.10.2 contract.
- Repository effective ADS Pin still 4.13.1; target v4.18 needs a separately reviewed scoped adoption before it can be called effective.

`PRODUCT_FREEZE=NO; SOURCE_PROOF=PARTIAL; DOWNSTREAM_ALIGN=NOT_RUN; NEW_API_IMPLEMENTED=NO`.
