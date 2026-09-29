/** Historical compiled-artifact contract. Its persisted semantics are frozen. */
export const LEGACY_COMPILED_ARTIFACT_PROFILE = {
    formatVersion: '0.2',
    runtimeContractMajor: 2,
    executionEngineMajor: 2,
};
/** Successor scaffold profile frozen by the post-v0.4 L2 amendment. */
export const SUCCESSOR_COMPILED_ARTIFACT_PROFILE = {
    formatVersion: '0.3',
    runtimeContractMajor: 2,
    executionEngineMajor: 3,
};
export function sameCompiledArtifactProfile(left, right) {
    return left.formatVersion === right.formatVersion
        && left.runtimeContractMajor === right.runtimeContractMajor
        && left.executionEngineMajor === right.executionEngineMajor;
}
export function isSupportedCompiledArtifactProfile(value) {
    return sameCompiledArtifactProfile(value, LEGACY_COMPILED_ARTIFACT_PROFILE)
        || sameCompiledArtifactProfile(value, SUCCESSOR_COMPILED_ARTIFACT_PROFILE);
}
export function compiledArtifactProfileKey(value) {
    return `${value.formatVersion}/${value.runtimeContractMajor}/${value.executionEngineMajor}`;
}
//# sourceMappingURL=compiled-artifact-profile.js.map