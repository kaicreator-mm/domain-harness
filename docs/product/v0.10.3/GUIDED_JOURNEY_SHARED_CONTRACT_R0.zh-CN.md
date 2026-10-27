# DomainHarness v0.10.3 — Guided Journey 共享契约 R0（中文）

[English](GUIDED_JOURNEY_SHARED_CONTRACT_R0.en.md) · [需求 #1395](https://github.com/kaicreator-mm/domain-harness/issues/1395) · [总入口 #1392](https://github.com/kaicreator-mm/domain-harness/issues/1392) · [机器可读 JSON Schema 候选](contracts/guided-journey-v1.schema.json)

**契约草案 / 作者候选 / 未冻结 / 非已发布 SDK API / 未执行测试。** 本文供两个项目并行设计，不等于已发布的 DomainHarness v0.10.3 公共 API。正式 Product/L1、L2、Task DAG、独立 exact-SHA 审核与契约冻结仍属独立门禁；不变更 v0.10.2 已有公共 ABI。跨版本 CV-01..12：INHERITED_UNCHANGED。工程治理以仓库固定的 ADS 版本为准。

## 1. 产品目标与最小范围

用户目标不应该对应一次性完整表单，也不应该强制遵循固定向导。每当用户输入、获得授权的设备检测结果、真实操作回执、跳过或恢复时，已选 Business/Semantic 规划器都根据**当前状态**从已经验证并有版本标识的模板集中决定**一个下一步骤 StepSpec**。可分支、重复、补充检测、等待、阻断或结束；UI 仅显示当前相关的一小步。常规流程应是**确定性的，完全不调用 LLM**。

对应两层进化：
- **当前任务 / Business Harness**：快速根据状态和证据，组合预生成的表单步骤、规则、已验证子流程与符合适用条件的经验。只有规则无法充分处理时才请求有界 LLM 建议。
- **跨任务 / Meta Harness**：由单独授权的离线/生产者工作流使用脱敏的真实结果或 LLM 形成候选模板、规则及经验，经证据校验、模拟、独立评审和明确晋升，进入后续经过版本固定的基线。候选内容不是生产执行权。历史多级进化能力需要按真正的 v0.10.2 公共 ABI 验证，不能把过去的研究视作现已提供的自动晋升 API。

本契约限定**下游 Business、可选已选择的 S/Semantic、UI 渲染器和可选模型适配器之间的纯数据交互**；不定义云模型传输、HTTP 服务、UI 框架、通用调度器、数据库、新 Microkernel facade 方法或自主 Agent 循环。

## 2. 权限与职责归属

| 模块 | 应负责 | 不得负责 |
| --- | --- | --- |
| 已选 Domain App BUILD / 生产者 | 封闭选择 K/S/B/C 可执行模块、依赖，以及需要权威版本绑定的模板/策略基线 | 每次用户操作都重新编译或加载 Domain Package |
| Business Package | 真实业务目标、设备事实、适用性判断、可执行策略和本地化资源 | 把模型输出当作新权限 |
| 可选 Standard/Semantic Feature | 可复用的下一步协议、状态事件、有限步骤组合与建议 | 绕过 Kernel 掌握 K State/Effect/Journal |
| UI / Host | 显示一条 StepSpec、收集用户输入、提供真实设备传输与确认界面 | 将表单选择或预览直接转换为 Effect 许可证 |
| 模型适配器（若选用） | 仅在可用的模板/选项/证据引用中给出建议 | 发明 Tool/权限、伪造操作成功或未经同意外传设备数据 |
| K Primary / 实际已选 Effectful Capability | 授权 Admission、执行 Journal/Effect/UNKNOWN/Replay 和真实效果回执 | 将生产权限委托给 StepSpec 或 LLM 输出 |

封闭式 BUILD 不变：运行时仅生成**StepSpec 数据**，不是新 Tool、新 Domain Package。普通内部辅助函数无需注册 Tool；真实可独立调用的 C 操作仍遵循 Capability 和 Kernel 权限。若远程模型调用涉及外部效果，应通过其实际已选择的适当边界，不能假设 SDK 已提供通用 Provider 网关。

## 3. 共享数据契约 v1（候选）

固定版本识别为 contractVersion = "dh.guided-journey/1"。同目录的 JSON Schema 定义**候选线协议**，以下名称并非 v0.10.2 或 v0.10.3 现已发布的 TypeScript 导出。

- **TemplateRef**：artifactId、version、digest（64 位十六进制 SHA-256）。仅引用提前制作、验证、版本固定的模板，不表示运行时生成的可执行代码。运行中 Journey 使用固定版本的模板集；迁移须另行审批。
- **CaseRef**：snapshotId、digest，绑定当前真实业务事实；evidenceRefs 为可核查的不透明证据引用。IMEI、设备序列号、账号与密钥等不直接进入模型 Prompt。
- **NextStepRequest**：journeyId、goals、CaseRef、模板目录引用，以及由权威 Business 规则预先筛选的 eligibleTemplateRefs 和可选上一条 StepOutcome。S/LLM 只能在此候选集中建议，不具备适用性证据时应先补充检测。
- **StepSpec**：唯一 stepId、准确 TemplateRef、CaseRef、有限步骤 kind、titleKey、少量相关 fields、allowedEvents、evidenceRefs、可选非授权的 actionPreviewRef。仅用于当前页面渲染；REVIEW_EFFECT 不是授权令牌。
- **StepOutcome**：当前 stepId 和事件 USER_SUBMIT / SKIP / BACK / PAUSE / RESUME / OBSERVATION_RECEIPT / EFFECT_RECEIPT；可选 selectedOptionIds、evidenceRefs、receiptRef。Business 必须依据已发出的 StepSpec 校验选择；receiptRef 不等于操作成功，必须由 Kernel/Host 真实核验。
- **NextStepDecision**：STEP / NEED_EVIDENCE / WAIT / BLOCKED / DONE，附 reasonCode、evidenceRefs；只有 STEP 才包含且只包含一个 StepSpec。DONE、WAIT、BLOCKED 都不能假冒所有用户目标已达成。
- **LLMAdvisory**：候选集中的 suggestedTemplateRef、reasonCode、evidenceRefs、可选简短脱敏解释。不是 NextStepDecision、权限或操作，不接受虚构模板/证据、越权选项、任意 shell 指令或 APK 下载地址。

有限步骤类型：DEVICE_IDENTIFY、CHOOSE_GOAL、ASK、INSPECT、CHOOSE_ROUTE、REFINE_ACTION、REVIEW_EFFECT、VERIFY_OUTCOME、SUMMARY。表单字段类型：CHOICE、MULTI、TEXT、CONFIRM。新增步骤类型需要明确契约版本变更；领域选项、本地化文本及设备规则由下游应用提供。

**R1 有界线协议：** ID、键、reasonCode 长度不超过 128 字符，模板版本不超过 64，目标文本和证据/回执/预览引用不超过 256；SHA-256 digest 固定 64 位十六进制，模型解释不超过 500。数组上限为：每步字段 12、每字段选项 16、允许事件 7、每条消息证据引用 24、目标 8、合格模板 32、所选选项 16；标识/事件/引用字符串列表拒绝完全重复项。这些是**单消息 Schema 限制**，业务 B 仍需验证跨对象 ID 唯一性、真实权限、来源及证据时效。使用已安装项目依赖执行 `node docs/product/v0.10.3/contracts/validate-fixtures.mjs` 验证正反例；不将此等同 Node24 真实下游消费者测试。

## 4. 步骤决策生命周期及强制约束

1. 获取已授权、未过期的 CaseRef 和真实上一条结果。Business 按权限、证据、设备当前状态筛选**只有符合条件**的 TemplateRef。
2. 默认遵循 v0.3 冻结的 **确定性规则 → 精确语义结果复用 → 符合适用性的已晋升子流程 → 有界模型兜底**；模型未显式选择时零调用。语义缓存复用不同于 K Journal 重放。领域 B 可以显式声明不同的业务优先策略，但不得将其描述成 v0.3 原始默认顺序。可选 S Feature 根据候选集返回一个下一步决策。无可用路线时返回 NEED_EVIDENCE、WAIT 或 BLOCKED，不自动调用 LLM 猜测。
3. 可选 LLM 仅在经过配置、确实存在新情况/冲突/未知问题时受限调用；必须执行耗时、Token、费用、隐私上限。其 LLMAdvisory 只有通过候选集、证据引用及 CaseRef 校验，才可影响之后的 Business/S 决策。没有 LLM 必须仍能运行主要流程。
4. UI 显示一个 StepSpec。用户答复构成 StepOutcome。真实读设备/写设备须另经被授权的 Host/Capability 路由执行，收到字面真实回执并更新 CaseRef。
5. 下一步前重新核验 CaseRef。状态变化则丢弃过期步骤或要求重新检测；BACK 不得悄悄撤销或重放已执行的操作；PAUSE/RESUME 不得重用之前的修改授权。
6. 当 Effect 返回 FAIL/PARTIAL/UNKNOWN，转向诊断或恢复；不允许由模型推断 ACK、Google 认证或 Play Integrity 通过。
7. 模板、权威业务规则或已选可执行模块变更须通过新的经过验证的基线和正式 BUILD/部署或经过支持的迁移边界。仅展示文案的改进如果不改变语义/权限，可以由应用自己的资源管理流程完成。

**兼容性**：同一主版本 /1 保持字段含义和枚举语义。无法识别的字段或状态必须拒绝；尚未明确授权的扩展不可默认透传为有效权限。本 R0 不承诺任何发布的 SDK ABI、npm 包或自动迁移 API。

## 5. 两条真实分支的后续验证目标

用户目标“让 Google 地图等依赖 Google 的应用可用”：
- Case 显示 GMS **存在但禁用**：Business 确认允许后，显示适合的 OEM 启用路径检查/授权预览；不出现 APK 安装页。
- Case 显示 GMS **缺失**：生成兼容性与合法安装来源检查，不能满足就显示 BLOCKED/替代方案；UNKNOWN 时只提示征得同意后采集只读清单。
- 使用同一套已选模板，不需要 LLM 就能根据实际状态产生不同的下一步。安装、禁用、恢复必须独立经过 Host 真实效果门禁与用户批准。

瘦身示例：受保护应用进入解释/阻断分支；经过验证可逆的应用才进入 REVIEW_EFFECT；实际成功之后进入 VERIFY_OUTCOME；实际失败进入诊断/恢复，不允许默认选中删除操作。

## 6. 两仓库契约先行的门禁

**Gate A — DomainHarness 只定义契约：** 本草案 PR、最小机器 Schema、中英文语义、对 v0.10.2 已选 S Feature/Business 的复用证明。须由独立 exact-HEAD Reviewer 输出 P0/P1/P2、SHARED_CONTRACT_READY、CONTRACT_FREEZE_READY；由 Controller 固化通过审核的 exact SHA 和 Schema digest。在此之前所有名称仅是 DRAFT。

**Gate B — 契约冻结后并行开发：** DomainHarness 只在确有公共缺口时实现可选 S Domain Package，否则提供更小的参考适配器；ai-rexform 按同一 DTO 实现 Android Business、预生成模板库、状态驱动 NextStep、简易渲染器和可选的单个模型 Provider。ai-rexform 继续基于 v0.10.2 已发布的公共接口开发，不必让 M01/G01 等待未来公共包。

**Gate C — 最后集成对齐：** 使用真实合格的 DomainHarness v0.10.3 公共 tarball、选定 BUILD、Node24 对外 clean consumer 测试；复用相同的合同 fixtures，验证已选择/未选择可选包、确定性和模型建议、错误/UNKNOWN、无模型分支与真实 App E2E。对比 exact SHA/Schema/ABI，确有差异用最小适配器处理；不得未经审核热替换运行实例、合入 main 或声称 RQ PASS。如 v0.10.3 最终未交付新包，应用保留兼容的内部实现即可。

## 7. 验收条件与明确排除

真正测试后应验证：每次只显示当前步骤；不同设备/业务状态生成不同**后续步骤类型**；无模型主要路径；LLM 建议不会扩大允许的模板/操作；过期 CaseRef、虚构证据拒绝；返回/恢复不重放已执行命令；Node24 已安装外部使用方的 Feature 有/无两路径；用户中文与 Agent 英文文档配对；先由 ai-rexform 再由另一实际 Domain App 证明公共复用价值。

不做通用可视化表单编辑器、Schema 编译器、UI 引擎、运行时 Package 动态加载、必需的云模型、原始隐私日志上传、另一个 Agent 调度器、第二份 Kernel 权威，也不把这项需求变成 ai-rexform 已有 M01/G01 的强制依赖。

**草案撰写时的真实状态：** 仅文档/契约源码；Node24 NOT_RUN；独立审核 NOT_RUN；v0.10.3 代码 NOT_RUN；真机改造 NOT_RUN；CONTRACT_FREEZE_READY=NO。
