/** 当前领域契约：使用统一 Schema 和明确的类型边界，禁止运行时隐式升级。 */
import type { ContentDigest, SemVer } from './base.js';
import type { EffectIntent, FunctionOutcomeKind } from './element-contracts.js';
import type {
  ElementRef,
  ElementVisibility,
  ImplementationLocator,
  FunctionRef,
  ResolvedTarget,
} from './refs.js';
import type { PackageLayer, PackageRole } from './package-manifest.js';
import type { ResourceRef } from './element-contracts.js';
import type { DH_LOCK_SCHEMA_VERSION } from './schema-versions.js';
import type { WorkflowDefinition, WorkflowRef } from './workflow-contracts.js';

export interface SelectedPackage {
  readonly packageId: string;
  readonly version: SemVer;
  readonly layer: PackageLayer;
  readonly role: PackageRole;
  readonly artifact: ResourceRef;
  readonly order?: number;
  readonly init: ElementRef;
  readonly initFunction: FunctionRef;
  readonly exit?: ElementRef;
  readonly exitFunction?: FunctionRef;
  /** 只从 Init Function 被选中的 Target/Content 资源派生的封存资源。 */
  readonly initResources: readonly ResourceRef[];
  /** BUILD 已确认的显式 FunctionRef 导入授权，不能仅凭 dependsOn 取得原始私有能力。 */
  readonly imports: readonly FunctionRef[];
  /** 可选的 Package.InitFrom 历史，不参与 Exit 记录或依赖授权。 */
  readonly recordInitFrom?: true;
  /** 每个 Package 仅拥有其直接声明的 Extension/API 依赖。 */
  readonly dependsOn: readonly string[];
  /** 同一 BUILD 验证并授权的业务 Workflow 启动点，旧 Package 不强制持有业务流程。 */
  readonly workflowRoots?: readonly WorkflowRef[];
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
interface SelectedFunctionBase {
  readonly ref: FunctionRef;
  readonly implementation: ImplementationLocator;
  readonly resources: readonly ResourceRef[];
}
export type SelectedFunction =
  | (SelectedFunctionBase & {
      readonly invocationAbi?: never;
      readonly outcomes: readonly FunctionOutcomeKind[];
      readonly effects: EffectIntent;
    })
  | (SelectedFunctionBase & {
      readonly invocationAbi: 'kdp-host-init/1';
      readonly outcomes?: never;
      readonly effects?: never;
    });

export interface SealedHookBinding {
  readonly ownerPackageId: string;
  readonly hookId: string;
  readonly cardinality: 'single' | 'multi';
  readonly providers: readonly FunctionRef[];
}

/** 已在 BUILD 验证精确 Element/Content/Graph/资源访问，并封存入唯一 DomainAppLock。 */
export interface SelectedWorkflow {
  readonly ref: WorkflowRef;
  readonly ownerPackageId: string;
  readonly definitionDigest: ContentDigest;
  readonly definition: WorkflowDefinition;
}

export interface SelectedKdpHostRef {
  readonly kdpPackageId: string;
  readonly kdpInitFunction: FunctionRef;
  readonly invocationAbi: 'kdp-host-init/1';
  /** 从同一已选 Function 的 Target ImplementationLocator 派生，不是第二入口。 */
  readonly kdpInitModule: ResourceRef;
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
  readonly selectedKdpHost: SelectedKdpHostRef;
  readonly selectedPackages: readonly SelectedPackage[];
  readonly selectedElements: readonly SelectedElement[];
  readonly selectedFunctions: readonly SelectedFunction[];
  readonly hookBindings: readonly SealedHookBinding[];
  readonly selectedWorkflows?: readonly SelectedWorkflow[];
  /** BUILD 已选定的可信 Workflow Runtime 依赖，通过 SHA-512 压缩包 SRI 固定实际安装字节。 */
  readonly trustedRuntimeIntegrity?: readonly {
    readonly name: 'xstate' | 'yaml';
    readonly version: string;
    readonly integrity: string;
  }[];
  /** 已锁定 Core(Order 升序) 链；运行时只按此链递归调用。 */
  readonly coreOrder: readonly string[];
  readonly resourceDigests: Readonly<Record<string, ContentDigest>>;
  readonly excludedUnknownContent: readonly string[];
  readonly closureDigest: ContentDigest;
}
