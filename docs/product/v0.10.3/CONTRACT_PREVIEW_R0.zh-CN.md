# DomainHarness v0.10.3 · 契约先行 R0（候选，非冻结）

[English](CONTRACT_PREVIEW_R0.en.md) · [文档中心](../../README.md) · [v0.10.3 总入口 #1392](https://github.com/kaicreator-mm/domain-harness/issues/1392)

> **状态：PRODUCT/CONTRACT_PREVIEW，仅供下游预集成；不是正式 SDK TypeScript ABI、npm 发布，也不授权实施。** v0.10.2 Tag 及其 RQ CONDITIONAL 不变。构建生产者和消费者应绑定确切预览版及原始 Git SHA，不得将本文当成已发布 API。

## 为什么先给下游契约

先定义 **可以稳定交换的纯数据及可观察行为**，让 ai-rexform/Tally 等应用用自己的 B/Host 薄适配器实测；随后据真实反馈修改候选契约，再冻结 Product/L1→L2→Task DAG，实施并做一次整合对齐。不要为了赶进度跳过冻结，也不让下游必须等版本完成。

| Concern / 入口 | 上游归属 | 预览阶段下游可做 | 未承诺 |
| --- | --- | --- | --- |
| [LLM 双协议独立选择](LLM_PROVIDER_SELECTION_R0.zh-CN.md) | [#1396](https://github.com/kaicreator-mm/domain-harness/issues/1396) | 在 B 里声明所需协议，复用实际 Host SDK | 已有公开 `llm.generate` npm 导出 |
| [动态表单 Guided Journey](https://github.com/kaicreator-mm/domain-harness/issues/1397) | [#1395](https://github.com/kaicreator-mm/domain-harness/issues/1395) / #1397 R0 DTO+Schema | 预生成 StepTemplate → 逐步选择 StepSpec → 验证用户/LLM 候选 | 内置 UI 表单引擎、在线随意生成 Tool |
| [任务/元数据层与多级进化](TASK_META_EVOLUTION_R0.zh-CN.md) | [#1398](https://github.com/kaicreator-mm/domain-harness/issues/1398) | 真实任务写出脱敏 EvidenceRef，离线候选/晋升显式隔离 | 另一个元数据 Kernel、自动生产晋升 |
| 真实 SDK 修补 | [#1393](https://github.com/kaicreator-mm/domain-harness/issues/1393) P1、[#1394](https://github.com/kaicreator-mm/domain-harness/issues/1394) P2 | 原下游继续独立修复、报告可复现差异 | Provider 协议实现替代 npm 代码完整性修复 |

## 三阶段动态表单契约（与 #1397 互补，不重复定义 DTO）

1. **构建前准备 / Producer：** 领域 B/设计者预先产出步骤问题、选项、Schema、多语资源键、适用条件、所需证据、错误/恢复路径、复用子流程。经过验证的版本及摘要才可放进选定 Domain App/Domain Data；没有理由每次展示表单都重新 BUILD。需要时可让 LLM *提出*模版候选，但验证/审查/封闭选择在未来部署前完成。
2. **运行时选择 / B + S：** 使用用户目标、已确认业务事实、实时 Host 观察结果、Effect ACK/FAIL/UNKNOWN、暂停/返回/跳过状态，**只组合当前下一步**的纯数据 StepSpec。S Feature 可统一候选排名、Schema/Context；B 判定业务合法性；K 仍掌管准入、状态、Replay 和 Effect Permit。UI 仅按 StepSpec 显示、收集输入。
3. **可选 LLM 建议 / C + S：** 所选模板不能解决时，有限预算请求模型，得到 **NextStepCandidate**；检查候选 StepKind/option/refs/版本/来源/当前适用性后才能提出 StepSpec，绝不直接建立 Tool、变更冻结内容、批准副作用或自动升级 Meta 规则。不可用时返回 `ASK_EVIDENCE | WAIT | BLOCKED | HANDOFF` 等由 B 明确定义的分支。

详细 StepSpec/Outcome/Advisory 原型由 **#1397 的三文件 DTO/JSON Schema 草案**单独审核与维护；本索引不重做一套互不兼容字段。

## 契约与测试责任

- 公开调用行为只能依据实际 v0.10.2 `K/S/B/C`、`buildV10App` 和 `load` 已有接口；拟议 `llm.*` 等仅是 v0.10.3 的候选 Operation ID，不是假定已实现。
- 第一步验证：一个下游只选择 OpenAI-compatible、另一个只选 Anthropic-compatible；同时安装两个包的 App 必须对每个路由明确绑定 Provider，不能靠“最新/默认/覆盖”。
- 动态表单：一个目标多种状态，离线规则能给不同下一步；失败→诊断/恢复；LLM 异常为候选拒绝；无 LLM 仍能完成主路径。
- 进化：旧任务保持已选版本，新批准方案只能进新实例/显式迁移；任务层与元层传递脱敏来源证据，不转让生产执行权限。
- 两种协议互操作仅保证**明示可用的公共交集**；OpenAI Responses、Claude 特殊缓存/思维块、流式 Token 等先做能力探测，不推定兼容。

## 下游契约对齐机制（契约先行，不先冻结）

`R0 PREVIEW`（本 PR 与 #1397，同步试用，可修改） → `R1 REVIEWED CANDIDATE`（独立评审与两种下游消费证据） → `PRODUCT/L1 FREEZE` → `L2 CONTRACT FREEZE` → 并行叶子开发 → `FINAL ALIGNMENT`（在**一个**固定候选 SHA 上比较最终 ABI/语义与下游适配）→ Release Qualification。

每次变更记录：`previewRevision`、`exactSHA`、影响字段/语义、`ADDITIVE|MIGRATION_REQUIRED|BREAKING`、受影响下游、迁移样例、真实测试 EXIT。冻结前允许有依据的破坏性修正，但必须标出；冻结后不得悄悄改语义而不做受限 amendment。下游可以在自己的仓库使用薄适配器，**但不得声称 v0.10.3 SDK 已提供这些功能**。

**Gate:** `PRODUCT_FREEZE=NO; L2_FREEZE=NO; TASK_DAG_AUTHORIZED=NO; SDK_IMPLEMENTED=NO; DOWNSTREAM_ALIGNMENT=PLANNED`.
