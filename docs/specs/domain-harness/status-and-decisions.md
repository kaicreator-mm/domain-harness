# DomainHarness · 设计现状与迁移清单

> [权威目录](./README.md) · Owner 现行新架构决议 [#1685](https://github.com/kaicreator-mm/domain-harness/issues/1685)。本文件同时保留 R151 初审 REWORK 与后续 R160 通过的时间顺序；历史状态不得覆盖新收据。

## R33 · T31C 已接受、T31D 候选

- [R33](https://github.com/kaicreator-mm/domain-harness/issues/1738#issuecomment-7159680340) T31C #1738 已关闭，R32 0/0/0、CI3201受审HEAD成功，#1739 合入 9f7bc5af899f9f24a44a1b9cc4c245d028585452。T31D #1740 Candidates 源码候选（LIFE-17）待独立审核及完整适用验证；E–F/32–35依赖待准入；13产品Oracle NOT_RUN。未发布。

## R30 · T31B 已接受、T31C 候选（历史）

- [R30](https://github.com/kaicreator-mm/domain-harness/issues/1736#issuecomment-7159360100) T31B #1736 已关闭，R29 0/0/0、CI3200受审HEAD成功，#1737 合入 2a8159c0eff5bdf8a7fd57008526bc1e716b618c。T31C #1738 Decision 源码候选（LIFE-16）待独立审核及完整适用验证；D共享写集顺序集成，E–F/32–35依赖待准入；13产品Oracle NOT_RUN。未发布。

## R22/R25 · 修订 L2 冻结、T31A 已接受、T31B 候选（历史）

- [R22](https://github.com/kaicreator-mm/domain-harness/issues/1733#issuecomment-7157152801) 原执行层 T31A ACCEPT_SCOPED，R21 0/0/0、CI3197 受审HEAD成功，#1734 合入 2fa88be890d458b0ca8586fd1f0874a03ef1ffb0。只授予执行层范围，不是完整 .3。
- [R25](https://github.com/kaicreator-mm/domain-harness/issues/1613#issuecomment-7157466207) 修订 L2 FROZEN_SCOPE，#1735 合入 801d128ba541249f75024bb427b151ea1116346e；原L1 12需求/13 Oracle不变，A–F SDK Standard 与真实域/客户端任务按修订 DAG。T31B #1736 Evidence 源码候选（LIFE-15），待独立审核和适用完整验证；C–F/32–35 依赖未准入，13 产品 Oracle NOT_RUN。未发布。

## R14/R17 · 0.11.3 L2 正式冻结、T30 完成及 T31 候选（历史）

- [#1724 R20](https://github.com/kaicreator-mm/domain-harness/issues/1724#issuecomment-7155041545) 前置专项完成；[R14](https://github.com/kaicreator-mm/domain-harness/issues/1613#issuecomment-7156092250) L2 FROZEN_SCOPE，#1730 合入 6086b5f2ddbb6e87998e8b06edbffda4d11524cc。
- [T30 R17](https://github.com/kaicreator-mm/domain-harness/issues/1731#issuecomment-7156304129) 完成限定验收并合入 280924fa29b2548cf2028cc47110d834646585d6，R16 0/0/0、CI3191受审HEAD成功。T31 #1733 源码候选（LIFE-14）待独立审核和适用完整验证；T32–35 尚未通过，13 产品 Oracle NOT_RUN。未发布，不扩大旧资格。

## R9 · 0.11.3 Product/L1 冻结及前置 SDK 专项（历史状态）

- [R8 独立文档审核](https://github.com/kaicreator-mm/domain-harness/issues/1613#issuecomment-7145818088)：#1722 ACCEPT_SCOPED 0/0/0；#1723 ACCEPT_SCOPED 0/0/2（非阻断）。[R9 正式冻结](https://github.com/kaicreator-mm/domain-harness/issues/1613#issuecomment-7145891451)，train 合并 `162b77e08db2937792f1b163624b3b7502897f06`；实际五个文件 blob 与各自受审版本相同。
- CORE-13 标准实现优先、CORE-14 Agent First, Human Compatible、QA-09 已生效。0.11.3 PRD/L1 的12需求/13 Oracle 正式冻结，R8 两项 P2 作为验收细化载于 R9；原受审 PRD 的“候选/待审”措辞是历史快照。
- [#1724](https://github.com/kaicreator-mm/domain-harness/issues/1724) 负责 .0–.2 有限专项；.3 L2=ON_HOLD_FOUNDATION_OPTIMIZATION，实施未启动。文档合并不构成新源码、CI 或平台验收；R65 实际范围不变。

## R65 · 0.11.2 内部阶段完成（2026-11-25）

- **COMPLETED_SCOPED / MERGED**：[#1612](https://github.com/kaicreator-mm/domain-harness/issues/1612) T01–T07 全部合入；[R64 最终独立审核](https://github.com/kaicreator-mm/domain-harness/issues/1718#issuecomment-7141467905) ACCEPT_SCOPED，DI-L1-01–12 全部 PASS，P0/P1/P2=0。
- 受审 HEAD `566cd3129a6ef51bfc40e7d4a018530cabd965a8`，[Woodpecker #3184](https://ci.kaicreator.com/repos/18/pipeline/3184/1) SUCCESS；127/127 core、16/16 generation、8/8 regression。 [PR #1719](https://github.com/kaicreator-mm/domain-harness/pull/1719) expected-head 合并至 `version/v0.11.x@18384259e36ba56d937416ed5262bac1de6689ae`，审核树与合并树均为 `a45f8cd6337b929e5e4fac887e665dbb5f86d39d`（完全相同）。
- SDK 0.11.2 单一公开根入口；生成期不可变知识、BoundedQuery、SQLite/SQL、Vector/Graph、Expression、双角色 Workflow、真实 Host 授权/CAS/attempt/receipt/readback/UNKNOWN 均在 R25 冻结范围内接受。原 #1614 的全部范围已由 DI-L1-08–10 交付，保留历史编号，不再次实现。
- [R62 独立领域生成](https://github.com/kaicreator-mm/domain-harness/issues/1718#issuecomment-7138623305) 与 [R63 实际外部消费者](https://github.com/kaicreator-mm/domain-harness/issues/1718#issuecomment-7140817171) 通过；Windows x64 / Linux x64 glibc 2.36 实际 Node22.12.0/npm10.9.0；CI Node24.21.0。三处 SDK tarball SHA256 相同 `a3cd22d2a514fb2f6321218b1dba27b9bd5b17b6fac7bbe2daf00b02cc25a5ff`，20/20 安装成员匹配；[原始证据](https://drive.google.com/drive/folders/1Z7sdh4fNC2kxgActEtaeT4e00tTNvUIX)。Windows 初次 LOCK 的 IPv6 缓存连接失败经单次基础设施修正通过，保留失败历史。
- 资格仅为已审范围、已实际见证平台；不声称全平台、强盲生成、生产级任意外部动作 exactly-once 或完整 DIS 合规。R64 核验实际关键字节与日志，未独立重跑 CI/平台或逐一核验 268 项索引文件。
- 本归档仅更新文档状态，无产品源码、依赖、测试或包内容变更；不重新运行 CI，不将历史 CI 绑定到文档提交。**按 Owner 指令在 0.11.2 结束，不启动 0.11.3，不合并 main，不创建 Tag/Release，不发布 npm。** 下列旧状态均为历史快照，不覆盖本段。

## R161 · v0.11.1 语言原生 SDK 源码交付已完成（不是正式 Release）

- 新架构 Canonical R140、KDP/XState R143、Reader/App R145、Workflow R154 和作者侧生成 R158 均已分批审核合并。R140 与 R145 原审各有 1 项 P2，历史数字保留并分别有后续处置，**不得追改旧审查结果**。
- R151 对完整 180 路径（151 删除）的旧运行栈物理替换在 `aaf6c930f9541768119991500c7bc7811898e18d` 提出 **REWORK P0=0/P1=2/P2=5**。两项 P1 是根 Workflow 预算快照 TOCTOU 和仓外 App 四次 Reader 根预算漏计；五项 P2 涉及 Windows npm CLI、README/历史状态、Node 下限、Writer 行为回归、SDK 类型/值导出文档。
- [R160 独立复审](https://github.com/kaicreator-mm/domain-harness/pull/1694#pullrequestreview-6025797181) 针对 R151 后 2 个提交/15 文件结论 **ACCEPT_SCOPED P0=0/P1=0/P2=0**；受审 HEAD `0477edf9070c05ec3c89c46fb1aaa43cf2f850a3`，对应 [Woodpecker #3151](https://ci.kaicreator.com/repos/18/pipeline/3151/1) **SUCCESS**。保留 `WINDOWS_REAL_E2E=NOT_RUN` 与 `EXACT_NODE_22_12_RUNTIME=NOT_VERIFIED`。
- [PR #1694](https://github.com/kaicreator-mm/domain-harness/pull/1694) 已 **MERGED** 到 `version/v0.11.x@452e2212fb8a25168ee62d4e793897d77416cb92`，新旧 SHA 比较 **0 个文件差异**。旧 Contracts/Microkernel/Boot/BUILD/FunctionRef/Target/Pin/Lock/PackageSystem 的运行实现不再在此列车；单 SDK Workspace、原生 KDP、Standard Workflow/Reader、真实外部 SDK-only npm 安装消费者已提交并接受。
- **阶段边界**：v0.11.1 源码任务 #1682、Foundation #1668 可按 R161 完成；不创建 v0.11.1 单独 Tag/npm 发布/GitHub Release，也不合并 main。0.11.0–0.11.9 属于一次完全重写，待整个系列完成最终组合验收后统一发布。R161 文档提交本身不代表新增源码测试通过。

## 新架构状态

| 切面 | 状态 | 当前验收边界 |
|---|---|---|
| Package=静态 ESM 插件、Element=Class、Function=普通函数/方法 | **SOURCE_ACCEPTED / MERGED** | 旧执行层已物理删除；生成期正确性由作者负责 |
| Standard=SDK 内置应用级复用、Business 优先使用 Standard | **SOURCE_ACCEPTED / MERGED** | 原生 Workflow/Reader 与已安装 App 正反例已验收 |
| KDP/SDK/App 全都使用同一模型 | **SOURCE_ACCEPTED / MERGED** | 最小 KDP 和单一 SDK 已受审合入 |
| Metadata 是框架读取的可执行代码，Skill+TSDoc 面向 Agent | **SOURCE_ACCEPTED / MERGED** | 代码元数据与 TS Profile 已实施 |
| Order 唯一、KDP=0、可选 Init/Exit | **SOURCE_ACCEPTED / MERGED** | 生成期 Order NEG、KDP 退出回归已通过 |
| 静态可信，无自建 Runtime Lock/Pin/权限证明 | **SOURCE_ACCEPTED / MERGED** | 旧自建运行时路径已删除 |
| Workflow/Reader/UNKNOWN/Hook/退出语义 | **SOURCE_ACCEPTED / MERGED（限定验收）** | Reader/Workflow/Hook/预算保留回归已验收 |
| Node >=22.12.0、v0.11.x 完全重写 | **SOURCE_ACCEPTED / MERGED** | SDK 消费者 >=22.12；开发工具链 >=22.13；不保留 v0.10.x ABI |

## 旧架构替换（R161 已执行；不是并行维护两套实现）

| HISTORICAL / 已删除的旧执行机制 | 新版 |
|---|---|
| K/S/B 固定 Package 技术体系 | Kernel/SDK/App 是不同业务角色，Package/Element 技术统一 |
| JSON ElementDefinition 作为运行时可执行对象 | TS Class + 必需 Code Metadata |
| FunctionRef → ImplementationBinding → Target | 原生 TS 模块/类函数调用 |
| PackageSystem Loader/Extension Registry | 静态 import/export、普通 Class 组合和直接 npm 依赖 |
| boot(pin, context) / kdp-host-init/1 动态受选 Host | 静态入口、最小 KDP 顺序和退出 |
| 自建 App Lock/Boot Pin/InstalledRecord/Runtime Digest | 标准 npm 锁和可信交付过程 |
| 每包强制 Init/独立 Exit Element | 可选 Init.start()/Symbol.asyncDispose |
| KDP 独占 XState/Workflow 与业务转发 | SDK Standard Workflow，可供任何业务直接使用 |
| 给 Agent 的元数据与框架元数据两份 | Metadata 属于代码；Skill+TSDoc 是 Agent 指导 |

## 历史 CORE 条款编号对照（R135 P2-01）

> **禁止无版本地复用 CORE-11/CORE-12 引用。** 旧 R118/R119 与 R134 采用了相同编号但不同内容；旧 Issue/L2/Review 原句仅保留历史含义，不得按新条款解释。

| 旧历史引用及含义 | 现行唯一权威 | 说明 |
|---|---|---|
| `CORE-11@R118`：Package/Element 正确性由生成者负责，SDK 仅兜底 | [GEN-02](./composition-trust.md)、[CORE-07](./core.md)、[QA-01](./engineering-quality.md) | **不是**现行 CORE-11；旧链涉及 Pin/Lock 的 runtime fallback 已废止 |
| `CORE-12@R119`：区分生成、生成期验证、App 组合/封存、编译与运行等阶段 | [core.md 三阶段](./core.md)、[GEN-02..05](./composition-trust.md) | **不是**现行 CORE-12；旧独立 Lock/Pin 封存被静态 npm 组合取代 |
| `CORE-11@R134+`：单 Package/App 同一语言与 Runtime | [CORE-11](./core.md) | 新编号，只适用于新规范 |
| `CORE-12@R134+`：Exact-SHA 测试与审查证据 | [CORE-12](./core.md)、[QA-03](./engineering-quality.md) | 新编号，只适用于新规范 |

## 迁移次序与验收

1. **#1685** 冻结 Canonical Spec + TS Profile + Agent Skill，经独立文档审查。
2. **#1668 / #1682** 停止“旧 PackageSystem 全量搬进 KDP”路线。实现原生 Package 插件 + Standard Workflow/Reader + 业务 Element + 最小 KDP；同步修订版本 L2。
3. 重建旧 Contracts/SDK/Composition/Boot/Reference App/npm Consumer，明确新公开 API、Order/Init/Exit、静态依赖、功能行为；直接删除无价值旧执行层，不做兼容桥。
4. 生成期负例、真实业务正反/UNKNOWN/ASK/WAIT、退出、Node22/独立 npm 消费者、必要同 SHA CI/独立 Review。
5. 在 **v0.11.1** 完成受影响 Foundation 修正，不拖到 0.11.2；任何未完成必须标记 BLOCKED 而非宣称完成。

## 历史与证据

- 旧 #1681 R129 Review Exact `c87b45e4d30bbd28dd0ea06395fecdfb06f557c8`、Woodpecker #3090 SUCCESS；旧 #1684 R131 Review Exact `1fc0c0820b1633d824672816fb91ec50bbb87eed`、Woodpecker #3091 SUCCESS；R131 旧机器修复合入 `a159f17fecf0431cf4cf41c4c8e892b574f1afc8`。它们都是**历史限定证据**，不是新执行模型已验证。
- [#1563](https://github.com/kaicreator-mm/domain-harness/issues/1563)、[#1605](https://github.com/kaicreator-mm/domain-harness/issues/1605)、[#1668](https://github.com/kaicreator-mm/domain-harness/issues/1668)、[#1682](https://github.com/kaicreator-mm/domain-harness/issues/1682) 保留各自历史任务及完成收据；旧文档/PRD/L2 只记录历史，不可对抗新规范。

## R139 · 全体系独立审查后整改状态

[#1689](https://github.com/kaicreator-mm/domain-harness/issues/1689) 初始 SHA `80f5af907c07a9930aeb05aa24280dbe542ef3aa` 的 R139 `REWORK P1=5/P2=4` 已由 R140 [PR #1690](https://github.com/kaicreator-mm/domain-harness/pull/1690) 独立审查 **ACCEPT_SCOPED P1=0/P2=1** 并合入，唯一 GEN-08 导航 P2 随 R145 [PR #1691](https://github.com/kaicreator-mm/domain-harness/pull/1691) 合入。R138 源码 4 项 P1、4 项 P2 由 R143 独立复审 **ACCEPT_SCOPED P0/P1/P2=0**，随后合并 [PR #1688](https://github.com/kaicreator-mm/domain-harness/pull/1688)。以上限定事实并不代表 #1682 完整旧执行层删除、外部 SDK 消费者与版本发布已通过。
