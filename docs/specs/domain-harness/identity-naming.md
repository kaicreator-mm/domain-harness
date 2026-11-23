# DomainHarness · 身份、命名与可执行元数据

> [权威目录](./README.md) · 语言原生目标 **CONFIRMED**，旧 Schema/点分 ID 与 Lock 引用 **MIGRATION_REQUIRED**。

## ID-01 · 名称

| 对象 | 约定 |
|---|---|
| Package `id` | `kebab-case`，如 `standard-workflow`、`order-business` |
| Namespace（必要时） | 独立代码字段，如 `dh`、`orders` |
| Element `metadata.id` | `camelCase`，如 `xstateWorkflow` |
| Class/Interface | `PascalCase`，如 `XStateWorkflowElement` |
| Function/方法/元数据变量 | `camelCase`，如 `submitOrder` |
| TS 文件/目录 | `kebab-case`，不限制生态固定名 |
| `Core.Order` | 非负整数，KDP=0 且唯一；其他 Core 不重复 |

不使用 R41、v011、Issue 编号等迭代标记作为产品稳定 ID；有业务意义的编号与 SemVer 不受此限。

## ID-02 · Metadata 属于代码

Package 模块显式导出 `packageMeta`，Element Class 可定义 `static readonly metadata`；**框架和普通代码读取其执行含义**，如 Order。只保留运行确有必要的字段，不强制每个函数都有额外描述 JSON。TSDoc/JSDoc 与 Skill 用于 Agent，Agent 可读取代码 Metadata，但它不是 Agent-only 元数据。

## ID-03 · 原生公开入口

Package 导出的公共模块函数直接属于 Package API；Class 方法属于 Element API。普通 TypeScript 引用与 `exports` 承担公开层次，不强制为每个 Package 函数创建 ElementRef/静态 Class。内部私有方法通过 TS/JS 原生访问规则表示。

## ID-04 · 生命周期

Order 是框架读取的代码元数据；非 Core 可以没有它，无 Init/Exit 则不造身份占位。唯一性/结构合法性由生成期检查，不在运行期建立双重身份注册或 Lock/Pin。

## ID-05 · Content、Schema 和版本

知识、规则、Workflow 定义、静态资源由普通 Class/模块拥有或引用。复杂数据可使用 TS 类型、JSON Schema 或具体领域验证，但不强迫每个普通 TS 对象都有 `ContentBlock/ResourceRef/Digest`。npm/Package 版本和必要的领域 Class 版本按实际发布需求管理，不重复建设 Target/FunctionRef/LockDigest 机器身份。

## ID-06 · 历史与证据

旧 `ElementDefinition/FunctionRef/WorkflowRef/ImplementationBinding/Target`、点分 ID 与 Lock/Pin 是已取代的历史执行模型；旧版本及其 SHA 收据保留审计，却不成为新 Profile 的 ABI。仍使用 Git Exact SHA/npm lockfile 作为正常工程证据；不要求兼容未发布的旧 0.11.x 机器接口。
