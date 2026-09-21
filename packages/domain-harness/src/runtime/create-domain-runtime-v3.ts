import type {
  AdmissionDurableEffectJournal,
  AdmissionEffectToolPort,
  CentralAdmissionOutcome,
  CentralAdmissionRequest,
} from '../admission/contracts.js';
import { admitCentralDecision, CentralAdmissionError } from '../admission/index.js';
import type { CompiledArtifactIdentity } from '../contracts/domain-data.js';
import type {
  RuntimeEvidenceArtifactRef,
  RuntimeEvidencePort,
} from '../contracts/runtime-evidence.js';
import {
  DomainActivationBindingCoordinator,
  GovernanceExecutionCoordinator,
  type DomainActivationAuthority,
  type DurableExecutionStore,
  type ExactPackageCdiAuthority,
  type GovernanceBaselineStore,
} from '../governance/index.js';
import {
  RuntimeEvidenceCapture,
  type RuntimeEvidenceCaptureContext,
} from '../runtime-evidence/index.js';
import type { DomainRuntime } from '../v2/contracts/runtime.js';
import { createDomainRuntime, type CreateDomainRuntimeOptions } from './create-domain-runtime.js';

export type DomainRuntimeV3ErrorCode = 'RUNTIME_V3_AUTHORITY_REQUIRED';

export class DomainRuntimeV3Error extends Error {
  readonly code: DomainRuntimeV3ErrorCode;

  constructor(code: DomainRuntimeV3ErrorCode, message: string) {
    super(message);
    this.name = 'DomainRuntimeV3Error';
    this.code = code;
  }
}

function fail(code: DomainRuntimeV3ErrorCode, message: string): never {
  throw new DomainRuntimeV3Error(code, message);
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
  readonly v3: CreateDomainRuntimeV3AuthorityOptions;
}

export interface DomainRuntimeV3 {
  /** The ONE existing v0.2 runtime — retained Domain-App capabilities unchanged. */
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

function requirePort<T>(value: T | undefined | null, name: string): T {
  if (value === undefined || value === null) {
    fail('RUNTIME_V3_AUTHORITY_REQUIRED', `v0.3 authority port '${name}' is required`);
  }
  return value;
}

function toArtifactRef(identity: CompiledArtifactIdentity): RuntimeEvidenceArtifactRef {
  return {
    kind: identity.kind,
    artifactId: identity.artifactId,
    contentDigest: identity.contentDigest,
  };
}

/**
 * Portable v0.3 runtime assembly. Boots the existing v0.2 runtime unchanged
 * (target compiled package + Runtime Resources only), then composes the
 * governance/decision/evidence authority stack from portable ports. No second
 * runtime, no provider routing, no Node built-ins.
 */
export async function createDomainRuntimeV3(
  options: CreateDomainRuntimeV3Options,
): Promise<DomainRuntimeV3> {
  const v3 = requirePort(options.v3, 'v3');
  const baselines = requirePort(v3.baselines, 'v3.baselines');
  const activationAuthority = requirePort(v3.activationAuthority, 'v3.activationAuthority');
  const exactPackageCdi = requirePort(v3.exactPackageCdi, 'v3.exactPackageCdi');
  const durableExecution = requirePort(v3.durableExecution, 'v3.durableExecution');
  const effectJournal = requirePort(v3.effectJournal, 'v3.effectJournal');
  const effectTools = requirePort(v3.effectTools, 'v3.effectTools');
  const evidence = requirePort(v3.evidence, 'v3.evidence');

  const runtime = await createDomainRuntime(options);
  const sha256 = options.bindings.sha256;
  const activation = new DomainActivationBindingCoordinator(
    activationAuthority,
    exactPackageCdi,
    baselines,
    sha256,
  );
  const governance = new GovernanceExecutionCoordinator(durableExecution, sha256);

  const evidenceCapture = (context: RuntimeEvidenceCaptureContext): RuntimeEvidenceCapture =>
    new RuntimeEvidenceCapture(context, evidence);

  const onEvidenceError = v3.onEvidenceError;
  const swallowEvidenceError = (error: unknown): void => {
    if (onEvidenceError === undefined) return;
    // The observer is host code on a secondary channel: its own failure is
    // swallowed with the append failure so it can never rewrite an admission
    // outcome (V8).
    try {
      onEvidenceError(error);
    } catch {
      // intentionally ignored
    }
  };

  async function admitTurn(request: CentralAdmissionRequest): Promise<CentralAdmissionOutcome> {
    // Load the exact pin first for evidence provenance. Without a pin there is
    // no honest provenance, so the pin-missing error propagates without evidence
    // (admission would fail closed on the same pin gate immediately afterwards).
    // admitCentralDecision re-reads the pin below; pins are bind-once immutable
    // (conflicts throw, never overwrite), so the two reads cannot observe
    // different authority.
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
      const durableControlTurnId =
        outcome.status === 'admitted'
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
    } catch (error) {
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
