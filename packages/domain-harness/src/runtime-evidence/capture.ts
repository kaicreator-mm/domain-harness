import type { JsonValue } from '../contracts/json.js';
import {
  assertValidRuntimeEvidenceRecord,
  type RuntimeEvidenceArtifactRef,
  type RuntimeEvidenceDurability,
  type RuntimeEvidencePort,
  type RuntimeEvidenceRecord,
  type RuntimeEvidenceSourceExecutionRef,
  type RuntimeEvidenceSourceKind,
} from '../contracts/runtime-evidence.js';
import type { CentralAdmissionOutcome } from '../admission/contracts.js';
import type { PromotionActivationAuditRecord } from '../promotion-activation/contracts.js';
import type { HumanOperatorActorIdentity } from '../promotion-activation/contracts.js';
import { RuntimeEvidenceIntegrationError } from './contracts.js';
import type {
  ExperimentalArtifactReference,
  RuntimeEvidenceCaptureContext,
} from './contracts.js';

function encode(component: string): string {
  return encodeURIComponent(component);
}

export interface CaptureDecisionInput {
  readonly outcome: CentralAdmissionOutcome;
  readonly sourceExecution: RuntimeEvidenceSourceExecutionRef;
  readonly producerArtifact?: RuntimeEvidenceArtifactRef;
  readonly sequence?: number;
}

export interface CaptureFailureInput {
  readonly code: string;
  readonly message: string;
  readonly sourceExecution?: RuntimeEvidenceSourceExecutionRef;
  /**
   * Optional evidence-id discriminator override. Integration points that can
   * fail repeatedly under the same code/turn (e.g. shadow evaluation) supply
   * their own discriminator so distinct failures stay distinct records.
   */
  readonly discriminator?: string;
  readonly sequence?: number;
}

export interface CaptureFallbackInput {
  readonly reason: string;
  readonly sourceExecution?: RuntimeEvidenceSourceExecutionRef;
  readonly subjectArtifact?: RuntimeEvidenceArtifactRef;
  readonly sequence?: number;
}

export interface CaptureHumanOverrideInput {
  readonly audit: PromotionActivationAuditRecord;
  readonly sequence?: number;
}

/** General operator-override integration point (rollback, manual intervention, …). */
export interface CaptureOperatorOverrideInput {
  readonly actionId: string;
  readonly actor: HumanOperatorActorIdentity;
  readonly detail: JsonValue;
  readonly sourceExecution?: RuntimeEvidenceSourceExecutionRef;
  readonly subjectArtifact?: RuntimeEvidenceArtifactRef;
  readonly sequence?: number;
}

export interface CaptureEvaluationInput {
  readonly shadowId: string;
  readonly verdict: JsonValue;
  readonly experimentalArtifact: ExperimentalArtifactReference;
  readonly sourceExecution?: RuntimeEvidenceSourceExecutionRef;
  readonly sequence?: number;
}

export interface CaptureCounterexampleInput {
  readonly shadowId: string;
  readonly counterexample: JsonValue;
  readonly experimentalArtifact: ExperimentalArtifactReference;
  readonly sourceExecution?: RuntimeEvidenceSourceExecutionRef;
  readonly sequence?: number;
}

export interface CaptureMetricInput {
  readonly name: string;
  readonly value: JsonValue;
  readonly sourceExecution?: RuntimeEvidenceSourceExecutionRef;
  readonly sequence?: number;
}

/**
 * Integration-point capture for Runtime Evidence (T-020). One method per
 * integration point; each builds the record, validates it fail-closed with
 * the T-005 contract, then appends through the write-only port. The capture
 * path never reads evidence back, so evidence can never gate execution here.
 */
export class RuntimeEvidenceCapture {
  readonly #context: RuntimeEvidenceCaptureContext;
  readonly #port: RuntimeEvidencePort;

  constructor(context: RuntimeEvidenceCaptureContext, port: RuntimeEvidencePort) {
    this.#context = context;
    this.#port = port;
  }

  get context(): RuntimeEvidenceCaptureContext {
    return this.#context;
  }

  async captureDecision(input: CaptureDecisionInput): Promise<RuntimeEvidenceRecord> {
    const discriminator =
      input.sourceExecution.durableControlTurnId ??
      input.sourceExecution.workflowInstanceId ??
      'decision';
    const payload: JsonValue =
      input.outcome.status === 'admitted'
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

  async captureFailure(input: CaptureFailureInput): Promise<RuntimeEvidenceRecord> {
    const discriminator =
      input.discriminator ??
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

  async captureFallback(input: CaptureFallbackInput): Promise<RuntimeEvidenceRecord> {
    const discriminator =
      input.sourceExecution?.durableControlTurnId ??
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

  async captureHumanOverride(input: CaptureHumanOverrideInput): Promise<RuntimeEvidenceRecord> {
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

  async captureOperatorOverride(
    input: CaptureOperatorOverrideInput,
  ): Promise<RuntimeEvidenceRecord> {
    if (input.actionId.trim().length === 0) {
      throw new RuntimeEvidenceIntegrationError(
        'INVALID_RUNTIME_EVIDENCE_INTEGRATION',
        'operator override actionId must be a non-empty string',
      );
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

  async captureEvaluation(input: CaptureEvaluationInput): Promise<RuntimeEvidenceRecord> {
    return this.#emit('evaluation', 'durable-audit', input.shadowId, input.sequence, {
      verdict: input.verdict,
      stableFallback: {
        packageId: input.experimentalArtifact.stableFallback.packageId,
        governanceBaselineContentDigest:
          input.experimentalArtifact.stableFallback.governanceBaselineContentDigest,
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

  async captureCounterexample(input: CaptureCounterexampleInput): Promise<RuntimeEvidenceRecord> {
    return this.#emit(
      'counterexample',
      'durable-audit',
      input.shadowId,
      input.sequence,
      { counterexample: input.counterexample },
      {
        ...(input.sourceExecution === undefined
          ? {}
          : { sourceExecution: input.sourceExecution }),
        subjectArtifact: input.experimentalArtifact.subjectArtifact,
      },
    );
  }

  async captureMetric(input: CaptureMetricInput): Promise<RuntimeEvidenceRecord> {
    const discriminator =
      input.sourceExecution?.durableControlTurnId ??
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

  async #emit(
    sourceKind: RuntimeEvidenceSourceKind,
    durability: RuntimeEvidenceDurability,
    discriminator: string,
    sequence: number | undefined,
    payload: JsonValue,
    extras: {
      readonly sourceExecution?: RuntimeEvidenceSourceExecutionRef;
      readonly producerArtifact?: RuntimeEvidenceArtifactRef;
      readonly subjectArtifact?: RuntimeEvidenceArtifactRef;
    },
  ): Promise<RuntimeEvidenceRecord> {
    const evidenceId = `ev:${encode(this.#context.domainId)}:${sourceKind}:${encode(
      discriminator,
    )}:${sequence ?? 0}`;
    const record: RuntimeEvidenceRecord = {
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
