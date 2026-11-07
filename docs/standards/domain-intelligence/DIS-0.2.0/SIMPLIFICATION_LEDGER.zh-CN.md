# DIS 0.2.0 概念简化与迁移台账

**状态：** 初始决策基线，待 Schema / Demo / Conformance 验证  
**Controller：** #1493  
**前序冻结版本：** DIS 0.1.0 @ `9504c78f4651f6c1ebc48c7858fca2d8b061544b`

本台账逐项记录 DIS 0.1.0 概念在 0.2.0 中的处置。KEEP 表示保留语义；MERGE 表示合并重复概念；REVISE 表示保留目标但修订契约；DEFER 表示延期到可选 Profile 或后续版本；REMOVE 表示不再作为独立规范概念。不得据此删除 0.1.0 历史文件。

| DIS 0.1.0 概念/设计 | 决策 | DIS 0.2.0 处理 | 理由 / 迁移影响 |
|---|---|---|---|
| Domain Intelligence 是产品目标 | KEEP | 作为标准中心对象 | 防止再次偏移为 Package-first |
| Domain / Knowledge / Corpus | KEEP | 明确范围、知识资产和候选材料边界 | 保留领域理解基础 |
| 七种 Intelligence Unit Role | REVISE | 保留 Role，改成角色化契约 | 不再要求每种 Role 都有相同执行字段 |
| 每个 Role 一个 Engine 的隐含实现倾向 | REMOVE | Role 是语义 Profile | 避免七套引擎和重复 Runtime |
| Unit 公共身份 | KEEP | 稳定 ID、revision、owner、scope 等 | 保证引用和可追溯性 |
| 所有 Unit 强制 Evidence / Failure 字段 | REVISE | 按 Role 和实际用途要求 | 纯 Knowledge 不应被迫伪装成可执行步骤 |
| Capability requires/provides | KEEP | 继续使用既有 Capability Contract | 不新增平行 Capability 层次 |
| Workflow Unit | KEEP | 逻辑解决能力契约 | 保留可复用的领域能力 |
| Pipeline 独立规范实体 | REMOVE | 仅作描述性术语 | 与 Workflow/Graph 重复 |
| Composition Graph | KEEP | Workflow 的结构化组合表达 | 支持确定性执行和独立验证 |
| 第二套 Node Type 分类 | REMOVE | Node 只引用 Unit；Role 决定语义 | 避免重复分类体系 |
| Decision 拥有流程跳转权 | REMOVE | Decision 产出判断，Graph 控制分支 | 权限和职责分离 |
| control / data / evidence Edge | KEEP | 保留三种互斥关系 | 分别表达执行、数据和证据 |
| 过度规定 Graph 内部验证算法 | REVISE | 标准定义不变量，Conformance 验证 | 保持跨语言实现自由 |
| ECMAScript 特定比较语义 | REVISE | 使用语言无关规范语义 | 保持跨语言一致性 |
| Recognizer Output | MERGE | 统一为 Structured Intent | 消除多套意图数据模型 |
| Dynamic Form | REVISE | 仅作为 Intent Slot 的可选交互映射 | 不创建 Form Runtime |
| Intent Slot / Structured Intent | ADD | 新增统一意图表达 | 补齐用户目标、实体、参数和缺失信息 |
| DAG_ONLY | KEEP | 保留为基础 Graph Profile | 先保证简单、确定、可验证 |
| Loop Node / Loop Engine | REMOVE | 不引入 | 避免新的执行系统 |
| Bounded Subworkflow Invocation | DEFER / OPTIONAL PROFILE | 需要 Demo 与独立 Conformance 证明后再决定 | 支持有限迭代但不削弱 DAG 基础保证 |
| 单一 Resource Closure | REVISE | Runtime / Build-Validation / Provenance 三类 | 避免测试 Fixture 污染生产 Package |
| 精确 Digest / Lock | KEEP | 保留必需资源的精确身份 | 可重现和防止资源漂移 |
| 资格、治理、选择、激活、执行混合枚举 | REVISE | 拆成五个生命周期维度 | 避免 Unit 全局状态被 Package/Runtime 事件污染 |
| EXECUTED 是 Qualification 状态 | REMOVE | 仅作为执行发生记录 | 不修改不可变 Unit |
| Structural / Behavioral / Consumer Conformance | KEEP | 保留三级验证 | 分离静态结构、行为和真实消费证明 |
| Demo PASS 等于 Runtime Adoption | REMOVE | Reference Consumer 与实际 Runtime Adoption 分离 | 避免夸大实现能力 |
| DomainForge 内部生产流程 | REMOVE | 只定义产物、身份和证据互操作边界 | 不重复造 Forge |
| Domain-Simulator 内部仿真流程 | REMOVE | 只定义验证证据和治理边界 | 不重复造 Simulator |
| 数据库/图数据库/向量数据库选型 | DEFER / OUT OF SCOPE | 由 #1476 及实现项目处理 | 标准不绑定存储技术 |
| Boot/KDP / Host / Effect 权威 | KEEP | 继承 #1484 后继 Product/L1 | 不建立第二 Runtime 或权限系统 |
| 0.1.0 文件和历史证据 | KEEP | 不修改；通过显式迁移处理 | 冻结版本可追溯 |

## 迁移规则

1. DIS 0.1.0 保持冻结；0.2.0 使用新的 Schema Profile 和版本标识。
2. 旧的 Workflow/Pipeline/Graph 表达必须显式映射到 Workflow + Composition Graph。
3. Dynamic Form 字段映射到 Intent Slot 时，必须保留来源、确认状态和不确定性。
4. 旧 Unit 中不适用的 Evidence/Failure 字段不得简单复制成 0.2.0 的强制字段。
5. Lifecycle 迁移必须区分资产资格、治理决定、Package 选择、Runtime 激活和执行事实。
6. Resource Closure 迁移必须识别哪些资源是真正的 Runtime 依赖，哪些只服务于 Build/Validation，哪些仅是 Provenance。
7. 无法无损映射的内容必须报告并等待明确决策，不得生成虚构记录。
8. 任何涉及 Product/L1、SDK ABI、KDP、Runtime 或 Host 权限的冲突必须回到对应权威处理。

## 验证问题

- 一个纯 Knowledge Unit 是否能在不伪造执行字段的情况下通过 Schema？
- 一个 Recognizer 是否能创建/更新 Structured Intent，而 Dynamic Form 只补充 Intent Slot？
- Workflow + Graph 是否能表达当前 xDownload Demo 的全部路径，而不依赖 Pipeline 独立实体？
- 三种 Edge 是否能被独立 Conformance 从真实 Trace 重建？
- Build-only Fixture 是否能脱离生产 Runtime Resource Closure？
- Lifecycle 是否能在不修改 Unit 的情况下表达 Promotion、Selection、Activation 和 Execution？
- 可选 Bounded Invocation 若纳入，是否有清晰的次数上限、退出条件、失败策略和幂等语义？

任何未通过的问题都应修订标准或明确延期，不得通过增加一个新的 Engine 来绕过。
