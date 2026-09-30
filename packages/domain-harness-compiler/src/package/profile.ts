import {
  SUCCESSOR_COMPILED_ARTIFACT_PROFILE,
} from '@kaicreator/domain-harness/v2';

/**
 * I-03-ASSEMBLY owns the single compiler-emission switch point: after the
 * complete successor package material (Domain Data, Business Source, engine-3
 * rejection routing) is assembled, the public compiler emits exactly the
 * successor ('0.3',2,3) profile. Retained ('0.2',2,2) packages remain valid
 * Runtime artifacts and keep their exact historical identity/pins.
 */
export const PUBLIC_COMPILER_OUTPUT_PROFILE = SUCCESSOR_COMPILED_ARTIFACT_PROFILE;

/**
 * Historical name retained for I-FMT-03 callers; it is now the same successor
 * profile the public compiler emits.
 */
export const SUCCESSOR_COMPILER_PROFILE_SCAFFOLD = SUCCESSOR_COMPILED_ARTIFACT_PROFILE;
