# DomainHarness Canonical Specification — 已迁移到模块化规范集

**当前唯一规范入口：[docs/specs/domain-harness/README.md](./domain-harness/README.md)。**

这**不是另一份规范**：过去的单文件 R90 已按条款拆分为 [核心规范](./domain-harness/core.md) 与 [详细规范目录](./domain-harness/README.md)；原条款编号、状态、来源与未实现事项仍保留。此旧路径仅为历史 Issue/PR/文档链接兼容而存在。

| 原单文件条款 | 现在的权威文件 |
|---|---|
| §0–§1 | [core.md](./domain-harness/core.md) |
| §A、§5 | [architecture.md](./domain-harness/architecture.md) |
| §2、§3、§8 | [element-package.md](./domain-harness/element-package.md) |
| §4、§13.3、§13.5 | [lifecycle-workflow.md](./domain-harness/lifecycle-workflow.md) |
| §6、§13.4 | [composition-trust.md](./domain-harness/composition-trust.md) |
| §7、§13.1、§13.2 | [identity-naming.md](./domain-harness/identity-naming.md) |
| §9、§13.6 | [engineering-quality.md](./domain-harness/engineering-quality.md) |
| §10–§12、§14 | [status-and-decisions.md](./domain-harness/status-and-decisions.md) |

对 LLM 任务加载建议参见 [domain-harness-spec Skill](../../.agents/skills/domain-harness-spec/SKILL.md)。

**历史来源**：首次整编 R88、架构合并 R89、横切规则 R90；原完整内容保留在 Git 历史 `9eee30fae292decbeb2505b9f706efe54fd234f0`。重组仅修改规范文档，不表示 #1668 的代码迁移已完成，亦不改变 v0.11.1/0.11.2 的受审事实。
