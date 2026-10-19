import { V10_BUILD_FORMAT, V10_BUNDLER_REVISION, V10_HOST_ABI, V10_IMPORT_POLICY_REVISION, V10_RUNTIME_ABI, V10_TARGET_PROFILE, type V10ModuleRole } from './digest.js';
import { type V10ExternalImports } from './import-policy.js';
/** One proposed module of the composition (plain data in, plain data out). */
export interface V10ModuleInput {
    readonly packageId: string;
    readonly role: V10ModuleRole;
    readonly abiVersion: string;
    /** Sealed ESM bytes. Optional modules may omit them (Basic fallback). */
    readonly moduleSource?: string;
    readonly moduleSha256?: string;
    readonly endpoint: string;
    /** Selected sibling packageIds this module depends on. */
    readonly dependencies?: readonly string[];
    /** Sealed ordinary-import allowance of this module. */
    readonly externalImports?: {
        node?: readonly string[];
        npm?: readonly string[];
        native?: readonly string[];
    };
    /** Feature/intent/hook keys this module provides. */
    readonly provides?: readonly string[];
    /** Feature keys this module requires from the selected closure. */
    readonly requires?: readonly string[];
    /** Advisory (K extension / S feature) modules may be optional. */
    readonly optional?: boolean;
    readonly providerId?: string;
    readonly hookExport?: string;
    readonly featureExport?: string;
    readonly capabilityId?: string;
    readonly handlers?: readonly {
        operationId: string;
        handler: string;
    }[];
}
export interface V10RouteRowInput {
    readonly intentId: string;
    readonly operationId: string;
    readonly capabilityId: string;
    readonly handlerId: string;
}
export interface BuildV10AppOptions {
    readonly appId: string;
    readonly audience: string;
    /** Must be exactly the selected Node24 ESM target profile. */
    readonly targetProfile: string;
    readonly modules: readonly V10ModuleInput[];
    readonly routes: readonly V10RouteRowInput[];
    readonly hardBudget?: {
        maxStepsPerTurn: number;
        maxWorkUnitsPerTurn: number;
    };
    /** Bounded BUILD identity sealed into the subject (caller-supplied). */
    readonly buildId?: string;
}
/** The sealed module record of the built App (plain data). */
export interface V10SealedModule {
    readonly packageId: string;
    readonly role: V10ModuleRole;
    readonly abiVersion: string;
    readonly moduleSource: string;
    readonly moduleSha256: string;
    readonly endpoint: string;
    readonly dependencies: readonly string[];
    readonly externalImports: V10ExternalImports;
    readonly provides: readonly string[];
    readonly requires: readonly string[];
    readonly optional: boolean;
    readonly providerId: string | null;
    readonly hookExport: string | null;
    readonly featureExport: string | null;
    readonly capabilityId: string | null;
    readonly handlers: readonly {
        operationId: string;
        handler: string;
    }[] | null;
}
/** The v0.10 built App: plain frozen data, no approval, sealed load order. */
export interface V10BuiltApp {
    readonly formatVersion: typeof V10_BUILD_FORMAT;
    readonly subjectDigest: string;
    readonly appId: string;
    readonly audience: string;
    readonly buildId: string;
    readonly targetProfile: typeof V10_TARGET_PROFILE;
    readonly runtimeAbi: typeof V10_RUNTIME_ABI;
    readonly hostAbi: typeof V10_HOST_ABI;
    readonly bundlerRevision: typeof V10_BUNDLER_REVISION;
    readonly importPolicyRevision: typeof V10_IMPORT_POLICY_REVISION;
    readonly hardBudget: {
        maxStepsPerTurn: number;
        maxWorkUnitsPerTurn: number;
    };
    readonly modules: readonly V10SealedModule[];
    readonly loadOrder: readonly string[];
    readonly skippedOptional: readonly string[];
    readonly routes: readonly {
        intentId: string;
        operationId: string;
        capabilityId: string;
        handlerId: string;
    }[];
}
/**
 * Compose one closed-world Node24 Domain App. Purely static and
 * deterministic: zero module evaluation, zero I/O, no clock/randomness.
 */
export declare function buildV10App(options: BuildV10AppOptions): V10BuiltApp;
