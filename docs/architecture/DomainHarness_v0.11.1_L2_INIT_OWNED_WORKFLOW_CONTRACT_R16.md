<!-- DH_V0111_R17_P2_EXACT_T11_T12_DECISIONS_20261121 -->
## 【R17 · R16 审核四项 P2 的可执行合同与实施归属】

```ini
OUTPUT_LABEL=DH_V0111_R17_R16_P2_EXACT_DISPOSITION
SOURCE_BASE=version/v0.11.x@3bbeb0edaba3cbac762371e4b2632defa4255308
CURRENT_L1_L2_PR=#1626
HISTORICAL_PRS=#1607_AND_#1611_DO_NOT_MERGE
INDEPENDENT_REVIEW=#6005190842_ACCEPT_SCOPED_P0_0_P1_0_P2_4
TASKS=T11_#1627;T12_#1628;T13_#1629;T14_#1630
T11_SOURCE_BRANCH=feature/v0111-t11-workflow-contract-r1
STATUS=CONTRACT_SELECTION_NOT_FUNCTIONAL_PASS
```

**P2-01（文档入口修正）**：本 R17 当前 L1/L2 PR 是 **#1626**，不沿用旧的 #1607/#1611 `L1_PR` / `L2_PR` 指针。后两者为历史 Draft，禁止从其过期代码基线创建 T11–T14。

**P2-02（starter、Reader 资源传输；T11 固定契约，T12/T13 接线）**：
- `WorkflowRef = {element:ElementRef,contentId:string}`，精确选中 Element 所有者的一个 `workflow-definition` ContentBlock。唯一正式业务入口仍是 Package.Init；T13 在已有 `PackageInitContext` 中注入只读 `workflows:ReadonlyWorkflowStarter`，签名 `start(ref:WorkflowRef,input:JsonValue):Promise<WorkflowOutcome>`；按当前 Package 的**自身或直接声明 Extension+公开**的已选 Workflow 授权。无全局可见 Map、无 READY 后第二入口、无用户指定任意 FunctionRef bypass。
- 可读数据附于 **普通 Function 节点**：`WorkflowDataSource = {format:'json'|'yaml',resource:ResourceRef,maxBytes:1..1048576}`。节点的 `function:FunctionRef` 是被选 Reader Element；同一 FunctionRef 允许被多个不同数据节点复用。T12 逐项验证 ResourceRef 属于当前已选 Package/直接 Extension 的授权且字节 digest/路径/大小确定，Lock 钉住这份原始 UTF-8 数据。不强制 `ElementDefinition` 或一般 ContentBlock.ref 支持 YAML。
- T13 的执行器以最小**已选节点资源句柄** `ReadonlyResourceHandle.read()` 或 BUILD 生成、摘要等价的预编译数据投影得到原始 UTF-8 字节，强制严格 UTF-8（不接受替换编码/格式推断）和 maxBytes 后，向该 Reader Function 的**已有** `ReadonlyFunctionHandle.invoke` 提交纯 JSON `WorkflowReaderInput = {format,source}`。此通道不存在任意 Host path、fs、network 或未声明资源放权；T12 必须封存可证明的节点资源权限表，T13 只按这张表取资源。Reader 输出是普通 `FunctionOutcome`，用其已存在 Schema/Outcome 机器合同校验，不添加第二个验证器。

**P2-03（严格路由与 Hook 预算；T11/T13）**：
- `WorkflowDefinition` 版本 `dh.workflow/0.11`，包含 `entryNodeId`、非空 `nodes[]`、`maxElementCalls`、`maxDescendantWorkflowDepth`。`WorkflowFunctionNode` 为普通 Element.Function；`WorkflowChildNode` 仅引用 WorkflowRef，子 Workflow Actor 是唯一被支持的嵌套类型。所有节点必须可达，每个节点拥有 `switch.exits:[{label,target:{nodeId}|{terminal}}]`，标签在同一 Switch 内唯一，不能按列表顺序形成优先级。
- Function `SUCCEEDED` 且 `value.route` 为合法字符串时用该**显式标签**，否则无 route 字段用 `SUCCEEDED` 标签；`UNKNOWN`→`UNKNOWN`，`FAILED`→`FAILED`；子 Workflow 用其真实 `COMPLETE/REJECT/ASK/WAIT/UNKNOWN/FAILED` 状态作为 label。**显式 route 值非法、无匹配的 SUCCEEDED 或 COMPLETE 标签**必须 `FAILED(DH_WORKFLOW_ROUTE_UNMATCHED)`，不允许回退到成功。UNKNOWN/FAILED/ASK/WAIT/REJECT 如果没有出口则向上原样传播失败/非完成终态（保留 reason），不得被默认晋升 COMPLETE；不允许这些非成功标签的**直接 terminal COMPLETE**。恢复要经过一个实际执行、能产生新证据的节点。
- 元素业务 Hook 最多 `start` 和 `end`。进入一个 Function leaf **之前**，根预算预留 `1 + start?1 + end?1` 次调用，预算不足直接拒绝且不得执行 start/业务；包括 Guard/Reader 的 Function 节点一样计数。start 一旦尝试，**end 应在 finally 中至多尝试一次并 await**，即使 start/leaf 失败；end 失败只能保留/升级为 FAILED，不能覆盖原先失败为 COMPLETE。根 WorkflowRun 共享实际调用预算；每个 Workflow 的相对子树深度在进入下一 child 前检查所有 active ancestors；根/子业务结束都不会触发 Package.Exit。
- `ASK/WAIT` 仅本次有限业务终态，不是 durable checkpoint。Business Core.Init 仍需自行返回 `AppInitResult(READY/DEGRADED/BLOCKED/FAILED)`，KDP 不把 Workflow COMPLETE 直接当 READY。测试应含：最后一个 leaf 容量不足以涵盖 end→**在 start 前拒绝**；错误 Hook/标签/UNKNOWN 不能升格成功。

**P2-04（YAML/XState 可信闭包；T12）**：
- **固定选项**：使用成熟 XState v5 `createActor/fromPromise/toPromise` 语义和 `yaml` v2 的 `parseDocument`，**仅在开发 BUILD 阶段按确定的 package-lock/版本/完整性核验引入，并将所需 ESM 可执行代码捆绑为已检查、带摘要的 first-party microkernel/Reader Package 安装文件**。最终组合 App 不允许以新业务 Package npm 依赖、动态运行时 import、未验证 transitive 依赖或 npm install hook 来获取这些实现。真实实现依赖版本/许可通知/字节 SHA 在 T12 精确冻结，未核对之前不得写“已受信”。
- YAML Reader：仅单文档 UTF-8、JSON-compatible 值；`parseDocument` 使用 YAML 1.2 core、`uniqueKeys:true`、`customTags:[]`，`toJS({maxAliasCount:0})` 并由源码 AST/节点检查拒绝所有 alias、非标准 Tag、非字符串 Map key、非有限数值以及超额 nesting/节点数量；拒绝不确定跨文件 include、脚本 Tag、外部 Host 读取。其解析结果仍经过 Reader Function 的声明 Schema 输出验证。JSON Reader 只 JSON.parse + 类型/深度限制。两个 Reader 都不能读取超过数据定义 `maxBytes<=1MiB` 的选定资源。
- T12 必须用已有 `tooling/build/src/app-package.ts` / `static-package-guard.ts` 的原有闭包体系验证打包，拒绝无选定 npm 代码；不能仅“npm install yaml/xstate”就宣称安全/验收完成。

参考官方接口：[Stately XState v5 actors](https://stately.ai/docs/xstate/v5/actors) 与 [eemeli/yaml parser options](https://github.com/eemeli/yaml/blob/main/docs/03_options.md)；以真实 T12 版本与本仓库 build 约束为准，不推定当前 v0.11.0 运行包已经具备它们。

**P2 总体状态**：R16 独审是 `ACCEPT_SCOPED`，以上已定接口与执行边界仍须 T11/T12 Typecheck/Tests/E2E 和 Exact HEAD 审核才能认定为真实实现，不能凭文档签发最终 L1/L2 Freeze。B0 #1624 已完成的基础机制不重改。

---

<!-- DH_V0111_R16_SOURCE_BINDING_AND_TASK_HANDOFF_20261121 -->
## R16 · 已合并 Foundation 的实际接口与 T11–T14 接线规则（优先于旧 R10 历史说明）

```ini
SOURCE_TRAIN=version/v0.11.x@3bbeb0edaba3cbac762371e4b2632defa4255308
B0_ISSUE=#1624_CLOSED
B0_PR=#1625_MERGED
REVIEW=R3_ACCEPT_SCOPED_P0_0_P1_0_P2_0
CI=WOODPECKER_2857_SUCCESS
BASE_ELEMENT_INIT=ElementRef
BASE_SELECTED_FUNCTION=FunctionRef
BASE_RUNTIME_IMPLEMENTATION=ImplementationLocator
BASE_PRE_READY_FUNCTION=SUPPORTED
BASE_DIRECT_INGRESS=REMOVED
V0111_WORKFLOW=NEW_NOT_IMPLEMENTED
```

### T11 — 合同增量（不改原有 Element 根类型）

- **现存基础**：`DomainPackageManifest.init:ElementRef`、`exit?:ElementRef`，`DomainAppLock.SelectedPackage.initFunction/exitFunction`，`selectedFunctions[].implementation:ImplementationLocator`；`AppInitContext.functions:ReadonlyMap<string,ReadonlyFunctionHandle>` 中的 Function 在 Init 阶段已可调用。旧 L2 中 `init:EntryRef`、`AppRef===null` 导致 NOT_READY 的陈述一律失效。
- **Workflow 身份**：一个既有 ElementDefinition 内的 `ContentBlock(contentKind='workflow-definition')` 提供版本化机器内容，`schemaRef` 选择内容 Schema；节点引用实际 ElementRef/FunctionRef，而不是随意模块导出。相同 ElementDefinition 允许多个 Workflow node 位点复用，单次 WorkflowRun 内每个位点有独立运行身份。
- **最低完整内容**：每个 Workflow 必须有至少一个 Node、唯一入口节点、节点 ID 去重、所有可达边存在、终态封闭；`type?` 缺省 `workflow`（唯一许可的子嵌套种类）。Function 节点指向准确 FunctionRef；子 Workflow 节点指向准确 Workflow Element/Content；Switch 从单一确定标签到唯一后继节点或明确终态（无优先级竞争、无默认悄然成功）。
- **业务 Outcome**：保留既有 Function 的机器合同 `SUCCEEDED/UNKNOWN/FAILED`；Workflow 层明确 `COMPLETE/REJECT/ASK/WAIT/UNKNOWN/FAILED`、业务 Guard/Selector 的 route label，以及两层结果的显式转换责任；**不增加业务结果自动到 AppStatus 的映射**。Package.Init 返回 READY/DEGRADED/BLOCKED/FAILED 仍由该 Package 负责。
- **预算与 Hook**：业务 ElementRun 的可选 `start/end`、根业务实际 Element Function 调用次数（包括 Guard/Reader/Hook 的真实 Function 调用）和每个 Workflow 自己声明的相对子树深度，均属此版。启动/退出 Package Init/Exit 与 Core InitFrom 绝不计入业务 Workflow 预算。

### T12 — 同一 BUILD 的静态选定与 JSON/YAML 数据资源

- 当前 `build.ts` 的 `selectedFunctions` 来源为 Init/Exit、Hook、Imports 和已导出公共 Function；**必须为 Workflow 内容中的非公共但在 owner 内合法的节点/Reader/Guard Function 明确增加选定和所属 Owner/直接 Extension 证明**，不能把未选 Function 丢给 Runtime 按名称动态找。
- 同一 BUILD 解析 Workflow 节点/出口/Hook、版本和 digest、selected Target implementation、直接 Extension 声明、元素权限及允许的具体 ResourceRef，填充现有唯一 Lock 和完整组合包；无第二 BUILD、Lock、Runner Package 装载树。
- **YAML 陷阱**：当前 `build.ts.validateBlockContent` 对非 `document` 的 `ContentBlock.ref` 使用 `JSON.parse`，原始 YAML 的 `structured-data.ref` 会 BUILD 拒绝。T12 需要**明确 format=JSON/YAML 的 Reader 业务数据合同**：推荐由结构化 JSON 元数据声明 `format` 和独立封存的原始 `ResourceRef`，BUILD 审查该资源确属选定 Package/直接 Extension、封存实际 UTF-8 字节并验证 Reader/Schema/大小和安全规则，交由被选 Reader Element 解析。也可采用语义等价的已验证扩展，但不得对全部 ContentBlock.ref 取消 JSON 校验或给 Reader 任意 fs/network。
- 当前 `ReadonlyFunctionHandle.invoke(input)` 只传 input，不自动给 Reader 资源句柄；T12/T13 必须明确 Reader 的**节点级只读资源句柄或 BUILD 预编译数据投影**，保证实际 Reader 拿到被封存的真实 JSON/YAML 文件字节，而不偷偷从 Host 读路径。
- 当前 `composeAppPackage` 拒绝自由 npm Package 安装依赖；XState v5 作为唯一受信 microkernel 运行依赖应可复现、版本钉住且纳入最终包可信闭包；YAML parser 必须是受检选定 Reader 代码或审定的受信依赖，不能靠运行时 npm/network 动态补装。Node >=22.12.0。

### T13 — 单一 KDP 运行时的 WorkflowRun

- 在 `PackageSystem.runInit` 给 **每个 Package** 装配独立 `PackageInitContext` 时追加只对合法已选 Workflow 可见的启动句柄（准确命名/类型由本 L2 实施时确定）；由 **当前 Package.init Function 自己**调用，不能让 KDP 从 READY 后另起 Init 或直接外部 ingress。
- 启动句柄只可访问该 Package 自身或**直接声明 Extension 已公开**的 Workflow/Function/Reader/资源；所有代码映射 BUILD 已静态封存。Workflow Actor/子 Actor 属已有唯一 KDP 中的一个私有执行器，不能接管 `coreOrder`、创建另一个 Kernel 或重复 `Package.Init`。
- 单节点流程也合法。Switch 必须按业务 Function/Guard 的已选具名出口转移；ASK/WAIT 本版为有界任务结束类型，不能要求 0.11.6 才实现的 durable resume。ElementRun.end 的异步完成先于节点结果传播，但不能触发 Package.Exit。
- 业务异常由 Element/Package 显式处理，真正未处理异常交 KDP 最小日志/逆序 Exit。**基础 KDP `invokeSelectedFunction` 现有输入/输出 Schema 与 Outcome 验证属于选定机器合同边界，0.11.1 不得复制一套 Validator、悄然将 UNKNOWN/FAILED 洗为 COMPLETE**。若发生“基础机器合同检验也不应由 KDP 负责”的 Owner 明确语义裁决，归 0.11.0 修正，绝非 0.11.1 兼容层。

### T14 — 实际 clean-packed E2E 质量门

- 证明无旧 ingress 的 `Boot→KDP(Core.Order 0)→Package.Init(ElementRef)→WorkflowRun→Element.Function` 真实路径；不使用脚本直接模拟调用 KDP 内部函数绕过 Boot/安装 Pin。
- 成功：单节点、两节点+子 Workflow、同定义多节点位点多实例、至少两个 JSON 数据 Element 共用 JsonReader + 两个 YAML 数据 Element 共用 YamlReader；真实文件内容影响结果，具名 Switch 每类出口、业务 start/end、Budget/祖先相对深度边界、无 Exit/InitFrom 和二者启用的组合。
- 失败：错误或漏选 Workflow/FunctionRef、无效出口/Node/非法嵌套、跨包未声明 Extension、未授权 Reader 数据资源、YAML 不安全别名/自定义 Tag、未受信 XState/npm 依赖、循环/预算耗尽、UNKNOWN/FAILED 不能冒充成功；业务 Workflow end 不可执行 Package.Exit。
- 0.11.0 已接受且未改变的 Core.Order/直接 Extension/B0/Boot Pin 不重新全量验证；只验新增或受影响的接口，采用 Exact HEAD 独立审核。本 R16 **不是** L1/L2 Freeze、真实源码交付或新 CI PASS。

<!-- /DH_V0111_R16_SOURCE_BINDING_AND_TASK_HANDOFF_20261121 -->

# DomainHarness v0.11.1 — L2 R16：统一 Package.Init 内启动 Workflow

> **设计状态：** 基于真正合并的 0.11.0 B0 Foundation 的 R16 技术候选；旧 R9/R10/R11 中的 `EntryRef`、READY 前 Function 不能调用、#1621 Draft 等说法已被 #1625 源码修正取代。本文件只规定 0.11.1 新增 Workflow/Task Execution 合同，不重新定义 0.11.0 基础。尚未独立 Review/Freeze、未实施 T11–T14。

```ini
OUTPUT_LABEL=DH_V0111_L2_R16_MERGED_B0_INIT_OWNED_WORKFLOW
REPO=kaicreator-mm/domain-harness
L1=#1605
L2=#1608
V0110_FOUNDATION_PR=#1625_MERGED
V0110_TRAIN=3bbeb0edaba3cbac762371e4b2632defa4255308
INIT=PACKAGE_EXISTING_INIT_ELEMENT_STARTS_OWN_SELECTED_WORKFLOW
SECOND_APP_INIT_OR_READY_ROUTER=FORBIDDEN
TECHNICAL_INIT_DISPOSE=REPLACED_BY_V0110_NEW_SPEC
CORE_ORDER=V0110_ONLY_NO_NEW_V0111_SCHEDULER
EXIT=OPTIONAL_PER_PACKAGE
INIT_FROM=OPTIONAL_PER_PACKAGE
BUSINESS_FLOW=INIT_TO_WORKFLOW_TO_FUNCTION
NESTING=WORKFLOW_DEFINITION_CONTENT_SINGLE_NODE_ALLOWED
READER=JSON_YAML
ROUTING=EXPLICIT_SWITCH_EXITS
BUSINESS_HOOKS=START_END
CALL_BUDGET=SHARED_ROOT_RUN
DEPTH_LIMIT=PER_WORKFLOW_RELATIVE_SUBTREE_BOUND
BUSINESS_ERROR_OWNER=ELEMENT_OR_PACKAGE
FATAL_BACKSTOP=KDP_MINIMAL_EXIT
SCHEMA=USE_V0110_CONTENTBLOCK_SCHEMAREF_NO_NEW_ROOT_NESTING_FIELD
STATUS=L2_DESIGN_CANDIDATE_NOT_FROZEN
```

## 1. 分层职责——唯一 Init，不增加第二次初始化

### 0.11.0 的启动基础，不在 0.11.1 重新实现

```text
Boot
  └─ KDP Core.Init (Order=0)
     ├─ own directly declared Extension.Init recursively
     └─ next Core.Init (by BUILD-selected Core.Order)
           ├─ own directly declared Extension.Init recursively
           └─ ... until last Core.Init
```

- 每个 Package 的统一 Init Element 是**初始化入口，也是它选择/调用业务 Workflow 的地方**。如果 Package 声明了需要启动的业务 Workflow，Init Element 按选定合同在自己 Init 执行期间**发起该 Workflow**；不在 Boot 后增加 `businessAppInit` 第二轮、`technicalInit`、READY 后的 Init Router。
- **启动时机**：Init Element 本身通过 BUILD 已封存的启动链被调用，Init 内部依自己的业务需求/已选入口启动相应 Workflow，并对本次执行结果、异常及返回时机负责；如需等待确定性 Workflow 本次运行结果，则 await 本次返回；本版 WAIT/ASK 属有界终局而非持久运行，不能无界阻塞 Core 链。哪一种业务 Workflow 必须在 Init 中执行，由 Package 自己定义并交给 BUILD 封存，不由 KDP 启动一个默认全局 Main Workflow。
- Core.Order（KDP=0、Order 唯一）以及“本层 Extension 先行、随后下一个 Core”、`Init` 重入及共享依赖如何初始化、Core 系统链接边、唯一 BUILD 和退出顺序**全属 0.11.0 的规则**。0.11.1 的 Workflow State Machine 不是初始化调度器；不重新定义、排序或重复启动 Core。
- 不把 Package.Init 与 Workflow 形式上的 ElementRun.start Hook 同一化：Package.Init 选择/发起 Workflow；**业务 Workflow 及其 ElementRun** 可以有自己的 start/end 两个可选 Hook。启动链里的 Package.Init 不因工作流业务结束就自动执行 Package.Exit。
- **正常业务主链为 `Package.Init → Workflow → Element.Function`**。Workflow Node 通过 BUILD 绑定到被选 Element 的可调用 Function；嵌套 Workflow Node 启动一个子 WorkflowRun。**没有规定每个 Function 必须经过另一个对外直接 ingress 或每次再次调用 Package.Init**。旧 Stage0 `DomainApp.invoke(ingressId)` 已被 0.11.0 B0 正式移除，不是本版要求恢复的业务入口。可存在 Package 内部普通 Function 调用，但不改变标准业务主链。
- 对 Init 的必需 Package 依赖调用、跨 Package Reader/Guard/Function 的直接引用，只能通过当前 Package 明确声明的 **直接 Extension**，且目标导出可访问；传递闭包不授权。Core 之间只有 0.11.0 BUILD 封存的系统链接边例外。BUILD 验证源码及最终生成代码的调用边，禁止无法证明的动态跨包调用。
- 一个 Package 不需要 Workflow 时，其 Init 可以只是完成自身初始化，不强制产生单节点空业务 Workflow；但是**若定义了要执行的 Workflow，则必须从该 Package 的 Init 内启动**。

### Package.Exit 与 InitFrom 分别是可选能力

- `Package.Exit` **可选**，未定义即 no-op，不强制 Package 产生空 Exit Element。
- `Package.InitFrom` **可选**，由 Package 自己决定是否实现/使用；选用时按实际直接调用进入顺序记录来源、重复、失败及激活隔离。未启用时不存在必备的数组/回填要求，不因此 BUILD 失败。
- KDP 为在正常退出/未处理致命异常/部分初始化失败期间**对已声明 Exit 的 Package 做实际逆序退出尝试**，可保留最小化的真实 Init 进入技术记录；这是 KDP 退出机制的一部分，**不是强制每个 Package 暴露 InitFrom**。
- Package.Init 被共享依赖调用多次时，是否每次做实际初始化由 Package 自己决定；Kernel 不强制 once、dedup、应用级幂等。Package.Exit 与 InitFrom 既不是 ElementRun.end，也不计入业务 Workflow 的调用/深度预算。

## 2. Element 与 Schema 选择——复用 0.11.0 的 ContentBlock 机制

- 最新 [Element Contracts](https://github.com/kaicreator-mm/domain-harness/blob/version/v0.11.x/packages/contracts/src/element-contracts.ts) 已有一份通用 `ElementDefinition`，`content:ContentBlock[]`、`functions:FunctionContract[]` (0..N)、`dependencies[]`、`ContentBlock.contentKind='workflow-definition'`、`ContentBlock.schemaRef`（可定义版本化内容格式）。[Schema 现状](https://github.com/kaicreator-mm/domain-harness/blob/version/v0.11.x/packages/contracts/src/json-schemas.ts) 的 Element 根 `additionalProperties:false`。
- **0.11.0 定义的是 Schema/ContentKind 的扩展机制，不是 0.11.1 Workflow 的完整格式。** 0.11.1 只需为 `workflow-definition` 内容提供自己的机器 Schema（随已选资源或内联、明确版本/摘要），并在 BUILD 编译。**不额外增加 `ElementDefinition.nesting` 根字段，不创设另一种 Element 类/继承树，不改 0.11.0 已接受的 Element 身份模型。**
- Workflow 内容中的嵌套类型字段 `type?` 缺省为 `workflow`，0.11.1 只允许此一种嵌套执行类型。一个 `Workflow` Element 的 Content 可以只有一个节点；同一 `ElementRef` 定义可在多个不同 `nodeId` 引用，节点引用不复制定义，运行实例独立。
- 普通数据 Element 可用现有 `ContentBlock.ref:ResourceRef(packageId,path,digest)` 指向 Package 封存文件，并依赖相应格式 Reader 的选定 Function；文件 `ResourceRef` 不等于其他 Element 的 `ElementRef`。JSON 与 YAML 是**业务数据文件解析格式**，不在 0.11.1 引入 ElementDefinition 本身必须用 YAML 序列化的要求。
- `JsonReader` 与 `YamlReader` 是两份可复用普通 Element。至少同种格式两份数据 Element 复用同一 Reader，业务 Element 消费解析结果。YAML 限 UTF-8 安全单文档、拒绝自定义可执行 Tag 和不受限别名扩张；通过受信已选只读资源句柄或编译期等价数据投影读取，绝无任意 Host 路径、网络资源/文件写入。
- 其它扩展字段（Switch case/NodeRef/start/end/预算）优先置于 `workflow-definition` 内容及其独立机器 Schema/已选 Function 合同中；如确实需要扩展 Package Manifest 的 Workflow Entry/Reader binding，由 0.11.1 T11/T12 只增量扩展相应已接受 schema，而不是借数据 Reader 改动 0.11.0 根 Element Schema。

## 3. 0.11.1 Workflow 业务执行机制，不触及 Core.Order

```yaml
# 示意：ContentBlock(contentKind: workflow-definition).value
type: workflow
nodes:
  - id: assess
    element: selected-assess-element-ref
    selectedFunction: assess
    switch:
      exits:
        APPROVED: {to: reserve}
        REJECTED: {to: REJECT}
        UNKNOWN: {to: UNKNOWN}
        FAILED: {to: FAILED}
  - id: reserve
    element: selected-reserve-element-ref
    selectedFunction: reserve
    switch:
      exits:
        SUCCEEDED: {to: COMPLETE}
        UNKNOWN: {to: UNKNOWN}
        FAILED: {to: FAILED}
```

- **Switch 是具名唯一出口映射，不是 Guard 优先级列表**。选定业务 Guard/Selector Element 仅负责给出确定出口标签；`UNKNOWN` 和 `FAILED` 各有明确出口，不能当作 false/成功，BUILD 拒绝出口重复/未选目标/缺失必要分支。
- KDP 中**只存在一套 Workflow XState v5 运行时**；一次 WorkflowRun 有一个私有 Workflow Actor，子 WorkflowRun 有新的 child Actor；叶子 ElementRun 不必有独立 Workflow Actor。该机制仅运行已选业务 Workflow，**不参与 0.11.0 Core/Extension Init 链的调度**。
- 每个 Element 业务调用实例的 Hook **仅 `start`、`end` 两个可选点**，Package 负责业务异常和业务清理；异步 end 完成后才能向上层 Switch/父 Workflow 提交结果。Hook 失败不能洗成成功。Package.Exit 是 App 退出生命周期，不与单次业务 end 混同。
- **错误归属**：Element/Package 自行决定异常捕获、恢复、重试、业务 Outcome；KDP/SDK 不作普遍异常映射、自动业务重试/降级/回滚或运行时重新检查 BUILD 闭世界 Extension 授权。真正未处理、不能继续的异常进入 KDP 最小诊断与退出；按 0.11.0 的可选 Package.Exit 清理要求执行，不记录敏感业务值。已有 Boot/Pin/可信产物完整性属于必要装载校验，继续保留。
- **预算独立**：根 WorkflowRun 的实际业务 Element 调用次数在全部子 Workflow、Guard/Reader 等实际业务调用中共用一个计数器；每个 Workflow 自行声明对自己子树的最大下级 Workflow 深度（自身=0，直接子=1），新子 Actor 进入前检查所有活动祖先的局部上限。Package.Init 递归和 Package.Exit 不是 Workflow 节点，不计入 Workflow 层级或业务调用总数。
- `ASK/WAIT`、`REJECT`、`UNKNOWN`、`FAILED`、`COMPLETE` 通过显式 Switch 终态表达；0.11.1 不提供 Durable Resume、外部 Host Effect 和 LLM 推理，分别属 0.11.6/0.11.4/0.11.5。

## 4. BUILD 闭合交付 & 版本验收边界

- 0.11.0 的 BUILD 先生成各 Package、再确定性组合成**可独立安装的完整组合 Package**，验证调用者直接 Extension 声明、目标导出/版本、Core.Order、Init/Exit 绑定、最终生成代码静态边；0.11.1 必须在同一 BUILD 内编译 Workflow schema、NodeRef、Switch、Guard/Reader、Hook 和限额，不得另起一个工作流 Build/Lock/Host 权限系统。
- T11 — 契约：`workflow-definition` 版本化内容 Schema、节点/出口/结果/Hook/预算、Package Init 内业务调用合同；保持 0.11.0 的单一 ElementDefinition、Function、ResourceRef 边界。
- T12 — BUILD：在 0.11.0 最新完整组合输出上接入 Workflow/Reader/Guard、静态直接 Extension 与已选入口、格式验证及跨子 Workflow 运行限额，不再重复做 Core.Order 的构建引擎。
- T13 — KDP Workflow：仅新增 Workflow Actor/子 Actor、Switch 转移、业务 start/end async、业务调用根限额/逐祖先本地深度；复用 Package.Init 已选调用与退出兜底，不再创建技术 Init/Dispose 或在 READY 后二次业务 Init。
- T14 — clean-packed E2E：真实 0.11.0 新 Init/Order/可选 Exit/可选 InitFrom 之上的 Init→Workflow→Function；单节点及子 Workflow、Switch 全出口、JSON/YAML 同 Reader 复用、业务 Hook/异常归属与根预算。**两个负例**：Package 省略 InitFrom 和 Exit 也能正常启动/运行；一个含两个 Init 来源的 Package 自治去重/重复执行；业务 Workflow 正常结束不触发 Package.Exit。
- 本设计以 [已合并 #1625](https://github.com/kaicreator-mm/domain-harness/pull/1625) 的 **0.11.0 实际 ABI** 作为唯一实施基线；#1625 的 R3 独审/CI 仅证明 Foundation，不是 XState/Workflow 已通过。

## 5. 保留决定和排除条件

- Element 定义唯一、同一处可复用多次；嵌套只支持 Workflow，允许仅一个节点；按不同 `nodeId` 区分组合位点与实际运行实例。
- Data Reader JSON+YAML；Switch 明确出口；ElementRun 仅 start/end；业务根调用次数共享、嵌套深度每 Workflow 自定受祖先约束。
- Core.Order 完全是 0.11.0 的基础初始化机制，0.11.1 不设第二份 Order 或用它调度业务节点。
- **Package.Init 启动 Workflow，删旧 `technicalInit` 机制，不恢复额外 BusinessAppInit 阶段；Exit、InitFrom 分别可选。**
- 正常路径 Init→Workflow→Function；业务异常 Element 自治，Kernel 仅最终兜底。
- Schema 由 0.11.0 ContentBlock + schemaRef 继续扩展，0.11.1 定义新 Workflow 内容 Schema；不强迫修改根 Element 类型。
