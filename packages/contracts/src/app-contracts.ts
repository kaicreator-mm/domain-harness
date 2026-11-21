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

export type AppStatus = 'READY' | 'DEGRADED' | 'BLOCKED' | 'FAILED';

export interface ReadonlyFunctionHandle {
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

/** Package 统一 Init 的上下文，启用 InitFrom 的 Package 才接收历史，业务不得伪造。 */
export interface PackageInitContext extends AppInitContext {
  readonly packageId: string;
  readonly InitFrom?: readonly InitCaller[];
  readonly hostPorts: readonly import('./boot-contracts.js').HostPortBinding[];
}

/** Exit 仅在退出流程执行，调用历史属于本次应用激活。 */
export interface PackageExitContext {
  readonly packageId: string;
  readonly InitFrom?: readonly InitCaller[];
  readonly hostPorts: readonly import('./boot-contracts.js').HostPortBinding[];
}

/** Business Core.Init 声明应用启动状态；DEGRADED 只能显式压制已在 Lock 中标记 optional 的入口。 */
export interface AppInitResult {
  readonly status: AppStatus;
  readonly suppressedIngress?: readonly string[];
  readonly detail?: JsonValue;
}

/** 成功、未知与失败互斥，调用方不能把缺失依据的 UNKNOWN 当成 SUCCEEDED。 */
export type FunctionOutcome =
  | { readonly kind: 'SUCCEEDED'; readonly value: JsonValue }
  | { readonly kind: 'UNKNOWN'; readonly unknownReason: { readonly code: string; readonly message: string } }
  | { readonly kind: 'FAILED'; readonly failure: { readonly code: string; readonly message: string } };

/** 启动完成后只允许调用 Lock 中声明的 ingress，释放后必须拒绝再次调用。 */
export interface DomainApp {
  readonly status: AppStatus;
  invoke(ingressId: string, input: unknown): Promise<FunctionOutcome>;
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
  readonly ingress: readonly { readonly id: string; readonly optional: boolean }[];
  readonly suppressedIngress: readonly string[];
}
