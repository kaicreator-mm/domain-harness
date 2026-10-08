import { admitCentralDecision, CentralAdmissionError } from '../admission/index.js';
import { DomainActivationBindingCoordinator, GovernanceExecutionCoordinator, } from '../governance/index.js';
import { RuntimeEvidenceCapture, } from '../runtime-evidence/index.js';
import { createDomainRuntimeWithProcessCommandOutcomes, } from './create-domain-runtime.js';
export class DomainRuntimeV3Error extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'DomainRuntimeV3Error';
        this.code = code;
    }
}
function fail(code, message) {
    throw new DomainRuntimeV3Error(code, message);
}
function requirePort(value, name) {
    if (value === undefined || value === null) {
        fail('RUNTIME_V3_AUTHORITY_REQUIRED', `v0.3 authority port '${name}' is required`);
    }
    return value;
}
function toArtifactRef(identity) {
    return {
        kind: identity.kind,
        artifactId: identity.artifactId,
        contentDigest: identity.contentDigest,
    };
}
/**
 * Portable v0.3 runtime assembly. Reuses the ONE existing portable Runtime but
 * explicitly enables the already-frozen T-009 processed-command authority on
 * its same RuntimeStore. Legacy createDomainRuntime() remains unchanged.
 */
export async function createDomainRuntimeV3(options) {
    const v3 = requirePort(options.v3, 'v3');
    const baselines = requirePort(v3.baselines, 'v3.baselines');
    const activationAuthority = requirePort(v3.activationAuthority, 'v3.activationAuthority');
    const exactPackageCdi = requirePort(v3.exactPackageCdi, 'v3.exactPackageCdi');
    const durableExecution = requirePort(v3.durableExecution, 'v3.durableExecution');
    const effectJournal = requirePort(v3.effectJournal, 'v3.effectJournal');
    const effectTools = requirePort(v3.effectTools, 'v3.effectTools');
    const evidence = requirePort(v3.evidence, 'v3.evidence');
    const runtime = await createDomainRuntimeWithProcessCommandOutcomes(options);
    const sha256 = options.bindings.sha256;
    const activation = new DomainActivationBindingCoordinator(activationAuthority, exactPackageCdi, baselines, sha256);
    const governance = new GovernanceExecutionCoordinator(durableExecution, sha256);
    const evidenceCapture = (context) => new RuntimeEvidenceCapture(context, evidence);
    const onEvidenceError = v3.onEvidenceError;
    const swallowEvidenceError = (error) => {
        if (onEvidenceError === undefined)
            return;
        try {
            onEvidenceError(error);
        }
        catch {
            // Host observer failures never rewrite admission truth.
        }
    };
    async function admitTurn(request) {
        const pin = await governance.requirePinnedExecution(request.workflowInstanceId);
        const capture = evidenceCapture({
            domainId: pin.domainId,
            packageId: pin.packageId,
            governanceBaseline: pin.governanceBaseline,
            ...(v3.tenantScope === undefined ? {} : { tenantScope: v3.tenantScope }),
        });
        const baseExecution = {
            workflowTarget: request.target.workflowId,
            workflowInstanceId: request.workflowInstanceId,
        };
        const selected = request.resolved.selectedArtifactIdentity;
        const producerArtifact = selected === undefined ? undefined : toArtifactRef(selected);
        try {
            const outcome = await admitCentralDecision(request, {
                governance,
                baselines,
                sha256,
                effectJournal,
                effectTools,
            });
            const durableControlTurnId = outcome.status === 'admitted'
                ? outcome.admitted.durableControlTurnId
                : outcome.denial.durableControlTurnId;
            await capture
                .captureDecision({
                outcome,
                sourceExecution: { ...baseExecution, durableControlTurnId },
                ...(producerArtifact === undefined ? {} : { producerArtifact }),
            })
                .catch(swallowEvidenceError);
            return outcome;
        }
        catch (error) {
            const code = error instanceof CentralAdmissionError ? error.code : error instanceof Error ? error.name : 'UNKNOWN';
            const message = error instanceof Error ? error.message : String(error);
            await capture
                .captureFailure({ code, message, sourceExecution: baseExecution })
                .catch(swallowEvidenceError);
            throw error;
        }
    }
    return { runtime, activation, governance, admitTurn, evidenceCapture };
}
//# sourceMappingURL=create-domain-runtime-v3.js.map