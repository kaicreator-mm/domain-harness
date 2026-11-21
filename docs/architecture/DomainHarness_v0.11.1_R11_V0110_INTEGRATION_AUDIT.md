# DomainHarness 0.11.1 · R11 — 对照已实施 0.11.0 的实施接口审计

> **基线是最新已集成的代码，而非旧 R10 的“未实施 0.11.0”假设。** 版本列车 `version/v0.11.x@da616929d6f794db0cd30183132231ba31d4eb05`。0.11.0 新规范 PR [#1621](https://github.com/kaicreator-mm/domain-harness/pull/1621) 与实现 PR [#1622](https://github.com/kaicreator-mm/domain-harness/pull/1622) **都已合并**；实现原始审核 Head `54b82606244a599f626003c8d3efeb7372c347ba`，独立 R21 `ACCEPT_SCOPED/P0=0/P1=0/P2=0`、Woodpecker [#2827](https://ci.kaicreator.com/repos/18/pipeline/2827/1) SUCCESS，merge 后 Tree SHA `228f475d30a4bc3ab51054631c1575fe51055800` 与已审核 Head 相同。**不是 0.11.x Release / DIS Full Conformance，也没有对 0.11.1 的实现资格作任何背书**。

```ini
OUTPUT_LABEL=DH_V0111_R11_V0110_IMPLEMENTED_BASE_INTEGRATION_AUDIT
BASE=version/v0.11.x@da616929d6f794db0cd30183132231ba31d4eb05
BASE_SPEC_PR=#1621_MERGED
BASE_IMPL_PR=#1622_MERGED
BASE_REVIEW=R21_ACCEPT_SCOPED_P0_0_P1_0_P2_0
BASE_CI=WOODPECKER_2827_SUCCESS
L1=#1605
L1_PR=#1607
L2=#1608
L2_PR=#1611
DESIGN_STAGE=R11_SOURCE_ALIGNED_CANDIDATE_NOT_FROZEN
NEW_FUNCTIONAL_CODE=NONE
```

## 一、已消失的旧设计阻塞

0.11.0 已实际提供以下能力，可作为 0.11.1 的**明确依赖，而不是重新实现的 Task**：

- `DomainPackageManifest.init:EntryRef` **必须有**；`exit?:EntryRef`、`recordInitFrom?:true` **分别可选**；`initResources?:ResourceRef[]` 可用。Core `order?:number` 在 BUILD 中要求 Core 必填唯一并固定 KDP=0。
- `DomainAppDescriptor.roots.kernelPrimary + cores[]`，任意被选 Core 数量由 BUILD 绑定到 `DomainAppLock.coreOrder[]`。KDP `PackageSystem.runInit` 对直接 Extension 递归，当前 Core 决定何时执行已封存 `nextCore.init()`；不是再跑一遍 `technicalInitOrder` / `businessAppInit`。
- `PackageSystem` 保存独立的实际 Init 进入 `initEvents`，只有声明 `recordInitFrom:true` 才为 Package 建立可见 `InitFrom` 历史；`runExit` 按实际进入事件逆序对已声明 `exit` 执行退出，与业务 Workflow end 无关。
- `build.ts` 已检验直接 `dependsOn`/跨包 Element 和 Function 导出、真实封存资源与函数实现、Core.Order 和 Init/Exit 导出；`static-package-guard.ts` 检查生成后 ESM 静态导入/闭包，`app-package.ts` 组成完整可安装确定性 App Package。
- `ContentBlock.contentKind='workflow-definition'`、`schemaRef`、`value | ref` 和 `ElementDefinition.functions[]`（0..N）已存在。无需在 Element 根对象增加 `nesting` 字段以支持 Workflow。
- 保留 0.11.0 的可信 Boot Pin/Lock/安装记录、已封存字节检验和必要 KDP 最终退出；0.11.1 的 XState WorkflowRun 不接管 Core.Order 或 Package Exit。

## 二、新版代码揭示的真实 0.11.1 接线问题

| ID | 重要性 | 当前 0.11.0 源码事实 | 0.11.1 必须做的最小增量 |
|---|---|---|---|
| **A1 · Init 期间业务调用通道** | **P1** | `kdp.ts` 在 `packages.runInit()` 之前构建的 `AppInitContext.functions` 只包含公共 ingress 句柄，`appRef===null` 时一律返回 `DH_RUNTIME_NOT_READY`；真正 `DomainApp` 只在 Init 完成并验证 AppStatus 后创建 | 提供 **BUILD 已选并封存、仅当前 Package 可见、可在 Init 内调用的 `startWorkflow(selectedWorkflowRef,input)` 能力**（示意名），由 KDP 唯一 Workflow executor 执行；它**不是**旧 `DomainApp.invoke` 或 READY 后第二个 Router/Init。维持 Init→Workflow→Function |
| **A2 · Init 的逻辑身份** | **P1 / 设计合同** | `DomainPackageManifest.init` 和 Lock 中 `SelectedPackage.init` 是 **`EntryRef`** 指向已选 `init` ESM 导出，不是 `ElementRef`；不能把“已有 Init Element 身份/FunctionRef ABI”当作已实现事实 | 0.11.1 可**复用唯一 Package.init:EntryRef** 作为物理启动边界；如果 Workflow 内容要引用 Init 的 Element 身份，由 BUILD 给出可验证的 `ElementRef → selected init EntryRef` 关联，禁止再造第二 Init 函数/入口。是否必须引入该关联以 T11 的最小用例为准 |
| **A3 · Workflow Function 选择/可见性** | **P1** | `build.ts` 的 selectedFunctions 从 ingress、Package.imports 和公开 Function 构造；`PackageSystem.runInit` 仅将 ingress 可见句柄映射给 Package，且不能在 Init 中使用它们；`PackageSystem.functionByRef` 与资源句柄已可查已封存结果 | BUILD 要显式选择 **Workflow Node/Guard/Reader 真正需要**的 FunctionRef、其 Target 实现和资源，即使它不是旧 ingress；在 Package 所有者或**直接声明 Extension** 的边界内形成仅必要的 Init 期调用绑定；不能用 transitive closure/动态 import/原始跨包句柄绕过 |
| **A4 · App Init 状态与业务 Workflow 终态** | **P1** | `PackageSystem.runInit` 收集所有 Business Core 的 Init 返回，KDP `validateBusinessCoreResults` 聚合 `READY/DEGRADED/BLOCKED/FAILED`，再决定是否创建 DomainApp。业务 Workflow 的 `COMPLETE/REJECT/ASK/WAIT/UNKNOWN/FAILED` 尚不存在于现有代码 | **不直接把 Workflow Outcome 当 AppStatus**。由发起 Workflow 的 Package.Init/业务合同明确把本次运行结算映射为自身 Init Result（或仅在本 Package 语义内决定），KDP 继续履行真实 App readiness gate；ASK/WAIT 本版应有限退出，不无期限阻塞后续 Core.Init 链 |
| **A5 · BUILD 和依赖可信闭包** | **P1** | `static-package-guard.ts` 拒绝未知 npm 模块 import、动态跨 Package import 和原始跨包句柄传递；`app-package.ts` 的组合包安装只信任被选 Package + 精确的 DomainHarness microkernel/contracts 运行依赖，拒绝其它自由追加的 npm/git/file 包/隐式 node-gyp | XState v5 属 **现有受信 microkernel 模块的审定依赖/实现**，不要作为未经选定的业务 Package npm 依赖绕开 BUILD；YAML parser 作为已封存 Reader Package 静态源码的一部分，或扩展受信/版本钉住的解析实现并补相应 BUILD 证明。**不能简单 `npm install yaml/xstate` 到最终业务组合包** |
| **A6 · Reader 资源/数据格式** | **P2** | `ResourceRef`、`ContentBlock.ref`、`Package.initResources`、`ReadonlyResourceHandle.read()`（摘要复验）已经存在；目前源码未实现 `JsonReader/YamlReader` Element 通用接口；BUILD 使用 JSON 解析 Element 定义文件 | 最小交付 JSON 和安全 YAML 两个可复用 Reader Element，固定封存资源、按调用方直连 Extension/导出权限获得句柄；**YAML 是业务数据格式，不意味着 Element 定义文件或根 schema 必须用 YAML**；BUILD 应校验被选格式、拒绝外部任意文件、网络/写入 |
| **A7 · Workflow Schema** | **P2** | `element-contracts.ts` 已有 `workflow-definition` core contentKind 与 `schemaRef`；`json-schemas.ts` 的 `ElementDefinition` 根采用 `additionalProperties:false`；尚无 Workflow Node、Switch、Hook 或预算的专用合同 | 定义 **独立版本化的 Workflow Content Schema**，内容中明示嵌套 kind（默认 workflow、仅支持 workflow）、至少一个 node、明确 Switch 唯一出口、start/end 可选 Hook、`maxDescendantWorkflowDepth`；不在 Element 根上强加 `nesting` 字段，不建第二套 Element 子类型 |
| **A8 · 结果/错误责任与预算** | **P2** | 0.11.0 `DomainApp.invoke` 的旧直接 ingress 仍做输入/输出 Schema/Outcome normalization，但 Package.Init 出错已是 KDP 最终失败+逆序 Exit；`runInit` 的 `InitFrom` 不等于业务调用路径 | **0.11.1 新 Workflow 执行链不要复用旧 ingress 的通用业务异常映射器**；业务异常/重试/分支由业务 Element/Package 明确处理，真正未处理故障由 KDP 最小日志/退出。根业务 `maxElementCalls` 跨子 Workflow、实际 Guard/Reader 调用统一计数；每 Workflow 的相对子树最大深度逐祖先检查，**Package Init/Exit/InitFrom 不属于业务 Workflow 预算** |

**P1/P2 只是本会话工程影响等级，**不是独立源码审核或 0.11.0 新缺陷宣告。0.11.0 已审核部分仍按其 Scoped 证据有效。

## 三、在最新版 0.11.0 下，0.11.1 正确调用边界

```text
Boot → selected KDP Core(Order=0).Init
   → BUILD 选定的 Extension.Init 和下一 Core.Init（0.11.0 现有链）
     → 目标 Package.init:EntryRef（真实 Init 导出）
       → [若本 Package 声明业务 Workflow]
          Package.Init 通过 KDP 提供的受限已选 Workflow starter
           → WorkflowRun (private XState Actor)
             → start? → selected Element.Function / child Workflow
             → end? → named Switch exit → next node/terminal
           → 返回本次 Workflow Outcome 给调用的 Package.Init
       → Package.Init 产生自己的初始化结果
     → Business Core Init 聚合状态 → BOOTED/READY 等（0.11.0 现有门）
   
应用正常结束/未处理故障 → KDP 按实际 Init 进入顺序执行可选 Package.Exit
```

这是**同一轮 Package.Init 里的业务执行**，没有 READY 后第二轮 Init。业务 Workflow 必须在 Init 当时拿到可用执行句柄，而不能依赖未 READY 的 `DomainApp.invoke`。非业务 Package 不必人为创建空 Workflow；单节点业务 Workflow 合法。

## 四、T11–T14 最新接入差异与必测反例

- **T11 Contracts**：把 `workflow-definition` 内容 Schema、`WorkflowNodeRef`、Switch 具名出口、start/end、Run 身份/全局调用预算/本地深度和 Init 期 Workflow starter 的**最小已选绑定**定义清楚；不改 Core.Order/Root Element Schema，也不把现有 `EntryRef` 伪装成 `ElementRef`。
- **T12 BUILD/Lock**：与 0.11.0 `buildApp` / `composeAppPackage` 集成；验证全部被选 Workflow/Node/Reader/Guard 实现、直接 Extension API 与最终生成 ESM 闭包，生产精确受限 callable bindings；不得仅靠新文档/独立 JSON Lock 冒充完整打包。验证 XState/YAML parser 的受信依赖与 Node 22.12.0 运行条件，不强制 Node 24。
- **T13 KDP**：将唯一 WorkflowRun executor 接到 `PackageSystem.runInit` 的受限上下文，完成 parent/child XState Actor、Switch、业务 start/end、已选 Function 调用和预算；**不接管/重启** Init/Exit/Core.Order，不重新创建 BusinessAppInit 阶段。
- **T14 clean-packed E2E**：实用 Package.Init 内发起业务 Workflow，在 App 创建前完成所需选定 Function 调用；至少两个 JSON 数据共用 JsonReader、两个 YAML 数据共用 YamlReader；验证单节点/子流程/分支/ASK-WAIT/业务异常/Hook/预算；Init 完成后 readiness gate 不混同 Workflow terminal；不使用旧 ingress 作为 Workflow 伪入口；无 Exit/InitFrom 仍能启动，启用时正常工作；跨包未声明 Reader、任意动态 import、未选 npm 依赖 BUILD 拒绝。

## 五、版本边界与 PR 状态（审核前必须处理）

- [0.11.1 L1 Draft #1607](https://github.com/kaicreator-mm/domain-harness/pull/1607) / [L2 Draft #1611](https://github.com/kaicreator-mm/domain-harness/pull/1611) 目前由旧 `b8e5c2bc...` 基线派生，比较最新 `version/v0.11.x` 均 **behind 62 commits / diverged**；虽然当前资料源代码已读取最新 HEAD，PR 源分支 **尚未 merge/rebase 新基线**。正式 L1/L2 独立 Exact-SHA 审核前应将文档与最新列车同步，防止旧文档覆盖当前新 0.11.0 规范。
- #1621/#1622 均 merged，旧 0.11.1 L1/L2 上“0.11.0 Draft not implemented”的断言已经过期，必须从正式权威描述中删除。
- 0.11.1 新的需求范围仍为 Workflow-only nesting（单节点合法）、明确 Switch 出口、JSON+YAML Reader、start/end Hooks、根共享总业务调用次数与逐 Workflow 相对深度限额；**不需要重开产品范围**。
- 本次 R11 文档/Issue 是源码对照设计结论，**不是**新源码、CI、独立审核/Freeze 或 Release。
