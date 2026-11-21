/** 当前领域契约：使用统一 Schema 和明确的类型边界，禁止运行时隐式升级。 */
import type { JsonValue, SemVer } from './base.js';
import type { FunctionRef, TargetSelector } from './refs.js';
import type { DH_APP_SCHEMA_VERSION } from './schema-versions.js';

export interface PackageRef {
  readonly package: string;
  readonly version: SemVer;
}

export interface IngressEntry {
  readonly id: string;
  readonly function: FunctionRef;
  readonly optional?: boolean;
}

export interface DomainAppDescriptor {
  readonly kind: 'DomainApp';
  readonly schemaVersion: typeof DH_APP_SCHEMA_VERSION;
  readonly id: string;
  readonly version: SemVer;
  readonly target: TargetSelector;
  readonly roots: {
    readonly kernelPrimary: PackageRef;
    readonly sdkPrimary: PackageRef;
    readonly businessPrimary: PackageRef;
  };
  readonly extensions: readonly PackageRef[];
  readonly businessAppInit: FunctionRef;
  readonly ingress: readonly IngressEntry[];
  readonly config?: Readonly<Record<string, JsonValue>>;
}
