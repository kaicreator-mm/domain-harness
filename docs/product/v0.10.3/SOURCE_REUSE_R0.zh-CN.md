# v0.10.3 · 现有能力复用与证据差距 R0

[English](SOURCE_REUSE_R0.en.md) · [Product/L1 R0](PRODUCT_L1_R0.zh-CN.md)

> 复用从 **v0.10.2 已选公开 ABI** 出发。下表的“源码存在”不代表任何下游已通过 npm clean install，历史 v0.3 成功也不自动成为新 API。

| 来源功能 | 已知真实证据 / 文件 | v0.10.3 初步处置 | 当前可证明边界 |
| --- | --- | --- | --- |
| 四来源决策顺序 | [v0.3 冻结 PRD §8](../DomainHarness_v0.3_PRD_FROZEN.md)；[标准 S semantic-decision](../../../domain-packages/standard/features/semantic-decision/modules/sfeature-semantic-decision-v1.mjs) | **复用+对账** | 现有 Feature 源码为 Rule→exact reuse→Procedure→model/tool；`Procedure` 不可在未审查的情况下直接等同于 v0.3 的“已晋升子流程” |
| Bounded Context | [现有 S context-assembly](../../../domain-packages/standard/features/context-assembly/modules/sfeature-context-assembly-v1.mjs)；[选择式测试](../../../tests/assembly/v010-t05-context-feature.test.ts) | **REUSE** | 已实际由所选 Rich App 选用的源码+组装测试；限制字符与条目，尚非 Token window/summary 管理 |
| Scope Memory | [Node Host scoped-memory](../../../packages/host-node/src/scoped-memory.ts)；[v0.10 T04 集成](../../../tests/assembly/v010-t04-selected-memory.test.ts) | **REUSE** | 作用域/TTL/CAS/读写搜索删除；不同于精确语义缓存及其 observed dependency 的完整 contract |
| Agent Workflow | [T05真实集成测试](../../../tests/assembly/v010-t05-agent-workflow.test.ts) | **REUSE** | Rich App 的多轮 Rule/Model spy/Tool/SQLite/Journaling 集成；**不是**真正第三方远程云端 Provider API |
| ModelPort precedent | [Standard SDK](../../../domain-packages/standard/basic/standard-sdk-v1.mjs)、[历史内部 Host ModelPort](../../../packages/domain-harness/src/public-v8/model-port.ts) | **REFERENCE_ONLY** | 曾实现调用证据和候选结果边界；未证明 v0.10.2 已发布两个可选协议 C 包 |
| Exact Semantic Cache | [v0.3 冻结 PRD](../DomainHarness_v0.3_PRD_FROZEN.md)、[T013 原始 L3](../../implementation/v0.3/task-packs/T013_exact_semantic_cache.md) | **REACHABILITY_AUDIT** | 历史独立源和证据 != 当前 v0.10.2 selected public cache；不可作为 Replay |
| Promotion / Registry / Shadow | [v0.3 冻结 L2](../../architecture/DomainHarness_v0.3_L2_ARCHITECTURE_EVIDENCE_FROZEN.md)、[T015 原始 L3](../../implementation/v0.3/task-packs/T015_promotion_activation_authority.md) | **REACHABILITY_AUDIT** | Candidate/验证/显式晋升/激活是不同权威阶段；不宣称 v0.10.2 已完成完整自治 Meta 生产流 |
| Dynamic Guided Journey | [#1395](https://github.com/kaicreator-mm/domain-harness/issues/1395)、[独立 Schema 草案 PR #1397](https://github.com/kaicreator-mm/domain-harness/pull/1397) | **REUSE_FIRST** | 先用现有 S/B，若两实际下游暴露共性缺口才抽新可选 S；该 Schema 仍是草案 |
| OpenAI / Anthropic compatibility | [独立 Provider 契约草案 PR #1400](https://github.com/kaicreator-mm/domain-harness/pull/1400) | **NEW_OPTIONAL_C** | 当前没有两个 C Provider 公开 ABI、无真实 API 授权测试；支持 0/1/2 |
| npm Provider integrity | [已复现 P1 #1393](https://github.com/kaicreator-mm/domain-harness/issues/1393) | **REPAIR_SHARED_BUILD/HOST** | 经授权的外部包规范不能等同可执行内容 digest 完整性 |
| CAS bridge DX | [P2 #1394](https://github.com/kaicreator-mm/domain-harness/issues/1394) | **DOCS_FIRST** | K `kind:create/cas` 和 Host `mustBeAbsent/mustMatchRevision` 条件形状不同 |

## 决策/证据规则

- `REACHED`：已在目标版本精确公开路径由所选 BUILD→安装→Runtime 执行，且有正反例；`SOURCE_ONLY`：源可见但没有对应物理证据；`LEGACY_ONLY`：仅历史 ABI；`OUT`：已替代/不进入新产品。上表的 REUSE/REFERENCE 等是**初步实施取舍**，并非替代这些证据分类。
- 优先复用现在工作的纯 S Feature、Memory、Agent 和已有 npm SDK。不得将纯函数自动注册 Tool，亦不得为复用而重建 Kernel/Host/新 Meta 库。
- 评价新的 SDK Feature 必须至少两个下游证明共用收益；不阻塞任一已有下游 Business 自己先实现必要功能。
- 仓库当前 ADS Pin 4.13.1，计划 v4.18 需单独核准迁移。不对历史文件追溯修改。

`PRODUCT_FREEZE=NO; SOURCE_PROOF=PARTIAL; DOWNSTREAM_ALIGN=NOT_RUN; NEW_API_IMPLEMENTED=NO`.
