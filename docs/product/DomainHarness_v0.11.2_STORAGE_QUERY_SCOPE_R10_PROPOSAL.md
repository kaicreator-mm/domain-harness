# DomainHarness 0.11.2 · R10 Domain Storage & Multi-Query 功能澄清候选

```ini
OUTPUT_LABEL=DH_V0112_R10_DOMAIN_PERSISTENCE_SQL_VECTOR_GRAPH_PRODUCT_CLARIFICATION
REPO=kaicreator-mm/domain-harness
VERSION_ISSUE=#1612
DRAFT_PRODUCT_PR=#1702
RELATED_FUTURE_VERSION=#1616
STATUS=PROPOSED_OWNER_L1_REVIEW_PENDING
L2=NOT_STARTED
IMPLEMENTATION=NOT_STARTED
NO_MAIN_RELEASE=TRUE
```

> **R10 是针对 R8/R9 未考虑领域持久化及多查询的功能范围补充，不是 L1 Freeze、L2 设计或已完成代码。** 本文若与 [R8/R9 L1](./DomainHarness_v0.11.2_DOMAIN_INTELLIGENCE_PRODUCT_L1_R8_CANDIDATE.md) 的“SQLite 非必需”“不要求向量和图查询”等旧假设冲突，**R10 的新增产品建议优先供 Owner 裁决**；实际获批后再统一修订主 L1 及版本规划。

## 1. 为什么要前移

0.11.2 的 Domain Semantics、Concept/Entity/Relation、Fact、Source/Provenance、Knowledge、Rule、Decision 要能**存储、更新、重新打开、查询和复现**，不能仅是一组进程内静态文件和内存对象。后续 0.11.3–0.11.9 需要消费稳定的已选知识版本。为此把 **Domain Data Persistence & Query** 放到 0.11.2；但不迁移 0.11.6 的 TaskRun/Checkpoint/暂停恢复和 Effect 幂等。

> **SDK 领域无关边界：** 这里的 Domain/Knowledge/Fact/Rule/Decision 均指跨领域通用的语义数据模型、存储及查询机制；SQLite Schema 和 SQL/属性/文本/向量/图 Query **不得硬编码任何具体行业、订单、库存或其它业务领域概念**。真实领域数据、规则函数、分类识别器和决策策略只能由外部 Business Domain Package/Domain App 定义；订单/库存仅为可替换消费者验收样例。评估标准：换掉外部 Domain Package，不修改 SDK/通用表/查询函数，仍能消费不同的领域。进一步分层见 [R11 SDK 抽象与 Element-First 澄清](./DomainHarness_v0.11.2_ELEMENT_FIRST_INTELLIGENCE_R11_DESIGN_OPTIONS.md)。

## 2. 0.11.2 新增必选功能候选

| 功能 | 可观察产品行为 | 禁止误解 |
|---|---|---|
| P01 SQLite Store | 本地打开/创建数据库，领域模型、事实、关系、来源、规则和可复现 Decision 结果的写入、读取、更新、删除/失效，事务、索引、重开验证 | 不重造 DBMS、专有 Domain Runtime/Registry 或 KDP 数据服务 |
| P02 YAML | 复用已存在的标准 YAML Reader/Writer，支持领域知识文件的读写、受控导入/导出、版本/来源引用 | 文件格式不是与 SQLite 并行的另一个数据库 |
| P03 JSON-LD 1.1 | 将用户原称 JSON-DL 暂按标准 JSON-LD 理解；支持 `@context/@id/@type` 的语义关联、读写、领域图导入/导出、受控 Context | 不等于完整 RDF 推理/SPARQL 服务；不得自动获取未选远程 Context |
| Q01 SQL | 参数化 SQLite SQL 的精确 Domain/Version/Subject/Time/Region/Source 筛选、关联、聚合及有限分页 | 非可信业务输入不能执行任意 SQL；查询入口不擅自写数据库 |
| Q02 Vector | 保存向量与知识对象的稳定关联，调用方提供向量后的相似度 Top-K、维度/距离/版本检查及精确作用域过滤 | 不强制 Embedding/LLM/向量自动生成；相似度不是 Rule 的权威真值 |
| Q03 Graph | Concept/Entity/Relation 的节点/边查询、指定类型和方向的邻居、有界多跳/路径/依赖 | 不要求独立图数据库、无界图遍历或完整 Cypher/SPARQL/OWL |
| D01 一致决策 | SQL/Graph/Vector 在同一已选知识快照上配合 Domain Knowledge/Rule/Decision；向量只召回候选，再由事实/版本/适用性和规则做确定性裁决 | 不以检索得分包装 COMPLETE，不静默跨 Domain 或知识版本 |

**YAML 和 JSON-LD 除导入/导出外，还必须能在加载已选文件后直接进行有界的领域语义/事实/关系查询**，无需为了单次查询强制先导入 SQLite。SQL 只对 SQLite 数据源运行；Vector/Graph 的领域查询应能对 SQLite 和已加载的受选文件保持相同 Domain/Version/Applicability/Evidence 语义，不强制相同的底层加速策略。若 YAML/JSON-LD 的已选内容要持久更新，文件写入须遵守明确的覆盖/版本策略，避免破坏原快照。\n\nSQLite 作为默认本地持久化与查询引擎，关系用索引表 + 有界递归 SQL 即可，向量可在 L2 比较 SQLite 扩展与适合较小集合的有界算法。要求本版实际跑通向量 Top-K，不得以“日后可装扩展”代替功能实现。具体 Node22 驱动、原生扩展分发和跨平台组合属于 L2，而不是 L1 限定。

## 3. 数据治理与运行职责

- DomainId/Version、Package 版本、Knowledge 数据集/快照版本、Rule 版本、Fact/Source/Relation ID 必须有不同身份；**读写和查询均按显式已选版本和 Domain 约束**，不自动用最新版本替换历史决策的来源。
- 对修改/删除应有版本前提或事务冲突检测。批量导入必须整体成功或回滚；当前 Decision 仅保存被实际使用的规则、事实、来源及知识快照引用。
- 同一选定版本/同一时点的 Query 与规则结果须可复现。缺失、冲突、失效、不适用、未核验来源及技术失败必须保留各自语义。
- 源数据完整性、来源声称、真实性认证分开；本地 SHA256 不自动证明授权或签名。
- SQLite 资源与 IO 由可信 App/调用方拥有并按现行 Package Init/Dispose 生命周期管理；KDP 仍只负责生命周期与最终兜底。0.11.2 允许可信业务显式本地读写，但**不提前建立 0.11.4 通用 Host/Capability/Effect 授权框架**，不擅自联网或写任意路径。
- SQLite/YAML/JSON-LD 应有可观测错误、尺寸/深度/返回数量与图遍历上限；向量维度/度量必须明确。JSON-LD Context 默认已选本地或可信受控资源，未选 URL 不能隐式网络获取。
- 不复制现行 Standard JsonReader/YamlReader；L2 再判断哪些 Store/Query 类具备通用应用级 Standard 价值、哪些适合作为普通可组合领域 Package。一个公开 SDK，不强制 Forge 或生成器。

## 4. 新增 DI-AC15–DI-AC21（拟验收，NOT_RUN）

| 验收 | 可证伪的真实功能场景 |
|---|---|
| DI-AC15 | SQLite 写入 Domain、Fact、Relation、Rule、Source、Version 后真正关闭并重开仍可查询并作同一业务判断；事务失败回滚，版本冲突拒绝 |
| DI-AC16 | YAML、JSON-LD 的读写、直接加载文件后的有界领域事实/关系查询、SQLite 双向导入/导出真实覆盖订单与库存；稳定 ID、关系、版本、Source 未丢失；坏数据或不可信 Context 拒绝 |
| DI-AC17 | 参数化 SQL 完成跨表查询、过滤、聚合和有界结果；非可信字符串不能执行任意 SQL/写入；跨 Domain/过期不提升成功 |
| DI-AC18 | 已存储向量按输入向量 Top-K 返回候选及可核验得分，维度不符拒绝，Domain/Version/Scope 精确过滤后才参与 Rule 判断 |
| DI-AC19 | 真实关系图上完成方向/关系类型过滤、多跳路径查询；图环及超限可终止，不越过 Domain/Scope |
| DI-AC20 | Order 和 Inventory 共享同一存储/查询基础，修改明确选定的知识/规则会改变实际决定并保存可复现的证据引用 |
| DI-AC21 | 干净外部 Node22 ESM SDK-only Consumer 实际创建、写、查、关闭/重开，执行 SQL/Vector/Graph 正反例，保持 0.11.0/0.11.1 有效回归；无需 0.11.6 的任务恢复 |

## 5. 与后续版本明确划界

**0.11.2:** 领域数据存储、SQLite、YAML/JSON-LD 交换、SQL/Vector/Graph Query、规则与决定的有限快照/引用。**0.11.6 #1616:** TaskRun/Checkpoint、暂停恢复、进程重启、Effect 已提交状态与幂等协调，允许复用先前的 SQLite 存储基础但不得共享同一个不清楚的 KDP 状态模型。**0.11.7:** 执行过程的完整 Evidence/Trace，不由有限 Decision 证据代替。

**Owner 待确认：** 把上述 P01–P03、Q01–Q03、D01 和 DI-AC15–21 正式纳入 0.11.2 Product/L1；0.11.6 仅转出领域数据存储，不转出 Durable Execution。当前保持 PROPOSED / NOT_FROZEN / NO_CODE / NO_CI，不启动 L2。
