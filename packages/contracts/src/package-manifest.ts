/** 当前领域契约：单一结构定义与严格的数据验证。 */
import type { SemVer } from './base.js';
import type { ResourceRef, SchemaRef } from './element-contracts.js';
import type {
  ElementVisibility,
  ElementRef,
  FunctionRef,
  TargetBinding,
} from './refs.js';
import type { DH_PACKAGE_SCHEMA_VERSION } from './schema-versions.js';
import type { WorkflowRef } from './workflow-contracts.js';

/** 三层职责是固定的，Capability 或 Hook 不构成第四个 Package 层。 */
export type PackageLayer = 'kernel' | 'sdk' | 'business';

export type PackageRole = 'primary' | 'extension';

export interface ElementEntry {
  readonly id: string;
  readonly version: SemVer;
  readonly definitionRef: ResourceRef;
  readonly visibility: ElementVisibility;
}

export interface PackageDependency {
  readonly package: string;
  readonly version: string;
  readonly interface: string;
}

export interface ExportEntry {
  readonly elementId?: string;
  readonly functionId?: string;
  readonly interfaceId?: string;
}

/** Hook 声明归属与可接受实现数量，BUILD 负责静态校验和封存。 */
export interface HookDeclaration {
  readonly id: string;
  readonly interfaceSchemaRef: SchemaRef;
  readonly cardinality: 'single' | 'multi';
}

export interface CapabilityDeclaration {
  readonly interfaces?: readonly ExportEntry[];
  readonly hooks?: readonly HookDeclaration[];
}

export interface HookBinding {
  readonly ownerPackageId: string;
  readonly hookId: string;
  readonly function: FunctionRef;
}

/** Package 清单统一承载 Element 归属、显式导入导出、Target 实现和统一 Init/可选 Exit 生命周期。 */
export interface DomainPackageManifest {
  readonly kind: 'DomainPackage';
  readonly schemaVersion: typeof DH_PACKAGE_SCHEMA_VERSION;
  readonly id: string;
  readonly version: SemVer;
  readonly layer: PackageLayer;
  readonly role: PackageRole;
  readonly description?: string;
  readonly elements: readonly ElementEntry[];
  readonly dependsOn: readonly PackageDependency[];
  readonly imports: readonly FunctionRef[];
  readonly exports: readonly ExportEntry[];
  readonly provides?: CapabilityDeclaration;
  readonly contributesTo: readonly HookBinding[];
  readonly targetVariants: readonly TargetBinding[];
  /** 可选业务启动的 Workflow Element Content；只由 Package.Init 选择调用，不由 KDP 自动运行。 */
  readonly workflowRoots?: readonly WorkflowRef[];
  /** Core 必填且唯一，Extension 可不指定；0 固定为 KDP。 */
  readonly order?: number;
  /** 每个可运行 Package 必须提供唯一 Init Element。 */
  readonly init: ElementRef;
  /** Exit 缺省为无操作。 */
  readonly exit?: ElementRef;
  /** Package 自行选择是否维护 InitFrom 历史；不影响 KDP 独立的 Exit 进入记录。 */
  readonly recordInitFrom?: true;
}
