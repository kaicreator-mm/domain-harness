---
name: typescript-quality
description: DomainHarness TypeScript/Node Language-Native Profile 的生成、重构、代码注释、测试与工程质量辅助 Skill；不定义第二套执行规范。
---

# TypeScript 工程质量 Skill

**权威正文**：[核心规范](../../../docs/specs/domain-harness/core.md)、[TypeScript Profile](../../../docs/specs/domain-harness/typescript-profile.md)、[工程质量](../../../docs/specs/domain-harness/engineering-quality.md)。本 Skill 只给 Agent 编写/审查源码的操作提示，不修改任何规范。先读取 [domain-harness-spec](../domain-harness-spec/SKILL.md)，按任务进入 [Element/Package](../../../docs/specs/domain-harness/element-package.md)、[架构](../../../docs/specs/domain-harness/architecture.md) 与 [静态组合](../../../docs/specs/domain-harness/composition-trust.md)。

## 生成/修改时执行

1. **原生语言优先**：Package 是 ESM 模块集合/静态插件，Element 是内聚 Class，Function 是模块函数/类实例与静态方法。优先复用 SDK 内置 Standard Elements，再用 TS/Node 及维护良好的第三方库解决实际业务，避免新建函数分派器、Plugin Loader 或全覆盖 Node API 包装。
2. **职责和命名**：使用 [domain-naming](../domain-naming/SKILL.md)；Package kebab-case、Element 逻辑 ID camelCase、Class PascalCase、Function camelCase、文件/目录 kebab-case。不将 R41/v011 等迭代号写入新永久标识符；已有历史源码/StageIndex 的字节和审核 SHA 保持可追溯。
3. **代码元数据与 Agent 文档分离**：Module `packageMeta` / Class `static metadata` 是框架和业务读取的**可执行代码合同**。TSDoc/JSDoc 和 Skill 给 Agent 理解，不生成一份竞争的运行时 Metadata；只保留框架实际需要的字段（例如 Core.Order）。
4. **静态依赖**：正常 `import/export`、`package.json#dependencies/exports`。直接使用外部 Package 就在生成期声明直接依赖；对未声明依赖、非法 Order、模块公开入口等用 TypeScript/ESLint/真实测试验证，**SDK Runtime 不重复验证**。
5. **生命周期**：唯一 KDP Order=0，Core Order 非负互异可跳号，框架读取元数据排序；无 Init/Exit 跳过，有 Init 则显式 `start()`，可选 `Symbol.asyncDispose` 由生命周期拥有者执行退出。ESM import 求值不等于业务 Init。
6. **类型和质量**：严格 TypeScript，`unknown` 先收敛，尽量 readonly、判别联合、显式错误与结果；禁止无理由 `any` / 粗断言 / 默认成功。注释与 JSDoc 中文，解释最新职责、失败与清理，不留旧 ABI 说明。注意 Error 自继承、NodeNext 第三方导入、测试源码类型检查与 `package.json#exports` 对公开入口的限制。
7. **业务 vs 框架错误**：预期业务失败由业务 Element 处理，KDP 最终未捕获错误只记录脱敏日志、尝试已进入实例的 Exit Hook、失败退出。技术失败仍可能发生；不可假设生成阶段能保证运行永不出错。
8. **验证闭环**：提交前执行适用语法/Typecheck/Lint/受影响测试、实际外部 npm consumer；能本地等价执行优先本地，仅真实必要时调用一次 Woodpecker。独立审核只查实际新 SHA 变更，报告不能运行项为 NOT_RUN；不要开展持续 Agent 任务。

## 历史规范与警戒

**HISTORICAL / 不得在新 v0.11.1 代码实施**：旧 `Contracts/BUILD/Microkernel/SDK` 分层不等于现行 Package 架构；旧 `SelectedFunction.resources`、`FunctionRef/Target/ImplementationBinding`、`Pin/Lock`、Boot 可信入口字节检查、静态 JS 子集 guard、强制每 Package `Init`、KDP 独占 Workflow Engine，均属于待删除的旧执行模型。有关旧 L2/质量手册仍可查看故障根因/历史 SHA，但若与新规范冲突则不可作为当前实现要求。

保留有价值的工程经验：`globalThis.Error` 避免误自继承、`@ts-expect-error` 必须有解释、`globalThis.structuredClone`、Unicode 字符计数、`Promise.resolve` 异步合同、错误日志不泄漏 Token/密钥。旧 CI 测试路径/四 tarball 示例不是新静态插件必须保留的工程拓扑，迁移后实际消费者需重新验证。
