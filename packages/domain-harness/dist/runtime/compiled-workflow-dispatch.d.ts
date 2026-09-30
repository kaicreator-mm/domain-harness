import type { CompiledArtifactProfile } from '../v2/contracts/compiled-artifact-profile.js';
export type SuccessorCompiledWorkflowDecoder = (workflowId: string, definition: unknown) => unknown;
export interface CompiledWorkflowDecoderExtensions {
    /**
     * Engine-major-3 decoder supplied by the downstream feature node that owns
     * the successor IR semantics. I-FMT-03 deliberately ships no V3 feature
     * decoder and therefore fails closed when this extension is absent.
     */
    readonly engine3?: SuccessorCompiledWorkflowDecoder;
}
/**
 * Legacy-profile definitions resolve through the historical V2 decoder
 * (CompiledWorkflowIRV2); successor-profile definitions resolve through the
 * installed engine-3 extension, whose result type is downstream-owned and
 * opaque to DomainHarness, so the declared result is `unknown`.
 */
export declare function decodeCompiledWorkflowDefinitionForProfile(profile: CompiledArtifactProfile, workflowId: string, definition: unknown, extensions?: CompiledWorkflowDecoderExtensions): unknown;
//# sourceMappingURL=compiled-workflow-dispatch.d.ts.map