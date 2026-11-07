# DIS 0.2.0 概念简化与迁移台账（统一生产模型）

**状态：Product/L1 修订候选、待 Demo/Schema/Conformance；不构成冻结。**
**上位评审议题：** #1494；**L2 候选 PR：** #1493；**前序冻结：** DIS 0.1.0 @ 9504c78f4651f6c1ebc48c7858fca2d8b061544b。

本台账保留既有的 KEEP / MERGE / REVISE / ADD / REMOVE / DEFER 判定，标注统一 Unit 生产与路由模型的变更，且不重写 0.1.0。

| v0.1.0 / 既有 0.2.0 概念 | 决策 | 0.2.0 目标与迁移要点 |
|---|---|---|
| Domain Intelligence 为产品目标 | KEEP | 不以 Package 格式替代智能价值 |
| Domain Scope / Consumer Profile | KEEP | 约束 Unit 边界、适用性和生产质量 |
| Knowledge Corpus / 原始素材 | KEEP | 作为来源，不自动成为可信或运行时资源 |
| Structured Knowledge 独立抽象倾向 | REMOVE | 结构化是 Knowledge 进入生产执行的条件，不是新对象 |
| Knowledge Structuring | ADD | 规范**生产 Candidate Unit** 的输入、转换、来源和证据 |
| 每个知识/函数均包装 Unit | REMOVE | 无独立能力的事实、函数或文件保留为内部资源 |
| Intelligence Unit 的七个 Role | REVISE | 可选语义 Profile；不建立七套引擎或独立 Unit 类 |
| 单独的 Knowledge Unit 种类 | MERGE | 有公开可调用 Knowledge-access Capability 时就是普通 Unit；纯数据保留 Resource |
| Unit 的公共身份 | KEEP | stable ID / revision / digest / owner / provenance / applicability |
| Unit = 独立逻辑描述（无明确能力承诺） | REVISE | 可部署 Unit 必须提供 ≥1 Capability，并有实现/验证/失败与依赖 |
| Capability requires/provides | KEEP | Contract 有独立身份/版本，Unit 是多个 Provider 之一 |
| Capability 作为独立 Runtime 对象 | REMOVE | 不创建新 Capability Engine、权限或 Scheduler |
| Unit Implementation | REVISE | Atomic/Composite Profile；Function/Rule/Parser/Tool/Workflow 等可信绑定 |
| Workflow 作为与 Unit 平行的对象 | MERGE | Workflow 是 Composite Unit 的组合实现 |
| Pipeline 独立规范资产 | REMOVE | 仅作描述性用语 |
| Composition Graph | KEEP/REVISE | Workflow 可验证表达；不独立代表新智能实体 |
| 显式 Unit DAG 作为创作者的主要组织方式 | REMOVE | Main Workflow + 多 Public/Subworkflows；构建推导引用闭包 |
| Unit 依赖合法性 / Package DAG | KEEP | BUILD 依旧检查引用环、目标兼容性和 Package 无环依赖 |
| 单个业务 Package 的入口 | REVISE | 承担业务入口的 Primary SHOULD 有一个 Domain Main Workflow |
| Domain App 固定入口 | ADD | 一个锁定 App Entry/Main Workflow，KDP 直接启动 |
| Intent Recognizer 输出 | MERGE | 统一 Structured Intent，不维护平行 Intent 数据模型 |
| Intent Routing Engine | REMOVE | Routing 是由 Unit 提供的 Capability，不是新 Engine |
| Intent → Capability 路由契约 | ADD | 结构化 RouteDecision，受限于编译封闭的 Capability Catalog |
| Dynamic Form | KEEP/REVISE | 可选 Slot 澄清元数据，不授予权限 |
| Control/Data/Evidence Edge | KEEP | 保留三种互斥语义、可独立重建的 Trace |
| DAG_ONLY / Subworkflow | REVISE/DEFER | 0.2 Core 保留可验证安全控制流；有界调用仅限合格可选 Profile，0.1 仍 DAG_ONLY |
| 单一 Resource Closure | REVISE | Runtime、Build/Validation 和 Provenance refs 分离 |
| Knowledge 查询与数据库强制实现 | DEFER | 访问/存储技术归 #1476；不强制数据库 |
| Unit 生产模板/生产证据 | ADD | 产物、来源、工具版本、转换 Profile、Digest 与验证可复现 |
| 子 Unit PASS 自动资格继承 | REMOVE | Composite Unit 必须独立验证公开 Capability |
| Qualification / Promotion / Selection / Activation / Execution | KEEP/REVISE | 五维独立，append-only exact-subject 证据，不自晋升 |
| Structural / Behavioral / Consumer Conformance | KEEP | 独立结论，并增加 Production 证据 Profile |
| Boot / KDP / SDK / Business / Host | KEEP | 接受 #1484，避免第二 Runtime 和 Effect 权威 |
| 0.1.0 冻结产物 | KEEP | 独立保留，0.2 使用新 Schema 及显式迁移 |
| 真正 Runtime Adoption | DEFER | #1486 单独证明，Demo PASS 不代表已实现 |

## 无损迁移规则

1. 明确把纯数据 Knowledge Role 转为受控 Knowledge Resource，或转为拥有实际可调用 Capability 的普通 Unit；禁止自动编造 Capability。
2. Workflow Unit/Graph 映射为 Composite Unit 的 Workflow 实现，原 Graph 精确引用、输入、证据、分支语义必须保留。
3. Recognizer Output/Dynamic Form 映射到规范化 Intent Slots；保留每个值的 provenance、epistemic status、unknown 和用户确认事实。
4. 原 requires/provides 的契约身份、digest、版本和资格必须精确保留；不兼容变化创建新契约或明确迁移。
5. 原 Profile、Candidate、Promotion、Selection、Activation、Execution 不能揉成一条 Unit 全局状态。
6. 资源闭包区分 Runtime、build-only 和描述性来源；涉及未绑定运行资源或证据丢失须 fail closed。
7. 若迁移无法恢复 Knowledge 来源、领域行为、RouteDecision 或 App Entry 语义，标记人工裁定，禁止自动合并。
8. v0.1.0 的已冻结 L2 和后继 #1484 权威均不可改写；任何 Product/L1 冲突先由 #1494 裁定。

## 最小独立验证矩阵

- Unit Producer 从来源生成 Atomic Unit，重复固定候选的独立验证与 BUILD。
- 同一 Capability 至少两个 Unit Provider，BUILD 在显式 Policy 下选择一个；缺失/多重未决时失败。
- Composite Unit 将子 Unit 组合后正常工作，同时用错误映射/丢失证据证明“子 PASS != 组合 PASS”。
- Intent Recognition Unit + Routing Unit 处理 Known、UNKNOWN、AMBIGUOUS、CONFLICT、OUT_OF_SCOPE 和 NO_MATCH。
- App Entry 避免“为启动 Router 先路由 Router”的递归；公开跨 Package Capability 可在锁定绑定下直接调用。
- 一个非媒体领域与 xDownload 使用同样的 Unit 生产、组合和符合性契约。
- 错误 Digest、未授权 Tool/Host Effect、伪造 Promotion、越界 Subworkflow、Package 依赖环均失败。

以上为候选迁移规则；只有跨域 Demo、Schema 和独立 Conformance PASS，才可请求 Exact-SHA L2 Freeze。