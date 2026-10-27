# DomainHarness v0.10.3 · L2 架构预研 R0（非冻结）

[English](L2_R0_PREVIEW.en.md) · [Product R0 PR #1402](https://github.com/kaicreator-mm/domain-harness/pull/1402) · [契约 PR #1397](https://github.com/kaicreator-mm/domain-harness/pull/1397) · [契约 PR #1400](https://github.com/kaicreator-mm/domain-harness/pull/1400) · [版本总控 #1392](https://github.com/kaicreator-mm/domain-harness/issues/1392)

> **并行架构概览，仅 L2 的工作前沿参考，不是 L2 Freeze、可执行 Task DAG、源码实施许可或已发布 SDK。** 三项 R0 曾经 BLOCK，但 #1397、#1400、#1402 已按各自确切 SHA 独立 R2 PASS，且已经**仅合入** `version/v0.10.3`。Product/L1 与纯数据契约分别由 [Product Freeze](https://github.com/kaicreator-mm/domain-harness/blob/version/v0.10.3/docs/product/v0.10.3/PRODUCT_FREEZE.md)、[Contract Freeze](https://github.com/kaicreator-mm/domain-harness/blob/version/v0.10.3/docs/product/v0.10.3/CONTRACT_FREEZE.md) 固定。ADS #1405 已合并到 main 和版本基线，**v4.18.0 现在生效**。具体 ABI 决策见 [L2 详细 R0 候选](L2_DESIGN_R0.zh-CN.md)，仍待独立 L2 审核；CV-01..12 保持不变。

## 一、组合架构（保留当前已选语义）

```text
BUILD Producer (外部; 只封闭选择声明的版本/模块)
  ├─ K Primary (唯一 Admission/State/CAS/Journal/Permit/Replay/UNKNOWN)
  ├─ S Primary + 可选 Feature (已有 Context/SemanticDecision/Workflow;
  │   需要时才加 Prompt/Response/Guided Journey 纯 Semantic)
  ├─ B Business (目标、Prompt 策略、步骤有效性、选择具体模型及明确路由)
  └─ C Capability (0/1/2 个显式选择的远程 Provider Module)
           ├─ capability-llm-openai-compatible
           └─ capability-llm-anthropic-messages
Runtime Microkernel.load(已构建 App) + Host(DocStore/真实 SDK/Secrets)
  ↓ K Permit & selected C Operation → Model API/Host
  ↓ JSON/Text/tool-use **候选** → S 校验 → B 决策 → K 最终准入
UI: 只显示 B/S 当前生成的 StepSpec 数据；不是 K 或新 Tool。
```

**BUILD / Runtime 边界**保持 v0.10.2：外部 `@kaicreator/domain-harness-build` 的 `buildV10App/projectSelectedComponents` 只封闭已选源码与依赖；`@kaicreator/domain-harness-microkernel` 的 `load/send/query/subscribe/stop` 不新增 Provider/UX 特权。真实 Host 网卡/密钥与现存 K Primary 权威独立。首版不改 Kernel ABI，不加新派发器。

## 二、明确唯一契约属主

| 关注点 | 主要属主 / 候选路径（待 L2 批准） | 输入/输出与权限 | 为什么不是额外 Tool |
| --- | --- | --- | --- |
| 双协议**统一逻辑** `llm.generate` | 公共协议 DTO/契约 Owner，一份共同 Request/Response；由 B/BUILD 显式绑定 C 操作 | 同一请求数据结构可按已允许策略选到 OpenAI 或 Anthropic；未绑定拒绝。**不是第三个实体 C Package** | 仅负责公共 Schema/选择契约，本身没有物理独立操作 |
| OpenAI-compatible | 单独 C Module + Host OpenAI adapter；候选 `llm.openai.generate` | Chat Completions 真实 wire，声明能力和使用凭据 | 真正远程调用就是 Tool；Module `externalEffect:true` |
| Anthropic Messages | 单独 C Module + Host Anthropic adapter；候选 `llm.anthropic.generate` | Messages 原生 request/content-block/tool-use，明示不能表达的功能 | 独立 Tool，绝不隐式导入 OpenAI C |
| Prompt/Context/Response | 优先复用 `domain-packages/standard/features/context-assembly`、`semantic-decision`；按实际缺口可选纯 S | 构造 Prompt、当前范围 Context、Schema 解析，模型结果非权限 | 纯语义函数/私有 helper |
| 预生成表单 / 运行时下一步 | 业务 Producer 维护 `StepTemplate/FormSchema`、版本摘要；B + 可选 S 使用唯一 #1397 `StepSpec/LLMAdvisory/NextStepDecision` | 仅从已批准候选中选一个步骤，UI Render-only | 渲染/组合不是物理 Effect；必要检查由 B/K 掌握 |
| Task / Meta 经验演化 | 现有 S Evidence/Candidate/Experience 原始源码可达性核对、B 工作流、可选 task-meta 证据适配 | 规则→精确语义复用→已晋升子流程→有界模型是**决策源优先顺序**；Candidate→验证→显式晋升→下次 BUILD 固定是**知识成熟度** | 无第二个 Kernel、自动更新器或自动晋升权威 |
| npm 外部执行内容完整性 #1393 | BUILD/Contracts/Host **跨层可信闭包**的最小公共方案 | 明确默认 trusted-deployment 与可选 verified-integrity profile；独立可信发布/部署根摘要覆盖实际可执行代码依赖，加载前校验。仅从同一可变 seal 读取 expected hash **不是可信锚点** | **与 LLM Provider wire 协议不同**；不另建供应链平台 |
| CAS 对接文档 #1394 | docs/examples 独立 | 公共 K `kind:create/cas` 与 Host `mustBeAbsent/mustMatchRevision` 的薄适配器 | 不另造存储或权限边界 |

**要点：** C Provider 物理调用在外部发送信息并可能付费，不可凭 “读模型” 把整个 Module 误标成无 Effect；采用 v0.10.2 模块级 `externalEffect` + K Permit/Journal/UNKNOWN。实际 K 的准入标识、重放规则和 Host 授权仍以当版公开 ABI 为准。未经授权的模型返回 ToolCall 只是 B 校验的提案。 `llm.generate` 为**必须提供的逻辑契约**，但不保证 v0.10.2 已存在的第三个 `operationId` 或运行时别名表；L2 需决定最小静态显式绑定的公开消费者示例和拒绝行为。

## 三、按 Concern 并行，不再长串行

下表是 **规划候选**（不得解释成已经创建或授予可执行 Task Issue），共享写集以最终 L2/Scaffold 归属裁决：

| Lane | Concern / 来源 | 起点与对其他 Lane 的依赖 | 独占写集建议 |
| --- | --- | --- | --- |
| G（历史 DONE，不建立新 Task） | ADS 升级 #1405 已合并 | 不是新的前置任务 | `.dev-standard/VERSION` 和过期 pin 描述 |
| I | 真实已复现 npm executable integrity #1393 | Product/L2 通过后可与其它并行 | BUILD/Contracts pre-load 选择与受信校验（不得和 C 的适配器写同一文件） |
| A | 公共中立 DTO/Operation 契约 #1396 | Product/L2 **最小公共静态契约**获准后先固定接口；B/C 可并行准备本地不冲突方案 | 单一公共协议接口、有限 Capability 概念 |
| B | OpenAI C+Host | **A 的最小类型面**确定即可单独实现；不等待 Anthropic | OpenAI C Module/Host adapter |
| C | Anthropic C+Host | 与 B 同时、独立实现 | Anthropic C Module/Host adapter |
| S | 可复用 Prompt/Response、Context 或内部 helper | 与 B/C 独立；先决定有没有真实公共缺口 | 现有 S Feature 以小变更为主 |
| J | Guided Journey #1395 | #1397 DTO 评审；离线路径可与 B/C 并行 | 参考 Business/Step 数据；必要时可选 S |
| M | 历史进化 #1398 源码可达性/下游复用 | 无 Provider 必然依赖；与 A/B/C/J 并行 | 证据映射与薄适配，不另建元数据 Kernel |
| D | Host CAS 最小文档 #1394 | 不必等待 B/C；只做独立示例 | 双语 docs/example |
| R | 一次性集成与 RQ | 依赖所有本版**实际要求**交付的 Lane，而非所有候选优化必须实现 | Node24 packed clean consumer/CI/关键正反例与双语文档对齐 |

**禁止假并行：** 如果 I 与 B/C 最终需要修改同一 Host 组成根，优先 I 持有共享适配/权限边界，B/C 分别只写 Provider 子目录，然后 R 统一接线。只使用真实 GitHub Native `blocked_by` 作为活 DAG；以上表格不是 Live Task 状态。

## 四、验证优先级和冻结前缺口

1. **契约复审：** #1397、#1400、#1402 修订后的独立 SHA 对账；#1397 有界 Schema 采用真正 Draft 2020-12 validator 的正反例。原有 Docs-PR CI 不能代替 Schema test；未执行就是 NOT_RUN。
2. **必要生产验证：** Node24 installed packed App，Provider **0 / OpenAI-only / Anthropic-only / both** 四组合；统一 `llm.generate` 中立数据与明确绑定；无选中 Package 零 import/dispatch；两 fake endpoints 而非必需付费真调用。
3. **Journey：** 构建前固化模板；运行时 CaseRef 改变选择不同 StepSpec；LLMAdvisory 禁止非法模板/effect，旧 StepOutcome/Effect UNKNOWN 不伪造成功；零模型路径完整。两个下游实际复用前，不必实现通用 S Guided Journey 包。
4. **进化：** 由真实脱敏结果建立 Candidate；未晋升无权执行；审核后新版本固定可复用；正在运行的旧实例不热改。
5. **P1 npm：** 以真实 Node24 部署根摘要为锚，验证正常 Provider 正例、单独替换安装代码负例，以及**同时替换 Provider 和可变 sealed App 内嵌 hash 但保留旧 subjectDigest**的联动篡改负例；必须在首次 Provider 求值/任何 Kernel Effect 之前拒绝，且无日志凭据泄漏。声明覆盖范围、攻击者假设、Node ESM/TOCTOU 限制；无法保证完整可执行闭包时收窄 verified profile 而非虚报 Sandbox。**CAS P2** 先复用 ai-rexform adapter + 双语可运行例子，若消费者复现通过且无其他重复缺口，不要求运行时修改。
6. **最终：** 不重复执行旧 v0.10.2 Full/Hidden；最后选 exact 版本候选依真实影响集中验证一轮。CI Provider 处于 PENDING 不当 FAIL；只有明确失败步才能定向修复。

**Gate：** `PRODUCT_L1_FREEZE=YES; DATA_CONTRACT_FREEZE=YES; ADS_V418_ADOPTION=MERGED; L2_R0=REVIEW_PENDING; L2_FREEZE=NO; DAG_ADMITTED=NO; SOURCE_CHANGE_AUTHORIZED=NO`。
