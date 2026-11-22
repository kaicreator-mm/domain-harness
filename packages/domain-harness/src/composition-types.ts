/** 构建期职责：校验并封存选定的依赖、资源和函数，保证生成确定性 Lock。 */
import type {
  DomainAppLock,
  BuildErrorCode,
  ContentDigest,
} from '@kaicreator/domain-harness-contracts';

export interface AppPackageFile {
  readonly path: string;
  readonly digest: ContentDigest;
  readonly bytes: Uint8Array;
}

export interface ComposedAppPackage {
  readonly kind: 'DomainAppPackage';
  readonly schemaVersion: 'dh.app-package/0.11';
  readonly files: readonly AppPackageFile[];
  readonly packageDigest: ContentDigest;
}

export interface BuildFailure {
  readonly ok: false;
  readonly code: BuildErrorCode;
  readonly message: string;
  readonly path?: string;
}

export interface BuildSuccess {
  readonly ok: true;
  readonly lock: DomainAppLock;
  readonly lockBytes: Uint8Array;
  readonly appPackage: ComposedAppPackage;
}

export type BuildResult = BuildSuccess | BuildFailure;

export interface KdpArtifactInput {
  readonly packageId: string;
  readonly path: string;
}

export interface BuildInput {
  readonly descriptor: unknown;
  readonly domains?: readonly unknown[];
  readonly packages: readonly unknown[];
  readonly packageRoots: Readonly<Record<string, string>>;
  readonly packageArtifacts: Readonly<Record<string, string>>;
  readonly kdpArtifact: KdpArtifactInput;
  /** 组合 App 启动入口使用的精确运行时依赖；不得浮动寻优。 */
  readonly runtimeDependencies: Readonly<Record<string, string>>;
}
