# DomainHarness v0.11.x · Kernel Package 真正自举与统一身份迁移 L2 接线方案

> **归口**：Foundation Issue [#1668](https://github.com/kaicreator-mm/domain-harness/issues/1668)，不是 v0.11.2 功能。**状态：R107 ACCEPT_L2_SCOPED（设计范围 P0/P1=0）；源码实施与验收未完成**。本文件是具体实施细节，不是第二套规范。权威规范以 [目录](../specs/domain-harness/README.md)、[核心](../specs/domain-harness/core.md)、[架构](../specs/domain-harness/architecture.md)、[对象](../specs/domain-harness/element-package.md)、[生命周期](../specs/domain-harness/lifecycle-workflow.md)、[身份](../specs/domain-harness/identity-naming.md) 和 [信任](../specs/domain-harness/composition-trust.md) 为准。

## R118. Owner 职责裁决：生成期负责 Package/Element 正确性，SDK 只做最小兜底

> 本条按 CORE-11 和 composition-trust.md 为准，优先于本文件 R107 中任何暗示运行时重新验证静态依赖正确性的措辞。旧 PR #1675 的 Runtime ESM lexer 修补路线不合格，已关闭且没有合并。

1. **生成期正确性**：由 Package/Element 作者（人、LLM、Agent、未来 Forge）与其生成/修改流程负责 Schema、依赖、Function、Target、静态代码和测试的正确性及可信证据；Package 是可直接编写的文件集合，不强制生成器或额外 SDK 扩展。
2. **组合/交付期职责**：消费合格产物，执行必要的目标选择、技术一致性校验及确定性 Lock/Pin/安装封存；这些动作不把领域/代码正确性责任转给 SDK。Lock/Record/Pin 的自摘要只能证明其自身一致性，无法单独认证生成者，必要受信发行/安装来源须由交付侧提供。
3. **运行期仅兜底**：Boot 在可信安装/发行锚点下核对已封存身份、必要字节与受选 KDP 入口，并最小委托真实 KDP.Init；KDP 负责已选调用、错误和 Exit。**禁止** SDK 运行时解析 JS/ESM 语法、重新求静态依赖图、证明 Domain Package/Element 的正确性；不能用运行时 lexer/AST 试图修复不可信交付。
4. **测试分层**：生成期负例覆盖动态 import、反射代码加载、未声明依赖、错误 Owner/Target、错误封存等；SDK 运行时负例验证可信来源、Pin/Lock/选定资源完整性、不匹配拒绝及最后异常处理。若需要保证完整 ESM 依赖图，该证明必须在生成/发行侧完成并具有真实来源绑定，Boot 只能消费证据，不做二次源码审核。
5. **解释优先级**：下文 L2 中“Boot 导入前验证整个 KDP 闭包”应仅解释为在受信生成/安装证据下的字节完整性核验，不是运行时对代码或静态图的正确性证明。未发布 0.11.x 不保留旧 ABI 兼容；真实源码、CI、非 Writer 审核继续在 Foundation #1668 完成，不推给 0.11.2。

---
## A1. 真实所有权审计

| 当前真实源码 | 当前代码作用 | 目标逻辑 Owner / Element | 必须删除的重复入口 |
|---|---|---|---|
| `packages/microkernel/src/boot.ts`, `verify.ts` 中的执行前验证 | 信任锚点→Pin/Lock/KDP 字节→动态导入 | Package 外**唯一**极薄可信 Boot，只有验证和交接；校验 helper 不强制 Element 化 | 不允许调度 Core/Workflow 或创建 DomainApp |
| `packages/microkernel/src/kdp.ts` | 目前 `bootstrap(context)` 实际创建 PackageSystem、Hook、App、Exit | 真正的 KDP Kernel Package 内 **kernelLifecycle Init Element** 的私有实现 | 不得再存在独立于 KDP.Init 的 App 初始化过程 |
| `package-system.ts`、`selected-function.ts`、`workflow-run.ts`、`workflow-execution.ts`、`domain-app.ts`、`process-exit.ts` | 已选 Function、Core/Extension Init/Exit、Workflow Actor、App 生命周期 | KDP Kernel Package 所属的内聚 runtime/lifecycle/workflow Elements；可共用私有 TS 源，不要求一文件一 Element | 禁止第二套 Loader/Actor/状态引擎 |
| `tooling/build/src/build.ts`、`static-package-guard.ts`、`app-package.ts`、`graph.ts` 和 `packages/domain-harness/src/composition.ts` | 现有作者期源码混合生成期静态验证、App 组合与 Lock/Pin 封存 | 生成期正确性验证归 Package/Element 作者；已安装 SDK 的 **authoring Composition Package/Element** 只负责 App 选型、组合、封存，公共 SDK /composition 为装载适配器 | 不引入要求待生成 App 先 Boot 的循环或额外强制生成/组合服务 |
| `packages/contracts/src/*`、JSON Schema 与验证 helper | 可共享定义/静态规则 | SDK 内 Contracts 归属；类型/静态纯函数可为普通私有源码，不要求每个 type/helper 单独 Element | 禁止裸公共命令绕过已选 Function/Target |
| `examples/reference-domain-app/packages/r41-kdp/dist/bootstrap.js` 与 `dist/index.mjs` | 前者重新导出 SDK microkernel.bootstrap；后者空壳 KDP.Init 只记日志/转调用 | KDP 唯一**受选** Init Function 及其真实实现 | 删除双层 bootstrap→runInit→再次 KDP.Init 的路径 |
| Standard JSON/YAML 与 Business Rule | 真实业务 Function 与 Domain Content | 各自标准/业务 Package 的内聚 Element | 不吸收到 KDP 硬编码业务 Engine |

**审计结论**：物理 npm workspace/内部源码目录可以继续存在用于编译与发行，但 Kernel 可执行权威必须由**真实 KDP Package/Element 的选定 Target**拥有。仅重命名、加 Manifest 壳或让 `dist/index.mjs` 再次 re-export `bootstrap` 都不能验收。

## A2. 唯一安全启动与单轮 Init：需冻结的 KDP 具体调用 ABI

```text
已安装 App 的 Host
    │ boot(pin, context)             [唯一对外公开启动函数]
    ▼
可信 Boot
    │ 安装记录、Pin/Lock、Target、KDP FunctionRef/ResourceRef/闭包字节校验
    │ 任何拒绝发生在执行 KDP 模块之前
    ▼
选定 KDP Kernel Package 的 kernelLifecycle.init(context)
    │ 创建唯一 PackageSystem / Workflow Actor 权威
    │ 记录“Boot 已实际进入 KDP.Init”及有序 Exit 历史
    │ 依直接 Extension 声明调用 KDP 本层 Extension.Init
    ▼
后续 Core.Order（所有 Core.Order 不重复、>0）
    │ Core.Init→声明的 Extension.Init→下一 Core.Init
    ▼
Business Package.Init 运行其已选 Workflow / Function
    ▼
AppStatus / DomainApp
    │ 应用正常终止或最后兜底不可恢复异常
    ▼
KDP 反向按真实已进入列表尝试 Exit（KDP Exit 最后）
```

关键机制选择与可证伪边界：

1. **KDP.Init 只进入一次**：当前 `PackageSystem.runInit()` 默认从 `coreOrder[0]` 开始再调用 KDP.Init。迁移后必须拆出内部 `runRemainingCoresAfterKernelEntered()` / 同等无环内部机制，初始记录 KDP 已进入，执行**KDP 本层显式 Extension**后进入下一 Core，不准反向重入 KDP.Init。不可凭全局 `once` 集合偷偷消除 Package 自主的多次 Init。
2. **输入/输出的 ABI 门禁**：现有 `BootstrapPin.kdpPrimaryEntry:'bootstrap'` 和 `KdpBootstrapResult` 是特殊 Host 启动合同；目标 Boot 必须精确绑定**真实 KDP ElementRef + FunctionRef + Target ResourceRef**。KDP.Init 是实际 Kernel 入口，不能只改 exportName 字符串。针对 Boot Result / 普通 Package Init Result 之间的返回类型差异，L2 必须确定可检查的 KDP 专用入口签名或明确的已选适配结构；不能伪造一个返回 `SUCCEEDED` 的空壳 Function。
3. **信任顺序**：Pin/安装记录在可信范围内形成一致性证明，Lock/闭包与 KDP 入口资源在**import 求值前**进行摘要检查。运行时可再验证其它受选字节与脚本/依赖 SRI，绝不能让未被验证的 KDP 先 import 后自检。任何 TOCTOU 风险需要明确是受控安装快照还是限定 Threat Model，不声称任意本地敌对进程可完全隔离。
4. **退出安全**：KDP Init 进入历史必须恰好一条且在最先记录；Extension 重复由 Package 自治，Exit 用真实进入记录逆序；前序 Init 抛错也清理已经进入者，Exit 自身失败不吞掉根失败，不承诺强杀会执行 Exit。
5. **Effect 和 SDK**：HostPort、FunctionRef、资源仍来自选定 Lock；不能因将 Kernel 源码移至 KDP 包而自动开放文件/网络权限，所有 Business 无隐式内核能力。
6. **物理发行**：可把 KDP Kernel 实现源码编译或 bundle 为 KDP 所有的 ESM Target，依赖显式版本和可信 SRI 封存；新 KDP 的生成期静态准入和运行期最小加载兜底应针对可信 Kernel Profile 分别定义，不允许借此将任意未声明或恶意 Business Source 排除在校验外。

### A2.1 KDP Init Host ABI：R107 已接受的具体实施合同（源码未实现）

**约束**：不新增第二种 Element 根类型，也不允许 Host 通过普通 `DomainApp.invoke` 或不受选的公共 `bootstrap` 绕过 Pin。唯一合法 Host 入口仍是 `boot(pin, context)`，其中 `pin` 只定位**唯一已选**的 KDP Init Function，而不是自由指定一个 JavaScript export。

1. **身份绑定提案**：将当前 `BootstrapKdpRef` / `BootstrapPin` / `InstalledRecord` 的 `kdpPrimaryEntry:'bootstrap'` 替换成显式的 `kdpInitFunction: FunctionRef`，并在 Lock 已选 Function 中唯一确定其 `ImplementationLocator`（module `ResourceRef` + `exportName`）。Boot 校验 `coreOrder[0]` 为唯一 KDP、`SelectedPackage.init` 与 `SelectedPackage.initFunction` 同时匹配、所选 `SelectedFunction.ref` 与 Pin 精确匹配，入口 module 的真实字节摘要与 Lock、可信安装记录一致。不能另存一份可自行偏离 Lock 的“bootstrap target”；现行 `kdpPrimaryDigest` 应迁移为该已选 Target 的可核验字节绑定，字段最终命名由机器合同审查确认。
2. **特殊 Host ABI 而非第二 Init**：受信 Boot 对此**唯一** FunctionRef 使用 `KdpHostInit(context: KdpBootstrapContext): Promise<KdpBootstrapResult>` 调用约定，返回 `BOOTED|FAILED`；`REFUSED` 只由导入前的 Boot 前置检查产生。KDP Init 负责创建 `DomainApp`，该对象是 Host 进程内句柄，**不是 JSON Content、普通 `FunctionOutcome` 或可由 Business 通过 `ReadonlyFunctionHandle.invoke` 调用的函数结果**。普通 Package.Init 继续接受受限 `PackageInitContext`、返回其 `AppInitResult`；二者由唯一 KDP 身份和生成期已证明、组合期封存的 Lock Init 绑定明确区分，不能把 KDP Host ABI 自动开放给任意 Package。
3. **校验时序提案**：`readTrustedRecord → pin/record 一致 → Lock 签定/摘要/Target → selected KDP package/init FunctionRef/Target 映射 → KDP ESM 导入闭包真实字节验证 → import + 调用`。相同原始字节须绑定 Pin、SelectedFunction.implementation、ResourceDigests；若 KDP 首次模块求值之前有未验证的静态依赖或宿主级副作用，仍是拒绝，不能通过“随后由 KDP 自检”补票。真实文件的并发替换只能在明确受控安装快照/威胁模型中作有限承诺。
4. **不递归 Init 的责任边界**：KDP.Init 进入时由 KDP 创建一次激活的 PackageSystem/Exit 历史，并将 KDP 自身的进入事件记录**恰好一次**；内部调用“从已进入的 Kernel 继续”流程，先处理 KDP 声明的直接 Extension.Init，再按 Core.Order 进入下一个 Core，不能重新从 `coreOrder[0]` 执行 KDP.Init。Extension 的多次调用仍由各 Package 自治；有环直接失败。Kernel Init 早期失败（包括尚未完整构造 PackageSystem）仍必须尽可能执行已进入的 KDP.Exit，保留首个错误，清理失败只附加脱敏诊断。
5. **兼容和静态 Profile**：此为尚未发布的 0.11.x 内部 ABI 迁移，不维持旧 `bootstrap` 兼容入口；`kdp-host-init/1` 是**必需的机器判别字段**，只能绑定唯一受选 KDP Init，而不是新建公共可调用 Function 类别。Target 导入闭包的 Node 内建模块与受限 SDK 可信依赖须有显式 Kernel Profile 的封存/准入规则；不得直接豁免 Business 的静态 ESM/Effect 检查。

**R107 已裁决**：必须采用特殊 `invocationAbi:'kdp-host-init/1'` 的机器判别联合，禁止只凭唯一 FunctionRef 推断 Host ABI。其具体字段、选定 Lock/Pin/Record 一致性和禁止 JSON FunctionOutcome 假冒 Host Result 以 R103-P1-01 为准。

## A3. 作者期 Composition 不是 Domain App Runtime 的第二入口

- 已安装 SDK 的 `/composition` **可以在待生成 App 尚无 Lock/KDP 时调用**；它由 SDK 自身的作者期 Package + Composition Element 拥有 `buildApp` 及必要的选型、组合和封存算法，但不对 Package/Element 静态正确性负责。物理 TypeScript 公共 facade 可以作为导出适配器，但必须可追溯到已安装 SDK 的真实拥有者、源码/目标签名和受审 Package 版本。
- 组合已有 Package 文件时按直接 Extension、Element Owner、可见性、目标实现和资源闭包进行静态验证；先完成结果确定性，再发行 Lock/Pin。不能添加 “Generator/Forge/Assembly 服务”作为 Package 形成的必经流程；任何人/Agent 都可直接写符合规范的文件。
- 作者期 Composer 被调用时不能获得待生成 App 的运行时 Function/Host 权限，也不能执行任意 Package 的 Init/Exit；将现有 `tooling/build` 嵌入唯一 SDK 是打包结构，不等于自动满足真正的 Package+Element 所有权。

## A4. 命名与 ABI 迁移策略（Foundation 单一真实迁移，不做兼容桥）

- Package：稳定 `kebab-case`，KDP 候选 `dh-kernel`；Element Definition ID：变量风格 `camelCase`，如 `kernelLifecycle`；`namespace` 独立字段。新名称和 TypeScript API /文件命名必须分别按 [身份规范](../specs/domain-harness/identity-naming.md) 核对。
- **先以独立 L2 测试决定身份唯一键**，再统一更改 `ElementDefinition`、Schema、`elementNamespace()`、ElementRef、FunctionRef、Manifest、Target/Lock/Pin、Catalog、Consumer 与实际安装验证。新对象的所有真实摘要重新计算；不能靠全局字符串替换更改历史被审证据。
- 旧 r41/r60、点分 ID 和 R72/R81/R83/R84 仍在**历史原 Commit/Receipt**。新 Foundation Baseline 用新 Source SHA/CI/Review/锁摘要独立归档；不需要为未发布的 0.11.x 保留旧 Runtime ABI。

### A4.1 Namespace 与目标绑定：R107 已接受的复合键合同（源码未实现）

现行 `ElementRef` 已有独立的 `namespace/id/version/digest`；缺口主要在 `ElementDefinition.id`、`ElementEntry.id` 与 `ImplementationBinding.elementId` 没有完整显式命名空间，当前 App 组合实现仍从点分 ID 推导。新规范不应只在 Definition 上加一个字段，却继续使用模糊的 Target 绑定。

- **机器格式候选**：`ElementDefinition.namespace`、`ElementEntry.namespace`、`ImplementationBinding.elementNamespace` 均显式存在；Definition/Manifest/Binding/ElementRef 中的 `namespace + id` 必须逐字段一致。Element.id 只接受 camelCase；Package.id 只接受 kebab-case；不能以拼接字符串或文件名猜 Namespace。
- **选定身份键候选**：用于同一 App 已选图校验的语义键为 `namespace + id + version`，内容权威还包括 `digest` 和明确的 `ownerPackageId`。同一语义键出现两个互相冲突的 Definition Digest 或 Owner 时 fail-closed；跨 Package 访问仍必须通过直接 Extension、真实 Export/Import 与受选 FunctionRef，不因 Namespace 相同就获授权。ElementRef 已带 Digest，不能在签定 Lock 之后按最新版本替换。
- **增量改动路径**：先更新 Contracts/JSON Schemas/生成期验证与 App 组合封存，次更新 Source Manifest 与 Target Binding，再更新 Lock/Pin/真实安装、Standard Catalog 与 Reference/第二 Consumer；所有 Definition/Manifest/ESM/Lock/Pin 的实物 Digest 都按**新字节**重新封存。旧 R41/R60 历史证据及其 StageIndex 原封不动，新的 StageIndex 明确引用新树与 E2E 结论。
- **必须有的拒绝用例**：ElementRef.namespace 与 Definition 不同；两个 Package 声明冲突的 `namespace/id/version`；Binding 缺 Namespace 或绑错 Owner；旧点分 ID 混用新字段；旧 Digest 的新 Manifest；假造相同 Namespace 的跨包未授权 Function 调用；错 Target/Profile/SRI；已选择却未封存 KDP Init Target。不得仅以 TypeScript 字段存在证明 生成/封存期与 Runtime 已拒绝。

## A5. 实施切片与最低验收

| 阶段 | 修改目标 | 必要的客观证明 |
|---|---|---|
| **L2-0 冻结** | 本文 A1–A4 + 当前规范 §A/§2–§7；先审 Trust/特殊 KDP Init 返回 ABI | Owner/非 Writer 设计审查签收，P0/P1=0 |
| **L2-1 Contracts/生成与封存/身份** | 新 SchemaVersion、Namespace 复合键、唯一 Host invocationAbi、生成期静态闭包证明、Lock/Pin/Record 可信封存 | 错 Owner/Digest/ABI、旧点分 ID、动态加载由生成期拒绝；错误封存由 App 组合/交付期拒绝；不得以旧样例可执行冒充新 ABI PASS |
| **L2-2 Kernel 自举** | 唯一 Boot → 真实 KDP.Init；导入前整个 KDP 模块闭包核验；单次 Init/Exit | 未验证入口或传递依赖绝不执行、Core.Order 0 单次进入、Extension 权限/顺序、逆序 Exit、提前失败 |
| **L2-3 Composition 归属** | 唯一 SDK 作者期组合 Package/Element、与运行期权限隔离 | 未启动新 App 也能组合与封存已合格 Package；不执行候选 Init，不拥有领域正确性证明职责，无第二套组合机制 |
| **L2-4 综合归档** | 已有 v0.11.1 Task/Workflow/Standard JSON/YAML/Reference App 增量复验 | Node >=22.12，必要 POS/NEG/UNKNOWN/失败/Exit/真实 clean-install，非 Writer Exact-SHA 审核，旧 StageIndex 永不重写 |

**不能作为完成的证据**：单纯 Markdown、空 KDP.Init 壳、仅 TypeScript 编译通过、未实际受选的演示 Resource、重用旧 SHA 的 CI SUCCESS、作者自己声称的“独立审核”。

## 不在本次范围

不更改 0.11.2 工作集；不重新开发已受限验收的 T11–T14/Reader/Workflow；不创建第二个 Kernel/Forge；不做 0.10.x 兼容；不对任意恶意 JS/多语言单 App 提供新承诺；不添加未经真实需求支持的应用配置或远程服务。

**执行入口**：全部规范切片完成后，#1668 的 A6/A7 才能从 `MIGRATION_REQUIRED` 改为有来源、有证据的接受状态。

## R103. R102 设计 P1 完整修正（仍须独立审查，不是已发布机器 ABI）

> R102 独立结论：[REWORK_L2，P0=0/P1=5/P2=2](https://github.com/kaicreator-mm/domain-harness/issues/1668#issuecomment-7083691835)。本节对 A2.1/A3/A4.1 的开放问题提出**确定的 L2 选择**，取代其“审查决定”措辞；待另一对话非 Writer 与 Owner 确认后才成为 frozen implementation contract。单一规范目录仍是权威；此处只定义按其要求落地的具体 ABI/实施路径。

### R103-P1-01：唯一 KDP Host Init 的封闭机读 ABI

1. 新增唯一特权 ABI 字面值 `kdp-host-init/1`。机器合同中 `FunctionContract` 使用判别联合：普通 Function 保留 `inputSchemaRef/outputSchemaRef/outcomes/effects` JSON 契约；**仅** KDP 的 `init` 使用特殊分支 `{id:'init',contractVersion:'1',invocationAbi:'kdp-host-init/1'}`，且**不包含/不假称** JSON Schema 能描述 Host 进程内 `DomainApp` 句柄。普通 Package.Init 仍按已受审 `PackageInitContext -> AppInitResult`，普通业务 Function 仍按 `FunctionOutcome`；任何其它 Function 声明此特殊 ABI 均由 生成期拒绝。
2. `ImplementationBinding.invocationAbi` 和 `SelectedFunction.invocationAbi` 仅对该特殊 KDP Init 为必填且精确等于 `kdp-host-init/1`，其它函数禁止声明；现有 `FunctionRef` 仍负责逻辑身份，不用字段名或运行期类型猜测 ABI。生成期验证与组合期核对 `FunctionContract`、`SelectedFunction`、`SelectedPackage.initFunction`、`SelectedPackage.init` 和唯一 `Core.Order=0` Kernel Owner 一一相符，不能对另一 Package 注册相同身份获得 Host 权限。
3. `DomainAppLock.bootstrapKdpPin` 持有 `kdpInitFunction:FunctionRef`、`invocationAbi:'kdp-host-init/1'` 和该已选 Implementation 的精确 `ResourceRef`；`BootstrapPin`、`InstalledRecord` 持有同一不可变逻辑身份、ABI、入口 Target Digest、Lock Digest。App 组合与封存时按选定 Function 唯一派生；Boot 比对这些字段与 Lock/可信安装记录，差异**import 前 REFUSED**。删除旧 `kdpPrimaryEntry:'bootstrap'` 兼容路径及独立维护的第二 Target 真相源；新版 Lock/Pin/Install Record SchemaVersion 原子提升，旧格式按拒绝处理。
4. Boot 是唯一可以调用该特殊 Target 的 Host 适配器，调用签名仅为 `KdpHostInit(context:KdpBootstrapContext):Promise<KdpBootstrapResult>`；KDP 实现可向 Host 返回本进程 `DomainApp`，不得通过普通 `ReadonlyFunctionHandle.invoke`、Hook、FunctionRef 导入或领域 JSON Output 模拟该返回类型。Host result 运行时判别 `BOOTED+DomainApp/FAILED+code+reason`，错误日志脱敏；若返回结构非法，为执行阶段 `FAILED`，不重写成 `READY`。
5. 正反要求：**POS** 特权 Host 入口唯一选择、正确导入并启动；**NEG** 普通 Function 宣告特殊 ABI、绑定错 Owner/Target/Version/Digest、错 Order、普通 Package 调 Host、Pin/Lock/InstallRecord ABI 不一致、普通 FunctionOutcome 假冒 BOOTED、旧 bootstrap 格式全部静态或执行前拒绝。

### R103-P1-02：生成期证明静态 KDP ESM 闭包、交付期封存、Boot 最小核验

`DomainAppLock.trustedKdpModuleClosure`（确切 JSON 字段名在机器合同实现时固定）必须是一个**确定、有界**的图，而不是单个入口摘要或“运行后再检查”的承诺。由生成期验证工具对被选择 KDP Host Init 的入口及静态同步 import/export 依赖做 Node22 ESM/Package exports 解析，App 组合/交付期封存可信来源与确定性结果：

- 每个图节点标记包 Owner、相对解析路径、Target Profile、`ResourceRef` 的实际 SHA256；对于可信 SDK 安装依赖，此外带精确包名/版本、受信安装根与 npm 归档 SHA512 SRI，明确其属于事先获信的 SDK TCB 而不是可由不受信 App 任意注入的 bare import。所有静态 import/re-export 递归展开，记录 specifier→resolved node 边及参与解析的 `package.json`/exports 的真实摘要。仅允许已声明的 Node builtin 精确 allowlist 和受限受信 SDK 包；其它 bare import、越包路径、软链接出根、未选包、未声明 Extension、动态非字面量 import 或无法穷尽的解析形式拒绝。
- 生成期负责证明完整 ESM 静态导入图、Node22 解析条件与受信 SDK 来源，并由交付链提供可信封存。**Boot 禁止用 JS AST/lexer 再次解析源码、重建导入图来证明正确性**；只能在已建立的可信安装来源/不可变快照前提下核对 Pin/Record/Lock、已选 KDP Target 身份和必要的封存字节/SRI，然后 `import` 同一个已受信的入口。可信根不能由可同步改写的 Lock/Record/Pin 自摘要冒充。
- 信任模型限定为**受控且在本次激活中不可变的安装快照**：防止“受验前任意用户提供的已修改文件”得到执行，不承诺防御有权限在校验与 import 之间并发篡改本地文件的敌对进程；如运行环境不能保证不可变安装快照，必须 fail-closed 或使用能够实现同等隔离的可信执行载体，不能宣称无 TOCTOU。
- **分层 NEG**：生成期拒绝无效静态依赖、可疑动态加载、错误 Owner/Target/Package exports；交付/安装期拒绝错误 SRI、缺失/损坏封存字节、无可信来源的 SDK 或出根软链接；Boot 在必要身份/完整性异常时于 `import` 前拒绝，验证副作用 **0 次**。**POS** clean-packed Node>=22.12 已合格单 SDK App 正常运行 KDP + Workflow。不能把运行期补做代码正确性证明当作此验收的替代。

### R103-P1-03：KDP 唯一 Init 状态机、提前失败与单次 Exit

每次激活有独立 `ActivationKernelRecord`，由**进入唯一受选 KDP.Init 的第一条可执行语句**注册；不得使用进程全局 once-map 去重普通 Extension。技术生命周期阶段为：

```text
NOT_ENTERED
  ├─ Boot 执行前检查失败 → REFUSED（未进入，无 Exit）
  ├─ KDP ESM import / 顶层求值失败 → FAILED（未进入，无假 Exit）
  └─ KDP.Init 实际进入 → ENTERED_ONCE（原子登记 KDP 进入事件）
       ├─ 创建/绑定唯一 PackageSystem + Exit Registry
       └─ 进入 KDP 声明的直接 Extension.Init → CORE_INIT_CHAIN
             └─ 下一个 Core.Order（不得再次访问 coreOrder[0]）
                   ├─ Business/Workflow 失败 → FAILED_CLEANUP
                   └─ 真实结果验收 → APP_CREATED (BOOTED，AppStatus 独立)
 APP_CREATED/FAILED_CLEANUP → EXITING → EXITED (幂等、一次)
```

- `runRemainingCoresAfterKernelEntered` 或等价内部 API **必须显式跳过**第一个 KDP Core 的再次执行；不得把 `runInit()` 从 `coreOrder[0]` 重调 KDP。先按已声明直接依赖顺序执行 Kernel 本层 Extensions，再调下一 Core；Extension 不能控制下一 Core。每个 **进入**的普通 Package/Extension（允许重复）立即记真实 `ENTERED`，独立记 `INIT_SUCCEEDED/INIT_FAILED`，Core 完成与进入不得混记为成功。
- KDP.Init 尚未完整创建 `PackageSystem` 即抛错时，利用激活最早登记的受选 KDP Exit Target 尝试**仅已进入**的清理，不重新创建 Kernel；有 System 时复用它的 Exit Registry。最初的异常作为根因保留，Exit 的失败仅追加脱敏诊断，逐一逆序尝试已有 Exit，KDP Exit 最后；强杀/进程掉电不承诺 Exit。
- `DomainApp.dispose()` 与 `processLifecycle` 共享同一激活的 `EXITING/EXITED` 幂等边界，不能重复退出。前置不可信 Pin/Lock 拒绝用 `REFUSED`；KDP 模块 import 阶段及之后失败用 `FAILED`；`BOOTED` 仅表示 Host 获得可检查的 App 句柄，**不代表业务 AppStatus.READY**。AppStatus 与 Function/Workflow Outcome 各独立，UNKNOWN/ASK/WAIT 不可晋升成功。
- **POS** 一个 KDP.Init、正确 Order/Extension、一次逆序 Exit（KDP 最后）、含重复 Extension 进入记录。**NEG** 非法 Order、递归调用、KDP Init 进入前/进入后/构造 PackageSystem 前故障、Business Init FAILED、Exit 抛错、dispose+Host 同时退出、不可用 Lock；逐项记录 entered/succeeded/failed/cleanup 事件，首错不可被 Exit 覆盖。

### R103-P1-04：Namespace 复合键必须贯通所有匹配和授权路径

完整机器迁移不止原 A4.1 三个字段。将 `ElementDefinition.namespace`、`ElementEntry.namespace`、`ImplementationBinding.elementNamespace` 和 `ExportEntry.elementNamespace` 显式加入 Schema/Type；`ElementDependency.element` 从裸 ID 字符串迁移为受选复合 `ElementRef`（包含 namespace/id/version/digest），或完全等价的显式全字段结构。凡其它设计仍以裸 Element ID 查找的 Content/Workflow/Hook/Import/Owner 检查，必须升级为已选 `ElementRef` / `FunctionRef` 并与 Owner、Visibility/Export/Direct Extension 核对；旧字段的混合表达式拒绝。

- 语义逻辑查找键固定为 `(namespace,id,version)`；`digest` 用于 Definition/锁定资源字节校验，`ownerPackageId` 用于归属/授权。相同逻辑键若有不同 Digest **或** Owner，一律失败；不同 Namespace 下同名 camelCase Element 合法且不得互相覆盖。查找、Binding、导出、签定 SelectedElement/SelectedFunction、授权与运行读取都不得只用 `elementId`。
- Schema 的精确正则分别约束 Package kebab-case、Element camelCase、Namespace；锁结构、静态 生成期验证 `byLogicalId`、接口 Export/Import、Dependency、目标实现、Manifest、Catalog、安装后的 Boot/Pin 整体同步迁移。新 `schemaVersion` 和 Lock/Pin/Install Record/Digest 一次受控跃迁；旧 r41/r60 资产只保留在历史 Git Commit/StageIndex，不假设新名字继承历史 `STANDARD_ACCEPTED`。
- **POS** 同 `id='kernelLifecycle'` 在 `namespace='dh'` 和 `namespace='reference'` 可独立定义并选定。**NEG** 同 namespace/id/version 的错 Digest/错 Owner、错误 Binding.namespace/Export.namespace、未声明直系 Extension 伪导入、旧点分 ID、缺 namespace、过期 SHA256、只改元数据不改 Lock 的篡改，必须 生成/封存期或 Boot 按各自职责拒绝，且不得执行不受信目标。

### R103-P1-05：SDK 作者期 Composition Package 的可重复自举来源

- 唯一**SDK 自有的**作者期逻辑 Package 候选稳定身份 `dh-authoring`（版本与 SDK 安装的精确版本绑定）、Element `composition`、Function `buildApp`；有真实 Manifest、Element Definition、Function 合同和受审 ESM Target/资源摘要。`buildApp` 仅消费生成期已验证合格的 Package 文件，负责 App 的确定性选定、组合与封存，而**非重新对 Package/Element 领域正确性做静态证明**；不能在待生成 Domain App Runtime Lock 中暴露作者期组合 Function。不引入公共第二套组合产品，也不强制 Package 由特定工具生成。
- `@kaicreator/domain-harness/composition` 仅做已安装 SDK 中确定版本的 `dh-authoring:composition.buildApp` 的静态 facade/装载；其 Package/Element/Target 所有权、实际 bundle/build provenance 与安装 SDK `package.json`、锁定传递依赖、Registry tarball SRI（或等价可信签定安装收据）逐一匹配。**信任由当前已安装 SDK 而非尚不存在的新 App Lock 建立**，所以不发生“先创建 App 再能创建 App”的循环。
- 生成期的 TypeScript 静态分析与 Validator 可由作者独立使用，不是 SDK 作者期 Composition 的强制正确性证明义务。作者期组合只拥有其必要的文件读取/技术封存权限，不继承 Runtime `effects:'none'` 或 HostPort；不执行候选 Package.Init/Exit，不装载未选目标代码，也不在 Runtime 引入第二 Composer。现有 `buildApp` 作为组合/封存算法唯一事实源，不得放宽封存依赖关系与 Lock/Pin 受信规则。
- **POS** clean-packed Node>=22.12 单一 SDK（没有既存 App Lock、无 Forge/外部 组合 npm 直接依赖）对普通手写 Package 文件完成确定性组合，并真实 Boot/Workflow。**NEG** SDK authoring 包版本/摘要不符、未获允许的作者期 I/O、企图执行候选 Init、对 Domain App Runtime 导出作者期 Function、缺少静态直接 Extension/Target/SRI 等必须拒绝。

### R103-P2：分段与事件定义

实施顺序冻结为 **(1) Contracts + JSON Schema + 生成期验证/组合封存/Lock/Pin/Install Record + 全链 Namespace/ABI/闭包静态 NEG → (2) Boot/KDP Init/Exit → (3) SDK 作者期归属 → (4) 全新 Reference/Standard/Registry Consumer 和验收**。若阶段间形成不合法的组合，须在**同一原子 PR 集成 HEAD**验收，不能把其中一个中间提交冒称合格的可安装 SDK。每个阶段都要提交对应的真实 tests 与根/子正反例。

`Init entered` 只决定“有必要尝试 Exit”，`Init succeeded/failed` 只记操作结果，`Core completed` 指声明的 Extension/后续 Core 已执行且满足结果；三者不得复用同一个状态标记。失败后只对进入过的节点逆序 Exit，不得伪造成功。旧历史 R72/R81/R83/R84 Source/CI/StageIndex 不覆盖，新 Foundation 受审结果另写新 SHA/Digest/Receipt。

**R103 当前处置**：以上为 R102 五个 P1 的 L2 设计修订和两个 P2 的明确处理方案，**不是**已完成生产源码重构或独立 L2 `ACCEPT`；#1668 A5 再次限定独立审核 P0/P1=0 与 Owner 签收前，不进入受信机器 ABI 生产实现。

## R109. R107 两个 P2 的实施前冻结补充

> [R107 独审 ACCEPT_L2_SCOPED](https://github.com/kaicreator-mm/domain-harness/issues/1668#issuecomment-7083916540) 指出两个非阻断 P2。下面对它们作**精确实施裁决**，不把规范设计审查结果当作当前 Runtime PASS。实施阶段允许小切片 Draft，但每一项机器 ABI 完成验收必须在能够安装的**原子组合 HEAD**完成。

### R109-P2-01：Node22 KDP 加载图可证明的有限子集

- **生成期**应静态穷举 KDP 的同步 `import`、`export … from` 边，验证 Node22 ESM 条件导出、`package.json`、目标 SHA256/SRI 与准备封存的关系一致；App 交付期把证明与受信来源绑定。Boot 仅在 KDP 首次 import 前比较必要身份和封存字节，不重新扫描源码。
- **KDP 选定代码禁止所有动态 `import()`，包括字面量参数**：运行前验证必须能完全列举执行闭包，不能假装字面量延迟 import 已经安全。CJS `require`、`createRequire`、`module.require`、`eval`、运行时 Hook loader、ESM↔CJS 桥接也禁止由选定 KDP 使用。受信、预先安装的 SDK TCB 依赖里由内部 Bundler 产生的 CJS 辅助调用按 SDK 自己的安装版本/SRI 证明，不转化为任意选定 Package 的特权。
- Node builtin 仅准许确定的 `node:` 名称 allowlist；裸 builtin alias、用户新增 Node Loader/自定义 conditions/不一致 exports 分支、外部 symlink、绝对路径、未钉住的相对/bare 引用一律拒绝。Target 使用锁定的 `node22-esm/1` 与标准 `node,import,default` 条件集合；不能在 生成/封存期与 Runtime 分别用不同加载条件而忽略差异。
- 必须加入分层 NEG：生成期拒绝不符合静态闭包的二级相对 JS、exports、间接 `require` 或字面量 `import()`；安装/Boot 拒绝已经封存的身份、SRI 或字节被破坏，且在 KDP 导入前副作用计数为 0。不能靠 Boot 重新验证代码正确性，也不宣称抵抗有权限的本地进程 TOCTOU。

### R109-P2-02：源文档统一和作者期 Init

- A2.1 中原“是否需要 invocationAbi”的未决候选已被 R103/R107 的**必需判别字段**取代；A5 正式实施顺序已调整为 Contracts/Schema/生成期验证/组合封存/Lock/Pin → Boot/KDP → 作者期 Composition → 新消费者。冲突时以 R103/R109 为准，禁止 Agent 选择过时的 Boot-first 表格顺序。
- **作者期 dh-authoring Package 具有真实普通 Init Element，但绝不在作者期由 Composition 调用**。SDK 已安装并通过自身发布/版本来源选定后，由静态 facade 仅调用该 Package `composition.buildApp` 的特权作者期 Function；此时不能调用待创建 App 或 SDK Authoring Package 的 Init/Exit。将 Authoring Profile 明示为独立调用约束，不给 Runtime `PackageInitContext`、Effect 或 HostPort 隐式提升；不能把“没有 Init”当作普通 DomainPackage 合同例外。
- 真实迁移顺序需要保留各阶段独立可复现的 FAIL/PASS 收据；禁止同一提交同时保留两套新旧运行时 ABI 的兼容路径。旧历史 SHA 仅用于审计，非新版本可执行对象。
