# @kaicreator/domain-harness · Native SDK public API

单一嵌入式 TypeScript/Node SDK；Package 是原生 ESM 插件文件组合，Element 是可复用 Class，Function 是普通模块函数或 Class 方法。无旧 v0.10.x ABI、Boot/PackageSystem/FunctionRef/Target/Lock/Pin 运行时兼容层。

## 唯一公开入口

`import { KernelLifecycle, JsonReader, StandardWorkflowSession } from '@kaicreator/domain-harness'`

`package.json#exports` **只有 `.` 包根**，没有 `./runtime`、`./composition` 或其它内部子路径。

| 运行时 Value 导出（固定 12 个，独立测试枚举） | 职责 |
| --- | --- |
| `KernelLifecycle` | 最小 KDP，静态 Core 初始化、资源进入记录和最终逆序 Exit |
| `WorkflowElement`、`XStateWorkflowElement` | Standard 业务工作流抽象和 XState Actor Logic 适配 |
| `NativeWorkflowContext`、`StandardWorkflowSession` | 原生业务 Callback/Guard/Reader/Hook 的共享根预算 |
| `routeWorkflowOutcome` | COMPLETE、REJECT、ASK、WAIT、UNKNOWN、FAILED 的完整具名分支 |
| `JsonReader`、`YamlReader` | 可复用 JSON/YAML Class Element |
| `readJson`、`readYaml`、`writeJson`、`writeYaml` | 不强制包装成 Class 的原生 Module Functions |

公开的 **TypeScript 类型入口（不构成 JS 运行时导出）**：`CorePackageMetadata`、`DomainAppContext`、`LifecycleInitContext`、`PackageInitElement`、`StaticCorePackage`、`LifecycleLogRecord`、`LifecycleLogger`、`StandardWorkflowOutcome<T>`、`WorkflowLimits`、`WorkflowRoutes<T,R>`、`StandardJsonValue`、`StandardFileOutcome<T>`。根入口导出的类还可用于 TS 类型。

SDK 直接运行依赖只有 `xstate@5.33.2` 与 `yaml@2.9.1`。SDK **消费者** Node >=22.12.0；本仓库的完整开发工具链因 ESLint 10.11 要求 >=22.13.0，不应将二者混为一谈。SDK 不做 Package/Element 生成期静态正确性验证，作者可按需执行 `scripts/validate-native-generation.mjs`，不强制 Forge 或任何 Package 生成器。

## 交付验证

`npm run verify` 在开发 Node >=22.13 环境中执行构建、类型检查、Lint、Standard/生成期正反例及原生 Domain App。仓外 `scripts/verify-native-sdk-clean-install.mjs` 会通过 `npm pack` 安装**唯一直接依赖 SDK** 的新项目、检查 TypeScript/ESM/私有路径，并验收 Guard、两份 JSON + 两份 YAML Reader 和子 Hook **确实共享根预算**。Windows npm CLI 通过 `process.execPath` 调用，独立 Windows 真实验证应单独记录，不得引用 Linux CI 冒充跨平台 PASS。
