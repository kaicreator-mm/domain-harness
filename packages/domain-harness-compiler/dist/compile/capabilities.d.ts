import type { CapabilityId, LoadedRawDomainPackage, RawToolDefinition, TargetHostProfile } from '../raw/types.js';
export declare const COMPILER_REQUIRED_CAPABILITIES: {
    readonly cryptoHashSha256: "crypto-hash-sha256@1";
    readonly compiledPackageModule: "compiled-package-module@1";
    readonly expressionJsonata: "expression-jsonata@1";
    readonly scriptExecution: "script-execution@1";
};
export declare class MissingTargetCapabilityError extends Error {
    readonly missing: readonly CapabilityId[];
    constructor(targetProfileId: string, missing: readonly CapabilityId[]);
}
export declare function collectRequiredCapabilities(raw: LoadedRawDomainPackage, declared: readonly CapabilityId[], tools: readonly RawToolDefinition[]): CapabilityId[];
export declare function assertTargetCapabilities(target: TargetHostProfile, required: readonly CapabilityId[]): void;
