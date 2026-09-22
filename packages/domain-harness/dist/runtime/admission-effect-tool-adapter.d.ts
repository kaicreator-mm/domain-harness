import type { CompiledToolDescriptor } from '../v2/contracts/package.js';
import type { ToolExecutorPort } from '../v2/contracts/effect.js';
import type { CompiledArtifactIdentity } from '../contracts/domain-data.js';
import type { AdmissionEffectToolPort } from '../admission/contracts.js';
export interface AdmissionEffectToolAdapterOptions {
    /** T-008 executor seam (e.g. created by createHostLocalDomainToolExecutor). */
    readonly executor: ToolExecutorPort;
    /** Target-compiled Tool descriptors keyed by admission effect type. */
    readonly descriptors: Readonly<Record<string, CompiledToolDescriptor | undefined>>;
    /** Optional exact producer artifact identity per effect type, for evidence-grade bindings. */
    readonly toolArtifacts?: Readonly<Record<string, CompiledArtifactIdentity | undefined>>;
}
/**
 * T-021 assembly glue between the T-019 admission effect-tool port and the
 * existing v0.2 `ToolExecutorPort` effect seam (T-008 host/local bindings).
 * Effect semantics come from the compiled Tool descriptor — never from a
 * side-channel map. The adapter tracks per-effect execution attempts so the
 * T-008 effect-authority guard receives a truthful attempt ordinal; durable
 * begin/commit/retry truth stays with the admission journal.
 */
export declare function admissionEffectToolPort(options: AdmissionEffectToolAdapterOptions): AdmissionEffectToolPort;
//# sourceMappingURL=admission-effect-tool-adapter.d.ts.map