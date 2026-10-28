# DomainHarness v0.10.3 — L2 冻结记录（仅版本分支）

[English](L2_FREEZE.en.md) · [详细设计](L2_DESIGN_R0.zh-CN.md) · [Product Freeze](../../product/v0.10.3/PRODUCT_FREEZE.md) · [契约 Freeze](../../product/v0.10.3/CONTRACT_FREEZE.md)

**裁定：** `L2_FREEZE=YES`，仅表示 `version/v0.10.3` 的架构、ABI 与安全并行职责获得独立审核且已冻结；**不表示**实施源码 PASS、真实 Task DAG 已准入、下游 npm 消费者已验证、v0.10.3 已合入 main 或 Release RQ 通过。当前有效 ADS v4.18.0，精确 SHA `2c395c55569fe2edf3f4135f12d3d069e526d0b7`。

## 独立证据与精确来源

- [PR #1407 独立 R3](https://github.com/kaicreator-mm/domain-harness/pull/1407#issuecomment-6447932588) **PASS，P0/P1/P2＝0/0/0，L2_FREEZE_READY=YES**，另有同 SHA 独立审核交叉确认。审核 HEAD `854e0807280c1438e2f141e66636c4f53d9d9106`，Git 树 `cc92bb5bd64fd36657e063038fb20e55a540ea20`。
- [PR #1407](https://github.com/kaicreator-mm/domain-harness/pull/1407) 已**仅**合入版本分支，合并 SHA `62c003251ff7ff699f4249500a5ca5988af23b8e`。L2 中文设计 blob `93124eb578644cc0d298e01fe567ec770a0bc121`、英文 `be6c1e346d4eb6a0b7ade9960da37f30204d0661`；概览中文 `34754438b5b87370a8f502196fcdf2c6fef72386`、英文 `77040e8da1db5c79db9e802f4183a82a2d74aee9`，与审核精确 HEAD **4/4 字节一致**。
- Product Freeze blob `d5c524588accd2a79a6781b28fce310fa91ab389`、Contract Freeze blob `b9ec0df6886cb71c6a74296cb61d459f9309f94c` 均保持原样。
- 该审核 SHA 必需 Woodpecker verify [2047/2](https://ci.kaicreator.com/repos/18/pipeline/2047/2) 和补充 min-node [2047/1](https://ci.kaicreator.com/repos/18/pipeline/2047/1) 均 SUCCESS。文档 CI **不能冒充**真实外部 Provider npm App、Kernel Effect、篡改负例或付费 API 测试。

## 本次固定的实现决策

1. **一份中立逻辑** `llm.generate` Contracts DTO：经批准的 `modelId`、Host 策略约束的 `deadlineUnixMs` 与不序列化的真实取消；Provider/模型和远端请求 ID 真实来源；结束原因、UNKNOWN、语义错误、Token 用量证据以及有界且不赋权的工具建议。复用现行 BUILD 四字段路由与 K Permit，**没有第三个 Provider/自动路由器**。
2. **两个独立可选** OpenAI-compatible Chat Completions / Anthropic Messages C+Host；选择 0/1/2，各 C 为**模块级** `externalEffect:true`。A 先固定公共最小 ABI，B OpenAI 与 C Anthropic 在互不冲突目录**并行**实现，公共根导出由 R 单一所有者集成。
3. **动态表单**：BUILD 前批准模板/选项，运行时每次只生成当前一步 `StepSpec`；可选 LLM 仅产生符合 #1397 Schema 的 `LLMAdvisory`，无 Tool/K 准入权；不开发通用 UI 框架。
4. **任务层 + Meta 进化**：优先复用现有选中的 `meta-feedback` 与公开 Host `runMetaFeedbackWorkflow`；不新建第二套 Kernel/自动晋升器/经验数据库，也不把旧源码当现行公共 API。
5. **#1393 可信部署 P1**：复用 `activateGovernedV10Build` 与 Host 外部可信根，默认可信安装不改变；可选严格 `VERIFIED_PROVIDER_BUNDLE_V1` 只覆盖单文件、自包含静态 ESM 执行闭包，受信不可变 staging 文件字节校验与导入一致，不支持依赖图在求值前拒绝。强制验证合法 Provider、单独篡改 Provider、Provider 与本地封闭哈希联动篡改但保留旧可信 subjectDigest；声明 Node ESM/TOCTOU 边界。Tally 异常文本泄漏为 Host P2 诊断，不改变 K UNKNOWN。
6. **#1394 CAS** 双语薄适配已随 PR #1409 合入版本分支；无需新 Store 运行时任务。
7. **ADS v4.18 最大安全并行**：I 完整性、A 公共 DTO→B OpenAI ∥ C Anthropic、J 离线动态表单、M Meta 复用、S 纯语义复用（确有缺口时）、R 独占公共导出/Manifest/集成、Q 独立版级合格审核。具体 GitHub 原生依赖和文件写集必须**另行准入**，不能用文字代替 native blocked_by。

## 实施与证据门禁

允许依据该设计建立真实 Task Issue、明确文件写集、Agent 角色、依赖和负例；实施前须读取当前 ADS 规范要求的**原生 GitHub Task Claim / 依赖关系**，未获授权的任务不得自行改源码。文档 CI **不等于** Node24 installed 0/1/2 App 或真实可信闭包验证；这些证据仍待具体任务与 RQ 产生。重大 Product/ABI/K 权限变化必须正式 Amendment，不用小补丁暗中修改冻结契约。保持 v0.10.2 历史 Tag 和证据不可变。

```ini
VERSION=v0.10.3
ADS_EFFECTIVE=4.18.0@2c395c55569fe2edf3f4135f12d3d069e526d0b7
REVIEWED_L2_HEAD=854e0807280c1438e2f141e66636c4f53d9d9106
L2_VERSION_INTEGRATION=62c003251ff7ff699f4249500a5ca5988af23b8e
PRODUCT_L1_FREEZE=YES
CONTRACT_DATA_FREEZE=YES
L2_FREEZE=YES
NATIVE_TASK_DAG_ADMITTED=NO
IMPLEMENTATION_CLAIMS_AUTHORIZED=NO_PENDING_DAG
SDK_IMPL_QUALIFIED=NO
RELEASE_READY=NO
MAIN_MERGE=NO
```
