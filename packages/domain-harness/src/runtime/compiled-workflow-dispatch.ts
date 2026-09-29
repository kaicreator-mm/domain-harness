import type { CompiledArtifactProfile } from '../v2/contracts/compiled-artifact-profile.js';
import {
  LEGACY_COMPILED_ARTIFACT_PROFILE,
  SUCCESSOR_COMPILED_ARTIFACT_PROFILE,
  sameCompiledArtifactProfile,
} from '../v2/contracts/compiled-artifact-profile.js';
import {
  CompiledWorkflowIrError,
  decodeCompiledWorkflowDefinition,
  type CompiledWorkflowIRV2,
} from './compiled-workflow-ir.js';

export type SuccessorCompiledWorkflowDecoder = (
  workflowId: string,
  definition: unknown,
) => unknown;

export interface CompiledWorkflowDecoderExtensions {
  /**
   * Engine-major-3 decoder supplied by the downstream feature node that owns
   * the successor IR semantics. I-FMT-03 deliberately ships no V3 feature
   * decoder and therefore fails closed when this extension is absent.
   */
  readonly engine3?: SuccessorCompiledWorkflowDecoder;
}

export function decodeCompiledWorkflowDefinitionForProfile(
  profile: CompiledArtifactProfile,
  workflowId: string,
  definition: unknown,
  extensions: CompiledWorkflowDecoderExtensions = {},
): CompiledWorkflowIRV2 | unknown {
  if (sameCompiledArtifactProfile(profile, LEGACY_COMPILED_ARTIFACT_PROFILE)) {
    return decodeCompiledWorkflowDefinition(workflowId, definition);
  }

  if (sameCompiledArtifactProfile(profile, SUCCESSOR_COMPILED_ARTIFACT_PROFILE)) {
    if (!extensions.engine3) {
      throw new CompiledWorkflowIrError(
        `Compiled workflow "${workflowId}" requires executionEngineMajor 3, but the successor decoder extension is not installed`,
      );
    }
    return extensions.engine3(workflowId, definition);
  }

  throw new CompiledWorkflowIrError(
    `Compiled workflow "${workflowId}" declares unsupported compiled-artifact profile `
      + `${profile.formatVersion}/${profile.runtimeContractMajor}/${profile.executionEngineMajor}`,
  );
}
