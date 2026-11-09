# DomainHarness 跨项目架构综合与自我对抗审查 R1

[English](DOMAIN_PACKAGE_CROSS_CONSUMER_ADVERSARIAL_R1.en.md) · [原有函数/Tool 文档](DOMAIN_PACKAGE_FUNCTION_TOOL_BOUNDARIES_R0.zh-CN.md) · [领域知识/Workflow 文档](DOMAIN_PACKAGE_KNOWLEDGE_AND_WORKFLOW_R0.zh-CN.md)

> **先读：文档权威性——非规范性实施参考**
>
> 本文是供下游 Domain App 按需采用的架构分析与实施参考，**不是** DomainHarness SDK/Kernel/Runtime/公开 API/ABI 规范、功能公告、Product/L2 决策、冻结基线、版本发布计划或实施授权。
>
> - **SDK 能力的权威依据：** 使用 DomainHarness v0.10.3 时，以精确发布 Tag/源码、实际公开导出与 ABI，以及该消费者自己的 selected BUILD、Host 和 clean-consumer 验证证据为准。本文不能增加 API、让尚未实现的功能变得可用，也不能覆盖已发布契约。使用其他 SDK 版本时，必须重新核对对应版本。
> - **下游项目的决策权：** 每个项目自行决定 Product/L1/L2 范围、架构、实施计划和验收门槛。本文不是任何下游项目的前置条件、阻塞项、原生依赖、Task 要求或验收门槛。
> - **按需采用：** 下游项目可以采用、调整或忽略具体建议。**不需要等待本 PR 完成评审、转为 Ready 或合并。** GitHub Draft 仅表示本文档 PR 的审核状态，与 SDK 能力是否存在、下游是否可以实施无关。
> - **如何理解 MUST / MUST NOT：** 描述已发布契约的语句，是要求消费者正确使用现有契约；描述目标设计、示例或安全建议的语句，是供采用者参考的实施指导。两者都不会因此产生新的 SDK 义务或能力。
> - **何时才能认定 SDK 缺口：** 必须先在精确发布的 public package/ABI 上，用独立 clean consumer 得到最小、可复现的失败，并排除消费者业务代码、Host 接线和 BUILD 选择问题。之后仍须单独进行 Product/L2/DAG 和版本发布资格决策。
>
> `DOC_KIND=NON_NORMATIVE_DOWNSTREAM_REFERENCE` · `ADOPTION=OPTIONAL` · `DOWNSTREAM_PREREQUISITE=NO` · `SDK_CAPABILITY_DELTA=NONE` · `RELEASE_AUTHORITY=NONE`

> **状态**：`SELF_ADVERSARIAL / DESIGN_INTAKE / INDEPENDENT_REVIEW_NOT_RUN`。是对 [Tally v2](https://github.com/kaicreator-mm/tally) 多轮实施分析、[DH #1465](https://github.com/kaicreator-mm/domain-harness/issues/1465)、[#1467](https://github.com/kaicreator-mm/domain-harness/issues/1467)、[#1468](https://github.com/kaicreator-mm/domain-harness/issues/1468) 的综合交叉审查，不是 v0.10.3 运行时 ABI 变更、L2 Freeze、独立 Review PASS 或发布授权。下游经验入口：[DH #1392](https://github.com/kaicreator-mm/domain-harness/issues/1392)。

## 0. 证据和时间边界

- Git-only 发布锚点：[`v0.10.3@061376f4a023070f215f9feffad5c24d96d503cb`](https://github.com/kaicreator-mm/domain-harness/tree/v0.10.3)。所有公开契约判断必须使用精确 tag、**实际 public exports / tarballs** 和 clean consumer。
- 对抗审查的 Tally 基线：[ `version/v2@7ebb1cdd0a79fc82cc938e35f852a80dd8e15332` ](https://github.com/kaicreator-mm/tally/tree/7ebb1cdd0a79fc82cc938e35f852a80dd8e15332)；其 B 模块当前 `MODULE_ID=business-tally-task-readiness@v2.0.0`、`PACKAGE_KIND=business`、`ABI_VERSION=v08-business-abi/1`。该事实**不等于**一个已升级到 v0.10.3 的安装运行时。
- Tally 单一集成 Draft [PR #258](https://github.com/kaicreator-mm/tally/pull/258) 与当前领域任务 [#276](https://github.com/kaicreator-mm/tally/issues/276) 尚未完成独立发布资格化。
- 先前治理文档已有多版本描述和历史 Product 提案。区分 `HISTORICAL_DIRECTION`、`SOURCE_ONLY`、`PUBLIC_SUPPORTED`、`CLEAN_CONSUMER_VERIFIED`、`FUTURE_CANDIDATE`，不要仅依据一个旧路径名或设计 Issue 将功能认定为已发布。

## 1. 一份不混淆维度的 Domain Package 模型

| 维度 | 推荐概念 | 真实边界 |
|---|---|---|
| 领域所有权 | Domain Data / B | 领域术语、Authority、Schema、Rule、Knowledge、Pattern、Recipe、Skill、Workflow、业务 Intent/策略、反例 |
| 运行时角色 | 一个 K Primary；选定 S Primary/Features；B；C；Host | K 唯一 State/CAS/Journal/Effect/UNKNOWN；S 有界语义；C 操作；Host 物理资源 |
| Component Definition | semantic / tool | 当前 `packages/domain-harness/src/contracts/component.ts` 中 `COMPONENT_FAMILIES=['semantic','tool']`，这是**特定现存契约** |
| 设计层三类扩展 | Semantic / Hook / Tool | [#1361](https://github.com/kaicreator-mm/domain-harness/issues/1361) 的前瞻性 taxonomy，不能据此宣称已发布 generic business hook family |
| K 扩展 | kernel-extension / advisory hook | 受限辅助建议/观察；不能有 K Commit/Permit/Journal；[#1269](https://github.com/kaicreator-mm/domain-harness/pull/1269)、[#1271](https://github.com/kaicreator-mm/domain-harness/pull/1271) 未合并 |
| 业务事件 | Domain Event / Business Extension（候选） | 先用 B Intent/K Workflow/C；只有两个以上独立消费者证明不足才升级到通用 ABI |
| 初始化 | V8 Qualified Package 或 V10 selected Feature/K extension | 不同生命周期契约；无证据支持为任意 V10 B 模块添加通用 `init()` |

**关键纠偏**：`Semantic` 既可以是领域数据中静态的规则/技能定义，也可以是 selected S 的运行能力；`Tool` 可以是独立 Component、选中 C Operation、或外部 Agent/MCP Tool 的名称，但三者不自动同一身份。必须在每个设计中写出对应的 API/装配层。

## 2. 函数、Tool、Host 的正确调用分层

```text
Business/domain rule (pure helper, Schema, Pattern, Workflow Definition)
   -> Business Intent -> trusted caller/Host -> selected K
       -> Admission / State / Journal / Effect Permit
       -> BUILD-selected C Operation (typed, scoped)
       -> Host/provider adapter (credentials, IO, HTTP/MCP/CLI/Agent/CI)
       -> authoritative readback -> K evidence -> B projection
```

- **非 Tool**：私有规则/算法、Schema 校验、DAG 规划、Experience 归一化、K `query/subscribe` 状态观察、非 Effect 的 UI 展示，以及仅供编译消费的 Domain Data。
- **C Operation**：显式声明 `operationId → handler` 并被 BUILD 选中；并不等于自动向 Agent 公开。C 可以访问本地/系统/远程能力，执行位置不决定 Effect。当前 `externalEffect` 是 C **module scoped**：将只读和 Effect 操作分成不同 C modules，不能宣称 per-handler override 已发布。
- **外部 Tool**：GitHub REST、MCP、HTTP/IPC、Agent CLI、Woodpecker 等是 Provider 侧的实现接口。推荐通过可替换的 Host Adapter 调用，但不得绕过 selected C/K 权限、幂等/UNKNOWN/Readback；调用 Provider SDK 也不是自动创建 Domain Tool。
- **Agent-facing Tool Adapter**：允许名单 + 输入验证 + identity/scope → Business Intent；不得直接透出任意 C、Host secrets、shell/sql。
- **外部业务事件**：GitHub Webhook/CI callback 先经 Host 身份验证、去重和来源读取，再转换为 B Intent 进入 K；不是 K Advisory Hook。

## 3. Workflow 的五种语义 + 编译边界

- Domain Process：领域目标、状态和不变量（B/Domain Data）。
- Workflow Definition：版本化 Trigger、Guard、Transition、Wait、Evidence、Recovery（B/Domain Data）。
- K Workflow Execution：唯一实例身份、CAS、Journal、Effect、Replay、UNKNOWN（K/Host）。
- UI Journey：动态表单和页面，是当前 Step 的投影，不决定领域业务状态。
- Agent/Skill/Tool Flow：只提出有界语义候选或业务请求，不能自行批准。

**不能因为 `S Feature kind:'workflow'`、`domain/workflows/**` 或 YAML 文件存在，就断言 V10 Loader 会执行任意流程。** 必须证明实际 `featureExport`、BUILD 选取、B Intent/transition 绑定和 clean-consumer 执行证据，否则保持静态 Domain Data 并通过现有 B/K 映射。

## 4. 两层进化、两条正交轴：目标 ≠ 已实现

历史来源：[v0.3 冻结设计](../product/DomainHarness_v0.3_PRD_FROZEN.md)、[v0.10.3 两层进化回溯 R0](../product/v0.10.3/TASK_META_EVOLUTION_R0.zh-CN.md)、[#1398](https://github.com/kaicreator-mm/domain-harness/issues/1398)。

- **两层职责**：一个 K 下的 Task/Business 实例使用已部署资产；Meta/Evolution Producer 在任务外处理获授权、脱敏证据并生成候选。不是两套并列 Runtime 或双 K。
- **轴 A 决策优先级**（历史设计，不自动等于 v0.10.3 物理可达）：`Rule/compiled knowledge → exact semantic reuse → applicable promoted subworkflow → bounded LLM`，最后仍需要 B/K 准入。
- **轴 B 知识成熟度**：`OBSERVED → CANDIDATE → VALIDATED/SHADOW → EXPLICIT PROMOTION → QUALIFIED BUILD → ACTIVATION → USAGE FEEDBACK`。
- Semantic Cache 不能替代 Journal Replay；Promotion 不能替代 BUILD pin；Activation 不能热切换运行中 occurrence。
- 对 Tally 下游而言，task-meta 私有 trace/DB、原始隐私数据不在通用进化 Producer 的默认读权限内；公开的 ADS/GitHub/CI/Host Evidence 需要原生 readback。

## 5. 自我对抗审查：验证“自己的建议”而不是重复结论

`SELF_REVIEW=YES`，独立评审 `NOT_RUN`。下列 P1/P2 指风险优先级，不是外部审计或已验证运行缺陷。

| ID | 风险 | 反例/失败模式 | 需要的证据 | 结论 |
|---|---|---|---|---|
| DH-AR01 P1 | 将三类概念统一当成同等已发布 Component family | 源码正式 `semantic|tool`，#1361 仍是前瞻设计，K Hook 另有契约 | Public BUILD/import ABI 与正反测试 | **纠偏：按契约层分类** |
| DH-AR02 P1 | “C 就是外部 Tool” | 纯本地 Tool handler、远程只读 API 和本地 Effect 都可能存在 | selected C/Host clean consumer，读写反例 | **纠偏：Operation、Transport、Effect 正交** |
| DH-AR03 P1 | “普通 helper export 即 Tool” | B/Package ABI 没有相应 C route | BUILD route negative、无效 operation typed reject | 保持私有函数和声明式路由 |
| DH-AR04 P1 | “Workflow 文件直接执行” | Domain Data 目录不自动装配 | selected Feature/BUILD 和真实 Workflow consumer | **NOT_PROVEN**；不能许诺通用 YAML runtime |
| DH-AR05 P1 | “V8 init 就是 V10 B init” | V10 已选择 S Feature/K Extension，B 现用 `getPolicy` | 对比 public ABI、lifecycle、failure/cleanup | **不得推断通用 B init** |
| DH-AR06 P1 | “Hook 对业务开放更方便” | 回调暗含第二状态机/未受许可写入 | 两个独立消费者 + K negative/replay/UNKNOWN | **DEFER**；先 B Intent/K Workflow |
| DH-AR07 P1 | “元数据层自动改变正在运行的 Package” | Candidate 自我晋升或发生 active-run 热替换 | Promotion/BUILD/Activation pin、反例 | **禁止** |
| DH-AR08 P1 | “Tag v0.10.3 = 所有消费者已升级” | Tally B `v08-business-abi/1`、Guided Intake 部署仍 pin v0.10.2 | Installed tarball exports / Host/BUILD / exact SHA | **NOT_PROVEN** |
| DH-AR09 P2 | “`public-v8` 带版本号就是 bug” | ABI 兼容层可能必须显式 version | public exports/consumer imports/迁移矩阵 | [#1467](https://github.com/kaicreator-mm/domain-harness/issues/1467) 仅研究 |
| DH-AR10 P1 | “一次 Tally 痛点 = 通用 SDK 缺陷” | B/Host wiring、私人 Trace、遗留 UI 都可能是应用问题 | 两个消费者或独立 clean-consumer minimal reproduction | **归属先审再建 SDK Task** |
| DH-AR11 P2 | “写了文档即已验证产品能力” | 静态文档与实际 Node24/Host/CI 不一致 | 实际命令/EXIT、CI URL、独立 Review | 标 `NOT_RUN`，不得冒充 PASS |
| DH-AR12 P1 | “业务事件无条件扩展”为 Hook | 自定义回调可绕过 K Permit、产生重放不确定性 | allowlisted intent mapping、K-owned dedupe、fault isolation | 优先现有 B/K 路径 |

### 5.1 反例测试清单（未来资格验证，不声称已运行）

1. **Missing selected module / operation**：拒绝未经 BUILD 选中/不存在的 C、S、Host route。
2. **Permitless external Effect**：实际 Provider dispatch 必须是 0，包括远程 Tool/CLI。
3. **Read vs Effect**：远程 GET 不等于写入；本地文件修改必须作为 Effect 处理。
4. **Lost ACK / idempotency**：先 readback 再重试，不把 UNKNOWN 转为 SUCCESS。
5. **Workflow no silent authority**：未经 Owner 批准的 Replan、经验 Promotion、业务事件订阅不得写 K State。
6. **Package init / dispose**：缺失依赖、坏返回 Schema、失败清理按确切受支持的 ABI 执行；不能注入凭据到数据 Context。
7. **Semantic reuse vs replay**：缓存失配/源版本变化必须 stale；相同 K Journal replay 不应再次调用 LLM。
8. **No hot swap**：新 BUILD 不能改变运行中 instance 的 package digest。
9. **Cross-consumer test**：至少 Tally + 另一个独立 Domain App（例如已有 Shun Assistant 真实下游反馈）验证通用性。
10. **CI**：语法预检先于 Woodpecker、真实 Windows Node >=24、exact-SHA Review、fail-closed。

## 6. DomainHarness Product 处置矩阵

| Concern | 已知归属 | 现在该做什么 | 升级通用 SDK 的门槛 |
|---|---|---|---|
| Domain Knowledge / Workflow 模型 | 下游 B + #1465/PR #1466 | 完善指导、提供真实 Domain App 源码/资产映射 | 公共 Feature/BUILD 不可达且 clean consumer 可复现 |
| C ↔ 外部 MCP/HTTP/CLI | C/Host + #1468 | 先验证现有 typed C/Host Adapter 足够 | 多消费者重复需要同一个缺失的 public seam |
| K Advisory Hook | K Extension / #1361 | 不扩大权限，维持严格建议/观察边界 | 已证实的通用内核咨询场景且不改变 K authority |
| Business Event Contract | #1468 的候选 | 使用既有 B Intent/K，收集两个独立案例 | 严格源/订阅/去重/Replay/UNKNOWN 模型通过 L2 |
| 生命周期 | V8/V10 各自 ABI + #1468 | 公共文档清晰区分，补 clean-consumer negative | 精确 B/Host 生命周期缺口被复现 |
| 版本化 API 名称 | #1467 | public vs internal compatibility matrix | 真正消费者痛点和不破坏兼容迁移方案 |
| 双层进化 | #1398 + #1465 | 先做资料/示例和受控候选资格闭环 | 证明历史机制当前 public ABI 不可达 |
| 下游真实经验 | #1392（汇总）/ #1465（详细） | 记录 exact tag/SHA、预期/实际、复现、分级、最终回读 | 真实 SDK bug/通用需求才新建源码 Task |

## 7. 与 Tally 的责任分界

- Tally [#276](https://github.com/kaicreator-mm/tally/issues/276) 负责 Engineering Domain Data、五个 Bounded Context 和八个有界业务 Workflow；不是 DomainHarness Runtime 的新增实现任务。
- Tally #273 Replan、#274 ADS v5 feedback、#275 Attempt/Telemetry 继续按 B/K/C/Host 权限实施，运行时细节需要 selected clean-consumer 与 Host 证据。
- 历史进化顺序与 Promotion/BUILD 分离由 DH 提供**参考与必要的通用机制**；Tally 负责具体工程经验和资格策略。
- 这份文档不修改 `v0.10.3`、不关闭 #1465/#1467/#1468/#1392，不替代现有 PR #1466 的原始四份 R0 文档，**不授权 Kernel/SDK 编码**。

### 7.1 对抗审查发现的反馈 ID 冲突

[DH #1465](https://github.com/kaicreator-mm/domain-harness/issues/1465) 中，Tally 使用过 `DPB-011..DPB-018`，而 xDownload 的另一条独立经验评论也使用 `DPB-011..DPB-014`。**原先声称的稳定 Lesson ID 事实上并不全局唯一。** 这是经验追踪协议缺口，而非 Kernel 缺陷。不要改写历史证据；从此采用 `DPB-TALLY-<序号>`、`DPB-XDOWNLOAD-<序号>`、`DPB-SHUN-<序号>` 等项目命名空间，并在 #1392 以原评论 URL + 新 ID 建立别名交叉引用。下游经验从“已记录”不应直接推导“可自动关联唯一知识资产”。

## 8. 本 R1 的验收状态
### 7.2 V8 Business ABI 命名与 V10 BUILD/Runtime 的关系

Tally 消费者使一个版本坐标歧义变得具体；但目前还不能称为 ABI 缺陷：

- DomainHarness v0.10.3 的 `packages/domain-harness/src/public-v8/contracts.ts` 将 `v08-business-abi/1` 列入 `V8_QUALIFIED_ABI`。
- Tally 的 selected producer 同时导入 `V10_TARGET_PROFILE` / `buildV10App()`，并选择 `ABI_VERSION='v08-business-abi/1'` 的 Business 模块。ABI 代际与 BUILD/Runtime Profile 是不同坐标。
- Tally 应用版本是 v2；DomainHarness 源码 tag 是 v0.10.3；不能从 ABI 前缀推断二者。不得机械重命名为 `v010-business-abi/1`。
- 专项命名/兼容策略调查已建立 [DH #1469](https://github.com/kaicreator-mm/domain-harness/issues/1469)，隶属于更广泛的 [#1467](https://github.com/kaicreator-mm/domain-harness/issues/1467)。最终可能是补充文档、增加兼容别名或规划未来迁移；在证据与 Product/L2 决策完成前保留现有 ABI。

### 7.3 Tally Business 源码清单：已证明与未证明的边界

在 Tally `version/v2@7ebb1cdd0a79fc82cc938e35f852a80dd8e15332`：

- `packages/tally-engineering-business/src/` 有 12 个 MJS 文件，约 2,654 行；根入口 `index.mjs` 为 1,646 行且没有 import，另外 11 个模块合计 1,008 行。
- Package exports 仅暴露 `.` → `./src/index.mjs`。虽然有 13 个独立测试文件，但 helper 的单元测试不能证明 sealed B 已通过 BUILD 导入或执行这些模块。
- README 仍描述单个 Task-readiness advisory Intent，而 `index.mjs` 已声明 10 个 Intent / 10 个 Effect 并导出多组 assess/project 函数。这是文档漂移，不代表十条路径都已接通。
- 拆分文件之前，必须建立跨 B、C、Host、UI、selected producer 的 source-to-call-site / BUILD-closure 映射；按真实职责和选中路由分类 helper。不能仅按行数拆分，也不能假设 BUILD 自动发现同目录文件。

这些是下游 Package 作者体验与实现边界问题，不是已证实的 DomainHarness 通用缺陷。详细证据见 [#1465](https://github.com/kaicreator-mm/domain-harness) 与 [Tally PR #277](https://github.com/kaicreator-mm/tally/pull/277)。


`SCOPE=DOCS_ONLY`；`SOURCE_STATIC_CROSSCHECK=DONE`；`SELF_ADVERSARIAL=DONE`；`INDEPENDENT_REVIEW=NOT_RUN`；`EXTERNAL_CLEAN_CONSUMER=NOT_RUN`；`NODE24_TEST=NOT_RUN`；`WOODPECKER=NOT_RUN`；`PRODUCT_L2_ADMISSION=NO`；`NEXT_RELEASE=UNASSIGNED`。

下一步请由不同审查者根据 **PR 当前 Exact HEAD** 审核 R0/R1 契约引用与后续改进归属；任何真实 SDK gap 先经独立 Task/范围冻结，不能以文档自动开始实施。
