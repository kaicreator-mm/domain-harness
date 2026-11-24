# @kaicreator/domain-harness · Native SDK public API

单一嵌入式 TypeScript/Node SDK；Package 是原生 ESM 插件文件组合，Element 是可复用 Class，Function 是普通模块函数或 Class 方法。无旧 v0.10.x ABI、Boot/PackageSystem/FunctionRef/Target/Lock/Pin 运行时兼容层。

## 唯一公开入口

`import { KernelLifecycle, JsonReader, StandardWorkflowSession } from '@kaicreator/domain-harness'`

`package.json#exports` **只有 `.` 包根**，没有 `./runtime`、`./composition` 或其它内部子路径。

| 运行时 Value 导出（0.11.1 原 12 个 + 0.11.2 T01 新增，独立测试枚举） | 职责 |
| --- | --- |
| `KernelLifecycle` | 最小 KDP，静态 Core 初始化、资源进入记录和最终逆序 Exit |
| `WorkflowElement`、`XStateWorkflowElement` | Standard 业务工作流抽象和 XState Actor Logic 适配 |
| `NativeWorkflowContext`、`StandardWorkflowSession` | 原生业务 Callback/Guard/Reader/Hook 的共享根预算 |
| `routeWorkflowOutcome` | COMPLETE、REJECT、ASK、WAIT、UNKNOWN、FAILED 的完整具名分支 |
| `JsonReader`、`YamlReader` | 可复用 JSON/YAML Class Element |
| `readJson`、`readYaml`、`writeJson`、`writeYaml` | 不强制包装成 Class 的原生 Module Functions |
| `BoundedQueryElement` | v0.11.2 T01：有界、同步、类型化只读数据查询；返回 visited/complete/truncated 和原因，领域 predicate 由业务实现 |

公开的 **TypeScript 类型入口（不构成 JS 运行时导出）**：`CorePackageMetadata`、`DomainAppContext`、`LifecycleInitContext`、`PackageInitElement`、`StaticCorePackage`、`LifecycleLogRecord`、`LifecycleLogger`、`StandardWorkflowOutcome<T>`、`WorkflowLimits`、`WorkflowRoutes<T,R>`、`StandardJsonValue`、`StandardFileOutcome<T>`、`BoundedQueryLimits`、`BoundedQueryTruncationReason`、`BoundedQueryResult<T>`。根入口导出的类还可用于 TS 类型。

SDK 直接运行依赖只有 `xstate@5.33.2` 与 `yaml@2.9.1`。SDK **消费者** Node >=22.12.0；本仓库的完整开发工具链因 ESLint 10.11 要求 >=22.13.0，不应将二者混为一谈。SDK 不做 Package/Element 生成期静态正确性验证，作者可按需执行 `scripts/validate-native-generation.mjs`，不强制 Forge 或任何 Package 生成器。

## 交付验证

`npm run verify` 在开发 Node >=22.13 环境中执行构建、类型检查、Lint、Standard/生成期正反例及原生 Domain App。仓外 `scripts/verify-native-sdk-clean-install.mjs` 会通过 `npm pack` 安装**唯一直接依赖 SDK** 的新项目、检查 TypeScript/ESM/私有路径，并验收 Guard、两份 JSON + 两份 YAML Reader 和子 Hook **确实共享根预算**。Windows npm CLI 通过 `process.execPath` 调用，独立 Windows 真实验证应单独记录，不得引用 Linux CI 冒充跨平台 PASS。

## v0.11.2 T01：通用 Bounded Query

```ts
import { BoundedQueryElement } from '@kaicreator/domain-harness';
const result = new BoundedQueryElement().select(
  [{id:'A',available:2},{id:'B',available:0}],
  item => item.available > 0,
  {maxVisited:2,maxReturned:1},
);
// result.complete=false: 第一条即满足结果上限，不能据此认定余项已判断。
```

T01 使用现有公开 SDK 根入口，不依赖动态 Knowledge Store，也不要求所有 Business Function 返回统一领域 Outcome。一次 Query 的 `complete=false` 时，实际业务必须根据需要拒绝或输出 UNKNOWN，不能把部分结果当完整事实。此处仅为 T01 源码增量，正式 Node 22 clean SDK-only 与 Woodpecker 验收仍取决于当前 Exact HEAD 的真实执行记录。
