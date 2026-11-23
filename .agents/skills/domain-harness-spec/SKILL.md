---
name: domain-harness-spec
description: DomainHarness v0.11.x 唯一规范导航；TypeScript 原生 Package 插件、Element Class、Standard/Business、KDP Order、静态可信和迁移审核。
---

# DomainHarness 规范 Skill

**本 Skill 仅指导 Agent 阅读规范和审查，不是第二份规范。** 唯一原文：[规范目录](../../../docs/specs/domain-harness/README.md)。代码 Metadata 供框架执行，Skill 与 TSDoc/JSDoc 供 Agent 读；Agent 也可以分析代码元数据。

## 先读什么

1. 必读 [core.md](../../../docs/specs/domain-harness/core.md)；TS 生成/审查必读 [typescript-profile.md](../../../docs/specs/domain-harness/typescript-profile.md)。
2. 按需读取 [Element/Standard](../../../docs/specs/domain-harness/element-package.md)、[生命周期/Workflow](../../../docs/specs/domain-harness/lifecycle-workflow.md)、[静态组合与交付](../../../docs/specs/domain-harness/composition-trust.md)、[架构](../../../docs/specs/domain-harness/architecture.md)、[命名](../../../docs/specs/domain-harness/identity-naming.md)、[工程质量](../../../docs/specs/domain-harness/engineering-quality.md)。
3. 对照 [迁移状态](../../../docs/specs/domain-harness/status-and-decisions.md) 与 GitHub 当前 Exact SHA，不用旧历史 ABI 推断新源码已经合格。

## 生成/审查要点

- Package 是静态 ESM 插件集合；Element 是一个内聚 Class；Function 是模块函数/类方法。优先复用 SDK Standard Elements；Business 不够用再自定义。
- 元数据是框架读取的普通 TS 代码（如 Order）；TSDoc/JSDoc 与本 Skill 说明责任，不产生独立运行时选择/权限模型。
- 静态 import 与 npm 直接依赖；KDP Order=0，Core Order 互异。生成期检查结构/TS 类型/必要测试，不让 SDK 运行期重建依赖、Lock/Pin、函数分派。
- Init/Exit 可选，无则跳过；框架按 Order 正常启动并在未捕获异常时打印脱敏日志、执行可行 Exit、失败退出。
- 记录 `REPO / TASK_ISSUE / PR / EXACT_HEAD / SPEC_FILES_READ / CODE_GAPS / VALIDATION / P0/P1/P2`。无实际测试就写 NOT_RUN；需本地 Agent 时只给单次有限任务，不把 v0.11.1 基础工作转移至 v0.11.2。
