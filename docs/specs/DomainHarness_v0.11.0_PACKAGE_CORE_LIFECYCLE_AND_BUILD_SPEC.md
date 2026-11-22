# DomainHarness v0.11.0 — Package / Core / Extension / BUILD / Init / Exit 统一规范

> **规范入口说明（R88）**：当前 DomainHarness 基础规则的唯一维护入口是 [统一规范](./DOMAIN_HARNESS_CANONICAL_SPEC.md)；本文件保留为历史决议/详细解释/实例或实现证据。如果二者存在冲突，以统一规范中标注的最新 Owner 决议和状态为准，不把本文件旧候选当现行强制 ABI。

> **【R36 Owner 纠正，本文件中所有“必须先生成 Package / 必须经过 BUILD 平台才有 Package”的产品解释均被覆盖】**：Domain Package 是符合 DIS 适用约束 + 本 v0.11.x 当前 Element-First 合同的多文件集合，可由 ChatGPT/开发者直接编写 Manifest、Element、ESM 和资源；无专门生成器、Seed Builder 或独立 Package Assembly 工具前置。应用使用多个现成 Packages 时，仍须对真正使用的声明、直接 Extension、Core.Order、Function/Target、资源摘要/Boot 保持必要验证与拒绝，不能借“取消工具”降低本文件 B-02–B-04 的静态安全性质。后续所有步骤按 [R36](DomainHarness_v0.11.x_SDK_FORGE_ECOSYSTEM_BOOTSTRAP.md) 解释；旧 B-01 的生成器化表述只保留为历史。


> **【R37 0.11.x 活规范与可选验证】** 当前 Package/SDK 规范未完全明确，应根据 **真实多文件 Package、SDK Consumer、正反例** 在 0.11.x 中逐项澄清；已明确且适用的 DIS/Element-First、权限、Target、资源摘要和 Boot 义务继续有效。**不要求 Seed Builder 或特定生成过程**；可以根据实际问题增量编写轻量 Validator 以检查 Package 的规范符合性，**Validator 与 Package 作者/生产方式正交**，未来可复用于 Forge 但不需现在开发 Forge。不得把局部验证 PASS 视作整个 DIS Full Conformance。详见 [R37](DomainHarness_v0.11.x_DOMAIN_HARNESS_SDK_PACKAGE_FILES.md)。


> **【R33 Owner 产品所有权修正；本规范中“BUILD 从生成 Package 到完整 App 组合”的旧表述只保留为历史记录】**：现行跨版本产品边界须以 [DomainHarness SDK / DomainForge Domain App / 自举](DomainHarness_v0.11.x_SDK_FORGE_ECOSYSTEM_BOOTSTRAP.md) 为准。DomainHarness 是 Boot + Domain Packages 的领域 Harness SDK，负责已存在 Package 的最小装配/校验/加载/执行；DomainForge 是基于该 SDK 运行并生产 Domain Package 的 Domain App。原 B-01“单 Package 源码/资源生成必归 Harness BUILD”**不再是当前产品要求**，缺通用 Package 生产器不得强加给 SDK 0.11.0；真实源码重构仍按独立增量验证。原有 Core.Order、直接 Extension、ElementRef/FunctionRef、Init/Exit、可信资源/Pin、未知调用拒绝等基础约束继续有效。完整代码归属见 [R33 审计](../architecture/DomainHarness_v0.11.x_LEGACY_BUILD_OWNERSHIP_AUDIT.md)。


> **2026-11-21 Element-First 基础合同修正（#1624）**：本规范的 Init/Exit 均指`本 Package 拥有的已选 ElementRef`，而不是独立 EntryRef 或裸 ESM 导出。每个 Init/Exit Element 的唯一生命周期 Function/Target 必须在 BUILD 真实选定。0.11.0 Init 已可调用同 Package 或直接声明 Extension 的已选 Function，不依赖 READY 后 App.invoke；DomainAppDescriptor/DomainApp 不再定义业务直接 ingress。标准实现与调用流程见 [B0 基础合同](DomainHarness_v0.11.0_ELEMENT_FIRST_B0_FOUNDATION.md)；此裁决覆盖原候选中一切同名物理入口假设。

> 文档类型：v0.11.0 Product/L2 修订规范（讨论决议整理，docs-only 候选）
>
> 仓库：`kaicreator-mm/domain-harness`；版本开发分支：`version/v0.11.x`
>
> 关联：总控 #1563；版本 #1564；L2 #1574；原 Product PRD `docs/product/DomainHarness_v0.11.0_ELEMENT_FIRST_PRODUCT_PRD_CANDIDATE.md`
>
> 当前状态：`DESIGN_CONSOLIDATED / IMPLEMENTATION_NOT_CLAIMED / REVIEW_PENDING`
>
> 生效规则：本文件在经审核并合入版本分支后，对下文“明确替代”的同范围旧设计具有优先级；不修改已经发生的历史审核/CI/Freeze 事实。本文件不是软件已经实现新合同的证明。

> **Owner 2026-11-21 后续明确裁决（覆盖原 F-01/AC-S08 “InitFrom 必备”表述）**：`Package.Exit` 与 `Package.InitFrom` 都是 Package **自行选择使用**的能力。无 Exit 默认无操作；无 InitFrom 不建立历史数组，不能以它是否存在拒绝构建。若 Package 自行启用 InitFrom，其顺序/重复/激活隔离约束仍严格。KDP 为按实际 Init 进入顺序尝试可选 Exit 保留的最小技术记录，与 Package InitFrom 是不同用途的记录。0.11.1 Workflow 必须由适用 Package 的既有 Init Element **内部启动**，不是 READY 后增加第二个 AppInit/Router；Core.Order 仍是 0.11.0 BUILD/初始化链职责，0.11.1 不重新实现。

## 1. 目标、原则与术语

本规范将 v0.11.0 已讨论的结构与生命周期规则合为一个单一合同：

- 0.11.x 是**完全重写**：不保留 v0.10.x ABI/运行时兼容、旧验证层或功能对等门槛；仅借鉴确实有用的设计意图。
- 一个应用只有一套 `Element → Package → BUILD → Boot → KDP` 体系；不得引入第二个 Kernel、第二套 Package 初始化系统或隐含启动器。
- `Element` 是实现与结构内容的组织单元，含 0..N Functions、Content/资源以及约束；不是按 Skill/Rule/Tool 构造互斥类型枚举。Function 的公开契约与具体实现分离。
- `Package` 是封装和交付单元，可以拥有多个 Element；各 Package 的统一启动入口是自己的 **Init Element**；可选统一退出入口是 **Exit Element**。
- `Core` 是拥有必填 `Order` 并负责向下一 Core 传递启动控制的 Package 角色。KDP 是 `Order=0` 的 Core；其他 Core 的数量与实际名称由 BUILD 选定，不以最初 K/S/B 三层样例硬编码无限制或数量。
- `Extension` 是被某个 Package **直接声明**为依赖的其他 Package，必须通过其公开接口访问。角色或层级相同、间接可达、存在于产物中均不自动取得调用资格。
- `BUILD` 覆盖从生成单个 Package 到组合完整应用 Package 的整个过程；唯一交付结果是目标环境确定、引用闭合、可检查、可安装的确定性产物/Lock。
- `Boot` 位于 Package 体系外，仅负责定位、验证并启动 KDP；不得自行遍历 Core、Extension 或执行业务。
- `KDP` 是唯一生命周期兜底与运行控制权威；只执行已经 BUILD 确定的产物与绑定，不在运行时重新推导依赖图。

这里的 `Init` / `Exit` 指统一的 Package Init/Exit Element 生命周期，不再在其上额外叠一层旧的 `technicalInit` + `Business App Init` 再调用相同初始化。

## 2. Package / Core / Extension 静态合同

**P-01 — Init/Exit**：每个可运行 Package 必须提供一个明确的 Init Element。Exit Element 可缺省；缺省行为等同空操作（no-op），不得导致启动或退出失败。

**P-02 — Order**：Package 可以定义 `Order`；**Core 必须定义 Order**，且为确定性的非负整数。应用的 `Order=0` 必须是唯一 KDP Core；全部 Core.Order 在同一应用内必须唯一。重复、缺少 0、Order 非法或 KDP 不是 0，BUILD 直接失败。Core 按 Order 升序链接，不要求编号连续；Extension 的可选 Order 不替代显式依赖拓扑。

**P-03 — Direct Extension**：每个 Package 必须完整声明它**自己直接调用**的 Extension Package。只允许使用直接声明的 Extension 的已导出 API / Init；不允许依赖的依赖被当作自己的 Extension。若 A→B→C，则 A 可以调用 B 的公开能力，B 可以调用 C，但 A 不得直接获得/调用 C 的 API；B 也不得将 C 的原始调用句柄不受约束地透传给 A 以绕过声明。

**P-04 — Core 链接边**：Core 向 Order 中紧随其后的 Core 发起 Init，是 BUILD 确定的**Core 系统链接边**，不是普通的 Extension API 调用，不要求将下层 Core 伪装成直接 Extension。除此之外，跨 Package API 访问仍受 P-03 约束。

**P-05 — 依赖拓扑**：每个 Core 本层 Extension 的直接依赖形成有限、无环图。BUILD 拒绝依赖环、缺失声明、版本/目标不匹配、重复身份或不可导出的调用。多个直接调用者可以共享同一个 Extension，**不因此自动去重 Init 调用**。

**P-06 — 作用域**：Package 的私有 Element/资源不可因同层、关联 Domain、传递依赖或 Hook 关系而隐式对其他 Package 开放。Hook/公开 Function 与 Extension 直接依赖分别校验，不得让 Hook 充当隐含全局 Service Locator。

## 3. 唯一 BUILD 与静态保证

**B-01 — 构建范围**：BUILD 同时包含 Package 源码/资源生成、单包校验、组合、引用解析、代码生成、静态验证、锁定和目标产物发行；不能把“生成 Package”放在 BUILD 信任边界之外。

**B-02 — 确定性**：BUILD 在明确 Target、已选 Package/Element/Function/资源、版本与内容摘要下生成唯一确定的结构、调用绑定和顺序。BUILD 检查 Core.Order 唯一性、各层依赖拓扑、可调用导出、目标平台、资源闭包和完整性。

**B-03 — 直接调用验证（强制）**：BUILD 必须对 Package 源码及**最终生成代码**做实际静态符号/引用检查，对所有跨 Package import、调用目标、生成绑定与公开句柄逐一确认：
1. 调用者显式声明了该目标为直接 Extension，或者属于唯一受控 Core 链接边；
2. 目标确实选入 Lock，调用的 Function/Init 已公开且版本相符；
3. 所有可达的静态调用和生成中间表示均不包含未声明 Extension 调用；
4. 复查最终打包内容及依赖边，避免生成阶段或打包阶段绕开前述校验。

**B-04 — 不可证明即拒绝**：跨 Package 的反射式查找、任意动态 import、运行时代码求值、未授权重导出/句柄透传、无法解析的原生模块等，若 BUILD 不能证明遵守 P-03，则 BUILD 失败。仅凭 TS 类型检查、Manifest 存在或 grep 扫描，均不得宣称已经完成调用合法性保证。

**B-05 — 运行时边界**：不把上述静态调用图、依赖合法性与版本寻优重新放到运行时检查。Boot 对选定安装记录、Pin、产物完整性进行必要验证仍保留；这与移除旧的**重复业务/依赖图校验**不是同一回事。未声明 Extension 调用若仍异常出现，必须打印可排查的错误并进入 KDP 退出流程，不得继续或悄悄补依赖。

## 4. 唯一 Init 流程：单轮、向下递归

**I-01 — Boot**：Boot 只加载已钉住的 `Order=0` KDP Core 并调用它的 Init 入口；不从 Boot 再运行其他 Core 或 Extension。

**I-02 — Core.Init**：一个 Core 的 Init Element **先依本层直接依赖关系**调用所需 Extension.Init，等待相应初始化调用完成，然后通过 BUILD 确定的固定 Core 链接调用**下一个** Order 的 Core.Init。最后一个 Core 不继续调用任何 Core。Core 自己的内部初始化逻辑由该 Package 定义，但在调用下层 Core 前必须满足自身直接依赖的初始化要求。

**I-03 — Extension.Init**：Extension.Init 只递归调用**自己直接声明**的 Extension 的 Init，不能越过直接依赖调用祖孙 Extension，也不能擅自驱动另一个 Core 的启动链。

**I-04 — 单轮含义**：Init 仅有这**一轮向下传播**，不存在完成最后一个 Core 后再由大到小执行第二遍 Init，也不存在 KDP 对同一链再执行一个全局 Init 循环。普通递归的函数返回不是第二轮 Init，亦不触发 Exit。

**I-05 — 重复初始化**：某个 Package 被多个依赖者调用时，Init Element 可以多次进入。**Package 自己决定**是否真正重做初始化、怎样实现幂等或缓存；KDP/Kernel 不做全局 Init 去重，也不得强制一个 Package 在一次应用激活中只执行一次。

**I-06 — Workflow 启动归属**：如果 Package 声明启动业务 Workflow，该启动行为**就在本 Package 的现有 Init Element 内执行**，并遵守已构建的直接 Extension 调用与 Init 顺序；不得在 READY 后再添加一个同名 Init Router、重叠的 Business App Init 或第二轮启动。**0.11.1 的规范业务链为 Init → Workflow → Function**；普通 Element Function 依然作为 Workflow 内的具名选定能力调用，不将已有旧版直接 ingress 强加为新规范的必备入口。0.11.0 不提供 Workflow 执行引擎，不提前实现它。

**I-07 — 无公开 next()**：不要求 Package 公共 API 提供 `next()`；Core 对下一 Core 的调用通过 BUILD 已确定的受控绑定完成。不得让 Package 运行时发现下一个 Core。

最小示例（同一个 Extension C 可被多次调用，次数完全可见）：

    Boot → KDP(Order 0).Init
      ├─ A.Init → C.Init
      ├─ B.Init → C.Init
      └─ SDK Core(Order 1).Init
           ├─ D.Init
           └─ Business Core(Order 2).Init
                └─ E.Init
    → 初始化调用链完成 → 应用运行

示例表达依赖调用关系，不规定 Package 内部必须以该文本顺序书写业务代码；具体同层分支次序由 BUILD 固定。即使 C 自己对第二次 Init 做 no-op，调用仍然发生。

## 5. Package.InitFrom（可选的调用来源记录）

**F-01 — 结构（可选）**：每个 Package **自行决定是否提供/使用**名为 `InitFrom` 的运行时数组；未选择时不必创建、维护或导出该数组，也不因此 BUILD 失败。若选择提供，它记录该 Package Init Element **每次被直接调用的调用者**，按实际进入顺序依次追加。

**F-02 — 调用者身份（仅对启用 InitFrom 的 Package）**：Boot 启动 KDP 时记录 `Boot`；Package 调用其他 Package.Init 时记录 BUILD Lock 中唯一、稳定的调用方 Package 标识。Core 系统链接调用下一 Core 时记录真实调用者 Core。只记录**直接**调用者，不伪造完整祖先链。

**F-03 — 保留重复与失败（启用时）**：启用 InitFrom 的 Package 每次真正进入 Init 调用入口**之前**写入一条；相同调用者重复调用须重复追加，即使本 Package 选择不重做初始化或 Init 后续抛出异常亦保留记录，不得用 Set、去重表替代。**未启用者无此记录要求**。

**F-04 — 激活隔离（启用时）**：InitFrom 隶属于本次 App 激活的 Package 运行时实例；不同激活不得复用同一可变数组。BUILD Manifest 不填写静态调用历史；是否启用由 Package 声明/实现决定，BUILD 不因此强制所有 Package 创建它。

**F-05 — 不产生授权**：若提供 InitFrom，它只是 Package 自行选择的调用来源历史，不充当权限表、依赖声明、调度指令、Init 去重依据或 Exit 判定依据；**KDP 为执行可选 Exit 所需的最小真实 Init 进入记录是独立的系统技术记录，不依赖 Package 是否启用了 InitFrom**。

示例：

    A → C.Init
    B → C.Init
    A → C.Init

    C.InitFrom = [
      { type: "Package", packageId: "A" },
      { type: "Package", packageId: "B" },
      { type: "Package", packageId: "A" }
    ]

上例**仅表示主动选择 InitFrom 的 Package** 的行为；未启用的 Package 可以完全没有该数组。对启用者，数组语义、顺序与重复保留依然严格。

## 6. Exit：只在退出时逆序执行

**E-01 — 触发时机**：正常关闭应用/程序、或者发生**未处理异常**并进入全局退出流程时，KDP 负责调用 Exit；不是在 Init 递归返回时触发，也不在所有 Core.Init 完成时立即触发。

**E-02 — 次序**：KDP 维护最小实际 Init 进入记录，在退出时由**最深、最后进入**的 Init 调用向外逆序尝试相应 Package.Exit；由此自然得到先下层 Core、后上层 Core，且同层依赖调用遵守实际逆序。只按静态 Core.Order 逆序是不够的，尤其在共享依赖或 Init 中途失败时。

**E-03 — 重入与次数**：Exit Element 本身**完全由 Package 决定是否提供**，无 Exit 的 Package 没有实际 Exit 行为（等价 no-op），无需附加代码。对于已有 Exit 的 Package，KDP 按自己的实际 Init 进入技术记录安排退出尝试；是否对重复退出执行清理/no-op/拒绝由 Package 自治；**与是否启用 InitFrom 无关**。

**E-04 — 异常中途退出**：如 Init 中途出现未被 Package 自己处理的异常，KDP 仅对实际进入过 Init 的 Package 执行逆序退出，不对从未启动的 Package 制造 Exit 调用。清理失败不得阻断其余 Package 的退出尝试。

**E-05 — 故障边界**：Package 的 Element 自己处理其内部错误；仅未处理异常交给 KDP 最后兜底。KDP 打印可执行的诊断（Package 身份、阶段、错误类别、必要原因），隐藏凭据与敏感数据，并继续退出；不得静默吞错或返回假 READY。强制 kill/断电等无法捕获的终止情形不保证执行 Exit。

## 7. 与旧 v0.11.0 合同/实现的精确差异

| 旧设计或现状 | 新规范处置 |
| --- | --- |
| 固定 K/S/B 各一个 Primary，代码按 `layer/role` 管理 | 保留 K/S/B 作为初始领域职责示例；核心启动序列以必填 `Core.Order` 为权威，不得把三层数量硬编码为普遍规则；L2 Schema 需明确 Core 与原 Primary 的映射 |
| `technicalInit` / `technicalDispose` 入口 | 统一为 Package Init Element / 可选 Exit Element，不保留两套并行调用 |
| KDP 循环执行全局 `technicalInitOrder` | 改为 Boot→KDP(Order0).Init→本层依赖递归→下一 Core.Init；可在 Lock 保留只读编译计划作诊断，但不得执行第二轮 Init |
| `technicalDisposeOrder` 静态逆序 | 正常退出/未处理异常时按实际 Init 进入记录逆序 Exit，支持部分启动失败 |
| 单独在技术初始化之后触发 `businessAppInit` | 不能再触发重叠的第二轮初始化；必要业务启动并入选定 Business Package.Init 行为，L2 更新对应选定元数据 |
| `dependsOn` 形成可传递引用闭包 | 安装/打包闭包可以传递；**调用授权**严格只有每个 Package 自己直接声明的 Extension |
| Kernel 统一 Init 去重/重复验证（如存在） | 去掉：Package 自己决定重复 Init；运行时不重复静态依赖合法性检查 |
| 包含旧 Runtime/兼容入口的实现 | 不为 v0.10.x 建兼容；可复用的无业务旧加载辅助抽取为当前架构工具函数，不保留第二个 Runtime |

与原 v0.11.0 PRD 的 Element 组织、确定性 BUILD、唯一 Boot/KDP、完整性 Pin、独立安装 SDK、业务私有权属等**不冲突条款继续有效**。这份文档不声称已经修改现有 TypeScript 接口、实现、测试、Lock 或 CI。

## 8. 最小可证伪验收矩阵（交由后续源码任务执行）

| 编号 | 验收条件 |
| --- | --- |
| AC-S01 | Boot 只启动唯一 KDP / Order 0；Core.Order 缺失、重复、非法或错位时 BUILD 失败 |
| AC-S02 | 两个及以上 Core 不要求连续 Order，但必须按升序连接；不存在公开 next() 和第二轮 Init |
| AC-S03 | Core.Init 先执行本层直接依赖 Init，再调用下一 Core.Init |
| AC-S04 | Extension.Init 仅调用自己的直接 Extension.Init；跨级直接调用 BUILD 拒绝 |
| AC-S05 | A→B→C 中 A 直接调用 C 被拒绝；B 合法封装自己的业务 API 仍可通过，原始 C 句柄透传被拒绝 |
| AC-S06 | 生成阶段注入未声明调用或动态未知目标，最终 BUILD 失败；不只检查源 Manifest |
| AC-S07 | 同一个 Extension 被多个 Package 调用时调用保留，不由 KDP 去重 |
| AC-S08 | 选择启用 `InitFrom` 的 Package 具备顺序、重复、调用前写入、失败保留与激活隔离；未启用的 Package 无需定义该数组且不影响 Init/可选 Exit 正常运行 |
| AC-S09 | Init 正常递归返回不调用 Exit；应用正常退出时逆序 Exit |
| AC-S10 | Init 中途失败只逆序清理已进入项；某个 Exit 抛错不阻断后续退出 |
| AC-S11 | 无 Exit Element 等同 no-op；Package 内部可处理异常不强行退出，未处理异常进入 KDP 退出 |
| AC-S12 | Runtime 无二次 BUILD、动态扩展发现或旧静态依赖图重验；Boot 仍校验可信 Pin/产物完整性 |
| AC-S13 | 错误日志可定位 Package/调用/阶段，且不泄漏秘密；无旧 ABI / 第二个 Init/Dispose Engine |
| AC-S14 | 单一确定性 BUILD 输出包含已选 Package/Element/资源/目标/受控调用绑定，并可以独立安装运行 |

## 9. 变更边界、实施状态与待编码细节

- **这次仅固化设计**，不修改任何生产、测试、CI 或 BUILD 实现，不宣称新规范已满足 AC-S01–S14。
- 未来 L2/实施需要将 `Core.Order`、Extension 显式声明、Init/可选 Exit Element、**可选的** `InitFrom` 运行时访问方式和 Lock 绑定编码为可运行接口；正式命名、JSON Schema、错误码及精确调用日志形式必须与本规范语义一致。
- 必须通过单一 BUILD 对最终代码做真实静态校验；如果目标语言/模块机制无法静态证明合法，则限制该机制或拒绝 BUILD，不能降低要求。
- 原 #1564/#1574 的历史 Freeze、已通过的限定 CI 与 Demo 不被倒改；但那些证据**不能**自动证明此新合同已经实现。以新增规范的后续代码增量审核、实际测试和最终统一 0.11.x Release 判断实际完成程度。
- 0.11.1+ 的 Workflow、Task Loop、文件 Reader、Guard/Outcome、Hook/Actor 等各有版本范围；不因本规范而提前迁入 0.11.0。

## 10. 决议来源与明确排除的旧建议

此规范汇总 DH_0.11.0 项目讨论中已经明确的用户决议：BUILD 包含 Package 生成与组合；仅直接 Extension；Core 必填唯一 Order 且 0 为 KDP；Core.Init 本层依赖先行、然后下一 Core；Extension.Init 只递归自己的直接依赖；Init 只有向下一轮；去重归 Package；Exit 可选，退出时仅对提供 Exit 的 Package 从深到浅尝试；**InitFrom 由 Package 自行决定是否启用**，启用者按真实调用进入顺序记录，允许重复。

**被明确排除**：运行时强制每 Package 只 Init 一次、额外逆向 Init、初始化递归返回即 Exit、公开 `next()` 是必要 API、KDP 再循环初始化所有 Core、以传递依赖替代 Extension 声明、将运行期旧静态依赖校验作为 BUILD 不完整的补丁、自动沿用 v0.10.x 兼容层。
