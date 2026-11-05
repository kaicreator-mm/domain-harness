# Domain Package 函数可见性与 Tool 调用边界（R0 参考）

[English](DOMAIN_PACKAGE_FUNCTION_TOOL_BOUNDARIES_R0.en.md) · [跟踪 Issue #1465](https://github.com/kaicreator-mm/domain-harness/issues/1465)

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

> **状态：** Post-v0.10.3 架构实施参考，R0 / 待评审，不是冻结 L2、正式 ABI 或源码实施授权。领域知识与 Workflow 资产分类、提取和执行边界见配套文档 [DOMAIN_PACKAGE_KNOWLEDGE_AND_WORKFLOW_R0.zh-CN.md](DOMAIN_PACKAGE_KNOWLEDGE_AND_WORKFLOW_R0.zh-CN.md)。本文档提交为文档提案，不修改 Runtime、Kernel、SDK 或 v0.10.3 发布产物。下一版本归属保持 **UNASSIGNED**，须另行 Product/L2 决策。

## 1. 目的与核心原则

本文档把 Domain Package 中“函数是否公开、谁能调用、是否属于 Tool、如何经过 K/Host、是否有副作用”分开定义，避免把普通 JavaScript export、Business Intent、Capability Operation、Host Port 和 Agent Tool 混为一谈。

**核心原则：Tool 身份来自显式的 Capability Operation 声明、BUILD 选择和受控路由，而不是函数复杂度、函数名或 JavaScript export。**

DomainHarness 应提供通用机制；具体业务规则仍由相应 Domain Package 拥有。Tally 的 Replan、ADS Feedback、Task Attempt 是本设计的下游案例，不是 DomainHarness 内置业务功能。

## 2. 术语：不要把“函数”“Operation”“Tool”当作同义词

| 概念 | 含义 | 是否自动成为 Tool |
|---|---|---|
| JavaScript function/export | 语言层函数或模块导出 | 否 |
| Private helper | 模块内部实现函数 | 否 |
| Package ABI export | 被 Package ABI 明确约定的入口 | 否 |
| S Standard Feature entry | BUILD 选中的标准语义/Workflow Feature 入口 | 否，默认是非 Tool |
| Business Intent | 由业务应用提交给 K 的业务意图 | 否；它是业务命令边界 |
| K Query / Subscription | 通过 Microkernel Facade 读取快照或订阅事件 | 否 |
| C Capability Operation | 明确声明的 `operationId → handler` | 是 Domain App 选中的能力操作；不自动成为 Agent-facing Tool |
| Host Port / Host function | Host 提供的可信物理设施或 Provider 适配端口 | 否，不是 Agent Tool |
| Agent-facing Tool | 面向 Agent/模型的可选外层工具协议 | 是外层接口，但必须映射到受限 Business Intent |

“Public”也必须带边界限定。建议使用 **module-private、package-ABI-public、selected-capability-operation、host-only、agent-facing**，不要只写含义不明的 public function。

## 3. 函数可见性与归属分类

| 类别 | 归属 | 可见性 | 允许调用者 | 典型内容 |
|---|---|---|---|---|
| Private Function | S/B/C 模块 | 模块私有，不 export | 当前模块 | 校验、排序、diff、归一化、脱敏、摘要 |
| Package ABI Entry | K/S/B/C Package | 仅公开契约声明的入口 | BUILD/Runtime/明确的 Package Consumer | `getPolicy()`、模块身份与声明入口 |
| S Feature Entry | S Feature | 被选择的 Feature export | Domain App 按已选 Feature 机制 | 语义判断、规则解释、Context 组合 |
| Business Intent | B + K | 业务命令契约 | UI/Host/Agent Adapter 经 Host 提交 | `proposeReplan`、`approveFeedback` |
| K Facade | Microkernel | 公开 SDK Facade | 应用 Host/受信调用方 | `send`、`query`、`subscribe`、`stop` |
| Capability Operation | C | BUILD 选中并路由的 Operation | K 通过 Capability Resource Port | `github.issue.read`、`ads.feedback.publish` |
| Host Port | Host | Host 内部可信接口 | Host 装配、K/受控 C Adapter | CAS、凭据、Provider client、物理存储 |
| Agent-facing Tool Adapter | 应用/Agent Adapter | 独立、白名单化的 Agent Tool Schema | Agent Runtime | 将 `replan.propose` 映射为 Business Intent |

### 3.1 Private Function

例如：

```js
function validateSourceSha(sha) {}
function calculateTaskDiff(previous, proposed) {}
function detectDagCycle(nodes, edges) {}
function redactPrivateData(payload) {}
function calculateEvidenceDigest(evidence) {}
```

约束：

- 默认不 export、不声明 operation、不进入 BUILD route。
- 不需要 K Permit。
- 不访问 Provider、Host Credential 或物理 Store。
- 尽量保持确定性、可测试、无副作用。
- 不因 Agent “可能会用到”就把 helper 升格成 Tool。

### 3.2 Package ABI Entry

Package 对外只暴露契约规定的入口和数据类型。以 v0.10.3 Business Authoring 示例为例，`getPolicy()` 是 Business ABI entry；它不是 Agent Tool，也不意味着其中的任意函数都可被外部调用。

Package ABI 应明确版本、入口、导出路径、输入/输出 Schema、模块身份、依赖与兼容性。不要把整个 `src/**` 当作隐式公共 API。


**不同版本坐标必须分开记录。** Package ABI 标识（例如 `v08-business-abi/1`）不等于 DomainHarness SDK Git tag/semver、Domain App 版本、BUILD Target Profile、Runtime ABI 或 Host ABI。Tally v2 已展示 V10 producer（`V10_TARGET_PROFILE` / `buildV10App()`）可以选择声明 V8 Qualified Package ABI 的 Business 模块。不得为了匹配 SDK 发布号或 BUILD 代际而机械重命名 ABI。V8 Business ABI 的具体命名/兼容策略调查见 [DomainHarness #1469](https://github.com/kaicreator-mm/domain-harness/issues/1469)，并关联 [#1467](https://github.com/kaicreator-mm/domain-harness/issues/1467)。

### 3.3 S Standard Feature（默认非 Tool）

S Feature 是显式选择的标准语义能力，例如 Rule/Workflow/Context/Decision Feature。它可以有被 BUILD/Runtime 调用的 Feature Entry，但不会因为有 export 就自动成为外部 Tool。

若确实需要将某项 S 能力暴露给 Agent，必须另行定义 Agent-facing Adapter 和权限契约；不能把 S Feature export 直接当作可任意调用的 Tool。

### 3.4 Business Intent（业务命令，不等于 Tool）

Business Intent 描述“业务方希望发生什么”，例如：

- `proposeReplan`
- `approveReplan`
- `approveFeedback`


调用应进入选中的 Domain App / K Workflow，由 K 负责 Admission、身份、幂等、状态和 Effect 治理。Intent 的名字不是 Capability Operation，也不授予 Provider 权限。

### 3.5 K Query / Subscription（受控观察面）

通过 Microkernel 公共 Facade 的 `query()` 获取授权快照，通过 `subscribe()` 接收受控事件。它们不是通用 GitHub/SQL Tool，也不意味着调用方可以扫描内部 Journal、读取 SQLite 表或绕过 K 的可见性规则。

如需历史观察能力，应先确认现有公开 Query/Subscription/Host seam 是否足够；只有真实消费者证明通用缺口后，才提出最小只读公共接口。

**v0.10.3 精确调用边界补充（来自 Shun Assistant 实际集成）：**

- K Facade 的 send() 走 sealed intent route、preflightIntentRouting() 和 K submitOccurrence()；queryAuthority 只参与 query() / subscribe() 的快照与事件授权，不参与 send()。因此绝不能把 queryAuthority 当作 Business Intent / send() 的访问控制器。
- Host-global / 跨 Case Business Intent 应使用 BUILD 选中的明确 Intent route；Host 先校验其签发的一次性 requestRef，并由可信 Gateway 限定入口。K 继续负责 Admission、Journal、Effect Permit 和 UNKNOWN。不要借用当前 Guided Case 作为全局 Provider 的授权来源。
- K Query / Subscription 仍只代表 K 管理的快照和事件。Domain-owned 的跨 Case Host 数据查询可以建模为只读 Business read intent，经 send() → B → externalEffect:false 的 read-only C → Host read port；这不是 K Snapshot Query，也不是任意 SQL Tool。


### 3.6 C Capability Operation（Domain App 能力操作）

C Operation 需要同时满足：

1. C Module 被 BUILD 显式选中。
2. 模块声明 Capability 身份和明确的 `operationId → handler`。
3. Business/Workflow route 与 Operation/Handler 匹配。
4. 输入输出符合有界 Schema。
5. 运行时只能经由 K 管理的 Capability Resource Port 到达 Handler。
6. 外部副作用经过 K 的 Effect Permit 和对应治理检查。

示意：

```js
// C module: declared operation handler
export function readIssue(input) {
  // bounded read-only provider adapter
}
```

函数被 export 本身不构成 Tool；真正的 Tool 身份来自 Capability declaration + BUILD selection + route + K-controlled invocation。

### 3.7 Host Port / Host Function

Host 负责物理 CAS/DocStore、凭据、Provider client、运行时资源和受信装配。Host 函数不是默认公开给 B、浏览器或 Agent 的 Tool。

- 凭据只能留在可信 Host。
- B 不得 import 任意 Provider SDK 或读取 Host secrets。
- C 通过受控注入的 Resource/Host seam 使用 Provider。
- UI 不得直接访问物理 Store、Journal 或 Provider Credential。
- Host 提供物理能力，不独立裁定业务审批、Task Admission 或 Release 资格。

### 3.8 Agent-facing Tool Adapter

如 Agent 需要 Tool 接口，应增加独立的外层 Adapter：

```text
Agent Tool request
  -> validate tool schema and actor scope
  -> map to allowlisted Business Intent
  -> trusted Host boundary
  -> selected K Facade.send(intent)
  -> K Admission / Workflow / Effect governance
```

Agent Tool 不应直接暴露任意 C Operation 或 Host Port。模型输出只能形成提议/输入，不能铸造 K Permit、授予权限或自行激活业务状态。

## 4. 调用方式矩阵

| 调用方式 | 适用对象 | 典型入口 | 是否经过 K | 是否是 Tool |
|---|---|---|---|---|
| Direct local call | Private helper / 纯计算 | 普通函数调用 | 否 | 否 |
| Selected Feature invocation | S Feature | 已选 Feature Entry | 按 Feature 运行契约 | 否 |
| Business Intent | 业务命令 | Facade `send(intent)` | 是 | 否 |
| Snapshot Query | K 管理的状态读取 | Facade `query()` | 是 | 否 |
| Event Subscription | K 管理的事件观察 | Facade `subscribe()` | 是 | 否 |
| Capability Operation | 外部能力 | K effect handler 使用 `resources.call(capabilityId, operationId, payload)` | 是 | 是 |
| Host Port invocation | 物理设施/Provider 适配 | Host 注入的受信 Port | 由调用路径决定；不得绕过 K 治理 | 否 |
| Agent-facing Tool | 外部 Agent 协议 | 独立 Tool Adapter | 必须映射到 K/Intent 治理 | 是外层 Tool |

## 5. 只读与外部副作用必须分开

在 v0.10.3 ABI 中，`externalEffect` 是 **C Module 级别**的分类，不是单个 Handler 的可覆盖属性。因此：

| C Module | 示例 | 分类 | 调用要求 |
|---|---|---|---|
| GitHub Read | Issue/PR/Review readback | `externalEffect: false` | K 管理的只读 Resource Call |
| GitHub Effect | Issue/comment/dependency write | `externalEffect: true` | K Effect Permit |
| ADS Read | 已发布报告读取 | `externalEffect: false` | 只读 |
| ADS Publisher | Feedback 发布 | `externalEffect: true` | K Effect Permit |
| Agent Status | Runtime/Attempt 状态读取 | `externalEffect: false` | 只读 |
| Agent Dispatch | 启动/取消执行 | `externalEffect: true` | K Effect Permit |
| CI Status | Build 状态读取 | `externalEffect: false` | 只读 |
| CI Trigger | 触发 Build | `externalEffect: true` | K Effect Permit |

**不要把只读和写入 Handler 混在同一个 C Module 中，期待 per-handler Permit override。** 若实际契约未来改变，必须以新版本公开 ABI 和真实测试为准。

外部写入还必须定义 Scope、幂等键、超时/UNKNOWN、ACK 丢失恢复、权威 Readback 和证据 Receipt。HTTP ACK、Agent 自报或 Schema-valid payload 都不能单独证明外部事实已落地。

## 6. 哪些功能通常不应 Tool 化

以下通常应为普通函数或 K Facade 调用：

- 输入校验、JSON Schema 验证、类型归一化。
- DAG 拓扑排序、环检测、Task Diff、Replan Candidate 计算。
- Evidence/Feedback 投影、脱敏、Digest。
- Attempt 时间线归一化、Telemetry coverage 统计。
- UI 表单联动、页面格式化、前端状态派生。
- 业务策略判断（由 B 负责；授权由 K 负责）。
- K Snapshot Query 和 Event Subscription。

判断标准不是函数复杂度，而是它是否跨越模块/信任边界、访问外部 Provider、需要独立权限或产生受控副作用。

禁止以“方便 Agent 调用”为由引入 ambient-authority Tool，例如：

```text
github.api(method, url, body)
shell.execute(command)
sql.query(sql)
agent.run(arbitraryPrompt)
woodpecker.execute(anything)
```

应使用有界、可审计的 Operation，例如 `github.issue.read`、`ads.feedback.publish`、`agent.task.dispatch`、`woodpecker.build.read`，并明确读写模块与权限。

## 7. Tool / Function 契约最小清单

每一个 Package ABI Entry、Business Intent、Capability Operation、Host Port 和 Agent-facing Tool 都应记录适合其类别的字段：

| 字段 | 要求 |
|---|---|
| Stable ID | 唯一且稳定的 Function/Intent/Operation ID |
| Owner | K / S / B / C / Host / UI / Agent Adapter |
| Visibility | Module-private / Package ABI / Selected Capability / Host-only / Agent-facing |
| Invocation | Direct / Feature / Intent / Query / Subscribe / Resource Call / Host Port |
| Input / Output | 有界 Schema、版本和拒绝语义 |
| Side Effect | None / Read / External Write |
| Authorization | 无 / K Admission / K Effect Permit / Host policy |
| Scope | Repository / Project / Version / Task / Attempt / resource |
| Idempotency | Key、重复请求和 replay 语义 |
| Timeout / Recovery | Deadline、UNKNOWN、lost ACK、readback |
| Evidence | Receipt、source identity、exact SHA、authoritative readback |
| Privacy | Secret、private trace、prompt、customer data 的禁止透传规则 |

Private helper 不必逐个注册成公共 API，但应由模块测试覆盖；公共边界必须有显式清单和正反例。

## 8. 下游案例（非 DomainHarness 内置业务）

以下仅用于验证架构边界：

| 下游任务 | 普通函数 / B | K | C / Host |
|---|---|---|---|
| Tally #273 Governed Replan | 校验、Diff、环检测、候选生成、保留 Accepted Work | 审批后 Admission/CAS/Append-only revision | 读取原生 Task/DAG；按授权写入和 Readback |
| Tally #274 ADS Feedback | Projection、脱敏、Schema/资格校验、Identity | Human Decision、Effect Permit、Replay/UNKNOWN | ADS Read 与 Feedback Publisher 分离 |
| Tally #275 Attempt Read Model | Attempt 投影、状态归一化、Coverage 计算 | 公开 Query/Subscription 和既有受控持久化 | ADS/CI/Agent 状态只读适配；不直接读 SQLite |

### 8.1 必须先验证、不能直接认定为 SDK Gap 的事项

- Replan Candidate 计算是业务计算；候选激活和外部写入是不同边界。
- Feedback 生成/脱敏是本地业务逻辑；Publisher 与 Readback 是分离的 C Operation。
- Attempt Read Model 应优先组合公开 K Query/Subscription 与已发布外部证据。
- 不得因需要历史 Attempt 就直接扫描 SQLite 或私有 Journal。
- 当前公开 API 是否缺少某种只读历史观察能力，必须用精确 v0.10.3 安装包、公开导出和最小 clean-consumer 复现证明。
- Tally 的 ADS Schema、Replan 规则、Attempt 状态和遥测口径仍属于 Tally Engineering Domain Package。


### 8.2 Shun Assistant v0.3.0 R03C（真实下游实施案例）

基线：DomainHarness immutable v0.10.3 tag / source SHA `061376f4a023070f215f9feffad5c24d96d503cb`；Shun integration baseline `be2e81722a70ee3d0bd5634bc83d97d733c20b78`。

已完成并通过对应 Exact-SHA Woodpecker 的下游 Host 任务：

| Shun 任务 | Exact delivery SHA | CI | 已证明的行为 |
|---|---|---|---|
| #285 Meta Consent / SQLite | `542066dbe3330f716f2fa466b21cadf3c8dc0808` | Push #219 / PR #220 SUCCESS | 持久 declaration_seq；撤销/重新 opt-in 不恢复历史经验；跨 Case 查询快照一致 |
| #287 Provider Host-global | `2f4ca411e21f62e1cb9df0659cb8d4c137256825` | Push #221 / PR #222 SUCCESS | requestRef-only Host ledger；原始 stdout/stderr 不进入返回 envelope 或 SQLite；Preview/Receipt 闭世界 Schema |
| #289 Signed privilege contract | `593140928caf5a797abb89d799799fc54796a3aa` | Push #201 / PR #203 SUCCESS | requiredPrivilege 纳入签名描述符；省略值默认为 USER；ELEVATED 仅允许签名 CLI |

这些是消费者端的实现/CI 证据，不是 Windows 真实 UAC/Provider 安装验证，也不代表 Shun R03C 生产集成已完成或 DomainHarness SDK 有缺陷。

#### 可复用的实现经验

1. **send 与 queryAuthority 分离：** v0.10.3 queryAuthority 只控制 K Query/Subscription，不控制 send()。Shun #288 的初始 Provider-global 方案曾误把 queryAuthority 当作 send() 的 B 路由 ACL；已由 Owner 修订为 Host requestRef + BUILD-selected Business Intent route。
2. **Host-global Provider：** Host prepare/confirm 产生并消费一次性 requestRef；K payload 仅含 requestRef。Provider privilege 必须来自 curator-signed requiredPrivilege，不能由 Host config 覆盖。
3. **Meta 读写分离：** Feedback 写入与共享经验查询使用不同 C Module；查询 C 必须 externalEffect:false。跨 Case 业务查询通过明确的只读 Business read intent 进入同一 K，再访问只读 Host port；不使用通用 K Query、直连 SQLite 或 SQL Tool。
4. **查询契约与 Store 一致：** #285 当前查询契约为 targetCaseRef、capabilityId、可选 taskClass、bounded limit；#288 原提案中的 tags 过滤没有对应 Store 接口，必须删去或另行扩展并验证，不能由 Integrator 猜测。
5. **Consent 当前性：** revision 是 opaque identifier，不是可排序时间。#285 曾出现 consent-rev-2 opt-in 被 consent-rev-10 opt-out 的字典序错误；修复为事务化持久 declaration_seq，并由所有写/授权/查询路径共用当前 Consent selector。
6. **Host 输出隐私：** Provider-controlled stdout/stderr 不得返回或持久化；仅保留严格解析的 version token 和有限 canary enum。Preview、elevatedAction、durable receipt 均采用 exact-key/allowlist Schema，并对 SQLite decode 做同样校验。
7. **Package ABI 收敛：** Shun 的 public @shun/domain-app root 曾同时导出 trusted gateway 和旧 composeDomainBuild；后者包含旧版结构镜像与 placeholder K/S bytes，不是生产路径。Shun #303 正在将其限制为 internal/test-preview，仅生产链使用 composeTrustedRuntimeBuild + 真实 public v0.10.3 buildV10App/activateV10App。
8. **打包来源证明：** Shun clean consumer 使用本地 SDK tarballs 与 SHA256SUMS；源码 tag/SHA 与包内 package.json 版本必须分开记录。v0.10.3 Git source SHA 不应仅凭 package.json 的 0.10.2-rc.0 字段判断。打包消费者测试不等同于真实 Windows Host/UAC 验证。

Shun 的跟踪入口：[#280](https://github.com/kaicreator-mm/shun-assistant/issues/280)、[#285](https://github.com/kaicreator-mm/shun-assistant/issues/285)、[#287](https://github.com/kaicreator-mm/shun-assistant/issues/287)、[#288](https://github.com/kaicreator-mm/shun-assistant/issues/288)、[#289](https://github.com/kaicreator-mm/shun-assistant/issues/289)、[#303](https://github.com/kaicreator-mm/shun-assistant/issues/303)；PR [#300](https://github.com/kaicreator-mm/shun-assistant/pull/300)、[#301](https://github.com/kaicreator-mm/shun-assistant/pull/301)、[#302](https://github.com/kaicreator-mm/shun-assistant/pull/302)。


## 8.2 xDownload v0.2：真实 SDK PoC 与生产包分层经验

本节是下游真实实现案例，不是 SDK 缺陷清单，也不追溯改变 v0.10.3 ABI。

**证据基线：** DomainHarness v0.10.3@061376f4a023070f215f9feffad5c24d96d503cb（Tree 099cdc831aef63befd62aaede7e7a853d1be468f）。xDownload #183 使用 Node 24.21.0 从该 Git tag 构建并打包 4 个公开 SDK 包；独立复核确认 4/4 Tarball SHA256 与 tag 重新打包字节一致，矩阵 17/17 通过，结论 DOMAIN_APP_POC=PASS、SDK_GAP=NO。该证据只覆盖限定 clean-consumer / K / C / Host PoC，不证明完整安装旅程、旧 Core 迁移等价或多进程 SQLite CAS。当前下游源码观察为 xDownload WIP 9e3ccd382311619e60b8d2a7373e8a7d34733334。见 [#183](https://github.com/kaicreator-mm/xDownload/issues/183)、[PoC PR #199](https://github.com/kaicreator-mm/xDownload/pull/199) 和 [SDK pack evidence](https://github.com/kaicreator-mm/xDownload/blob/experiment/ads-v418-poc/experiments/domain-app-download/evidence/e01-sdk-pack/PACK_EVIDENCE.md)。

### 正向模式：K 控制面与下载数据面分离

xDownload 以 confirmDownload Business Intent 进入 SDK buildV10App / load；acquisition.acquire 是 BUILD 选中的 effect C Operation。HTTP 获取、targetRef 解析、预算、摘要校验和原子文件物化由可信 Host Bridge 执行。K 管理 Admission、Effect Journal、Permit、Replay 和 UNKNOWN；下载字节不经过 K。无 Permit 时 Host 必须零网络/文件副作用，UI/Agent 不直接调用 Provider。公开打包消费者测试与 Monorepo 测试属于不同证据类别。

### 已确认的下游问题：App / Host 依赖环

当前 xDownload 包存在双向依赖：download-domain-app 依赖 download-domain-host，Host 又依赖 App。App 的 composition/runtime.ts 导入 DirectAcquisitionBridge / CanonicalBudgetLedger 并实现物理 FileCasDocStore；integrations/s4-hls-vod.ts 导入 Host HLS bridge；App 根导出暴露 FileCasDocStore、assembleDownloadRuntime 等 Host/运行时装配入口；Host 又从 App 深层源码导入校验器和类型。

这是下游 Package/Host wiring 问题，不是 SDK 缺陷。目标依赖方向：

| Package | 责任与依赖 |
|---|---|
| domain-contracts | 中立稳定的跨层 DTO / 业务契约 |
| download-domain-app | K/S/B/C 声明、Intent、Schema；依赖中立契约与公开 SDK，不依赖 Host |
| download-domain-host | C Handler、CAS、Provider/物理 Port；依赖中立契约，不依赖 App 深层源码 |
| core-runtime | 唯一生产组合根；组合 App、Host、SDK，负责 BUILD、Host 注入、K load 和 Seam |
| CLI/Desktop/Browser | 通过 Core Seam 使用能力，不直接调用 App 内部或 Host 物理设施 |

App 不得导入 Host 实现；Host 不得依赖 App 深层路径；共享契约仅在确属共享时放入 domain-contracts。物理 V10DocStore/CAS 属于 Host。assembleDownloadRuntime、assembleS4HlsRuntime 属于 Core/Host 组合层；独立 K Fixture 放入测试 Fixture，不从 App 根包导出。保持单一生产 K/业务 Writer。

### 持久化与权威边界

不同日志可以共存，但必须明确事实所有权，不能混称为重复数据库：

| 机制 | 正确职责 | 不应承担 |
|---|---|---|
| K V10DocStore、Effect Journal、Effect Permit | K Admission/Effect 权威与 Replay | 任意 UI/Transport 投影 |
| FileBackedSeamJournal | Core Seam 命令传输幂等/重放 | 下载业务终态或 K Permit 权威 |
| FileBackedDomainAppRouteLog | Core CLAIM/ATTEMPT/OUTCOME 与产品 Job Projection | 第二套 K Journal/Effect 状态机 |
| T09 LineageLedger | old-core/new-k 所有权分区、迁移准入、UNKNOWN 处置 | 复制 K Effect Journal/完整下载生命周期 |

必须核实 RouteLog.CLAIM 与 T09 LineageLedger 在生产路径中的实际使用，再指定唯一权威 Owner；不得让两个系统分别批准同一 Lineage。由 K Receipt 派生的 OUTCOME 应明确为可重建读模型，K Effect Journal 仍是 K 效果状态权威。无法证明的崩溃中执行保持 UNKNOWN，重试前做权威读回。T09 LineageLedger 的 old-core/new-k 所有权策略属于 Domain App；其 PlainFileLineageStore 文件 I/O 实现属于 Host。只迁移物理 Store Adapter，保留领域策略和窄 LineageStore Port，不要把整个 LineageLedger 搬进 Host。\n\nFileCasDocStore 目前只声称单进程安全；未验证的多进程 SQLite CAS 必须标记 NOT_PROVEN。

### Query / Subscription 与产品 Projection

当前 CLI Facade 将 query() 映射到 Core Seam READ_JOB_PROJECTION；subscribe() 因当前 Seam 无订阅帧而 typed-refuse。Core Job Projection 由路由事实和 K Receipt 构造。这是下游产品适配边界，不代表 SDK K Query/Subscription 已被该 Facade 使用，也不证明 SDK 缺少通用 API。产品 Projection 可以继续通过 Core Seam 暴露，但必须标明来源、UNKNOWN 规则和与 K Journal 的关系。订阅不支持时明确拒绝，不伪造事件，不扫描私有 SQLite/Journal 代替公开 Query。只有多个 clean-consumer 证明相同观察能力缺口后，才提出公共 SDK API。

### 分类与处置

| Lesson | 分类 | 结论 |
|---|---|---|
| Node24 packed SDK + K/C/Host PoC | 正向模式 | SDK_GAP=NO；复用 v0.10.3 |
| App↔Host 依赖环、Host 装配暴露在 App | 下游架构/Host wiring | 下游重构，不创建 SDK API |
| K Store、Seam Journal、Route Log、T09 Ledger | 权威边界/读模型待收敛 | 核实生产调用图与恢复，不盲目合并 |
| Core Projection 与 K Query/Subscription | 下游适配/文档边界 | 明确命名，不推断 SDK 缺陷 |

这些经验已同步至 [#1465](https://github.com/kaicreator-mm/domain-harness/issues/1465)，并通过 [#1392](https://github.com/kaicreator-mm/domain-harness/issues/1392) 保留为下游反馈。它们不改变 v0.10.3、不自动分配下一版本，也不授权 SDK 实施。

## 9. 实施验证要求

在新增/修改公共机制前，至少完成：

1. **Contract inventory：** 列出 Package ABI、S Feature、Business Intent、K Query/Subscription、C Operation、Host Port、Agent Tool Adapter。
2. **BUILD proof：** 证明只有被选择的模块、操作和路由可执行；错误/缺失路由 typed-refuse。
3. **Private boundary proof：** 普通 helper 不会被自动注册或暴露。
4. **Read/effect separation：** 只读 C 不需要外部 Effect Permit；Effect C 缺少/过期 Permit 时 Provider dispatch 次数为零。
5. **Positive/negative consumer proof：** 用公开打包产物和干净外部 Consumer 验证，而非仅从 Monorepo 源码 import。
6. **Recovery proof：** lost ACK、重复请求、STALE source、UNKNOWN outcome 有可验证的 readback/reconciliation。
7. **Security proof：** Browser/Agent/B 不能直接取得 Host secrets、任意 Provider、SQL 或 Shell 权限。
8. **Evidence：** 记录 exact tag/SHA、Node/Host 模式、命令、真实 EXIT、CI URL、失败 ID 和独立 Review。

v0.10.3 可复用的真实参考是 [Package Authoring Example](https://github.com/kaicreator-mm/domain-harness/tree/v0.10.3/examples/v0102-package-authoring)，它已演示 Private B helper、Business `getPolicy()`、独立 read-only/effect C Modules、显式 Operation 路由、许可调用和 permitless zero-dispatch negative。参考示例不能替代新版本的 exact-SHA 外部消费者验收。

## 10. 实施经验与教训的持续记录

本文件定义设计边界；**真实经验记录以 [Issue #1465](https://github.com/kaicreator-mm/domain-harness/issues/1465) 为活动跟踪入口**。每次出现重要经验时，在该 Issue 追加带稳定 Lesson ID 的评论，或为独立可复用问题创建一个子 Issue 并关联回去。

每条经验至少记录：日期、下游项目/Issue/PR、DomainHarness exact tag/SHA、Node/Host、选中 K/S/B/C 与 BUILD route、最小复现、Expected/Actual、真实命令与 EXIT（未执行写 `NOT_RUN`）、分类、确认的根因或 `UNKNOWN`、临时 workaround、处置决定、修复 Exact SHA 和验证证据。

分类必须区分：Consumer misuse、文档/集成摩擦、Host wiring、BUILD/ABI 契约缺口、SDK defect、可复用 Product feature、CI/OS 环境问题和正向成功模式。**一个下游案例不自动证明通用 SDK 缺陷。**

不得上传凭据、私有 task-meta 数据、原始 Trace、隐藏测试、客户数据或未经授权的私有项目内容；不得添加自动遥测/后台上报。每个真正的 SDK 改动仍须独立完成 Product/L2/Task DAG、写集、CAS 准入、Review、CI 和 Release Gate。

---

## 参考来源

- [DomainHarness v0.10.3 immutable tag](https://github.com/kaicreator-mm/domain-harness/tree/v0.10.3) — `061376f4a023070f215f9feffad5c24d96d503cb`
- [v0.10.3 Package Authoring Example](https://github.com/kaicreator-mm/domain-harness/tree/v0.10.3/examples/v0102-package-authoring)
- [Business Capability Tool guide](../guides/V0102_BUSINESS_CAPABILITY_TOOL.md)
- [Package Authoring guide](../guides/V0102_PACKAGE_AUTHORING.md)
- [SDK feedback process](../feedback/SDK_USAGE_FEEDBACK.md)
- [Issue triage and continuous improvement](../feedback/ISSUE_TRIAGE_PROTOCOL.md)
- [Tally #273](https://github.com/kaicreator-mm/tally/issues/273) · [#274](https://github.com/kaicreator-mm/tally/issues/274) · [#275](https://github.com/kaicreator-mm/tally/issues/275)
- [Tracking Issue #1465](https://github.com/kaicreator-mm/domain-harness/issues/1465)
