# DIS v0.2.0 — LLM × Harness × 双层进化统一契约 R2

**状态：Product/L1 设计建议 / SELF-ADVERSARIAL-REVIEWED / NOT_FROZEN。** 权威 #1496，Draft PR #1497。本稿取代同目录 `LLM_HARNESS_EVOLUTION_R1.zh-CN.md` 关于两层进化、Experience、Function Candidate、局部激活与资格判断的建议；R1 文件保留作历史，不能与本稿拼接为双重权威。本文并非机器 Schema、已实现 SDK API、独立第三方审核或生产验证。配套反例和验收建议见 `ADVERSARIAL_REVIEW_R2.zh-CN.md` 与 `EVOLUTION_CONFORMANCE_R2.zh-CN.md`。

## 1. 一条有机闭环，三个互补职责

**LLM** 是受预算/权限限制的模型生成与分析能力；**Harness** 在 Function 已声明的 Domain 边界内管理上下文、求解、选择、观察、验证和终止；**Evolution** 把真实可验证的求解经验转化为未来可复用能力。三者按每个 Function 的声明**可选地组合**，不是三个相互独立的必装引擎。

~~~text
AOT: seal Function contract, primary implementation, optional resolver/fallback,
     bounded selected LLM/Harness bindings, Experience policy, Evolution Slot
Runtime: call bound Function -> applicable deterministic rule / admitted local slot
     -> exact qualified experience -> promoted reusable subflow
     -> [if unresolved or intrinsically generative] bounded Harness + LLM
     -> real observation -> independent business verification
     -> Evidence/Experience -> candidate selection and synthesis
App:  constrained Rule Candidate -> independent qualification
     -> scoped local data activation (optional; original Function ABI unchanged)
Server: authorized sanitized observations + qualified local candidates
     -> cross-context synthesis/negative testing -> review/promotion
     -> Forge/Build AOT new Element/Package -> governed future activation
~~~

上述是**逻辑责任流而非全局调度 DAG**；无 LLM、无 Harness、无 Meta Server 的 App 依然能够使用已编译智能。历史 v0.3 默认决策来源优先级为 `COMPILED → EXACT_REUSE → PROMOTED_SUBFLOW → BOUNDED_LLM`；其中合格本地 Slot 规则是**已选编译解释器的受控数据策略**，只在声明的 Function 及优先级位置适用，不得改写全局 KDP 权威。若 Function 本身需要生成式模型，允许明确的 `GENERATION_REQUIRED` 路径直接选择已锁定 LLM，而不是把它错误视为可由缓存结果替代。

## 2. 哪些 Function 允许怎样进化

每个可进化的 Public Function SHOULD 在 AOT 前明确 `evolutionMode`，未知或未声明默认为 `NONE`，不能让 LLM 自己决定新执行权限。

| 模式 | 可进化目标 | 成功判据 | 不允许 |
| --- | --- | --- | --- |
| `DETERMINIZABLE` | 知识、规则、Parser/Query、确定性子 Function | 有可复核 oracle；在声明范围内规律稳定且反例可拒绝 | 仅凭近似/自评分全域替换 |
| `HYBRID` | 固化部分子问题和受限流程；其余继续 LLM | 子问题可验证，整体端到端结果保持正确 | 把不可验证部分隐式标为 SUCCESS |
| `GENERATIVE` | 提示模板、上下文/检索、模型/质量校验、固定结构子步骤 | 质量指标/约束/用户评估与实际产物证据 | 缓存一段原创输出直接用于不同用户或伪称完全确定化 |
| `NONE` | 不启用自动候选进化 | 显式人工/产品治理后再改策略 | 背景自动学习或生产热替换 |

可确定化资格是 **domain-scoped** 判断，必须同时满足：可观察/可验证的业务结果；可定义适用范围及反例；重复规则在与生成集独立的数据上成立；失效可检测并回退；成本/风险合理。无法独立验证成功时不得获得 `LOCAL_QUALIFIED`。高风险的业务状态修改、授权、支付、设备副作用或发布审核，不应以本地 LLM 生成规则直接成为执行许可。

**注意**：Function 可在某些输入下采用 `DETERMINIZABLE`、其他输入下采取 `GENERATIVE` 或 Harness；这属于细分适用范围，不要求将 Function 设计成全域单类型。

## 3. AOT 预留的 Function Resolution 与 Evolution Slot

AOT MUST 固定 `FunctionContractDigest`、主实现及依赖、可选的 Harness/LLM Provider 白名单和预算约束、Experience Feature/Validator/Reuse 策略、Evolution Slot 的**解释器与允许语言/Schema/作用域/额度**，以及发行/拒绝/撤销策略。Runtime 不得动态引入不在锁内的 Function、权限、代码模块、Host API 或新的 Tool。

**最小候选声明（示意，不是 Schema）**：

~~~yaml
function: media.player.extractConfig
contractRef: contracts/extract-config.yaml
implementation: {ref: impl/parser.mjs}
resolution:
  compiledFirst: true
  exactExperience: {profileRef: profiles/player-reuse.yaml}
  promotedSubflow: {ref: profiles/player-subflow.yaml}
  fallback:
    harness: sdk.harness.resolve
    llm: sdk.llm.generate
    when: [UNRESOLVED, UNSUPPORTED_PATTERN]
    budgetRef: policies/player-model-budget.yaml
evolution:
  mode: DETERMINIZABLE
  slot:
    id: player-rule-slot
    kind: interpreted-rule-data
    interpreterRef: sdk.rule.evaluate
    allowedSchemaRef: schemas/player-extraction-rule.yaml
    maxSteps: 200
    maxMemoryBytes: 65536
    effects: none
  features: {ref: profiles/player-features.yaml}
  qualification: {ref: validation/player-evolution.yaml}
  localActivation: {scope: app-local, boundary: next-task}
~~~

**Slot 的安全界限**：仅接受经受限语法/AST、Schema、资源上限、确定性运算、来源/适用性校验的**数据规则**；拒绝任意 JS/Python、动态导入、反射、递归无界循环、网络/文件/设备/进程访问、自由 SQL/正则拒绝服务等逃逸面。必须拒绝未知操作符/扩展，不得从 LLM 文本中解读新权限。Interpreter/Validator 的已锁定版本在验证和执行中必须一致。若生成真正的新代码、增加 Function 依赖、修改 Effect 范围，应走 Server/Forge/新 AOT，**不走局部 Slot**。

**AOT 与本地更新不矛盾**：AOT 锁定的是允许读取的“有版本的受限策略数据 + 解释器/验证器/激活协议”，不是让未声明的资源字节热替换主实现。每条局部规则具有 `ruleId + version + digest + qualificationDigest + activationEpoch + scope`；激活为原子操作并可撤销；**已开始的 Task 保持原数据快照与 Package/Function Pin**，新 Task 才能使用新规则。没有原子 pin/撤销能力时拒绝本地激活。局部规则不能自行扩大原 Function 的输入输出、准入策略或授权边界。

## 4. Experience 是什么（及不是）

- `ExecutionTrace`：事实级调用/观察/结果记录，由现有权威持有；不是学习成果。
- `LearningObservation`：成功、失败、未知、冲突、用户纠正等原始**学习信号**，尚未可信；不能充当成功 Experience。
- `Experience`：在明确的 Domain Context 下，被可信的业务验证器证明可复核的一项**解决方法或结果及其边界**，可定位到真实 Trace/Evidence；不是原始聊天、模型思维链或任意 Prompt 文本。
- `ResultCache` / `ExperienceIndex`：加速索引/物化视图，不是 Evidence 的权威存储，不自动产生第二个 KDP Journal。
- `IntelligenceCandidate`：从一个或多个合法 Experience/Observation 提炼的 `KNOWLEDGE | RULE | FUNCTION | ELEMENT | DOMAIN_CHANGE` 变更候选；`targetKind` 是进化目标，**不是** Element 的强制类型。

一个有效 Experience 的**逻辑核心**：

~~~yaml
schema: dis.experience/v0.2-r2-proposal
identity:
  id: exp-example-001
  domainId: media
  ownerScope: app-local
  sourceRunId: run-example
subject:
  element: media.player
  function: extractConfig
  contractDigest: sha256:placeholder
  implementationDigest: sha256:placeholder
  packageDigest: sha256:placeholder
  knowledgeDigest: sha256:placeholder
  targetProfile: browser-example
problem:
  featureProfile: media.player-features/1
  featureProfileDigest: sha256:placeholder
  featureRef: evidence:normalized-features
  problemSignature: sig:scope-local-placeholder
  contextEpoch: observation-epoch-1
  independentCaseKey: scope-local-case-key
solution:
  reuseKind: METHOD_TEMPLATE
  methodSignature: sig:method-placeholder
  verifiedStepRefs: [evidence:step1, evidence:step2]
  outputRef: evidence:result
outcome:
  observedStatus: SUCCESS
  verification:
    status: PASS
    validatorRef: media.player.verify
    validatorDigest: sha256:placeholder
    evidenceRefs: [evidence:verified-result]
reuse:
  applicabilityRef: rules:player-eligibility
  reusePolicyRef: policies:read-only-reuse
  invalidators: [source-digest-changed, knowledge-version-changed]
  expiresAt: null
governance:
  origin: harness-llm
  evidenceIntegrity: verified-ref
  privacyScope: local-only
  exportConsentRef: null
  recordedAt: 2026-11-08T00:00:00Z
~~~

示例字符串/时间是占位符，非真实或有效 SHA。Schema/URI/证据细节仍需机器实现。具体 `features`、`applicability`、`validator` 由业务 Domain Element 提供；SDK 只标准化信封、可交换字段和解析/版本检查。必须携带 Experience 与来源、实际验证结果和受限复用条件之间的可核验关联。**缺失验证器、过期、不匹配、UNKNOWN、来源污染**的记录留为 Observation，不可标记 `VERIFIED_EXPERIENCE`。

### 4.1 两种复用不可混淆

1. `RESULT_REUSE`：仅在纯计算或按当前事实重新校验后具有同等语义时重用结果；需要精确上下文、版本、当前性和隐私范围证明。
2. `METHOD_REUSE`：可复用已验证的规则模板或求解步骤，但必须对当前输入重新执行和验证；不能因“方法曾成功”重放历史 Effect。

可选 `RULE_HYPOTHESIS` 是 Candidate，不是已验证 Experience。本地有失败/反例时可更新失效条件和负面样本，但不把失败标记为成功。

## 5. 程序化 Experience Pipeline（无须 LLM 总结每次调用）

~~~text
KDP / Business trusted event receipts
  -> verify trace correlation & external source evidence
  -> Domain.extractProblemFeatures()       (declared Function/validator)
  -> Domain.normalizeObservedMethod()       (may use LLM proposal, never raw CoT)
  -> Domain.verifyOutcome()                 (trusted oracle, independent of proposing LLM)
  -> if PASS and scope/consent/provenance verified:
       build immutable Experience version + index projection
     else:
       build LearningObservation / negative evidence, NOT reusable
~~~

Event 来源、业务后置条件、外部系统回执、验证者版本和独立 subject digest 需要跨字段一致。对于“LLM 自称成功”“只解析通过”“只观察到缓存命中”的记录，禁止颁发真正 PASS。可选人类审批也是可验证的外部事实，不由模型虚构。

## 6. 如何判断多份 Experience 具有可泛化规律

**程序发现候选，LLM 归纳假设，独立测试决定资格**。相似度/向量匹配只用于召回，不是可信验证。

1. 对每条 Experience 构造两个由 Domain 定义的签名：
   - `ProblemSignature`：规范化领域特征、适用环境、知识/Function 版本、事实来源、时间与允许隐私范围；
   - `SolutionSignature`：真实调用/转换步骤、使用的 public Functions/规则、受控参数类别、结果/验证类型，不包含模型隐性思维链。
2. 去重独立 Case：同一源、同一模板/同一环境克隆、同一次 Run 的重试、同一经验的多次 Cache Hit 不计作独立泛化样本。`IndependentCaseKey` 是**分组/证据线索**而非只要 hash 不同就独立；缺乏来源独立性证据则归入相同 cohort 或未知。
3. 找到同时满足 Problem/Method 兼容性的候选簇，并提取**输入变化维度**与反例。经 Domain 定义的策略决定是否有生成价值；失败 Case 参与定义边界，而非删除。
4. 将来源按网站/设备/版本/时间/数据来源 cohort 隔离为 **Synthesis(生成集)**、**Holdout(未参与生成的验证集)**、**Negative/Boundary(负/边界集)**；同源衍生样本不得跨集合泄漏。Holdout 不足 → `NEED_MORE_EVIDENCE`，不能“第二个 LLM 评审通过”代替独立真实 oracle。
5. LLM 生成规则或 Function Candidate，以及适用范围、不可处理范围、证据映射和自拟测试；自拟测试只能作为补充，不计入独立 Holdout。
6. 用锁定解释器/业务验证器执行自有测试集、Holdout、负例/越界/版本漂移，测覆盖率、正确率、**错误接受率**、回退率、成本/延迟、适用范围变化。任何关键失败不得被平均值掩盖。
7. 按领域风险策略接受 `LOCAL_QUALIFIED` 或继续观测/拒绝；不设置 DIS 全局 `minCases=5` 或“缓存命中 100 次可晋升”这样的机械阈值。

对 `GENERATIVE` Function，可以从 Experience 优化 Context/Prompt/评估/检索/验证或稳定子步骤；不得把原创输出缓存成通用固定答案。特定生成请求依然走选定 LLM，结果仍按业务规则验证。

## 7. 运行状态、升级与治理

区分三类不同状态，禁止一个 `PASS` 混用：

- **Observation/Experience**：`OBSERVED → VERIFIED_EXPERIENCE | NON_REUSABLE | UNKNOWN`。失败不消失，可作为反例。
- **Function/Rule Candidate**：`PROPOSED → SCHEMA_VALIDATED → BEHAVIOR_TESTED → LOCAL_QUALIFIED | REJECTED | NEED_MORE_EVIDENCE`。候选不会自动成为新 Public Function Contract。
- **Server Governance**：`SUBMITTED → SERVER_QUALIFIED → PROMOTED | REJECTED → AOT_SELECTED → ACTIVATED`。Server 的 PASS 仍不自动产生新 Package；显式选择/Build/Activation 才可供生产新实例使用。

### 7.1 局部激活

`LOCAL_QUALIFIED` 并不意味着“对所有场景可用”。必须验证 Slot 内容、scope、digest、合格证据、业务授权、版本与激活协议；只对相应 Future Task 生效。必须能显式禁用、撤销或回滚，且不得回退到未经验证的旧候选。对效果类、特权或不可逆业务操作默认不允许由此增加执行权。

### 7.2 Server 上报

**不需等本地稳定才能上报 Feedback**，但数据须符合明确授权、脱敏、作用域和最小化原则。可上报：匿名聚合使用趋势、授权的 LearningObservation、合格 Experience、LOCAL_QUALIFIED Candidate 与负面结果。不得默认上传私人原始 Prompt/网页内容、设备敏感信息、凭据、完整隐藏思维链；跨租户共享必须有单独证据和治理边界。撤回同意、有效期与删除应影响可用索引和后续训练/候选处理；保留必要最小审计摘要仍须符合实际治理政策。

**本地合格不是 Server 合格**。服务端跨源/版本/环境重新评估、生成 Function/Element/Domain Change Candidate，Forge 处理知识资产与可交付智能，治理主体批准，AOT 重新固定；旧激活实例不自动改变。Server 按收益/风险/回归阈值触发构建，而不是每次收到候选都立即升级 Package。

### 7.3 防止成本与可靠性失控

- 按 Function/租户/设备范围声明模型调用和候选生成的预算、冷却期、去重、并发上限；相同候选簇不能无限生成/自修复。
- Provider timeout/UNKNOWN 不得转换为已完成验证，也不可无确认重复执行 Effect。
- Local Slot 解析或验证超时必须 fail-closed，回退到**已授权**原实现/LLM，不意味着继续使用不安全规则。
- 生成内容来自网页/文档/工具输出时视为**不可信输入**，只能作为数据，不能变成新指令、权限、验证政策或外部目标。

## 8. 两层进化的职责边界

| 责任 | App / Task（快） | Server Meta / Forge（慢） |
| --- | --- | --- |
| 已知 Function / 经验复用 | 按有效性和作用域消费 | 跨应用分析成效 |
| 新未知求解 | Bounded Harness/LLM，取得真实证据 | 复杂跨上下文分析 |
| 经验与候选 | 构造、局部验证、限定范围内规则数据激活 | 去重、泛化、反例、跨 Target/版本验证 |
| Function | 允许向现有 Function 的受限 Slot 贡献**规则数据** | 允许正式改进实现/Contract，受治理 |
| Element / Package | 可以提出 Element Candidate，不本地重打包替换运行实例 | 组合、验证、晋升、AOT 和新版发布 |
| 状态与权限 | Domain Owns Business State；KDP 为既有执行权威 | Meta 不拥有生产 App 的额外执行权威 |

## 9. R2 待定（需后继 L2/SDK 实证）

1. `EvolutionSlot` 在现有 KDP/SDK Target 的可实现公共扩展点、任务边界原子 pin/撤销和兼容版本策略。
2. 与现有 `dh.llm.generate/1`、Harness Context/Tool/Recovery 的真实 SDK ABI 兼容性；不能仅凭示意 Schema 宣称 supported。
3. 跨设备/跨租户的去重签名、匿名化和隐私合规实现；缺少证明时默认为不可跨边界。
4. 各 Domain 的独立 oracle、样本独立性、最低泛化门槛、风险等级、失败/错接收可容忍度。
5. R2 机器 Schema、JSON/YAML/SQLite 参考消费者、负面测试、真实 Node24/CI、独立 exact-SHA Review、Product/L1 审核与正式 L2 Freeze。

R2 是对实现风险的设计层修复，不是合格代码/测试/发布证据。
