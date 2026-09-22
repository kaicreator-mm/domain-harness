import type { CompiledToolDescriptor } from '../../package/manifest.js';
import { type ScriptBundleRequest, type ScriptTarget, type TargetHostProfileLike } from '../../script/script-bundle.js';
import type { LoadedRawDomainPackage } from '../../raw/types.js';
export declare class V01ScriptTranslationError extends Error {
    constructor(message: string);
}
export interface V01ScriptTranslationOptions {
    readonly target: ScriptTarget;
    readonly targetProfile: TargetHostProfileLike;
}
export interface V01ScriptToolTranslation {
    readonly workflowId: string;
    readonly stateId: string;
    readonly sourceRef: string;
    readonly sourceDigest: string;
    readonly toolId: string;
    readonly bindingId: string;
    readonly tool: CompiledToolDescriptor;
    readonly bundleRequest: ScriptBundleRequest;
}
export interface V01ScriptTranslationResult {
    readonly raw: LoadedRawDomainPackage;
    readonly tools: readonly CompiledToolDescriptor[];
    readonly scripts: readonly V01ScriptToolTranslation[];
}
export declare function translateV01ScriptInvokes(raw: LoadedRawDomainPackage, options: V01ScriptTranslationOptions): V01ScriptTranslationResult;
