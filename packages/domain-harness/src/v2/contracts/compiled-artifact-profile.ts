export interface CompiledArtifactProfile {
  readonly formatVersion: string;
  readonly runtimeContractMajor: number;
  readonly executionEngineMajor: number;
}

/** Historical compiled-artifact contract. Its persisted semantics are frozen. */
export const LEGACY_COMPILED_ARTIFACT_PROFILE = {
  formatVersion: '0.2',
  runtimeContractMajor: 2,
  executionEngineMajor: 2,
} as const satisfies CompiledArtifactProfile;

/** Successor scaffold profile frozen by the post-v0.4 L2 amendment. */
export const SUCCESSOR_COMPILED_ARTIFACT_PROFILE = {
  formatVersion: '0.3',
  runtimeContractMajor: 2,
  executionEngineMajor: 3,
} as const satisfies CompiledArtifactProfile;

export type LegacyCompiledArtifactProfile = typeof LEGACY_COMPILED_ARTIFACT_PROFILE;
export type SuccessorCompiledArtifactProfile = typeof SUCCESSOR_COMPILED_ARTIFACT_PROFILE;
export type SupportedCompiledArtifactProfile =
  | LegacyCompiledArtifactProfile
  | SuccessorCompiledArtifactProfile;

export function sameCompiledArtifactProfile(
  left: CompiledArtifactProfile,
  right: CompiledArtifactProfile,
): boolean {
  return left.formatVersion === right.formatVersion
    && left.runtimeContractMajor === right.runtimeContractMajor
    && left.executionEngineMajor === right.executionEngineMajor;
}

export function isSupportedCompiledArtifactProfile(
  value: CompiledArtifactProfile,
): value is SupportedCompiledArtifactProfile {
  return sameCompiledArtifactProfile(value, LEGACY_COMPILED_ARTIFACT_PROFILE)
    || sameCompiledArtifactProfile(value, SUCCESSOR_COMPILED_ARTIFACT_PROFILE);
}

export function compiledArtifactProfileKey(value: CompiledArtifactProfile): string {
  return `${value.formatVersion}/${value.runtimeContractMajor}/${value.executionEngineMajor}`;
}
