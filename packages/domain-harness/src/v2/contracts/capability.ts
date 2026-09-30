import type { PackageDataBounds } from './package-data.js';

export type CapabilityId = `${string}@${number}`;

export const STANDARD_CAPABILITIES = {
  sqliteRuntimeStore: 'sqlite-runtime-store@1',
  expressionJsonata: 'expression-jsonata@1',
  scriptExecution: 'script-execution@1',
  httpTransport: 'http-transport@1',
  secureRandom: 'secure-random@1',
  cryptoHashSha256: 'crypto-hash-sha256@1',
  compiledPackageModule: 'compiled-package-module@1',
} as const satisfies Readonly<Record<string, CapabilityId>>;

export type StandardCapabilityId = typeof STANDARD_CAPABILITIES[keyof typeof STANDARD_CAPABILITIES];

export interface TargetHostProfile {
  id: string;
  capabilities: readonly CapabilityId[];
  bindings: Readonly<Record<CapabilityId, string>>;
  /**
   * Exact package-data bounds supplied by the compile Target Host Profile
   * (L2-A §3.6). Successor ('0.3',2,3) compilation requires it and records it
   * verbatim in the manifest; retained 0.2/2/2 compilation ignores it.
   */
  readonly packageDataBounds?: PackageDataBounds;
}
