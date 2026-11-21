/** 当前领域契约：使用统一 Schema 和明确的类型边界，禁止运行时隐式升级。 */
import type { ContentDigest, JsonValue, SemVer } from './base.js';
import type {
  EffectIntent,
  FunctionOutcomeKind,
} from './element-contracts.js';
import type {
  ElementRef,
  ElementVisibility,
  FunctionRef,
  ResolvedTarget,
} from './refs.js';
import type { PackageLayer, PackageRole } from './package-manifest.js';
import type { ResourceRef } from './element-contracts.js';
import type { ReadonlyWorkflowStarter } from './workflow-contracts.js';

export type AppStatus = 'READY' | 'DEGRADED' | 'BLOCKED' | 'FAILED';

export interface ReadonlyFunctionHandle {
  readonly ref: FunctionRef;
  invoke(input: unknown): Promise<FunctionOutcome>;
}

export interface ReadonlyResourceHandle {
  readonly ref: ResourceRef;
  read(): Promise<Uint8Array>;
}

/** Init 只能访问被选中的只读资源与函数句柄，不授予 Host 或任意包的执行权限。 */
export interface AppInitContext {
  readonly appId: string;
  readonly activationId: string;
  readonly lockDigest: ContentDigest;
  readonly config: Readonly<Record<string, JsonValue>>;
  readonly functions: ReadonlyMap<string, ReadonlyFunctionHandle>;
  readonly resources: ReadonlyMap<string, ReadonlyResourceHandle>;
}

/** 逐次记录 Init Element 的真实直接调用来源，保留重复及失败进入事件。 */
export type InitCaller =
  | { readonly type: 'Boot' }
  | { readonly type: 'Package'; readonly packageId: string };

/** BUILD 封存的 Init 调用绑定；运行时不发现或选择其它 Package。 */
export interface PackageInitBinding {
  init(): Promise<unknown>;
}

/** Package 统一 Init 的上下文，启用 InitFrom 的 Package 才接收历史，业务不得伪造。 */
export interface PackageInitContext extends AppInitContext {
  readonly packageId: string;
  readonly InitFrom?: readonly InitCaller[];
  readonly hostPorts: readonly import('./boot-contracts.js').HostPortBinding[];
  /** 只允许启动同一 BUILD 钉住且当前 Package 已声明的 Workflow 根；没有则省略。 */
  readonly workflows?: ReadonlyWorkflowStarter;
  /** 仅当前 Core 收到 Order 中下一 Core 的受控链接；不是公共 Package next() API。 */
  readonly nextCore?: PackageInitBinding;
}

/** Exit 仅在退出流程执行，调用历史属于本次应用激活。 */
export interface PackageExitContext {
  readonly packageId: string;
  readonly InitFrom?: readonly InitCaller[];
  readonly hostPorts: readonly import('./boot-contracts.js').HostPortBinding[];
}

/** Business Core.Init 独立报告 READY/DEGRADED/BLOCKED/FAILED；FunctionOutcome 与 App 状态互不冒充，无旧 ingress 压制表。 */
export interface AppInitResult {
  readonly status: AppStatus;
  readonly detail?: JsonValue;
}

/** 成功、未知与失败互斥，调用方不能把缺失依据的 UNKNOWN 当成 SUCCEEDED。 */
export type FunctionOutcome =
  | { readonly kind: 'SUCCEEDED'; readonly value: JsonValue }
  | { readonly kind: 'UNKNOWN'; readonly unknownReason: { readonly code: string; readonly message: string } }
  | { readonly kind: 'FAILED'; readonly failure: { readonly code: string; readonly message: string } };

/** 公共 App 只包含状态、只读清单与 Exit；执行能力属于 Package.Init。 */
export interface DomainApp {
  readonly status: AppStatus;
  inspect(): Promise<DomainAppInspection>;
  dispose(): Promise<{ readonly status: 'DISPOSED' }>;
}

/** 面向消费者的只读快照；实现必须复制嵌套引用，防止 JS 调用者修改内部 Lock。 */
export interface DomainAppInspection {
  readonly appIdentity: { readonly id: string; readonly version: SemVer; readonly lockDigest: ContentDigest };
  readonly target: ResolvedTarget;
  readonly packages: readonly {
    readonly packageId: string;
    readonly version: SemVer;
    readonly layer: PackageLayer;
    readonly role: PackageRole;
  }[];
  readonly elements: readonly {
    readonly ref: ElementRef;
    readonly ownerPackageId: string;
    readonly visibility: ElementVisibility;
  }[];
  readonly functions: readonly {
    readonly ref: FunctionRef;
    readonly outcomes: readonly FunctionOutcomeKind[];
    readonly effects: EffectIntent;
  }[];
}
