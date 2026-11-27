# DomainHarness 0.11.x · Language-Native Domain SDK

> 当前阶段：0.11.5 B1/B2/B3 已限定独立接受并合入版本列车（R66，#1777，`0077fb5a19d81926b9e5051e51b4859270f4ed46`）。T09 安装工件收口、T10 独立陌生消费/维护与 T11 完整资格仍是独立门禁；尚非发布或完整产品 PASS。

DomainHarness 0.11.x 采用 TypeScript/Node 原生语言机制重新实现，**没有旧 Boot/PackageSystem/Lock/Pin/FunctionRef/Target 执行系统，不保留 0.10.x 兼容入口**。Package 是普通静态 ESM 插件模块集合，Element 是可复用的 Class；普通 Function 直接通过 import/export 调用。Metadata 是框架读取的代码，Skill/TSDoc 是 Agent 辅助文档。

SDK 唯一公开产品为 `@kaicreator/domain-harness`，包含最小生命周期 `KernelLifecycle`、可选 XState Standard Workflow、原生 Hook/预算/具名路由组合以及 JSON/YAML Standard Readers、Bounded Query、SQLite/SQL、Vector/Graph Query、Bounded Expression，以及 #1724 S04 的 `CliElement`（可信前台 CLI，R9 源码提取已接受）和 `runRecognitionHandling`（固定双角色组合候选，实际新工件验收另记）；领域知识、识别/处理逻辑和真实授权业务动作仍由应用负责。底层 Node API 不需要全部包成 Element。0.11.5 在同一原生 Workflow 根中增加受控固定节点、类型化动态区域/子区域、可选两协议 Model 及有界实际观察；无需 LLM 也可完整运行专业 Function。

SDK **消费者**支持 Node.js >=22.12.0；仓库 **开发/完整验收工具链**由于 ESLint 10.11 需要 Node.js >=22.13.0。采用单 SDK Workspace 的 Git monorepo。仓库在 Node >=22.13 执行 `npm ci && npm run verify`；真实外部消费者会独立安装 SDK 并验收 ESM、类型和预算行为。已接受的 0.11.2 R65 消费者实际使用 Node 22.12.0，具体平台和证据见下文；不能将历史证据晋升为新 SHA 的测试结果。

SDK 使用入口：[完整公开 API 与入门](packages/domain-harness/README.md)；已安装包内的 README 提供固定 SHA 规范与 Skill 导航。优先直接复用已有 Standard，不重复生成通用机制（CORE-13/14、QA-09）。

权威规范：[Canonical 目录](docs/specs/domain-harness/README.md) · [TypeScript Profile](docs/specs/domain-harness/typescript-profile.md) · [Agent Skill](.agents/skills/domain-harness-spec/SKILL.md)。

`docs/architecture` 下早期 Boot/BUILD/Pin/FunctionRef 文档仅用于历史审计，不是现行可执行规范。v0.11.1 原生 SDK 源码在 PR #1694 经 R151 整树初审 `REWORK P1=2/P2=5` 后修复，并经 R160 限定独立复审 `ACCEPT_SCOPED P0/P1/P2=0`，Woodpecker #3151 对应 PR Exact HEAD，合入 `version/v0.11.x@452e2212fb8a25168ee62d4e793897d77416cb92`（合并树文件差异为零）。**这是内部阶段源码交付，不是 main 合并/Tag/GitHub Release；整个 0.11.x 完成后才统一发行。**

## 当前阶段与证据

- [0.11.2 R65 限定完成](https://github.com/kaicreator-mm/domain-harness/issues/1612#issuecomment-7141533062)：受审 `566cd3129a6ef51bfc40e7d4a018530cabd965a8`，Woodpecker #3184 SUCCESS，DI-L1 12/12；R63 实际同一 SDK 工件的 Windows x64、Linux x64 glibc 2.36 / Node 22.12.0 消费通过。不声称其它平台合格。
- [0.11.3 R94](https://github.com/kaicreator-mm/domain-harness/issues/1757#issuecomment-7187545899) 已完成内部阶段；[0.11.5 R66](https://github.com/kaicreator-mm/domain-harness/issues/1776#issuecomment-7214521543) 三领域源码组合限定接受，后继 [T09 #1778](https://github.com/kaicreator-mm/domain-harness/issues/1778)；持久执行属 .6。
- [状态与证据索引](docs/specs/domain-harness/status-and-decisions.md)。文档更新不等于新源码验收、正式发布或 npm 可公开下载。
