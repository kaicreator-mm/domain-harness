# SDK 能力及成员目录

由实际根声明、源码文档分类及独立公开合同生成；不是 Runtime registry。包根 import，签名位置为安装包 dist/。按场景读 [指南](../SKILL.md)，领域规则和权限仍由应用负责。

成员范围：列出 DH 声明拥有的公开构造、静态/实例成员及支持合同。外部继承的 JavaScript Error/Node API（如 name/message/stack 或平台静态方法）是外部合同，不计入 DH 自有能力；如需使用请查相应平台声明。符号成员使用源码可读写法（如 [Symbol.asyncDispose]），不把编译器生成的内部 __@ 名称当作公开 API。不要用反射出来的全部继承成员替代声明目录。

## lifecycle

[适用场景、限制与示例](capabilities/lifecycle.md)

### CorePackageMetadata

- 分类：`type`；声明：`dist/kernel-lifecycle.d.ts`
- 职责：Core 插件的执行元数据；顺序的结构合法性由生成者检查。
- 类型声明：`interface CorePackageMetadata { readonly id: string; readonly role: 'core'; readonly order: number; }`
- `CorePackageMetadata#id` · contract property readonly：`string`
- `CorePackageMetadata#order` · contract property readonly：`number`
- `CorePackageMetadata#role` · contract property readonly：`"core"`

### DomainAppContext

- 分类：`type`；声明：`dist/kernel-lifecycle.d.ts`
- 职责：应用自有上下文的最小 appId 合同。
- 类型声明：`interface DomainAppContext { readonly appId: string; }`
- `DomainAppContext#appId` · contract property readonly：`string`

### KernelLifecycle

- 分类：`kdp-element`；声明：`dist/kernel-lifecycle.d.ts`
- 职责：最小 KDP 生命周期 Element： 静态 Core.Order、可选 Init、真实进入记录、逆序 Exit、未处理错误最后兜底。 关闭屏障与等待在途 Init 是资源正确释放所必需，不重新验证 Package 正确性。
- 获取方式：public constructor / new
- 构造声明：`<Context extends DomainAppContext = DomainAppContext>(cores: readonly StaticCorePackage<Context>[], logger?: LifecycleLogger): KernelLifecycle<Context>`
- `KernelLifecycle#[Symbol.asyncDispose]` · instance method：`() => Promise<void>`；调用：`(): Promise<void>`
- `KernelLifecycle#execute` · instance method：`<T>(business: () => T \| Promise<T>) => Promise<T>`；调用：`<T>(business: () => T \| Promise<T>): Promise<T>`
- `KernelLifecycle#run` · instance method：`<T>(context: Context, business: () => T \| Promise<T>) => Promise<T>`；调用：`<T>(context: Context, business: () => T \| Promise<T>): Promise<T>`
- `KernelLifecycle#start` · instance method：`(context: Context) => Promise<void>`；调用：`(context: Context): Promise<void>`

### LifecycleInitContext

- 分类：`type`；声明：`dist/kernel-lifecycle.d.ts`
- 职责：透传应用自有 Context 类型，SDK 不要求额外的 Context 容器或固定业务字段。
- 类型声明：`type LifecycleInitContext<Context extends DomainAppContext = DomainAppContext> = Context & { readonly enter: (element: PackageInitElement<Context>, componentId?: string) => Promise<void>; }`
- `LifecycleInitContext#appId` · contract property readonly：`string`
- `LifecycleInitContext#enter` · contract callback readonly：`(element: PackageInitElement<Context>, componentId?: string) => Promise<void>`；调用：`(element: PackageInitElement<Context>, componentId?: string): Promise<void>`

### LifecycleLogger

- 分类：`type`；声明：`dist/kernel-lifecycle.d.ts`
- 职责：宿主提供的生命周期日志接收器。
- 类型声明：`interface LifecycleLogger { error(record: LifecycleLogRecord): void; }`
- `LifecycleLogger#error` · contract method：`(record: LifecycleLogRecord) => void`；调用：`(record: LifecycleLogRecord): void`

### LifecycleLogRecord

- 分类：`type`；声明：`dist/kernel-lifecycle.d.ts`
- 职责：脱敏生命周期错误记录。
- 类型声明：`interface LifecycleLogRecord { readonly event: 'DH_KDP_UNHANDLED' \| 'DH_KDP_EXIT_FAILED'; readonly stage: 'init' \| 'business' \| 'exit'; readonly message: string; readonly componentId?: string; readonly entryIndex?: number; readonly reasonCode?: 'EXIT_HOOK_FAILED'; }`
- `LifecycleLogRecord#componentId` · contract property readonly optional：`string`
- `LifecycleLogRecord#entryIndex` · contract property readonly optional：`number`
- `LifecycleLogRecord#event` · contract property readonly：`"DH_KDP_UNHANDLED" \| "DH_KDP_EXIT_FAILED"`
- `LifecycleLogRecord#message` · contract property readonly：`string`
- `LifecycleLogRecord#reasonCode` · contract property readonly optional：`"EXIT_HOOK_FAILED"`
- `LifecycleLogRecord#stage` · contract property readonly：`"init" \| "business" \| "exit"`

### PackageInitElement

- 分类：`type`；声明：`dist/kernel-lifecycle.d.ts`
- 职责：可选 Init 与 Exit 的生命周期合同。
- 类型声明：`interface PackageInitElement<Context extends DomainAppContext = DomainAppContext> { readonly start: (context: LifecycleInitContext<Context>) => void \| Promise<void>; [Symbol.asyncDispose]?(): void \| Promise<void>; }`
- `PackageInitElement#[Symbol.asyncDispose]` · contract method optional：`() => void \| Promise<void>`；调用：`(): void \| Promise<void>`
- `PackageInitElement#start` · contract callback readonly：`(context: LifecycleInitContext<Context>) => void \| Promise<void>`；调用：`(context: LifecycleInitContext<Context>): void \| Promise<void>`

### StaticCorePackage

- 分类：`type`；声明：`dist/kernel-lifecycle.d.ts`
- 职责：静态导入的 ESM Package 模块形状，而不是运行时插件管理对象。
- 类型声明：`interface StaticCorePackage<Context extends DomainAppContext = DomainAppContext> { readonly packageMeta: CorePackageMetadata; readonly Init?: new () => PackageInitElement<Context>; }`
- `StaticCorePackage#Init` · contract constructor-value readonly optional：`new () => PackageInitElement<Context>`；构造：`(): PackageInitElement<Context>`
- `StaticCorePackage#packageMeta` · contract property readonly：`CorePackageMetadata`

## workflow

[适用场景、限制与示例](capabilities/workflow.md)

### ModelUsage

- 分类：`type`；声明：`dist/workflow-managed-contract.d.ts`
- 职责：模型使用量保留已观察、估计和未知的区别。
- 类型声明：`interface ModelUsage { readonly input: number \| null; readonly output: number \| null; readonly total: number \| null; readonly kind: 'observed' \| 'estimated' \| 'unavailable'; }`
- `ModelUsage#input` · contract property readonly：`number \| null`
- `ModelUsage#kind` · contract property readonly：`"observed" \| "estimated" \| "unavailable"`
- `ModelUsage#output` · contract property readonly：`number \| null`
- `ModelUsage#total` · contract property readonly：`number \| null`

### NativeWorkflowContext

- 分类：`execution-support`；声明：`dist/native-workflow-composition.d.ts`
- 职责：Standard 层的执行上下文仅组合原生回调，不是动态任务图解释器。
- 获取方式：SDK 回调借用 / 不自行构造
- 构造声明：`(budget: RootBudget, ancestors: readonly AncestorLimit[], depth: number): NativeWorkflowContext`
- `NativeWorkflowContext#child` · instance method：`<T>(maxDescendantDepth: number, action: WorkflowHandler<T>) => Promise<Result<T>>`；调用：`<T>(maxDescendantDepth: number, action: WorkflowHandler<T>): Promise<Result<T>>`
- `NativeWorkflowContext#depth` · instance property readonly：`number`
- `NativeWorkflowContext#invoke` · instance method：`<T>(action: () => T \| Promise<T>) => Promise<Result<T>>`；调用：`<T>(action: () => T \| Promise<T>): Promise<Result<T>>`
- `NativeWorkflowContext#invokeOutcome` · instance method：`<T>(action: () => Result<T> \| Promise<Result<T>>) => Promise<Result<T>>`；调用：`<T>(action: () => Result<T> \| Promise<Result<T>>): Promise<Result<T>>`
- `NativeWorkflowContext#leaf` · instance method：`<T>(options: { readonly start?: () => void \| Promise<void>; readonly run: () => Result<T> \| Promise<Result<T>>; readonly end?: () => void \| Promise<void>; }) => Promise<Result<T>>`；调用：`<T>(options: { readonly start?: () => void \| Promise<void>; readonly run: () => Result<T> \| Promise<Result<T>>; readonly end?: () => void \| Promise<void>; }): Promise<Result<T>>`
- `NativeWorkflowContext#remaining` · instance method：`() => Readonly<{ calls: number; steps: number; maxDescendantDepth: number; }>`；调用：`(): Readonly<{ calls: number; steps: number; maxDescendantDepth: number; }>`
- `NativeWorkflowContext#runId` · instance property：`string`
- `NativeWorkflowContext#scopeId` · instance property：`string`
- `NativeWorkflowContext#signal` · instance property：`AbortSignal`
- `NativeWorkflowContext#work` · instance method：`<T>(units: number, action: () => Result<T> \| Promise<Result<T>>) => Promise<Result<T>>`；调用：`<T>(units: number, action: () => Result<T> \| Promise<Result<T>>): Promise<Result<T>>`

### routeWorkflowOutcome

- 分类：`function`；声明：`dist/native-workflow-composition.d.ts`
- 职责：显式路由六种 Workflow 结果。
- 调用签名：`<T, R>(outcome: Result<T>, exits: Readonly<Record<"COMPLETE" \| "REJECT" \| "ASK" \| "WAIT" \| "UNKNOWN" \| "FAILED", (outcome: Result<T>) => R \| Promise<R>>>): Promise<R>`

### runRecognitionHandling

- 分类：`function`；声明：`dist/native-workflow-composition.d.ts`
- 职责：两个固定叶子角色的便捷组合：识别 COMPLETE 才进入处理，两个角色共享一根额度。 各角色的输入、输出、领域规则与授权由调用方定义；复杂流程直接组合 Session/Context。 完整成功路径需要 2 次调用、5 个步骤和 1 层深度；不是业务全量预算预检或等待恢复协议。
- 调用签名：`<Intent, Output>(limits: WorkflowLimits, recognize: () => StandardWorkflowOutcome<Intent> \| Promise<StandardWorkflowOutcome<Intent>>, handle: (intent: Intent) => StandardWorkflowOutcome<Output> \| Promise<StandardWorkflowOutcome<Output>>): Promise<StandardWorkflowOutcome<Output>>`

### StandardWorkflowOutcome

- 分类：`type`；声明：`dist/standard-workflow.d.ts`
- 职责：明确区分业务完成与非成功终态，禁止把 stopped/未知误报为成功。
- 类型声明：`type StandardWorkflowOutcome<Output> = { readonly status: 'COMPLETE'; readonly value: Output; } \| { readonly status: 'REJECT' \| 'ASK' \| 'WAIT' \| 'UNKNOWN' \| 'FAILED'; readonly reason: { readonly code: string; readonly message: string; }; }`
- `StandardWorkflowOutcome#status` · contract property readonly：`"COMPLETE" \| "REJECT" \| "ASK" \| "WAIT" \| "UNKNOWN" \| "FAILED"`

### StandardWorkflowSession

- 分类：`execution-support`；声明：`dist/native-workflow-composition.d.ts`
- 职责：每个业务根 Workflow 显式创建独立会话，内部不包含 KDP/Package Loader。
- 获取方式：public constructor / new
- 构造声明：`(limits: WorkflowLimits, control?: WorkflowControlOptions): StandardWorkflowSession`
- `StandardWorkflowSession#dispositions` · instance method：`() => readonly WorkflowObservation[]`；调用：`(): readonly WorkflowObservation[]`
- `StandardWorkflowSession#run` · instance method：`<T>(action: WorkflowHandler<T>, completion?: WorkflowCompletionPolicy<T>) => Promise<Result<T>>`；调用：`<T>(action: WorkflowHandler<T>, completion?: WorkflowCompletionPolicy<T>): Promise<Result<T>>`

### WorkflowCompletionPolicy

- 分类：`type`；声明：`dist/workflow-managed-contract.d.ts`
- 职责：受控根任务在真实本地操作结算后验证当前业务目标。
- 类型声明：`interface WorkflowCompletionPolicy<T> { readonly goal: string; readonly requiredKnowledge: readonly EvidenceRequirement<string>[]; readonly terminalReads: number; readonly observe?: (value: T, scope: WorkflowTerminalContext) => Maybe<Outcome<readonly EvidenceObservation<string, unknown>[]>>; readonly validate: (value: T, context: WorkflowContextView) => Outcome<void>; }`
- `WorkflowCompletionPolicy#goal` · contract property readonly：`string`
- `WorkflowCompletionPolicy#observe` · contract callback readonly optional：`(value: T, scope: WorkflowTerminalContext) => Maybe<Outcome<readonly EvidenceObservation<string, unknown>[]>>`；调用：`(value: T, scope: WorkflowTerminalContext): Maybe<Outcome<readonly EvidenceObservation<string, unknown>[]>>`
- `WorkflowCompletionPolicy#requiredKnowledge` · contract property readonly：`readonly EvidenceRequirement<string>[]`
- `WorkflowCompletionPolicy#terminalReads` · contract property readonly：`number`
- `WorkflowCompletionPolicy#validate` · contract callback readonly：`(value: T, context: WorkflowContextView) => Outcome<void>`；调用：`(value: T, context: WorkflowContextView): Outcome<void>`

### WorkflowContextView

- 分类：`type`；声明：`dist/workflow-managed-contract.d.ts`
- 职责：当前作用域的有限语义投影；原生业务值不自动序列化。
- 类型声明：`interface WorkflowContextView { readonly runId: string; readonly scopeId: string; readonly goal: string; readonly stage: string; readonly factRevision: number; readonly planRevision?: number; readonly knowledge: EvidenceResolution<string, unknown> \| undefined; readonly capabilities: readonly string[]; readonly constraints: readonly string[]; readonly progress: readonly Readonly<{ instanceId: string; definitionId: string; state: 'pending' \| 'running' \| 'accepted' \| 'rejected' \| 'skipped' \| 'stale' \| 'unknown' \| 'removed'; }>[]; readonly feedbackRevision: number; readonly remaining: Readonly<{ calls: number; steps: number; maxDescendantDepth: number; work: number; events: number; activeMs: number; wallMs?: number; localWork: number; }>; }`
- `WorkflowContextView#capabilities` · contract property readonly：`readonly string[]`
- `WorkflowContextView#constraints` · contract property readonly：`readonly string[]`
- `WorkflowContextView#factRevision` · contract property readonly：`number`
- `WorkflowContextView#feedbackRevision` · contract property readonly：`number`
- `WorkflowContextView#goal` · contract property readonly：`string`
- `WorkflowContextView#knowledge` · contract property readonly：`EvidenceResolution<string, unknown> \| undefined`
- `WorkflowContextView#planRevision` · contract property readonly optional：`number`
- `WorkflowContextView#progress` · contract property readonly：`readonly Readonly<{ instanceId: string; definitionId: string; state: "pending" \| "running" \| "accepted" \| "rejected" \| "skipped" \| "stale" \| "unknown" \| "removed"; }>[]`
- `WorkflowContextView#remaining` · contract property readonly：`Readonly<{ calls: number; steps: number; maxDescendantDepth: number; work: number; events: number; activeMs: number; wallMs?: number; localWork: number; }>`
- `WorkflowContextView#runId` · contract property readonly：`string`
- `WorkflowContextView#scopeId` · contract property readonly：`string`
- `WorkflowContextView#stage` · contract property readonly：`string`

### WorkflowControlLimits

- 分类：`type`；声明：`dist/workflow-managed-contract.d.ts`
- 职责：统一根任务的有限资源合同。
- 类型声明：`interface WorkflowControlLimits { readonly maxWork: number; readonly maxActiveMs: number; readonly maxWallMs?: number; readonly maxSettlementMs: number; readonly maxNoProgress: number; readonly maxEvents: number; readonly maxActiveScopes: number; readonly model?: Readonly<{ maxCalls: number; maxRetries: number; maxOutputTokens: number; maxReservedTokens?: number; }>; }`
- `WorkflowControlLimits#maxActiveMs` · contract property readonly：`number`
- `WorkflowControlLimits#maxActiveScopes` · contract property readonly：`number`
- `WorkflowControlLimits#maxEvents` · contract property readonly：`number`
- `WorkflowControlLimits#maxNoProgress` · contract property readonly：`number`
- `WorkflowControlLimits#maxSettlementMs` · contract property readonly：`number`
- `WorkflowControlLimits#maxWallMs` · contract property readonly optional：`number`
- `WorkflowControlLimits#maxWork` · contract property readonly：`number`
- `WorkflowControlLimits#model` · contract property readonly optional：`Readonly<{ maxCalls: number; maxRetries: number; maxOutputTokens: number; maxReservedTokens?: number; }>`

### WorkflowControlOptions

- 分类：`type`；声明：`dist/workflow-managed-contract.d.ts`
- 职责：根任务的可信事实策略、取消与同步观察。
- 类型声明：`interface WorkflowControlOptions { readonly limits: WorkflowControlLimits; readonly signal?: AbortSignal; readonly knowledge: WorkflowKnowledgePolicy; readonly current: () => boolean; readonly observe?: (record: WorkflowObservation) => void; readonly evidence?: Readonly<{ required: boolean; emit: (record: WorkflowObservation) => Outcome<void>; }>; }`
- `WorkflowControlOptions#current` · contract callback readonly：`() => boolean`；调用：`(): boolean`
- `WorkflowControlOptions#evidence` · contract property readonly optional：`Readonly<{ required: boolean; emit: (record: WorkflowObservation) => Outcome<void>; }>`
- `WorkflowControlOptions#knowledge` · contract property readonly：`WorkflowKnowledgePolicy`
- `WorkflowControlOptions#limits` · contract property readonly：`WorkflowControlLimits`
- `WorkflowControlOptions#observe` · contract callback readonly optional：`(record: WorkflowObservation) => void`；调用：`(record: WorkflowObservation): void`
- `WorkflowControlOptions#signal` · contract property readonly optional：`AbortSignal`

### WorkflowElement

- 分类：`abstract-contract`；声明：`dist/standard-workflow.d.ts`
- 职责：应用级可复用 Workflow Element，不要求 KDP 充当工作流执行中心。
- 获取方式：abstract contract / 不可直接 new
- 构造声明：`<Input, Output>(): WorkflowElement<Input, Output>`
- `WorkflowElement#run` · instance method：`(input: Input) => Promise<StandardWorkflowOutcome<Output>>`；调用：`(input: Input): Promise<StandardWorkflowOutcome<Output>>`

### WorkflowKnowledgeFrame

- 分类：`type`；声明：`dist/workflow-managed-contract.d.ts`
- 职责：当前可信证据范围与单调事实版本。
- 类型声明：`interface WorkflowKnowledgeFrame { readonly epoch: number; readonly context: EvidenceContext; }`
- `WorkflowKnowledgeFrame#context` · contract property readonly：`EvidenceContext`
- `WorkflowKnowledgeFrame#epoch` · contract property readonly：`number`

### WorkflowKnowledgePolicy

- 分类：`type`；声明：`dist/workflow-managed-contract.d.ts`
- 职责：域提供事实读取与比较策略，SDK 只执行有限验证。
- 类型声明：`interface WorkflowKnowledgePolicy { readonly current: () => WorkflowKnowledgeFrame; readonly equal: (key: string, left: unknown, right: unknown) => boolean; readonly rank?: (observation: EvidenceObservation<string, unknown>) => number; readonly maxItems: number; }`
- `WorkflowKnowledgePolicy#current` · contract callback readonly：`() => WorkflowKnowledgeFrame`；调用：`(): WorkflowKnowledgeFrame`
- `WorkflowKnowledgePolicy#equal` · contract callback readonly：`(key: string, left: unknown, right: unknown) => boolean`；调用：`(key: string, left: unknown, right: unknown): boolean`
- `WorkflowKnowledgePolicy#maxItems` · contract property readonly：`number`
- `WorkflowKnowledgePolicy#rank` · contract callback readonly optional：`(observation: EvidenceObservation<string, unknown>) => number`；调用：`(observation: EvidenceObservation<string, unknown>): number`

### WorkflowLimits

- 分类：`type`；声明：`dist/native-workflow-composition.d.ts`
- 职责：同一根 Workflow 的共享调用和步骤额度；不是 Package 的运行时安全验证。
- 类型声明：`interface WorkflowLimits { readonly maxCalls: number; readonly maxSteps: number; readonly maxDepth: number; }`
- `WorkflowLimits#maxCalls` · contract property readonly：`number`
- `WorkflowLimits#maxDepth` · contract property readonly：`number`
- `WorkflowLimits#maxSteps` · contract property readonly：`number`

### WorkflowObservation

- 分类：`type`；声明：`dist/workflow-managed-contract.d.ts`
- 职责：运行时最小观察合同；候选结果不是最终裁定。
- 类型声明：`type WorkflowObservation = Readonly<{ runId: string; scopeId: string; parentScopeId?: string; seq: number; factRevision: number; planRevision?: number; stage: string; }> & (Readonly<{ kind: 'scope'; phase: 'open' \| 'stopping' \| 'candidate' \| 'closed'; reason: string; localQuiescent: boolean; outcome?: Outcome<void>; candidateSeq?: number; delivery: 'pending' \| 'satisfied' \| 'failed' \| 'not-required'; }> \| Readonly<{ kind: 'node'; occurrence: WorkflowOccurrence; phase: 'pre-reject' \| 'enter' \| 'skip' \| 'actual' \| 'candidate' \| 'disposition' \| 'invalidate'; entered: boolean; acceptance: 'pending' \| 'accepted' \| 'rejected' \| 'not-applicable' \| 'stale'; candidateSeq?: number; delivery: 'pending' \| 'satisfied' \| 'failed' \| 'not-required'; outcome?: Outcome<void>; post: 'pending' \| 'passed' \| 'failed' \| 'unknown' \| 'not-applicable'; effect: 'none' \| 'committed' \| 'unknown' \| 'not-applicable'; receiptId?: string; reason: string; sources: readonly Readonly<{ key: string; id: string; scope: string; revision: string; status: string; }>[]; detail: StandardJsonValue; }> \| Readonly<{ kind: 'region'; regionId: string; action: 'proposal-rejected' \| 'edit' \| 'feedback' \| 'revalidate' \| 'complete'; beforeRevision: number; afterRevision: number; reason: string; detail: StandardJsonValue; }> \| Readonly<{ kind: 'actor'; definitionId: string; detail: StandardJsonValue; }> \| Readonly<{ kind: 'model'; decisionId: string; action: 'not-needed' \| 'unavailable'; reason: string; usage: ModelUsage; detail: StandardJsonValue; }> \| Readonly<{ kind: 'model'; requestId: string; attempt: number; action: 'selected' \| 'retry' \| 'fallback' \| 'result'; profileId: string; model: string; protocol: 'openai-chat' \| 'anthropic-messages'; reason: string; usage: ModelUsage; detail: StandardJsonValue; }> \| Readonly<{ kind: 'evidence'; delivery: 'failed'; required: boolean; reason: string; }>)`
- `WorkflowObservation#factRevision` · contract property：`number`
- `WorkflowObservation#kind` · contract property：`"model" \| "scope" \| "node" \| "region" \| "actor" \| "evidence"`
- `WorkflowObservation#parentScopeId` · contract property optional：`string`
- `WorkflowObservation#planRevision` · contract property optional：`number`
- `WorkflowObservation#runId` · contract property：`string`
- `WorkflowObservation#scopeId` · contract property：`string`
- `WorkflowObservation#seq` · contract property：`number`
- `WorkflowObservation#stage` · contract property：`string`

### WorkflowOccurrence

- 分类：`type`；声明：`dist/workflow-managed-contract.d.ts`
- 职责：SDK 分配的作用域、定义、实例和执行尝试标识。
- 类型声明：`interface WorkflowOccurrence { readonly runId: string; readonly scopeId: string; readonly parentScopeId?: string; readonly definitionId: string; readonly instanceId: string; readonly attempt?: number; }`
- `WorkflowOccurrence#attempt` · contract property readonly optional：`number`
- `WorkflowOccurrence#definitionId` · contract property readonly：`string`
- `WorkflowOccurrence#instanceId` · contract property readonly：`string`
- `WorkflowOccurrence#parentScopeId` · contract property readonly optional：`string`
- `WorkflowOccurrence#runId` · contract property readonly：`string`
- `WorkflowOccurrence#scopeId` · contract property readonly：`string`

### WorkflowRoutes

- 分类：`type`；声明：`dist/native-workflow-composition.d.ts`
- 职责：以普通 TypeScript 函数显式声明全部结果分支，无中央 FunctionRef/Target。
- 类型声明：`type WorkflowRoutes<T, R> = Readonly<Record<Status, (outcome: Result<T>) => R \| Promise<R>>>`
- `WorkflowRoutes#ASK` · contract callback readonly：`(outcome: Result<T>) => R \| Promise<R>`；调用：`(outcome: Result<T>): R \| Promise<R>`
- `WorkflowRoutes#COMPLETE` · contract callback readonly：`(outcome: Result<T>) => R \| Promise<R>`；调用：`(outcome: Result<T>): R \| Promise<R>`
- `WorkflowRoutes#FAILED` · contract callback readonly：`(outcome: Result<T>) => R \| Promise<R>`；调用：`(outcome: Result<T>): R \| Promise<R>`
- `WorkflowRoutes#REJECT` · contract callback readonly：`(outcome: Result<T>) => R \| Promise<R>`；调用：`(outcome: Result<T>): R \| Promise<R>`
- `WorkflowRoutes#UNKNOWN` · contract callback readonly：`(outcome: Result<T>) => R \| Promise<R>`；调用：`(outcome: Result<T>): R \| Promise<R>`
- `WorkflowRoutes#WAIT` · contract callback readonly：`(outcome: Result<T>) => R \| Promise<R>`；调用：`(outcome: Result<T>): R \| Promise<R>`

### WorkflowTerminalContext

- 分类：`type`；声明：`dist/workflow-managed-contract.d.ts`
- 职责：已预留的只读终止观察窗口，不提供普通业务调用入口。
- 类型声明：`interface WorkflowTerminalContext { readonly signal: AbortSignal; read<T>(action: (signal: AbortSignal) => Maybe<Outcome<T>>): Promise<Outcome<T>>; }`
- `WorkflowTerminalContext#read` · contract method：`<T>(action: (signal: AbortSignal) => Maybe<Outcome<T>>) => Promise<Outcome<T>>`；调用：`<T>(action: (signal: AbortSignal) => Maybe<Outcome<T>>): Promise<Outcome<T>>`
- `WorkflowTerminalContext#signal` · contract property readonly：`AbortSignal`

### XStateWorkflowElement

- 分类：`standard-element`；声明：`dist/standard-workflow.d.ts`
- 职责：XState v5 标准 Workflow Element。 从真实 actor logic 派生 Input 与已完成 Output 类型，防止弱化 TS 类型检查。
- 获取方式：public constructor / new
- 构造声明：`<Logic extends AnyActorLogic, Output>(logic: Logic, mapOutput: (output: OutputFrom<Logic>) => StandardWorkflowOutcome<Output>): XStateWorkflowElement<Logic, Output>`
- `XStateWorkflowElement#run` · instance method：`(input: InputFrom<Logic>) => Promise<StandardWorkflowOutcome<Output>>`；调用：`(input: InputFrom<Logic>): Promise<StandardWorkflowOutcome<Output>>`

## structured-data

[适用场景、限制与示例](capabilities/structured-data.md)

### JsonReader

- 分类：`standard-element`；声明：`dist/standard-files.d.ts`
- 职责：应用级 JSON Reader Element，可在不同资源间复用同一实例。
- 获取方式：public constructor / new
- 构造声明：`(): JsonReader`
- `JsonReader#read` · instance method：`(source: string) => StandardFileOutcome<StandardJsonValue>`；调用：`(source: string): StandardFileOutcome<StandardJsonValue>`
- `JsonReader#write` · instance method：`(value: StandardJsonValue) => StandardFileOutcome<string>`；调用：`(value: StandardJsonValue): StandardFileOutcome<string>`

### readJson

- 分类：`function`；声明：`dist/standard-files.d.ts`
- 职责：Module 级公开 Function，不需要包装成一个无业务意义的 Class。
- 调用签名：`(source: string): StandardFileOutcome<StandardJsonValue>`

### readYaml

- 分类：`function`；声明：`dist/standard-files.d.ts`
- 职责：有界 YAML 文本解析；不读取文件。
- 调用签名：`(source: string): StandardFileOutcome<StandardJsonValue>`

### StandardFileOutcome

- 分类：`type`；声明：`dist/standard-files.d.ts`
- 职责：文本解析或序列化的成功、未知与失败。
- 类型声明：`type StandardFileOutcome<T> = { readonly kind: 'SUCCEEDED'; readonly value: T; } \| { readonly kind: 'UNKNOWN'; readonly unknownReason: { readonly code: string; readonly message: string; }; } \| { readonly kind: 'FAILED'; readonly failure: { readonly code: string; readonly message: string; }; }`
- `StandardFileOutcome#kind` · contract property readonly：`"UNKNOWN" \| "FAILED" \| "SUCCEEDED"`

### StandardJsonValue

- 分类：`type`；声明：`dist/standard-files.d.ts`
- 职责：可复用 Standard 负责解析业务数据，不赋予 SDK 业务文件读写权限。
- 类型声明：`type StandardJsonValue = null \| boolean \| number \| string \| readonly StandardJsonValue[] \| { readonly [key: string]: StandardJsonValue; }`

### writeJson

- 分类：`function`；声明：`dist/standard-files.d.ts`
- 职责：将结构化值序列化为 JSON 文本。
- 调用签名：`(value: StandardJsonValue): StandardFileOutcome<string>`

### writeYaml

- 分类：`function`；声明：`dist/standard-files.d.ts`
- 职责：将结构化值序列化为 YAML 文本。
- 调用签名：`(value: StandardJsonValue): StandardFileOutcome<string>`

### YamlReader

- 分类：`standard-element`；声明：`dist/standard-files.d.ts`
- 职责：应用级 YAML Reader Element，基于 yaml 而非手工解析。
- 获取方式：public constructor / new
- 构造声明：`(): YamlReader`
- `YamlReader#read` · instance method：`(source: string) => StandardFileOutcome<StandardJsonValue>`；调用：`(source: string): StandardFileOutcome<StandardJsonValue>`
- `YamlReader#write` · instance method：`(value: StandardJsonValue) => StandardFileOutcome<string>`；调用：`(value: StandardJsonValue): StandardFileOutcome<string>`

## query

[适用场景、限制与示例](capabilities/query.md)

### BoundedQueryElement

- 分类：`standard-element`；声明：`dist/standard-query.d.ts`
- 职责：同步、无副作用的 Standard 查询封装；领域过滤条件来自可信生成期业务代码。 保留调用方源顺序，不隐式排序，也不将截断的候选列表视为完备结论。
- 获取方式：public constructor / new
- 构造声明：`(): BoundedQueryElement`
- `BoundedQueryElement#select` · instance method：`<T>(source: readonly T[], predicate: (item: T) => boolean, limits: BoundedQueryLimits) => BoundedQueryResult<T>`；调用：`<T>(source: readonly T[], predicate: (item: T) => boolean, limits: BoundedQueryLimits): BoundedQueryResult<T>`

### BoundedQueryLimits

- 分类：`type`；声明：`dist/standard-query.d.ts`
- 职责：有界查询预算由调用方设定；SDK 不规定领域数据的 Schema 或适用性。
- 类型声明：`interface BoundedQueryLimits { readonly maxVisited: number; readonly maxReturned: number; }`
- `BoundedQueryLimits#maxReturned` · contract property readonly：`number`
- `BoundedQueryLimits#maxVisited` · contract property readonly：`number`

### BoundedQueryResult

- 分类：`type`；声明：`dist/standard-query.d.ts`
- 职责：complete 表示所有输入记录均已判断；部分结果不可当作完整事实。
- 类型声明：`interface BoundedQueryResult<T> { readonly items: readonly T[]; readonly visited: number; readonly complete: boolean; readonly truncated: boolean; readonly truncationReason?: BoundedQueryTruncationReason; }`
- `BoundedQueryResult#complete` · contract property readonly：`boolean`
- `BoundedQueryResult#items` · contract property readonly：`readonly T[]`
- `BoundedQueryResult#truncated` · contract property readonly：`boolean`
- `BoundedQueryResult#truncationReason` · contract property readonly optional：`BoundedQueryTruncationReason`
- `BoundedQueryResult#visited` · contract property readonly：`number`

### BoundedQueryTruncationReason

- 分类：`type`；声明：`dist/standard-query.d.ts`
- 职责：查询截断的预算原因。
- 类型声明：`type BoundedQueryTruncationReason = 'VISIT_LIMIT' \| 'RESULT_LIMIT'`

### GraphPath

- 分类：`type`；声明：`dist/standard-vector-graph.d.ts`
- 职责：节点及边类型组成的路径。
- 类型声明：`interface GraphPath { readonly nodes: readonly string[]; readonly edgeTypes: readonly string[]; }`
- `GraphPath#edgeTypes` · contract property readonly：`readonly string[]`
- `GraphPath#nodes` · contract property readonly：`readonly string[]`

### GraphQueryElement

- 分类：`standard-element`；声明：`dist/standard-vector-graph.d.ts`
- 职责：有向类型关系图的有限 BFS；每个节点最多产出一条最短发现路径。
- 获取方式：public constructor / new
- 构造声明：`(): GraphQueryElement`
- `GraphQueryElement#search` · instance method：`(edges: readonly TypedGraphEdge[], options: GraphQueryOptions) => GraphQueryResult`；调用：`(edges: readonly TypedGraphEdge[], options: GraphQueryOptions): GraphQueryResult`

### GraphQueryLimits

- 分类：`type`；声明：`dist/standard-vector-graph.d.ts`
- 职责：图查询的深度、访问及结果限额。
- 类型声明：`interface GraphQueryLimits { readonly maxDepth: number; readonly maxVisited: number; readonly maxReturned: number; }`
- `GraphQueryLimits#maxDepth` · contract property readonly：`number`
- `GraphQueryLimits#maxReturned` · contract property readonly：`number`
- `GraphQueryLimits#maxVisited` · contract property readonly：`number`

### GraphQueryOptions

- 分类：`type`；声明：`dist/standard-vector-graph.d.ts`
- 职责：图查询的起点、方向和可选目标。
- 类型声明：`interface GraphQueryOptions { readonly start: string; readonly target?: string; readonly direction: 'OUT' \| 'IN' \| 'BOTH'; readonly relationTypes?: readonly string[]; readonly limits: GraphQueryLimits; }`
- `GraphQueryOptions#direction` · contract property readonly：`"OUT" \| "IN" \| "BOTH"`
- `GraphQueryOptions#limits` · contract property readonly：`GraphQueryLimits`
- `GraphQueryOptions#relationTypes` · contract property readonly optional：`readonly string[]`
- `GraphQueryOptions#start` · contract property readonly：`string`
- `GraphQueryOptions#target` · contract property readonly optional：`string`

### GraphQueryResult

- 分类：`type`；声明：`dist/standard-vector-graph.d.ts`
- 职责：有限图路径及完整性。
- 类型声明：`interface GraphQueryResult { readonly paths: readonly GraphPath[]; readonly visited: number; readonly complete: boolean; readonly truncated: boolean; readonly truncationReason?: 'VISIT_LIMIT' \| 'RESULT_LIMIT'; }`
- `GraphQueryResult#complete` · contract property readonly：`boolean`
- `GraphQueryResult#paths` · contract property readonly：`readonly GraphPath[]`
- `GraphQueryResult#truncated` · contract property readonly：`boolean`
- `GraphQueryResult#truncationReason` · contract property readonly optional：`"VISIT_LIMIT" \| "RESULT_LIMIT"`
- `GraphQueryResult#visited` · contract property readonly：`number`

### TypedGraphEdge

- 分类：`type`；声明：`dist/standard-vector-graph.d.ts`
- 职责：有向带类型的图关系。
- 类型声明：`interface TypedGraphEdge { readonly from: string; readonly to: string; readonly type: string; }`
- `TypedGraphEdge#from` · contract property readonly：`string`
- `TypedGraphEdge#to` · contract property readonly：`string`
- `TypedGraphEdge#type` · contract property readonly：`string`

### VectorCandidate

- 分类：`type`；声明：`dist/standard-vector-graph.d.ts`
- 职责：领域选择由调用方负责；SDK 不定义候选记录或业务 Scope 的 Schema。
- 类型声明：`interface VectorCandidate<T> { readonly id: string; readonly vector: readonly number[]; readonly item: T; }`
- `VectorCandidate#id` · contract property readonly：`string`
- `VectorCandidate#item` · contract property readonly：`T`
- `VectorCandidate#vector` · contract property readonly：`readonly number[]`

### VectorMatch

- 分类：`type`；声明：`dist/standard-vector-graph.d.ts`
- 职责：一个实际向量匹配及距离。
- 类型声明：`interface VectorMatch<T> { readonly id: string; readonly item: T; readonly distance: number; }`
- `VectorMatch#distance` · contract property readonly：`number`
- `VectorMatch#id` · contract property readonly：`string`
- `VectorMatch#item` · contract property readonly：`T`

### VectorQueryElement

- 分类：`standard-element`；声明：`dist/standard-vector-graph.d.ts`
- 职责：有限内存 Top-K；可信同步 Scope 不得改变源成员及顺序或 item 的业务属性，不是安全沙箱。
- 获取方式：public constructor / new
- 构造声明：`(): VectorQueryElement`
- `VectorQueryElement#search` · instance method：`<T>(source: readonly VectorCandidate<T>[], query: readonly number[], inScope: (item: T) => boolean, options: VectorQueryOptions) => VectorQueryResult<T>`；调用：`<T>(source: readonly VectorCandidate<T>[], query: readonly number[], inScope: (item: T) => boolean, options: VectorQueryOptions): VectorQueryResult<T>`

### VectorQueryOptions

- 分类：`type`；声明：`dist/standard-vector-graph.d.ts`
- 职责：向量度量、维度及查询限制。
- 类型声明：`interface VectorQueryOptions { readonly topK: number; readonly maxVisited: number; readonly dimension: number; readonly metric: 'COSINE' \| 'L2'; }`
- `VectorQueryOptions#dimension` · contract property readonly：`number`
- `VectorQueryOptions#maxVisited` · contract property readonly：`number`
- `VectorQueryOptions#metric` · contract property readonly：`"COSINE" \| "L2"`
- `VectorQueryOptions#topK` · contract property readonly：`number`

### VectorQueryResult

- 分类：`type`；声明：`dist/standard-vector-graph.d.ts`
- 职责：有限向量检索的匹配与完整性。
- 类型声明：`interface VectorQueryResult<T> { readonly matches: readonly VectorMatch<T>[]; readonly visited: number; readonly complete: boolean; readonly truncated: boolean; readonly truncationReason?: 'VISIT_LIMIT' \| 'RESULT_LIMIT'; }`
- `VectorQueryResult#complete` · contract property readonly：`boolean`
- `VectorQueryResult#matches` · contract property readonly：`readonly VectorMatch<T>[]`
- `VectorQueryResult#truncated` · contract property readonly：`boolean`
- `VectorQueryResult#truncationReason` · contract property readonly optional：`"VISIT_LIMIT" \| "RESULT_LIMIT"`
- `VectorQueryResult#visited` · contract property readonly：`number`

## database

[适用场景、限制与示例](capabilities/database.md)

### SQLiteDatabaseElement

- 分类：`standard-element`；声明：`dist/standard-sqlite.d.ts`
- 职责：普通 Standard Element；业务实例显式拥有连接，KDP 不创建全局数据库。
- 获取方式：public constructor / new
- 构造声明：`(path: string, options?: SQLiteDatabaseOptions): SQLiteDatabaseElement`
- `SQLiteDatabaseElement#close` · instance method：`() => void`；调用：`(): void`
- `SQLiteDatabaseElement#select` · instance method：`<T>(sql: string, parameters: readonly SQLiteScalar[], limit: number) => readonly T[]`；调用：`<T>(sql: string, parameters: readonly SQLiteScalar[], limit: number): readonly T[]`
- `SQLiteDatabaseElement#transaction` · instance method：`<T>(work: (tx: SQLiteTransaction) => T & SQLiteNonThenable<T>) => T`；调用：`<T>(work: (tx: SQLiteTransaction) => T & SQLiteNonThenable<T>): T`

### SQLiteDatabaseError

- 分类：`error`；声明：`dist/standard-sqlite.d.ts`
- 职责：SDK 只暴露脱敏错误码和操作阶段，不打印路径、SQL 或绑定参数。
- 获取方式：public constructor / new
- 构造声明：`(code: SQLiteErrorCode, stage: string, details?: SQLiteTerminalFailureDetails, options?: ErrorOptions): SQLiteDatabaseError`
- `SQLiteDatabaseError#code` · instance property readonly：`SQLiteErrorCode`
- `SQLiteDatabaseError#primaryCode` · instance property readonly optional：`SQLiteFailureOrigin`
- `SQLiteDatabaseError#rollbackCode` · instance property readonly optional：`SQLiteErrorCode`
- `SQLiteDatabaseError#stage` · instance property readonly：`string`

### SQLiteDatabaseOptions

- 分类：`type`；声明：`dist/standard-sqlite.d.ts`
- 职责：打开数据库的只读及等待选项。
- 类型声明：`interface SQLiteDatabaseOptions { readonly readOnly?: boolean; readonly busyTimeoutMs?: number; }`
- `SQLiteDatabaseOptions#busyTimeoutMs` · contract property readonly optional：`number`
- `SQLiteDatabaseOptions#readOnly` · contract property readonly optional：`boolean`

### SQLiteErrorCode

- 分类：`type`；声明：`dist/standard-sqlite.d.ts`
- 职责：稳定的数据库错误分类。
- 类型声明：`type SQLiteErrorCode = 'INVALID_INPUT' \| 'CLOSED' \| 'BUSY' \| 'LOCKED' \| 'READONLY' \| 'CONSTRAINT' \| 'IO' \| 'OPEN' \| 'AUTH' \| 'SQL' \| 'REENTRANT' \| 'INACTIVE_TX' \| 'ASYNC_TX' \| 'LIMIT' \| 'COMMIT_UNKNOWN' \| 'ROLLBACK_FAILED'`

### SQLiteFailureOrigin

- 分类：`type`；声明：`dist/standard-sqlite.d.ts`
- 职责：终态复合故障的起因：SDK 归类码，或业务回调自身的失败。
- 类型声明：`type SQLiteFailureOrigin = SQLiteErrorCode \| 'BUSINESS'`

### SQLiteNonThenable

- 分类：`type`；声明：`dist/standard-sqlite.d.ts`
- 职责：同步事务回调的非异步结果类型。
- 类型声明：`type SQLiteNonThenable<T> = T extends PromiseLike<unknown> ? never : T`

### SQLiteScalar

- 分类：`type`；声明：`dist/standard-sqlite.d.ts`
- 职责：数据库参数的标量值域。
- 类型声明：`type SQLiteScalar = string \| number \| bigint \| Uint8Array \| null`

### SQLiteTerminalFailureDetails

- 分类：`type`；声明：`dist/standard-sqlite.d.ts`
- 职责：数据库终态失败的脱敏详情。
- 类型声明：`interface SQLiteTerminalFailureDetails { readonly primaryCode?: SQLiteFailureOrigin; readonly rollbackCode?: SQLiteErrorCode; }`
- `SQLiteTerminalFailureDetails#primaryCode` · contract property readonly optional：`SQLiteFailureOrigin`
- `SQLiteTerminalFailureDetails#rollbackCode` · contract property readonly optional：`SQLiteErrorCode`

### SQLiteTransaction

- 分类：`type`；声明：`dist/standard-sqlite.d.ts`
- 职责：本次同步事务的借用操作接口。
- 类型声明：`interface SQLiteTransaction { readonly active: boolean; run(sql: string, parameters: readonly SQLiteScalar[]): { changes: number; }; get<T>(sql: string, parameters: readonly SQLiteScalar[]): T \| undefined; }`
- `SQLiteTransaction#active` · contract property readonly：`boolean`
- `SQLiteTransaction#get` · contract method：`<T>(sql: string, parameters: readonly SQLiteScalar[]) => T \| undefined`；调用：`<T>(sql: string, parameters: readonly SQLiteScalar[]): T \| undefined`
- `SQLiteTransaction#run` · contract method：`(sql: string, parameters: readonly SQLiteScalar[]) => { changes: number; }`；调用：`(sql: string, parameters: readonly SQLiteScalar[]): { changes: number; }`

## expression

[适用场景、限制与示例](capabilities/expression.md)

### BoundedExpressionElement

- 分类：`standard-element`；声明：`dist/standard-expression.d.ts`
- 职责：仅计算有限纯 JSON 表达式，不执行领域代码、不验证 Package。
- 获取方式：public constructor / new
- 构造声明：`(): BoundedExpressionElement`
- `BoundedExpressionElement#evaluate` · instance method：`(astJson: string, inputJson: string, options?: Partial<ExpressionLimits>) => ExpressionScalar`；调用：`(astJson: string, inputJson: string, options?: Partial<ExpressionLimits>): ExpressionScalar`

### ExpressionLimits

- 分类：`type`；声明：`dist/standard-expression.d.ts`
- 职责：表达式输入、节点、深度和运算限制。
- 类型声明：`interface ExpressionLimits { readonly maxAstNodes: number; readonly maxAstDepth: number; readonly maxInputBytes: number; readonly maxOperations: number; readonly maxPathSegments: number; readonly maxStringBytes: number; }`
- `ExpressionLimits#maxAstDepth` · contract property readonly：`number`
- `ExpressionLimits#maxAstNodes` · contract property readonly：`number`
- `ExpressionLimits#maxInputBytes` · contract property readonly：`number`
- `ExpressionLimits#maxOperations` · contract property readonly：`number`
- `ExpressionLimits#maxPathSegments` · contract property readonly：`number`
- `ExpressionLimits#maxStringBytes` · contract property readonly：`number`

### ExpressionScalar

- 分类：`type`；声明：`dist/standard-expression.d.ts`
- 职责：有限表达式的标量结果。
- 类型声明：`type ExpressionScalar = string \| number \| boolean \| null`

## cli

[适用场景、限制与示例](capabilities/cli.md)

### CliElement

- 分类：`standard-element`；声明：`dist/standard-cli.d.ts`
- 职责：可信前台 CLI 的通用执行 Element：无 shell、超时、stdout/stderr 合计字节限制和脱敏错误。 Linux 负责启动的进程组，其他平台仅负责直接子进程；不保证清理逃离进程组的后代。 调用方负责选择可信可执行文件、参数、权限、输入输出验证和业务结果；非沙箱或授权器。
- 获取方式：public constructor / new
- 构造声明：`(timeoutMs?: number, maxOutputBytes?: number): CliElement`
- `CliElement#run` · instance method：`(file: string, args: readonly string[]) => Promise<string>`；调用：`(file: string, args: readonly string[]): Promise<string>`

## semantic-interaction

[适用场景、限制与示例](capabilities/semantic-interaction.md)

### CandidateAssessment

- 分类：`type`；声明：`dist/standard-candidates.d.ts`
- 职责：领域对候选合法性的判断。
- 类型声明：`type CandidateAssessment = Readonly<{ status: 'eligible'; }> \| Readonly<{ status: 'excluded' \| 'unknown' \| 'failed'; reason: string; }>`
- `CandidateAssessment#status` · contract property：`"failed" \| "unknown" \| "eligible" \| "excluded"`

### CandidateEntry

- 分类：`type`；声明：`dist/standard-candidates.d.ts`
- 职责：领域候选及其来源范围和版本。
- 类型声明：`interface CandidateEntry<T> { readonly id: string; readonly scope: string; readonly revision: string; readonly value: T; }`
- `CandidateEntry#id` · contract property readonly：`string`
- `CandidateEntry#revision` · contract property readonly：`string`
- `CandidateEntry#scope` · contract property readonly：`string`
- `CandidateEntry#value` · contract property readonly：`T`

### CandidatePreparation

- 分类：`type`；声明：`dist/standard-candidates.d.ts`
- 职责：有限候选组织、完整性及显示内容。
- 类型声明：`type CandidatePreparation<T> = Readonly<{ status: 'failed'; complete: false; reason: FailureCode; }> \| Readonly<{ status: 'available' \| 'empty' \| 'unknown'; complete: boolean; visited: number; scope: string; revision: string; entries: readonly CandidateEntry<T>[]; options: readonly InteractionCandidate[]; comparison: Comparison; issues: readonly Readonly<{ id: string; status: 'excluded' \| 'unknown'; reason: string; }>[]; incompleteReasons: readonly IncompleteReason[]; }>`
- `CandidatePreparation#complete` · contract property：`boolean`
- `CandidatePreparation#status` · contract property：`"failed" \| "unknown" \| "available" \| "empty"`

### CandidateProjection

- 分类：`type`；声明：`dist/standard-candidates.d.ts`
- 职责：候选显示投影；不授予权限。
- 类型声明：`interface CandidateProjection { readonly label: string; readonly reason?: string; readonly scope?: string; readonly priority: number; readonly recommended?: boolean; readonly cells: readonly string[]; }`
- `CandidateProjection#cells` · contract property readonly：`readonly string[]`
- `CandidateProjection#label` · contract property readonly：`string`
- `CandidateProjection#priority` · contract property readonly：`number`
- `CandidateProjection#reason` · contract property readonly optional：`string`
- `CandidateProjection#recommended` · contract property readonly optional：`boolean`
- `CandidateProjection#scope` · contract property readonly optional：`string`

### CandidateSource

- 分类：`type`；声明：`dist/standard-candidates.d.ts`
- 职责：实际候选集的来源状态。
- 类型声明：`type CandidateSource<T> = Readonly<{ scope: string; revision: string; }> & (Readonly<{ status: 'complete' \| 'incomplete'; entries: readonly CandidateEntry<T>[]; }> \| Readonly<{ status: 'failed'; }>)`
- `CandidateSource#revision` · contract property：`string`
- `CandidateSource#scope` · contract property：`string`
- `CandidateSource#status` · contract property：`"failed" \| "complete" \| "incomplete"`

### ClarificationElement

- 分类：`standard-element`；声明：`dist/standard-clarification.d.ts`
- 职责：一次不可变澄清准备；由 InteractionElement 绑定实际发布和有效响应，不拥有交互生命周期。
- 获取方式：仅 factory / 不可直接 new
- `ClarificationElement.prepare` · static method：`<K extends string, E extends string, V>(evidence: EvidenceResolution<E, V>, selection: DecisionSelection<K>, template: Omit<InteractionPromptSpec, "fields">, fields: readonly ClarificationField<E, V>[]) => ClarificationPreparation<E>`；调用：`<K extends string, E extends string, V>(evidence: EvidenceResolution<E, V>, selection: DecisionSelection<K>, template: Omit<InteractionPromptSpec, "fields">, fields: readonly ClarificationField<E, V>[]): ClarificationPreparation<E>`

### ClarificationField

- 分类：`type`；声明：`dist/standard-clarification.d.ts`
- 职责：领域字段与证据键的显式映射。
- 类型声明：`interface ClarificationField<E extends string, V> { readonly field: InteractionField; readonly evidenceKey: E; readonly applicable: DecisionCondition; readonly confirmation: 'accepted' \| 'user'; readonly projectPrefill?: (observation: Known<E, V>) => Prefill \| undefined; readonly candidates?: Readonly<{ current: Readonly<{ scope: string; revision: string; }>; result: CandidatePreparation<unknown>; }>; }`
- `ClarificationField#applicable` · contract property readonly：`DecisionCondition`
- `ClarificationField#candidates` · contract property readonly optional：`Readonly<{ current: Readonly<{ scope: string; revision: string; }>; result: CandidatePreparation<unknown>; }>`
- `ClarificationField#confirmation` · contract property readonly：`"user" \| "accepted"`
- `ClarificationField#evidenceKey` · contract property readonly：`E`
- `ClarificationField#field` · contract property readonly：`InteractionField`
- `ClarificationField#projectPrefill` · contract callback readonly optional：`(observation: Known<E, V>) => Prefill \| undefined`；调用：`(observation: Readonly<{ key: E; origin: EvidenceOrigin; source: Readonly<{ id: string; scope: string; revision: string; validity?: Readonly<{ from: number; until: number; }>; }>; }> & Readonly<{ state: "known"; value: V; }>): { readonly value: Value; readonly source: string; } \| undefined`

### ClarificationPreparation

- 分类：`type`；声明：`dist/standard-clarification.d.ts`
- 职责：当前证据及决策对应的澄清准备；表单仅由交互实例实际发布。
- 类型声明：`type ClarificationPreparation<E extends string> = Readonly<{ status: 'failed'; reason: 'LIMIT' \| 'INVALID_MAPPING' \| 'EVIDENCE_FAILED' \| 'DECISION_FAILED' \| 'CANDIDATE_FAILED' \| 'STALE_CANDIDATES' \| 'INVALID_PROMPT' \| 'PREFILL_FAILED'; }> \| Readonly<{ status: 'ready'; }> \| Readonly<{ status: 'unresolved' \| 'blocked' \| 'conflict'; reason: 'DECISION' \| 'FIELD_APPLICABILITY' \| 'EVIDENCE_NOT_APPLICABLE' \| 'NO_FIELDS' \| 'NO_SUBMISSION'; }> \| Readonly<{ status: 'prompt'; clarification: ClarificationElement<E>; }>`
- `ClarificationPreparation#status` · contract property：`"failed" \| "ready" \| "conflict" \| "unresolved" \| "blocked" \| "prompt"`

### ClarificationResponse

- 分类：`type`；声明：`dist/standard-clarification.d.ts`
- 职责：显式用户响应的映射结果。
- 类型声明：`type ClarificationResponse<E extends string> = Readonly<{ status: 'failed'; reason: 'INVALID_RESPONSE'; }> \| Readonly<{ status: 'other'; action: InteractionResponse['action']; }> \| Readonly<{ status: 'values'; action: 'submit' \| 'revise'; values: readonly Readonly<{ key: E; origin: 'user'; value: Value; }>[]; }>`
- `ClarificationResponse#status` · contract property：`"failed" \| "other" \| "values"`

### DecisionCondition

- 分类：`type`；声明：`dist/standard-decision.d.ts`
- 职责：当前领域判断，不将未知或冲突当成否定。
- 类型声明：`type DecisionCondition = 'yes' \| 'no' \| 'unknown' \| 'conflict'`

### DecisionDescription

- 分类：`type`；声明：`dist/standard-decision.d.ts`
- 职责：领域提供的四态决策、依赖和优先级。
- 类型声明：`interface DecisionDescription<K extends string> { readonly key: K; readonly dependsOn: readonly K[]; readonly applicable: DecisionCondition; readonly required: DecisionCondition; readonly satisfied: DecisionCondition; readonly priority: number; }`
- `DecisionDescription#applicable` · contract property readonly：`DecisionCondition`
- `DecisionDescription#dependsOn` · contract property readonly：`readonly K[]`
- `DecisionDescription#key` · contract property readonly：`K`
- `DecisionDescription#priority` · contract property readonly：`number`
- `DecisionDescription#required` · contract property readonly：`DecisionCondition`
- `DecisionDescription#satisfied` · contract property readonly：`DecisionCondition`

### DecisionSelection

- 分类：`type`；声明：`dist/standard-decision.d.ts`
- 职责：必要决策选择及阻塞、未知和冲突。
- 类型声明：`type DecisionSelection<K extends string> = Readonly<{ complete: false; reason: 'LIMIT' \| 'INVALID_DECISION' \| 'INVALID_DEPENDENCY'; }> \| (Readonly<{ complete: true; rows: readonly Row<K>[]; }> & (Readonly<{ status: 'next'; key: K; }> \| Readonly<{ status: 'ready' \| 'unresolved' \| 'blocked' \| 'conflict'; }>))`
- `DecisionSelection#complete` · contract property：`boolean`

### EvidenceContext

- 分类：`type`；声明：`dist/standard-evidence.d.ts`
- 职责：本轮范围、修订及可选时间。
- 类型声明：`interface EvidenceContext { readonly scope: string; readonly revisions: ReadonlyMap<string, string>; readonly asOf?: number; }`
- `EvidenceContext#asOf` · contract property readonly optional：`number`
- `EvidenceContext#revisions` · contract property readonly：`ReadonlyMap<string, string>`
- `EvidenceContext#scope` · contract property readonly：`string`

### EvidenceDependency

- 分类：`type`；声明：`dist/standard-evidence.d.ts`
- 职责：证据依赖关系。
- 类型声明：`interface EvidenceDependency<K extends string> { readonly key: K; readonly dependsOn: readonly K[]; }`
- `EvidenceDependency#dependsOn` · contract property readonly：`readonly K[]`
- `EvidenceDependency#key` · contract property readonly：`K`

### EvidenceInvalidation

- 分类：`type`；声明：`dist/standard-evidence.d.ts`
- 职责：变更导致的失效和保留键集合。
- 类型声明：`type EvidenceInvalidation<K extends string> = Failure \| Readonly<{ complete: true; stale: readonly K[]; retained: readonly K[]; }>`
- `EvidenceInvalidation#complete` · contract property：`boolean`

### EvidenceObservation

- 分类：`type`；声明：`dist/standard-evidence.d.ts`
- 职责：带来源、范围、修订和状态的观察。
- 类型声明：`type EvidenceObservation<K extends string, V> = Readonly<{ key: K; origin: EvidenceOrigin; source: Readonly<{ id: string; scope: string; revision: string; validity?: Readonly<{ from: number; until: number; }>; }>; }> & (Readonly<{ state: 'known'; value: V; }> \| Readonly<{ state: 'unknown' \| 'not-applicable'; }>)`
- `EvidenceObservation#key` · contract property：`K`
- `EvidenceObservation#origin` · contract property：`EvidenceOrigin`
- `EvidenceObservation#source` · contract property：`Readonly<{ id: string; scope: string; revision: string; validity?: Readonly<{ from: number; until: number; }>; }>`
- `EvidenceObservation#state` · contract property：`"known" \| "unknown" \| "not-applicable"`

### EvidenceOrigin

- 分类：`type`；声明：`dist/standard-evidence.d.ts`
- 职责：局部意图证据的来源类别；推荐只作为提案，默认需显式许可。
- 类型声明：`type EvidenceOrigin = 'authority' \| 'user' \| 'derived' \| 'default' \| 'recommendation'`

### EvidenceRequirement

- 分类：`type`；声明：`dist/standard-evidence.d.ts`
- 职责：领域声明的证据键及接受来源。
- 类型声明：`interface EvidenceRequirement<K extends string> { readonly key: K; readonly accepts: readonly Exclude<EvidenceOrigin, 'recommendation'>[]; }`
- `EvidenceRequirement#accepts` · contract property readonly：`readonly ("user" \| "authority" \| "derived" \| "default")[]`
- `EvidenceRequirement#key` · contract property readonly：`K`

### EvidenceResolution

- 分类：`type`；声明：`dist/standard-evidence.d.ts`
- 职责：证据遍历完整性与逐键结论。
- 类型声明：`type EvidenceResolution<K extends string, V> = Failure \| Readonly<{ complete: true; items: readonly (Readonly<{ key: K; evidence: readonly EvidenceObservation<K, V>[]; proposals: readonly EvidenceObservation<K, V>[]; }> & (Readonly<{ status: 'resolved'; value: V; }> \| Readonly<{ status: 'missing'; reason: 'NO_OBSERVATION'; }> \| Readonly<{ status: 'unknown'; reason: 'NO_APPLICABLE_EVIDENCE' \| 'NO_ACCEPTED_ORIGIN' \| 'EXPLICIT_UNKNOWN'; }> \| Readonly<{ status: 'conflict'; reason: 'CONFLICTING_EVIDENCE'; }> \| Readonly<{ status: 'not-applicable'; reason: 'EXPLICIT_NOT_APPLICABLE'; }>))[]; }>`
- `EvidenceResolution#complete` · contract property：`boolean`

### InteractionCandidate

- 分类：`type`；声明：`dist/interaction-protocol.d.ts`
- 职责：语义交互只传输有界 JSON 数据，不解释领域规则或可执行代码。
- 类型声明：`interface InteractionCandidate { readonly id: string; readonly label: string; readonly reason?: string; readonly scope?: string; readonly recommended?: boolean; }`
- `InteractionCandidate#id` · contract property readonly：`string`
- `InteractionCandidate#label` · contract property readonly：`string`
- `InteractionCandidate#reason` · contract property readonly optional：`string`
- `InteractionCandidate#recommended` · contract property readonly optional：`boolean`
- `InteractionCandidate#scope` · contract property readonly optional：`string`

### InteractionDecision

- 分类：`type`；声明：`dist/standard-interaction.d.ts`
- 职责：领域分析的继续澄清或已确定意图。
- 类型声明：`type InteractionDecision<S, I, E extends string = string> = { readonly kind: 'ready'; readonly intent: I; readonly invalidate?: readonly string[]; } \| { readonly kind: 'clarify'; readonly state: S; readonly prompt: InteractionPromptSpec; readonly clarification?: never; readonly invalidate?: readonly string[]; } \| { readonly kind: 'clarify'; readonly state: S; readonly clarification: ClarificationElement<E>; readonly prompt?: never; readonly invalidate?: readonly string[]; }`
- `InteractionDecision#invalidate` · contract property readonly optional：`readonly string[]`
- `InteractionDecision#kind` · contract property readonly：`"ready" \| "clarify"`

### InteractionElement

- 分类：`standard-element`；声明：`dist/standard-interaction.d.ts`
- 职责：一个逻辑意图的运行期交互；领域判断与授权始终由应用负责。
- 获取方式：public constructor / new
- 构造声明：`(options?: { readonly onPrompt?: (prompt: InteractionPrompt, interaction: InteractionElement) => void; } \| undefined): InteractionElement`
- `InteractionElement#cancel` · instance method：`() => void`；调用：`(): void`
- `InteractionElement#current` · instance method：`() => InteractionPrompt \| undefined`；调用：`(): InteractionPrompt \| undefined`
- `InteractionElement#run` · instance method：`<T>(limits: WorkflowLimits, work: (scope: InteractionScope) => Maybe<Outcome<T>>) => Promise<Outcome<T>>`；调用：`<T>(limits: WorkflowLimits, work: (scope: InteractionScope) => Maybe<Outcome<T>>): Promise<Outcome<T>>`
- `InteractionElement#submit` · instance method：`(input: unknown) => InteractionSubmitResult`；调用：`(input: unknown): InteractionSubmitResult`

### InteractionEvent

- 分类：`type`；声明：`dist/standard-interaction.d.ts`
- 职责：真实分析事件；只有绑定路径交付当前实际用户响应的领域键映射。
- 类型声明：`type InteractionEvent<E extends string = string> = { readonly kind: 'initial'; readonly records: readonly InteractionRecord[]; readonly clarification?: never; } \| { readonly kind: 'response'; readonly response: InteractionResponse; readonly records: readonly InteractionRecord[]; readonly clarification?: never; } \| { readonly kind: 'response'; readonly response: InteractionResponse; readonly records: readonly InteractionRecord[]; readonly clarification: Exclude<ClarificationResponse<E>, { status: 'failed'; }>; }`
- `InteractionEvent#clarification` · contract property readonly optional：`Readonly<{ status: "other"; action: InteractionResponse["action"]; }> \| Readonly<{ status: "values"; action: "submit" \| "revise"; values: readonly Readonly<{ key: E; origin: "user"; value: Value; }>[]; }>`
- `InteractionEvent#kind` · contract property readonly：`"initial" \| "response"`
- `InteractionEvent#records` · contract property readonly：`readonly InteractionRecord[]`

### InteractionField

- 分类：`type`；声明：`dist/interaction-protocol.d.ts`
- 职责：原生语义表单的字段类型与约束。
- 类型声明：`type InteractionField = FieldBase & ({ readonly kind: 'string' \| 'text' \| 'file'; readonly minLength?: number; readonly maxLength?: number; } \| { readonly kind: 'number'; readonly min?: number; readonly max?: number; } \| { readonly kind: 'boolean'; } \| { readonly kind: 'choice' \| 'multi-choice'; readonly options: readonly InteractionCandidate[]; readonly completeness: 'complete' \| 'incomplete'; readonly comparison?: readonly { readonly label: string; readonly cells: Readonly<Record<string, string>>; }[]; })`
- `InteractionField#id` · contract property readonly：`string`
- `InteractionField#kind` · contract property readonly：`"string" \| "number" \| "boolean" \| "text" \| "file" \| "choice" \| "multi-choice"`
- `InteractionField#label` · contract property readonly：`string`
- `InteractionField#prefill` · contract property readonly optional：`{ readonly value: Value; readonly source: string; }`
- `InteractionField#required` · contract property readonly optional：`boolean`

### InteractionPrompt

- 分类：`type`；声明：`dist/interaction-protocol.d.ts`
- 职责：实际发布且带意图身份与修订的表单。
- 类型声明：`interface InteractionPrompt extends InteractionPromptSpec { readonly intentId: string; readonly revision: number; }`
- `InteractionPrompt#actions` · contract property readonly：`readonly Action[]`
- `InteractionPrompt#decisionKey` · contract property readonly：`string`
- `InteractionPrompt#description` · contract property readonly optional：`string`
- `InteractionPrompt#fields` · contract property readonly：`readonly InteractionField[]`
- `InteractionPrompt#intentId` · contract property readonly：`string`
- `InteractionPrompt#revision` · contract property readonly：`number`
- `InteractionPrompt#title` · contract property readonly：`string`

### InteractionPromptSpec

- 分类：`type`；声明：`dist/interaction-protocol.d.ts`
- 职责：由领域组织的待发布表单内容。
- 类型声明：`interface InteractionPromptSpec { readonly decisionKey: string; readonly title: string; readonly description?: string; readonly fields: readonly InteractionField[]; readonly actions: readonly Action[]; }`
- `InteractionPromptSpec#actions` · contract property readonly：`readonly Action[]`
- `InteractionPromptSpec#decisionKey` · contract property readonly：`string`
- `InteractionPromptSpec#description` · contract property readonly optional：`string`
- `InteractionPromptSpec#fields` · contract property readonly：`readonly InteractionField[]`
- `InteractionPromptSpec#title` · contract property readonly：`string`

### InteractionRecord

- 分类：`type`；声明：`dist/interaction-protocol.d.ts`
- 职责：响应与其当前有效性。
- 类型声明：`interface InteractionRecord { readonly response: InteractionResponse; readonly valid: boolean; }`
- `InteractionRecord#response` · contract property readonly：`InteractionResponse`
- `InteractionRecord#valid` · contract property readonly：`boolean`

### InteractionResponse

- 分类：`type`；声明：`dist/interaction-protocol.d.ts`
- 职责：客户端响应动作与显式数据。
- 类型声明：`type InteractionResponse = Readonly<{ intentId: string; revision: number; decisionKey: string; }> & ({ readonly action: 'submit'; readonly values: Values; } \| { readonly action: 'revise'; readonly values: Values; } \| { readonly action: 'revise' \| 'text'; readonly text: string; } \| { readonly action: 'no-fit' \| 'reject' \| 'cancel'; })`
- `InteractionResponse#action` · contract property readonly：`"text" \| "submit" \| "revise" \| "no-fit" \| "reject" \| "cancel"`
- `InteractionResponse#decisionKey` · contract property：`string`
- `InteractionResponse#intentId` · contract property：`string`
- `InteractionResponse#revision` · contract property：`number`

### InteractionScope

- 分类：`type`；声明：`dist/standard-interaction.d.ts`
- 职责：同一交互根中的分析、处理及取消信号。
- 类型声明：`interface InteractionScope { readonly root: NativeWorkflowContext; readonly signal: AbortSignal; resolve<S, I, E extends string = string>(initial: S, decide: (state: Readonly<S>, event: InteractionEvent<E>, root: NativeWorkflowContext, signal: AbortSignal) => Maybe<Outcome<InteractionDecision<S, I, E>>>): Promise<Outcome<I>>; step<T>(action: () => Maybe<Outcome<T>>): Promise<Outcome<T>>; }`
- `InteractionScope#resolve` · contract method：`<S, I, E extends string = string>(initial: S, decide: (state: Readonly<S>, event: InteractionEvent<E>, root: NativeWorkflowContext, signal: AbortSignal) => Maybe<Outcome<InteractionDecision<S, I, E>>>) => Promise<Outcome<I>>`；调用：`<S, I, E extends string = string>(initial: S, decide: (state: Readonly<S>, event: InteractionEvent<E>, root: NativeWorkflowContext, signal: AbortSignal) => Maybe<Outcome<InteractionDecision<S, I, E>>>): Promise<Outcome<I>>`
- `InteractionScope#root` · contract property readonly：`NativeWorkflowContext`
- `InteractionScope#signal` · contract property readonly：`AbortSignal`
- `InteractionScope#step` · contract method：`<T>(action: () => Maybe<Outcome<T>>) => Promise<Outcome<T>>`；调用：`<T>(action: () => Maybe<Outcome<T>>): Promise<Outcome<T>>`

### InteractionSubmitResult

- 分类：`type`；声明：`dist/interaction-protocol.d.ts`
- 职责：响应捕获确认；不是业务成功。
- 类型声明：`type InteractionSubmitResult = { readonly accepted: true; } \| { readonly accepted: false; readonly code: 'NO_PENDING' \| 'STALE_RESPONSE' \| 'WRONG_INTENT' \| 'INVALID_RESPONSE' \| 'ALREADY_SETTLED'; }`
- `InteractionSubmitResult#accepted` · contract property readonly：`boolean`

### invalidateEvidence

- 分类：`function`；声明：`dist/standard-evidence.d.ts`
- 职责：当前意图的显式有限依赖；缺少声明时有变更即保守失效，空列表表示无依赖。
- 调用签名：`<K extends string>(keys: readonly K[], changed: readonly K[], declarations: readonly EvidenceDependency<K>[], limits: Readonly<{ maxItems: number; maxDependencies: number; }>): EvidenceInvalidation<K>`

### prepareCandidates

- 分类：`function`；声明：`dist/standard-candidates.d.ts`
- 职责：组织已取得的领域候选；只把显示投影传给交互协议，业务值留在领域内部。
- 调用签名：`<T>(source: CandidateSource<T>, current: Readonly<{ scope: string; revision: string; }>, policy: Readonly<{ assess: (entry: CandidateEntry<T>) => CandidateAssessment; project: (entry: CandidateEntry<T>) => CandidateProjection; comparisonLabels: readonly string[]; }>, limits: BoundedQueryLimits): CandidatePreparation<T>`

### resolveEvidence

- 分类：`function`；声明：`dist/standard-evidence.d.ts`
- 职责：只组织已取得的证据，不读取数据源。complete 表示遍历完整，不表示全部已确定。
- 调用签名：`<K extends string, V>(requirements: readonly EvidenceRequirement<K>[], observations: readonly EvidenceObservation<K, V>[], context: EvidenceContext, policy: Readonly<{ equal: (key: K, left: V, right: V) => boolean; rank?: (observation: EvidenceObservation<K, V>) => number; }>, maxItems: number): EvidenceResolution<K, V>`

### runInteractiveRecognitionHandling

- 分类：`function`；声明：`dist/standard-interactive-recognition.d.ts`
- 职责：同根识别兼分析、必要澄清、处理；复杂业务仍可直接组合原 InteractionScope。
- 调用签名：`<S, I, O, E extends string = string>(interaction: InteractionElement, limits: WorkflowLimits, initial: S, decide: (state: Readonly<S>, event: InteractionEvent<E>, root: NativeWorkflowContext, signal: AbortSignal) => Maybe<Outcome<InteractionDecision<S, I, E>>>, handle: (intent: I, scope: InteractionScope) => Maybe<Outcome<O>>): Promise<Outcome<O>>`

### selectNextDecision

- 分类：`function`；声明：`dist/standard-decision.d.ts`
- 职责：根据当前证据的领域判断选择必要决策；不执行领域规则、工作流或外部操作。
- 调用签名：`<K extends string>(decisions: readonly DecisionDescription<K>[], limits: Readonly<{ maxItems: number; maxDependencies: number; }>): DecisionSelection<K>`
