---
name: domain-harness-spec
description: DomainHarness v0.11.x 唯一规范导航；TypeScript 原生 Package 插件、Element Class、Standard/Business、KDP Order、静态可信和迁移审核。
---

# DomainHarness 规范 Skill

**本 Skill 指导 Agent 阅读规范、生成、验证和审查，并导航已验证工程经验；不是第二份规范。** 唯一原文：[规范目录](../../../docs/specs/domain-harness/README.md)。代码 Metadata 供框架执行，Skill 与 TSDoc/JSDoc 供 Agent 读；Agent 也可以分析代码元数据。

## 先读什么

1. 必读 [core.md](../../../docs/specs/domain-harness/core.md)；TS 生成/审查必读 [typescript-profile.md](../../../docs/specs/domain-harness/typescript-profile.md)。
2. 按需读取 [Element/Standard](../../../docs/specs/domain-harness/element-package.md)、[生命周期/Workflow](../../../docs/specs/domain-harness/lifecycle-workflow.md)、[静态组合与交付](../../../docs/specs/domain-harness/composition-trust.md)、[架构](../../../docs/specs/domain-harness/architecture.md)、[命名](../../../docs/specs/domain-harness/identity-naming.md)、[工程质量](../../../docs/specs/domain-harness/engineering-quality.md)。
3. 对照 [迁移状态](../../../docs/specs/domain-harness/status-and-decisions.md) 与 GitHub 当前 Exact SHA，不用旧历史 ABI 推断新源码已经合格。

4. 设计复杂 Domain App、封装 Library/CLI/外部 Tool、组合 Knowledge/Workflow、组织跨域依赖或设计资格 Demo 时，读 [需求驱动应用资格实践](references/application-qualification.md)。依据具体任务选择相关小节；不把示例的业务政策或 Linux 特定实现当成通用规范。

## 生成/审查要点

- Package 是静态 ESM 插件集合；Element 是一个内聚 Class；Function 是模块函数/类方法。优先复用 SDK Standard Elements；Business 不够用再自定义。
- 按 [CORE-13/14](../../../docs/specs/domain-harness/core.md) 与 [QA-09](../../../docs/specs/domain-harness/engineering-quality.md)：优先使用 SDK 的实际 Standard 实现，不重复生成通用机制；先分析真实领域需求，再辨识领域专有规则和通用职责。遇到共同能力缺口，记录真实用途、重复实现及 SDK 改进候选，不虚构已有 API，不为省代码降低业务正确性。SDK 设计/审查优先验证 Agent 凭公开入口、类型、规范和本 Skill 可完成真实任务，并兼顾人类用同一 API 手工实现；不强制另设 DSL、生成器或 Runtime。
- 元数据是框架读取的普通 TS 代码（如 Order）；TSDoc/JSDoc 与本 Skill 说明责任，不产生独立运行时选择/权限模型。
- 静态 import 与 npm 直接依赖；KDP Order=0，Core Order 互异。生成期检查结构/TS 类型/必要测试，不让 SDK 运行期重建依赖、Lock/Pin、函数分派。
- Init/Exit 可选，无则跳过；框架按 Order 正常启动并在未捕获异常时打印脱敏日志、执行可行 Exit、失败退出。
- 记录 `REPO / TASK_ISSUE / PR / EXACT_HEAD / SPEC_FILES_READ / CODE_GAPS / VALIDATION / P0/P1/P2`。无实际测试就写 NOT_RUN；需本地 Agent 时只给单次有限任务，不把 v0.11.1 基础工作转移至 v0.11.2。

- 0.11.3 交互任务先读 [LIFE-14（T31A 已接受）](../../../docs/specs/domain-harness/lifecycle-workflow.md#life-14--standard-interaction0113-t31a-已接受) 与当前 SDK README；以 #1613 R25 修订冻结及 #1733 R22 为准。优先同根 InteractionElement，不重复写 pending/关联/失效/字段校验；领域提供专业知识、规则及真实授权。
- T31B 已接受 [LIFE-15](../../../docs/specs/domain-harness/lifecycle-workflow.md#life-15--standard-evidence0113-t31b-已接受)：按 #1736 资格使用 `resolveEvidence`、`invalidateEvidence`，域提供真实来源/当前 scope/revision、显式 accepts、等价及可选 rank、完整 changed/dependencies；默认/推荐不替代 authority/user，先失效后重取证，不能把 complete 当 READY。R30限定验收不等于已发布。
- T31C 候选 [LIFE-16](../../../docs/specs/domain-harness/lifecycle-workflow.md#life-16--standard-decision0113-t31c-候选)：按 #1738 资格使用 `selectNextDecision`，领域从当前证据提供四态判断及依赖、优先级；标准选择必要可执行项，跳过不等于满足，unknown/conflict 不当 no；ready 不代表业务 READY 或授权。不要重写排序/依赖/跳过判断，不引入第二执行器。D–F 依赖按 #1613。

## 已验证实践：生成与审核时的关键提醒

- **需求先行**：先独立分析领域需求、知识、约束、异常、验收 Oracle，再映射当前公开 SDK；不要以已有 API 缩减真实需求，也不要为了覆盖 SDK 功能虚构业务。保留 baseline，按确证根因修正业务、共享 Element、SDK、规范或 Skill。
- **外部计算**：按真实输入/输出合同验证 Library/CLI/HTTP；不能以退出码0、元数据、正常回包或 mock 证明计算正确。独立核对输出、关键不变量及失败时的实际副作用。CLI 明确平台、进程/管道所有权、超时及结束合同。
- **组合与预算**：业务若规定总额度不足不得开始外部计算，应在启动前验证完整阶段所需额度；SDK 逐次保留共享根预算，不推测未来业务调用。普通 invoke 的包装值不等于业务成功；预期 WorkflowOutcome 用 invokeOutcome/leaf 保留状态、稳定错误码及安全阶段。
- **知识与外部状态**：表达真实领域不变量、适用范围、来源/政策修订；独立检查结果与必要最优性证据。持久操作需要验证真实效果、授权、读取既有记录及资源隔离；重复写请求不等于只读查询。
- **复用与交付**：先证实两个用途再抽取共享 Element；检查实际依赖闭包而不只是 import。无关领域的第三方库、CLI 和环境不能成为必需依赖。区分真实 clean install、留存依赖恢复与 mock；按任务范围实测。
- **反例驱动**：冻结正常边界、临界额度、失败、资源回收、政策修改和独立对照；验证真实失败不会误报 COMPLETE。证据绑定 Exact SHA，分开作者运行与独立重放，不以历史 CI 或同一日志哈希证明新运行。

实践依据：[#1720 R72](https://github.com/kaicreator-mm/domain-harness/issues/1720#issuecomment-7143284440)、[R73 合并归档](https://github.com/kaicreator-mm/domain-harness/issues/1720#issuecomment-7143329514)。以上是现行规范的实践导航，不新增 SDK Runtime 义务，不自动启动后续版本或强制所有应用采用相同测试集合。
