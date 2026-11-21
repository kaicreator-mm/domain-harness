# DomainHarness v0.11.0 ↔ v0.11.1 · 源码与规范冲突审核

```ini
OUTPUT_LABEL=DH_V0110_V0111_CROSS_VERSION_CONFLICT_AUDIT_R1
SOURCE_OF_TRUTH=GITHUB_CURRENT_CODE_AND_EXACT_DRAFT_SPEC
BASE_TRAIN=version/v0.11.x@b8e5c2bc6eee8615bbc9aabcdb3afd4aa2baa6b2
V0110_SPEC_PR=#1621
V0110_SPEC_HEAD=6bfcf00dbabf2008ad33d2eef913f2af0f3b2616
V0110_SPEC_STATUS=DRAFT_NOT_IMPLEMENTED_OR_FROZEN
V0111_PRODUCT=#1605
V0111_PRODUCT_PR=#1607
V0111_ARCH=#1608
V0111_ARCH_PR=#1611
V0111_CURRENT_DESIGN=R9_1
CHECK_SCOPE=CONTRACT_COMPATIBILITY_DESIGN_ONLY
NEW_SOURCE_EXECUTION=NOT_RUN
```

## 1. 权威层次与关键发现

0.11.0 **两条不同状态的事实不得混为一谈**：

1. 旧版已实施与 Scoped 验收的 `version/v0.11.x`：三层各一个 Primary，部分 Package 可有零 Element；`technicalInit/technicalDispose` 依 `technicalInitOrder` 执行，然后额外的唯一 `businessAppInit` 决定 READY/DEGRADED，随后通过已封存 ingress 直调 Function；现有 `DomainApp.invoke` 在运行时做 Schema/Outcome 规范检查。当前阶段已合并的源代码确实如此。
2. **后发且尚未合并/实施的 0.11.0 新规范**：[PR #1621](https://github.com/kaicreator-mm/domain-harness/pull/1621) [完整文档](https://github.com/kaicreator-mm/domain-harness/blob/6bfcf00dbabf2008ad33d2eef913f2af0f3b2616/docs/specs/DomainHarness_v0.11.0_PACKAGE_CORE_LIFECYCLE_AND_BUILD_SPEC.md)。用户要求单一 Init Element、可选 Exit Element、KDP Order 0 / Core.Order 严格唯一、直接 Extension、InitFrom[]、单轮递归 Init、退出时按实际调用逆序 Exit、BUILD 从单包生成到完整组合、Element/Package 自治异常；它**明确替代**旧 technicalInit/Dispose 与额外 Business App Init 调用。需要独立审查与实施，不能将其声明为现有 0.11.0 已实现、已 Freeze。

**v0.11.1 R9.1 的不一致点**主要来自引用了第一条作为“始终保持不变的 0.11.0 规范”，却忽略了第二条最新 Owner 设计。

## 2. 冲突矩阵（按设计修订严重度排序）

| ID | 等级 | v0.11.0 最新规范 #1621 | 当前 v0.11.1 R9.1 写法/行为 | 建议明确调整 |
|---|---|---|---|---|
| X01 | **P1** | **P-01/I-01–I-06**：每个可运行 Package 唯一 Init Element；Boot 触发 KDP Order0.Init，再由 Core.Init 递归 Init Extension/下一个 Core，**这就是初始化** | R9.1 把“Package Init Element”主要写成 READY/Ingress 后业务调用触发的 Workflow 入口，并称 Boot 不调用业务 Init | 必须区分同一 Init Element 的 **Package 初始化调用**与它对外可选的**业务 Workflow 调用**，或明确业务 Startup Workflow 在 Init 中运行的条件；不得定义第二个与 Package.Init 同名/并行的启动器 |
| X02 | **P1** | **I-06/§7**：取消旧 `technicalInit/technicalDispose` + 独立 `businessAppInit` 额外第二轮；由统一 Init/Exit 管理 | R9.1 多处说“Stage0 `technicalInit/Dispose`、`businessAppInit` 全保留、Package Init 与旧技术 Init 分离” | 改为 **保留唯一 Boot、可信 Pin、公开函数入口等基础能力；旧双 Init/Dispose 生命周期以经审核的新 0.11.0 规范为准迁移/替换**；新合同实施前不能要求 R9.1 继续保留冲突机制 |
| X03 | **P1** | **P-02/P-04/I-02–I-07**：Core.Order 必填唯一，KDP=0，BUILD 固定链接边；Init 下行仅一轮，Extension 递归调用直接声明依赖；Kernel 不强制重复 Init 去重 | R9.1 未引用 Core.Order/Init 树/系统链接边，容易通过 KDP 的 XState Workflow Actor 把 Stage0 Package Init 重新实现成第二套调度 | 规定 **Package 初始化图由 0.11.0 BUILD 生成的 Init/Order 链执行**；0.11.1 的 XState WorkflowRun **只编排选定业务 Workflow，不托管/重排 Core/Extension 的初始化主链** |
| X04 | **P1** | **P-03/P-06/B-03/B-04**：Package 只能直接调用自己声明的 Extension 公开内容；无法证明的生成代码/动态 import 必须 BUILD 拒绝，传递依赖不授权 | R9.1 通用 Reader、跨 Package ElementRef/Init 绑定只要求“被选入闭包”，容易误把闭包当授权 | 包级 Reader/业务 Element/Init/Guard/Hook 的**跨 Package 调用边**也要经调用者自己的直接 Extension 声明及实际导出证明；不能借 Workflow Node、FunctionRef、共享 Reader 或 Hook 绕过 |
| X05 | **P1** | **B-01/B-04/§7**：BUILD 的结果是独立可安装的**完整确定性组合 Package**（含受控绑定），Lock 只是内嵌事实；需证明最终生成代码无未声明调用 | R9.1 的 T12 只强调 BUILD/Lock 的入口、资源和图封存，没有完整构建/产物检查接入要求 | T12 必须消费 0.11.0 的**完整组合 Package BUILD 成品/受限调用绑定**，将 Workflow Switch/Reader/Init 对应目标作为生成代码级静态引用验证；不得新建旁路 Workflow 产物格式或只输出第二份独立 Lock |
| X06 | **P1** | **F-01–F-05/E-01–E-05**：每个可运行 Package 需 `InitFrom[]` 记录调用来源含重复；Package Exit Element 可选、退出时**按实际 Init 进入记录逆序执行** | R9.1 只区分 business `start/end` Hooks 与旧 technicalDispose，没有处理新 `InitFrom[]`/Exit，若 `end` 执行 Package 退出将破坏生命周期 | `InitFrom[]` 和 Package Exit 属 **0.11.0 Package 生命周期**；`ElementRun.start/end` 属 **0.11.1 单次业务运行生命周期**；不应同一次 Element.end 就退出共享 Package，Workflow 结束不能错误触发 Package.Exit；InitFrom 不当 WorkflowRun 路径/预算 |
| X07 | **P1** | **B-05/E-05/§7**：KDP/SDK 不再做完整业务异常映射、重复业务/依赖授权 Schema 校验，只做最小诊断/退出，保留必要 Boot Pin/安装字节检查 | R9.1 断言“现有 0.11.0 所有 Schema/Outcome/Ingress/READY/Dispose 的运行时校验原样不变”，并隐含意外输出自动映射 UNKNOWN/FAILED | 精准区分：**保留必要装载真实性、选定目标与公开 FunctionOutcome 合同语义**；业务输入输出资格/异常归 Element 或 BUILD 生成的调用入口处理；未捕获不可恢复故障走 KDP 最小日志/Exit，而不是 KDP 新建业务兜底解释器。迁移不能静默削减原有有效测试约束 |
| X08 | **P2** | **I-06**：`Init Element` 可以启动业务 Workflow，但普通 Function 可通过合法公开入口直接调用，不应为所有普通函数强制走 Init Router | R9.1 “每个 Package 的唯一业务调用入口 Init”与“旧直接 Function ingress 保留”有潜在自相矛盾 | 把“Init Element 中启动 Workflow”限于 **该 Package 声明的 Workflow 启动入口**；不强制所有普通 Function 每次先调用 Init 或变成 Router。若 Owner 仍要求每次调用都通过 Init 路由，应作为明确产品变更单独裁决 |
| X09 | **P2** | **Element Schema** 仍支持 0..N Function、ContentBlock.value/ref 与 typed schema；最新设计没有宣称 YAML 直接作为 Element definition 文件格式 | R9.1 新的 `nesting.kind`、Switch、Hook/Init Binding/YAML 不存在于已实施 `ElementDefinition` / manifest / schema，且既有 JSON Schema `additionalProperties:false` | 扩展版本化 Contracts/Schema/BUILD；**JSON/YAML Reader 读取数据资源**与“Package 中 ElementDefinition 也允许 YAML 序列化”不是同一需求，别无意把后者加进范围 |
| X10 | **P2** | 初始化递归由 **Package.Init** 和其直接 Extension 静态调用图约束；Exit 与完整组合 BUILD 属 Stage0 | R9.1 根 WorkflowRun 共享调用次数、各 Workflow 自定嵌套子树深度 | 原则上**无直接冲突**：该预算仅计 **业务 WorkflowRun 的 Element 调用**；Package Init/InitFrom/Exit 不是 Workflow 的隐式子节点或深度额度，除非 Init 显式启动一个业务 WorkflowRun，此时该 Run 拥有自己的业务预算 |

等级仅指**设计接入阻塞优先级**，不是宣称已有实现发生线上错误，也不是对 #1621 做独立审核结论。

## 3. 已兼容、不应再次重开的决定

- Element 一份版本化定义、多个 `ElementRef` 引用，`functions[]` 允许 0..N，Data Element 可以直接携带已选资源；**Workflow 嵌套类型仅支持 workflow（含一节点）** 是 0.11.1 增量功能，不违背 0.11.0 的多 contentKind、静态依赖 DAG。
- JSON/YAML 两种已选只读数据 Reader Element 与现有 `ResourceRef(packageId,path,digest)` 兼容；跨 Package Reader 必须遵守 **直接 Extension 公开调用授权**，不得借数据读绕过。
- Switch **具名唯一出口**，不使用 priority/first-match，可以编译成已选 Workflow 行为图；与 Core.Order 的 Package 初始化主链是**不同图**，不混用。
- ElementRun 层只有 `start/end` 两个可选业务 Hook，**不妨碍** 0.11.0 单独可选的 Package.Exit Element；它们分别是单次业务调用与整个 Package 生命周期。
- 根 Run 总业务 Element 调用预算共享，而每个 Workflow 对自己的相对子树深度独立设限且受所有活动祖先约束；和 Package Init 的递归顺序无关。
- KDP 仍唯一。0.11.1 在 KDP 使用一个通用 XState Workflow/StateMachine 执行器不等于创建另一个 Package 生命周期调度器，只要其不干涉 Core Init 主链或 Business/Package 责任。

## 4. 统一后的正确调用/退出层次（候选，不自行冻结）

```text
Boot → KDP Core (Order=0) Package.Init Element
       ├─ Direct Extension.Init 递归调用
       └─ 下一 Core.Init（BUILD 固化链）
           └─ ... 最后 Core.Init
       [每个实际 Init 进入写 InitFrom[]，重复不自动去重]
       └─ 初始化完成；不再另跑 technicalInitOrder/businessAppInit 第二轮

Package Init 若明确选择业务启动 Workflow，或对外已选 Workflow Function 入口被调用：
  → 选定业务 WorkflowRun → KDP 私有 XState Actor
    → ElementRun.start? → 调用选定业务 Element / 子 Workflow → ElementRun.end?
    → Switch 具名出口 → 下一 Node 或业务终态
    → 根业务运行共享调用预算、各 Workflow 本地最大子树深度
  [业务调用/任务正常终局不自动调用 Package.Exit]

正常 App 结束、Init 部分失败或未处理致命异常：
  → KDP 按实际 Init 进入记录逆序尝试 Package.Exit?（可缺省空）
  → 业务资源/异常由 Package/Element 自己处理，KDP 最小记录与退出
```

初始化时如果确实启动业务 Workflow，该 Workflow 应明确自己的输入/Outcome/预算及在何时完成；**不可绕过 Boot 的构建选定/真实 Init/Exit 资格，也不可在 0.11.0 自行添加一个需要 READY 的业务第二阶段**。初始化已处于何种状态、对外 ingress 何时可用须由融合后的 L2 明确，在这之前不可假报可运行。

## 5. 结论/下一步边界

1. **先决依赖**：0.11.0 [#1621](https://github.com/kaicreator-mm/domain-harness/pull/1621) 当前 Draft 规范需先审查/定稿，且基线产品/源码尚未迁移。不能一边冻结旧技术生命周期、一边冻结依赖其删除的 0.11.1 L2。
2. **建议修订 0.11.1 #1608/R9.1** 的 X01–X08：明确直接 Extension、无第二 Init、Core/Exit/InitFrom 与 Workflow start/end 的职责分离、完整组合 BUILD、业务失败归属。
3. **契约接线**：T11/T12 在已接受的 0.11.0 Package Schema/Lock/组合产物之上新增 `nesting.kind`、Workflow/Switch、JSON/YAML Reader 和 WorkflowRun/Hook 定义；T13 专注业务 Workflow Actor，不创建新 Package Init/Exit 系统；T14 验证 Package 启动和 Workflow 两条调用链及真实 packed 数据。
4. **测试**：复用原 Stage0 验收中的仍适用反例，新增 #1621 AC-S01–S14 与 0.11.1 AC11–AC20 的**合并正反例**；前者需在 0.11.0 新源码实现后才是证明，不能冒充当前旧 Scoped PASS。
5. **冻结顺序**：0.11.0 新设计/实现收敛（至少 L1/L2 单源及必要接口稳定）→ 0.11.1 源规范消除冲突→各自独立审核/Freeze→实施。这里没有新增授权动作、独立 Reviewer 身份或 Release 资格声明。

**阶段结论：`REWORK_DESIGN_CONFLICT`，不能将当前 0.11.1 R9.1 L2 作为无冲突冻结件；同时不否认其 Workflow/Reader/Switch/Hook/深度的大部分设计本身是合理的。**
