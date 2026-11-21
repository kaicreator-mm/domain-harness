/** 当前领域契约：使用统一 Schema 和明确的类型边界，禁止运行时隐式升级。 */
import type { JsonValue, SemVer } from './base.js';
import type { FunctionRef, TargetSelector } from './refs.js';
import type { DH_APP_SCHEMA_VERSION } from './schema-versions.js';

export interface PackageRef {
  readonly package: string;
  readonly version: SemVer;
}

/** 对外入口名必须唯一；其 FunctionRef 包括 Element 身份、摘要与合同版本，避免同名函数误绑定。 */
export interface IngressEntry {
  readonly id: string;
  readonly function: FunctionRef;
  readonly optional?: boolean;
}

/**
 * BUILD 的声明式输入，不是运行期执行计划。
 * kernelPrimary 指定唯一 Order=0 KDP，cores 指定其余 BUILD 选定 Core；
 * extensions 指定候选扩展。Core 数量与名称不由 K/S/B 三层样例限制。
 */
export interface DomainAppDescriptor {
  readonly kind: 'DomainApp';
  readonly schemaVersion: typeof DH_APP_SCHEMA_VERSION;
  readonly id: string;
  readonly version: SemVer;
  readonly target: TargetSelector;
  readonly roots: {
    readonly kernelPrimary: PackageRef;
    readonly cores: readonly PackageRef[];
  };
  readonly extensions: readonly PackageRef[];
  readonly ingress: readonly IngressEntry[];
  readonly config?: Readonly<Record<string, JsonValue>>;
}
