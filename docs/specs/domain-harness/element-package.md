# DomainHarness · Element 封装、Package 组织及 Standard Elements

> **权威**：本文件是 [DomainHarness 规范集](./README.md) 的组成模块；所有模块共同构成**一套**规范，不是独立规范版本。
> **状态**：`CONFIRMED`=已确定原则；`MIGRATION_REQUIRED`=目标明确但机器合同/源码未迁移；`CANDIDATE`=待决策。不得从规范条款推导源码或 CI 已 PASS。
> **条款编号**：保留原 R90 单文件规范的编号以便 GitHub Issue、Review 和旧链接溯源；跨文件引用以目录索引为准。

本模块适用于新建、重组或独立审查 Package/Element；技术规则优先于一文件一元素等实现习惯。

## 2. Element 的封装范围与组成 — CONFIRMED

1. 所有 Element 用统一 `kind:'Element'` 的逻辑模型，不建立 `KnowledgeElement/RuleElement/WorkflowElement/ToolElement` 等互斥根类/类型继承树。描述性 `roles/tags` 不赋予权限；内容分类归 `content[].contentKind` + `schemaRef`。
2. **一个 Element = 一项稳定、内聚、可陈述的职责**。Element 可以拥有 0..N 个公开 Functions、多个不同 ContentBlocks、规则/知识/工作流/数据/状态/说明、Schema、受控资源、证据和私有代码辅助实现。
3. 一个 Element 完全允许 **`functions:[]`**：纯知识、纯数据、纯规则、纯声明都合法，不能为了统一外观造假的 `invoke`。但其内容不能因此被任何运行时 Package 随意读取；需有已选/授权 Reader 或 Function。
4. 划分粒度优先看**职责、Owner、版本演进、适用范围、公开接口、权限及独立验收/复用**。不是一文件一 Element、一函数一 Element、一条规则一 Element，也不是 JSON 与代码必须拆成两个 Element。
5. 一个 Element 的多种 Functions 可以绑定不同 Target 实现/资源，物理同文件/多文件均允许；Function 精确声明输入/输出 Schema、ContractVersion、Outcome、EffectIntent，是否调用取决于 FunctionRef/直接依赖/公开接口与 BUILD 已选择的 Target。
6. ElementRef 标识**逻辑 Element**，FunctionRef 标识**可调用合同**，私有 `module:ResourceRef + exportName` 只是已选 Target 的物理定位信息；原独立公共 `EntryRef` 不得复活。
7. 生命周期 Init/Exit/技术 Hook 的 Element 也要有真正的已选 FunctionContract 与唯一 Target，不得用裸导出或空壳 Element 冒充。普通零函数 Element 与**可执行的生命周期 Element**权限不同。
8. 静态 Element 依赖边用于 BUILD 的无环选定闭包；Domain 语义关系允许合理环；Workflow/Task 的控制图和 Package 依赖图分别管理，不能统一为一个超级 DAG。

**当前 ABI 提示**：现行 `ElementDefinition` 真实字段为 `id/version/schemaVersion/description/roles/content/functions/dependencies/validation` 等，R5 讨论中的 `facets/resources/implementations/provenance` 并**非全部已经加入同一个 Definition Schema**；不得直接把早期示意 YAML 当作现行已实现机器合同。

## 3. Package 内 Element 组织、依赖与选定 — CONFIRMED

1. Package 是按 DIS 适用合同编写的真实文件集合：Manifest、一个或多个 Element Definitions、必要的 Content、源码/Function 实现、Target/Schema/资源及测试。**作者可以是人、ChatGPT、Agent 或未来 Forge**；不需要 Package Generator、Seed Builder、额外 Package Assembly 阶段。
2. 一个 Package 可以持有多个 Elements；**当前每个可运行 Package 必须有本 Package 真实拥有的 Init Element**，Exit Element 可缺省，默认为 no-op。因此“理论可以零业务 Function”与“合法可运行 Package 必须有 Init”并不矛盾。
3. 每个已选 Element 在一份应用 Lock 中只有**唯一规范 Owner Package**；Manifest 的 `elements[]` 记录真实 DefinitionRef、Version、Visibility，跨 Package 只按显式 `imports/exports/provides/contributesTo` 和 `dependsOn` 授权。
4. **只允许直接声明的 Extension 访问**：A→B→C 时 A 不得因为能调用 B，就直接获得 C 的 Function/Init/资源。传递依赖不能充当直接 Extension，也不能用无约束的句柄透传规避。Hook Provider 同样遵守具体 Owner/FunctionRef/公开接口/基数。
5. Package 内不同 Elements 可使用共享私有代码/资源，但不能通过私有 helper 暴露绕过 Function/Target/资源闭包的第二公共执行通道。
6. 一层内 Core 与 Extension 的物理目录任意；Package Tree 仅是职责结构，Package DAG 是真实调用依赖，Element Dependency DAG 是静态 API 引用，Semantic Relations/Workflow 则是另两类逻辑关系。
7. 文件目录只为作者便利，可采用 `manifest.json`、`elements/`、`content/`、`src/`、`tests/`；不以目录路径自动解释 Owner/权限，亦不要求每个 Element 对应一个子目录、文件或 npm 包。

## 8. Standard Element、执行/异常与实例复用 — CONFIRMED

1. Standard Element 仍是普通 Element/Package，既不是 `kind:'StandardElement'` 新根类型，也不是自动获得 Kernel 权限的特例。候选至少通过两个不同实际使用场景证明独立职责、公开边界、Static Selection、真实受控 Consumer、错误/拒绝，才可在 Catalog 针对**具体 Target/Profile** 标 `STANDARD_ACCEPTED`。
2. v0.11.1 已受审 `dh.std.file.json`、`dh.std.file.yaml` 限于当时被审身份、Node ESM Profile、真实 Lock/消费者。正在讨论的 camelCase 迁移不会保留原 ID 的无差别执行资格。
3. 共享的状态转换/Workflow 执行基本机制由 KDP Kernel Element 管理；业务 Workflow 内容、规则和私有函数由各自 Domain/Standard Element 拥有。例行 JSON/YAML 等通用数据处理可由按需选用的标准 Element 提供，不在 KDP/BUILD 中复制另一份相互竞争的业务解析。
4. Package 内部业务错误、超时/重试、降级由该 Package 的 Element/Function 负责；运行时技术故障和 Exit 兜底由 KDP 负责。不得为了“所有通用功能都放 KDP”把业务 Rule、Validator、Decision、Reader、知识库或 UI 变成不可选择的 Kernel 硬编码。
