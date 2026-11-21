/** 当前领域契约：使用统一 Schema 和明确的类型边界，禁止运行时隐式升级。 */
import type { ContentDigest, SemVer } from './base.js';
import type { ResolvedTarget } from './refs.js';
import type {
  DH_INSTALL_RECORD_SCHEMA_VERSION,
  DH_PIN_SCHEMA_VERSION,
} from './schema-versions.js';
import type { DomainApp } from './app-contracts.js';

/** 可信安装器写入的实际安装记录；Pin 与 Lock 必须绑定此记录及选定 KDP 的字节摘要。 */
export interface InstalledRecord {
  readonly kind: 'DomainAppInstallRecord';
  readonly schemaVersion: typeof DH_INSTALL_RECORD_SCHEMA_VERSION;
  readonly appId: string;
  readonly appVersion: SemVer;
  readonly target: ResolvedTarget;
  readonly lockPath: string;
  readonly lockDigest: ContentDigest;
  readonly kdpPackageId: string;
  readonly kdpPrimaryEntry: 'bootstrap';
  readonly kdpPrimaryDigest: ContentDigest;
  readonly recordDigest: ContentDigest;
}

/** Boot 仅依此最小定位信息寻找唯一 KDP Primary，不进行运行时版本寻优。 */
export interface BootstrapPin {
  readonly schemaVersion: typeof DH_PIN_SCHEMA_VERSION;
  readonly target: ResolvedTarget;
  readonly kdpPackageId: string;
  readonly kdpPrimaryEntry: 'bootstrap';
  readonly kdpPrimaryDigest: ContentDigest;
  readonly lockDigest: ContentDigest;
  readonly lockPath: string;
}

export interface HostPortBinding {
  readonly name: string;
  readonly port: number;
}

/** Host 提供运行环境与已安装根路径；该上下文不应包含未授权 Effect 权限。 */
export interface KdpBootstrapContext {
  readonly installRoot: string;
  readonly descriptorPath: string;
  readonly lockPath: string;
  readonly hostPorts?: readonly HostPortBinding[];
  readonly env: { readonly nodeMajor: number; readonly platform: string };
  /** 显式启用 Node Host 的正常终止/未处理故障有界 Exit 交接。 */
  readonly processLifecycle?: { readonly timeoutMs?: number };
}

export type KdpBootstrapResult =
  | { readonly status: 'BOOTED'; readonly app: DomainApp }
  | { readonly status: 'FAILED'; readonly code: string; readonly reason: string };

export interface KdpPrimary {
  bootstrap(context: KdpBootstrapContext): Promise<KdpBootstrapResult>;
}

/** 启动前拒绝返回 REFUSED；选定 KDP 执行后的失败由 KDP 报告 FAILED。 */
export type BootResult =
  | { readonly status: 'REFUSED'; readonly code: string; readonly reason: string }
  | KdpBootstrapResult;
