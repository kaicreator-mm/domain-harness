# DomainHarness v0.11.0 — Element-First Product/L1 PRD (Candidate)

> **Stage 1 — NOT FROZEN.** Document owner: [#1564](https://github.com/kaicreator-mm/domain-harness/issues/1564); version implementation controller: [#1563](https://github.com/kaicreator-mm/domain-harness/issues/1563). This is a Product draft, not ABI/SDK implementation or release authorization.
>
> Inherits frozen Product #1477 and #1484, current Cross-Version CV-01..12; imports bounded DIS v0.2.0 Element-First design from #1496 while respecting #1497 draft / #1544 separate Full qualification.


# DomainHarness v0.11.0 — Product/L1 Element-First 原位重构候选（Stage 0/1）

```ini
OUTPUT_LABEL=DOMAIN_HARNESS_V011_PRODUCT_L1_R0
PRODUCT_VERSION=0.11.0
MASTER=#1563
TYPE=PRODUCT_L1_VERSION_CANDIDATE
PRODUCT_GOAL=DOMAIN_HARNESS_CANONICAL_SDK_BUILD_ELEMENT_FIRST
INTEGRATION_MODE=VERSION_BRANCH
CANDIDATE_MAIN_BASE=b1b2c182c1cb49c1b63b1efaf57ff9132d9cf4b0
STANDARD_PIN=ADS_4.18.0@2c395c55569fe2edf3f4135f12d3d069e526d0b7
SOURCE_OF_TRUTH=GITHUB_EXACT_SHA
STAGE_0=BASELINE_RECORDED
STAGE_1=PRD_CANDIDATE_NOT_FROZEN
STAGE_2_L2=NOT_STARTED
TASK_DAG=NOT_ADMITTED
IMPLEMENTATION=NOT_AUTHORIZED_BY_THIS_CANDIDATE
RELEASE=NO
```

## 1. User outcome (Owner direction)

**重构的是 DomainHarness 下一版 0.11.0 本体，不是一个新的独立 DIS Runtime。** DIS 的 Element-First 设计通过 DomainHarness 的现有 SDK + BUILD + Package System + 单 KDP Primary/Kernel 实现，任意适用的领域以 Domain Definition/Element/Function/语义依赖等选定资产装配 Domain App。使用者从已有公共 BUILD/SDK 使用它，而非只能通过私有 `packages/dis-v011-runtime` 示例执行。保留现有仓库历史、受支持接口/资格和旧标签，绝不重写 v0.10.3。

产品基准 #1477 已冻结 Domain Intelligence 产品方向（#1479 merge `b8135aa801eb38fcae2fa1fce3bada541178d5b9`）；#1484 确认 successor Boot→单 KDP Primary/Kernel；#1496 的 DIS 0.2.0 是最新 Element-first 设计来源，但它的 Full Conformance 仍另外由 #1499/#1544 按真实证明完成，不能冒充整套标准已冻结。架构原则 `docs/architecture/DOMAIN_APP_CROSS_VERSION_PRINCIPLES.md` CV-01..12 **INHERITED_UNCHANGED**。

## 2. 版本基本功能与实际交付

P01. **唯一模型**：Domain = Elements + Semantic Relations + Constraints/Invariants + Collaboration Semantics + Build-time Element dependency DAG；Element = cohesive library（0..N public Functions）、Function = 描述/类型化 I/O、适用范围、所有权、版本、实施策略与 typed outcomes。Semantic relation 不变成 Build/Workflow DAG；Domain-owned business State 不变成 SDK 全局状态引擎。

P02. **Canonical BUILD/AOT**：DomainHarness `tooling/build` 接收合格/声明适用范围的选定 DIS Domain Definition，选取 Target(当前真实 Node)、SDK/K/S/B/Capability/Function 实现及完整资源依赖，产出可复现锁定 App；编译/静态闭包校验在 BUILD 一次完成，不推到每次 SDK runtime 调用。不同 Domain 不依赖 `business-dis-player`、`recognizePlayer` 等通用入口特判。

P03. **Canonical SDK 与 Lifecycle**：`packages/domain-harness` 使用已有 KDP Primary/Kernel 与 Package Init → 单一 Business App Init → typed selected Function ingress → live business guards/选定权限 → correct outcomes → reverse dispose。不得第二 Kernel、Effect engine、Host/scheduler 或重做 KDP。

P04. **Selected Intelligence**：基础 App 能按确定性编译规则/合格缓存或显式 Function 实现运行；Interaction 是可选 Element，意图冲突需要澄清而不是擅自执行；确实选择的 Bounded Harness/LLM/Experience/Evolution 等按自己的合同接入，未选中不启动、无实际 Provider/Oracle 不声称 verified。旧 v0.3 决策优先级按其真正适用/获批合同传承，不发明第二 Router。

P05. **KDP and Effect Authority**：Effect/Admission/Journal/CAS/Replay/UNKNOWN 仍由已有唯一 K Primary 控制，Domain-Forge 是知识生产方、Domain 业务状态由业务拥有；Agent/LLM/Experience 不铸造 Effect Permit，不能将凭据不足的业务输出升级为专业资格。

P06. **General-purpose Consumer**：至少两个异构真实 Business Domain（Tally、xDownload）基于同一 canonical BUILD/SDK 接口完成 source-pinned AOT→App Init→多个 Function→typed outcomes/UNKNOWN→dispose，关键失败/不一致/未授权 effect 都可观察；不能把两个手工 Demo helper 的组合冒充通用 SDK 实现。

P07. **Delivery/Compatibility**：主 SDK、BUILD、Contracts 的实际导出与已安装消费者是验收主体。历史 `packages/domain-harness` workspace `0.2.0`、`tooling/build`/Contracts `0.10.3` 与 private Demo `0.11.0-dev.2` 并存，L2 必须先确定合理 version/ABI 迁移方案；不能只改 package.json 版本号。PRD 目标产品版本为 **DomainHarness 0.11.0**，与 **DIS 0.2.0** 标准版本独立。

## 3. Cross-project responsibilities / non-goals

- DomainForge/外部生产组件产生可被选定的知识/智能资产；本版本实现 **DomainHarness 消费与执行**，不另造 Forge、RAG 管理 UI、Agent 开发平台、数据仓库。
- KDP Primary = 唯一可信 state/effect execution authority；DIS 是 domain-intelligence semantic/contract design，不接管 Kernel。
- Package 的内部 npm/Node/native helper 不自动升级为 Tool。一个 Basic App 可无 LLM/Experience/Meta/Workflow，只加载确实选中的能力。
- 不要求替代/重写 v0.10.3 已发布 ABI，不修改其它 14 个业务项目，不把独立 #1544 Full Conformance 的剩余 8 项等同为本版本 implementation DAG。
- 不重建 private runtime、不以刷新全部旧版本测试、形式验证论文或重复治理工作替代真实功能。

## 4. Baseline/source ownership and reuse ledger

| 来源 | 实际已发生事实 | v0.11 处置 |
|---|---|---|
| #1477 + #1484, CV-01..12 | 已冻结产品/单 KDP successor 等受各自权威限定的设计 | **ADOPT**，无需重冻历史 |
| #1496 + Draft #1497 | Element-First Product 设计已形成；有界 Demo 被 Product 接受，但 Full 尚未合格 | **ADAPT_DESIGN**，明确候选/正式边界，不能无条件写 `FROZEN` |
| #1529 dev.1 `4540f5fae282d3a62b379e8af1b39316c3ba3737` | 4/4 已完成，private D1 Element/AOT、D2 Bounded、D3 两领域样例 | **PORT_OR_REUSE** 代码及可适用测试；不转移发布资格 |
| #1540 dev.2 `42fc57c2d2e7291ed4a7cf5578dd5a449029c864` | 3/3 完成，App Init/typed Invoke/private E2E；包级 138/138 同 SHA 验证 | **PORT_OR_REUSE**，不重派 |
| #1556/#1562 S1 `97bb82e8929fd30b422c45de3d05a377f4c8ef27` | READY 门、in-flight drain，真实 Woodpecker verify+min-node SUCCESS；独审/合并未完成 | **CANDIDATE_REVIEW_THEN_PORT** |
| #1557/#1560 B1 `a2446beb03c0b881577c31bf9dd89bb30b9e2fc3` | 预算耗尽防虚假成功；双 CI SUCCESS；未合并 | **CANDIDATE_REVIEW_THEN_PORT** |
| #1558/#1561 I1 `848beb20bc96196a1d28b2d830b970488e263aec` | Deterministic Intent 澄清；双 CI SUCCESS；未合并 | **CANDIDATE_REVIEW_THEN_PORT** |
| #1559 old I0 | 尚未实施，范围为 private Demo 拼装 | **SUPERSEDE_AS_VERSION_EXIT**；可选择只作为私有测试辅助 |
| canonical `main@b1b2c182` | `tooling/build`、`packages/domain-harness`、`packages/contracts` 真实存在 | **NEW_VERSION_PRIMARY_IMPLEMENTATION_BASE**，以它为差异/CI/ABI 真相 |

复用三个判定：
1. **REUSE_AS_IS**：已在 canonical 包中存在且 ABI/版本/作用域契合，直接采用，不重写/重复必要旧验收。
2. **PORT_AND_DELTA_VALIDATE**：private 模块代码有价值但必须迁入现有 BUILD/SDK/Contracts 后按新 public consumer 和变化的 Authority seam 补最小正反例/当前 SHA CI。
3. **REFERENCE_ONLY**：私有 Demo、旧 Scope CI、第三方签名/正式 Full 资格不具备新适用性时仅引用，不宣称已获得新的授权。

## 5. Stage 1 acceptance / gate

Stage 1 可以被判定 Product FREEZE 仅当：
- 独立审核本文件在 **当前 exact PR SHA** 与 #1477/#1484/#1496/CV-01..12 的约束兼容，关键 P0/P1 为零。
- 对 v0.11 的基本业务价值、正式公共 SDK/BUILD 边界、旧版兼容与私有原型迁移作出唯一明确版本选择，不把 0.11.0 dev3 的 private package 当成正式版本。
- 明确 Basic App 必须功能与 Optional 的 selected-scope，不以没有真实 Oracle/Host 的结果虚假晋升。
- 以单独 GitHub Stage 1 Checkpoint 记载 reviewed SHA/Blob、Product freeze status 和 Stage2 授权；**此 Candidate、PR 通过 CI 或本 Issue 存在，不等于冻结**。

**Stage 2** 再作主 SDK BUILD API/ABI、TypeScript Contract、KDP/Package sequence、旧代码迁移落点的 L2 并审核 Freeze；**Stage 2.4** 冻结最小 coherent Concern 的 Task DAG，物化原生 Issue Dependencies + readback；**Stage 3–5** 合法 Builder/CI/审查/合并；**Stage 6–7** 版本验证与 Release Qualification。普通推进不额外索取 Owner 评论授权，但不能代签 L2/Independent Review/Release。

## 6. Strict currentness

`PRODUCT_L1_PRD=AUTHORING`;`REVIEW=NOT_RUN`;`PRODUCT_L1_FREEZE=NOT_DONE`;`L2=NOT_STARTED`;`NATIVE_IMPLEMENTATION_DAG=NOT_PROVEN`;`VERSION_RELEASE=NO`.

Related: #1563 canonical master; #1477 frozen Product; #1480 / #1484 Package/Boot; #1496 DIS Element-First; #1529/#1540/ #1555 private prototypes; #1544 Full Conformance independent lane.

