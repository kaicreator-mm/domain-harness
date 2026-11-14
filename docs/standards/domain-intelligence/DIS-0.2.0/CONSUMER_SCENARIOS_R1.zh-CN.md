# DIS 0.2.0 — 多消费者验证计划 R1

**状态：Product/L1 验证设计；实际 Demo、Schema、CI、独立 Conformance 均未执行。** 权威 #1496。

## 1. 共同测试目标

对每个消费项目检查：Element 粒度、同一 Element 多 Public Functions、跨 Element 多 Function 依赖、静态 DAG 无环、Function 混合实现/AOT 精确锁、2 层初始化、Target Package、State 所有权、Intent Interaction 与 LLM 禁用可运行；不强制 Main Workflow，也不创建 Host-neutral 物理 Adapter。

## 2. Tally v2 — 长期工程事实

模型：`tally.task`、`tally.project`、`tally.review`、`tally.state`、`tally.app-init`；依赖 `sdk.sqlite`、`sdk.json`。Task DAG 是业务对象，与 Element DAG 不同；Github Issue/PR/CI/Review 原生事实不能被本地 State 或 LLM 伪造。Harness 可提供失败诊断的建议和 Evidence，但不直接宣布 Task PASS。负例：旧 SHA、无实际 readback、LLM 自签 Review、重复 Effect。

## 3. xDownload v0.2.2 — 多入口长任务

模型：`xdownload.download-task`、`xdownload.acquisition`、`xdownload.browser`、`xdownload.state`、`xdownload.app-init`。同一 DownloadTask 有 create/start/status/cancel/resume 多 Function，彼此可用不同实现；Browser/Desktop ingress 共享单一 Core，不能产生平行任务账本。Event/retry 是运行时，不是静态 Element 依赖环。负例：崩溃后误报 SUCCESS、UNKNOWN 时盲重试、未锁 Provider 及另建 Core。

## 4. Shun v0.3.0 — 授权和 Case/Recipe

模型：`shun.goal`、`shun.capability`、`shun.provider`、`shun.case`、`shun.state`、`shun.app-init`。Intent 澄清可由 Chat/Form/CLI 承载；Harness/LLM 只提出受限的 Function 调用建议；SDK LLM Provider 不应取代 Shun 真实用户授权与实际外部 Effect 复核。负例：无批准自动操作、跨 Case Memory 混淆、Provider 动态热切换、模型原始信息未经允许上传。

## 5. ai-rexform v0.2.1 — 证据约束的交互流程

模型：`airexform.device`、`airexform.case`、`airexform.interaction`、`airexform.workflow`、`airexform.state`、`airexform.app-init`。GMS/Root/优化等各领域流程可按实际选择规则或 Workflow 实现；UI 逐步澄清用户 Goal，来源经验不能成为真实设备测量。负例：SOURCE_GUIDANCE_ONLY→DEVICE_MEASURED、过期表单上下文继续执行、未授权设备 Effect、LLM 生成新 Tool。

## 6. 横向进化 Case

相同一个未知 Intent：
1. 新 App 实例离线规则无法解决，有限制地请求 Harness/LLM，产生 Proposal；
2. Business Function 对 Proposal 作真实验证，产生 `ExecutionEvidence` 和 `LearningFeedback`；当前实例始终锁定旧 Package；
3. 合法脱敏证据提供给 Server Meta Domain App；产生 Candidate，经 Forge/独立验证/批准/AOT 生成新包；
4. 新实例使用合格 Rule 或 Promoted Subflow，0 LLM；旧实例持续使用原 Binding；
5. 无 Server、拒绝上传、候选被否决、证据过期时依然保持可解释的工作或 UNKNOWN，不擅自晋升。

## 7. Conformance 分阶段

- R1: Product/L1 文档和权威迁移，保留开放设计问题。
- R2: 机器 Schema、Element/Function Ref 展开规则、App Init 生命周期、LLM/Harness/Evolution 数据契约。
- R3: 两个以上实质不同 Domain 的 AOT Demo 与负面用例；四消费者迁移兼容性检查。
- R4: 独立 Structural/Behavioral/Consumer Conformance、真实 Node24 执行/CI、Exact-SHA 审核、L2 Freeze。
- Runtime 真正消费新 DIS 需独立实施和验收，不能由本阶段文档推断已支持。
