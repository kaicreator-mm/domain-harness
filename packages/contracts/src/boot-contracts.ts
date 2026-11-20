/** 当前领域契约：使用统一 Schema 和明确的类型边界，禁止运行时隐式升级。 */
import type { ContentDigest, SemVer } from './base.js';
import type { ResolvedTarget } from './refs.js';
import type {
  DH_INSTALL_RECORD_SCHEMA_VERSION,
  DH_PIN_SCHEMA_VERSION,
} from './schema-versions.js';
import type { DomainApp } from './app-contracts.js';

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

export interface KdpBootstrapContext {
  readonly installRoot: string;
  readonly descriptorPath: string;
  readonly lockPath: string;
  readonly hostPorts?: readonly HostPortBinding[];
  readonly env: { readonly nodeMajor: number; readonly platform: string };
}

export type KdpBootstrapResult =
  | { readonly status: 'BOOTED'; readonly app: DomainApp }
  | { readonly status: 'FAILED'; readonly code: string; readonly reason: string };

export interface KdpPrimary {
  bootstrap(context: KdpBootstrapContext): Promise<KdpBootstrapResult>;
}

export type BootResult =
  | { readonly status: 'REFUSED'; readonly code: string; readonly reason: string }
  | KdpBootstrapResult;
