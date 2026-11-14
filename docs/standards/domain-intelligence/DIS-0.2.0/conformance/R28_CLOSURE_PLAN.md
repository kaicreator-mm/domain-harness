# DIS v0.2.0 R28 — 证据收敛与剩余验证轮次规划

**权威来源：** [Product/L1 #1496](https://github.com/kaicreator-mm/domain-harness/issues/1496)、[Demo 主 Issue #1499](https://github.com/kaicreator-mm/domain-harness/issues/1499)、[Draft PR #1497](https://github.com/kaicreator-mm/domain-harness/pull/1497)。对应机器计划：[closure-plan-r28.json](closure-plan-r28.json)。

> **历史 R85/R86 判定（已被后续 R92 Product 接受决议覆盖）（本文件后文 R28 轮次和阻塞为历史规划）：** Product/L1 #1496 评论 6777762870 已批准 `linux/x64/node` 为唯一 Demo 必需 Target（决策 JSON Blob `7f0d195849647282fad09a53a117b4f3a705b138`）；B03/B05 #2410 与 #2411 原始三条 Woodpecker 精确 SHA 全 SUCCESS，独立源码复核确认闭包/安装/Host/来源 Pin 链无 P0 缺陷。但按该接受的原文「CORE-008 remains PARTIAL until remaining engineering evidence and review close」，完成的新鲜独立审查尚待 Product/L1 接受，故 CORE-008 **保持 PARTIAL**；中间态 VERIFIED（`ebaae7de`，#2412-#2414 三轮 CI 因 r85 未入顶层 receipts 清单全红）已按规则回退，全部证据与负例锚点保留。跨 OS 字节不同仍非必需；DKE SAP 继续由 C1 CORE-002/005 管理。当前 CORE 12/16 VERIFIED、4 PARTIAL；参阅 [R85 receipt](receipts/r85-c3-core008-source-review.json)、[机器 closure plan](closure-plan-r28.json) 和 [Matrix](matrix.json)。不授权 Freeze/Merge/Release。

## R92 Product/L1 接受 C3 独立审核并允许限定晋升（2026-11-11）

- Requester 决议：[Product/L1 #1496 comment 6782273293](https://github.com/kaicreator-mm/domain-harness/issues/1496#issuecomment-6782273293)，仅先前批准的 `linux/x64/node` Demo Target；不要求 Windows/Android 的模拟性证明。
- Matrix 当前 CORE-008 **VERIFIED**（仅 Target 原生结构闭包）；Core **13/16 VERIFIED、3 PARTIAL：CORE-002/005/016**，Optional 0/4，Governance 0/1。
- 原独立审核 R86/#2415 三项成功、旧未晋升 HEAD `a406927e9408424a09776e3896c1aa7ed1d0e9ef` #2429 三项成功均为精确 SHA 历史证据；本次晋升后的新 HEAD 必须另取 3/3 CI，不得借用。
- C1 Source Owner + SAP 仍未通过；不授权 Effect/Freeze/Merge/Release。以下 R28/R85-R89 论述仅作历史记录，不代表当前进度。

## 当前闭环状态（R88/R89 与 #2420，2026-11-11）

- 当前 Matrix / PR HEAD：`5d0ff0c5e435c946cc8deb8ad614e476c4b555f3`，TREE `71866aa740afca7de03b2ef12c93cfbbd2e5b87f`；Woodpecker #2420/1–3 **3/3 SUCCESS**。
- C1 的结构工程部分已完成：R30 Element version/source-validation/same-major ABI、D02 同源 parent-vs-split 输出保持、semantic cooperation 与 static dependency DAG 区分均有原生正反例；R89 已固化。R3/R7/R1 原始 DKE 只读消费及 query getter/Proxy 身份完整性修复由 R88 固化。
- **CORE-002/005 仍 PARTIAL**，不是缺少更多普通结构测试，而是缺少可归属的原始 Source Owner 决议和独立语义 Domain Oracle/SAP。DKE 原始 Tally Claim 与 `se:REL-TVV-0020` 仍不得自动升级为 ACCEPTED/SAP。
- **CORE-008 仍 PARTIAL**，linux/x64/node Target 已批准、工程证据和独立审核均已完成；仅待 Product/L1 接受该最终审核，再由单一 Writer 执行限定晋升。已在 #1496 提交明确决议请求，不再请求 Target 范围批准。
- **CORE-016/C4** 依赖 C1/C3 先闭环；不要提前重复全版本回归或将历史 36/36 Demo 轮次当成 16/16 Core 通过。

## 本轮验证结果与收据

R27 上一提交 `349b58f985970aeeaf77621a4451154e4cd6a353` / TREE `d310878eeb2127adbfc4fa9d2bb368446e6d203b` 已由 GitHub exact-SHA 状态核实 Woodpecker **#2263/1 Integration、#2263/2 compatibility、#2263/3 general Verify 全 SUCCESS**。本轮将事实固定为 [r27-native-impact-ci.json](receipts/r27-native-impact-ci.json)，并以机械矩阵关联 CORE-003、CORE-005、CORE-016 的 **限定范围**正反例；仍是 9/16 VERIFIED，7/16 PARTIAL。R28 写文档的**新 HEAD**需要独立 CI，不能直接继承 R27 的 PASS。

R27 的两个 SAP 是 DKE 研究提出的 `R26-PROPOSAL-CF/GH`，明确定义 `qualified:false`、`oracle:NOT_VERIFIED`；只能证明真实 14 条 Tally 原始来源记录经两个 CQ 影响已选的两个 Business Function，不代表跨应用全量消费者发现或已接受领域语义。

## 完成核心 Demo 与治理，还需要多少轮

**按 ADS Delivery-First 合并相邻任务估算：约 5～8 轮（R28 之后）。** 一“轮”是有自己 exact-SHA CI + Git 证据的一次完整集成验证与必要修复，不是一个 test case。下表中的五个组是理论最少的集成轮次：

| 组 | 待关闭项 | 同轮验证内容 | 主要前置问题 |
|---|---|---|---|
| C1 | CORE-002 + CORE-005 | Element 版本/验证/合理拆分；静态依赖与动态约束协作及 SAP 语义所有权 | 独立语义评价、源所有者对 SAP 的资质决定 |
| C2 | CORE-003 + CORE-006 | 完整适用 Function I/O/Outcome/Evidence/兼容性；Domain-owned Knowledge/Rule/Stateful 状态 | 最小完整 ABI 和状态权威约束 |
| C3 | CORE-008 + CORE-014 | Target-specific BUILD/Package 变化；UI-neutral 的 Chat/Form/CLI 与真实适用 transport | Product/L1 确定适用 Target 与交互传输范围 |
| C4 | CORE-016 | 全版本 Demo Matrix、必须项正反例、每份 exact-SHA 收据、全量原生集成回归 | C1–C3 达到符合性 |
| C5 | GOV-001 | 最新 SHA 独立审核、修复、正式 L1/L2 冻结决定 | C4 通过，明确剩余风险 |

**现实范围比理论五轮增加 0～3 轮**，用于独立 SAP 评价、Target/Interaction Product/L1 决定，以及可能的原生 CI 修复。不能从当前 9/16 推断“再做 7 个测试就完成”，因为存在架构合同和第三方语义权威缺口。

## 可选 Profile 的额外轮次

四项仍是 NOT_RUN。可按 O1 Harness/LLM、O2 Experience + Local Evolution、O3 Server Promotion 分 **2～4 轮** 并行/连续验证。若需要全部可选 Profile 也验证，则核心 + 治理 + 全可选预计 **合计 7～12 轮**；如果 Product/L1 明确这些 Profile 不启用，仍须按批准的范围在 Matrix 中显式保持 NOT_RUN 或正式 OUT_OF_SCOPE，不应默默计入已完成。

## 优先级和防止重复

1. **C1 结构验证已完成，不再堆结构 Demo**：R30/R89 已证明 Element version/validation、同源 parent-vs-split 输出保持及 static/semantic 边界。下一步只推进原始 Source Owner 与独立 Domain Oracle/SAP；保持未批准 Claim/Relation 为 UNKNOWN。
2. 与 C1 并行做 C2 的非冲突写集：Function 完整契约与有状态能力。
3. **C3 Target 范围已由 Product/L1 限定为 linux/x64/node**，工程证据与新鲜独立审核完成，只待 Product/L1 接受最终审核。CORE-014 已 VERIFIED，不再重复请求 Chat/Form/CLI 适用范围或扩展 UI/Host。
4. 只有经来源/语义独立核验、正确上下文下的 `UNKNOWN` / `OBSERVED` 才能参与符合性计算。代码能生成 EvidenceRef、SAP 候选或标注 SUCCEEDED，都不能自动转为领域事实或 Effect 准入。
5. 以已有主 Issue + Git 版本 Demo/Receipt 为唯一权威索引；不为每轮新建 Issue。修复、验证由同一 Writer 完成，Woodpecker 作为 CI，不使用 GitHub Actions。

**R28 本身是证据治理轮，不提升 Core 计数。** Core 9 VERIFIED / 7 PARTIAL，Optional 4 NOT_RUN，Governance 1 NOT_RUN。没有 Merge、Freeze 或 Release 授权。
