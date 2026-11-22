# DomainHarness v0.11.x · Kernel Package 真正自举与统一身份迁移 L2 接线方案

> **归口**：Foundation Issue [#1668](https://github.com/kaicreator-mm/domain-harness/issues/1668)，不是 v0.11.2 功能。**状态：PROPOSED_L2 / OWNER + 非 Writer 审核未完成**。本文件是具体实施细节，不是第二套规范。权威规范以 [目录](../specs/domain-harness/README.md)、[核心](../specs/domain-harness/core.md)、[架构](../specs/domain-harness/architecture.md)、[对象](../specs/domain-harness/element-package.md)、[生命周期](../specs/domain-harness/lifecycle-workflow.md)、[身份](../specs/domain-harness/identity-naming.md) 和 [信任](../specs/domain-harness/composition-trust.md) 为准。

## A1. 真实所有权审计

| 当前真实源码 | 当前代码作用 | 目标逻辑 Owner / Element | 必须删除的重复入口 |
|---|---|---|---|
| `packages/microkernel/src/boot.ts`, `verify.ts` 中的执行前验证 | 信任锚点→Pin/Lock/KDP 字节→动态导入 | Package 外**唯一**极薄可信 Boot，只有验证和交接；校验 helper 不强制 Element 化 | 不允许调度 Core/Workflow 或创建 DomainApp |
| `packages/microkernel/src/kdp.ts` | 目前 `bootstrap(context)` 实际创建 PackageSystem、Hook、App、Exit | 真正的 KDP Kernel Package 内 **kernelLifecycle Init Element** 的私有实现 | 不得再存在独立于 KDP.Init 的 App 初始化过程 |
| `package-system.ts`、`selected-function.ts`、`workflow-run.ts`、`workflow-execution.ts`、`domain-app.ts`、`process-exit.ts` | 已选 Function、Core/Extension Init/Exit、Workflow Actor、App 生命周期 | KDP Kernel Package 所属的内聚 runtime/lifecycle/workflow Elements；可共用私有 TS 源，不要求一文件一 Element | 禁止第二套 Loader/Actor/状态引擎 |
| `tooling/build/src/build.ts`、`static-package-guard.ts`、`app-package.ts`、`graph.ts` 和 `packages/domain-harness/src/composition.ts` | 作者期静态组合、验证和 Lock/Pin 输出 | 已安装 DomainHarness SDK 所拥有的 **authoring Composition Package/Element**；公共 SDK /composition 是装载适配器 | 不引入必须先 Boot 的待构建 Domain App 或额外 Forge/BUILD 服务 |
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
6. **物理发行**：可把 KDP Kernel 实现源码编译或 bundle 为 KDP 所有的 ESM Target，依赖显式版本和可信 SRI 封存；新 KDP 的 Build 静态准入与 Runtime Loader 应针对可信 Kernel Profile 严格定义，不允许借此将任意未声明或恶意 Business Source 排除在校验外。

## A3. 作者期 Composition 不是 Domain App Runtime 的第二入口

- 已安装 SDK 的 `/composition` **可以在待构建 App 尚无 Lock/KDP 时调用**；它由 SDK 自身的作者期 Package + Composition Element 真正拥有 `buildApp` 与必要静态图算法。物理 TypeScript 公共 facade 可以作为导出适配器，但必须可追溯到已安装 SDK 的真实拥有者、源码/目标签名和受审 Package 版本。
- 组合已有 Package 文件时按直接 Extension、Element Owner、可见性、目标实现和资源闭包进行静态验证；先完成结果确定性，再发行 Lock/Pin。不能添加 “Generator/Forge/Assembly 服务”作为 Package 形成的必经流程；任何人/Agent 都可直接写符合规范的文件。
- 作者期 Composer 被调用时不能获得待构建 App 的运行时 Function/Host 权限，也不能执行任意 Package 的 Init/Exit；将现有 `tooling/build` 嵌入唯一 SDK 是打包结构，不等于自动满足真正的 Package+Element 所有权。

## A4. 命名与 ABI 迁移策略（Foundation 单一真实迁移，不做兼容桥）

- Package：稳定 `kebab-case`，KDP 候选 `dh-kernel`；Element Definition ID：变量风格 `camelCase`，如 `kernelLifecycle`；`namespace` 独立字段。新名称和 TypeScript API /文件命名必须分别按 [身份规范](../specs/domain-harness/identity-naming.md) 核对。
- **先以独立 L2 测试决定身份唯一键**，再统一更改 `ElementDefinition`、Schema、`elementNamespace()`、ElementRef、FunctionRef、Manifest、Target/Lock/Pin、Catalog、Consumer 与实际安装验证。新对象的所有真实摘要重新计算；不能靠全局字符串替换更改历史被审证据。
- 旧 r41/r60、点分 ID 和 R72/R81/R83/R84 仍在**历史原 Commit/Receipt**。新 Foundation Baseline 用新 Source SHA/CI/Review/锁摘要独立归档；不需要为未发布的 0.11.x 保留旧 Runtime ABI。

## A5. 实施切片与最低验收

| 阶段 | 修改目标 | 必要的客观证明 |
|---|---|---|
| **L2-0 冻结** | 本文 A1–A4 + 当前规范 §A/§2–§7；先审 Trust/特殊 KDP Init 返回 ABI | Owner/非 Writer 设计审查签收，P0/P1=0 |
| **L2-1 Kernel 自举** | 唯一 Boot → KDP-owned 真正 Init；无重入/重复 App Init | 未验证入口绝不执行、Core.Order 0 单次进入、Extension 权限/顺序、真实逆序 Exit、故障清理 |
| **L2-2 Composition 归属** | 唯一已安装 SDK 作者期 Package/Element | 未启动新 App 也能 `buildApp`；静态拒绝未选/未授权调用；无第二 BUILD |
| **L2-3 身份迁移** | Manifest/Schema/Lock/Pin/Definition/Target/标准/业务 Consumer | 新旧身份互不混用、错 Owner/错 Digest/未选 Target 拒绝，新的全链 SHA/Receipt |
| **L2-4 综合归档** | 已有 v0.11.1 Task/Workflow/Standard JSON/YAML/Reference App 增量复验 | Node >=22.12，必要 POS/NEG/UNKNOWN/失败/Exit/真实 clean-install，非 Writer Exact-SHA 审核，旧 StageIndex 永不重写 |

**不能作为完成的证据**：单纯 Markdown、空 KDP.Init 壳、仅 TypeScript 编译通过、未实际受选的演示 Resource、重用旧 SHA 的 CI SUCCESS、作者自己声称的“独立审核”。

## 不在本次范围

不更改 0.11.2 工作集；不重新开发已受限验收的 T11–T14/Reader/Workflow；不创建第二个 Kernel/Forge；不做 0.10.x 兼容；不对任意恶意 JS/多语言单 App 提供新承诺；不添加未经真实需求支持的应用配置或远程服务。

**执行入口**：全部规范切片完成后，#1668 的 A6/A7 才能从 `MIGRATION_REQUIRED` 改为有来源、有证据的接受状态。
