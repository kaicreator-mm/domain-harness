# DomainHarness 代码规范

当前使用 v0.11.x 单一内部版本列车；v0.11.1 已完成 scoped 验收，整个 0.11.x 尚未正式 Release。旧版本源码仅通过 Git 历史参考，不保留兼容入口。

1. 修改 TypeScript 前必读 [TypeScript 编码质量 Skill](.agents/skills/typescript-quality/SKILL.md)；创建/修改任何持久标识时必读 [DomainHarness 统一命名 Skill](.agents/skills/domain-naming/SKILL.md) 与 [命名规范](docs/specs/DomainHarness_v0.11.x_NAMING_STANDARD.md)。
2. 源码放入 `src/`，公共 TS 标识符和路径不得携带版本号；代码注释和 JSDoc 必须为中文。
3. 不另建重复 Runtime、Kernel、BUILD 或私有 SDK。现有四 Workspace 的物理布局不等于已经完成所有基础设施的 Package + Element 所有权；严格自举一致性审计见 [Foundation Issue #1668](https://github.com/kaicreator-mm/domain-harness/issues/1668) 与 [Boot/KDP 候选设计](docs/architecture/DomainHarness_v0.11.x_ELEMENT_FIRST_BOOTSTRAP_OWNERSHIP_REVIEW.md)，Owner/L2 通过前不擅改已验收代码。
4. **原生优先、成熟库次之、避免自行重造通用能力**：实现前先评估 Node.js/JavaScript/TypeScript 原生 API 与仓库现有依赖；无法满足实际需求时选择可信、维护活跃且兼容 Node 22/ESM 的成熟库。只有没有合适方案或有明确的可靠性、授权、可验证性等原因时才自行实现，并在现有 Task/PR 简述取舍；不得为微小工具函数无谓引入新依赖。详情见 [防回归手册 §1.1](docs/engineering/DOMAIN_HARNESS_V011X_DELIVERY_QUALITY_PLAYBOOK.md)。
5. 按照 `docs/product` 的 0.11.0 PRD 和 `docs/architecture` L2；旧代码不是兼容要求。
6. 进入 0.11.1+ 开发前，必须阅读 [增量交付质量防回归手册](docs/engineering/DOMAIN_HARNESS_V011X_DELIVERY_QUALITY_PLAYBOOK.md)，在现有 Task Issue 中说明新增职责/信任/权限/状态边界和必要 POS/NEG/ERR；不为规范另建授权门。
7. 修改后的生产与测试都必须 Typecheck；本地先验证变更及其测试，跨包/信任边界走一次 `npm run verify`。一个 PR 尽量只跑一次必要 CI，严禁以 Demo PASS 取代源码质量审查。
8. CI 失败按 Exact SHA → Woodpecker Logs → 一批根因集中修复；需要本地 Agent 时一次任务包括诊断、修复、验证和交付，不分成持续任务。独立 Reviewer 只审核当前必要增量，合并时检查审核 SHA、CI SHA 和 Git tree。

