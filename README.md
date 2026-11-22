# DomainHarness 0.11.x · 单一嵌入式 SDK（全量重写）

纯净 Element-First Git monorepo：内部有 Contracts、私有 Composition 实现 `tooling/build`、Microkernel 和公开 SDK 四个 Workspace；**Consumer 只声明一个公开产品 `@kaicreator/domain-harness`**，通过 `/runtime` 与 `/composition` 使用能力，不能再显式安装独立 BUILD。Domain Package 是可由人工/ChatGPT/Agent 直接编写的合规文件集合，Forge/Generator/独立 Assembly 不是前置。旧版源码只在 Git 历史中。

最低 Node.js 22.12.0。运行 `npm ci && npm run verify`，执行完整的单一 Domain App Demo `examples/basic-domain-app`。

[源码架构与完整调用流程](docs/architecture/DOMAIN_HARNESS_V0110_CODE_AND_CALL_FLOW.md) · [0.11.0 产品 PRD](docs/product/DomainHarness_v0.11.0_ELEMENT_FIRST_PRODUCT_PRD_CANDIDATE.md) · [L2](docs/architecture/DomainHarness_v0.11.0_L2_ARCHITECTURE_CANDIDATE.md) · [TypeScript Skill](.agents/skills/typescript-quality/SKILL.md) · [重构工程经验](docs/engineering/DOMAIN_HARNESS_V0110_REFACTOR_LESSONS.md) · [后续版本防回归手册](docs/engineering/DOMAIN_HARNESS_V011X_DELIVERY_QUALITY_PLAYBOOK.md)

当前内部阶段：v0.11.1 T11–T14、R53/R58 和 [R60 W01–W08 集成 PR #1663](https://github.com/kaicreator-mm/domain-harness/pull/1663) 已受审合入 `version/v0.11.x`（[Task #1656](https://github.com/kaicreator-mm/domain-harness/issues/1656)，R72 `ACCEPT_SCOPED` P0=0/P1=0/P2=1，[CI #2979 SUCCESS](https://ci.kaicreator.com/repos/18/pipeline/2979/1)）；两个普通 Standard File Element `dh.std.file.json/yaml@1.0.0` 已在 [Catalog](docs/architecture/DomainHarness_v0.11.x_STANDARD_ELEMENT_CATALOG.md) 以 Node22 ESM `STANDARD_ACCEPTED` 限定准入，剩余非阻塞 P2 的预分配边界见 Catalog。0.11.2 不承接本次强制优化；整个 0.11.x 尚未对外 Release。
