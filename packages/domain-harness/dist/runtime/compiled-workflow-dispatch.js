import { LEGACY_COMPILED_ARTIFACT_PROFILE, SUCCESSOR_COMPILED_ARTIFACT_PROFILE, sameCompiledArtifactProfile, } from '../v2/contracts/compiled-artifact-profile.js';
import { CompiledWorkflowIrError, decodeCompiledWorkflowDefinition, } from './compiled-workflow-ir.js';
/**
 * Legacy-profile definitions resolve through the historical V2 decoder
 * (CompiledWorkflowIRV2); successor-profile definitions resolve through the
 * installed engine-3 extension, whose result type is downstream-owned and
 * opaque to DomainHarness, so the declared result is `unknown`.
 */
export function decodeCompiledWorkflowDefinitionForProfile(profile, workflowId, definition, extensions = {}) {
    if (sameCompiledArtifactProfile(profile, LEGACY_COMPILED_ARTIFACT_PROFILE)) {
        return decodeCompiledWorkflowDefinition(workflowId, definition);
    }
    if (sameCompiledArtifactProfile(profile, SUCCESSOR_COMPILED_ARTIFACT_PROFILE)) {
        if (!extensions.engine3) {
            throw new CompiledWorkflowIrError(`Compiled workflow "${workflowId}" requires executionEngineMajor 3, but the successor decoder extension is not installed`);
        }
        return extensions.engine3(workflowId, definition);
    }
    throw new CompiledWorkflowIrError(`Compiled workflow "${workflowId}" declares unsupported compiled-artifact profile `
        + `${profile.formatVersion}/${profile.runtimeContractMajor}/${profile.executionEngineMajor}`);
}
//# sourceMappingURL=compiled-workflow-dispatch.js.map