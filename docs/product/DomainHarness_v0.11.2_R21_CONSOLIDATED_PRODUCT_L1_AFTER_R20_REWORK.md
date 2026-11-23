# DomainHarness 0.11.2 · R21 统一 Product/L1 候选（处理 R20 REWORK）

```ini
OUTPUT_LABEL=DH_V0112_R21_R20_REWORK_CONSOLIDATED_PRODUCT_L1_CORRECTION
REPO=kaicreator-mm/domain-harness
MASTER_ISSUE=#1563
VERSION_ISSUE=#1612
PRODUCT_PR=#1702
R20_REVIEW=REWORK_P0_0_P1_3_P2_2
R20_REVIEW_EXACT_HEAD=eca31549cde5f4d17470ea4cd35f8303fbfe35f1
DOCUMENT_AUTHORITY=SOLE_CONSOLIDATED_PRODUCT_L1_CANDIDATE
STATUS=REWORK_CANDIDATE_PENDING_SCOPED_INDEPENDENT_REVIEW_AND_OWNER_FREEZE
L2=NOT_STARTED
IMPLEMENTATION=ON_HOLD
CI=NOT_RUN_DOC_ONLY
```

> **权限边界：** 本文件是将 R8–R19 和 R20 的全部产品要求收敛后的**唯一当前 Product/L1 候选入口**；此前 R8–R19 文档作为推导与历史证据，**不得把旧版冲突 AC 与本文件并行当成必选交付门**。R20 的正式结论是 `REWORK`，本轮修订**不是**独立审核 PASS。下列具体产品能力及把 #1614 归入 #1612 的版本调整为 **RECOMMENDED_PENDING_OWNER**，在 Owner 明确选定并审查通过之前不能标注 Product/L1 FROZEN 或启动源码。现有 v0.11.1 的核心规范/Workflow API 仍保持权威。

## 1. 一句话产品目标

**生成期选定不可变领域知识、原生业务函数/Element 和两个复用现有 SDK 的 Workflow 角色，让 Domain App 在无 LLM 的情况下识别确定的结构化 Intent，作可解释的领域决定，并按已选策略选择是否请求用户批准后执行真实业务操作。** 不创建 Knowledge Runtime、动态 FunctionRef/Registry、领域统一输入输出 ABI、第二 Workflow Runtime 或中央 KDP Tool 分派；具体领域规则/业务接口由外部 Business Package 生成。

## 2. 当前 R19/R20 收敛后的领域模型

| 责任 | Product/L1 合同 |
|---|---|
| **Data Knowledge** | 随 Business Package 生成、硬编码为不可变 TS 对象/常量；可有业务定义的 Concept/Entity/Relation/Rule/Intent/Applicability/Source 信息，具体字段不要求通用 KnowledgeRef/schema。改变知识须生成/交付新版本；不可在当前实例以 SQLite CRUD 覆盖已冻结知识 |
| **Function Knowledge** | 直接读取 Data Knowledge 的原生 TS Module Function 或 Element 方法；返回实际业务类型，不强制 FunctionDescriptor、OperationId、DomainResult 或统一协议 |
| **Business Element** | TS 内聚 Class；包含知识、函数、代码及按需实例/闭包状态。多个方法需要共享同一内部状态时先封装为同一内聚拥有者；普通模块 helper 可仍为独立函数 |
| **实际业务 State** | 内部变量由业务自身维护且明确调用/会话/实例作用域；真正跨请求/跨进程/外部资源权威状态由 DB/Host 提供，不能让进程内变量冒充 CAS、外部提交记录或租户共享真实状态 |
| **Workflow** | 同一套现有 `WorkflowElement<Input,Output>`、`StandardWorkflowSession`、`XStateWorkflowElement`、`invokeOutcome/leaf`；Recognition 与 Handling 是业务职责，不是两种新运行时；输入输出领域类型由生成期确定 |

**Stateful/external** 可作为作者自选的代码注释/元数据描述，不是必须的双布尔通用 SDK 类型，不再要求四象限分类/统一 `stateAccess`。若需解释，分别说明：函数实例是否持有状态；是否访问真实外部资源；是否读写业务权威状态；这几项不互相推导。

### 不可变性与并发（R20 P2-1 修正）

- `as const` 只有 TS 类型效果，不自动保护运行时嵌套对象。生成期要明确所选深层冻结/复制/只读数据策略；**测试必须尝试从已公开引用/嵌套数组/嵌套对象修改知识**，确认不可观察变更且旧包再次决策同值，更新包才改变知识。
- 一个新实例/会话的内部局部状态不得泄漏给另一个；同时执行的不同租户/两个 Element 实例应无状态串扰。不将所有内部缓存误视为“持久业务状态”。
- 跨进程权威 State 的并发条件及持久一致性由真实 DB/Host/资源所有者实现，不能靠单进程锁/变量假装跨进程控制。

## 3. 两种 Workflow 与预算/Outcome（R20 P2-2 修正）

```text
User/Host request
    → Intent Recognition Workflow (Business recognizer/validator uses immutable Data Knowledge)
         ├─ definite, valid selected intent → static Business Handling Workflow
         └─ ambiguous/invalid/missing/unknown → ASK/REJECT/UNKNOWN; no Handler or Tool
    → Intent Handling Workflow (Business Function/Element; may read true State/Host)
         → decision and only if selected → optional approved/preauthorized Tool
         → WorkflowOutcome plus business-owned used evidence
```

- 两种角色复用已有 Standard Workflow；**不发布统一 `ValidatedIntent`、`DomainDecision`、`DomainResult`、FunctionDescriptor**。具体输入/输出/证据字段由业务生成期定义。
- 一个**连续的逻辑请求**采用共享的根执行预算（calls/steps/depth）；若 Recognition 消耗全部余量，Handling **不得再创建满额度独立 Session 绕过上限或触发 Host Effect**。真正独立的新业务根可有独立预算。
- 保留现有 `StandardWorkflowOutcome` 的 COMPLETE / ASK / WAIT / REJECT / UNKNOWN / FAILED；这不是强制所有业务返回同一个领域结构。普通 `invoke()` 返回值会包装 COMPLETE；如果业务返回非成功 Outcome，应显式映射并用 `invokeOutcome()/leaf()`。**每种非成功终态不得被嵌套成 COMPLETE.value**。实际使用的证据可由当前业务调用局部结果/记录携带，不强制在现有非成功 Outcome 新增字段。
- 对外部可能已经提交的异常/丢 ACK，负责提交的 Tool/Host 边界必须保留“实际完成未知”结果并向 Workflow 映射 UNKNOWN，不能把逃逸异常一律归 FAILED 且误认为没有动作。

## 4. 0.11.2 SDK 交付边界：一个明确的能力选择表（R20 P1-1 修正）

**下表是本轮单一推荐基线，供 Owner 直接裁定，并非已确认 L1 冻结。** 必选项不得被“只写两份业务常量+复用 0.11.1 Workflow”替代；不能在实现时按 R10/R11 的旧表暗中把全部查询产品也恢复为强制项。

| 能力 | R21 推荐状态 | 正确的必选产品行为与禁止项 |
|---|---|---|
| **通用有界静态数据查询** | **本版必选（推荐）** | **同一份真正新 SDK Standard Function/Element** 在两个完全不同领域的 Business 不可变数据上复用，能限定数量/排序、明确实际业务给定的适用性/来源过滤、缺失/冲突/越界，不把候选误认确定性真值；不引入独立 Knowledge Runtime 或固定领域 Schema。可由业务传入类型化选择/匹配函数，实际领域语义仍由 Business 定义 |
| **SQLite Database Element** | **本版必选（推荐）** | 在真正可变的业务数据、权威状态/尝试记录/索引上创建/打开、读/写、事务失败回滚、关闭重开、基本版本冲突；**不得用其热替换生成期 Data Knowledge** |
| **SQL Query Capability** | **本版必选（推荐）** | 参数化、有界 SQL 查询，区分只读查询与明确的业务写入，拒绝非可信动态 SQL 或任意未选表/资源；正确的生命周期与错误处理 |
| **JSON/YAML 标准 Reader** | **复用已有，不是本版重复实施** | 用于生成期素材读取或运行时选定业务输入；不因 0.11.2 再生成平行 Parser/Reader |
| **Expression Element** | **按能力选用／Owner 待裁定** | 现有 TS 规则函数本身有效；如本版明确选入，提供真实受限表达式执行及正反例。JSONata v0.10 仅供比较，不能直接照搬旧 Runtime 或伪报硬 Worker kill |
| **JSON-LD/FTS/Vector/Graph 查询** | **独立按需选用／Owner 待裁定** | 不作为静态 Data Knowledge 合法性的必备运行前置；若选入，每项必须有真实运行正反例（Context 禁止不可信远程获取、向量范围先过滤再 Top-K、图有界多跳/环路等）；不允许以“日后可扩展”虚报已交付 |
| **业务领域 Recognition/Rule/Decision** | **由外部 Business Package 生成/拥有** | SDK 不硬编码任何行业概念；识别/决策采用已选静态知识和业务原生函数，并通过真实共享 SDK 基础能力与 Workflow 完成可证伪的领域选择 |
| **Tool/Effect/State 组合** | **有条件纳入（推荐整体吸收 #1614）** | 如获 Owner 确认，则必须交付 Slice B 全部能力和真实 Host E2E；否则不在 0.11.2 偷做半套、旧 #1614 仍负责它们，不能两版本重复 |

**P1-1 完成条件：** Owner 确认必选与可选的精确选择（上述是作者推荐），所选 L1 验收范围应替代 R10/11 的旧 AC15–21“所有 Static Knowledge SQLite CRUD/全查询必选”。不能在两个文件中保留互斥的双“当前”合同。

## 5. 条件 Slice B：可信真实动作及前置排他提交（R20 P1-2 修正）

本章的实现归属随第 4 节/第 7 节 Owner 决策；**若 0.11.4 并入 0.11.2，此节全部是必选 L1 行为**，不能仅复制 Capability/Tool 类型而把 Effect、Journal 和并发安全排到之后。

```text
Selected, valid business intent
  → get current authoritative resource state/version
  → apply Data Knowledge + Business Guard/Rule and selected Tool policy
  → for USER_APPROVAL, validate scoped approval before any action
  → establish authoritative exclusive admission / conditional commit
      FOR (resource, expected version, mutually exclusive command)
  → reserve durable attempt + dedup identity + input digest
  → execute trusted, selected Tool/Host action (or resource-owner atomic conditional execution)
  → verify genuine ACK/Receipt/readback from source-of-truth
  → update Business projection only from proven result, with proper CAS
  → COMPLETE | REJECT | UNKNOWN | FAILED (no speculative COMPLETE)
```

**原 R16 的“外部动作之后才投影 CAS”不足以排除重复提交，现在明确替换为：** 对同一资源、同一期望版本的两条**不同命令 ID**互斥动作，权威资源最多接受一个实际 Effect。可信资源所有者可以用真正条件提交，或在执行前建立全局有效的排他准入并用正确 fencing/幂等维持；L2 选择具体方案。若资源不支持相应原子能力且无法保证此条件，**不得提交该类互斥 Effect**，按当前可靠事实拒绝/UNKNOWN，不做“先执行再事后 CAS 冲突”或单纯进程锁保证。

- Same `commandId` + same canonical input digest 再投递：仅返回已完成 disposition/原尝试读回或 UNKNOWN，不重新提交已知/未知动作；same ID + **不同摘要**：拒绝。Different commandId + same expected resource version：至多一个提交成功，另一项必须在动作前拒绝、等待或确认冲突，Host 侧真实计数可验证。
- 持久 attempt/journal/receipt 与实际资源状态一致性需以真实资源能证明的边界定义，不假设本地 SQLite transaction 与独立外部 Host 原子提交。提交后 lost ACK、断连或记录间中断：**UNKNOWN / 原 attempt 的可靠 readback**；不能据本地投影回滚声称外部操作未发生，也不能盲重试；不可恢复的未知保留为未知。
- 真实 Host 权限由 OS/DB/服务资源所有者执行，Workflow 负责选定调用和 Business Guard，不创建 KDP 中央 Permit/Tool Router，不从 Knowledge/LLM 文字提升实际资源能力。
- 本版负责最小同一命令幂等、提交事实、UNKNOWN 处理；**0.11.6** 仍负责跨进程完整 TaskRun checkpoint、pause/resume/cancel/deadline 和高级恢复流程。

## 6. 两种 Tool 确认策略及一次批准单次消费（R20 P1-3 修正）

- **PREAUTHORIZED**：可信业务在生成/部署期已选定 Tool 与使用策略，满足实际 Business Guard/资源权限后可直接调用，**无额外 DomainHarness 用户确认/KDP Permit**。系统/外部 Host 本身的真实资源鉴权仍有效。
- **USER_APPROVAL**：业务确实要求当前用户同意；通过 App/Host 最小可信确认回调验证实际主体/租户/资源/Operation/关键参数、摘要/过期、业务关键状态。用户批准不扩大 OS/DB/Host 权限。
- **PER_CALL = 一个批准覆盖至多一个逻辑命令 identity**（包括所有必要的重试/原命令 readback）。批准在动作准入时与 `commandId` 原子关联/消费；**同样主体/目标/参数的第二个新命令 ID 也必须请求新批准**。重复投递同一个命令只能返回原处置/原结果/UNKNOWN，不能用原批准触发第二个 Effect。
- **SESSION = 批准可覆盖多次新命令**，但必须在已同意的主体、租户、目标资源、操作种类、参数边界与明确有效期内；提交时仍检查当前 Business Guard、真实权限、资源版本及排他提交条件。撤回/过期/关键条件变化则不授权后续调用。
- 未确认返回 ASK/WAIT、用户明确拒绝返回 REJECT、已提交但未知返回 UNKNOWN。完整 UI/对话框/多轮确认由 **0.11.3**，跨进程持久等待由 **0.11.6**，本版只需要可工作的一次确认/结果接线（若 Slice B 入本版）。

## 7. v0.11.x 版本依赖裁决清单（仍待 Owner）

**推荐合并 #1614 Authorized Action 全量进入 #1612**，并在此内部按 Slice A(Static Knowledge/Recognition/Read-only) → Slice B(Authorized Handling/Effect) 两批独立评审；不额外创造两个运行时/另一个产品阶段。此建议沿用 Owner 在 R16 讨论中的方向，但没有把建议当成正式审批。

| 版本 | 若 Owner 采用合并，必须同步的正式范围 |
|---|---|
| 0.11.2 #1612 | 除 Slice A，包含全部原 #1614 最小 State/Guard/CAS、Tool/Host、真实 Effect/ACK/Readback、最小幂等/UNKNOWN、两种用户批准策略 |
| 0.11.3 #1613 | 复用已实现的 Recognition/Handling Workflow 与批准回调，增加自然语言、多轮澄清和多 UI 适配；**不是 0.11.2 动作的必需 UI 前置** |
| 0.11.4 #1614 | 原范围/AC 显式移交 #1612 并保持 Issue 为历史交付索引，**不重复实施**。是否为内部阶段号预留/重规划须由 Owner 明确 |
| 0.11.5 #1615 | 有界 LLM 消费 #1612 的选定知识与可信 Tool 能力；0.11.3 的交互按实际 App 需求组合，不要求旧 #1614 二次执行授权 |
| 0.11.6 #1616 | Durable TaskRun / checkpoint / pause/resume/cancel / 高级失联恢复；复用真实 Effect provider 已保存的 attempt/receipt，不再假设 `KDP` 自己记录全体 EffectJournal |
| 0.11.7–0.11.9 | Execution evidence、Client Experience、Server Evolution 依旧独立，不将运行学习/热改知识塞入 0.11.2 |

**Owner 需要正式选择：** (A) 本版 SDK 的推荐强制能力（静态有界 Query + SQLite + SQL）及 Expression/JSON-LD/FTS/Vector/Graph 的每项纳入与否；(B) 是否全量吸收原 #1614；(C) 0.11.4 预留/重规划方式。选择完成后需要更新唯一 Roadmap、#1563 和 #1612–#1616 的版本归属、原 #1614 AC1–AC3 映射并在 GitHub 留痕。**在此之前不把旧 #1614 的实施门设为已关闭。**

## 8. 新统一 L1 验收候选（替代历次并列 DI-AC01–60；全部 NOT_RUN）

| ID | 验收 Oracle |
|---|---|
| **DI-L1-01** | 两个不同领域在同一 SDK 中使用编译期不可变的 DataKnowledge 与真实 Native Function/Element，知识修订只在新 Package 改变决定，旧包输出保持一致；嵌套数据公开引用修改尝试无效果 |
| **DI-L1-02** | 内聚 Element 负责状态，两个并发请求/不同租户与 Element 实例状态不串扰；真正持久/跨进程状态从对应资源读取 |
| **DI-L1-03** | 同一真实新增 SDK 有界 Query 实现在两个不同领域的直接函数调用和 Workflow 调用中复用，限额/来源/范围/版本/时点/缺失/冲突均有正反例；既不能依赖未选动态知识 Registry，也不能仅重复 0.11.1 Reader |
| **DI-L1-04** | SQLite/SQL **若选入**：真正读写动态数据、关闭重开、参数查询、事务回滚、版本竞争/资源拒绝；任何查询都不能热修改旧 Business Package 的静态 Knowledge |
| **DI-L1-05** | 其它检索/表达式能力 **若选入**：每个选定 Function/Element 有真实跨域可用正反例和运行资源边界；未选明确 NOT_IMPLEMENTED 而非预留扩展假装 PASS |
| **DI-L1-06** | 同一业务根在 Intent Recognition + Handling 间共享预算，识别额度耗尽或失败时 Handling/Host 副作用计数为零；处理器静态选定且无未知名称动态加载；两角色业务 I/O 可不同 |
| **DI-L1-07** | 现有六态 Outcome 按真实业务语义保留，`invoke` 不把非成功包成 COMPLETE；同次决策保留真实使用的事实/规则/来源，未验证事实不能当确定真值 |
| **DI-L1-08** | **若 Slice B 并入本版**：预授权 Tool 实际零次用户询问，需批准 Tool 的 PER_CALL 仅对同一逻辑命令消费一次，SESSION 在明确范围内可多次，确认不足/过期/跨租户/变参不得 Effect |
| **DI-L1-09** | **若 Slice B 并入本版**：相同命令/摘要重复投递不重复 Effect，修改摘要同 ID 拒绝；不同 ID/同资源/同版本竞争时 Host **至多一次实际提交**；先具权威排他准入/条件提交，后触发不可逆动作 |
| **DI-L1-10** | **若 Slice B 并入本版**：真实 Host ACK、丢 ACK、读回失败、提交后本地记录失败/恢复、权限撤销、实际被拒绝；没有可靠事实只能 UNKNOWN，绝不乐观 COMPLETE 或无脑重新执行 |
| **DI-L1-11** | 外部 Node >=22.12 ESM 干净安装同一个正式 SDK 包，基于 **真实 Skill+公开 API/类型/TSDoc 与两份不同领域资料**生成两份 Business Package，包含一个新领域、正确 I/O/知识/Workflow/正反例，SDK 无领域代码变更/私有路径依赖 |
| **DI-L1-12** | 真实日志/可复核正反例/所用完整 Exact SHA，受影响范围验证及独立增量评审；只复用不变的 0.11.0/0.11.1 已接受证据，不以过去 CI 验收本提交 |

## 9. 状态、审核与正式冻结 Gate

- **R20 原结论**：`REWORK P0=0 P1=3 P2=2`，R21 按 P1-1、P1-2、P1-3、P2-1、P2-2 分别给出统一合同/修改路线，**不等于修复已被独立接受**。
- **本次修订**：仅 Product/L1 文件；原 R8–R19 仅保留历史推导/兼容说明，不再作为同级“最新必选目标”。
- **待 Owner**：审定第 4、7 节内的 SDK 能力和跨版本归属；将已选项按本文件编号写回正式 Roadmap / Issue。若未选 Tool/Effect 合并，DI-L1-08–10 转交 #1614，不能虚报 0.11.2 支持真实动作。
- **下一步**：R21 增量设计独立复审 → 处理剩余 P0/P1 → Owner 选定、更新统一版本文档并冻结 Product/L1 → L2（接口/运行时职责）独立审核 → 最小 Task DAG、真实 SDK-only Consumer、Exact-SHA QA/增量审核后才可解除实施暂停。
