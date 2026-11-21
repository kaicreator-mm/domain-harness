# DomainHarness v0.11.0 — Element-First 基础合同定向修订清单 R13

> **用途**：Owner 对 0.11.0 再优化时可直接采用的明确 WHAT/HOW/反例边界。0.11.x 是单一重构列车，不是为 0.11.1 保留旧 Entry 兼容。**现有 0.11.0 实现 #1622 已限定验收，以下是新增架构修订建议；未实施、未验证、未独立审核。**

```ini
OUTPUT_LABEL=DH_V0110_R13_ELEMENT_IDENTITY_FOUNDATION_CORRECTION
REPO=kaicreator-mm/domain-harness
BASE=version/v0.11.x@da616929d6f794db0cd30183132231ba31d4eb05
V0110_VERSION=#1564
V0110_L2=#1574
V0110_OLD_IMPL=#1622_MERGED_ACCEPT_SCOPED
LATER_DISCOVERY=0.11.1_ELEMENT_CLARIFICATION
FIX_HOME=0.11.0
GOAL=NO_PUBLIC_ENTRYREF_ALL_EXECUTABLE_CAPABILITIES_ELEMENT_FUNCTION_SELECTED
IMPL=NOT_STARTED
REVIEW=NOT_DONE
```

## 1. 先裁定概念与实现的分界

- **Element 是逻辑定义**：`ElementRef(namespace,id,version,digest)`。Package Init/Exit 必须引用实际归属此 Package 且纳入 BUILD 闭包的 Element，不能以一个独立代码导出地址冒充“Init Element”。
- **Function 是可执行契约**：`FunctionRef(ElementRef,functionId,contractVersion)`；一个 Element 可有 0..N Functions，但凡**被选定作为可执行 Init/Exit/Hook**，BUILD 必须证明该 Element 存在恰好一个指定 Function、完整有效 Schema、被选实现与权限。若有 0 Functions 的知识 Element，仍合法，只是不允许作为可执行 Init/Exit。
- **物理实现不是独立 Entry 实体**：一个经 BUILD/Target 选择的实现需要 `module:ResourceRef + exportName`，可直接存于 `SelectedImplementation` 内部（或 BUILD 内部 `ModuleExportLocator`），**删除 `EntryRef` 作为全局公共领域合同/可填写的 Init/Exit/Hook 引用**。不能机械删除这两个低层字段：Node ESM 仍要定位真实模块。
- **Boot KDP bootstrap 特例**：Boot 本身在 Package 树外，固定加载受信 KDP `bootstrap` 是启动技术定位而非业务 Element；它没有义务伪装为普通 Element。KDP Package 在被启动后执行的 **Package.Init 仍是实际的 Element**。
- **当前版本先修正基础，再让 v0.11.1 接入**：0.11.0 必须既能 AOT 选定 Function，也能由 Package.Init 在自己权限内调用已选 Function，作为非 Workflow 的基础动作；v0.11.1 才把这条能力编排成 Workflow。这不要求在 0.11.0 提前支持 Workflow、Reader 或 XState。

## 2. 目标合同（示意名可由 v0.11.0 L2 统一；语义必须保持）

```ts
// authoring / domain: 0.11.0
interface DomainPackageManifest {
  init: ElementRef;          // 必选；必须是本 Package 拥有且已选定义
  exit?: ElementRef;         // 可选，不存在即 no-op
  recordInitFrom?: true;     // 可选，与 exit 独立
  // 其它字段继续采用已实现的 Core.Order、dependsOn、Target 等
}

// build-resolved / exact Lock: 0.11.0
interface SelectedLifecycleExecution {
  element: ElementRef;       // 逻辑身份
  callable: FunctionRef;     // 唯一选定的 init/exit Function
  implementation: {
    module: ResourceRef;     // 物理模块摘要地址，仅内部绑定
    exportName: string;      // 真实导出符号，仅内部绑定
  };
}

// target implementation: 0.11.0
interface SelectedTargetImplementation {
  function: FunctionRef;     // 真正选定的 Function，不是原始 Entry
  module: ResourceRef;
  exportName: string;
}
```

**选择规则**：建议将 Init Element 中标准 `functionId='init'`、Exit Element 中 `functionId='exit'` 定义为可执行生命周期 Function；`contractVersion` 由 Element 中的对应合同给出并封存。BUILD 不接受缺少该 Function、重复/歧义 FunctionId/Target 实现或无对应 Element 定义的裸模块。`ElementRef` 自己不会自动执行，不能让 `init:ElementRef` 在 Kernel 中变成“找同名 `init` 导出”的动态推断。若最终 L2 选择显式生命周期 FunctionRef 而非固定 functionId，也必须保持 **Package 公共的 Init/Exit 身份为 ElementRef** 且最终调用完全确定。

## 3. 0.11.0 必修条目：按影响顺序

| ID | 严重度 | 修改项和具体验收目标 | 真实受影响文件 |
|---|---|---|---|
| **B0-01** | P1 | **删除公共 Entry 身份、建立统一 Element→Function→实现链**：`EntryRef` 不作为独立对外可引用领域实体。保留物理 module/exportName 仅在 Target 已选实现中。保持 ElementRef/FunctionRef 版本与内容摘要锁定、单定义 Owner、0..N Functions 的通用模型。 | `packages/contracts/src/refs.ts`、`element-contracts.ts`、`json-schemas.ts`、`schema-versions.ts` |
| **B0-02** | **P1** | **Package.Init/Exit 改为 ElementRef**：Manifest `init:ElementRef`、`exit?:ElementRef`，Lock `SelectedPackage` 保存同一逻辑身份 + BUILD 解析的唯一生命周期 Function/物理实现绑定；BUILD 拒绝未选 Element、非本人 Owner、缺可执行合同、错误摘要/版本/Target、复用私有导出越界。运行 Package **至少拥有 Init Element**，旧“零 Element 但仍能以 init.mjs 启动”不合格。Exit 继续可选。 | `package-manifest.ts`、`app-lock.ts`、`build.ts`、`json-schemas.ts`、`package-system.ts` |
| **B0-03** | P1 | **Hook 不能以裸 Entry 绕过 Element**：`HookBinding.entry:EntryRef`、`SealedHookBinding.providers:EntryRef[]` 改为经过选定的 FunctionRef/ElementRef，并依 Owner/公开导出/接口 Schema/目标实现/直接 Extension 静态校验；现有 Hook `provides/contributesTo` 的功能保持。**这里只改 Hook 可执行身份**，不提前实现 v0.11.1 `start/end` 业务时序。 | `package-manifest.ts`、`app-lock.ts`、`build.ts`、`static-package-guard.ts`、`package-system.ts` |
| **B0-04** | **P1** | **最低限度 Init 期 Function 可调用**：当前 `kdp.ts` 的 `AppInitContext.functions` 代理 `DomainApp.invoke`，在 `appRef===null` 时返回 NOT_READY。应在 **0.11.0** 将其改为由 BUILD 选定、KDP 受限绑定且在 Package.Init **执行期间可用**的 Function 调用原语；只授予本 Package 自有或直接依赖 Extension 的可见 Function，不能用全局 Map 或虚假的 READY。v0.11.0 用 Init 直接调用最小 no-effect Function 验证知识/规则 Content 真影响业务值。 | `app-contracts.ts`、`kdp.ts`、`package-system.ts`、`build.ts`、`domain-app.ts` |
| **B0-05** | P1 | **去掉旧直接 Function ingress 作为正式业务启动结构**：`DomainAppDescriptor.ingress`、`DomainApp.invoke`、`SealedIngress`、`suppressedIngress` 及旧 READY 后入口初始化状态应按新的 `Package.Init → 已选 Function` 基础合同收口，不把独立直接 ingress 作为默认应用业务入口留给 0.11.1 “兼容”。App 启动的基本 READY/DEGRADED/BLOCKED/FAILED 可以保持，**但必须与旧 ingress suppress 机制脱钩**。原“选定 Function 真实执行”Demo 迁移到 Init 内，同样证明语义消费，不可用 mock 代替。 | `app-descriptor.ts`、`app-lock.ts`、`app-contracts.ts`、`domain-app.ts`、`kdp.ts`、`build.ts`、public SDK/fixtures |
| **B0-06** | P2 | **资源只保留单一可审计归属**：当前 `initResources?: ResourceRef[]` 与 Element ContentBlock/所选 Function.resources 可能形成独立的“给 Init 任意额外资源”入口。应由 BUILD 从 Init Element Content + 选定生命周期 Function/Target resources 推导允许的只读资源句柄；若 Manifest 仍需资源选择辅助字段，也只能在静态证明它属于当前 Init Element/Function 后编译为 Lock，不授予旁路权限。 | `package-manifest.ts`、`app-lock.ts`、`build.ts`、`package-system.ts` |
| **B0-07** | P2 | **确保统一 BUILD/Boot/KDP 无第二身份体系**：更新目标实现绑定、最终 ESM 静态代码守卫、完整安装包封存、原真实 Init 进入/逆序 Exit 记录，仍使用唯一 `coreOrder` 链；删除私有 Loader 直接调用未经 Element 选择的生命周期函数的旁路。Boot 受信 bootstrap 不在此业务 Element 规则内。 | `tooling/build/src/static-package-guard.ts`、`app-package.ts`、`packages/microkernel/src/boot.ts`、`package-system.ts`、`packages/domain-harness/src/**` |
| **B0-08** | P2 | **文档与示例一致性**：原 PRD “KDP/Package 可无 Element”、原路线图“普通 Function 外部直达默认业务入口”、原 0.11.0 概念 `lifecycle:dist/package.mjs#init` 只能保留为历史示意，当前文档和新示例要以 ElementRef 为单源；消除“文档写 Init Element、源码仍裸 EntryRef”的冲突。 | `docs/product/DomainHarness_v0.11.0_ELEMENT_FIRST_PRODUCT_PRD_CANDIDATE.md` 的新 superseding 说明、`docs/specs/*`、`docs/architecture/*`、`examples/**`、README |

**注意**：以上是 R13 新架构修订项目，P1/P2 表示对完整 0.11.x 目标架构的阻塞等级，**不是宣称历史 R21 审核发现了新 0.11.0 源码缺陷**。旧代码 Scoped PASS 不被追溯取消，但当前新修订未获测试证据。

## 4. 不要因为这轮修复而改动的基础能力

- **Core.Order**：KDP=0 / Core 全局唯一/升序链接/Extensions 本层递归、每 Package 自治重复 Init。不要引入新 next() 公共 API。
- **Package.Exit** 和 **InitFrom**：分别可选，无 Exit 视无操作；KDP 为逆序 Exit 维护自身实际 Init 进入记录，与可选 InitFrom 互不依赖。
- **Boot Pin/Target/完整性**：Boot 技术 bootstrap 仍需要可信定位与哈希记录；不需要转成业务 Element 或取消已封存物理实现地址。
- **BUILD 从生成 Package 到完整组合 Package**、跨包只可调用当前 Package 自己直接声明 Extension 的公开能力、未知动态调用拒绝；只为新的逻辑身份边界补验证，不能重造另一套编译器。
- **Node >=22.12.0**，只有真实特性依赖才提升要求；不要求 0.10.x 兼容、不要求旧业务逻辑 parity、无新 Host Effect/LLM/Workflow。
- **业务异常 Element/Package 自理，KDP 最后兜底退出**；新 Init 期 Function 直接调用不可引入 KDP 全局业务异常解释器。

## 5. 最小顺序与审核范围（避免无效重测）

```text
B0-01 类型/Schema + B0-02 Init/Exit ElementRef
   → B0-03 Hook/FunctionRef
   → B0-04 Init 期间真正的选定 Function 调用
   → B0-05 去掉旧默认直达 ingress、迁移 Consumer
   → B0-06/07 资源与 BUILD/KDP 受限闭包
   → B0-08 文档与 clean-packed Demo
   → 受影响的单次增量验证 / Exact-SHA 独立审核
   → 0.11.1 T11–T14 在此基础上仅增加 Workflow
```

**建议先证实的反例**（同一批最小 scoped tests）：

1. **POS**：Package 含一个真实 Init Element 的 `ElementRef`，其选定 `init` Function 在 App READY 前真实调用已选 no-effect Function，读取封存 Knowledge/Rule 资源并影响输出；无旧 public ingress、无第二初始化。
2. **POS**：另一个 Package 有真实可选 Exit Element；不启用 InitFrom 时仍能逆序 Exit；启用时保留真实调用源顺序；共享 Extension 的重复 Init 不被 Kernel 自动去重。
3. **NEG**：Package 只有 `init.mjs#init`、没有实际 Init Element → BUILD 拒绝。缺失 Exit Element 但 Exit 可选 → 正常通过。
4. **NEG**：`init:ElementRef` 指向其他 Package 的私有 Element、未选 ID、错误 digest/版本，或选定 Element 无 `init` Function/无实现 → BUILD 拒绝，Kernel 不作补偿查找。
5. **NEG**：Hook Provider 无 Element/FunctionRef、跨 Package 未声明直接 Extension、导出不存在、动态未知模块或未选目标 → BUILD 拒绝。真实 Boot KDP bootstrap 不应被误拒。
6. **NEG**：Init 上下文仍靠 `DomainApp.invoke` 等待 READY 才能调用最小已选 Function → 无法通过 POS。未捕获错误触发必要 Exit，且不得凭错误结果虚构成功。
7. **POS**：最终 BUILD 两次产生相同 Lock 与安装包，真实 clean-packed Node22 ESM Consumer 可启动，原未变化的 Core.Order/直接 Extension/Exit 规则保持；受影响错误日志有 Package/Element/Function/阶段信息且不泄密。

## 6. 与 0.11.1 的严格分界

- **0.11.0 修“是谁、选什么、怎么合法调用”**：Element/Function 身份、Package Init/Exit、Hook Function、已选实现/资源、BUILD/Lock/SDK/KDP 最小可执行能力。
- **0.11.1 修“如何把多个已选执行组合成业务流程”**：Workflow 内容 Schema、Node、XState Actor、Switch、JSON/YAML Reader、start/end 业务 Hook、根共享调用预算/每 Workflow 的局部最大深度、ASK/WAIT。
- 不在 0.11.0 引入业务 Workflow Actor 或 XState，也不在 0.11.1 重新定义公共 `EntryRef`、补旧 `DomainApp.invoke` 兼容层。0.11.1 的 `Package.Init → Workflow → Function` 建立在本文件修正的 **0.11.0 Init(ElementRef) + Init 可用已选 Function 调用原语**上。

## 7. 本轮交付资格

本文件是**供 Owner 再优化的具体合同候选与实施清单**，不是已合入源码。不得把 0.11.0 当前合并 Head、历史 R21 ACCEPT_SCOPED/#2827 SUCCESS 当作 B0-01..08 的验收证据；新的 TypeScript/Schema/BUILD/SDK/Package/Demo 修改必须在真实 Writer PR 中完成、复用旧未改变范围的证据并做必要增量审查。没有必要本地 Agent 参与本轮纯设计工作。
