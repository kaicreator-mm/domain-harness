# DomainHarness v0.11.1 — L2 R26：已合入源码的 Workflow 执行合同

> **HISTORICAL / SUPERSEDED BY Language-Native DomainHarness**：本文记录旧 Element-First/Lock/Pin/FunctionRef/Target/BUILD 设计及当时 Exact-SHA 审查，只供历史追溯；**不是当前 v0.11.1 SDK 的规范、API、安装方式或新功能准入证明**。
现行唯一规范见 [Canonical](../specs/domain-harness/README.md)。当前 Standard Reader、Workflow 与 KDP 以 [#1682](https://github.com/kaicreator-mm/domain-harness/issues/1682) 的新 SHA 源码与消费者验收为准；旧 R60/R74 的 CURRENT 仅对应其原时间点。


> **最终实现对齐候选，不代签 L2 Freeze。** 产品 WHAT 以 [L1 R26](../product/DomainHarness_v0.11.1_Task_Execution_PRD.md) 和 Issue #1605 F01–F10/AC11–AC20 为准。本文件按 `version/v0.11.x@639de32c98b8bbb40d34000d8c9b230be3759884` 的 **实际代码**复核早期 #1626/R17 文档；旧 #1607/#1611 和 R16“尚未实施”描述只作历史，不作为运行时合同。R17 已受审且仍成立的设计要求均按现有实现保留。

~~~ini
OUTPUT_LABEL=DH_V0111_R26_L2_IMPLEMENTED_SOURCE_ALIGNMENT
MASTER_ISSUE=#1563
PRODUCT_ISSUE=#1605
L2_ISSUE=#1608
SOURCE_TRAIN=version/v0.11.x@639de32c98b8bbb40d34000d8c9b230be3759884
T11=#1627_CLOSED
T12=#1628_CLOSED_R13_ACCEPT_SCOPED
T13=#1629_CLOSED_R4_ACCEPT_SCOPED
T14=#1630_CLOSED_R25_ACCEPT_SCOPED
T14_SOURCE_CI=WOODPECKER_2917_SUCCESS
QUALITY=#1637_MERGED_R24_ACCEPT_SCOPED_CI2911
SOURCE_CODE=IMPLEMENTED_AND_MERGED_IN_VERSION_TRAIN
L2_FREEZE=INDEPENDENT_VERSION_REVIEW_PENDING
MAIN_RELEASE=NO
~~~

## 1. 唯一引导、唯一 Init 和 Package 自治

- 0.11.0 基础：Boot → Core.Order=0 的 KDP → 各 Core 自行递归调用下一个 Core.Init；Package 自身调用已声明 Extension.Init；`init:ElementRef` 必需，`exit?:ElementRef` 与 `recordInitFrom?:true` 独立可选。相同 Package 可在一次激活中重复进入，Kernel 不强制去重。Exit 按实际已进入的逆向栈尝试；未声明 Exit 为 no-op。
- 0.11.1 不新建 Router/第二 App Init；**当前 Package.Init** 获得按其已选 `workflowRoots` 约束的 `workflows.start(ref,input)`，业务由 Package 自己启动并等待本次结果。正常链 **Package.Init → WorkflowRun → Element.Function**；Workflow COMPLETE 与 Package 的 READY/DEGRADED 等 AppStatus 是两个独立合同。
- 以上具体实现：`packages/microkernel/src/package-system.ts` 的 `runInit`、`packages/contracts/src/package-manifest.ts` 的 `DomainPackageManifest`、`packages/contracts/src/app-contracts.ts` 的 `PackageInitContext`。禁止恢复 `DomainApp.invoke`、旧 EntryRef 兼容或在 READY 后补跑业务。

## 2. 身份、Schema、选定边和单一 Lock

- `WorkflowRef={element:ElementRef,contentId}` 定位一个被选 Element 内的 `workflow-definition` ContentBlock，内容类型 `WorkflowDefinition(kind:'Workflow',schemaVersion:'dh.workflow/0.11',entryNodeId,nodes,maxElementCalls,maxDescendantWorkflowDepth)`。
- 单节点合法；节点只允许 `kind:'function'` 或 `kind:'workflow'`。Function 节点引用 `FunctionRef`，可以附 `WorkflowDataSource`、`start/end` Hook 及具名 Switch；子 Workflow 节点只引用已选 `WorkflowRef`。同一定义不同位点/多次运行实例应独立。
- `tooling/build/src/build.ts` 的唯一 BUILD 调用 `workflow-selection.ts` 的 `selectWorkflows()`：严格校验节点/子树/循环/深度、Reader ResourceRef 的字节摘要与可达性、FunctionRef/Target、Owner/Export、Package **直接** Extension 权限和确切 Imports。未知、私有、传递依赖或动态加载均 fail closed。绝不把权限发现延后到 Runtime。
- 同一 `DomainAppLock` 持有 `selectedWorkflows`、`selectedFunctions`、`selectedElements`、`resourceDigests`、每 Package `workflowRoots` 和 `trustedRuntimeIntegrity`。只生成一份确定性的组合 AppPackage，不建立第二 BUILD/Lock/KDP。
- 对外类型与 Schema 实现：`packages/contracts/src/workflow-contracts.ts`、`workflow-validate.ts`、`json-schemas.ts`、`app-lock.ts`。

## 3. 真实 Reader 数据与严格 JSON/YAML 语义

- Reader 是普通已选 Element.Function，**不是** Host 任意路径文件读取器。节点的 `data={format:'json'|'yaml',resource:ResourceRef,maxBytes}` 只能引用 BUILD 封存、授权的实际数据文件。
- KDP 使用摘要对应的封存只读资源句柄；`workflow-execution.ts::prepareDataInput` 从该资源取得 Uint8Array，检查 maxBytes，用 `new TextDecoder('utf-8',{fatal:true})` 严格解码。JSON 经 `JSON.parse`；YAML 经受信 `yaml.parseDocument`、YAML 1.2 core、`strict:true`、`uniqueKeys:true`、`toJS({maxAliasCount:32})` 及纯 JSON 值约束校验；数据不可变更权限身份。这里记录**实际参数 32**，不沿用旧 R17 草案中未实现的 `maxAliasCount:0` 主张。
- Reader Function 的**实际输入是** `{format,source,value}`，其中 `source` 为原始 UTF-8 字符串，`value` 是确定解析后的 JSON-compatible 值；不是旧草案只带 `{format,source}`。仍使用现有 Function Input/Output/Outcome 约束和 Node 已选权限，不重复引入新 Validator。
- 真实 E2E 验证两个 JSON Data Element 共用一个 JsonReader FunctionRef，两个 YAML Data Element 共用一个 YamlReader；真实数据字节变化会影响值且篡改被 Boot/KDP 拒绝。来源：`examples/basic-domain-app/workflow-fixture.mjs` 与 `consumer.mjs`；T14 R25 独立接受。

## 4. Workflow XState 运行与结果语义

- `packages/microkernel/src/workflow-run.ts` 使用真实 XState v5 `createActor/fromPromise/waitFor`，每根和子 Workflow 独立 Actor；`workflow-execution.ts` 执行已选节点，子 Actor 共享根 RunBudget 引用，KDP 不重复调用 Package.Init。
- `FunctionOutcome` 是 `SUCCEEDED/UNKNOWN/FAILED`；Workflow 的终态是 `COMPLETE/REJECT/ASK/WAIT/UNKNOWN/FAILED`。SUCCEEDED 且 `value.route` 是非空字符串时使用该精确标签，否则 `SUCCEEDED`；UNKNOWN/FAILED 用各自标签。Switch 每个 label 唯一，目标是具体后继 Node 或终态；没有标签优先级列表。未匹配成功路线拒绝为 `DH_WORKFLOW_ROUTE_UNMATCHED`，失败绝不洗白为 COMPLETE。
- `ASK/WAIT` 只结束本次有界运行，**不**承诺 durable Resume/恢复持久执行。Business Core.Init 自行解释结果并返回 AppStatus，KDP 只在无法继续的错误时做最小脱敏日志、实际逆序 Exit。
- 每个普通 Function leaf 在执行前按 `1 + start?1 + end?1` 预约共享根调用预算；不足时**任何 Hook/业务 Function 均不执行**。start 一旦尝试，end 在 finally 最多尝试一次且 await。子树中所有节点、Reader/Guard/Hook 真实 Function 调用均消耗同一根预算；每个活动祖先的 `maxDescendantWorkflowDepth` 均须满足。
- 0.11.1 的 ElementRun.end 不触发 Package.Exit，Package.InitFrom 仍为选择性记录；业务数据与异常详情不被 Kernel 当作通用日志泄露。

## 5. 已核准第三方安装信任边界

- 真实执行依赖已核准的 `xstate@5.33.2` 与 `yaml@2.9.1`，**不是**旧 R17 草案所称必须全打进 first-party 字节的方案。实际交付通过同一 BUILD/Lock `trustedRuntimeIntegrity` 固定两个 archive SHA-512 SRI，复用 npm 原生完整性验证与安装时禁用 Hook；绝不默许业务 Package 添加未审第三方依赖。
- BUILD 封存 `dh-install/install-runtime.mjs`、`verify-preinstall.mjs`、`verify-runtime.mjs`、安装清单、`.npmrc(ignore-scripts=true)`。受支持顺序：`npm install --package-lock-only --ignore-scripts`（仅生成元数据）→ 已批准版本/SRI/依赖闭包/Registry 来源核验 → `npm ci --ignore-scripts` → postinstall verifier → Boot/Pin。验收不假设其它任意安装脚本路径也同样可信。
- 公网解析地址要求 HTTPS；显式配置并与同源匹配的本地 Docker/loopback HTTP Registry 可受限通过，**SRI 不放宽**。已知非阻断 P2：Node URL 的 `[::1]` hostname 与白名单 `::1` 不符，仅导致意图支持的 IPv6 loopback **误拒绝**；留作限定后续纠正，绝不能扩大 HTTP 来源白名单。来源：T12 R13 审核。
- 必须经 Node≥22.12.0，静态 ESM 构建安全拒绝保持有效；T14 #2916 曾正确拒绝动态成员访问，使用 `Map.get` 修复、#2917 SUCCESS，未放松 BUILD 规则。

## 6. 版本交付、测试复用与资格边界

| 范围 | 源码/集成 | 可复用的审核和运行证据 |
|---|---|---|
| 0.11.0 Element-First Foundation | #1625 merged | 独立 R3 ACCEPT_SCOPED、Woodpecker #2857 |
| T11 Workflow 合同 | #1631 merged；Issue #1627 closed | T11 已接受的增量审核 |
| T12 BUILD/Lock/可信安装 | #1632 merged；Issue #1628 closed | R13 ACCEPT_SCOPED P0/P1=0；#2908 SUCCESS |
| T13 KDP/XState | #1639 merged；Issue #1629 closed | 原 T13 R4 ACCEPT_SCOPED；同 SHA #2910 SUCCESS |
| T14 real E2E + AC11–AC20 | #1640 merged；Issue #1630 closed | R25 ACCEPT_SCOPED P0/P1/P2=0；#2917 SUCCESS |
| 代码质量 | #1636、#1637 merged | AST 非阻断提示、R24 ACCEPT_SCOPED、#2911 SUCCESS |

**当前阶段**：上述功能代码都已经合入唯一版本列车 `version/v0.11.x`，T14 最新 squash merge HEAD 为 `639de32c98b8bbb40d34000d8c9b230be3759884`。各单项 Exact-SHA 独审不能自动代签**集成后 Product/L1 与 L2 的版本级 Freeze**，本文只作真实现状与设计/源码一致性收尾候选；不合并到 main、不发布 0.11.1 Release、不要求不相关 CI 重跑。

**版本外**：旧 v0.10.x 兼容、0.11.4 Host/Effect、0.11.5 LLM、0.11.6 Durable Resume、Experience & Evolution 均不在 0.11.1。本版没有第二 BUILD/Lock/Kernel 或第二业务 Init。
