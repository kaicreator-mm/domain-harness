# DomainHarness v0.11.2 · R25 正式 Product/L1 范围基线（L2 入场合同）

```ini
OUTPUT_LABEL=DH_V0112_R25_R24_ACCEPTED_PRODUCT_L1_SCOPE_FREEZE
REPO=kaicreator-mm/domain-harness
MASTER_ISSUE=#1563
VERSION_ISSUE=#1612
PRODUCT_PR=#1702
R22_DESIGN_REVIEW_HEAD=dd3634ac9c6aa7539aebaded3d448d52a99f6a7f
R22_VERDICT=ACCEPT_SCOPED_DESIGN_ONLY_P0_0_P1_0_P2_0
R24_SCOPE_REVIEW_HEAD=97e47b70afc48423b66e4d11f60507acbbcea0ef
R24_VERDICT=ACCEPT_SCOPED_SCOPE_AND_VERSION_ONLY_P0_0_P1_0_P2_0
OWNER_DIRECTION=PRIOR_SCOPE_CHOICES_PLUS_2026_11_24_CONTINUE
PRODUCT_L1=FROZEN_SCOPE
L2=ADMITTED_DESIGN_ONLY
SOURCE_IMPLEMENTATION=ON_HOLD_UNTIL_L2_ACCEPTED
CI=NOT_RUN_DOC_ONLY
MERGE_RELEASE=NOT_CLAIMED
```

## 0. 冻结依据与唯一事实源

R20 `REWORK` 的 3 项 P1 与 2 项 P2 在 [R21 唯一完整合同](./DomainHarness_v0.11.2_R21_CONSOLIDATED_PRODUCT_L1_AFTER_R20_REWORK.md) 修复，并由 R22 在 `dd3634ac9...` 上限定独立复审 `ACCEPT_SCOPED_DESIGN_ONLY`，剩余 P0/P1/P2=0。用户先前明确选择“Knowledge（Data/Function）+ Workflow（Recognition/Handling）两层”、Data Knowledge 生成期硬编码不可变、Function 原生实现/内部状态自行维护、Tool 分系统预授权和用户确认，并持续要求将真实 Authorized Action 整体吸收；当前对 R24 审核完成后的“继续推进”承接已讨论的 R23 推荐能力/版本方向。本记录将这组选择明确作为 Product/L1 scope freeze，而**不是**声称过去 Reviewer 曾签署本次新提交的 exact SHA。

R24 [正式审查](https://github.com/kaicreator-mm/domain-harness/pull/1702#pullrequestreview-6030863242) 在 `97e47b70...` 上接受 R23 的三文档范围草案为 `ACCEPT_SCOPED_SCOPE_AND_VERSION_ONLY`，P0/P1/P2=0；审核原文明确不包括 SDK 实施、CI、L2 或正式合并。**本文件与随后的版本 Issue/Roadmap 只将已审推荐范围定为准入条件，不增添新的未审技术方案。**

唯一 L1 必须同时读取：
1. **本文件**：范围/版本归属、正式选择与门禁；
2. [R21 统一 Product/L1 正文](./DomainHarness_v0.11.2_R21_CONSOLIDATED_PRODUCT_L1_AFTER_R20_REWORK.md)：领域抽象、执行不变量与 DI-L1-01–12；
3. [R23 范围选择与依赖映射](./DomainHarness_v0.11.2_R23_SCOPE_SELECTION_AND_VERSION_CONSOLIDATION.md)：已选能力的可观察最低行为。

R8–R19 均为历史推导、被代替的设计或限定参考，不能与上述唯一 L1 并列当作当前强制接口；未来变更需要新的 Issue 记录和 Exact-SHA 增量审核。

## 1. 正式确定的范围

| 条目 | 产品范围裁决 | 最低执行与测试合同 |
|---|---|---|
| **Data Knowledge** | **IN v0.11.2** | 生成期编译为 TS 不可变对象，不需要运行期 Knowledge Store/Operation Registry；嵌套数据/外露引用不能修改已生成规则。知识修订生成新 Business Package 版本 |
| **Function Knowledge** | **IN** | 原生 TS Function/Element 方法直接读取 Data Knowledge；内聚状态由业务 Function/Element 拥有，真实跨进程权威状态归实际 DB/Host；不强制 stateful/external 类型矩阵 |
| **Intent Recognition / Handling** | **IN** | 两个业务 Workflow 角色使用已存在的 StandardWorkflowSession/XState，不引入额外执行 Runtime；生成期按业务自定义 I/O，连续逻辑根共享预算，业务 UNKNOWN/REJECT/ASK/WAIT/FAILED 不得吞并为 COMPLETE |
| **通用有界 Query** | **IN · 必选新增 SDK 能力** | 同一普通 Standard Function/Element 在两个不相干领域的直接调用和 Workflow 中复用；明确定义输入范围/适用性/来源/时点、上限、冲突/缺失判定与真实正反例，不硬编码具体领域 |
| **SQLite Database Element** | **IN · 必选** | 动态真实数据、业务状态/版本/索引及实际 Attempt Journal；初始化与真实资源生命周期、事务回滚、关闭重开、并发版本冲突；不得热写已生成静态知识 |
| **SQL 查询能力** | **IN · 必选** | 参数化、受控、有界的查询，显式可信资源范围；写事务只走专门的 DB/Business Function，不接受不可信任意 SQL 输入 |
| **Vector 查询能力** | **IN · 必选最小子集** | 真正限定 Domain/Scope/Version 后 Top-K、向量维度/距离/输入限制与负例；不强制内置 Embedding/LLM 或独立向量 DB |
| **Graph 查询能力** | **IN · 必选最小子集** | 有方向/关系类型的有界邻居、多跳/路径查询；环、超深度和结果数量拒绝/安全终止，不强制 RDF/Cypher/独立图 DB |
| **Expression 能力** | **IN · 必选最小子集** | 有界表达式运行、明确业务输入/类型/副作用边界、非法输入/资源限制与非成功；原生 TS 规则函数仍是一等公民，不建第二 Rule Runtime；JSONata 等具体库由 L2 评估 |
| **JSON/YAML Reader** | **REUSE v0.11.1** | 不在 0.11.2 重复实现现有基础 Parser/Reader；可服务于生成期材料及已选输入 |
| **JSON-LD / FTS / 全量 RDF/RAG/知识图谱平台** | **OUT of mandatory 0.11.2** | 不是本版必选实施或验收门；Domain App 可通过自己显式依赖实现，需要纳入 SDK 时另行立项审查 |
| **Authorized Action（原 0.11.4 #1614 全部）** | **IN v0.11.2 · 完整吸收** | Business State/Guard/CAS、真实 Tool/Host/Effect、PREAUTHORIZED/USER_APPROVAL、PER_CALL/SESSION、权威提交前并发排他、持久 attempt/journal/receipt/readback、lost ACK/UNKNOWN、最小幂等与真实 Host E2E；不得只搬数据类型或用 Mock 代替真实效果 |
| **LLM、自然语言多轮 UI、跨进程 TaskRun 恢复、学习进化** | **OUT（下游阶段）** | .3 多轮 Intent/UI；.5 Bounded LLM；.6 checkpoint/resume/cancel；.7–.9 证据/经验进化。0.11.2 只提供无 UI 的最小可信确认接口和一次性 ASK/WAIT 分类，不承诺长期等待恢复 |

**缩小执行复杂度不等于降低已选能力的最低行为标准。** 同一个内聚 SQLite provider 可支撑多个可组合 Query Functions/Elements；不要求每个查询维度都是独立 npm 包/单独数据库。Element=TS Class、Function=普通 TS 函数或方法，依旧保持唯一公开 SDK。

## 2. 原 0.11.4 #1614 全量迁移、消费边界及原 AC 映射

- **0.11.2 Slice A**：Knowledge/Business Element，双 Workflow、领域中立 Query、SQLite/SQL/Vector/Graph/Expression、结构化意图及确定性只读业务判断。
- **0.11.2 Slice B**：可信 Business/Host 中选定 Tool + 真实权限边界和两种用户确认策略；State/CAS、排他准入、Host Effect、持久 Attempt/Receipt、ACK/readback、UNKNOWN/最小幂等。Slice B 完成独立审核后，与 A 在一个真实外部 SDK-only Consumer 中组合验收。
- **原 AC1（真实 Host 命令+readback）** → DI-L1-08/09/10（真实授权操作、权威结果及提交事实）；**原 AC2（越权、同 ID 不同 payload、UNKNOWN）** → DI-L1-08/09/10 负例；**原 AC3（原文仅 KDP 可授权）** → 继续保留“用户/LLM/Workflow 无法凭自述获得新资源权限”，但**撤销“所有 Effect 唯有 KDP 中央授权”旧技术实现**，改由真正资源所有者/Host 实施权限。
- **PER_CALL**：批准在真实动作准入前原子绑定唯一逻辑 commandId；同参数不同新 ID 需要新批准；相同 ID 重投仅查原处置或 UNKNOWN。**SESSION**：多次命令仅可在主体/租户/资源/操作/参数和时间范围内有效。**PREAUTHORIZED**：在已配置的真实资源许可与 Business Guard 内直接执行，不强制每次 KDP/用户询问。
- **同资源同版本两个互斥命令**：在外部 Effect 之前由权威资源原子条件提交或可靠排他准入决定，Host 实际 Effect 最多一次。只靠本地锁、命令 ID 去重或 Effect 后 CAS 不合格；提交过但 ACK 不确定必须 UNKNOWN/保守原尝试读回。
- **外部读回与恢复**：不将 SQLite 与远端 Host 视为同一分布式原子事务；有界同一操作事实/回读归本版，完整跨进程 TaskRun 持久化/长时批准等待归 0.11.6。
- **禁止恢复历史系统**：KDP 最小生命周期/兜底，绝不重建 `KDP.permit` / FunctionRef→Target / 运行时 Package Scanner / Lock/Pin / 中央 Tool Router。

## 3. 原编号及下游版本归属最终选择

| 阶段 / Issue | 冻结后的职责 |
|---|---|
| **v0.11.2 #1612** | Domain Intelligence + 完整 Authorized Action（Slice A/B） |
| **v0.11.3 #1613** | Semantic Interaction：自然语言、多轮收集/澄清、UI/确认交互适配；复用 .2 Recognition/Handling/最小批准 callback；不重做 Host Effect |
| **v0.11.4 #1614** | **保留版本号与 Issue 作为历史/迁移索引，原独立 Authorized Action 工作全部转移到 #1612，不再开展独立实现**。不自动重排后续版本 |
| **v0.11.5 #1615** | Bounded Reasoning：消费 .2 的选定 Knowledge、原生 Function 与真实可信 Tool；根据业务是否需要复用 .3 UI；模型无自授权 |
| **v0.11.6 #1616** | Durable Execution：完整 TaskRun/Checkpoint/Pause/Resume/Cancel/Timeout/跨进程恢复；复用 .2 由资源/Effect provider 所拥有的 Attempt/Receipt，不把全体 Journal 归 KDP |
| **v0.11.7–.9** | Execution Evidence、Client Experience、Server Evolution 不变；将来改进知识由独立生成/审核的新 Package 交付，不能静默热改当前代码 |

历史 Roadmap/Feature Inventory / v0.10 crosswalk 中若仍出现 F14 或 FRxx 对 `#1614` 的**能力交付指派**，应以“原历史归属，现在按本节迁移至 #1612”为准，而不是在 #1614 再生成第二套实施 DAG。正式 Issues 应标明覆盖此历史指派。原 #1614 不应为了保留编号而虚造新 .4 产品。

## 4. 冻结后的可证伪验收与实施门禁

使用 R21 **DI-L1-01–12** 作为本版正式 L1 oracle（原 R8–R19 DI-AC01–60 仅为历史交叉索引），并将此前标“若选入/若 Slice B 并入”的 DI-L1-04、05、08、09、10 **正式启用**：
- DI-L1-04：SQLite+参数化 SQL 实现动态持久化、版本冲突、回滚与重开；
- DI-L1-05：Vector 限域 Top-K/维度错误、Graph 方向/环/预算、Expression 限制正反例均必测；
- DI-L1-08/09/10：两种 Tool Policy、PER_CALL/SESSION、Host 真提交并发排他、原 Attempt/Receipt/lost ACK UNKNOWN 真正交付。
- DI-L1-01/02/03/06/07/11/12：深层 Knowledge 不可变、状态隔离、双领域 Query 复用、两个 Workflow 共享根预算/六态保留、干净 Node>=22.12 ESM SDK-only Consumer、可追溯 Exact SHA。

**验收不能仅为 Mock Host、静态 TS 常量、小样例假注册表或只在单个领域内展示。** 至少两个实质不同领域、一个从陌生材料生成；必须真实使用本版公共 SDK 能力，并在权限失败/UNKNOWN/资源竞争等负例中观察真实效果。可在同一版本内多个有限 Task/PR，完整原版 .4 需求仍由 .2 最终交付。

**Stage gates：**
1. **Product/L1 scope**：本文件记录既有讨论与 R22/R24 接受方案的 Owner-directed 选择，正式冻结为 `FROZEN_SCOPE`；它没有证明任何 L2 方案/SDK 实现。
2. **L2 design**：允许从本冻结合同启动独立 TypeScript API/资源/失败边界设计；L2 经增量独立设计审核与必要修复 `ACCEPT_SCOPED` 后才授予新 SDK 源码实施资格。
3. **Implementation/QA**：静态生成 Package + clean SDK Consumer，必要真实 provider/Host，实际 typecheck/tests/Node ESM/publish packaging、当前 HEAD 及 Woodpecker 精确证据。没有新 SHA CI，不得宣称 PASS。
4. **Review/Integration**：各独立模块完成后独立审查；PR #1702 产品文档可按独立已审核范围完成受控合并，具体功能代码单独 PR；本文件不表示已合并/发布。
