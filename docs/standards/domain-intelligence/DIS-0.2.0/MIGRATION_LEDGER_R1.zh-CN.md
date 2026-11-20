# DIS 0.2.0 新候选 — 旧模型废弃与迁移台账

**Owner 决策 2026-11-08：废弃旧 DIS v0.2.0 候选架构，创建同版本号的全新 Element-first R1。** 这是**候选替换**，不是已冻结 0.1.0 的撤销，也不是 SDK v0.10.3 ABI 升级。新权威 Issue #1496；旧 Issue #1494、Draft PR #1493 保留历史供追溯。

| 旧 0.2.0 候选概念 | 新 R1 处理 | 理由 |
| --- | --- | --- |
| Intelligence Unit 唯一核心 | **REPLACE：Domain Element** | 内聚微型 Library，含多个 Function |
| Data / Processing / Composite 三 Profile | **REMOVE AS CORE TYPES** | 知识资产化归 Forge；实现方式归 Function，不强迫三类 |
| Entity/Relationship/Rule/Process 六类 Type R0 | **REMOVE MANDATE** | 关系、规则、协作同为 Element；仅可选 tags |
| Domain = Elements + parallel semantic categories | **REPLACE：Elements Dependency DAG** | DAG 仅静态依赖，不是流程 |
| Capability 与 Function 并行说明 | **MERGE PUBLIC VIEW** | 一个公开接口语义真相 |
| Main Workflow / Runtime DAG | **OPTIONAL IMPLEMENTATION** | Tally / xDownload 等业务运行模式不同 |
| 一个 Element 只有一种实现 | **REJECT** | 每个 Function 独立 Query/Rule/Code/Workflow/LLM 绑定 |
| SDK 全局业务 State | **REJECT** | Domain owns State；SDK 只提供公共 SQLite/JSON/算法 |
| Knowledge Structuring / Governance in DIS | **MOVE TO FORGE** | DIS 只标准化知识消费与可验证 Function |
| 固定 Form Engine | **GENERALIZE** | Interaction = 渐进 Intent 澄清，UI 形式可选 |
| 单层 init/Package init 替代业务 init | **REPLACE：两层 init** | KDP/SDP/Business 技术包 init → 唯一 App Init.init |
| 所有 App 请求须通过 App Main | **REMOVE** | 多个 ingress 可直指普通 Element.Function |
| Host-neutral physical interface | **OUT OF SCOPE** | 不同运行环境采用不同 Target Package |
| Harness/LLM 默认运行引擎 | **OPTIONAL PROFILES** | 非模型模式可运行，不能复制 KDP |
| Task+Meta 进化 | **KEEP AS OPTIONAL CONTRACT** | App 轻量、Server Meta/Forge 主导新版本 |
| 自动晋升与运行时自修改 | **FORBID** | Evidence→Candidate→Validation→Promotion→AOT→Activation |

## 保留

- Boot + KDP Primary 独立自举、KDP Package System 与唯一运行权威。
- SDK Domain Package / Business Domain Package / Extension/Dependency 的既有分层。
- 公开 Function/Capability 的类型化语义和 Effect 约束，精确 AOT 锁定与证据。
- DIS 0.1.0 完整冻结历史、不替代已发布 SDK。
- 历史 v0.3 的决策优先级：RULE → EXACT_REUSE → PROMOTED_SUBFLOW → BOUNDED_LLM，属于待新消费者验证的设计语义。

## 禁止误读

旧 #1493 的 Draft PR 未获 Product/L1、Schema、L2 Freeze；它的文件只代表废弃设计历史。新 #1496 文件是单独基于 0.1.0 基线创建的新候选。不得把二者拼接为“已达成一致”的当前 DIS v0.2.0。文档中的例子不是 Runtime 已存在的 ABI。

后续正式迁移必须结合外部消费者实际源代码和测试，逐一映射 Unit→Element/Function，禁止自动通过字符串替换或伪造历史资格/Promotion。
