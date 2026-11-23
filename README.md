# DomainHarness 0.11.x · Language-Native Domain SDK

DomainHarness 0.11.x 采用 TypeScript/Node 原生语言机制重新实现，**没有旧 Boot/PackageSystem/Lock/Pin/FunctionRef/Target 执行系统，不保留 0.10.x 兼容入口**。Package 是普通静态 ESM 插件模块集合，Element 是可复用的 Class；普通 Function 直接通过 import/export 调用。Metadata 是框架读取的代码，Skill/TSDoc 是 Agent 辅助文档。

SDK 唯一公开产品为 `@kaicreator/domain-harness`，包含最小生命周期 `KernelLifecycle`、可选 XState Standard Workflow、原生 Hook/预算/具名路由组合以及 JSON/YAML Standard Readers；底层 Node API 不需要全部包成 Element。

SDK **消费者**支持 Node.js >=22.12.0；仓库 **开发/完整验收工具链**由于 ESLint 10.11 需要 Node.js >=22.13.0。采用单 SDK Workspace 的 Git monorepo。仓库在 Node >=22.13 执行 `npm ci && npm run verify`；真实外部消费者会独立安装 SDK 并验收 ESM、类型和预算行为。#3149 不能代替精确 Node 22.12 的消费者运行证明。

权威规范：[Canonical 目录](docs/specs/domain-harness/README.md) · [TypeScript Profile](docs/specs/domain-harness/typescript-profile.md) · [Agent Skill](.agents/skills/domain-harness-spec/SKILL.md)。

`docs/architecture` 下早期 Boot/BUILD/Pin/FunctionRef 文档仅用于历史审计，不是现行可执行规范。完整 0.11.1 仍须通过最终 Exact-SHA 独立审核后才能宣布完成或发布。
