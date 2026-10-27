# DomainHarness v0.10.3 — L2 架构/接口候选 R0（未冻结）

[English](L2_DESIGN_R0.en.md) · [Product Freeze](https://github.com/kaicreator-mm/domain-harness/blob/version/v0.10.3/docs/product/v0.10.3/PRODUCT_FREEZE.md) · [Contract Freeze](https://github.com/kaicreator-mm/domain-harness/blob/version/v0.10.3/docs/product/v0.10.3/CONTRACT_FREEZE.md) · [并行工作概览](L2_R0_PREVIEW.zh-CN.md)

**权威来源：** `version/v0.10.3` 从已合法采用 **ADS v4.18.0** 的 `main@c6972db58b833940fabda25cac22c32f9cb1680e` 建立；Product #1402 和契约 #1397/#1400 已经评审并仅合入版本分支，具有确切冻结记录。**本文件仍是待独立审核的 L2 草案**，不表示 L2 Freeze、正式 npm SDK ABI、Task DAG 准入或 L3 实施授权。CV-01..12 保持不变。

## 一、真实 ABI 与职责

v0.10.2 真实可用的公共选择面是外部 `buildV10App`/`projectSelectedComponents`、一个 `kernel-primary/v08-kernel-abi/1`、一个 `standard-primary/v08-standard-sdk-abi/1`、可选的 `standard-feature/dh.v10.standard-feature/1`、`business/v08-business-abi/1`、`capability/v08-capability-abi/1`。C 提供 `capabilityId`、明确 `handlers[{operationId,handler}]` 和**模块级** `externalEffect`。Microkernel 只提供 `load/send/query/subscribe/stop` 等已公开入口；真实 Node Host 掌管 CAS/凭据/资源。不存在自动 Tool 注册、通用生命周期 Hook、Provider 网关或运行时 Package 发现。参见 [扩展点](../../guides/SUPPORTED_EXTENSION_POINTS.md) 和 [B/C Authoring](../../guides/V0102_BUSINESS_CAPABILITY_TOOL.md)。

| 关注点 | 代码/契约拥有者（待 L2 Freeze） | 最低真实验收 | L2 尚须裁定 |
| --- | --- | --- | --- |
| **公共 `llm.generate`** | **必须有一份**版本化中立 Request/Response/Error 数据语义，B/BUILD **显式静态绑定**到获准的 C；不是第三个真实 C Package | 同一个中立 fixture 分别经 OpenAI-only、Anthropic-only 显式绑定成功，未绑定拒绝 | DTO 字段、requestId 与真实远端幂等语义区分；类型由哪个包导出，不添自动路由器 |
| OpenAI-compatible | 独立可选 C Module + Host OpenAI Chat Completions SDK，候选 `llm.openai.generate`；整模块 `externalEffect:true` | Node24 clean installed OpenAI-only，真实 wire 格式与明确错误分类；Anthropic 包零导入 | endpoint 允许范围、可用功能、用量信息来源 |
| Anthropic Messages | 另一个独立可选 C Module + Host Anthropic Messages SDK，候选 `llm.anthropic.generate`；整模块 `externalEffect:true` | Node24 clean installed Anthropic-only，Messages 内容块/工具提议；OpenAI 包零导入 | 共享结果投影与 provider-specific 功能差异 |
| 0/1/2 组合 | BUILD 精确选择两种 C 任意组合，每条 B 路由明确指定实际 handler | 无模型、单选、双选及未获准路由负例；双方凭据不串 | 现有 B/BUILD C handler 声明在哪里绑定，不新造 Kernel 调度 ABI |
| Prompt/Context/Response | 先复用 `standard/features/context-assembly`、`semantic-decision` 或 S/B 私有纯函数；确有两个消费者复用缺口才新添可选 S | 复用已有 S P/N、非法响应拒绝；字符预算不宣称是 Token 窗口 | Token 精确预算、Streaming、完整 Prompt Registry 不默认纳入 |
| **动态表单三阶段** | 构建前 B/Domain Data 准备版控的模板、表单 Schema、选项、分支与恢复；运行时 B/可选 S 只选**当前一步** StepSpec；模型建议必须使用唯一 #1397 Schema 的 `LLMAdvisory` | ai-rexform 风格离线目标因设备状态产生不同 StepSpec；异常/UNKNOWN 可恢复；未声明模型不调用；未授权建议拒绝 | 是否真的需要一个独立 Guided Journey S Feature，而不是 B 层薄实现 |
| **任务层/元数据进化** | 复用已经存在且被选择的 `standard/features/meta-feedback` + `packages/host-node/src/meta-feedback-workflow.ts`；`experience-reuse` 仍是源码候选，旧 exact cache/promotion 源码不能直接当现行公开 API | 真实脱敏任务证据 → Candidate → 独立评价/人工晋升 → 下版 BUILD 选择；当前实例版本不漂移 | 是否确实需要 task-meta 到 DomainHarness 的一份 `RunEvidenceRef` 公共薄适配；禁止用户输入的 compatibilityRef 自动视为跨 SHA 证明 |
| #1393 **可信代码闭包 P1** | BUILD→部署→Host 加载前校验的**统一信任链**。默认既有可信部署，另一个可选严格 verified-integrity profile 需要独立受信的期望根摘要 | 正常 Provider、单独替换 Provider、**同时替换 Provider 与 sealed App 内嵌哈希并保留旧 subjectDigest**三组，后两组均在任何代码求值/K Effect 前拒绝 | 必须说清实际覆盖哪些可执行依赖、受信根从哪里来、Node ESM/TOCTOU/文件可信假设；不能只读取可变 seal 自证，也不自造通用 npm 沙箱 |
| #1393 **异常泄漏 P2 诊断** | 优先在受信 Host/C 适配层把原生 Provider Error 改为常量化/类型化 UNKNOWN，不默认修改 K 记账机制 | Tally 的 throw/getter 负例不得让 Token 进入 Journal，也不能把失败变成成功 | 只有其它真实现行公开消费者也需要才考虑 Kernel 级错误投影 |
| #1394 **CAS DX P2** | B/Host 适配器将 K 的 `V10DocStore kind:create/cas` 映射到 Host 的 `CasDocumentStore mustBeAbsent/mustMatchRevision`，双语文档与外部用例 | ai-rexform 真实 CAS 正/冲突例；相同代码复用已有结果 | 多个下游重复遇到才考虑公共 Bridge Factory，不重写 Kernel/Host Store ABI |

## 二、真正并行的 Task DAG 前提（尚未创建可执行 DAG）

- **I 完整性：** 拥有公共 BUILD/Contracts/Host 首次导入前的受信校验边界；P1 独立于 LLM 功能，Product/L2 通过后可并行。
- **A 中立 DTO：** 唯一公共 ABI owner；**B OpenAI** 与 **C Anthropic** 只需等待 A 最小类型面确定，即可分别在独立 C Module/Host 子目录并行；B **不依赖** C，反之亦然。
- **S 纯语义**、**J 离线动态步骤**可以与 Provider 实现并行，J 不要求在线模型；仅模型建议那部分等待绑定的真实 C。
- **M Meta 复用核对**和 **D CAS 文档**独立并行，以 `KEEP_EXISTING|ADAPTER|OPTIONAL_S|DEFER` 做实际价值取舍，不引入新的元数据 Kernel。
- **R 最终集成：** Host composition root、公共 exports/import maps、Node24 npm pack、外部 clean consumer、真实 Effect/UNKNOWN/完整性负例、下游最终契约对齐和整版 RQ 集中一次；共享文件由 R 单写集，I/B/C 不得并行碰同一个根文件。
- Scaffold / Agent 调度：Web 适合 Product/L2/Review/仓库管理，CI 适合 Node24 Pack/运行，必须物理环境时才派发 LOCAL；独立 exact-SHA Reviewer 不能为自身代码放行。实际 DAG 用 GitHub native Issue Dependencies，不以本文表格代替，也不因「阶段」人为把所有 Lane 串起来。

## 三、冻结和验证边界

L2 需要实实在在裁定的是：公共 DTO 与静态绑定、两个 C+Host 的可选 ABI、构建期/运行期动态表单 owner、原 S/Meta 复用、严格完整性模式的可信闭包，以及错误 UNKNOWN 和 CAS 薄适配。成熟 OpenAI/Anthropic 客户端、Node crypto、已有 Ajv 验证器应优先复用，不重写 HTTP/SSE、数据库和表单 UI。真实付费 API 不必成为协议假端点测试前置，若没有凭据明确 `LIVE_SMOKE=NOT_RUN`。大多数验证复用；整版集中合格候选上进行。Product/数据协议冻结后如有语义变更需独立 Amendment，不得以「小修复」暗中修改。

```ini
VERSION=v0.10.3
ADS_EFFECTIVE=4.18.0@2c395c55569fe2edf3f4135f12d3d069e526d0b7
PRODUCT_L1_FREEZE=YES
DATA_CONTRACT_FREEZE=YES
L2_DESIGN_R0=AWAITING_INDEPENDENT_REVIEW
L2_FREEZE=NO
NATIVE_TASK_DAG_ADMITTED=NO
CODE_IMPLEMENTATION_AUTHORIZED=NO
RELEASE_READY=NO
```
