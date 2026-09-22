import { assertValidRuntimeEvidenceRecord, } from '../contracts/runtime-evidence.js';
import { RuntimeEvidenceIntegrationError } from './contracts.js';
function encode(component) {
    return encodeURIComponent(component);
}
/**
 * Integration-point capture for Runtime Evidence (T-020). One method per
 * integration point; each builds the record, validates it fail-closed with
 * the T-005 contract, then appends through the write-only port. The capture
 * path never reads evidence back, so evidence can never gate execution here.
 */
export class RuntimeEvidenceCapture {
    #context;
    #port;
    constructor(context, port) {
        this.#context = context;
        this.#port = port;
    }
    get context() {
        return this.#context;
    }
    async captureDecision(input) {
        const discriminator = input.sourceExecution.durableControlTurnId ??
            input.sourceExecution.workflowInstanceId ??
            'decision';
        const payload = input.outcome.status === 'admitted'
            ? {
                status: 'admitted',
                transitionKey: input.outcome.admitted.transitionKey,
                targetState: input.outcome.admitted.targetState,
                effectCount: input.outcome.admitted.effects.length,
                resolver: input.outcome.admitted.resolver.source,
            }
            : {
                status: 'denied',
                reason: input.outcome.denial.reason,
                ...(input.outcome.denial.invariantId === undefined
                    ? {}
                    : { invariantId: input.outcome.denial.invariantId }),
                ...(input.outcome.denial.transitionKey === undefined
                    ? {}
                    : { transitionKey: input.outcome.denial.transitionKey }),
                ...(input.outcome.denial.guardId === undefined
                    ? {}
                    : { guardId: input.outcome.denial.guardId }),
                resolver: input.outcome.denial.resolver.source,
            };
        return this.#emit('decision', 'durable-audit', discriminator, input.sequence, payload, {
            sourceExecution: input.sourceExecution,
            ...(input.producerArtifact === undefined
                ? {}
                : { producerArtifact: input.producerArtifact }),
        });
    }
    async captureFailure(input) {
        const discriminator = input.discriminator ??
            input.sourceExecution?.durableControlTurnId ??
            input.sourceExecution?.workflowInstanceId ??
            input.code;
        return this.#emit('workflow-failure', 'durable-audit', discriminator, input.sequence, {
            code: input.code,
            message: input.message,
        }, {
            ...(input.sourceExecution === undefined
                ? {}
                : { sourceExecution: input.sourceExecution }),
        });
    }
    async captureFallback(input) {
        const discriminator = input.sourceExecution?.durableControlTurnId ??
            input.sourceExecution?.workflowInstanceId ??
            'fallback';
        return this.#emit('fallback', 'durable-audit', discriminator, input.sequence, {
            reason: input.reason,
        }, {
            ...(input.sourceExecution === undefined
                ? {}
                : { sourceExecution: input.sourceExecution }),
            ...(input.subjectArtifact === undefined
                ? {}
                : { subjectArtifact: input.subjectArtifact }),
        });
    }
    async captureHumanOverride(input) {
        return this.captureOperatorOverride({
            actionId: input.audit.actionId,
            actor: input.audit.actor,
            detail: {
                action: input.audit.action,
                auditId: input.audit.auditId,
                recordedAt: input.audit.recordedAt,
                artifactVersion: input.audit.artifactVersion,
            },
            subjectArtifact: {
                kind: input.audit.artifact.kind,
                artifactId: input.audit.artifact.artifactId,
                contentDigest: input.audit.artifact.contentDigest,
            },
            ...(input.sequence === undefined ? {} : { sequence: input.sequence }),
        });
    }
    async captureOperatorOverride(input) {
        if (input.actionId.trim().length === 0) {
            throw new RuntimeEvidenceIntegrationError('INVALID_RUNTIME_EVIDENCE_INTEGRATION', 'operator override actionId must be a non-empty string');
        }
        return this.#emit('human-override', 'durable-audit', input.actionId, input.sequence, {
            actor: {
                kind: input.actor.kind,
                actorId: input.actor.actorId,
                operatorId: input.actor.operatorId,
            },
            detail: input.detail,
        }, {
            ...(input.sourceExecution === undefined
                ? {}
                : { sourceExecution: input.sourceExecution }),
            ...(input.subjectArtifact === undefined
                ? {}
                : { subjectArtifact: input.subjectArtifact }),
        });
    }
    async captureEvaluation(input) {
        return this.#emit('evaluation', 'durable-audit', input.shadowId, input.sequence, {
            verdict: input.verdict,
            stableFallback: {
                packageId: input.experimentalArtifact.stableFallback.packageId,
                governanceBaselineContentDigest: input.experimentalArtifact.stableFallback.governanceBaselineContentDigest,
                artifact: {
                    kind: input.experimentalArtifact.stableFallback.artifact.kind,
                    artifactId: input.experimentalArtifact.stableFallback.artifact.artifactId,
                    contentDigest: input.experimentalArtifact.stableFallback.artifact.contentDigest,
                },
            },
        }, {
            ...(input.sourceExecution === undefined
                ? {}
                : { sourceExecution: input.sourceExecution }),
            subjectArtifact: input.experimentalArtifact.subjectArtifact,
        });
    }
    async captureCounterexample(input) {
        return this.#emit('counterexample', 'durable-audit', input.shadowId, input.sequence, { counterexample: input.counterexample }, {
            ...(input.sourceExecution === undefined
                ? {}
                : { sourceExecution: input.sourceExecution }),
            subjectArtifact: input.experimentalArtifact.subjectArtifact,
        });
    }
    async captureMetric(input) {
        const discriminator = input.sourceExecution?.durableControlTurnId ??
            input.sourceExecution?.workflowInstanceId ??
            input.name;
        return this.#emit('metric', 'derived-ephemeral', discriminator, input.sequence, {
            name: input.name,
            value: input.value,
        }, {
            ...(input.sourceExecution === undefined
                ? {}
                : { sourceExecution: input.sourceExecution }),
        });
    }
    async #emit(sourceKind, durability, discriminator, sequence, payload, extras) {
        const evidenceId = `ev:${encode(this.#context.domainId)}:${sourceKind}:${encode(discriminator)}:${sequence ?? 0}`;
        const record = {
            evidenceId,
            truthClass: 'runtime-evidence',
            executionAuthority: 'none',
            domainId: this.#context.domainId,
            ...(this.#context.tenantScope === undefined
                ? {}
                : { tenantScope: this.#context.tenantScope }),
            sourceKind,
            durability,
            provenance: {
                packageId: this.#context.packageId,
                governanceBaseline: this.#context.governanceBaseline,
                ...(extras.sourceExecution === undefined
                    ? {}
                    : { sourceExecution: extras.sourceExecution }),
                ...(extras.producerArtifact === undefined
                    ? {}
                    : { producerArtifact: extras.producerArtifact }),
            },
            ...(extras.subjectArtifact === undefined
                ? {}
                : { subjectArtifact: extras.subjectArtifact }),
            payload,
        };
        assertValidRuntimeEvidenceRecord(record);
        await this.#port.append(record);
        return record;
    }
}
//# sourceMappingURL=capture.js.map