import { LEGACY_COMPILED_ARTIFACT_PROFILE, SUCCESSOR_COMPILED_ARTIFACT_PROFILE, } from '@kaicreator/domain-harness/v2';
/**
 * Public compiler output remains frozen on the legacy profile until the later
 * I-03-ASSEMBLY node authorizes publication of a complete successor artifact.
 */
export const PUBLIC_COMPILER_OUTPUT_PROFILE = LEGACY_COMPILED_ARTIFACT_PROFILE;
/**
 * Internal scaffold identity available to downstream successor feature work.
 * Its presence does not authorize compileDomainPackage() to emit it.
 */
export const SUCCESSOR_COMPILER_PROFILE_SCAFFOLD = SUCCESSOR_COMPILED_ARTIFACT_PROFILE;
