---
name: domain-harness-spec
description: DomainHarness v0.11.x 唯一规范导航；TypeScript 原生 Package 插件、Element Class、Standard/Business、KDP Order、静态可信和迁移审核。
---

# DomainHarness 规范 Skill

**本 Skill 指导 Agent 阅读规范、生成、验证和审查，并导航已验证工程经验；不是第二份规范。** 唯一原文：[规范目录](../../../docs/specs/domain-harness/README.md)。代码 Metadata 供框架执行，Skill 与 TSDoc/JSDoc 供 Agent 读；Agent 也可以分析代码元数据。

## 先发现能力

从 [完整能力及成员目录](references/capabilities.md) 找到实际根导出、构造方式、签名及对应指南；不以类名后缀猜测。按需求阅读：

| 需要 | 指南 |
|---|---|
| 应用启动、真实资源退出、日志 | [Lifecycle](references/capabilities/lifecycle.md) |
| 任务执行、同根预算、Hook、Outcome | [Workflow](references/capabilities/workflow.md) |
| JSON/YAML 文本解析与序列化 | [Structured data](references/capabilities/structured-data.md) |
| 有界扫描、向量或图查询 | [Query](references/capabilities/query.md) |
| SQLite 持久化及事务 | [Database](references/capabilities/database.md) |
| 受限纯表达式 | [Expression](references/capabilities/expression.md) |
| 可信前台工具 | [CLI](references/capabilities/cli.md) |
| 意图、证据、决策、候选、澄清 | [Semantic interaction](references/capabilities/semantic-interaction.md) |

[组合模式](references/composition.md) · [应用资格实践](references/application-qualification.md)。

## 生成和审查

- 先读 [核心](../../../docs/specs/domain-harness/core.md)、[TS Profile](../../../docs/specs/domain-harness/typescript-profile.md)、[Element](../../../docs/specs/domain-harness/element-package.md)、[工程质量](../../../docs/specs/domain-harness/engineering-quality.md)；按需读 [生命周期](../../../docs/specs/domain-harness/lifecycle-workflow.md)、[组合](../../../docs/specs/domain-harness/composition-trust.md)、[架构](../../../docs/specs/domain-harness/architecture.md)、[命名](../../../docs/specs/domain-harness/identity-naming.md)。规范是权威，Skill 导航不新增运行义务。
- 先确定真实领域需求与验收，再选择 Standard，业务拥有领域规则、专业计算、真实授权、事实及外部效果。不要假设目录之外存在 API；不强制 DSL/额外 Runtime。
- 使用包根 import、直接依赖、原生 Class/Function；类型可见不代表可直接构造。按 EL-09..15 分析完整能力与不变量，不按数量拆类。
- 生成期负责类型、结构、依赖及功能正确性；SDK 不验证任意 Package。实际错误、版本、工件与业务 Oracle 绑定；未执行写 NOT_RUN。
- [状态索引](../../../docs/specs/domain-harness/status-and-decisions.md) 是历史与当前资格的导航，不把候选或历史接受当成新工件 PASS。安装包使用本地规范快照，历史 GitHub 链接仅供溯源。
