# DomainHarness 0.11.0 · Element-First Foundation 实际调用流程

> **权威边界**：本指南说明 B0-01–B0-08 候选源码及其待验证的运行路径。其验收资格由 [#1624](https://github.com/kaicreator-mm/domain-harness/issues/1624) 与真实 Exact-SHA CI/独立审核决定；**不能将文档视为已经验收或合并的证明**。历史 PRD/L2 中的 `EntryRef`、`technicalInit`、`businessAppInit`、`ingress`、`suppressedIngress` 被本次 Element-First 裁决覆盖。0.11.1 Workflow 不属于本阶段。

## 唯一四层源码

| 工作区 | 入口 | 责任 |
|---|---|---|
| Contracts | [`packages/contracts/src/index.ts`](../../packages/contracts/src/index.ts) | `ElementRef`、`FunctionRef`、Package Manifest、Descriptor、Lock、Schema、Target locator、FunctionOutcome |
| BUILD | [`tooling/build/src/build.ts`](../../tooling/build/src/build.ts) | 从 Package/Element/Function/Target 生成**确定性的完整组合 Package**和 Lock，构建阶段拒绝未知/非法依赖与入口 |
| Boot/KDP | [`packages/microkernel/src/boot.ts`](../../packages/microkernel/src/boot.ts)、[`kdp.ts`](../../packages/microkernel/src/kdp.ts)、[`package-system.ts`](../../packages/microkernel/src/package-system.ts) | 受信 Boot Pin、Core.Order、直接 Extension、可选 InitFrom/Exit、已选 Function 调用、逆序 Exit |
| SDK | [`packages/domain-harness/src/index.ts`](../../packages/domain-harness/src/index.ts) | 唯一公共 App/BUILD/Boot API 重导出，不复制第二套 Runtime |

## Element/Function 身份和选定实现

- 每个可运行 Package 声明 `init: ElementRef`；`exit?: ElementRef` 是可选的。引用包含 `namespace / id / version / digest`，必须精确对应**本 Package** 所有的已选 `ElementDefinition`。
- 生命周期 Element 分别有**唯一** `init` 或 `exit` Function 合同。通过选定的 `FunctionRef(element,functionId,contractVersion)` 和 Target 的唯一 `ResourceRef(module digest) + exportName` 执行。**仅存在 `export function init` 不能代替 Element 的拥有权和合同**。
- Hook Provider 是公开、已选的 `FunctionRef`，BUILD 校验 Owner、Hook 接口、基数、直接 Extension、Target 及实际导出；Hook 绑定不是业务 Workflow start/end Hook。
- `ElementDefinition.functions[]` 可以为零；只有被用于生命周期或调用的 Function 才必须有已选可执行 Target。
- 物理 `ImplementationLocator` 只属于 BUILD Target / 已编译 Lock 内部结构，不能与 Element/Function 形成第三个公共领域身份。

## BUILD → 安装 → Boot → Init → Function

```text
包作者创建 DomainAppDescriptor、Package Manifest、Element 定义、实现和资源
  ↓
buildApp：Schema → 已选 Package 闭包 → 唯一 Core.Order（0=KDP）
  → 校验依赖和公开 Element/Function → 验证 Target/ESM 和资源
  → 生成确定性 Lock + 完整组合 App Package 字节
  ↓
受信安装器：部署组合包、Lock、Descriptor、installed-record 和 Pin
  ↓
boot：校验受信安装记录、Pin、Lock 和 KDP bootstrap 实际字节
  ↓
KDP bootstrap：核验环境/已选可执行模块 → sealHooks → runInit
  ↓
Core.Order 0 (KDP).Init → Core.Order 1.Init → ... → 最后 Core.Init
                        每个 Core 按直接依赖调用 Extension.Init
  ↓
Package.Init({ functions, resources, InitFrom?, nextCore? })
  → 从 BUILD 选定的 own FunctionRefs + 已声明的直接 Extension imports
    获得只读 Function 句柄
  → 先于 App READY，执行 handle.invoke(input)
    → 已选输入 Schema → 唯一 Target(input)
    → SUCCEEDED / UNKNOWN / FAILED → 已选输出 Schema
  ↓
Business Core.Init 提供 AppInitResult（READY / DEGRADED / BLOCKED / FAILED）
  ↓
成功启动时才创建 DomainApp{ status, inspect(), dispose() }
  ↓
关闭或未处理致命异常 → runExit() → 按实际 Init 进入记录逆序执行可选 Exit
```

1. **没有旧版直达业务入口**：`DomainAppDescriptor` 和 `DomainAppLock` 没有 `ingress`；`DomainApp` 没有 `invoke`；不存在 `suppressedIngress` 或独立 `businessAppInit`。Business 状态与每次 FunctionOutcome 是独立的。
2. **在 READY 前能真正调用 Function**：`PackageSystem.invokeSelectedFunction` 只使用 Lock 固定的 `FunctionRef`、资源、Schema、Target，不反向委托给还不存在的 App。`Package.Init` 只拿本 Package 自有及明确 `imports[]` 的直接依赖公开 Function，不获得全局函数注册表。
3. **没有隐藏资源许可**：Manifest 没有独立的 `initResources`；Lock 的 `initResources` 只是已选 Init Function `SelectedFunction.resources` 的派生快照，Function 所需文件必须已在 BUILD 封存并受直接 Extension/Owner 约束。
4. **Core 和退出按原机制**：`Core.Order` 非负、全局唯一、可有空档，Order=0 是 KDP。`InitFrom` 的记录与逆序 Exit 的最小内部记录彼此独立；Kernel 不去重 Init。Exit 不存在等价 no-op。
5. **异常边界**：业务 Element 负责已处理错误；未处理致命错误由 KDP 最小脱敏日志与 Exit 兜底。BUILD 的输入/字节所有权校验不应变成另一层冗余运行时语义选型。
6. **Boot 例外**：受信 `bootstrap` 是技术 Pin 锚点，不冒充业务 Element，也不恢复旧直接入口。

## 验证入口

- `npm run build`，`npm run typecheck`，`npm run lint`，`npm test`。
- `examples/basic-domain-app/verify-clean-install.mjs` 验证真实外部 `npm pack` 安装与独立 Consumer；相同 BUILD 输入必须产生一致 Lock 和完整安装产物，规则 Content 变化须改变 `Init→Function` 可观察结果。
- 测试分别覆盖非法 ElementRef Owner/version/digest、缺 Function/Target、未声明 Extension、Hook 提供者、动态模块加载、资源越权、Core.Order/InitFrom/Exit、可信 Boot 和失败清理。
- **验收状态请读取 #1624 以及对应 Exact HEAD CI/独立审核，而不是从本文件推断 PASS**。

0.11.1 的 Workflow/XState/Task Budget、业务 start/end、JSON/YAML Reader 和后续迭代均不在 B0 范围。
