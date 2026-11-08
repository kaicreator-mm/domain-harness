# DIS v0.2.0 — Demo 验证总索引、证据依赖与历史归档（R12 组织化）

> **实践模式：** [ADS PR #1362](https://github.com/kaicreator-mm/ai-development-standard/pull/1362) 的“现有主 Issue + Git 版本证据 + 按需具体 Issue”，仅复用**组织方式**；这是 DIS 版本级的 Conformance Demo，不是 Stage 1 Product Research 的替身，也不代替适用的 Stage 2 Research Demo Issue/受隔离分支/E1–E3、独立 Review、L2 Freeze、CI、Release。
>
> **单一入口：** [DIS v0.2.0 Demo 主 Issue #1499](https://github.com/kaicreator-mm/domain-harness/issues/1499)；**规范决策：** [Product/L1 #1496](https://github.com/kaicreator-mm/domain-harness/issues/1496)；**实现与实验版本：** [Draft PR #1497](https://github.com/kaicreator-mm/domain-harness/pull/1497)。旧的 #1494 / PR #1493 是 superseded 设计，不新建第二个主 Issue。
>
> **机器证据权威：** [matrix.json](matrix.json) 的 21 个 requirement 的分类/状态；[validation-summary.md](validation-summary.md) 是结果摘要；[receipts/](receipts/) 是已入 Git 的 Exact-SHA 运行回执。本文件只索引和规划，不另立状态机、二次覆盖率权威或新的 Product 版本。

## 1. 验证目标与边界

本轮要回答的是：**DIS 0.2.0 的 Element/Function、AOT、SDK/KDP、真实 Domain 消费与被选择的可选 Profile 是否能在可复现的真实实现里满足各自的可证伪契约？** 不是“测试数量能否增加”、不是“模拟器能否输出 PASS”，也不是“所有生产应用都已迁移”。每次 study 使用 r0/r1 等**实验修订号**，不创建 DIS 0.2.1/新的 Product SemVer；测试/失败修复只更新现有 Draft PR 的 Git 产物，旧 commit/receipt 仍可从历史精确定位。

- **输入**：优先复用 R7 的真实原项目源码 Pin（Tally @ `e988321439f65b55936a691c02250b6d62a29409`、Runx @ `b9e0c953d9bfd5834315012426fd8e10c21bdd7c`、xDownload @ `e904f08c478b15147b1c07fbe53c610d2d81851f`），及已选 KDP/真实 SQLite/C01 物理回归。固定输入只证明被 Pin 的提交，不是外部项目当日 HEAD、独立语义 Oracle 或生产资格。
- **真实/模拟分界**：R2 FakeLLM、fixture Oracle、in-memory 经验晋升属于自演示；R4 Sidecar、R6 SQLite、R7 源码重放、R9 Public SDK 的资格**只按对应精确 SHA 的真实 CI**认定，不能把桥接称为已发布的正式 ABI。
- **Effect 与信任**：自建可信封闭原生代码的任意敌意 OS 沙箱明确 OUT_OF_SCOPE；KDP 真实 effect admission/Journal/receipt、Evidence currentness、未选 Function/Provider 拒绝、UNKNOWN fail-closed 继续在适用范围内验证。用户界面上的 READY 不等于 KDP 许可。
- **证据不混算**：`SOURCE_PIN / SEMANTIC_INTERPRETATION / NATIVE_EXECUTION / INDEPENDENT_AUTHORITY` 是解释性维度，不是新 ADS enum。Runner 崩溃不是反例成功；CI 的一个 context PASS 不代表另一个失败 context PASS。

## 2. 必要 Demo 目录及可证伪停止条件

编号是**研究索引**，不是实施 Task ID、冻结 DAG 节点或规定每项必开 Issue。对于 optional profiles，是否启用、适用 Target 由 #1496 持有明确范围决策；未启用且无正式裁定时保持 NOT_RUN，不擅自填 OUT_OF_SCOPE。

| Study | 真实问题 / Scope 对应 Matrix | 最小正例（需要观察） | 关键反例 / UNKNOWN（需要拒绝或诚实保留） | 当前真实证据 | 下一步 / 完成条件 |
| --- | --- | --- | --- | --- | --- |
| **D00 — 权威基线/回归** | CORE-001/004/007/009–013/015，CORE-016 基础 | 真 BUILD → selected KDP/SDK → 双 Domain 物理 SQLite Journal 重启；Tally/Runx/xDownload 原始 Pin | 来源字节/路由漂移、无许可 Effect、重复回放、伪造权威 | R9.5 97 named + R10 103 named，分别由独立历史 SHA 回执证明；非整个版本 PASS | 引用已有 PASS，不复制 fixture 或重跑未改变的范围；记录当前受影响增量 |
| **D01 — Function Contract** | CORE-002/003/004：Element metadata、Public Function I/O、typed outcome、Evidence、reader/consumer 兼容 | 真实 Tally rule UNKNOWN、xDownload 两个 LOCAL Function；正向 Schema/typed outcome/来源 Pin，随后覆盖所有适用 Public Function、KDP_INTENT 回执 | 非法输入输出、未知状态、无凭据伪 SUCCEEDED、陈旧 reader、错误调用期合约、只凭声明 evidenceRefs 伪授权 | **R11 candidate / PARTIAL**；8 新用例已提交，但本轮 DIS 集成 CI 失败 | **第一优先**查 #2232/1 第一真实失败步骤，同一 Writer 修复/重跑三项 CI；之后补齐正式 Schema、KDP_INTENT typed receipt、独立 Evidence 验证及全 Function 对照 |
| **D02 — Element 内聚/知识与协作** | CORE-002/005/006：Function 聚合、静态 DAG vs 语义关系、约束、跨 Element 协作、业务 State ownership | Tally rules/knowledge 与 Runx stateful 观察在真实 SDK 中协作；合法语义环不等于静态依赖环；独立知识查询和规则结果可追溯 | 未声明依赖、关系拥有者缺失、过度拆出只放一条关系/UNKNOWN 的 Global、观察者冒充 Lease、语义推断冒充原始事实 | R9.5 的 DAG/观察者窄范围 PASS；CORE-002/005/006 仍 PARTIAL | 同一 source pin 上构造 **parent-vs-split** 反事实、跨 Element invariant 的正反例；全面 Function 约束的最终资格依赖 D01 |
| **D03 — Progressive Interaction** | CORE-014，借用 CORE-003 的 typed outcome | xDownload LOCAL inspect → clarify → confirm，Form/Chat/CLI 真实适配最终消费一个协议；再选择 KDP Intent | 未确认、恶意 URL/size、伪造 READY、跳过确认、Interaction 试图发送 Effect | R10 6 个 native cases 已含于 103-case [成功回执](receipts/r10-ci-recovery.json)；**仍 PARTIAL** | 用真实 CLI/表单/聊天接口适配而非仅 channel 标签补缺口；typed 版本一致性与 D01 联合验证 |
| **D04 — Target/AOT/Package 变体** | CORE-007/008/009–013/015：适用 Target 上 Package/Provider 选择、Init/Ingress/Effect | selected BUILD/Function/Target/完整闭包；真实 C01 Guard、原始 Receipt、重启；跨 Target 的差异在可用环境验证 | 未选 Package/Provider、Target 漂移、跨进程假凭证、初始化失败、过期 Journal、对不支持 Target 虚构 PASS | R6/R8/R9.5 selected TARGET 的有限真实 PASS；CORE-008 PARTIAL | 先由 Product/L1 确认 **实际适用 Target 集合**，只补各 Target 缺失的增量证据，不能用 Linux PASS 冒充 Windows/Android |
| **D05 — Harness/LLM 可选能力** | OPT-001：真实 AOT-selected Provider、预算、工具调用、UNKNOWN | 接入真实选中 Provider，有限预算/取消；正常返回、不可用降级、无模型确定性回退 | 伪造 Provider/工具输出、预算超额、模型幻觉冒充事实、未选择的 Model 调用 | R2 FakeLLM / 25-case 自演示；**native optional profile NOT_RUN** | 确定实际启用范围后验证 native provider/SDK 合约；预算/Effect 继续遵守 KDP |
| **D06 — Experience 与独立校验** | OPT-002：Experience provenance、源 Cohort、独立 Oracle/holdout、可重用性 | 对真实 Function/Domain 结果生成观察→可信校验→Experience；新的 holdout 检查与精确版本复用 | 同一来源重复计数为独立证据、Cache 命中伪验证、模拟 Oracle 自证、跨版本/隐私混淆 | R2 设计和 fixture 自演示；**native optional profile NOT_RUN** | 复用 D01 的 typed evidence；不依赖 D05 即可先验证确定性经验，选中模型路径再复核 D05 |
| **D07 — Evolution / Meta 晋升** | OPT-003/004：数据规则 Slot、Task pin、撤销/回滚、Server Meta/Forge 晋升及新 AOT | 被明确选择的 bounded rule data 在适用 SDK 中验证/激活/撤销；Meta 产新候选→独立校验→新 AOT | 未获授权热更新、任意 native code 注入、跨 Task 激活、过期受众/无效撤销、Server 自行晋升或泄漏 | R2 模拟晋升和设计；**native optional profiles NOT_RUN** | D06 真实 Evidence 与 D04 AOT/Target 先成立；若选择 LLM 生成候选还需 D05，不能自动生产自演进 |
| **D08 — 版本闭环与独立审核** | CORE-016 + GOV-001；全部适用 MUST/启用 Profile 的证据闭环 | 每个适用 requirement 与可执行 source/test/negative/实际匹配的 CI receipt 一一对照；独立 Exact-SHA review、Product/L1/L2 decision | 未运行、缺日志、混合 context FAIL、借旧 SHA、无 Owner Freeze、自评替代独审 | CORE-016 PARTIAL、GOV-001 NOT_RUN | D00–D07 的**适用**条件满足后，执行现有独立门禁；最终才决定 Freeze / merge / release |

## 3. 证据依赖图（不是 Frozen Task DAG）

```text
D00 — 原有 R9.5/R10 source/CI 固定基线
 ├── D01 — Function typed I/O / Evidence  ★ 当前最早门槛：R11 CI FAIL
 ├── D02 — Element / Semantic（源与方案可先行；终验依赖 D01）
 ├── D03 — Interaction（R10 窄范围已验；typed 完成依赖 D01）
 └── D04 — Target / AOT（原有真实 Target 已验；跨版本 ABI 补验依赖 D01）
           ├── D05 — Harness/LLM（还依赖 D01；可选）
           └── D07 — Evolution / Server Meta（还依赖 D06）
D01 ──> D06 — Experience / Evidence（确定性路径可与 D05 并行）
D05 ──> D07（仅当 Evolution 使用真实 LLM 候选）
D00+D01+D02+D03+D04+(启用时 D05/D06/D07) ──> D08 — 全覆盖与正式决策
```

- **可并行**：D02 的语义反例与颗粒度分析、D03 的 UI adapter 调研、D04 的 Target 适用性确认，以及 D01 CI 根因定位；同一写集必须单 Writer、验证与修复合并。
- **不可越过**：D01 未通过本次 exact SHA 集成，不能标记 R11 新 native tests SUCCESS；没有独立 Evidence Oracle 不能称 D06 VERIFIED；D05/D06/D07 的旧 Mock 自测不等于真实可选 Profile 合格。
- **最小拆分规则**：当前沿用 #1499 一个主索引；只有跨仓库权限/独立 Writer/真正不同的 CAS 或高风险外部副作用、长期阻塞需要单独验收，或适用 Stage 2 研究标准有强制要求时，才开具体 Issue。单个 Demo 修订、负例失败、不必制造子 Issue 或版本。

## 4. 历史 Demo 迁移索引：保留原 Git 文件与证明边界

下表的“迁入”仅表示**索引历史证据**，不是移动原 Demo、复用过期 CI 资格，也不是重写旧实验结果。原始 README/演进日志是项目历史记录；只有另附 exact CI receipt 的窄范围才作为版本矩阵 VERIFIED 证据。

| 阶段 | 原有 Demo / 入口 | 历史结论的真实限度 | 归入 Study |
| --- | --- | --- | --- |
| R1–R2 | [EVOLUTION_DESIGN_REPAIRS_R2](../EVOLUTION_DESIGN_REPAIRS_R2.zh-CN.md)、[FakeLLM Demo](../../../../../examples/dis-v020-evolution-demo/README.md) | R2 25-case fixture 自测、设计级负例；没有真实 LLM/SDK/独立 Oracle，不能晋升 OPT Profile | D05–D07 |
| R3 / R3.1 / R3.2 | [FULL_SCOPE_DEMO_SELF_VALIDATION_R3](../FULL_SCOPE_DEMO_SELF_VALIDATION_R3.zh-CN.md)、[SDK seam](../../../../../examples/dis-v020-sdk-integration/README.md) | R3 74 项模块化测试在历史说明中为本地演示且 ZIP 不在本 PR Git CI；真实 KDP/Gate 界面探索；原 hostile-native OS 隔离试验已按 Product 决定排除必需门禁 | D00、D02、D04（历史研究） |
| R4–R5 | [REAL_AOT_APP_INIT_BRIDGE_R4](../REAL_AOT_APP_INIT_BRIDGE_R4.zh-CN.md)、[bridge suite](../../../../../examples/dis-v020-real-aot-bridge/aot-bridge.test.mjs) | 从 Sidecar 真实 BUILD/SDK 过渡到恢复；R4.3 27 项曾获专项 exact-SHA CI，后 R5 扩至 34；不能称 Sidecar 已发布 ABI | D00、D04 |
| R6 | [PHYSICAL_TWO_DOMAIN_R6](../PHYSICAL_TWO_DOMAIN_R6.zh-CN.md)、[physical suite](../../../../../examples/dis-v020-real-aot-bridge/two-domain-physical.test.mjs) | 两个 Business Domain，真实 SQLite WAL/CAS KDP Journal 跨进程 idempotent replay；不是外部库存修改 | D00、D04 |
| R7–R8 | [CROSS_PROJECT_CONSUMER_R7](../CROSS_PROJECT_CONSUMER_R7.zh-CN.md)、[CROSS_PROJECT_BUILD_R8](../CROSS_PROJECT_BUILD_R8.zh-CN.md)、[source manifest](../../../../../examples/dis-v020-cross-project/manifest.json) | 三个原项目固定来源；实际 original-source Function 与 canonical BUILD，未执行产品真实 GitHub/Runx Host/xDownload transfer | D00、D02、D04 |
| R9–R9.5 | [NATIVE_ELEMENT_FUNCTION_AOT_R9](../NATIVE_ELEMENT_FUNCTION_AOT_R9.zh-CN.md)、[native test](../../../../../examples/dis-v020-native-sdk/native-consumer.test.mjs)、[r9.5 receipt](receipts/r9.5-baseline.json) | Exact HEAD `7954bd91d51eb13fbeab96385f37ac8d9cd35c5e`、TREE `9250ad08f500bc8924458af1c833947c99ad0d4c`；[CI 2223/1](https://ci.kaicreator.com/repos/18/pipeline/2223/1)、[2223/2](https://ci.kaicreator.com/repos/18/pipeline/2223/2)、[2223/3](https://ci.kaicreator.com/repos/18/pipeline/2223/3) 3/3 SUCCESS，97 named cases；仅对应矩阵 9 项窄范围 VERIFIED | D00 |
| R10 | [INTERACTION_NATIVE_R10](../INTERACTION_NATIVE_R10.zh-CN.md)、[blocked history](receipts/r10-candidate-blocked.json)、[recovery](receipts/r10-ci-recovery.json) | 原 CI 2227 失败保留；修复 npm 预编译依赖下载 + 本地 Node24 pack inventory；Exact HEAD `c9cc8d63e13b150cf462af05a58daef5748f0030` 的 [CI 2229/1–3](https://ci.kaicreator.com/repos/18/pipeline/2229/1) 为 SUCCESS（103 named，含 6 Interaction）；后文档 HEAD `771c5d2e00e597acb55b5881e6921a8ea9709630` 的 2230/1–3 另行 3/3 SUCCESS；CORE-014 仍 PARTIAL | D00、D03 |
| R11 | [FUNCTION_IO_OUTCOME_R11](../FUNCTION_IO_OUTCOME_R11.zh-CN.md)、[native test](../../../../../examples/dis-v020-native-sdk/native-consumer.test.mjs) | Exact HEAD `4632d5e0b331f0119da0c8d78249b7c1437856a1`、TREE `8f347807680db455cc8627590bc3c60778b9e953`；[CI 2232/1 integration FAILURE](https://ci.kaicreator.com/repos/18/pipeline/2232/1)、[2232/2 min-node SUCCESS](https://ci.kaicreator.com/repos/18/pipeline/2232/2)、[2232/3 verify SUCCESS](https://ci.kaicreator.com/repos/18/pipeline/2232/3)。**失败原因 UNKNOWN（仅 GitHub status 可读）**；8 新测试已写入但不能计作本次集成 PASS；[R11 BLOCKED receipt](receipts/r11-integration-blocked.json) 记录三项 CI 的混合状态；CORE-003 PARTIAL、无 R11 success receipt | D01 |

**样本数量 ≠ 要求数量**：R9.5 的 97 或 R10 的 103 是同一条真实集成 lane 的 named tests，不是 97/103 个独立 Requirement，也不是互相独立的 Domain Oracle。历史 R2/R3 测试不能与其简单相加作为当前完成率。源/语义/Native/Owner 是四种不同的证明维度。

## 5. 本轮已观察状态、下一步与经验回流

- **Matrix readback（R11 候选）**：16 Core = 9 VERIFIED / 7 PARTIAL；4 optional = 4 NOT_RUN；1 governance = 1 NOT_RUN。Core 窄范围 VERIFIED 比率 9/16=56.25%，**不是整体完成率**。初次证据索引整理由此开始，原机器状态不因整理改动。
- **下一最小可改变决策的步骤**：查 Woodpecker 2232/1 第一失败命令/日志，修复有证据的根因，在原写集复测并把新 SHA 的独立 context 结果写进新的 receipt。不能只因随后 docs-only HEAD 获得其他 green context 就借 R11 integration PASS。
- **停止/复盘**：每项 Demo 结论包含 `Question | input source+exact pin | execution+environment | positive/negative/UNKNOWN | result | what NOT proven | next smallest evidence | inherited scope/invalidated receipts`。无必要时一个 Markdown 就够；不追求每项单独 Issue 或机器 Schema。
- **通用经验写回 [ADS #1361](https://github.com/kaicreator-mm/ai-development-standard/issues/1361)**：版本 Conformance 可借用 ADS #1362 的证据组织技术，但不得混淆 Stage 1/2 权威；历史成功的 exact SHA、领域来源 Pin、独立语义判定、Effect 权限与本轮 CI 必须分别表达；研究依赖图不等于 Frozen Task DAG。Issue 开销与时间/成本只有实际测量才声称节省。

**R13 验证器反例修复**：旧 `validate.test.mjs` 要求 `core:NOT_RUN > 0`，与真实 Matrix 9 VERIFIED / 7 PARTIAL / 0 NOT_RUN 矛盾；现在以完整 16 Core 数和剩余未验证数核对，并新增“BLOCKED 收据不能为 VERIFIED 背书”的负例。此源级问题不等于确认 Woodpecker 的第一失败步骤；只认后续 exact-SHA CI。

## 6. R14–R15 incremental evidence update


### R14 — D01 recovered; D02/D03 native consumer candidate; D04 applicability boundary

- **D01 verified limited execution:** matching exact SHA `51a39d293c06402835a28ac9a766f94d4933eccc`, TREE `9c1676c446f30e2b150b1d1b4dd047d1aac6eb30`, Woodpecker #2234 contexts **3/3 SUCCESS**. Checked-in [r14-d01-ci-recovered](receipts/r14-d01-ci-recovered.json) is a **historical success**, not a verdict for the commit adding this record. R11 original mixed-status failure remains immutable. `CORE-003` stays **PARTIAL**, despite now having a narrow successful source+typed test receipt.
- **D02 candidate (NOT YET CI-QUALIFIED):** using the actual source-pinned Tally task/rule and release projection, compare intact split Elements vs a fused parent Element with identical two public Functions, outcome-by-outcome. Add the distinct negative cases: static DAG cycle fails, semantic cooperation cycle is allowed, and an absent constraint owner is refused. This is a structural/observable counterfactual, **not** an independent semantic oracle or a generalized invariant ownership algorithm.
- **D03 candidate (NOT YET CI-QUALIFIED):** distinct deterministic Chat text, browser-form `URLSearchParams` and CLI `argv` parsing adapters call the **real selected native SDK Function** twice (inspect → confirm); bypass/unknown options fail. No production UI deployment or authorized external transfer is claimed.
- **D04:** current original-source selected BUILD/KDP evidence does not establish a complete Target applicability matrix. Windows/Android/Linux-specific execution is **NOT PROVEN** unless individually pinned and executed; Product/L1 #1496 retains the actual applicable Target set decision. No invented OUT_OF_SCOPE verdict.
- **Current commit boundary:** the newly added D02/D03 tests and D04 report require *new* matching Woodpecker context results before being treated as executed; current Core/Optional/Governance counts stay **9 VERIFIED / 7 PARTIAL; 4 NOT_RUN; 1 NOT_RUN**.

## 7. R15 pass / R16 D01 KDP receipt candidate


### R15 exact-SHA native D02/D03 PASS and R16 D01 KDP admission candidate

- **R15 exact qualified HEAD** `d2dbda617ed93ad59a33f4e57af2b4858cc41c2e`, TREE `01746a654b1747992da38de8568e21d354f0012e`; [#2235/1](https://ci.kaicreator.com/repos/18/pipeline/2235/1) Integration, [#2235/2](https://ci.kaicreator.com/repos/18/pipeline/2235/2) Node and [#2235/3](https://ci.kaicreator.com/repos/18/pipeline/2235/3) Verify all **SUCCESS**. [Receipt](receipts/r15-d02-d03-native.json) pins the old HEAD only, including native split-vs-parent source-real Tally cases and distinct input adapters. D02 independent semantic oracle and production D03 UI/Host remain **NOT PROVEN**.
- **R16 candidate** adds opt-in `dis.v0.2.kdp-receipt-contract/1` to the *already selected* orders KDP Intent, separate from existing LOCAL `dis.v0.2.function-contract/1`. Real `app.send()` admission may be typed `ADMITTED`; unfamiliar receipt status is `UNKNOWN`; no receipt status can be reinterpreted as completed Effect, current business fact, independent evidence or `SUCCEEDED`. Version guard rejects stale consumers before KDP send; AOT rejects forged `ADMITTED` mappings and a LOCAL binding masquerading as KDP.
- **R16 new tests are candidate only** until this new code HEAD's Woodpecker integration / Node / general verification succeeds. No reviewer, L2 or release claimed. Core remains **9 VERIFIED / 7 PARTIAL**, optional **4 NOT_RUN**, governance **1 NOT_RUN**. Full I/O schema vocabulary, remaining public Function profile, independent business evidence Oracle and cross-version structural diffs still unresolved.

## 8. R16 success and R17 bounded Function compatibility


### R16 all three Woodpecker contexts SUCCESS / R17 bounded schema and compatibility candidate

- **R16 exact SOURCE** \`db10ddbc4977a35c31754e4a8e23cdacb063f9a5\`, TREE \`5398b312a36e345c06dd796063f4516c07d34d6e\`; Woodpecker **#2237/1–3 all SUCCESS**. Historical native receipt [r16-kdp-admission-ci.json](receipts/r16-kdp-admission-ci.json) covers real KDP_INTENT typed admission (not Effect completion), source-pinned Tally non-attestation, version guard and fake receipt negatives.
- **R17 new candidate:** bounded \`record\` shape additionally supports explicit \`optional\` fields and \`additionalProperties:false\`; a separate *v2 major* opt-in contract runs against unchanged original Tally source, rejects unexpected keys/nonfinite numbers, preserves real UNKNOWN/OBSERVED. Original v1.0.0 AOT fixture remains unchanged.
- **Compatibility obligation:** \`compareDisV020FunctionContracts(previous,next)\` checks same-major *structural consumer compatibility*: monotone SemVer, input narrowing, existing output field removal/type drift, outcome remapping and evidence-policy weakening. Same-version drift is forbidden. A v2 breaking opt-in Schema is deliberately **not** represented as a compatible in-place update. This pure comparator does not automatically authorize updating a running AOT nor replace independent semantic/business evidence validation.
- R17 tests and source are **NOT CI-VERIFIED** until the newer exact SHA has a successful Woodpecker integration context; distinct general CI contexts must also pass. Counts stay **Core 9 VERIFIED / 7 PARTIAL; Optional 4 NOT_RUN; Governance 1 NOT_RUN**.

## 9. R17 success and R18 independent RQ boundary


### R17 3/3 exact-SHA SUCCESS; R18 Tally Release Evidence obligation candidate

- R17 historical HEAD `fe51db3b70450ae3abcc3d42f944d972af20cc2c` / TREE `50496119e01ee54d793be897fb1946d79f585f0f` qualified by Woodpecker [#2238/1](https://ci.kaicreator.com/repos/18/pipeline/2238/1), [#2238/2](https://ci.kaicreator.com/repos/18/pipeline/2238/2), [#2238/3](https://ci.kaicreator.com/repos/18/pipeline/2238/3), **all SUCCESS**; immutable [receipt](receipts/r17-bounded-schema-ci.json) is pinned only to that code HEAD, not this receipt commit or later tests.
- R18 newly profiles original source-pinned Tally `tally.projectReleaseReadiness` as an optional native typed LOCAL Function. A complete-looking 13-gate caller-reported PASS set must still yield `OBSERVATION/NONE`, `UNKNOWN`, `BLOCKED`, `INDEPENDENT_RQ_AND_AUTHORITY_NOT_ATTESTED`, no merge/tag/publish and `evidence.attested=false`. Wrong source SHA, future timestamp, malformed identity and forged `RELEASE_PASS` are negative cases. Unlike an invented business proof, this candidate explicitly **demonstrates non-attestation** of supplied claims.
- Not yet delivered: an actual independent native GitHub C/RQ source attestation, complete Public Function profiles, full recursive I/O Schema, broad cross-version abi. This candidate's new cases require **new matching exact-SHA CI**; do not mark CORE-003 VERIFIED or fake release approvals. Core **9 VERIFIED / 7 PARTIAL**, Optional **4 NOT_RUN**, Governance **1 NOT_RUN**.

## 10. R19 incremental native Function profile

### R19 candidate — source-real Knowledge typed Function + Effect receipt contract (no Host dispatch)

- Selected xDownload `getPolicy()` is consumed through the existing **native SDK Function** with `domainId=downloads → OBSERVED`, source pin and `evidence.attested=false`; nested acquisition policy remains KDP-owned. Negative tests reject arbitrary Effect parameters, a forged Domain status, and malformed policy result shapes. This covers one previously unprofiled native Public Function, not a full knowledge-graph query Schema.
- Selected `xdownload.confirmDownload` KDP_INTENT gains a versioned receipt contract, but testing is deliberately **preflight-only**: stale expected version and invalid envelope reject without invoking a non-idempotent external Host acquisition. AOT forbids turning arbitrary terminal status into ADMITTED. Actual terminal Effect receipt, native Host and Target applicability **not proven**.
- The remaining **Runx stateful** Public Function returns a class instance, not a plain structured record; must be treated as an explicit unprofiled lifecycle/opaque-return question, **not forced into a fake record Schema**. Product/L1 decides valid Function result representation. Core 9 VERIFIED / 7 PARTIAL, Optional 4 NOT_RUN, Governance 1 NOT_RUN. R19 new tests require its own matched SHA CI.

## 11. R19.1 Knowledge zero-argument ABI repair

### R19 #2240 blocked, R19.1 zero-argument Knowledge ABI repair candidate

- Exact historical R19 HEAD `d96fca1e45612cf07102f307f9bb90727a0380a2`/TREE `5be1a1a99aabe1d4eb4547723e7dcecfed03edc3`: [#2240/1](https://ci.kaicreator.com/repos/18/pipeline/2240/1) Integration **FAILURE**, [#2240/2](https://ci.kaicreator.com/repos/18/pipeline/2240/2) Node **SUCCESS**, [#2240/3](https://ci.kaicreator.com/repos/18/pipeline/2240/3) General **SUCCESS**. [Blocked historical receipt](receipts/r19-native-integration-blocked.json) explicitly cannot support a VERIFIED requirement. **Root cause of CI failure UNKNOWN** without step logs.
- Independent source-level compatibility issue: public xDownload Knowledge `invoke('xdownload.describePolicy')` was previously valid with no argument, but the newly added closed-record input would reject it. R19.1 adds bounded `allowAbsent:true` on **only a zero-field closed input**, not output or open/nonempty schemas; no-arg and `{}` both preserve typed `OBSERVED/NONE`, while `null` and injected Effect fields still fail. Same-major ABI comparator rejects removing this permission in a successor.
- These new tests **require new exact-SHA CI**. The original R18 #2239 remains PENDING, and no historical R18 PASS is invented. Core remains 9/16 VERIFIED, 7 PARTIAL; no L2 freeze, merge, or release.

## 12. Stateful Handle Function experiment

### R19.1 actual CI blocked / R20 Runx native stateful Handle candidate

- R19.1 exact HEAD `4af4cfd82cd6983970279f454e365ecd2b338089`, TREE `7517d615f12f92dc26967c6790d96ff16cdf214f`, [#2241/1](https://ci.kaicreator.com/repos/18/pipeline/2241/1) **FAILURE**, [#2241/2](https://ci.kaicreator.com/repos/18/pipeline/2241/2) and [#2241/3](https://ci.kaicreator.com/repos/18/pipeline/2241/3) **SUCCESS**. The [blocked historical receipt](receipts/r19.1-integration-blocked.json) is *negative evidence*. Root cause of integration failure not conclusively established without step logs.
- R20 real selected `runx.createPresenceObserver` returns `EnvironmentAgentPresence` class instance, with `observe/list/latest` methods, live in-memory state and no execution lease. Add separately versioned `dis.v0.2.local-handle-contract/1` with bounded method shape and `PROCESS_LOCAL` lifetime. This does **not** pretend the handle is JSON-serializable, remotely transportable, or independently attested. SDK preserves `OBSERVATION/NONE`, exact source pin, stale consumer rejection and plain-object forgery refusal. Already-returned handles are **not** claimed to be revoked on `stop()`; KDP maintains its own independent execution authority.
- R20 tests need **fresh exact-SHA native CI** and do not repair/qualify the unresolved R18/R19/R19.1 prior run history automatically. Core 9 VERIFIED / 7 PARTIAL, Optional 4 NOT_RUN, Governance 1 NOT_RUN. No L2 Freeze, merge or release.

## 13. R21 actual native DKE qualification — semantic-only CI

### R21 completed narrow native AOT/SDK semantic conformance (engine-only CI ERROR retained)

- Exact historical SHA `3f6393c49cad2b8e8768c46f5c4b267114ce5ea5` / TREE `a608548721b42cb7ce9f0ed06957b3c59e2e9b34`. [Woodpecker #2249/1](https://ci.kaicreator.com/repos/18/pipeline/2249/1) native Integration **SUCCESS** (selected DKE ED06 Functions actually invoked through AOT/KDP-backed native SDK), [#2249/3](https://ci.kaicreator.com/repos/18/pipeline/2249/3) general Verify **SUCCESS**, [#2249/2](https://ci.kaicreator.com/repos/18/pipeline/2249/2) engine-only verify-min-node **ERROR**. Following Owner's explicit semantic-vs-runtime separation, [r21-native-dke-semantic-ci.json](receipts/r21-native-dke-semantic-ci.json) is marked **DIS_SEMANTIC_ONLY**; no false statement that the overall CI is 3/3 SUCCESS. Existing historical 3/3 receipt checks remain unchanged. New conformance regressions reject missing/failed DIS Integration or general verification even in semantic-only mode.
- Source-real DKE `CONTEXT/REVIEWER_ROOT/GLOBAL` variants used 24 exact-source CQ calls (Tally 12 UNKNOWN, Textile 6 OBSERVED/6 UNKNOWN), plus bounded real-source and registry/reader/evidence fail-closed cases. Cross-project original code and fixed projection are checked in the prior Issue report; external full source graphs and accepted Claims are **not** replaced by a 19-node projection.
- Existing selected DKE LOCAL Knowledge Function does **not** constitute installed DKE Business Package, selected external ECP or reverse CQ→SAP→Package dependency registration. A source pin/declared evidence ref is not an independent Oracle. CORE-002/003/005/016 remain **PARTIAL**; Core 9 VERIFIED/7 PARTIAL, Optional 4 NOT_RUN, Governance 1 NOT_RUN; no merge, Freeze or Release.

## 14. R22 bounded source-to-Function reverse lookup

### R22 — first bounded AOT source-to-selected-Function reverse dependency

- R21 sealed AOT contains **two separately pinned sources**: DKE original executable core and the Tally/Textile reduced projection. R22 explicitly declares `sourceDependencies:[dke-ed06-projection]` on each of the **three actually selected LOCAL Knowledge Functions**; the existing code `binding.sourceId=dke-ed06-consumer` remains unchanged. Qualification builds `sourceConsumers[sourceId] → selected Function IDs` directly from the sealed AOT, not an invented external registry.
- New native positive verifies the original code *and* the real fixed data projection both map to the three selected Function IDs; native negatives reject missing, duplicated, same-as-execution, cross-origin (Tally-owned source in DKE Domain) and KDP_INTENT source-dependency forgery **before KDP boot**.
- **Boundary:** this is a static trusted AOT provenance edge only. It **does not** demonstrate real external change notification, automatic SAP re-qualification, complete CQ→SAP→external Package/ECP reverse closure, independent graph-Claim acceptance, or runtime authority. Original pin replacement still needs independent trusted builder, new AOT and installed digest. R22 tests are candidates until Woodpecker confirms their exact SHA. Existing R21 semantic-only receipt remains bound to its earlier HEAD `3f6393c`.
- Conformance remains Core **9 VERIFIED / 7 PARTIAL**, Optional **4 NOT_RUN**, Governance **1 NOT_RUN**, no Merge/Freeze/Release and no Node-version gate for semantic checks.
