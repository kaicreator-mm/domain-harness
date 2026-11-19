# DomainHarness 0.11.x — Element-First 后续版本候选路线与依赖关系（R1）
<!-- DH_V011X_ELEMENT_FIRST_RELEASE_ROADMAP_R1_20261120 -->

```ini
OUTPUT_LABEL=DOMAIN_HARNESS_V011X_ELEMENT_FIRST_ROADMAP_R1
MASTER=kaicreator-mm/domain-harness#1563
PRODUCT_0110=kaicreator-mm/domain-harness#1564
PRIMARY_PRODUCT_PR=kaicreator-mm/domain-harness#1565
FEATURE_INVENTORY=kaicreator-mm/domain-harness#1567
STATUS=OWNER_REQUESTED_ROADMAP_CANDIDATE_NOT_FUTURE_PRODUCT_FREEZE
VERSION_0110=ARCHITECTURE_FOUNDATION_ONLY
VERSION_011X=REIMPLEMENT_FEATURES_ON_0110_CONTRACT
LEGACY_PARITY_PORT_ABI=NOT_REQUIRED
APPROVAL_FUTURE_PATCH_SCOPE=NOT_AUTOMATIC
PINNED_ADS=4.18.0@2c395c55569fe2edf3f4135f12d3d069e526d0b7
```

## 1. 规划依据、有效性和划分规则

0.11.0 是唯一**当前需要正式冻结/实施**的版本；本文件给后续小版本建立**大致范围与依赖优先级**，不能直接视为 0.11.1…0.11.8 的 Product/L2 Freeze、预算/发布日期承诺或 Native Task DAG。每个后续版本按对应真实需求基于冻结的 0.11.0 Element/Package/Boot-KDP/Build/Function Contract 做 Product delta → minimal L2 → Task DAG → 必要测试/Review/Release。当前尚未实现的 Profile 只能标 `NOT_IMPLEMENTED_IN_0110`。

**原则**：
1. **全部使用 0.11.x 新架构**，不用承诺旧 0.10.3 App/SDK API、已实现功能和机制继续保留或迁移。旧码只可参考，不是依赖，禁止以旧版曾经 CI PASS 为新版合格证明。
2. 先让 Domain App 具备对真实问题有用的最小确定性知识、规则、读写能力；之后再补可选 Interaction、LLM、Harness、Memory/Meta、Tool 等，不因热门模型功能打断结构版本。
3. 每版一个主要能力 Concern；共享公共契约变化按实际代码影响合并，避免每个小版本同时开数十个模块重做。
4. `Rule/Knowledge/Workflow/State/Tool/Experience` 均须作为新统一 Element 的内容、Function 或 Package binding 组织；**不得**创建独立“Rule SDK、Knowledge Runtime、Agent Runtime、Workflow Kernel”与 KDP 并列。
5. 0.11.x 只允许对 0.11.0 已冻结架构进行**兼容性增量扩展**。若需求本质破坏 Element identity/Package owner/Lock/Boot-KDP 或核心 API，则应做新 minor（例如 0.12.0）的单独 Product/L1 决议，不以“patch”掩盖 breaking。
6. 每版必须以当前事实确认 KDP/Host/Effect 的真实可用性；Build 完整性≠真实业务 Oracle、历史 Mock≠真实 Host 授权，不能把在 0.11.0 未实现的 Effect/Journal/Recovery 宣称已完成。

## 2. 建议的版本/功能范围表

| 版本候选 | 核心用户价值 / 版本 Outcome | 新架构中的主对象与实现边界 | 关键证明、依赖与非目标 | 来源 |
|---|---|---|---|---|
| **0.11.0** | **Element-First + Boot/KDP/多层 Package 架构基础**；可创建、选择、封存、装配、启动、检查和调用一个基础 Domain App | Domain/Element（0..N Function+typed content）/Package K-S-B Primary+Extensions/Build Lock/单 App Init/无 Effect Function，最小已选知识/规则影响输出 | AC01–AC10；无旧 App ABI、无全业务迁移、无 LLM/Meta/真实 Effect 框架 | #1563/#1564/#1565, #1480/#1484/#1496 |
| **0.11.1** | **确定性 Domain Intelligence MVP**：真正可复用的领域事实/规则/校验/识别/决策，实现有用的 Read-only Domain App | `Knowledge/Rule/Decision/Validator/Recognizer` content & Function/typed outcome/Applicability/UNKNOWN，多个 Element 的真实协调；跨领域两个不同简单消费者做独立验证 | 依赖 0.11.0 的内容/资源/Function/BUILD。证明规则参与真实领域决定与结构化 UNKNOWN；不做复杂知识 DB、自动学习、LLM | #1477/#1485/#1496, #1567 F05/F06/F07/F10/F17 |
| **0.11.2** | **可用的 Domain State 与受控 Effect**，支持真正端到端业务命令：可信授权→调用 Host/Capability→可检查结果；先实用再扩展 | 新 KDP Kernel 的 bounded Admission/Effect/Outcome/State primitives、业务 State Element、选定 Host/Capability/Tool Operation contract、最小持久化；公共 Function 的 effect declaration | 必须真实校验 live user/State/Effect 权限，区分提交/UNKNOWN/拒绝，先完成一个真实、可证伪受控外部操作，不重搬旧 v10 Runtime；Crash/replay 长尾范围按需求独立裁定 | #1477 CV-06/11, #1480/#1304, #1567 F14/F17/F19 |
| **0.11.3** | **Knowledge Reader/Query 与领域资源访问**：检索结构化知识、版本、来源、适用范围及可选索引；与 Rule 联动 | `Knowledge/StructuredData` Element、Reader/Query Function、Source/Schema/Snapshot/Provenance、包内静态资源 + 需要时可选 SQLite/索引 | 不建通用图数据库平台、不替 Domain-Forge 生产知识、不因 SQLite CAS 存在误称已是 Knowledge DB；支持离线 Basic | #1476/#1477/#1496, #1567 F08/F13 |
| **0.11.4** | **Interaction 与 Guided Journey**：动态 Form/CLI/Chat 共同使用的 Domain Intent 澄清、确定性分支和直达 Function | `Interaction` Element、UI-neutral `StepSpec/StepOutcome`、Intent→已选 Function/Operation、可选 context assembly、离线 Guided Journey | 未确认用户意图不等于可执行授权；无专门 UI 引擎/Agent；仅在真实多入口需求出现时增量 Hook/Events | #1395/#1489/#1478, #1567 F09/F15/F23 |
| **0.11.5** | **可选 LLM Provider + Bounded Harness**：确定性不能解决的问题才消耗模型，使用已选知识/规则/Functions 的闭环 | `LLM/Harness/Context` Elements，selected Provider profile、预算、typed intermediate result/UNKNOWN、KDP permit boundary，必要的单/多轮最小推理 | 模型输出不授予 Effect，不允许未选 Function 动态插入，真实 provider 调用与成本凭证独立于 Basic；不做通用 Agent 平台 | #1478/#1396/#1496, #1567 F07/F11/F23 |
| **0.11.6** | **复杂业务 Workflow、Business Events 和可扩展 Tool/Package 互操作**：实际跨 Element/Package 过程组装 | `Workflow` content/Function、业务事件订阅/过滤、声明式 Tool Operation/可选 Remote/IPC Adapter、selected Hook Provider 组合 | Workflow 不是唯一业务入口，也不是 KDP 调度器；不同 Tool effect 仍经单 KDP 真实授权；远端 Streaming/Cancel 只有用例出现才单独选入 | #1468/#1361/#1489, #1567 F14/F15/F24 |
| **0.11.7** | **Experience/Memory/Feedback/Meta 正规选定实现**：已发生的事实可用于优化候选，但不擅自晋升真实业务能力 | `Memory/Evidence/Feedback/Experience/Meta` Elements；Domain scoped nonauthoritative snapshots；候选→Shadow→独立资格→下一 BUILD/Package | 知识与候选资格不来自未经证实的模型 PASS；真实 Promotion 与 Oracle 权威独立；不强制让 Basic App 部署 Meta | #1398/#1487/#1477, #1567 F12/F18/F19 |
| **0.11.8+ 或未来 Minor** | **按真实需求解决跨平台、复杂 Agent/远端 Tool、深层智能自举、更多消费者/形式化 Conformance** | 多 Target SDK/Package 实现、设备 Host/特殊 Runtime、remote stream/cancel、Full DIS/Forge 联动、DH-DI 自举及大规模消费者 | 必须具体商业目标/验证责任成立后再立项；影响基础 ABI/架构时升新 Minor，不把补丁号当破坏性改造通道 | #1477/#1478/#1544, #1567 F18/F19/F20/F21/F22/F24 |

**版本时间顺序可调整**，特别是状态/Effect 与 Knowledge Access 可因首个真实 Consumer 的需求对调，但**0.11.0 的结构基础不能推迟**。若当前 0.11.0 Basic 包含两个互相独立的简单 Domain fixture，仅证明架构泛化，不等于 0.11.1 完整领域智能 MVP。每版只对实际声明的功能开关和可证伪边界负责。

## 3. 依赖与计划并行度

```text
0.11.0 Element + Package + Build Lock + Boot/KDP + AppInit + typed no-effect Function
     │
     ├─→ 0.11.1 Domain rules/decisions/recognizers
     ├─→ 0.11.2 State + authorized Effect (business runtime correctness)
     ├─→ 0.11.3 Knowledge Reader/Query & provenance ─┐
     ├─→ 0.11.4 Interaction/Guided Journey ────────────┤
     └─→ 0.11.5 LLM/Harness ───────────────────────────┘
                           │
           ┌───────────────┴─────────────────┐
           ↓                                 ↓
      0.11.6 Workflow/Tool/Event         0.11.7 Memory/Experience/Meta
           └───────────────┬─────────────────┘
                           ↓
                    0.11.8+/new minor
```

此图是**能力依赖/建议顺序**，不是原生 GitHub Task DAG；真正可执行的 Native Task DAG **只属于当轮已冻结的版本/Task**，不能用本规划直接派发所有小版本。每个候选版本可以独立规划其最小 L1/L2 变更及单一集成分支。可为知识/Interaction 先并行做只读需求与 Schema 研究，但不提前修改尚未冻结的 0.11.0 共享契约。

## 4. 后续各版统一的退出门

1. **源真相**：对应版本 Product Goal、选定 Element/Package/Function、Release Env 与不做事项进入 GitHub；绑定 ADS pinned revision。
2. **可执行而非标签**：真实 public SDK/BUILD、实际 selected Element 参与用户业务、Positive/Negative/UNKNOWN、Role Scope/真实 Effect（如涉及）有证据。
3. **只执行必要验证**：只对 changed seams/行为跑 Test/CI/其它要求的真实 Host；不得迁入整套旧 CI 测试、旧业务功能验证历史，旧源码实际不受当前 Code Scope 保护。
4. **长期架构稳定**：后续 Feature 添加到既有 Element/Package/Lock、函数兼容扩展；不创建重复 Root Runtime、重复 Package Manager、面向某一个业务的 Core 特判。
5. **资质不混淆**：每个 0.11.x 的新功能是否真的进入当前新版由当前 SHA 的源/CI/消费者证明；Full DIS 21 项/第三方知识权利/真实 Host 授权/Oracle 单独评价。
6. **版本号只是候选**：若功能合并/拆分能减少风险和速度损失，按 Product 变更批准后可调整 Patch 数；不提前让本表变成并发推进所有版本的提交授权。

## 5. 近期推荐的实际优先序

**先完成 0.11.0** Product Freeze→L2→最小 Native DAG→真实 clean consumer 和发布。接着优先 **0.11.1 确定性领域智能**（解决 Element-first 的实际业务价值），然后根据第一个生产 Consumer 是否需要外部 Effect/持久状态，把 **0.11.2** 作为首个真正状态/受控工具闭环；其余 Knowledge/Interaction/LLM/Meta 逐版添加。不会因为新版本存在 roadmap 就中断当前 0.11.0 建设。

## 6. 版本外研究与经验索引（只复用语义，不强制迁移实现）

- [#1567 F01–F24](https://github.com/kaicreator-mm/domain-harness/issues/1567)：完整待处理能力来源/旧版本候选/源状态。用于确定未来需求，不生成代码保留义务。
- [#1480](https://github.com/kaicreator-mm/domain-harness/issues/1480)：统一 Package/Target/Boot 的已有分析，其中某些字段尚待 v0.11 L2 定稿。
- [#1496](https://github.com/kaicreator-mm/domain-harness/issues/1496) / [#1497 Draft](https://github.com/kaicreator-mm/domain-harness/pull/1497)：Element/Function/App Init 与 optional Harness 的标准候选；完整 DIS Conformance 必须独立裁定。
- [#1477](https://github.com/kaicreator-mm/domain-harness/issues/1477) / [#1478](https://github.com/kaicreator-mm/domain-harness/issues/1478)：Domain Intelligence 与未来 Harness 产品目标的方向来源。
- [#1468](https://github.com/kaicreator-mm/domain-harness/issues/1468)、[#1476](https://github.com/kaicreator-mm/domain-harness/issues/1476)、[#1489](https://github.com/kaicreator-mm/domain-harness/issues/1489)：Events/Tool、Knowledge、Operation Selector 的真正消费证据与边界。
<!-- /DH_V011X_ELEMENT_FIRST_RELEASE_ROADMAP_R1_20261120 -->
