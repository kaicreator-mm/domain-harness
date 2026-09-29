export interface CompiledArtifactProfile {
    readonly formatVersion: string;
    readonly runtimeContractMajor: number;
    readonly executionEngineMajor: number;
}
/** Historical compiled-artifact contract. Its persisted semantics are frozen. */
export declare const LEGACY_COMPILED_ARTIFACT_PROFILE: {
    readonly formatVersion: "0.2";
    readonly runtimeContractMajor: 2;
    readonly executionEngineMajor: 2;
};
/** Successor scaffold profile frozen by the post-v0.4 L2 amendment. */
export declare const SUCCESSOR_COMPILED_ARTIFACT_PROFILE: {
    readonly formatVersion: "0.3";
    readonly runtimeContractMajor: 2;
    readonly executionEngineMajor: 3;
};
export type LegacyCompiledArtifactProfile = typeof LEGACY_COMPILED_ARTIFACT_PROFILE;
export type SuccessorCompiledArtifactProfile = typeof SUCCESSOR_COMPILED_ARTIFACT_PROFILE;
export type SupportedCompiledArtifactProfile = LegacyCompiledArtifactProfile | SuccessorCompiledArtifactProfile;
export declare function sameCompiledArtifactProfile(left: CompiledArtifactProfile, right: CompiledArtifactProfile): boolean;
export declare function isSupportedCompiledArtifactProfile(value: CompiledArtifactProfile): value is SupportedCompiledArtifactProfile;
export declare function compiledArtifactProfileKey(value: CompiledArtifactProfile): string;
//# sourceMappingURL=compiled-artifact-profile.d.ts.map