# DomainHarness 0.11.0 — Owner 决议、讨论史与规范权威的固化记录
<!-- DH_V011_OWNER_CONVERSATION_CHRONICLE_R1_20261120 -->

```ini
OUTPUT_LABEL=DOMAIN_HARNESS_V011_OWNER_DECISIONS_HISTORY_R1
PRODUCT_VERSION=0.11.0
MASTER=kaicreator-mm/domain-harness#1563
PRODUCT=kaicreator-mm/domain-harness#1564
PRD_PR=kaicreator-mm/domain-harness#1565
REVIEWED_SUBJECT_PRD_BLOB=25ec66030dfafe60309eb9e6609b590c0b803bde
PRD_PATH=docs/product/DomainHarness_v0.11.0_ELEMENT_FIRST_PRODUCT_PRD_CANDIDATE.md
INTEGRATION_BRANCH=version/v0.11.0
INTEGRATION_BASE=b1b2c182c1cb49c1b63b1efaf57ff9132d9cf4b0
ADS=4.18.0@2c395c55569fe2edf3f4135f12d3d069e526d0b7
OWNER_SCOPE_INTENT=APPROVED_BY_CURRENT_USER_TURN
SELECTED_PRODUCT_REVIEW=REQUIRED_ON_FINAL_PR_EXACT_SHA
PRODUCT_FREEZE_CHECKPOINT=WAITING_FOR_INDEPENDENT_PRODUCT_REVIEW_AND_VERSION_BRANCH_ADOPTION
L2_ARCHITECTURE_FREEZE=NOT_RUN
IMPLEMENTATION_DAG=NOT_ADMITTED
```

## 1. 权威、版本与决议级别

用户在 2026-11-20 当前对话明确要求：**“将这份 PRD 固化，之前对话讨论的内容也整理出来固化，并大概确定后续 0.11.x 各个版本的内容范围，然后继续按 ADS 规范快速推进。”**

这是对下述 **v0.11.0 R2 PRD 的产品范围明确认可与请求落地固化**，不是让 Builder 自己伪造独立 Product Review、Release 或 Full DIS Conformance。按固定 ADS `Stage 1：`Owner 已认可的精确 PRD subject → selected 独立 Product Review → 由 Product Authority 明确形成冻结 checkpoint → L2 → Task DAG → Implementation`。本文件持久记录 **Owner scope decision**，不得把 `PRODUCT_FREEZE_CHECKPOINT=WAITING` 写成 `PASS`。

**精确内容主题**：`docs/product/DomainHarness_v0.11.0_ELEMENT_FIRST_PRODUCT_PRD_CANDIDATE.md` blob `25ec66030dfafe60309eb9e6609b590c0b803bde`，PR [#1565](https://github.com/kaicreator-mm/domain-harness/pull/1565)。与它不一致的旧候选/聊天总结，以此最新 **Owner 接受的 R2 PRD 语义**为准；如果后续独立评审指出实质 P0/P1，需要合法修复、重新审相应新 SHA，而不是偷偷提升旧版范围。

### 1.1 持续有效的独立项目不变量与继任解释

- [#1477](https://github.com/kaicreator-mm/domain-harness/issues/1477)：领域智能是目的，Domain Data/Knowledge/Rules/Structured Semantic、领域所有权与来源不能退化成简单函数名文本；DomainHarness 消费执行，而不重新制造 Forge。
- [#1484](https://github.com/kaicreator-mm/domain-harness/issues/1484)：继任 Boot→单 KDP Primary Product/L1 checkpoint 已建立。Boot 是最小前置引导；KDP Primary 内有 Kernel Core + Package System，**没有第二独立 Microkernel/Package Manager 权威**。
- [#1480](https://github.com/kaicreator-mm/domain-harness/issues/1480)：统一 K/S/B Package Primary/Extension 与统一 Manifest、Package Dependency DAG、Hook owner、Boot/KDP/Target/Lock 的丰富候选；*本身并非冻结的 v0.11 字段 ABI*。
- [#1496](https://github.com/kaicreator-mm/domain-harness/issues/1496) 与 [Draft #1497](https://github.com/kaicreator-mm/domain-harness/pull/1497)：DIS 0.2 Element-first/Function/App Init 语义设计，Bounded Demo 与 Full Conformance 区分；DIS 不是第二套 DomainHarness Runtime，也不是 0.11.0 必须完成 21/21 的授权。
- [Cross-Version CV-01…CV-12](https://github.com/kaicreator-mm/domain-harness/blob/b1b2c182c1cb49c1b63b1efaf57ff9132d9cf4b0/docs/architecture/DOMAIN_APP_CROSS_VERSION_PRINCIPLES.md)：可信的自行构建闭包，BUILD 为静态合法性主验证者，单 Runtime/领域权威边界，选定功能才能加载；未来真实外部用户输入、状态和不可逆 Effects **仍需真实时点校验**。该语义不构成强制复用旧 0.10.3 SDK 的代码/API/业务功能。
- [#1567](https://github.com/kaicreator-mm/domain-harness/issues/1567)：F01–F24 是历史能力及需求**来源台账**，不是 0.11.0 必须复制旧实现的 Task DAG。逐版本候选分配见同 PR 新 Roadmap。

### 1.2 史实优先级

1. 当前用户明确决议 R5 和本轮 PRD 固化命令；
2. R2 PRD 单一源文件（其精确 Blob）及后续被明确接受的 scoped Delta；
3. 被正式接受的上位 Product/CV-01…12 对新版本仍适用的原则；
4. 本决议纪要、0.11.x Roadmap、#1563 / #1564 checkpoint；
5. #1480/#1497 候选研究和历史 dev.1/dev.2/dev.3/private CI 仅是参考事实；
6. 旧 R0 PRD 和 Reviewer 对旧 SHA 的结论仍为历史**不能用作新 HEAD 的 Review PASS**。

## 2. 讨论演进回放（R0→R5→R2，精确影响）

| 轮次 / 讨论主题 | 当时提议、发现或用户纠正 | 最新纳入 0.11.0 的决议 | 被替代的旧要求 |
|---|---|---|---|
| **原 0.10.3 后继动机** | 以函数/自由文本/Route 为主的领域表达不利于扩展与程序化分析；要把内容和智能定义成一等对象 | **Element-First** 统一 Domain/Element/Function/Content 语义，Function 不是 Element 本身 | 继续以自由文本/handler 为领域唯一真相 |
| **原 Issue #1563 初版** | DomainHarness SDK/BUILD 原位重构；误把历史独立 DIS private dev.3 当下一正式产品 | v0.11.0 是**一个全新 canonical DomainHarness SDK/BUILD/KDP 架构**，不发并行 DIS Runtime | `dis-v011-runtime-dev.3` 当作正式版本 |
| **用户缩版决议 R3** | 0.11.0 可只做 Element 内容组织与 Domain App Init/结构；0.11.x 逐步填充其它功能 | 将完整**基础结构**作为版本门槛；不在 0.11.0 做全 Agent、Knowledge、Meta、LLM 业务引擎 | 0.11.0 同时完成全部 F01–F24 |
| **App Init 与最新 DIS 一致性核对** | 旧 private callback list 不是真实 AOT-selected App Init；Ingress 不应经 Init 成为 Router | 两层 Init：KDP 管 Package technical Init，唯一已锁定 Business App Init Element，入口可直达其他 selected Functions | 任意 caller callback 可代表已封存 Init；Main Workflow 必需 |
| **用户进一步纠正 R4：Boot→KDP** | 之前 Boot 只是概念；必须定义如何定位 Pin、固定入口、独立 KDP 自举 | Boot 只加载 pinned KDP；KDP 内唯一 Kernel Core + Package System，再依已选 Lock 装配其它 Package | Boot 自己解析 DAG/加载 SDK/执行业务 |
| **用户 R4：多层 Package 属于 0.11.0** | K/S/B 三层 Primary/Extensions、Hook、Target、Package Manifest/Lock 生命周期仍零散 | 三层统一技术 Manifest/生命周期，显式 Package/Element DAG、Owner/export/import，BUILD 决定装配顺序 | 仅改 Element Schema，不实现 Package 架构 |
| **用户 R4：可信自产、Build-time First** | 静态错误应在创建/BUILD/Test 时发现，不能在启动时重复运行依赖求解/复核引擎 | BUILD 静态闭包一次验证，Runtime 只做必要执行/物理错误报告和真实操作前 live rights | 新建并发 Stop/Drain、失败恢复/热替换/重试系统 |
| **用户 R4：旧 App 不兼容** | 旧 v0.10.3 App/SDK API 不需要保留 | 新 0.11.0 可以 breaking；只保留历史正式发行文件/Tag 不回写 | 旧 App clean-consumer compatibility smoke 必须通过 |
| **用户 R5：取消旧功能/机制复用义务** | 不是仅移除兼容 API，连旧版业务功能、Kernel/SDK 内部实现的保留和复用也不强制 | **新 0.11.x 从新架构实现**；旧源码仅可选参考、无迁移/parity Gate | “旧能力必须保留”“完整已有功能不得丢失”“必须 port dev.1/.2” |
| **用户 R5：Element/Package 内部内容不完整** | Element Types/Contents、Package Element 组织、旧 Knowledge/Rule/Workflow 等如何 Element 化仍模糊 | 单一 Element Schema + typed extensible ContentBlock + 多值 descriptive tags；0..N Function；Package 多 Element，明确唯一 owner/export/ref | 固定互斥 Knowledge/Rule/Operation Element 类继承树 |
| **PRD 审核历史** | PR #1565 旧 R0 @`29a65f11…` 得到 REWORK P1×2/P2×2，包含兼容不明确、真实知识未参与行为 | R2 明确 Breaking；AC06 要一份真实 selected typed knowledge/rule 影响简单 Function 的结果，包含负例/UNKNOWN | 只包装函数/输出 JSON 就宣称 Element-first 完成；复用旧 HEAD Review |
| **本轮 Owner 固化命令** | 要正式固化 R2，整理上述历史，再安排 0.11.x 大致版本并按 ADS 继续 | 本史料、R2 PRD、新 Roadmap 共同构成待最终 review 的 Stage1 完整候选，记录 Owner 确认 | 继续追问此前明确回答过的范围问题 |

以上每一项均可回溯到 #1563 当前主 issue、[#1563 R4](https://github.com/kaicreator-mm/domain-harness/issues/1563#issuecomment-7020396688)、[#1563 R5](https://github.com/kaicreator-mm/domain-harness/issues/1563#issuecomment-7020667768)、#1564、#1480、#1496 以及本版本 PRD。此表总结**讨论中的决定与覆盖关系**，并非声称其它对话都有单独的 Review/CI 证明。

## 3. 0.11.0 正式功能范围（R2；保持简洁但架构完整）

### 必须一次冻结的 12 项架构选择

- **AR-01—03**：单一 Element 根模型；typed content blocks 可扩展、roles/tags 非权限；Element 0..N 公共 Function，独立职责/版本/定义所有权，跨 Package 显式导入/导出；
- **AR-04—06**：K/S/B Package 统一 Manifest/Loader/lifecycle、一 Primary 每层 + 可选 Extensions；App Descriptor + Package Manifests + exact BUILD-generated Lock；Package typed DAG、Element dependency DAG、Semantic Graph、Workflow 不混；
- **AR-07—09**：Source/Schema/Resource/Target/Implementation/Hook 依赖全部在 BUILD 解析并 pin，Boot 只加载 KDP，KDP 自举/装其它 Package；选定唯一 Business App Init，直接 Function ingress；
- **AR-10—12**：本版真实执行简单 no-effect typed Function、拒绝未实现的 Effect/LLM 等可执行声明；旧 App/ABI/内部机制不兼容或不强制复用；只发行一个 canonical 新 SDK，不把 private Demo 当产品。

### 本版质量目标

机器可读的 Versioned Schema/TS Contracts + 结构化 Content/Source Ref + 多 Element Package、跨 Package Public Function、三层 Extension/Hook/Target + Boot/KDP + App Init + selected content 真参与 deterministic decision + clean-installed new SDK consumer 是**架构基础的必要最小真实证据**，不能退化成“只有设计图”；无须为了架构版本增加生产知识库、真实 Tally/xDownload 业务全链、完整远程 Effects、LLM Agent/Meta 或模拟敌意代码沙箱。

### 明确不做

- v0.10.3 旧 App/ABI、Source 兼容、legacy functional parity、强制旧代码移植；
- 新的 Provider/LLM/Harness/Knowledge SQL/Meta/Agent/Events/复杂 Tool/全业务产品功能；
- 多 SDK/Business 独立 Primary、第二 Runtime/Kernel、动态插件发现、Package 自管理运行时；
- 重复 runtime dependency/build validation、并发 Stop/Drain/Crash Recovery/Retry/Replay/Hot-Swap 引擎；**但不可用 Build-time 预知未来真实授权/外部状态，不可宣称不存在物理启动失败**；
- 完整 DIS Full 21/21、14 个领域业务迁移、真实多 OS/原生沙箱/非必要冗余治理。

## 4. “明确”与“尚需 L2 技术决定”的正确边界

Owner 接受本文件与 PRD 的 **Product Scope 不代表**必须亲自审每个技术字段。以下是 `L2_IMPLEMENTATION_DETAIL_OPEN`，**不得冒充产品范围 UNKNOWN**：

| 已定的 Product 意义 | L2 应定稿的实现细节 |
|---|---|
| 一个 Element Kind + typed contents/facets、公开 Functions | JSON Schema URI、TS types、canonical IDs、required/optional extension policy、字段名 |
| Package 内 Element 唯一 owner、export/import、Target 实现选定 | 具体 Package manifest shape、version/digest canonicalization、Target matrix |
| K/S/B Primary + Extensions、Hook 属 Package | typed dependencies/hook bindings / composite graph 审核、拓扑 tie-break |
| App Descriptor + generated Lock | Lock 格式/确切内容序列化、可复现 SHA、安装 records |
| Boot 只加载 KDP、KDP 独立自举 | 单一启动函数签名、bootstrap locator/install pin、KDP 核心/Package init API |
| 唯一 Business App Init 与直达 Function | Init Result/Context 的 TypeScript signature，typed Ingress binding |
| One canonical SDK/public consumer | npm exports/CLI optionality、monorepo packages 内部切分、Node ESM minimal target |
| 构建期校验 + 最小 runtime | 具体 BUILD error codes、unselected profile refusal、CI/fixture 命名 |

L2 遵循 **Tests → Contract → Implementation → Failure Handling → Example/Docs**，只需真正 impact 新语义/公共接口的最小 Review；对于已明确结构，不要展开无限研究、过度证明或回滚到旧方案。

## 5. ADS 4.18 进度/资格基线（不可虚报）

- **Stage 0**：版本身份、GitHub source、ADS Pin、Version Branch 已建立。
- **Stage 1 Owner Scope**：当前消息明确**接受** R2 PRD/本版本方向并要求正式固化；记录为 `OWNER_SCOPE_ACCEPTED`。
- **Stage 1 Selected Product Review**：**REQUIRED**，因为新的 Element Schema + Boot/KDP/K/S/B 权威 + Breaking 公共 SDK 是实质语义/兼容变更；旧 Reviewer 仅审过旧 SHA `29a65f11…`，结论 REWORK。**当前 R2 + 本纪要/路线图 PR 最终 HEAD 需要另一独立对话的 source-first exact-HEAD review**。
- **Stage 1 Product Freeze**：必须在前述独审合格后，把被接受的 PRD Blob 和最终 PR Tree/Review 以及 Owner 决议绑定到 `version/v0.11.0` 的真实稳定 commit/checkpoint。没有此事实时状态为 `PENDING_REVIEW` 而非 `PASS`。
- **Stage 2 L2 / Task DAG**：可阅读当前 L1 并提前整理候选技术设计、测试优先级/Scaffold 风险，**不得在 Product Freeze 前宣称 L2 已冻结或原生实施 DAG 已获准**；合法实现仍需 L2、Task DAG、Claim/Host/CI/必要 Review。
- **Review 角色区分**：Builder Writer 与 Independent Reviewer 可以共享 GitHub transport 账号，但必须由**不同对话/逻辑 operator/session**执行；不得由本 Builder 在同对话给自己 R2 PR 签独立 PASS。
- **Delivery-first**：所有 ordinary repair 无需再次等待 Owner 额外批文，保持最小必须验证、不重测旧业务、CI 不代替其声称的其他 gate。实质权限/运行 Effect/正式 Oracle 等资格不得从文档或旧 CI 继承。

## 6. 下一步确定动作

1. 将 PRD R2 + 本记录 + Roadmap 在 **原 #1565 docs-only Product PR** 上由单 Writer 提交；读回最终 PR HEAD、3 文件实际 Blob 与 CI。
2. 本轮 Owner Scope Approval 写入 #1564/#1563，声明绑定 PRD Blob `25ec66030dfafe60309eb9e6609b590c0b803bde`。
3. 原 PR #1565 在**其它独立 ChatGPT 对话**对最终 HEAD 做 selected Product/L1 审查：实读 PRD、讨论史与路线图、#1477/#1484/#1480/#1496、CV-01…12、旧 R0 P1×2 修复是否真实覆盖；结论 ACCEPT/REWORK/P0-P2；只审新增/变化风险，避免重做历史已通过内容。
4. Review PASS 及必要 docs-only CI 成立后，建立远端 Product Freeze checkpoint 并合法受控合并到 version branch；然后迅速做范围收敛的 L2 与少量高并行 Task DAG，准备 Builder/Validator 任务；不提前动业务源码。
<!-- /DH_V011_OWNER_CONVERSATION_CHRONICLE_R1_20261120 -->


## R27（2026-11-21）最低运行时及代码质量决议

当前用户明确要求：检查日志/注释、Node 最低依赖降至 22、修复 v0.11.0 R26 评审发现。最低基线选择 Node.js >=22.12.0（ESLint 10 和 JSON/ESM 稳定特性），锁定 Target 改为 `node22-esm/1`；Node24 Host 仍可运行。候选修改须经受影响测试、现有单 Woodpecker、Node22 真实环境验证和精确 SHA 受控合并。历史 Node24-only L2 结论自本增量生效起由本决议取代，不追溯修改先前已审核证据；当前不自动授予 Release Qualification 或发布。日志继续使用 BootResult/FunctionOutcome 结构化失败代码，由 Host 自主输出，业务敏感数据默认不采集。
