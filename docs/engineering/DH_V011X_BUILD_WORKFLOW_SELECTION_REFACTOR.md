# DomainHarness 0.11.x：BUILD 超大函数的第一次职责拆分

## 问题

T12 之后 `tooling/build/src/build.ts` 约 1146 行，唯一 `runBuild()` 约 875 行。原有一个函数同时完成依赖闭包、Element/Function 选择、Workflow 递归、Reader/Hook 与资源授权、Lock 组装和组合 App Package。文件长度不是独立缺陷；**相互耦合的流程阶段在同一个局部作用域内**才是长期维护风险。

## 本 PR 已实施的有限拆分

- `workflow-selection.ts`：WorkflowRoot/子 Workflow 的解析、唯一性/循环/深度、跨 Package 直接 Extension 与公开性、FunctionRef 显式 imports、Reader JSON/YAML 的资源/字节校验。沿用原有 `BuildRefusal` 和拒绝码，不创建第二套 BUILD、Lock 或运行时策略。
- `selection-types.ts`：BUILD 私有 LoadedElement/ResolvedFunction，原始 TypeScript 类型结构保持不变。
- `build.ts`：只保留一次 `selectWorkflows()` 阶段调用，返回 `sealedWorkflows` 和 `selectedWorkflowRoots` 后进入原有 Function/Lock 选择和封存路径。

不能因函数行数降低就宣布安全能力合格。**执行权限仍必须由现有选定包、Target/FunctionRef、直接 Extension 及资源 Digest 决定**，不得在 Runtime 重新选定。复用 T12 安全修复与实际正反例。

## 后续按真实风险逐步拆分

暂不在同一 PR 中移动 Package 依赖选择、Core.Order、Init/Exit、Lock 组装和错误语义。完成当前阶段 Exact SHA BUILD、Typecheck、Lint、测试与最小独立增量审核后，再评估这些职责是否需要单独抽取，避免一次性搬迁整个 875 行函数而放大失效范围。

对应 [0.11.x 工程质量总控](https://github.com/kaicreator-mm/domain-harness/issues/1563) 与原 T12 [#1628](https://github.com/kaicreator-mm/domain-harness/issues/1628)。本 PR 为质量重构，不替代 T12 R10 P1/P2 的独立安全资格、不授予 T13/T14 合并或 Release。
