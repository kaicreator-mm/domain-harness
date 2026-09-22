import type { CompiledPackageManifest } from '../v2/contracts/package.js';
export { AppContractGenerationError } from './app-contract-errors.js';
export type { AppContractGenerationErrorCode } from './app-contract-errors.js';
export declare const APP_CONTRACT_SOURCE_FORMAT: "domain-harness.app-contracts.v1";
export interface AppCommandContractSource {
    readonly commandId: string;
    readonly workflowId: string;
    readonly messageType: string;
    readonly outcomeSchemaId: string;
}
export interface AppViewContractSource {
    readonly viewId: string;
    readonly projectionId: string;
    readonly inputSchemaId: string;
}
export interface AppWatchContractSource {
    readonly watchId: string;
    readonly viewId: string;
}
export interface AppDomainEventContractSource {
    readonly eventId: string;
    readonly workflowId: string;
    readonly messageType: string;
}
/**
 * Build-time selector emitted alongside a target-compiled package. Every schema
 * reference resolves back into the exact compiled manifest; no source/runtime
 * discovery is permitted when an App starts.
 */
export interface CompiledAppContractSource {
    readonly format: typeof APP_CONTRACT_SOURCE_FORMAT;
    readonly packageId: string;
    readonly commands: readonly AppCommandContractSource[];
    readonly views: readonly AppViewContractSource[];
    readonly watches: readonly AppWatchContractSource[];
    readonly domainEvents: readonly AppDomainEventContractSource[];
}
export interface GeneratedAppContractOptions {
    readonly banner?: string;
}
export declare function generateTypedAppContracts(manifest: CompiledPackageManifest, source: CompiledAppContractSource, options?: GeneratedAppContractOptions): string;
//# sourceMappingURL=app-contracts.d.ts.map