# DIS v0.2.0 — LLM/Harness/Evolution R2 对抗问题的设计修复定案（候选）

> **地位**：R2 Product/L1 **设计闭环**，关联 #1496 / Draft PR #1497。本文件是 R2 统一进化模型的**限制性解释及最小规范补充**；如 R1/R2 较早文字出现“局部生成新 Function 直接执行”“缓存命中即可泛化”等歧义，以本文的拒绝规则为准。不是已发布 Runtime ABI / 独立审查或生产验证。

## 0. 最小目标

只标准化 `FunctionEvolutionPolicy`、`Experience`、`FunctionCandidate`、`QualificationReceipt`、`LocalRuleActivation` 五个可交换语义对象及一条可选的 AOT 已锁定 `EvolutionSlot`。KDP 不增加第二个 Kernel/Store/Meta 调度器，业务状态仍属 Domain，LLM 是可选生成者而非权限权威，Forge/Meta 实现手段不进 DIS Core。

~~~text
AOT-bound Function -> deterministic / qualified exact reuse
  -> bounded Harness + selected LLM where permitted / intrinsically generative
  -> actual readback + independent Domain oracle
  -> immutable Experience or unverified LearningObservation
  -> source-cohort cluster -> LLM Candidate proposal
  -> independent grouped holdout + negatives + budget/security checks
  -> LOCAL_QUALIFIED only for bounded rule DATA -> atomic future-task activation
  -> consented sanitized feedback / Server independent validation
  -> governance Promotion -> new AOT Element/Package for later activation
~~~

本过程是逻辑步骤，不是所有 Function 的强制工作流，也不要求每一段通过 LLM。

## 1. 对 3 项 P0 的最终设计防线

### P0-A01：自我验证与假 SUCCESS

`ExecutionTrace` 和 `LearningObservation` 不自动具有复用权。Experience 只有在**可信来源的实际操作/只读观测结果**，与已锁定 `DomainValidatorRef + Digest` 的真实回执相互绑定时才能形成。LLM 的 `selfScore=PASS`、自行填写的 `verification.status` 和其自己生成的测试，**不计入**资格证据；未经外部可验证结果只能标 `UNKNOWN` / `NEED_MORE_EVIDENCE`。提出候选的模型不能为同一候选自颁独立证明。序列化后跨进程的资格票据需受信任签发及真实性校验，不能仅用 JSON 中的 `PASS` 字符串。

### P0-A02：规则 Slot 逃逸与 AOT 失效

Slot 仅允许 AOT 已封闭的**声明式规则数据**；必须锁定 interpreter/validator/DSL Schema、Function Contract、Target、Knowledge/Resource 版本、可达能力、效果分类和预算。规则数据不能包含 eval/exec、动态引用/依赖、外部文件网络/设备/进程访问、自由 SQL/正则、递归或未知操作符。必须提供数量/内存/步骤等上限、超时失败拒绝、规范化 digest 以及可信 qualification receipt。Local Rule 数据作为一次**局部激活事件**被选择，不能修改当前已发布 Function ABI。新源代码、新 Function 或新权限仅作为 Candidate，必须经新 Build/AOT。若 SDK 无可信解释器/原子激活，立即将本地路径收窄为 **Candidate+Shadow Only**。

### P0-A03：历史缓存误当当前事实或 Effect

`RESULT_REUSE` 只针对安全、可证明不变的输入及作用域；外部状态查询必须重新读取或验证当前事实。`METHOD_REUSE` 仅复用求解方法，必须重新执行和验证；不得自动重放 Effect。缓存不等于 Tool 权限、用户授权、成功回执、设备测量或 GitHub Exact HEAD。超时/发送后不明标 `UNKNOWN`，禁止通过缓存推断 Effect 未发生或重复执行。

## 2. 7 项 P1 的具体规则

| 编号 | 必要修复（Product/L1 约束） |
| --- | --- |
| A04 | Cache Hit/重试/同一站点模板复制不得算独立案例；按可证明的 `sourceCohort/CaseIdentity` 去重；无证据时保守合并或 UNKNOWN。 |
| A05 | 生成集与 Holdout/Negative 必须按站点/模板/设备/时间/来源组隔离；LLM/修复器**不允许看到**独立 Holdout，泄漏即重建集合。 |
| A06 | Function `evolutionMode` 取 `DETERMINIZABLE/HYBRID/GENERATIVE/NONE`；默认 NONE。生成类可以进化 Context/Prompt/检索/验证，不以旧原创输出替换新请求。 |
| A07 | 来自网页、Prompt、Tool Result、外部文档的内容仅为不可信数据，不能修改 Policy、Evidence、权限、Provider、资格和晋升逻辑。 |
| A08 | Experience 默认 `local-only`；上报有独立的授权/脱敏/租户作用域/期限与删除策略。跨用户/租户不共享原始输入/Prompt/敏感状态；撤销后失效索引。 |
| A09 | 资格和复用至少绑定 Contract、Implementation、Interpreter、Validator、Knowledge、Package、Target、输入 Context Epoch、适用条件与失效规则，漂移→重新验证或不复用。 |
| A10 | Function/设备/租户限制模型调用、候选生成/自修复、并发、预算和去重/冷却，Provider 超时/UNKNOWN 不自行补写 PASS 或无条件重复 Effect。 |

## 3. 2 项 P2 的治理闭环

- **A11**：分离 `Observed` / `VerifiedExperience` / `Candidate` / `LocalQualified` / `ServerQualified` / `Promoted` / `AOTSelected` / `Activated`。LocalQualified 不是授权 Promoted，更不是新公开 Function。明确 Meta 分析者、Forge 生产者、审核/晋升决策者、AOT 激活者之间的 Authority Matrix；每次新的权限与作用域仍按目标 Domain 治理。
- **A12**：必须检查业务实际正确率、错接受率（false acceptance）、负例命中、覆盖率、回退行为、运行预算、延迟和隐私；不能仅以 LLM 数量下降晋升。关键安全负例未通过不能靠平均指标抵消。

## 4. 最小机器数据契约（设计语义）

`Experience`（**不是通用聊天记忆**）：

~~~yaml
schema: dis.experience/v0.2-r2
identity: {experienceId: exp-1, runRef: run-1, sourceCohort: site-template-A}
subject: {element: media.player, function: extractConfig, contractDigest: sha256-placeholder}
versions: {implementation: sha256-placeholder, interpreter: sha256-placeholder,
           validator: sha256-placeholder, knowledge: sha256-placeholder,
           package: sha256-placeholder, target: node-demo}
problem: {featureProfileDigest: sha256-placeholder, sourceDigest: sha256-placeholder,
          scope: app-local, contextEpoch: epoch-1}
solution: {methodSignature: extract-streams-src, resultRef: local-evidence-ref}
outcome: {status: SUCCESS, oracle: trusted-domain-validator, verification: PASS,
          evidenceRefs: [local-verifier-receipt]}
reuse: {mode: RESULT_REUSE, immutable: true,
        invalidators: [SOURCE_CHANGED, VERSION_CHANGED, SCOPE_CHANGED]}
governance: {privacy: local-only, exportAllowed: false}
~~~

运行消息中应有实体对象的签发与校验，不能把上述字段原样从 LLM 输出中受理成正式 Experience。

`FunctionCandidate` 不等于新 Function Contract。声明 `targetElement`、`targetFunction`、`changeKind`（`RULE_DATA` 等）、`candidateDigest`、`generatorRef`、`sourceExperienceIds`、`applicability`、`negativeEvidence`，并接受机器 Schema + DSL 安全校验。

`QualificationReceipt` 需证明独立可信验证者、Function/Slot/Rule/解释器/Target/验证器/测试集摘要、样本来源组隔离、错误接受指标及 `LOCAL_QUALIFIED | REJECTED | NEED_MORE_EVIDENCE`，生产跨进程需签发和验证。资格必须能被撤销。

`LocalRuleActivation` 是从 `RuleDigest + QualifiedReceipt` 到 `activationEpoch` 的原子选择，明确 `scope=app-local`，**只对后继 Task 生效**；旧 Task 保持原快照。若规则因安全问题紧急撤销，可阻止仍在使用的旧快照（fail-closed）。灰度、回滚、删除与重启一致性是生产 ABI 的后续门禁。

`ServerPromotion` 另需服务器独立资格、授权审批、Package AOT exact Digest、目标环境与未来激活身份。旧实例不自动变化。

## 5. 经验泛化判断必须程序化

1. 只从可信 VerifiedExperience 提取 Domain-defined `ProblemSignature` 与可观察 `SolutionSignature`。方法相似不等于“相同输出字符串”；模型隐藏推理链不可作为 Trace。
2. 使用来源 cohort/领域约束而非文本相似度作最后资格判断；Cache Hit 只计 ROI，不能计样本。
3. 在**候选生成前**按来源组切分 `Train`、`Holdout`、`Negative`；禁止生成模型看到 Holdout。持出集被反复用于修复后需要轮换。
4. 当多个独立成功 Case 呈现相似可观察解法且具有真实验证 oracle 时，可**触发** LLM 生成候选，但不是直接晋升。最少样本、阈值、错误接受限额由 Domain 风险策略控制，DIS 不规定全局 N。
5. 静态 DSL/资源/Effect 边界验证 → 未参与生成的 Holdout 业务 oracle → Negative & Boundary 检查 → `LOCAL_QUALIFIED` 或失败/缺证据。服务器另进行跨设备/应用验证。
6. 创作/生成型 Function 按 `GENERATIVE` 进化 Prompt、检索与验证；不能把通用答案当成目标。

## 6. 可执行 Demo 验收与限度

独立参考目录 `examples/dis-v020-evolution-demo/`（若实际提交代码），提供无第三方依赖的 Node ESM Fixture。预设验证矩阵 E01–E10 和 N01–N15，覆盖 A01–A12。允许 `FakeLLM` 检验接口，不许称作真实模型调用。Fixture Oracle 不是生产外部回执，模拟 AOT/Server 不能宣称 SDK/Forge/真实 Target 已接入。

**设计修复完成条件**：12 项反例均被明确处理并可对应独立测试。**实现关闭条件**：实际 SDK/Target 演示、机器 Schema、合格模型 Provider/Server、Node24/CI、另一个不同 Domain 消费者、独立 Exact-SHA 审核和 L2 Freeze。两者不能混用。
