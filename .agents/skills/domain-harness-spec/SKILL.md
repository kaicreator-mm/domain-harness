---
name: domain-harness-spec
description: 为 DomainHarness v0.11.x 的架构、设计、Package/Element、KDP/Boot、命名、Schema、执行、测试与 PR 审查按需加载同一套模块化规范。适用于人机共同维护的 Canonical Spec。
---

# DomainHarness 规范 Skill — 任务路由与核对

**Skill 不是第二规范。** 规则正文位于 [规范目录](../../../docs/specs/domain-harness/README.md) 与其主题文件。这里只提供 LLM 按需读取的顺序和回答/审核方法；不复制条款内容，也不从旧 PRD/Issue 猜最新规范。

## 始终执行的三步

1. 先读取 [目录](../../../docs/specs/domain-harness/README.md) 与 [核心规范](../../../docs/specs/domain-harness/core.md)。
2. 判断任务实际触及哪些接口、Package/Element、信任边界、生命周期、身份、可选标准能力。**只读对应的细则**，避免一次加载整个规范集；跨界任务可以读取多个。
3. 结合当前仓库 Exact HEAD、Contracts/Manifest/Target、Product/L1、L2 与相应真实测试核实：**规范已经要求什么**、**源码实际做了什么**、**是否具有对应 SHA 的验收证据**。绝不把 `MIGRATION_REQUIRED` 或 `CANDIDATE` 写为实现 PASS。

## 模块选择

| 任务需要 | 额外读取 |
|---|---|
| 架构重构、Boot、KDP、PackageSystem/Actor 所有权 | [architecture.md](../../../docs/specs/domain-harness/architecture.md) |
| 编写 Package、Element、Standard Element 或拆分职责 | [element-package.md](../../../docs/specs/domain-harness/element-package.md) |
| Core.Order、Init/Exit、Workflow、Outcome、Hook、预算 | [lifecycle-workflow.md](../../../docs/specs/domain-harness/lifecycle-workflow.md) |
| BUILD、受信安装、Pin/Lock、ResourceRef/Effect、npm 依赖 | [composition-trust.md](../../../docs/specs/domain-harness/composition-trust.md) |
| ID/Namespace/Schema/Digest/版本或改名 | [identity-naming.md](../../../docs/specs/domain-harness/identity-naming.md) |
| TypeScript 质量、日志、配置、测试、CI/独审 | [engineering-quality.md](../../../docs/specs/domain-harness/engineering-quality.md) |
| 当前是否合格、迁移状态、历史证据、规范改动 | [status-and-decisions.md](../../../docs/specs/domain-harness/status-and-decisions.md) |

其他专用 Skill 如 [domain-naming](../domain-naming/SKILL.md) 和 [typescript-quality](../typescript-quality/SKILL.md) 只是辅助执行指引，**不另立规范来源**。

## 审核或实施前的最小输出

按任务实际涉及范围记录：`REPO`、`TASK_ISSUE`（若有）、`PR/EXACT_HEAD`（若有）、`SPEC_FILES_READ`、`APPLICABLE_CLAUSE_IDS`、`SPEC_STATUS`、`CODE_GAPS`、`POS/NEG/ERR_EVIDENCE`、`P0/P1/P2`。没有实际验证则写 `NOT_RUN`，不要生成虚假收据。可直接链接源规范，不要在 Issue 再粘贴整份规范。

修改规范时：只编辑相应权威主题文件；更新目录映射和变更来源；涉及机器 ABI/安全边界先经 Owner/L2 决议并与真实消费者验证；不得把规范条款修正直接当作代码改完。#1668 负责当前 Foundation 自举与命名问题，**不向 0.11.2 转移工作**。
