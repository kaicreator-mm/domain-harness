# DomainHarness — 统一架构与工程规范（Canonical Specification）

> **唯一规范入口 / SINGLE SOURCE OF NORMATIVE TRUTH**  
> 适用范围：`DomainHarness 0.11.x` 一次完整的 Element-First SDK 重写及后续阶段的基础契约；源代码未采用本规范的新部分，应以本规范列出的 **MIGRATION_REQUIRED** 明示差距，不把历史 scoped PASS 自动升级。  
> **归口**：[Foundation #1564](https://github.com/kaicreator-mm/domain-harness/issues/1564)、[L2 #1574](https://github.com/kaicreator-mm/domain-harness/issues/1574)、[整改 #1668](https://github.com/kaicreator-mm/domain-harness/issues/1668)、[总控 #1563](https://github.com/kaicreator-mm/domain-harness/issues/1563)。  
> **成立方式**：综合已确定的 Owner 产品/架构决策、已验收的 0.11.0/0.11.1 合同与近期明确的规范化方向；本文件统一**规则归属与表述**，不冒称尚未完成的 ABI/代码更改或新 Exact-SHA 审核已经完成。  
> **首次整编**：R88；本规范是未来设计、Agent、PR 审核中首先读取的唯一基础规范。其它历史 Issue/PRD/L2/专题文档只解释来源、适用实例与实施细节；若发生冲突，由本文件列出已确认的最新裁决及其来源。**新的实质合同变更必须先改本文件并通过相应 Owner/L2，再改源码**。  
> **架构主图（R89）**：总体模块与接口责任的规范性说明集中在 [§A 统一架构蓝图](#a-统一架构蓝图与模块责任architecture-blueprint)，其余各章对该架构的运行、选定和工程约束做具体说明。架构图中的 MIGRATION_REQUIRED 仍是未来整改验收目标，不得当作已经实现。
> **外部标准**：DIS 对 Domain/Element/Package 的适用规范仍需遵守，本文件是 DomainHarness SDK 的实施和补充规范，不单方面宣称修改或获得完整 DIS Conformance。

## 0. 规范状态与阅读规则

本文件所有条款按下面四种状态理解：

- **CONFIRMED**：已有 Owner 明确决议或当前 0.11.0/0.11.1 适用且受审的基础语义，可作为新的设计约束；但不表示全部源码已经按最新语义实现。
- **MIGRATION_REQUIRED**：明确的 Owner 新要求和拟纳入的目标合同，与现行 Schema、源码、安装消费者有真实差距；实施前必须独立审查受影响 L2/ABI/安全和测试。这类内容是**设计规则，不是实现验收状态**。
- **CANDIDATE**：非必需字段、未来宿主/语言、具体重命名、性能策略等尚待 L2/实际例子确定，不得强制作为全局 ABI。
- **HISTORICAL**：被后续决议取代的旧主张和先前已审证据，只用于追溯，不得重新用作当前架构的命令。

“一个规范文件”表示**一处维护基础语义**，不取消每个版本的 Product WHAT/AC、L2 接口细节、DIS 标准原文、实际 Manifest/Schema/Lock 或测试；这些不是重复的第二规范。

## A. 统一架构蓝图与模块责任（Architecture Blueprint）

> **规范地位**：本节给出架构拓扑、允许的执行路径与稳定责任边界。下文 §1–§9 对各节点的语义、安全与工程质量进一步约束。**现行运行时代码是否满足目标结构，以 §10 的状态和真实源码/E2E 为准**；该图不是宣称 Boot/KDP/BUILD 已经完成迁移。未定的物理 ABI/目录/Element 数量归 #1668 的 L2，不在此臆定。

### A.1 顶层形态：一个嵌入式 SDK、一套 Element/Package 模型

```text
       Domain Package 作者（人 / ChatGPT / Agent / 未来 Forge）
                       │  编写普通 Package 文件，不要求生成器
                       ▼
      DomainHarness SDK 作者期能力 (/composition)
      选定已有 Package / Element / Function / Target
      静态校验直接依赖、资源与权限，生成 App Lock / Pin
                       │
                       ▼
         确定的 Domain App 安装制品及信任记录
                       │
       ┌───────────────┴──────────────────┐
       │ Domain App Host / Launcher        │
       │ 只通过一个公开 DomainHarness SDK   │
       └───────────────┬──────────────────┘
                       ▼
         Boot [Package 外唯一最小可信入口]
          先验证受信记录、Pin/Lock、KDP 入口字节
                       │ 单次受信转交
                       ▼
      KDP Kernel Domain Package  [Core.Order=0]
       ├─ 真实 Lifecycle Element (Init/Exit)
       ├─ PackageSystem、Core/Extension 调用机制
       ├─ 通用 Workflow/StateMachine (XState Actor)
       ├─ 选定 Function/Hook 调用、运行预算、故障兜底
       └─ DomainApp 状态与最终 Exit 责任
                       │ 已选、显式授权的调用
                       ▼
      其它 Core / Extension Domain Packages
       ├─ 可选择的 SDK/Standard Package Elements
       └─ Business Package Elements
            ├─ Content/Rule/Knowledge/Workflow Definition
            ├─ Function 合同及其 Target 实现
            └─ 各 Package.Init 内启动自己的已选 Workflow
                       │
                       ▼
         typed Outcome / Domain App 状态
                       │ 应用关闭或未处理错误
                       ▼
          KDP 按实际 Init 进入历史逆序调用可选 Exit
```

图中的 K/S/B 是**Package 层职责而非不同技术模型**。Core.Order 与直接 Extension 才决定真实 Init 调用链。这里的 Host 是 Domain App 的宿主/受选外部操作边界；**不是另一个 Kernel、另一套调度器或第二个 DomainHarness 运行时**。没有已授权的 Host/Effect 时，不能从这张图推导任意外部副作用已受支持。

### A.2 责任矩阵：组件能做什么，不能做什么

| 组件或责任域 | 必须拥有的职责 | 不能拥有/越过的职责 | 状态 |
|---|---|---|---|
| **Domain App Host** | 提供进程和启动/配置/必要的物理 Host Port，调用一个公开 SDK | 不因是宿主就绕过已选 Function/资源/Effect 权限；不自建业务 Runtime | CONFIRMED |
| **可信 Boot** | 在 import/执行 KDP 之前验证必要安装锚点、Pin、Lock、入口目标/字节完整性，并单次移交到选定 KDP Init | PackageSystem、业务 Workflow、状态机、业务 App Init、Core/Extension 编排、Exit 调度、在线 BUILD | MIGRATION_REQUIRED |
| **KDP Kernel Package** | 唯一运行时权威；本 Package 真正的 Init/Exit Element；PackageSystem、通用 Workflow/Actor、基本状态/故障/Exit 控制 | 业务知识、具体 Rule/Decision/Reader/UI；独立第二 Runtime 或业务规则解释器 | MIGRATION_REQUIRED |
| **SDK Domain Packages** | 可复用、按 App 需求静态选择的服务/Standard Elements、Function/Target 实现和资源 | 偷偷变成必须全部安装的单体 SDK 功能；隐式公共权限 | CONFIRMED |
| **Business Domain Packages** | 领域数据/规则/约束/Workflow Definition、公开 Functions、所需资源与业务异常处理 | 重新实现 KDP 的通用 Package Loader/XState 引擎；未声明地调用其它 Package | CONFIRMED |
| **作者期 Composition** | 使用现有 SDK 对既存文件组合、检查静态闭包、输出 Lock/Pin/受控安装收据 | 要求未组装的 Domain App 先 Boot 自己；在 Runtime 动态重建授权图；强制自动生成 Package | Package/Element 实现所有权 MIGRATION_REQUIRED |
| **Contracts/Schema/Validator** | 统一机器身份、结构、语义依赖、构建期质量/权限验证；源码私有 helper 仍可只是普通文件 | 以裸 public export、路径或未选运行时 Function 绕过 Package/Element；每次 Runtime 重新做全量静态 BUILD | 可执行公开行为所有权待迁移 |
| **外部协议/Host Effect** | 在当前已选择、真正授权和有证据的接口执行物理操作 | 由于某 Package 持有代码就自动获得 fs/network/process 权限；越过 KDP 的受选边界 | 仅针对具体版本 Profile/能力承诺 |

### A.3 架构依赖规则：四个禁止出现的第二系统

1. **只有一个 Boot → 一个 KDP → 一套 PackageSystem/运行控制**。现有 `packages/microkernel` 可以是物理 TS 实现工作空间/私有代码，但不能在逻辑架构上继续充当与 KDP Package 平行的第二内核权威；它的执行能力必须归属 KDP 的真实 Elements。
2. **只有一套 Init/Exit 生命周期**。Boot 通过受信入口调用 KDP 的真实 `init`，并由 Package.Init 链完成必要启动；不能再出现 `bootstrap → 一套 App 初始化 → KDP.Init 外壳 → 又一套 App 初始化`。Workflow 在声明它的 Package.Init 内启动，业务函数由已选 FunctionRef 调用。
3. **只有一个静态选择/组合体系**。Package 文件可直接手写；作者期 Composition 可通过同一 SDK 的固定受信版本运行，不能要求未生成的 App 自举，也不能引入额外 Forge/Seed Builder/独立 Assembly 产品。Runtime 不能替代 BUILD 重新解析未声明依赖与动态权限。
4. **只有一份公开语义身份体系**。Package、Element、Function、Owner/Namespace、Version、Target 和 Digest 各有定义；物理 npm workspace、导出路径、CLI 或文件名不能代替公开 Element/Function 的声明、选择与权限检查。

**允许的复用**：一个 Package 包含多个内聚 Elements；一个 Element 使用多个普通实现文件、私有函数和 Target 资源；可在分发时物理合并 KDP/SDK Packages，但必须能证明逻辑身份、权限和生命周期等价。**不允许**因此把任何辅助函数变为自动可跨包访问的隐形公开 API。

### A.4 同一系统的两种阶段，不能造成自举环

- **作者期**：用户或工具已经拥有一个已安装、可信的 DomainHarness SDK，调用其固定 `/composition` 能力选择并验证**已有 Package**，形成未来 Domain App 的 App Lock/Pin。这不要求未来 App 已经启动。
- **运行期**：Domain App 在有安装与 Lock 证据后调用 `/runtime` 的最小 Boot。Boot 的执行前验证**不依赖任何未验证的 KDP 代码**；验证通过后才移交给唯一 KDP Init。KDP 运行被 BUILD 选定的 Package/Element/Workflow，不重新建立权限图。
- **自举目标**：Kernel、SDK 可执行能力都具有真实 Package/Element 所有权。作者期静态入口仅是加载既有 SDK 的方法，不是赋予新 App 动态执行 BUILD 的隐藏万能权限。具体作者期 Package/Element Target 和初始启动 Pin 字段属于 **L2 尚待确认的 MIGRATION_REQUIRED 接线**。
- **失败边界**：信任验证失败不得产生任何 KDP 模块副作用；Package 内部异常归自己处理，未处理的由 KDP 有界记录并逆实际 Init 历史 Exit。不能以“自举改造”为由删除本来受限有效的 Boot Pin、SRI、静态闭包或失败拒绝证据。

### A.5 分层视图与源码边界不是同一件事

```text
逻辑规范层：Domain / Package / Element / Function / Target / Lock
SDK 产品层：唯一 @kaicreator/domain-harness（作者期 + 运行期入口）
运行控制层：最小 Boot + 唯一真实 KDP Kernel Package
可选能力层：已选 SDK/Standard/Business Domain Packages
物理源码层：TypeScript workspace、ESM 文件、npm 依赖、资源文件
```

- 逻辑 Package 不等于一个 npm workspace，也不必与一个 ESM 源文件、一个目录或一个 Element 一一对应；**目录设计不是当前协议**。
- TypeScript `contracts`、`microkernel`、`tooling/build` 等文件夹是否还要存在，属于生产代码重构和打包优化问题；**权威判断不是文件夹名字，而是执行功能是否由真实 Package/Element 持有且受选调用**。
- 系统可在一个 Git monorepo 内维护多个模块；SDK 最终公开入口仍只有一个。没有新的实证，不发明跨语言 Package Loader、Host 自动认证服务或通用 Forge 生产流水线。

### A.6 架构审核不变量（新代码必须满足；现有缺口单独标记）

| ID | 必须能回答的验证问题 | 现状归属 |
|---|---|---|
| ARCH-01 | 未验证 KDP Target 的 import/执行是否为零？ | Boot / Pin / Lock |
| ARCH-02 | 是否由真正的 KDP-owned Lifecycle Element 完成 App Init，而不是独立 `bootstrap()` 内部逻辑？ | #1668 待整改 |
| ARCH-03 | PackageSystem/XState/Workflow 是唯一一套且由 KDP Kernel Elements 拥有吗？业务流程仍在 Business/Standard Content 吗？ | #1668 待整改 |
| ARCH-04 | K/S/B 使用统一 Manifest；Core.Order、直接 Extension、Init/Exit 均遵守单一链吗？ | Foundation 已 Scoped；新目标增量复核 |
| ARCH-05 | 同一 App 能否只有一个公开 SDK 直接依赖，且所有选定 Function/Target/Resource/Host 权限可追到 Lock？ | v0.11.1 已 Scoped |
| ARCH-06 | 作者期 Composition 是否不要求待构建 App 已经 Boot，亦未形成未声明的新运行时权限？ | #1668 L2 待明确 |
| ARCH-07 | Element 是内聚职责的 0..N Function + Typed Content，不按源码文件数量/固定类型拆分吗？ | 合同已确认；以后持续核对 |
| ARCH-08 | Package/Element ID 是否按新的包名/变量名规范，Namespace/Owner 独立，迁移后重算真实摘要？ | #1668 机器身份待迁移 |
| ARCH-09 | 旧 v0.11.1 Exact-SHA 审核与 Digest 是否保持不可变，新的架构实现是否重新受限 E2E 和非 Writer 复核？ | #1668 结束门禁 |

任何 ARCH 不满足时，应标注 `MIGRATION_REQUIRED / REWORK` 或在具体范围内拒绝，不得仅凭文档/架构图宣布 `PASS`。架构审核仅针对确实变更的切面，重用旧同 SHA 已接受的其它功能；P0/P1 未归零不能将新自举合同标为完成。

---

## 1. 产品、版本和对象边界 — CONFIRMED

1. **DomainHarness 是嵌入 Domain App 的 SDK**，不是单独运行的业务 App、通用智能体平台、Package 生成器、DomainForge 或第二个 Runtime。消费者只有一个直接公开 SDK 产品：`@kaicreator/domain-harness`；`/runtime` 和 `/composition` 是同一 SDK 的功能入口，内部传递依赖合法。
2. **版本 0.11.0–0.11.9 是同一次完整重写的内部阶段**，不是互相需要兼容的十个独立正式版本；全部阶段完成后才按正式发布门禁合并 main/打 Tag/发布。旧 0.10.x ABI、源码和旧 App 不作为新 Runtime 兼容义务。
3. **Domain** 表达领域语义、关联关系和约束。**Element** 是一个内聚职责的领域知识/能力微型库。**Function** 是该 Element 选定的公开操作合同。**Package** 是该 Element、实现文件、资源、权限与版本的物理拥有/交付和组合单元。**Workflow/Task** 是受选 Function 的实际执行图，不能混为 Element 依赖图。
4. 正常业务执行链为 **`Boot → KDP.Init → selected Package.Init → selected Workflow → Element.Function`**；某 Package 没有业务 Workflow 时只执行自己的 Init，不需要虚构一个 Workflow 或默认 Main。
5. 仅有 K/S/B **三种 Package 层职责** `kernel|sdk|business`；每个 Package 共享同一种技术 Manifest/Element/Function/Init/Exit 合同。实际启动由 `Core.Order` 与显式直接 Extension 依赖确定，不能把 K/S/B 数量/层级写死成固定三节点循环。
6. 一个 Package、一个 Domain App 的**直接执行闭包只能用一种编程语言和 Runtime**。多语言仅属于 DIS/Package 规范可分别描述的不同独立 App/Package；跨语言经受控外部进程协议，不在一个 App 内混合两种 VM 或直接跨语言 FunctionRef。

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

## 4. 生命周期和初始化顺序 — CONFIRMED

1. 一个 App 有一个唯一 KDP，其 `Core.Order=0`；每个 Core 必须有不同的非负整数 `Order`，不要求连续。重复、缺 0、KDP Order 错或无唯一 KDP 必须在组合/BUILD 失败。
2. Boot 验证后**只启动一次 KDP 本身的 Init Element**。Core Init 先按自己直接声明的同层 Extension 依赖递归调用其 Init，等待本层必要工作，然后调用 BUILD 已确定的下一个 Core.Init；Extension.Init 只能递归自己直接声明的 Extension，不驱动其它 Core。
3. **仅有一轮从上到下的 Init 链**。不得再有独立 technicalInit、Business App Init、READY 后的默认 ingress、第二轮反向 Init、重复全局 Initialize 循环。Package 想启动业务 Workflow，必须在自己的 Init Element 中按声明和选择执行。
4. 同一 Extension 可能被多个直接调用者多次 Init；**是否去重、幂等、恢复是 Package 自己的策略**，KDP 不维护一套强制全局 once 集合。
5. `Exit` 与 `InitFrom` **分别可选**。`InitFrom` 若启用，只记录实际直接调用者（包括重复、失败、激活隔离），不充当权限/去重/Exit 依据。KDP 独立记录真实 Init 进入顺序以在退出时逆序尝试已有的 Exit。
6. Exit 只于应用关闭或可捕获的全局未处理致命错误后执行，不在每一层 Init 递归返回时执行；只退出实际进入过的 Package，单个 Exit 失败不阻断其余尝试，断电/强杀不承诺执行退出。
7. 业务/功能错误由所属 Element/Package 自治处理，KDP 仅针对未处理故障提供最小但可诊断且脱敏的日志、退出和状态兜底。不额外增加一个业务逻辑重复验证 Runtime。

## 5. 最小 Boot、自举和 KDP 所有权 — CONFIRMED 方向 / MIGRATION_REQUIRED 实现

**最小且唯一可在 Package 外的可信入口 Boot**，职责仅是：读取必要的受信安装/入口锚点，验证 Pin/Lock/唯一 KDP 入口身份与执行前字节完整性/Target，解析并调用**一次已选、已验证的 KDP Init Element Function**。验证依赖的本地读取/哈希/路径基础工具可以留在 Boot，但 Boot 不得执行任何域业务或建立第二套运行控制权。

以下全部须由**真实 KDP Kernel Package 的内聚 Elements + 所属私有实现**拥有：
- PackageSystem、受选 Core/Extension 的 Init/Exit、运行控制权威、DomainApp 生命周期与状态。
- 通用 Workflow/StateMachine、XState Actor 与有界执行机制；**Owner 的后期 KDP 裁决**覆盖早期让每个 Business Package 自建通用 Workflow Engine 的建议。
- 必须的运行时已选 Function/资源/Hook 绑定及最后的异常/Exit 兜底；具体业务 Rule/Guard/State/Workflow Content 归各自 Standard/Business Element，不硬编码进 Kernel。

**严格 Boot 禁区**：遍历业务 Package DAG、创建 PackageSystem、运行 Workflow/Actor/Task、解释规则、裁定 READY/DEGRADED/BLOCKED/FAILED、业务 Function 路由、执行业务 Init、调用第二次 App Init、组织 Exit 或在线重新 BUILD。

**当前具体差距（MIGRATION_REQUIRED）**：参考 KDP 的 `r41-kdp/dist/bootstrap.js` 仅 re-export `@kaicreator/domain-harness-microkernel.bootstrap`，`dist/index.mjs` 中 KDP Init Element 只做事件及下层转调；真正应用初始化/PackageSystem/Actor 在 `packages/microkernel/src/kdp.ts` 等模块。应迁移**实现所有权**和 Boot 单委托调用链，不能只改名字/目录。任何 KDP 入口在被可信 Boot 校验前不得 import 或执行；KDP 自验本身不允许替换执行前 Pin 检查。

**自举说明**：Element 化不等于每个私有 TypeScript helper、type 或 ESM 文件都要成为 Element。只需确保所有可公开执行/组合的能力属于真正的 Package/Element，内部源码可以分多个私有文件；不存在长期的“Microkernel 作为第二 Runtime”架构层。

## 6. SDK、作者期组合/BUILD、可信安装 — CONFIRMED 方向 / MIGRATION_REQUIRED 归属

1. SDK 同时服务**作者期**组合已有 Packages（`/composition`）与**运行期**选定 App（`/runtime`）。两个入口属**同一个** SDK 产品与一致的 Contracts/Lock/Target 安全模型，不新增外部 BUILD 依赖、第二 Kernel/Runtime 或独立 Forge 服务。
2. Package 本身是文件，**不需要由 BUILD 生成才合法**；仅在真正组合/发行 Domain App 时，需要按当前 Target 检查 Package ID/Owner/Direct Extensions/Function/资源/Target、生成确定性 Lock/Pin/已选可安装闭包。不把 Package 作者工具或验证脚本变成生产必经阶段。
3. 静态依赖合法性应在组合/BUILD 以及最终生成可执行包/链接结果中得到证明，不能只信 Manifest 声明；无法证明的动态跨包调用、未声明 Extension、错误 Owner/资源/Target、npm lifecycle 执行等按当前封存合同拒绝。运行时不重做版本寻优/静态依赖图编译；Boot 仍做必要可信安装验证。
4. **作者期组合代码也应有 SDK Domain Package + 内聚 Element 实现所有权**（MIGRATION_REQUIRED）。但新 App 尚未组装，不能要求先 Boot 它自身才能执行 `buildApp`；公共 SDK 可以以受已安装 SDK 包版本约束的静态作者期入口调用其 Composition Element，不能让 App Runtime 获得未声明 BUILD 权限。
5. 允许将逻辑 KDP、SDK Packages 物理 bundle/融合发行，前提仍能证明原有逻辑身份、Layer/Order/显式授权/Init/Exit/Target/摘要。**物理一个 tarball 或 ESM bundle 不等于一个逻辑 Package**。
6. 不做通用多语言装载器；当前实际工程为 Node ESM Profile，最低 Node `>=22.12.0`。标准层可描述另一语言的独立 App；不得从 Node 24 CI 推出 Node 22 全 OS 组合已独立 E2E 证明。
7. 不引入 DomainForge、Seed Builder 或自动生成器作为当前 SDK 的前提；可按实际必要写轻量独立 Validator，只负责验证已有文件，不控制谁生成文件。
8. Runtime/Package 的安全声明仅限静态选定、直接访问、受信字节/摘要/权限等真实可测范围，不将此视为任意第三方 JS 代码的通用沙箱。

## 7. 统一命名 — CONFIRMED 目标 / MIGRATION_REQUIRED 机器合同

**命名依据**：npm 包名风格 + TypeScript 变量/类型风格，不再使用 PR/任务/阶段产生的 R41、R60、v011、i1656 等数字作为新的**永久产品 ID**。真正有业务意义的数字（如 `sha256`、`ipv6`）、SemVer 字段、Node Profile、CI/Issue/历史收据标签不在禁令内。

| 身份 | 统一格式 | 示例 |
|---|---|---|
| DomainPackage.id | 小写 `kebab-case` | `dh-kernel`、`dh-standard-file`、`reference-business` |
| **ElementDefinition.id** | **变量风格 `camelCase`** | `kernelLifecycle`、`workflowRuntime`、`jsonCodec` |
| ElementRef.namespace | 独立稳定的逻辑命名空间字段 | `dh`、`reference` |
| FunctionContract.id | 动词起头 `camelCase`，生命周期 `init/exit` | `readJson`、`evaluateRule` |
| Content/Workflow/Node 的新程序 ID | 按属性/变量风格 `camelCase` | `safetyRules`、`decisionFlow` |
| TS 类型/接口/类 | `PascalCase` | `PackageInitContext` |
| TS 变量/函数/属性 | `camelCase` | `selectedElement`、`isSelected` |
| 必要全局常量 | `UPPER_SNAKE_CASE`；局部不可变值可 `camelCase` | `MAX_WORKFLOW_DEPTH` |
| 源码文件/目录 | `kebab-case`，生态固定文件名例外 | `workflow-runtime.ts`、`package.json` |
| npm 公开包名 | npm `name` 格式，可使用 scope | `@kaicreator/domain-harness` |

**Namespace、Element.id、Owner Package、Version、Digest 各为不同属性**。不再把 `dh.kernel.lifecycle` 点分串写入**新** ElementDefinition.id；可用作展示历史全限定引用，不能代替逻辑对象独立属性。

**当前机器合同差距**：`tooling/build/src/build.ts::elementNamespace()` 仍基于点分 Element ID 推断 Namespace；`json-schemas.ts::IDENTIFIER_PATTERN` 对不同 ID 类型太宽松。新 Schema/BUILD/Ref/Lock/Pin/Manifest/Catalog/Consumer 的身份格式、同名唯一性、旧→新迁移、Digest/版本重算仍需 #1668 L2/源码/独立 E2E。**不能当前就对所有历史 fixture 加一个会误判的全仓 Gate**。

**旧→新仅为迁移候选，不是已改代码**：`r41-kdp/r41.kdp → dh-kernel / dh:kernelLifecycle`；`r60-standard-files/dh.std.file.json → dh-standard-file / dh:jsonCodec`。旧锁、审查 SHA、`STANDARD_ACCEPTED` 及历史 StageIndex 永久保留，不自动把原资格搬到新身份。

## 8. Standard Element、执行/异常与实例复用 — CONFIRMED

1. Standard Element 仍是普通 Element/Package，既不是 `kind:'StandardElement'` 新根类型，也不是自动获得 Kernel 权限的特例。候选至少通过两个不同实际使用场景证明独立职责、公开边界、Static Selection、真实受控 Consumer、错误/拒绝，才可在 Catalog 针对**具体 Target/Profile** 标 `STANDARD_ACCEPTED`。
2. v0.11.1 已受审 `dh.std.file.json`、`dh.std.file.yaml` 限于当时被审身份、Node ESM Profile、真实 Lock/消费者。正在讨论的 camelCase 迁移不会保留原 ID 的无差别执行资格。
3. 共享的状态转换/Workflow 执行基本机制由 KDP Kernel Element 管理；业务 Workflow 内容、规则和私有函数由各自 Domain/Standard Element 拥有。例行 JSON/YAML 等通用数据处理可由按需选用的标准 Element 提供，不在 KDP/BUILD 中复制另一份相互竞争的业务解析。
4. Package 内部业务错误、超时/重试、降级由该 Package 的 Element/Function 负责；运行时技术故障和 Exit 兜底由 KDP 负责。不得为了“所有通用功能都放 KDP”把业务 Rule、Validator、Decision、Reader、知识库或 UI 变成不可选择的 Kernel 硬编码。

## 9. 统一研发、审核与版本证据 — CONFIRMED

1. **先 Product WHAT/L1 + 可观察 AC**，再 L2 的身份/权限/Target/Init/Exit/Boot/调用时序冻结，再有限 Task DAG → 实施 → 受影响测试 → 真实消费/负例 → 非 Writer Exact-SHA 独立审核 → StageIndex 归档。明确功能澄清**不能被“候选代码已经 CI 绿灯”替代**。
2. 新变更先语法/Typecheck/Lint、改动设计的测试和必要正反例；能够在当前环境做等价验证，优先自己验证，**只有真实 Host/Registry/平台信任边界必须 CI 时才做一次**。CI/木啄鸟失败按当前 SHA 和错误日志原样诊断，不冒充 PASS。
3. 真实外部 Domain App 必须只直接安装一个公开 SDK，使用普通多文件 Packages，观察完整 **声明→静态选择→安装/SRI→Boot→KDP.Init→Workflow/Function→Outcome→逆序 Exit**，并测试未声明 Extension/过期摘要/错误 Owner/未选 Workflow/UNKNOWN 等拒绝。
4. 每个版本/阶段的实际 Receipt 记录 Source Exact SHA、Node/Target、AppPackage Digest、Lock Digest、CI pipeline、Review、结果和未解决 P2。不得把 docs-only 新提交说成新 SHA 已执行同一个 CI。
5. 0.11.1 历史 R72、R81、R83/R84 已受限接受；两项非阻塞 P2 分别是 Writer `Object.entries` 大对象预枚举、Reference 规则阈值在数据与 ESM 中重复表达。不能凭本规范“已修复”。
6. **改动要归属于最早出错的能力层**：Foundation 的 KDP、Element/Package、Boot、命名/身份问题归 Foundation #1564 / #1668，不在后续版本加入兼容桥，也不能为了保护内部未发行 ABI 再叠一套 Runtime。新基础合同可能要求 v0.11.1 已受审消费者重新验证，但不撤销历史已审事实。
7. 每次任务必须有完结边界；只进行必要变更/Scoped review/一个 checkout、无多余的持续本地 Agent 工作。不要为每条检查增加治理流程或重复建立第二套测试平台。

## 10. 适用与迁移表：哪些已做到、哪些仍需做

| 合同切面 | 状态 | 证据或受控下一步 |
|---|---|---|
| Element 统一根类型、0..N Function、typed Content、FunctionRef/Target/显式依赖 | **CONFIRMED / v0.11.0 scoped** | #1564/#1624；现行 TypeScript Contract |
| Core.Order=0 KDP、单轮 Init、直接 Extension、可选 Exit/InitFrom、真实逆序 Exit | **CONFIRMED / v0.11.0 scoped** | #1621/#1622/#1625 及受影响源码 |
| Init→Workflow→Function、标准 JSON/YAML、单公开 SDK、真实 Reference App | **CONFIRMED / v0.11.1 scoped** | #1605/#1656/#1664；R72/#2979、R81/#2981 |
| KDP Element 真正拥有 PackageSystem、Workflow Runtime/DomainApp 启动；Boot 只作预验+单委托 | **MIGRATION_REQUIRED** | 现有 `bootstrap`/Microkernel 双实现所有权差距；#1668 |
| 作者期 BUILD/composition 执行能力由真实 SDK Package/Element 拥有 | **MIGRATION_REQUIRED** | 与运行期 App 还未构建的自举问题在 #1668 L2 明确 |
| 新 Package kebab-case、Element camelCase/Namespace 独立、自动化合法性 | **MIGRATION_REQUIRED** | Schema/BUILD/Lock/Pin/Consumer 全链迁移和新摘要 |
| 旧 0.11.1 P2 | **KNOWN_NOT_FIXED** | 如真影响产品边界再做定点修复，不冒充已解决 |
| 完整 0.11.x 主线、跨语言单 App/Forge/正式发布 | **NOT_DELIVERED / OUT_OF_SCOPE** | 不能从 0.11.1 资格推断完成 |

## 11. 一次限定 Foundation 重构（不是重做 0.11.1）

**需要进行一次范围明确的结构修正，理由是当前代码与已确定的统一 Package + Element 所有权、最小 Boot 目标有可观察不一致。** 该工作归 **Foundation 0.11.0 / #1668**，受影响的 v0.11.1 SDK/Reference App **增量复验**，而不是将已关闭 0.11.1 T11–T14/R60/R81 全部推倒重写。

推荐先后顺序：

1. 先冻结本文件与 L2 接线：列出 Boot 前验证的最小字段、KDP.Init 的真实可执行 Target、PackageSystem 与 Workflow Engine 的 Element Owner、BUILD 作者期装载的无循环解法。
2. 把独立 Microkernel 实现转为真实 KDP Package 所有的私有源码/选定 Element Function，不删除真正的 XState 能力或重建第二套引擎；压缩 Boot 为预校验/单次调用。
3. 对 BUILD/Contracts/SDK 公共接口明确真实 Package/Element 所有权，进行新 Namespace + camelCase ID 命名迁移；可选 Element/Package 内部多 Element 结构验证，不强制“一 helper 一 Element”。
4. 检查现有 Standard/Business/Reference Manifest/Target/Lock/Pin/WorkflowRoots/资源、直接 Extension；重新封存新字节和生成**新的** AppPackage/Lock Digest。
5. 仅运行真正受影响的正/UNKNOWN/拒绝/致命退出/干净安装 E2E、Typecheck/Lint 和真实必要 CI；独立 Reviewer 复审改动 HEAD。历史 0.11.1 原始 StageIndex 不改写，追加新 Foundation 技术基线收据。

**禁止事项**：不新建第二 KDP、不能把所有私有 helper 元素化、不重做已经合格的 Workflow/Reader 功能、不能引入 Forge/生成器、不能把此修正推给 0.11.2、不因旧 R41 收据留存就保留产品层不规范命名、不得未审即覆盖稳定历史。

## 12. 规范依据、下位文件与变更办法

来源（按后续已确认裁决筛选，不机械继承旧候选）：

- [#1563 R5 Element/Package 组织讨论](https://github.com/kaicreator-mm/domain-harness/issues/1563#issuecomment-7020667768)；[DIS #1496](https://github.com/kaicreator-mm/domain-harness/issues/1496)；[Package #1480](https://github.com/kaicreator-mm/domain-harness/issues/1480)；[Boot/KDP #1484](https://github.com/kaicreator-mm/domain-harness/issues/1484)。
- [v0.11.0 生命周期规范](./DomainHarness_v0.11.0_PACKAGE_CORE_LIFECYCLE_AND_BUILD_SPEC.md)、[#1624 B0](https://github.com/kaicreator-mm/domain-harness/issues/1624)；[KDP/XState Owner 决议](https://github.com/kaicreator-mm/domain-harness/issues/1563#issuecomment-7054968780)。
- [SDK/Package/Forge 边界](./DomainHarness_v0.11.x_SDK_FORGE_ECOSYSTEM_BOOTSTRAP.md)、[多语言单闭包](./DomainHarness_v0.11.x_DOMAIN_HARNESS_SDK_PACKAGE_FILES.md)、[Standard Element 系统](../architecture/DomainHarness_v0.11.x_STANDARD_ELEMENT_SYSTEM.md)。
- [v0.11.1 PRD](../product/DomainHarness_v0.11.1_Task_Execution_PRD.md)、[#1656 R60](https://github.com/kaicreator-mm/domain-harness/issues/1656)、[v0.11.1 事后复盘](../engineering/DOMAIN_HARNESS_V0111_VERSION_RETROSPECTIVE.md)、[Reference StageIndex](../../examples/reference-domain-app/stages.json)。
- [R87 Element/Package 组织分析](./DomainHarness_v0.11.x_ELEMENT_PACKAGE_ORGANIZATION_STANDARD.md)、[命名分析和迁移表](./DomainHarness_v0.11.x_NAMING_STANDARD.md)、[Boot/KDP 源码差距审计](../architecture/DomainHarness_v0.11.x_ELEMENT_FIRST_BOOTSTRAP_OWNERSHIP_REVIEW.md)、[交付质量手册](../engineering/DOMAIN_HARNESS_V011X_DELIVERY_QUALITY_PLAYBOOK.md)。

**维护规则**：以后任何 Product、L2、Build、Agent、PR 想增加基础规范，应**首先修改此一份文件的相关章节**，说明状态由何证据从 CANDIDATE→CONFIRMED 或 MIGRATION_REQUIRED→已实现、受影响 ABI/Schema 与验证范围；其它文档只保留参考链接或具体实现决议。不允许出现另外一份自称“当前唯一规则”且内容相反的基础规范，也不以文档修改等价代码已完成。
