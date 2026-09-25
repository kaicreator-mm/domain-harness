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
}
//# sourceMappingURL=capability.d.ts.map