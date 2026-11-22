# DomainHarness · 总体架构、模块归属与最小 Boot

> **权威**：本文件是 [DomainHarness 规范集](./README.md) 的组成模块；所有模块共同构成**一套**规范，不是独立规范版本。
> **状态**：`CONFIRMED`=已确定原则；`MIGRATION_REQUIRED`=目标明确但机器合同/源码未迁移；`CANDIDATE`=待决策。不得从规范条款推导源码或 CI 已 PASS。
> **条款编号**：保留原 R90 单文件规范的编号以便 GitHub Issue、Review 和旧链接溯源；跨文件引用以目录索引为准。

本模块定义系统拓扑、依赖方向、可信边界和架构审核不变量。当前 KDP 实现所有权和 Boot 单委托是 #1668 的 MIGRATION_REQUIRED，不是已经通过的源码事实。

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

## 5. 最小 Boot、自举和 KDP 所有权 — CONFIRMED 方向 / MIGRATION_REQUIRED 实现

**最小且唯一可在 Package 外的可信入口 Boot**，职责仅是：读取必要的受信安装/入口锚点，验证 Pin/Lock/唯一 KDP 入口身份与执行前字节完整性/Target，解析并调用**一次已选、已验证的 KDP Init Element Function**。验证依赖的本地读取/哈希/路径基础工具可以留在 Boot，但 Boot 不得执行任何域业务或建立第二套运行控制权。

以下全部须由**真实 KDP Kernel Package 的内聚 Elements + 所属私有实现**拥有：
- PackageSystem、受选 Core/Extension 的 Init/Exit、运行控制权威、DomainApp 生命周期与状态。
- 通用 Workflow/StateMachine、XState Actor 与有界执行机制；**Owner 的后期 KDP 裁决**覆盖早期让每个 Business Package 自建通用 Workflow Engine 的建议。
- 必须的运行时已选 Function/资源/Hook 绑定及最后的异常/Exit 兜底；具体业务 Rule/Guard/State/Workflow Content 归各自 Standard/Business Element，不硬编码进 Kernel。

**严格 Boot 禁区**：遍历业务 Package DAG、创建 PackageSystem、运行 Workflow/Actor/Task、解释规则、裁定 READY/DEGRADED/BLOCKED/FAILED、业务 Function 路由、执行业务 Init、调用第二次 App Init、组织 Exit 或在线重新 BUILD。

**当前具体差距（MIGRATION_REQUIRED）**：参考 KDP 的 `r41-kdp/dist/bootstrap.js` 仅 re-export `@kaicreator/domain-harness-microkernel.bootstrap`，`dist/index.mjs` 中 KDP Init Element 只做事件及下层转调；真正应用初始化/PackageSystem/Actor 在 `packages/microkernel/src/kdp.ts` 等模块。应迁移**实现所有权**和 Boot 单委托调用链，不能只改名字/目录。任何 KDP 入口在被可信 Boot 校验前不得 import 或执行；KDP 自验本身不允许替换执行前 Pin 检查。

**自举说明**：Element 化不等于每个私有 TypeScript helper、type 或 ESM 文件都要成为 Element。只需确保所有可公开执行/组合的能力属于真正的 Package/Element，内部源码可以分多个私有文件；不存在长期的“Microkernel 作为第二 Runtime”架构层。
