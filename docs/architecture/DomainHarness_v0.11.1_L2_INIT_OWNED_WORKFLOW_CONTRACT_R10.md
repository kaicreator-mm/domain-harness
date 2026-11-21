> **【CURRENT · R11 源码对照修订（2026-11-21）】**：[0.11.0 新规范 #1621](https://github.com/kaicreator-mm/domain-harness/pull/1621) 与 [源码实施 #1622](https://github.com/kaicreator-mm/domain-harness/pull/1622) **已合并至 `version/v0.11.x@da616929d6f794db0cd30183132231ba31d4eb05`**，其 R21 Exact-SHA 独立结论 `ACCEPT_SCOPED`，Woodpecker #2827 SUCCESS；不再是待审核 Draft/未实施。本文 R10 原设计范围依然有效，但执行接线**以 [R11 最新源码审计 A1–A8](DomainHarness_v0.11.1_R11_V0110_INTEGRATION_AUDIT.md) 优先**：当前 Package.init 是 `EntryRef` 而非 `ElementRef`；Init 内的 `context.functions` 暂不可通过尚未创建的 `DomainApp.invoke` 执行业务，需增加 BUILD 选定的受限 Workflow starter；Business Core.Init 仍负责 readiness 状态结果聚合；XState/YAML parser 必须服从最终组合包可信依赖闭包。两个 0.11.1 Draft PR 源分支相对最新列车均落后 62 commits，需在独立审核前同步基线。**以下旧 R10 文字出现“新版 0.11.0 未实施、仍是 Draft”等均仅是历史判断，以本更新为准。**

# DomainHarness v0.11.1 — L2 R10：统一 Package.Init 内启动 Workflow

> **设计状态：** Owner 2026-11-21 七项明确裁决的单源实施候选；尚未进行独立 Review/Freeze、源码实现或 CI。此文档在适用范围内**取代旧 R9.1 以及 X01–X10 跨版本冲突报告中未裁定的选项**；当前 v0.11.0 的真实源码仍是旧的 technicalInit/businessAppInit 机制，最新统一 Init/Exit 规范在 [#1621](https://github.com/kaicreator-mm/domain-harness/pull/1621) **仍为待审核的 Draft**，不能将任一设计决定冒充已实现。

```ini
OUTPUT_LABEL=DH_V0111_L2_R10_INIT_OWNED_WORKFLOW
REPO=kaicreator-mm/domain-harness
L1=#1605
L2=#1608
V0110_INIT_SPEC_PR=#1621
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
- **正常业务主链为 `Package.Init → Workflow → Element.Function`**。Workflow Node 通过 BUILD 绑定到被选 Element 的可调用 Function；嵌套 Workflow Node 启动一个子 WorkflowRun。**没有规定每个 Function 必须经过另一个对外直接 ingress 或每次再次调用 Package.Init**。旧 Stage0 `DomainApp.invoke(ingressId)` 是尚在源码里的历史实现证据，不是本版要求保留的正式直达入口。可存在 Package 内部普通 Function 调用，但不改变标准业务主链。
- 对 Init 的必需 Package 依赖调用、跨 Package Reader/Guard/Function 的直接引用，只能通过当前 Package 明确声明的 **直接 Extension**，且目标导出可访问；传递闭包不授权。Core 之间只有 0.11.0 BUILD 封存的系统链接边例外。BUILD 验证源码及最终生成代码的调用边，禁止无法证明的动态跨包调用。
- 一个 Package 不需要 Workflow 时，其 Init 可以只是完成自身初始化，不强制产生单节点空业务 Workflow；但是**若定义了要执行的 Workflow，则必须从该 Package 的 Init 内启动**。

### Package.Exit 与 InitFrom 分别是可选能力

- `Package.Exit` **可选**，未定义即 no-op，不强制 Package 产生空 Exit Element。
- `Package.InitFrom` **可选**，由 Package 自己决定是否实现/使用；选用时按实际直接调用进入顺序记录来源、重复、失败及激活隔离。未启用时不存在必备的数组/回填要求，不因此 BUILD 失败。
- KDP 为在正常退出/未处理致命异常/部分初始化失败期间**对已声明 Exit 的 Package 做实际逆序退出尝试**，可保留最小化的真实 Init 进入技术记录；这是 KDP 退出机制的一部分，**不是强制每个 Package 暴露 InitFrom**。
- Package.Init 被共享依赖调用多次时，是否每次做实际初始化由 Package 自己决定；Kernel 不强制 once、dedup、应用级幂等。Package.Exit 与 InitFrom 既不是 ElementRun.end，也不计入业务 Workflow 的调用/深度预算。

## 2. Element 与 Schema 选择——复用 0.11.0 的 ContentBlock 机制

- 当前 [Element Contracts](https://github.com/kaicreator-mm/domain-harness/blob/version/v0.11.x/packages/contracts/src/element-contracts.ts) 已有一份通用 `ElementDefinition`，`content:ContentBlock[]`、`functions:FunctionContract[]` (0..N)、`dependencies[]`、`ContentBlock.contentKind='workflow-definition'`、`ContentBlock.schemaRef`（可定义版本化内容格式）。[Schema 现状](https://github.com/kaicreator-mm/domain-harness/blob/version/v0.11.x/packages/contracts/src/json-schemas.ts) 的 Element 根 `additionalProperties:false`。
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
- 本设计应以 [#1621](https://github.com/kaicreator-mm/domain-harness/pull/1621) 决定的 **0.11.0 目标 ABI** 对齐；在那一套尚未审核/合并/实现时，0.11.1 R10 仅为设计候选而非已测试兼容性证明。不得以旧 Stage0 CI 给新版 Init/Exit 或 XState 工作流做成功背书。

## 5. 保留决定和排除条件

- Element 定义唯一、同一处可复用多次；嵌套只支持 Workflow，允许仅一个节点；按不同 `nodeId` 区分组合位点与实际运行实例。
- Data Reader JSON+YAML；Switch 明确出口；ElementRun 仅 start/end；业务根调用次数共享、嵌套深度每 Workflow 自定受祖先约束。
- Core.Order 完全是 0.11.0 的基础初始化机制，0.11.1 不设第二份 Order 或用它调度业务节点。
- **Package.Init 启动 Workflow，删旧 `technicalInit` 机制，不恢复额外 BusinessAppInit 阶段；Exit、InitFrom 分别可选。**
- 正常路径 Init→Workflow→Function；业务异常 Element 自治，Kernel 仅最终兜底。
- Schema 由 0.11.0 ContentBlock + schemaRef 继续扩展，0.11.1 定义新 Workflow 内容 Schema；不强迫修改根 Element 类型。
