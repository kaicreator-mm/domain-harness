# DIS v0.2.0 R28 — 证据收敛与剩余验证轮次规划

**权威来源：** [Product/L1 #1496](https://github.com/kaicreator-mm/domain-harness/issues/1496)、[Demo 主 Issue #1499](https://github.com/kaicreator-mm/domain-harness/issues/1499)、[Draft PR #1497](https://github.com/kaicreator-mm/domain-harness/pull/1497)。对应机器计划：[closure-plan-r28.json](closure-plan-r28.json)。

> **R85 最新判定（本文件后文 R28 轮次和阻塞为历史规划）：** Product/L1 #1496 已批准 `linux/x64/node` 为唯一 Demo 必需 Target；B03/B05 #2410 和 #2411 原始三条 Woodpecker 精确 SHA SUCCESS，独立源码审核后 CORE-008 限界 **VERIFIED**。无需跨 OS 源码字节不同；DKE SAP 继续由 C1 CORE-002/005 管理，不阻塞 C3 结构闭包。当前 CORE 13/16 VERIFIED、3 PARTIAL；参阅 [R85 receipt](receipts/r85-c3-core008-source-review.json)、[机器 closure plan](closure-plan-r28.json) 和 [Matrix](matrix.json)。不授权 Freeze/Merge/Release。

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

1. 优先 **C1：Element/SAP 独立语义评价**，别继续只加结构模拟；DKE 已有实际 793→807 原始知识来源和两个选中 Reader，可在这个固定来源上构建新的独立语义验收。
2. 与 C1 并行做 C2 的非冲突写集：Function 完整契约与有状态能力。
3. C3 的 Target/Interaction 需要 Product/L1 范围决定。不能擅自假定所有 Windows/Linux/Android 或真实浏览器都属 v0.2.0 MUST；也不能要求 Node 固定大版本作为语义符合性。
4. 只有经来源/语义独立核验、正确上下文下的 `UNKNOWN` / `OBSERVED` 才能参与符合性计算。代码能生成 EvidenceRef、SAP 候选或标注 SUCCEEDED，都不能自动转为领域事实或 Effect 准入。
5. 以已有主 Issue + Git 版本 Demo/Receipt 为唯一权威索引；不为每轮新建 Issue。修复、验证由同一 Writer 完成，Woodpecker 作为 CI，不使用 GitHub Actions。

**R28 本身是证据治理轮，不提升 Core 计数。** Core 9 VERIFIED / 7 PARTIAL，Optional 4 NOT_RUN，Governance 1 NOT_RUN。没有 Merge、Freeze 或 Release 授权。
