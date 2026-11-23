# DomainHarness · Package 插件、Element 复用与 Standard Library

> [权威目录](./README.md) · 新设计 **CONFIRMED**；旧 Definition/Target/Manifest 实现 **MIGRATION_REQUIRED**。

## EL-01 · Package = 插件

Package 以 ESM 模块集合组织能力、资源、依赖和公开入口。插件在生成/安装/编译时由应用显式选择，通常通过 npm 依赖和 `import/export` 使用；不强制 Package Class、独立 npm 工件、运行时 Loader、动态插件系统或特定作者工具。

## EL-02 · Element = 复用 Class

TypeScript 一个 Element 固定映射一个职责内聚 Class，可拥有 0..N 公共方法、静态数据、私有代码和其它 Element 成员。纯知识/规则作为 Element 所拥有的数据，无需强行创造可调用 `run()`；普通私有 helper/文件不必 Element 化。避免巨大综合 Class。

## EL-03 · Function = 原生函数/方法

Package 顶层公开函数直接 `export function`；Element 则通过实例/静态方法提供可用能力。TS `public` 仅说明语言可见性，私有方法适用 `private/#private`；对外模块入口由 `exports` 决定。**Package 函数无需虚构归属 Element 或静态包装 Class**，没有第二套逐函数 Binding/Target 调用链。

## EL-04 · Standard Element

Standard 是 SDK 内置、在 TS/Node/第三方基础能力之上封装的 **Domain App 常用应用能力**。例如 Workflow/XState、领域 Reader 或真实应用中通用的任务协调。Standard 按需经同一公开 SDK 的子模块使用，不是所有 Node API 的外壳，不需要强制多 npm 包安装；是否“标准”由稳定、可复用和实际价值决定。

## EL-05 · Business Element

Business 使用普通 TS 代码实现业务；**优先复用 Standard**，不足时再通过组合、继承或自定义 Class 实现。Kernel、SDK 和 Domain App 都可以有 Business 代码；Standard/Business 是用途区别，不是两种类型系统或固定的 K/S/B 技术层。业务代码可以直接使用 TS/Node/第三方库，不强制 Standard 转发。

## EL-06 · 组合自身也是 Element

一个 Class 可以用构造器/字段/方法将多个 Element 组合成业务功能；该 Class 本身是 Element，但 **Package 仍是模块集合而非该 Class**。仅当 Package 需要初始化时才提供可选 Init Element；普通 Standard/Business Plugin 不要求空 Init。

## EL-07 · 生命周期与归属

有 Init 的 Package 使用显式 `Init.start()`；没有则跳过。Exit 使用有需要的 Class `Symbol.asyncDispose`；没有则跳过。重复 Init 与资源拥有权由 Package 决定，KDP 协调实际进入逆序退出。具体约定见 [生命周期](./lifecycle-workflow.md)。旧 `ElementDefinition/FunctionRef/Target/ContentBlock` 的可执行结构仅为历史合同，不应要求普通 TS Class 通过新的自制执行模型调用。
