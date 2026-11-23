# DomainHarness 0.11.2 · R23 Product Scope Selection & Cross-Version Ownership Proposal

```ini
OUTPUT_LABEL=DH_V0112_R23_R22_ACCEPTED_SCOPE_SELECTION_VERSION_ALIGNMENT
REPO=kaicreator-mm/domain-harness
VERSION_ISSUE=#1612
PRODUCT_PR=#1702
R22_REVIEW_EXACT_HEAD=dd3634ac9c6aa7539aebaded3d448d52a99f6a7f
R22_REVIEW=ACCEPT_SCOPED_DESIGN_ONLY_P0_0_P1_0_P2_0
PURPOSE=RECORD_SCOPE_DIRECTION_BEFORE_OWNER_PRODUCT_L1_FREEZE
STATUS=OWNER_PREFERRED_DIRECTION_PROPOSED_FOR_FINAL_FREEZE_NOT_YET_FROZEN
L2=NOT_STARTED
SOURCE_CODE=NOT_STARTED
CI=NOT_RUN_DOC_ONLY
```

> R22 正式独立审核通过的是 **R21@dd3634ac9c6aa7539aebaded3d448d52a99f6a7f 的一致性/缺陷关闭**，而不是新版本交付或产品范围决定。R23 根据此前 Owner 在 0.11.2 讨论中提出的 SQLite + SQL/Vector/Graph、Expression、两种 Workflow/Knowledge、原 0.11.4 完整并入的方向形成**最小最终范围选择建议**。**不得把此建议声称为已由 Owner 正式签署冻结**；正式 Product/L1 Freeze、Roadmap 与 Issue 覆盖、L2 入场仍需另一步。R21 保持唯一正式 L1 内容候选，本文件仅承担范围选择记录。

## 1. 版本 0.11.2 的产品交付范围（建议选择）

| 范围 | 选择 | 可证伪最低交付，不额外引入第二 Runtime |
|---|---|---|
| Static Data Knowledge + Function Knowledge + Business Element | **MUST** | Data 知识生成时以不可变常量写入 TS Business Package，业务 Function/Element 方法可直接读取；函数/内聚 Element 自行维护会话/实例状态；不同领域业务 I/O 不强制统一 |
| Two Workflow Responsibilities | **MUST** | Intent Recognition 与 Intent Handling 使用同一现有 `StandardWorkflowSession`/`WorkflowElement`/XState API，共享同一业务根预算；失败、歧义、未知不得触发处理或 Effect |
| Generic Bounded Query | **MUST** | 至少一个**真新增**领域中立 Standard Query 组件，在两种领域的直接调用和 Workflow 下复用，保证有界筛选/来源/适用性/时间与错误传播；不建动态知识 Registry |
| SQLite Database Element | **MUST** | 作为通用本地存储、实际可变业务状态/索引和 Attempt Journal 的可选依赖，支持 open/close、写/读、事务回滚、持久重开、并发版本冲突，不得热修改已编译的 Data Knowledge |
| SQL Query Capability Element | **MUST** | 由已选可信 SQLite provider 实际执行参数化、有界查询，拒绝任意不可信 SQL/未选资源；CRUD/事务分别由真正 Store/业务代码负责 |
| Vector Query Capability Element | **MUST (bounded minimum)** | 对已选数据/索引执行真实维度校验、有限 Top-K、作用域优先过滤和距离比较；不强制 Embedding/LLM/全量独立向量数据库或插件化算法平台。L2 可采用 SQLite 扩展或小数据集有限算法，须有真实正反例 |
| Graph Query Capability Element | **MUST (bounded minimum)** | 对已选有向关系提供关系类型、方向、邻居/有限多跳/路径查询，环路与超限正确终止；不强制 RDF/Cypher/SPARQL/独立图数据库 |
| Expression Element | **MUST (bounded minimum)** | 用于需要声明式判断的普通 Function/Workflow，评估 JSONata 2.x 是否适合新版 Element-First TS SDK；L2 必须对比维护/资源/异步/纯度边界，**不直接移植旧 0.10 Runtime 或误称硬 Worker Kill**。具体业务 Rule 仍可为 TS 函数；不新增 Rule Engine |
| JSON/YAML Reader | **REUSE** | 复用 0.11.1 已验收公共 Reader，不在本阶段重复实现基础 Parser。业务知识源码可在生成期由这些输入形成常量 |
| JSON-LD / FTS / extensive RAG | **NOT A REQUIRED DELIVERY IN THIS STAGE** | 可选外部业务格式/索引增强；不作为静态 Knowledge 的 Runtime 前提，不要求完整 KG/RAG 平台、远程 JSON-LD Context 自动获取 |

**“MUST”描述拟由 Owner 最终确认的 Product/L1 选择，不是已完成的 SDK API 或代码。** Provider 能力可由单个实际 SQLite 实现+可组合 Query Functions/Elements 先完成；能替换底层 DB provider 的公开依赖边界在 L2 说明，**不要求 v0.11.2 把多数据库驱动全部实现完**。Standard Element 继续是普通 TS Class，Functions 仍可独立导出，避免 KDP/Runtime 中央查询引擎。

## 2. Authorized Action 全量并入 0.11.2 的候选决定

建议采用 **YES: move the entire original v0.11.4 #1614 scope into v0.11.2 #1612**；内部按两批有限交付而不是另一个正式版本：

- **Slice A — Knowledge/Recognition/Read-only**：Immutable Data Knowledge、Native Function Knowledge、Business Element、两个 Workflow 职责、静态 Intent→业务 Handler，Query/DB/Expression 通用 SDK 能力，识别、拒绝、查询与只读决策。
- **Slice B — Authorized Intent Handling**：当前权威 State/Guard/CAS、已选 Tool/Host、`PREAUTHORIZED` 与 `USER_APPROVAL`（PER_CALL/SESSION）、真实 Effect、最小持久 attempt/journal/receipt/readback、lost ACK/UNKNOWN 与同资源并发互斥提交。在真实 Host 上验收，不得以 Mock 冒充。
- 同一资源/版本的互斥不同 commandId **在 Effect 之前**需要权威原子条件提交或可信排他准入；同 ID 同摘要重试只读原 disposition，同 ID 异摘要拒绝，无法确认完成保持 UNKNOWN。
- PER_CALL **只授权一个逻辑命令**，同参数不同 ID 必须重新确认；SESSION 有明确用户、租户、资源、操作、参数范围和有效期。工具无需每次获用户批准的 PREAUTHORIZED 正常直调；资源提供者当前权限始终有效。
- 已接受的最小 KDP 仅维护生命周期/最终错误兜底；**不恢复 0.10 KDP.permit、FunctionRef/Target/Lock、Tool Router、中央 Effect 权威**。真正资源权限在选定的 DB/Host/外部服务边界执行。
- 本阶段只交付一次性同步/可返回 ASK/WAIT 的最小 User Approval 回调，不承诺 0.11.3 UI 或 0.11.6 长时恢复。

## 3. 版本归属（如果本范围获得 Owner 正式确认）

| Version/Issue | Revised target |
|---|---|
| **0.11.2 #1612** | Domain Intelligence **and Authorized Action**：Knowledge+Workflow、SQLite/SQL/Vector/Graph/Expression、实际受控 State/Tool/Effect；所有 #1614 原 AC1–AC3 以新的 DI-L1-08–10 与实际 Consumer 纳入同版 |
| **0.11.3 #1613** | 仅 Semantic Interaction：自然语言/多轮 Intent/UI/确认交互适配，消费 0.11.2 Recognition/Handling 和最小批准回调；不重复实现 Tool 权威 |
| **0.11.4 #1614** | 原 Authorized Action 任务被 #1612 吸收，**编号/Issue 保留用于历史追踪和原 AC 映射、不单独实施**；不因为空出的阶段号重排后续版本；未来如需新产品范围需单独 Owner 裁定 |
| **0.11.5 #1615** | Bounded LLM Reasoning，使用 0.11.2 已选知识/Workflow/可信 Tool、按需使用 0.11.3 UI，LLM proposal 无自授权 |
| **0.11.6 #1616** | Durable TaskRun/Checkpoint/Pause/Resume/Cancel、跨进程等待和恢复；复用 0.11.2 Effect provider 的 Attempt/Receipt，不再假设 KDP 持有唯一 Journal |
| **0.11.7–0.11.9** | 原 Execution Evidence / Client Experience / Server Meta Evolution 目标不变，禁止未审核的动态知识热替换 |

## 4. 继承 R22 ACCEPT 的 L1 验收与必要额外选项

以 [R21 唯一统一 Product/L1](./DomainHarness_v0.11.2_R21_CONSOLIDATED_PRODUCT_L1_AFTER_R20_REWORK.md) 的 **DI-L1-01–12** 为正式 L1 候选 Oracle；由于此次选择 vector/graph/expression 为 **MUST**，将其加入 **DI-L1-05** 的本版选中项：真实 SQLite/SQL 正反例、Vector Top-K/错误维度/先过滤范围、Graph 有向多跳/环路限额、Expression 受限执行/错误终止，各自原生业务消费并证明不改变编译期知识。DI-L1-08–10 同样纳入 Slice B 非条件项，直到 Owner 正式选定方案前保持待冻结标记。

**Owner 产品范围冻结时的最终检查：**
1. 该文件第 1、2 节的已选范围无相互冲突、符合 R19 静态知识原则和已接受 0.11.1 的 SDK ABI。
2. 新增选择项具有相应可反证 L1 Oracle，正例、拒绝、UNKNOWN 与真实 Provider 行为可验证，不需要将完整 L2 实现方案写入 L1。
3. 更新 Roadmap、#1563、#1612–#1616；旧版本 Issue 包含历史文字时要显式标“仅历史”，不能让旧 KDP permit/动态 knowledge CRUD 重新成为强制项。
4. 本次选项修订应先做必要的**有限新增范围独立复审**（复用 R22 已接受、不变的设计部分）后再宣布 OWNER_FROZEN。没有变更过的文档/源码不重新测试；当前没有 CI。
