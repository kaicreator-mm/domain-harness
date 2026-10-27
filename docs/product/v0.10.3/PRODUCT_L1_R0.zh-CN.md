# DomainHarness v0.10.3 — Product/L1 R0 候选（未冻结）

[English](PRODUCT_L1_R0.en.md) · [能力复用矩阵](SOURCE_REUSE_R0.zh-CN.md) · [版本总入口 #1392](https://github.com/kaicreator-mm/domain-harness/issues/1392)

> **状态：PRODUCT_R0_CANDIDATE / INDEPENDENT_REVIEW_NOT_RUN / PRODUCT_FREEZE=NO / L2_FREEZE=NO / TASK_DAG_NOT_ADMITTED / SOURCE_IMPLEMENTATION_NOT_AUTHORIZED。** 本文从已发布 v0.10.2 的确切 Tag `cee14399d9d0af4e20e34b9111861b16a465b690` 开始；不重写其历史 RQ CONDITIONAL / Full EXIT1 / root NOT_RUN。该 R0 是可评审的范围草案，非正式已冻结契约。

## 1. Product 目标：下游真正可用的小规模通用能力

满足两个现实用户需求：(a) **Domain App 按需选择独立 LLM 协议、在确定性流程需要时使用模型**；(b) **提前准备可复用的交互步骤、运行时选择下一步骤、在未知情况可选 LLM 候选并形成跨任务演进反馈**。同时修复已有下游实测的公共 SDK 缺口。新功能通过已选 K/S/B/C Domain Packages，而不是将模型、UI 和 Meta 控制器内建到 Microkernel。

实际问题和 Scope Issue：
- **已证实 P1** [#1393 外部 npm Provider 可执行字节完整性](https://github.com/kaicreator-mm/domain-harness/issues/1393)：独立于模型协议，是 BUILD / Host pre-load 完整性问题。需要先在 L2 定义可信部署默认模式与**可选严格完整性模式**，明确独立于可变 `sealed-app.json` 的可信发布/部署摘要锚点以及覆盖实际执行内容的校验闭包；不把自带声明当成信任根，也不制造通用 npm 包管理器。
- **功能候选** [#1396 LLM 两协议可选 Capability](https://github.com/kaicreator-mm/domain-harness/issues/1396)：OpenAI-compatible Chat Completions 与 Anthropic Messages-compatible 是独立选取的 C Package；Domain App 可选择 **0 / OpenAI / Anthropic / 同时两者**。按 #1396 必须同时定义覆盖两种协议实际已验证交集的**统一 `llm.generate` 逻辑 Operation/Request/Response 契约**；每次统一调用由 B/BUILD 显式绑定一个已获准的具体 C Operation，不引入自动 Provider 网关、默认切换或第三个别名 C Package。Prompt/Response/Context 为可复用纯语义 S Feature 或包内私有 helper；Transport 与凭据属于 Host。协议功能不同必须显式声明，不默认支持特有 API。
- **功能候选** [#1395 Guided Journey](https://github.com/kaicreator-mm/domain-harness/issues/1395)：**构建前**验证版本化 StepTemplate/FormSchema/ChoiceCatalog、分支规则及恢复路径；**运行时**根据业务事实与 Effect 真正结果只组合一个下一步 StepSpec；**必要时**有界 LLM 仅提供由 #1397 唯一 Schema 定义的 **LLMAdvisory**（`messageType: "llm.advisory"`），经已批准模板/权限/证据校验后，B/S 才能生成符合 #1397 `NextStepDecision` 的状态与 StepSpec；缺证据时用 `NEED_EVIDENCE`，不增加独立候选 wire 类型。已起草具体双语 DTO/Schema [PR #1397](https://github.com/kaicreator-mm/domain-harness/pull/1397)，先复用 v0.10.2 S/B 接口；缺少两个独立真实消费者和可复现公共缺口，不新增泛用表单引擎。
- **历史能力核对候选** [#1398 任务层/元数据层多级进化](https://github.com/kaicreator-mm/domain-harness/issues/1398)：先重建 v0.3 原始规则→精确缓存→已晋升子流程→有界 LLM 决策优先顺序，以及跨任务 Candidate→验证→显式晋升→下一版本 BUILD 固定的独立成熟度轴。任务 B 执行和元数据/经验生产者是**职责**，不是两个 Kernel。对照 v0.10.2 真实公开路径；具体公共 Package 是否必要按两个消费者验证裁定。
- **已证实 P2** [#1394 V10DocStore ↔ Host CAS 接线易误用](https://github.com/kaicreator-mm/domain-harness/issues/1394)：优先 15–30 行适配样例和实际 clean consumer，不为应用误用重建 Store 抽象。

**范围上限：** 不新增第二个 Runtime、通用 UI 渲染/表单编辑器、通用 Agent 平台、向量数据库、模型门户、自动推广生产权限或代码热替换。已选择 Domain App 的完整性、效果准入和 Replay 权威继续由现有 K 保持。

## 2. 可选择性与职责边界（Product MUST）

| Domain Package 或阶段 | 应有行为 | 未选用时 |
| --- | --- | --- |
| K Primary | 保留唯一 Admission、State、Journal、Effect Permit、Replay、UNKNOWN | 不允许没有 K 的正式 App |
| S Primary / 可选 S Features | 重用语义决策、Context；必要时纯 Prompt/Response/Guided Journey Feature | 不导入、不初始化、不依赖不存在的 Feature |
| C OpenAI 兼容 Provider | 声明独立 `llm.openai.generate` 候选 Operation、真实 Host Client | 缺失时不调用、不偷用 Anthropic |
| C Anthropic Messages Provider | 声明独立 `llm.anthropic.generate` 候选 Operation、真实 Host Client | 缺失时不调用、不偷用 OpenAI |
| B 业务策略／统一 Operation | **统一 `llm.generate` Request/Response 契约**，每次由 B/BUILD 显式绑定被允许的具体 C Operation；表单下一步合法性、业务规则、工具动作条件 | 纯规则 App 无模型也能完成常见任务 |
| BUILD / Host | 精确选取 Module/Package/route；Host 密钥/物理客户端；按适用独立 #1393 检查安装的 npm 源 | 不做动态 Provider/Tool 安装或模型输出授权 |

远程 LLM 请求可能产生费用与数据外送，建议作为独立 effectful C module；当前 v0.10.2 是**模块级** `externalEffect`，不可假设逐 handler 独立。模型的 Function/Tool Call 只是提议，必须由 B/K/Host 正式审查准入。两种协议公开一个**实际可支持的交集**，而非宣称所有服务都实现同一 OpenAI/Claude 功能集。

## 3. 合格的用户可观察结果

- **P-A 0/1/2 选择：** Node24 外部 clean installed Domain App，分别选择无 Provider、仅 OpenAI、仅 Anthropic、二者同时；源未选择时零导入和零请求；双选时完全显式路由且 Host 密钥不串。**一份共同中立 Request/Response 夹具**必须通过 OpenAI-only、Anthropic-only 的显式 B/BUILD 路由；双选不得隐式串路由。
- **P-B 请求/输出：** 用受控假服务验证两种真实 wire shape 的 JSON/Tool-use 解析；非法模型结果、已发送但结果不明的请求、取消/超时/额度错误真实分类；无未经批准的 Tool Effect 或盲目收费重试。若没有实际付费凭据，网络 live smoke 为 **NOT_RUN**。
- **P-C 动态表单：** 同一 GMS 目标，根据 `PRESENT_DISABLED | ABSENT | UNKNOWN` 等已验证状态提供不同**下一步**；离线零 LLM；BACK/RESUME/Effect FAIL/PARTIAL/UNKNOWN 有合法步骤，显示 StepSpec 不触发操作；没有已批准模板时 ASK/WAIT/BLOCKED 而不是生成未声明代码。
- **P-D Meta 演进：** 一次真实业务输出脱敏可核验证据 → Candidate（无执行权）→ 单独验证/审批 → 新版本/新实例复用；原实例凭 exact pin 保持重放一致。先做历史源可达性证明，未证实公共缺口不制造新 Meta 平台。
- **P-E 既有 P1/P2：** #1393 原应用攻击夹具在严格配置的已选 Provider 完整性检查下，覆盖三组真实判别：①合法可信 Provider 正例；②仅替换安装的 Provider；③**同时篡改 Provider 与本地 sealed-app 的内嵌哈希，但仍保留旧 subjectDigest**，后两者均在任何 Provider 代码求值/Kernel Effect 之前拒绝且无凭据泄露。所需信任锚必须独立于攻击者可同时改写的本地 seal；#1394 优先由已验证下游薄适配器+双语例子解决，不要求 Kernel/Host store runtime 重构；仅有重复跨下游证据才考虑公共 Bridge。

**资源/性价比约束：** 两种 Provider 的 Host 客户端复用现有库；上下文首版复用已有 bounded Context（明确字符 ≠ Token）；真正 Token 预算/Streaming/独立 Prompt Registry 必须有实际消费者需求才从候选扩展为正式范围。v0.10.2 高成本的旧 Full/Hidden 不对每片修改重复运行。

## 4. 契约先行、下游反馈与门禁

1. 双语 **R0 契约预览**：[PR #1397 表单 wire DTO/Schema](https://github.com/kaicreator-mm/domain-harness/pull/1397) + [PR #1400 Provider 和进化](https://github.com/kaicreator-mm/domain-harness/pull/1400)，均未冻结/未合并。无模型业务可以先按 v0.10.2 公共 SDK 实现薄适配器。
2. 独立审核后获得可复用的**数据契约候选检查点**；记录 Schema digest、exact SHA、`ADDITIVE|MIGRATION_REQUIRED|BREAKING`，向 ai-rexform、Tally 等下游发布**候选身份**与变更说明。
3. Product/L1 独立审核与冻结，随后 L2 冻结 SDK/Feature/Host/BUILD 边界；形成依赖最少的并行 Task DAG。这里的产品 R0 和契约预览**均不批准源码实施**。
4. 并行工作 Lane：P0/P1 npm 外部 Provider 完整性（Contracts/BUILD/Host）、OpenAI C+Host、Anthropic C+Host、S Feature/语义与 Reference Examples、可选 Guided Journey、v0.3/0.10.2 能力复用调研、CAS docs。仅共享接口/ABI 锚点为真实先决条件；不把独立 Provider 串成链。
5. 版本候选 exact SHA 一次性比较 SDK API/Schema、下游实际适配器以及真实 Node24 clean consumer，评审后统一 RQ。下游不用停工，且下游实际 PASS 不能替代 DH 发布门禁。

## 5. 治理差异（必须诚实）

该仓库当前 `.dev-standard/VERSION` **仍固定 ADS 4.13.1@f35fcdb**，项目用户计划参考 ADS v4.18 / #1241。**v4.18 尚未成为本仓库当前正式生效的 Pin**：应另走最小 reviewed adoption/pin PR，清楚记录兼容性后才可宣称按新版本正式冻结。本 R0 可以按较新的多 Lane/最小验证设计先行，但不伪造已升级状态。CV-01..12 `INHERITED_UNCHANGED`。

```ini
TARGET_VERSION=v0.10.3
BASE_RELEASE=v0.10.2@cee14399d9d0af4e20e34b9111861b16a465b690
PRODUCT_L1_STAGE=R0_CANDIDATE
CURRENT_ADS_PIN=4.13.1
TARGET_GOVERNANCE_REVIEW=4.18_PROPOSED_NOT_ADOPTED
PRODUCT_FREEZE=NO
L2_FREEZE=NO
TASK_DAG_ADMITTED=NO
CODE_IMPLEMENTATION_AUTHORIZED=NO
FULL_HIDDEN=NOT_RUN_FOR_THIS_CANDIDATE
```
