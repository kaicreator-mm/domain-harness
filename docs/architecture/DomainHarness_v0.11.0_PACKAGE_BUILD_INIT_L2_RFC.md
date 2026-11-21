# DomainHarness v0.11.0 — Package / BUILD / Init 技术合同修订（L2 · 评审候选 R1）

> **REVIEW_ONLY，非已实现 API**。对应 [L1](../product/DomainHarness_v0.11.0_PACKAGE_BUILD_INIT_L1_RFC.md) 与 [Gap Matrix](../engineering/DOMAIN_HARNESS_V0110_PACKAGE_INIT_BUILD_GAP_MATRIX.md)。现有源码参考 \`version/v0.11.x@b8e5c2bc6eee8615bbc9aabcdb3afd4aa2baa6b2\`。本文的 TypeScript 仅说明模型，不可冒充当前公开合同。

## 1. 统一 Package Manifest（替换旧 L203 的技术 Init 双机制）

候选语义：

\`\`\`ts
type PackageRole = 'primary' | 'extension';
type PackageLayer = 'kernel' | 'sdk' | 'business';

interface PackageManifestCandidate {
  readonly id: string;
  readonly layer: PackageLayer;
  readonly role: PackageRole;
  readonly order?: number;          // primary 必填，extension 可选；在 BUILD 检查
  readonly init: ElementRef;        // 每个可执行 Package 必填；属于本 Package
  readonly extensions: readonly ExtensionRef[];  // 直接可调用 Extension 白名单
  readonly initCalls: readonly InitCallRef[];    // 实际需执行的显式 Init 边/约束
  readonly elements: readonly ElementRef[];
  readonly exports: readonly ExportRef[];
  // targetVariants / resources / hooks 等仍按已有 Element-First 基础模型继承
}
interface ExtensionRef { readonly packageId: string; readonly version: string }
interface InitCallRef { readonly extensionPackageId: string; readonly init: ElementRef }
\`\`\`

上述命名、\`number\` 和字段形态只是**L2 候选**：核心是「一个统一的 Init Element」「直接 Extension 调用边」「Core.Order 必有」。由 BUILD 验证 \`role=primary\` 的 Order 存在、Init 属于本包并已封装；不能利用 InitCall 声明把未声明 Extension 纳入白名单。对纯静态知识资源，仍可区分 **可执行 Package 的 Init 必填** 与独立非运行资源；若 Owner 要求 *全部 Package 无例外*，可用一个空操作 Init Element 满足统一契约。

**\`dependsOn\` 不应被默默等同于 Extension 授权**。现有 \`PackageDependency{package,version,interface}\` 更像 API 需求；新合同应使“调用者显式声明的直接 Extension”成为唯一授权关系。保留 \`imports/exports\` 供合同/可见性，BUILD 同时要求 \`caller → declared Extension → public exported Function/Init\` 三者一致。

## 2. Core 入口主链、Extension 调用、Order

组合 Package 保存全体 Core 入口的构建时确定序列：

\`\`\`text
Boot --pinned--> KernelCore.Init  (Order=10)
    --built root entry chain--> SDKCore.Init  (Order=20)
    --built root entry chain--> BusinessCore.Init (Order=30)
\`\`\`

数字仅为示例；不能把 10/20/30 当标准常量。**主链交接是组合产物的固定入口关系**，不是 Kernel 在运行时搜索并决定下一层，也不是赋予 Core 任意跨包引用权；如果某个 Core/Extension 直接调用另一个 Package 的内容，则必须符合“直接声明 Extension”约束。

每一个 Init Element 可调用其显式 Extension 的 Init；Extension 可调用其它自己声明的 Extension，即使分属不同层。Package 的内部业务逻辑和重复 Init 行为由它自己负责。不得在 Kernel/SDK 建 \`initialized:Set<packageId>\` 强行去重；不为扩展指定“只能初始化自己”规则。

**Order 冲突**：推荐同一完整组合的所有 Core Order 取互异有限值并按升序固定；依赖边要求某 Init 在另一个 Init 之前时，BUILD 验证图与 Core 顺序相容。同 Order 与无法排序的冲突 → BUILD REFUSED。Extension 没有 Order 时仍可调用/被调用，其次序由显式调用图决定，不能在 Runtime 随机排序或默认自动启动全部 Extensions。

## 3. BUILD 的两层产物：Package 编译与组合 Package

**阶段 S1 — 生成单 Package**
1. 编译/封存 Package 自身的 Element 定义、Init Element、Function 实现与 Target 资源。
2. 收集直接 Extension 引用、跨 Package InitCall/Function/Hook 绑定、ESM 的静态导入与显式外部调用。
3. 检查名称、Target、导出/可见性、Schema/Resource、单包 Init 必填和可静态证明的直接调用边。
4. 若源语言允许无法静态证明的跨包动态加载，应拒绝该 Profile，或先将其编译成**受约束且可证明**的绑定 IR；不可默许运行时再检查。

**阶段 S2 — 组合完整 Package**
1. 从显式 Core 入口和依赖的 Extension 组成选定闭包，所有资源/实现/版本均有确定引用。
2. 检查每条实际可达跨包调用边必须是调用者直接声明的 Extension 且目标已公开；**传递依赖不能自动获得调用权限**。
3. 区分（a）Package Extension 声明图（b）Init 必需调用图（c）Element 构建依赖图（d）Hook 绑定图（e）未来 Workflow 行为图，不混合后者与 BUILD 的静态无环条件。声明/Init 依赖成环时在 BUILD 拒绝。
4. 固定 Core.Order 主链、明确的 InitCall 目标与顺序、Hook Owner/Provider、Implementation、Target、资源摘要。
5. 将所有已选 Package 代码/资源/入口、最小 Boot 入口和必要元数据封装为**完整可安装组合 Package**（格式由本 L2 审核冻结），Lock 是内部绑定收据而非唯一交付物。
6. 保证相同输入/工具链/Target 下生成的实际**组合产物内容摘要与文件集合确定**；检查 ZIP/tar 文件排序、mtime、权限、路径、绝对机器路径及 nondeterministic ID 不污染产物。

候选接口（**非现有 API**）：

\`\`\`ts
interface BuiltPackageCandidate {
  readonly packageId: string;
  readonly target: string;
  readonly initEntry: ElementRef;
  readonly artifactFiles: readonly PackageArtifactRef[];
  readonly digest: string;
}

interface BuiltCompositePackageCandidate {
  readonly packageId: string;
  readonly coreEntryChain: readonly ElementRef[];
  readonly selectedPackages: readonly BuiltPackageCandidate[];
  readonly extensionCallBindings: readonly CompiledCallBinding[];
  readonly hookBindings: readonly CompiledHookBinding[];
  readonly entryArtifact: PackageArtifactRef;
  readonly artifacts: readonly PackageArtifactRef[];
  readonly lockDigest: string; // 保留内嵌 Lock/Pin 的证据价值
}
\`\`\`

**实现强保证的边界**：对任意可执行 JavaScript 进行完整静态调用关系证明不可一般化；本版本必须定义**受约束的可构建 Package Profile**，让所有跨 Package 调用都走受控编译/链接绑定。需要明确处理相对/绝对 ESM import、CommonJS require、\`import(variable)\`、反射/运行期解析和任意 Host module import。无法证明没有未声明访问则 BUILD **不产出合格的完整 Package**；不能靠 KDP Runtime 二次权限判定补漏。

**\`initCalls\` 与“必须调用”的关系**：允许 Package 作者决定调用顺序/重复策略，但规定为必需的调用要在**构建后可验证的执行计划或编译后的 Init 调用位点**中体现；不能仅在 Manifest 写“会调用 B”却由任意代码在某条运行分支永远不调用。可选采用声明式 InitPlan 生成调用骨架，Package 提供实现步骤；此策略要等 Owner 审核后才冻结，不能越过“Package 自治”。

## 4. RUNNING 职责：最小 Boot、调用与兜底

正常路径为 \`Boot → pinned KernelCore.Init → 构建好的 Core 主链与 Package InitCall → Function/Hook\`。

Boot 仅定位构建选定入口，可保留已安装完整产物的最小身份/摘要检查。KDP/SDK 不重新遍历依赖图、不补选 Provider、不在每次跨包调用时验证“是否在 Extension 白名单”、不重复执行业务 Schema/安全资格认证。

- **普通错误**：Element 自己定义并返回业务结果，内部处理业务异常、重试/降级/回滚/资源销毁，所属 Package 对内部组合负责。
- **致命兜底**：未捕获错误、缺少已封存调用目标或不可执行绑定 → 记录固定失败阶段、Package/Element ID、错误类别和必要诊断，**不得打印原始敏感值**；停止当前 App 激活/请求，将退出交给宿主。系统不做“将任意异常悄悄转换成业务 FAILED”“全局逆序跨包技术回滚”“运行时缺依赖自动修复”。
- 这不禁止 Element 的合同显式包含 \`FAILED\` / \`UNKNOWN\`，也不表示删除最小 Boot Pin/Lock 身份检查。**现有 \`DomainApp.invoke()\` 的运行时输入/输出 Schema 判断属于需迁移/定界的旧业务网关逻辑**：若按新原则收敛，应归 Element 包内边界或 BUILD 产生的已编译入口，不能在尚未补等价能力时直接删去已有测试覆盖。
- 此处“退出”以**当前激活停止 + Host 可感知终止原因**为最低行为；公共 SDK 不随意终止整个宿主进程。

## 5. Hook 与后续 Workflow 的分界

- BUILD 封存 Hook Owner、Provider 及接口，Package Init 激活已选绑定；Owner 在自己的状态/事件调用。0.11.0 的基础 Hook 验收需要**真实调用**，现有 \`sealHooks()\` 只封存尚不足。
- Hook 调用不得形成未声明 Extension 的跨包访问；Provider 的调用资格必须在 BUILD 已编译闭包中被证明。
- **0.11.1** 另有 ElementRun \`start/end\` Hook、XState Workflow、State Machine 等；它们在 Stage0 统一 Package Init 基础之上实现，不得重新引入 \`technicalInit\` 与 \`businessAppInit\` 双生命周期；但不在此次 Stage0 实施其执行引擎。

## 6. 映射到现有 monorepo（拟变更写集；没有修改）

| Workspace/文件 | 预期调整 |
|---|---|
| \`packages/contracts/src/package-manifest.ts\` 与 \`json-schemas.ts\` | 加 Init Element/Extension/Order 机器合同，去除特殊技术生命周期；保留 Element/Function/Target 字段 |
| \`packages/contracts/src/app-descriptor.ts\` | 明确 Core 入口选择/组合输入语义，不再单独选业务 App Init；保持三层 Core 及 Extensions |
| \`packages/contracts/src/app-lock.ts\` / \`app-contracts.ts\` | 内部封存 Core 入口链、显式 Extension CallBinding/InitBinding；业务失败由 Element 自己定义；保留可用的 Pin/摘要证明 |
| \`tooling/build/src/build.ts\` / \`graph.ts\` / \`resources.ts\` / \`schema-check.ts\` / \`types.ts\` | BUILD 两阶段（Package 生成→完整组合 Package）、静态导入/Init 边校验、无环、Order 冲突与真实打包输出 |
| \`packages/microkernel/src/boot.ts\` / \`verify.ts\` | 仅必要 Pin/安装包身份、加载 Kernel Core.Init，失败记录/退出 |
| \`packages/microkernel/src/kdp.ts\` / \`package-system.ts\` | 取消统一技术 Init/Dispose 编排、Runtime Extension 授权/重解依赖；交接/调用已构建的 Init/Hook 绑定 |
| \`packages/microkernel/src/domain-app.ts\` / \`schema-subset.ts\` | 把业务错误、Schema 处理职责归 Element 或已编译入口；KDP 保留终止/最小诊断及调用桥接 |
| \`packages/domain-harness/src/index.ts\`、clean-install Demo、4 Workspace tests | 公共契约更新，独立产物真实启动和新正反例；不新建平行 Runtime |

旧测试中用于验证非法输入不被误传给业务的反例必须在新的责任层得到等价覆盖；不能为了移除 Kernel 校验就把测试删除。

## 7. L2 验收矩阵（进入代码前冻结）

1. \`BUILD_PACKAGE_SINGLE\`：两个不同层 Package 分别可生成独立确定性单包；无 Init/无公开实现拒绝。
2. \`BUILD_PACKAGE_COMPOSE\`：多 Core+Extensions 组合真实可安装产物，双次构建最终**文件字节一致**，不只是 Lock 一致。
3. \`BUILD_DIRECT_EXTENSION\`：A→B 合法；A→B→C 时 A→C 直接调用拒绝；B→C 合法；未公开 Function 拒绝。
4. \`BUILD_MODULE_ESCAPE\`：不可证明的动态导入/任意跨包裸路径调用在 BUILD 拒绝。
5. \`BUILD_INIT_DAG\`：多条 required Init 边正确、A→B→A 及 Order 与依赖冲突拒绝。
6. \`CORE_ORDER\`：Core.Order 必填且默认按序；Extension.Order 缺失仍可被已声明调用。
7. \`INIT_REENTRY\`：两个合法调用路径触发同一 Extension.Init 的重复调用，由该 Package 自身策略决定；Kernel 不去重。
8. \`HOOK_EXECUTE\`：被选 Provider 在 Owner 明示调用点实际执行；未选/未声明 Provider 不可能进入编译绑定。
9. \`ELEMENT_ERROR\`：Element 内部处理异常并给出自有结果；未处理致命异常仅最终日志/停止，无系统业务级重试/自动转义为成功。
10. \`BOOT_MINIMAL\`：独立安装 Boot→KernelCore.Init→后续已编译主链，加载前有限产物身份验证保留；无 Runtime 重新解析 Package DAG。

## 8. Owner 审核时需最终决定的 L2 细节

| 题目 | 推荐的最小选择 | 注意 |
|---|---|---|
| 完整产物容器 | 一个组合 Package 根目录/归档，内含所有子 Package 与内嵌 Lock/Manifest，固定入口 | 不是第四个业务 Package Layer |
| Init 的强制调用证明 | 标准声明式 InitCall 图 + 编译受限调用入口，不对任意 JS 反射承诺静态证明 | 同时保留 Package 对重复调用的自行决定权 |
| Core.Order 相同或未给 | 缺失或相同在 BUILD 拒绝；采用确定升序 | 最简，不增加隐式 tie-break |
| Extension.Order 未给 | 不触发默认全局排序；由调用者显式顺序决定 | 不能变成“Extension 不得跨层初始化” |
| Core 主链与直接 Extension 限制 | 由组合包编译出 Core 根调用序列；普通 Package 只能直接访问自己的 Extension | 不赋予 Core 隐式调用其他 Core 的特权 |
| 清理 | Package 内自己的 Element/Init 处理；系统只兜底停止 | 不设独立通用 TechnicalDispose/跨包 rollback |
| 启动 Pin/Integrity | 保留最小的安装产物身份及字节核对 | 与构建时业务合规审查严格分离 |

**下一步门槛**：先经 Owner 对 L1/L2 评审确认，再同步修改现有 PRD/L2 正文并物化增量 Task DAG；最后才允许生产源码、测试和 CI 改动。此候选 PR 不执行任何代码任务。
