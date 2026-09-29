import type { AdmissionDurableEffectJournal, AdmissionEffectToolPort, CentralAdmissionOutcome, CentralAdmissionRequest } from '../admission/contracts.js';
import type { RuntimeStoreProcessCommandExtension } from '../contracts/process-command.js';
import type { RuntimeEvidencePort } from '../contracts/runtime-evidence.js';
import { DomainActivationBindingCoordinator, GovernanceExecutionCoordinator, type DomainActivationAuthority, type DurableExecutionStore, type ExactPackageCdiAuthority, type GovernanceBaselineStore } from '../governance/index.js';
import { RuntimeEvidenceCapture, type RuntimeEvidenceCaptureContext } from '../runtime-evidence/index.js';
import type { DomainRuntime } from '../v2/contracts/runtime.js';
import { type CreateDomainRuntimeOptions } from './create-domain-runtime.js';
export type DomainRuntimeV3ErrorCode = 'RUNTIME_V3_AUTHORITY_REQUIRED';
export declare class DomainRuntimeV3Error extends Error {
    readonly code: DomainRuntimeV3ErrorCode;
    constructor(code: DomainRuntimeV3ErrorCode, message: string);
}
export interface CreateDomainRuntimeV3AuthorityOptions {
    /** T-003 Governance Baseline body/retention store. */
    readonly baselines: GovernanceBaselineStore;
    /** T-014 live activation-binding authority (host-durable). */
    readonly activationAuthority: DomainActivationAuthority;
    /** T-014 exact package/CDI authority for activation publication. */
    readonly exactPackageCdi: ExactPackageCdiAuthority;
    /** T-014 durable store for GovernanceExecutionPin + bound snapshots. */
    readonly durableExecution: DurableExecutionStore;
    /** T-019 durable effect journal (host adapter or the volatile reference). */
    readonly effectJournal: AdmissionDurableEffectJournal;
    /** T-019 mutation-capable effect tool port (see admissionEffectToolPort). */
    readonly effectTools: AdmissionEffectToolPort;
    /** T-005/T-020 append-only evidence sink. */
    readonly evidence: RuntimeEvidencePort;
    readonly tenantScope?: string;
    /**
     * Secondary-channel observer for evidence-append failures (never admission
     * truth). A throwing observer is swallowed with the append failure itself —
     * host observer code can never rewrite an admission outcome (V8).
     */
    readonly onEvidenceError?: (error: unknown) => void;
}
export interface CreateDomainRuntimeV3Options extends CreateDomainRuntimeOptions {
    /** v3 processing requires the already-frozen T-009 extension on the SAME store. */
    readonly store: CreateDomainRuntimeOptions['store'] & RuntimeStoreProcessCommandExtension;
    readonly v3: CreateDomainRuntimeV3AuthorityOptions;
}
export interface DomainRuntimeV3 {
    /** The ONE existing portable Runtime with v3-only T-009 processing enabled. */
    readonly runtime: DomainRuntime;
    /** T-014 activation-binding authority (publish/read exact bindings). */
    readonly activation: DomainActivationBindingCoordinator;
    /** T-014 execution-pin authority (pinExecution / requirePinnedExecution / snapshot gate). */
    readonly governance: GovernanceExecutionCoordinator;
    /**
     * The single authoritative v0.3 admission path with the assembled ports.
     * Decision evidence is captured on every outcome and failure evidence on
     * every thrown admission error (secondary channel; it never rewrites the
     * outcome). Control publication of an admitted plan stays with `runtime`
     * (ADR-02) — the T-019 plan carries no engine state by contract.
     */
    admitTurn(request: CentralAdmissionRequest): Promise<CentralAdmissionOutcome>;
    /** T-020 capture bound to a caller-supplied exact authority context (shadow/rollback/metric points). */
    evidenceCapture(context: RuntimeEvidenceCaptureContext): RuntimeEvidenceCapture;
}
/**
 * Portable v0.3 runtime assembly. Reuses the ONE existing portable Runtime but
 * explicitly enables the already-frozen T-009 processed-command authority on
 * its same RuntimeStore. Legacy createDomainRuntime() remains unchanged.
 */
export declare function createDomainRuntimeV3(options: CreateDomainRuntimeV3Options): Promise<DomainRuntimeV3>;
//# sourceMappingURL=create-domain-runtime-v3.d.ts.map