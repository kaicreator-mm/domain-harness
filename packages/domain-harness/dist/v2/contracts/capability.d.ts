import type { PackageDataBounds } from './package-data.js';
export type CapabilityId = `${string}@${number}`;
export declare const STANDARD_CAPABILITIES: {
    readonly sqliteRuntimeStore: "sqlite-runtime-store@1";
    readonly expressionJsonata: "expression-jsonata@1";
    readonly scriptExecution: "script-execution@1";
    readonly httpTransport: "http-transport@1";
    readonly secureRandom: "secure-random@1";
    readonly cryptoHashSha256: "crypto-hash-sha256@1";
    readonly compiledPackageModule: "compiled-package-module@1";
};
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
//# sourceMappingURL=capability.d.ts.map