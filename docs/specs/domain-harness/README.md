# DomainHarness · 唯一规范目录

> 设计基线：**Language-Native Domain SDK**；Owner 决议 [#1685](https://github.com/kaicreator-mm/domain-harness/issues/1685)。这是唯一多文件规范，人和 Agent 读同一正文。**设计已确认；v0.11.1 原生 SDK 源码已在 R160 接受并经 PR #1694 合入版本列车**，其余 v0.11.x 阶段需各自验证。

## 阅读路径

1. 必读 [核心规范](./core.md)，确定 Package 插件、Element 复用、Standard/Business 与静态可信边界。
2. TS 实现读 [TypeScript Profile](./typescript-profile.md)，然后读取实际涉及的主题细则。
3. 读 [迁移状态](./status-and-decisions.md)，区分 `CONFIRMED` 新设计、`MIGRATION_REQUIRED` 现有实现、`HISTORICAL` 已取代模型与 `CANDIDATE` 未裁决建议。
4. Agent 通过 [domain-harness-spec Skill](../../../.agents/skills/domain-harness-spec/SKILL.md) 导航；Skill 不复制规范、不供运行时执行。

| 权威文件 | 责任 |
|---|---|
| [core.md](./core.md) | CORE-01..12 语言中立的职责和产品不变量 |
| [typescript-profile.md](./typescript-profile.md) | TS-01..08 ESM/Module/Class/Function、静态元数据、原生依赖、组合、生命周期 |
| [element-package.md](./element-package.md) | EL-01..07 Package 插件、Element/Function、Standard/Business 与组合 |
| [lifecycle-workflow.md](./lifecycle-workflow.md) | LIFE-01..12 Order、可选 Init/Exit、关闭并发、Actor done/error/stopped、Workflow/Reader 保留验收 |
| [composition-trust.md](./composition-trust.md) | GEN-01..08 生成期正确性、静态组合、npm 交付、模块 Function 与 DIS 领域合同边界 |
| [architecture.md](./architecture.md) | ARCH-01..09 SDK/KDP/Standard/Business 拓扑、禁止重复系统 |
| [identity-naming.md](./identity-naming.md) | ID-01..06 身份、代码元数据、命名 |
| [engineering-quality.md](./engineering-quality.md) | QA-01..08 开发、测试、日志、配置、审核 |
| [status-and-decisions.md](./status-and-decisions.md) | 历史收据、旧机制替换、源码与 L2 迁移状态 |

DIS 保留跨语言领域语义；本规范只确定 DomainHarness SDK 的语言原生映射。0.11.0–0.11.9 是同一次完全重写，不要求兼容 0.10.x；v0.11.1 的基础缺陷在本版本修复，不推给 v0.11.2。

旧 R90、历史 L2/PRD、Exact-SHA CI 与 Release 收据仅作可追溯历史，**不再作为与新决议冲突时可选的当前权威合同**。原生 v0.11.1 源码依 PR #1694 Exact-SHA + Woodpecker #3151 + R160 复审接受；历史旧 ABI 不再在版本列车执行。单独的文档状态更新不构成新的源码 CI/功能验收，也不表示整个 0.11.x 已发布。
