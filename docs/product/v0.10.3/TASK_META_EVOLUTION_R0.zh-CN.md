# v0.10.3 · 从 v0.3 回溯的任务层／元数据层、多级进化契约 R0

[English](TASK_META_EVOLUTION_R0.en.md) · [契约首页](CONTRACT_PREVIEW_R0.zh-CN.md) · [历史回溯 #1398](https://github.com/kaicreator-mm/domain-harness/issues/1398)

> **重要纠偏：** “任务执行层 + 元数据/经验演化层”是本次为下游使用而提出的**职责视角**，不是声称 v0.3 当年定义两个独立 Runtime 或独立 Kernel。v0.3 冻结 PRD 明确反对第二个并列 Harness 控制运行时。

## v0.3 实际冻结的两条不同轴

**轴 A：一个任务里如何解析决策（四种来源的优先顺序）。**

```text
规则／已编译领域知识
  → 精确语义结果缓存
  → 已晋升并且适用的子流程
  → 有界 HarnessMachine / LLM 兜底
  → 结构化结果候选 → 当前 B/K 的合法性／准入
```

来自 [v0.3 PRD §8](../DomainHarness_v0.3_PRD_FROZEN.md) 和 [架构基线 A5](../../architecture/DomainHarness_v0.3_ARCHITECTURE_BASELINE_FROZEN.md)。这**不是** #1395 当前写的“规则→晋升流程→精确缓存→LLM”原顺序。确有业务条件可改变优先级时应显式声明策略，不能声称那是历史 v0.3 冻结行为。

**轴 B：跨多次任务如何让未知知识逐步确定化（成熟度/权威）。**

```text
观察到的真实结果
  → Candidate（模型/人提出）
  → Validation / Evaluation（独立验证）
  → 显式 Promotion（有审批权的人/部署治理）
  → 被下次 BUILD 选择并固定版本／摘要
  → 新实例中作为规则、知识、经验、子流程复用
```

历史目标：未知问题 → LLM 求解 → 精确结果复用 → 有效解决模式 → 必要时转成确定性规则。但**自动提升候选成为生产规则在 v0.3 明确不允许**。同一执行 Journal 的幂等重放和跨任务的语义缓存绝不可混淆。

## “两层”的推荐职责，而非双 Runtime

| 层 | 负责什么 | 不负责什么 |
| --- | --- | --- |
| **Task / Business 实例层** | 使用已选 K/S/B/C，执行业务 Workflow；消费当前精确版本规则/缓存/已晋升流程；必要时有限调用 LLM；记录真实结果、错误、来源与步骤 | 自动训练修改生产组件；让模型代替 Effect 许可；改变运行中实例的 Package pin |
| **Meta / Metadata 演化生产者层** | 汇总**获授权且已脱敏**的跨任务证据；生成/整理 Candidate；评价/仿真/比较新规则、表单模板、子流程；提出明确审核/晋升要求 | 第二个 K Primary、自动生产部署、凭未批准 Shadow 数据热替换当前实例 |

所谓“元数据层”可以复用独立的 **task-meta** 运行证据/Token/Trace 采集，不应在 DomainHarness 再造一个中央观测库。真正的业务事实和 Device/Task Status 仍归对应 Business/应用；DomainHarness 可提供**可选的标准证据交换语义**，不要求每个下游都实现 Meta 层。

## 建议的最小数据交换（**暂不宣称公开 TypeScript ABI**）

- `RunEvidenceRef`：`sourceRepo`、`sourceVersion`、`sourceDigest`、`executionRef`、`businessScope`、`redactionClass`、`observedAt`、`outcomeStatus`；**可验证来源**，不是匿名“模型说已通过”。
- `DecisionEvidence`：决策源 `rule|exact-cache|promoted-workflow|model`、所用策略/知识摘要、引用的当前证据、模型实际调用次数及 `measured|provider-reported|unavailable` 证明方式。可按需导出耗时/成本到 task-meta，但不能靠用户传入数据伪造真实模型调用。
- `CandidateArtifact`：`kind=rule|step-template|prompt|subworkflow`、内容摘要、兼容范围、适用条件、必要验证样例、来源引用；**没有执行权**。
- `ValidationReceipt`：执行测试和语义/副作用负例后的可复核来源与 exact SHA；不等于晋升审批。
- `PromotionDecision`：授权操作者、所批准 digest、兼容范围、批准记录；`ActivationPin`：下一次选用的确切 Package/Domain Data 版本。Promoted≠Activated≠Executed。

这些名称只是 R0 信息单元候选；应优先映射 v0.10.2 真实 public ABI 和 task-meta 可用的 trace 数据结构，不重复发明第二个 Evidence 引擎。仅在当前公共接口缺少必要证据时才增加独立 S Feature 或 C 数据适配。

## 下游采用与验收

- ai-rexform：同一个 GMS 目标因设备观察事实不同而选择不同预制步骤；不需要模型；新案例经过证据验证和显式晋升后，**下一版本**可优先走规则/缓存。
- Tally：跨 Task 的审批决策复用经过审核的经验，但每次仍检查当前 Task/Claim 权限与有效性。
- task-meta：提供跨任务真实运行数据，不能签发 DomainHarness K Permit、Release PASS、生产 Promotion。
- 抗例：Shadow/candidate/LLM 输出不得变成生产 Effect；旧实例重放仍保持原 digest；过期证据不作为精确缓存；取消/失败/UNKNOWN 不得作为成功数据自动学习。

**研究门禁：** 回溯 v0.3 的规则/缓存/晋升/Shadow 设计后，逐项检查 v0.10.2 实际公开路径，按 `REACHED|SOURCE_ONLY|LEGACY_ONLY|OUT` 分类；下游至少两种真实用例提出可复用缺口之前，不开第二套大系统。

**状态：** `RESEARCH_R0=RECORDED; METADATA_LAYER_AS_SEPARATE_RUNTIME=NO; PRODUCT_FREEZE=NO; L2_FREEZE=NO; PROMOTION_IMPLEMENTED_BY_THIS_DRAFT=NO`.
