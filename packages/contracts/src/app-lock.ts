/** 当前领域契约：使用统一 Schema 和明确的类型边界，禁止运行时隐式升级。 */
import type { ContentDigest, SemVer } from './base.js';
import type { EffectIntent, FunctionOutcomeKind } from './element-contracts.js';
import type {
  ElementRef,
  ElementVisibility,
  EntryRef,
  FunctionRef,
  ResolvedTarget,
} from './refs.js';
import type { PackageLayer, PackageRole } from './package-manifest.js';
import type { ResourceRef } from './element-contracts.js';
import type { DH_LOCK_SCHEMA_VERSION } from './schema-versions.js';

export interface SelectedPackage {
  readonly packageId: string;
  readonly version: SemVer;
  readonly layer: PackageLayer;
  readonly role: PackageRole;
  readonly artifact: ResourceRef;
  readonly order?: number;
  readonly init: EntryRef;
  readonly exit?: EntryRef;
  readonly initResources: readonly ResourceRef[];
  /** 可选的 Package.InitFrom 历史，不参与 Exit 记录或依赖授权。 */
  readonly recordInitFrom?: true;
  /** 每个 Package 仅拥有其直接声明的 Extension/API 依赖。 */
  readonly dependsOn: readonly string[];
}

export interface SelectedElement {
  readonly ref: ElementRef;
  readonly ownerPackageId: string;
  readonly visibility: ElementVisibility;
  readonly contentDigests: readonly ContentDigest[];
  readonly contractDigests: readonly ContentDigest[];
}

/**
 * 已选 Function 的运行期最小授权：实现入口、允许的 Outcome、Effect 意图及资源集合。
 * KDP 只能按这里的 resources 向 App Init 发放只读句柄，不能把整个 resourceDigests 暴露给业务。
 */
export interface SelectedFunction {
  readonly ref: FunctionRef;
  readonly outcomes: readonly FunctionOutcomeKind[];
  readonly effects: EffectIntent;
  readonly implementation: EntryRef;
  readonly resources: readonly ResourceRef[];
}

export interface SealedHookBinding {
  readonly ownerPackageId: string;
  readonly hookId: string;
  readonly cardinality: 'single' | 'multi';
  readonly providers: readonly EntryRef[];
}

export interface SealedIngress {
  readonly id: string;
  readonly function: FunctionRef;
  readonly optional: boolean;
}

export interface BootstrapKdpRef {
  readonly kdpPackageId: string;
  readonly kdpPrimaryEntry: 'bootstrap';
  readonly kdpPrimaryDigest: ContentDigest;
}

/**
 * BUILD 产生的确定性快照；KDP 只校验、加载和执行，不重新求解依赖。
 * closureDigest 对排除自身后的规范 JSON 求摘要；安装记录与外部 Pin 应与它一致。
 * Core 链及直接 Extension 边在 BUILD 时确定；Exit 根据真实 Init 进入顺序执行。
 */
export interface DomainAppLock {
  readonly kind: 'DomainAppLock';
  readonly schemaVersion: typeof DH_LOCK_SCHEMA_VERSION;
  readonly appIdentity: {
    readonly id: string;
    readonly version: SemVer;
    readonly descriptorDigest: ContentDigest;
  };
  readonly target: ResolvedTarget;
  readonly bootstrapKdpPin: BootstrapKdpRef;
  readonly selectedPackages: readonly SelectedPackage[];
  readonly selectedElements: readonly SelectedElement[];
  readonly selectedFunctions: readonly SelectedFunction[];
  readonly hookBindings: readonly SealedHookBinding[];
  /** 已锁定 Core(Order 升序) 链；运行时只按此链递归调用。 */
  readonly coreOrder: readonly string[];
  readonly ingress: readonly SealedIngress[];
  readonly resourceDigests: Readonly<Record<string, ContentDigest>>;
  readonly excludedUnknownContent: readonly string[];
  readonly closureDigest: ContentDigest;
}
