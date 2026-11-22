# DomainHarness v0.11.1 版本总结、设计复盘与后续版本经验基线

> **性质**：已完成内部阶段的事后复盘（retrospective），不是新功能规范、替代现有 PRD/L2、版本升级提案或独立 Release。  
> **证据截点**：2026-11-22；源真相为 GitHub Exact SHA、独立审核和同 SHA 的 Woodpecker；本文件仅归档已发生的事实及可检验经验。  
> **版本状态**：**v0.11.1 COMPLETE / ACCEPTED_SCOPED，P0=0、P1=0**；`version/v0.11.x` 内部列车已集成，**没有**合入 `main`、打 Tag、正式 npm publish 或 GitHub Release。**整个 0.11.x 尚未发布**。

## 1. 执行摘要

v0.11.1 在 v0.11.0 全面重写的 Element-First 基础之上，打通 `Package.Init → 已选 Workflow → Element.Function` 的单一执行链，并最终由**真实独立、单一公开 SDK 依赖的 Reference Domain App** 对外部消费路径作受限 E2E。它证明的是一个明确的 Node ESM Profile 下可组合、可封存、可执行、可安全拒绝的 SDK；**不是**通用智能体平台、多语言运行时、持久任务引擎、任意第三方 npm/Host 执行环境或已发布的软件包。

主要收获不是简单地“新增 Workflow”，而是把产品结构、普通多文件 Package、标准 Element、SDK 安装消费、可信 Runtime 及代码质量串成了一份**可追溯的真实消费者证明**。同时暴露了设计阶段的需求澄清、静态选定声明、E2E 收据归档和审查/CI 复用的实际薄弱环节。

**权威入口**：[Product/L1 #1605](https://github.com/kaicreator-mm/domain-harness/issues/1605)（CLOSED）、[L2 #1608](https://github.com/kaicreator-mm/domain-harness/issues/1608)（CLOSED）、[最终优化 Task #1656](https://github.com/kaicreator-mm/domain-harness/issues/1656)（CLOSED）、[独立 Reference App #1664](https://github.com/kaicreator-mm/domain-harness/issues/1664)（CLOSED）、[Reference Stage Index](../../examples/reference-domain-app/stages.json)。

## 2. 版本范围与已交付能力

| 功能面 | v0.11.1 实际受审结论 | 不能扩大解释为 |
|---|---|---|
| 业务进入路径 | Package 自身 Init Element 在调用期间取得按 Package `workflowRoots` 限定的 `workflows.start(WorkflowRef,input)`，运行已选 Function；不再第二轮业务 Init 或 READY 后直接 ingress | 任意应用代码直接调用未声明/未选 Function |
| Workflow/Task Execution | 真实 XState v5 Actor；单节点/多节点/子 Workflow；严格唯一具名 Switch；`COMPLETE/REJECT/ASK/WAIT/UNKNOWN/FAILED` 严格分离 | ASK/WAIT 的 Durable Resume、通用持久化任务或另一套 Actor Runtime |
| 执行安全与资源 | 编译/组合期锁定 WorkflowRef/FunctionRef/Target/直接 Extension/资源摘要；根共享调用预算、活动祖先深度，start/end Hook 的受限 finally/await；未选定与越权 fail-closed | 运行时动态发现权限、任意 JavaScript 沙箱或对极端输入的绝对内存界 |
| 纯格式 Standard Element | `dh.std.file.json@1.0.0`、`dh.std.file.yaml@1.0.0` 的 read/write（解析/序列化）作为普通可复用 Element，通过两种领域 Consumer 与选定 FunctionRef/实际数据验证，`STANDARD_ACCEPTED` 限于 Node22 ESM Profile | Host 磁盘/网络写入权；任意状态转换模板已经标准化；全语言通用准入 |
| 单公开 SDK | 消费者只直接安装 `@kaicreator/domain-harness`；`/runtime` 与 `/composition` 为同一 SDK 内部子路径；Contracts/Microkernel 为合法传递依赖，BUILD/Forge 不要求单独安装 | 整个运行闭包只能含一个 tarball；独立 Assembly/Seed Builder 是前置 |
| SDK 根入口优化 | 测试不同入口冷加载/大小；保留同步 root `buildApp` 及 `/runtime` Boot-only 的隔离入口，结论为 **KEEP_AS_IS** | 已通过未经核实的数值证明根入口零成本、必须改成动态 import |
| Package 生产/演化 | 普通、真实多文件 Domain Package 可由任何作者直接编写；可选工具仅验证合规；使用既有 SDK API 组合后续 Package/Consumer 的限定实证 | Forge/Generator 必须生产 Package；自动支持任意跨代旧 ABI |
| 语言边界 | DIS/Package 规范可描述不同语言的**独立** Package/App；一个具体 Package 及一个 Domain App 直接执行闭包只用同一种语言/Runtime，跨语言须另设授权隔离边界 | 当前 SDK 已能混用语言、同一 App 内跨语言直接 FunctionRef 调用 |
| 第三方 Node 依赖 | 选定 Node Business Package 的最小精确依赖/版本/SRI/静态准入及危险 lifecycle 拒绝，受限测试路径 | 任意 npm 包均被支持、任意网络载入或动态 import 可绕开封存 |

受审 L1 与技术合同分别见 [PRD](../product/DomainHarness_v0.11.1_Task_Execution_PRD.md)、[L2](../architecture/DomainHarness_v0.11.1_L2_INIT_OWNED_WORKFLOW_CONTRACT_R16.md)；Standard File 精确准入/边界见 [Catalog](../architecture/DomainHarness_v0.11.x_STANDARD_ELEMENT_CATALOG.md)。Node 合同最低 **>=22.12.0**；Reference App 实际 CI 运行 Node **v24.21.0**，两者不可混为“已经独立证明每一种 Node22 环境”。

### 2.1 明确延后或未做

不实现：v0.10.x 源码/ABI 兼容与 parity、第二 KDP/Runtime/BUILD 产品、Workflow 的持久恢复、通用 Tool/Effect、LLM/Agent Loop、领域知识业务生产、跨语言单进程装配、任意 npm 动态生态、完整业务 Domain 产品、单独正式发行。标准 State/Guard/Transition 模板经过两个消费者的真实适用分析后保留为 **CANDIDATE_NOT_IMPLEMENTED**，不是以虚构泛用空壳凑标准 Catalog 数量。

## 3. 交付经过、代码身份与可复核证据

| 阶段 | 证据链 | 独立审核 / CI | 集成结论 |
|---|---|---|---|
| Foundation 准入 | [0.11.0 修正 #1624](https://github.com/kaicreator-mm/domain-harness/issues/1624)、[PR #1625](https://github.com/kaicreator-mm/domain-harness/pull/1625) | B0 R3 ACCEPT_SCOPED、CI #2857 SUCCESS | 先修正 ElementRef/FunctionRef/Init 生命周期，0.11.1 不再用旧 EntryRef 伪兼容 |
| 主功能 T11–T14 | [#1627–#1630](https://github.com/kaicreator-mm/domain-harness/issues/1630)，[PRD/L2](../product/DomainHarness_v0.11.1_Task_Execution_PRD.md)，T14 [PR #1640](https://github.com/kaicreator-mm/domain-harness/pull/1640) | T14 R25 ACCEPT_SCOPED、CI #2917 SUCCESS（见 [L2](../architecture/DomainHarness_v0.11.1_L2_INIT_OWNED_WORKFLOW_CONTRACT_R16.md)） | 初始 Workflow/Actor/Switch/Reader/Hook/预算受审合并；不重开 Foundation |
| 单 SDK 架构 | [R53 PR #1654](https://github.com/kaicreator-mm/domain-harness/pull/1654)、[R58 PR #1655](https://github.com/kaicreator-mm/domain-harness/pull/1655) | 原阶段受审，后续 R72 再验证实际单 SDK Consumer | Composition 仅作为单 SDK 的内部能力；Boot-only `/runtime` 与单一 Public Product |
| 版内收尾 W01–W08 | [#1656](https://github.com/kaicreator-mm/domain-harness/issues/1656)、[集成 PR #1663](https://github.com/kaicreator-mm/domain-harness/pull/1663) | **R69 REWORK（P1=1、P2=3）→ R72 ACCEPT_SCOPED（P0=0/P1=0/P2=1）**；[CI #2979 SUCCESS](https://ci.kaicreator.com/repos/18/pipeline/2979/1) at `030032416c684d066daa1f8c5a2e50d60c41c779` | [squash merge `9f53c6e17d7a854fb57b2e1232702af15e6defe8`](https://github.com/kaicreator-mm/domain-harness/commit/9f53c6e17d7a854fb57b2e1232702af15e6defe8)，AC60-01..10 全部 scoped 完成 |
| 独立参考消费者 | [#1664](https://github.com/kaicreator-mm/domain-harness/issues/1664)、[PR #1665](https://github.com/kaicreator-mm/domain-harness/pull/1665) | **R81 ACCEPT_SCOPED（P0=0/P1=0/P2=1）**；[CI #2981 SUCCESS](https://ci.kaicreator.com/repos/18/pipeline/2981/1) at `b4d9c5a9a095cfcb01af7118bd79a4add8f0b210` | [squash merge `62885289f4236051fa9d3d0f67b968004c5259b2`](https://github.com/kaicreator-mm/domain-harness/commit/62885289f4236051fa9d3d0f67b968004c5259b2)；Reference App RA-01..07 完成 |
| 原始摘要收据封存 | [R83 CI 取证](https://github.com/kaicreator-mm/domain-harness/issues/1664#issuecomment-7080935568) → [R84 StageIndex](../../examples/reference-domain-app/stages.json) | #2981 Verify step **36220**，原始日志第 **440** 行，`DH_R77_REFERENCE_DOMAIN_APP_PASS` | Doc/ledger-only commit `be801fa47ff5ad940a4bdde62e6fec0c4f0b8679`；历史已审源码 SHA 不被替换 |

上表仅复用原独立审核和真实 CI。**一个审查回合没有亲自跑 CI，不等于 CI 不存在；一个 CI 返回 SUCCESS，也不能自动证明产品语义、独立审核、完整收据或正式 Release。**

### 3.1 v0.11.1 Reference App 的不可变阶段身份

- 受审 Reference 源：`b4d9c5a9a095cfcb01af7118bd79a4add8f0b210`；[R81 审核](https://github.com/kaicreator-mm/domain-harness/pull/1665#pullrequestreview-6012849208)；[CI #2981](https://ci.kaicreator.com/repos/18/pipeline/2981/1)。
- AppPackage Digest：`sha256:18d47da3a087e30a5e098ade5eba45756c272221a51cfd6b0d8c5467c646c8ea`。
- Lock Digest：`sha256:f64e5658a9d8e66f0aece567b86c6df338aa8a4cfc89d861fdc8c4b9aa9e7942`。
- 四个普通 Package：`r41-kdp`、`r41-sdk-base`、`r60-standard-files`、`reference-business`。KDP/SDK/Business 的 Init 顺序为 `r41-kdp → r41-sdk-base → reference-business`，Exit 严格逆序；一个真实选定 Workflow `COMPLETE`，另有 `UNKNOWN`、未选 Workflow、过期摘要、未授权 Import 与安装前 SRI 篡改拒绝。
- 参考业务 `score` 是**合成测试领域**，用于证明 SDK 机制可消费，不是“领域智能产品”已经实现的声明。StageIndex 是**源码/审核/CI/摘要收据索引**，不是已永久存储全部 SDK npm tarball 的声明。

## 4. 从真实问题提取的工程教训

| 观察到的事实 | 根因或风险 | 后续必须复用的动作 |
|---|---|---|
| 0.11.0 初始旧 EntryRef/第二 Init 与 0.11.1 新 Workflow 含义冲突 | 上游基础没有先固化元素身份、生命周期和版本归属 | 先以实际受审 SDK/Package 合同建立 **dependency gate**；发现基础缺陷回所属层修正；禁止通过下游兼容适配器盖住错误 |
| 初期 L1/L2 记录及版本 Issue 中存在旧快照、旧 CURRENT | 迭代快、文档状态随流程变更却未归一 | 每次关账补一条带 Exact SHA/Review/CI 的**唯一最新 checkpoint**，早期段落标 HISTORICAL，不删除可审历史、不把旧 CURRENT 当现行 |
| R69 `#2975 SUCCESS` 后仍判 P1/REWORK | 单一 SDK Registry Consumer 还未证明**同一**已安装 Consumer 下运行真实 selected Workflow + SRI 受限安装，单靠单项测试绿灯不足 | 验收沿 **声明→包安装→Lock/Pin→真实 Boot→Workflow→Outcome→拒绝** 一条贯通路径；根据合同列出未观察到的链路，补该链路而非重复旧测试；R72 同 SHA 复审闭环 |
| R77 参考 App 第一轮 #2980 FAIL，漏在 Business Manifest 中选定 `workflowRoots` | 只写 ElementDefinition/Workflow 内容不等于合法授权并选择可启动 WorkflowRoot | 新消费者在提交前静态对照 Manifest、FunctionRef、WorkflowRoot、直接 Extension、Target Digest、资源白名单；BUILD 先拒绝的错误应修 Package 声明，不放松 Kernel |
| 参考 App 第一轮 CI 通过后仍缺正式 StageIndex 摘要 | PASS 状态与真实 AppPackage/Lock digest 是两类证据；stdout 有收据但没有及时持久归档 | 同一个 E2E 输出结构化 Receipt（源码 SHA/Node/Package/Lock/结果/负例）；立刻从**对应 Pipeline 原始日志**提取、写入阶段 ledger。收不到填 UNKNOWN/NULL 而非编造；R83 后补证即可关闭，不重跑相同验证 |
| R60 将 Standard Reader 从临时 Demo 逻辑提取成普通 Element | 能在一个 Demo 中运行 ≠ 独立、跨领域、可选、可重用的 Standard 资产 | 提供独立 Package/Manifest/Element/Function/Version/Digest，至少两个真实领域 Consumer、合法及拒绝路径；只有证据成立才授予 `STANDARD_ACCEPTED` |
| SDK 根入口想“无成本延迟载入” | `buildApp` 同步 API 与 ESM 静态导出存在真实兼容约束 | 先量化，再选择；Boot-only 应使用 `/runtime`，保留根同步语义；没有实测改善不为性能而牺牲已冻结 API。见 [W04 决议](./DOMAIN_HARNESS_V0111_R60_SDK_ROOT_LOAD_DECISION.md) |
| 单 SDK 与“仅一个 tarball”、Package 与 Forge 被混为一谈 | 产品命名、内部职责和包生产过程未区分 | **消费者只有一个直接公开 SDK 依赖**；内部 BUILD 是 SDK 功能，Contracts/Microkernel 是合法内部传递依赖；Package 本质为符合规范的多文件集合；任何作者均可写，Validator 与生产方式正交 |
| 同一个参考用例阈值既在 Element 数据又在 ESM 写死（R81 P2） | 测试样例也会发生领域规则**双事实源**漂移 | 未来触及 Rule/Knowledge 语义时，只允许一个真正权威的受选数据源；另做数据改动导致结果变化、旧 Digest 拒绝的变更测试。**本 0.11.1 基线 P2 尚未被宣布修复** |
| CI 需多次取证/反复重复安装会拖慢交付 | 把每个模块都当成新全量 Consumer/新 CI 作业 | 一个 checkout、最小 changed-seam 测试和同一个外部 Registry Consumer；在环境等价时优先自己验证；只为真实 host/registry/隔离信任边界运行必要 CI，复用同 SHA 不变模块的证据 |
| 产品范围未冻结时容易用已完成的示例倒推需求 | “实现了什么”与“应该实现什么”两种判断被混淆 | **独立执行的 Product WHAT/L1 Owner 确认必须先于 L2/编码**；参考 App 只验证产品合同，不能反过来定义产品。技术 CI 绿灯也不能替代需求澄清 |

本表最后一条是整个 0.11.x 后续阶段的**预实施门禁**，并不意味着已在其它版本执行；该结论作为流程经验记录，不更新其它版本 Issue 或源码。

## 5. 版内遗留、非阻塞 P2 与适用边界

| 来源 | 现状 | 正确处置 |
|---|---|---|
| R72 P2 / `Object.entries(value)` | Writer 对极大、未受信对象可能先创建巨量临时属性条目，然后才逐节点预算检查；现有限定 Profile 内的输出 1MiB 上限**不等于绝对预分配内存/CPU 安全上限** | 不宣称已解决，也不自动阻塞所有后续工作。只有真实产品要求对任意巨大对象严格资源界、或改动此 Writer 边界时，才以有界迭代 + many-key 压力负例修复 |
| R81 P2 / `scope.threshold=10` 与 `score>=10` | 参考业务数据与代码重复表达相同规则；v0.11.1 合同/CI 运行成立，但业务规则未来易漂移 | 保留历史 0.11.1 原样受审 SHA；当后续工作真正实施规则/知识合同时，指定唯一权威数据源并做改变规则结果与摘要的真实负例；没有新 Exact-SHA 审核前不把该 P2 标 FIXED |
| 测试 Profile | Node >=22.12.0 是声明的最低版本；已归档参考 App CI 为 Node v24.21.0 | 精确描述目标与实际运行环境；没有额外 Node22 执行日志就不凭 Node24 的 PASS 推出“Node22 每个 OS 组合均完整验收” |
| 发布与跨语言 | 内部节点组合通过、标准可描述多语言，但 v0.11.x 仍无 main/Tag/Release；具体运行只实现 Node ESM | 明确单阶段 scoped 合格与统一 Release 的差别；不得从规范支持推断所有 Target 已经实现 |
| 绝对权限/安全保证 | 受限 BUILD 静态封存、Pin/SRI、Init 资源句柄与负例验证；并非通用不可信代码沙箱 | 安全声明只能精确到源/目标/权限及可测试的 fail-closed 范围 |

**已解决的历史问题不能被当作 P2 重开**：例如 T12 局部 HTTP IPv6 loopback `[::1]` 误拒绝，已有 [PR #1648](https://github.com/kaicreator-mm/domain-harness/pull/1648) 针对性修复；旧结论的 `PENDING` 是历史快照，不是现行阻断。

## 6. 后续任何新阶段使用本版经验的最小门禁（可执行）

1. **先产品、后技术**：先逐条写清 WHAT/非目标/作用域/受影响旧能力；Product/L1 及可观察 AC 经 Owner 确认后，再审 L2 的 Element/Function/Package/Lock/权限/资源/状态/错误语义。**不得先写 Reference App 再由代码倒推本版产品需求**。
2. **明确版本边界**：沿用唯一 SDK、一个 KDP、一个 BUILD/Lock/Boot、真实多文件 Package、单一 Runtime；新增的 Knowledge/Task/Tool/LLM/Feedback 职责若不属于本阶段，不得另起 Runtime/Forge/兼容层。不足的上游合同要明确归属、证据和限度，不能静默绕过。
3. **先检查 Catalog 与源身份**：已接受的 Standard File Element 只按真正声明的 FunctionRef/直接 Extension/Target/ResourceDigest 使用。一般 Package 手工创建即可，不需要生成器。若提出新 Standard，先证明跨领域可复用性。
4. **验收用同一个真实 Reference Domain App**：在其后续阶段的源树里增加增量业务内容，继续从一个公开 SDK 构建/安装/Boot/Workflow/Exit；保留 v0.11.1 的`源码+AppPackage+Lock`不可变配对凭据。历史旧版本只做必要 pair-specific smoke，不强推跨阶段 ABI 兼容。
5. **测试矩阵必须包含**：合法 COMPLETE、至少一个 UNKNOWN/不适用、至少一个未选/越权/过期 digest/SRI 拒绝、Init/Exit/清理，以及本次触及的预算/深度/Hook 或数据更改反例。测试在有权限的实际消费者里跑，不用 mock 冒充真实执行。
6. **提交与 CI**：语法/类型/Lint、受影响测试先通过，再根据真实信任边界决定是否运行 CI；一个 checkout、一次合理干净安装的 Consumer，尽量复用旧成功 SHA 的不变证据。流水线 CANCELED/ERROR 与 TEST FAILURE、REVIEW REWORK 与 CI FAILURE 彼此区别，日志必须精确归因。
7. **审查与封存**：由非 Writer 对 GitHub **Exact HEAD + 实际 diff + 同 SHA CI** 做 scoped review；P0/P1=0 后才能合并。成功之后立即把运行 Node、Source SHA、Package/Lock Digest、证据来源、残留 P2 和实际合并 SHA 放入 Stage Index 与版本 Issue。纯文档变动不得谎称源码 CI 在新 SHA 上重跑。
8. **结束条件**：一次有限任务有可交付结果就停止；不启动无期限本地 Agent、不建立额外未定义产品和重复治理项。**Scoped stage closeout ≠ 整个版本列车发布。**

该门禁基于既有 [工程质量手册](./DOMAIN_HARNESS_V011X_DELIVERY_QUALITY_PLAYBOOK.md)；若未来产品澄清改变某项技术选择，优先接受经确认的新合同并列出受影响的 Exact-SHA 复验，而不是机械继承样例的合成业务逻辑。

## 7. 优先继承的文件与审查来源

- **功能 WHAT/L1**：[v0.11.1 PRD](../product/DomainHarness_v0.11.1_Task_Execution_PRD.md)；**L2**：[Init-owned Workflow 设计](../architecture/DomainHarness_v0.11.1_L2_INIT_OWNED_WORKFLOW_CONTRACT_R16.md)。
- **标准资产**：[Standard Element Catalog](../architecture/DomainHarness_v0.11.x_STANDARD_ELEMENT_CATALOG.md)；**加载性能**：[R60 W04 决议](./DOMAIN_HARNESS_V0111_R60_SDK_ROOT_LOAD_DECISION.md)。
- **执行与质量方法**：[0.11.x Delivery Quality Playbook](./DOMAIN_HARNESS_V011X_DELIVERY_QUALITY_PLAYBOOK.md)；**参考消费者**：[Reference App README](../../examples/reference-domain-app/README.md)、[Stage Index](../../examples/reference-domain-app/stages.json)。
- **最终实现/非 Writer 独审**：[R72 / PR #1663](https://github.com/kaicreator-mm/domain-harness/pull/1663#pullrequestreview-6012506153)、[R81 / PR #1665](https://github.com/kaicreator-mm/domain-harness/pull/1665#pullrequestreview-6012849208)。
- **实际 CI**：[Woodpecker #2979](https://ci.kaicreator.com/repos/18/pipeline/2979/1)、[#2981](https://ci.kaicreator.com/repos/18/pipeline/2981/1)；**原始收据取证**：[R83](https://github.com/kaicreator-mm/domain-harness/issues/1664#issuecomment-7080935568)。
- **版本关闭记录**：[#1605](https://github.com/kaicreator-mm/domain-harness/issues/1605)、[#1608](https://github.com/kaicreator-mm/domain-harness/issues/1608)、[#1656](https://github.com/kaicreator-mm/domain-harness/issues/1656)、[#1664](https://github.com/kaicreator-mm/domain-harness/issues/1664)。

### 复盘完成的判定

**版本内部已完成**：Product/L1/L2 + T11–T14 + R53/R58 + W01–W08 + 真实独立 Reference App 的 R81/R83/R84 受限验收，四个相应 Owner/Task Issue 关闭。  
**历史风险被准确保留**：R72 P2、R81 P2，以及 Node/运行 Profile/正式发布边界没有被篡改或伪造“已修复/已发布”。  
**对后续的实际价值**：一套可审核的需求准入、最小真实消费者、直接权限/摘要拒绝、CI/Review 复用与 StageIndex 证据封存流程；不必重新发明一套 DomainHarness 架构或示例应用。
