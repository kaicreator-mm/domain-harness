import type {
  AdmissionDurableEffectJournal,
  AdmissionEffectToolPort,
  CentralAdmissionOutcome,
  CentralAdmissionRequest,
} from '../admission/contracts.js';
import { admitCentralDecision, CentralAdmissionError } from '../admission/index.js';
import type { CompiledArtifactIdentity } from '../contracts/domain-data.js';
import type { RuntimeStoreProcessCommandExtension } from '../contracts/process-command.js';
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
import { resolvePinnedPackage } from '../package/registry.js';
import type { PackageRegistry } from '../v2/contracts/package.js';
import {
  RuntimeEvidenceCapture,
  type RuntimeEvidenceCaptureContext,
} from '../runtime-evidence/index.js';
import type { DomainRuntime } from '../v2/contracts/runtime.js';
import { resolveDecision } from '../decision-resolver/index.js';
import {
  bindSemanticDecisionTurn,
  type ResolveAndAdmitTurnRequest,
} from './decision-resolver-binding.js';
import {
  createDomainRuntimeWithProcessCommandOutcomes,
  type CreateDomainRuntimeOptions,
} from './create-domain-runtime.js';
import { failV3 } from './runtime-v3-errors.js';

export {
  DomainRuntimeV3Error,
  type DomainRuntimeV3ErrorCode,
} from './runtime-v3-errors.js';

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
  /**
   * v0.6 T004: the bounded Runtime integration of the existing
   * DecisionResolver into the existing Central Admission path. Binds the
   * compiled semantic-decision declaration of the pinned package by stable
   * `decisionId`, invokes the existing `resolveDecision()` (frozen order
   * Rule → Exact Cache → Promoted Subworkflow → HarnessMachine, data only),
   * and feeds the resolved result through the SAME `admitTurn` path above.
   *
   * Authority preservation: the resolver stays proposal authority only — a
   * guard/hard-invariant/schema denial of the resolved result is final for
   * the turn (no fallback, no retry, no bypass). A missing/incompatible
   * declaration binding fails closed with `RUNTIME_V3_DECISION_BINDING_*`.
   */
  resolveAndAdmitTurn(request: ResolveAndAdmitTurnRequest): Promise<CentralAdmissionOutcome>;
  /** T-020 capture bound to a caller-supplied exact authority context (shadow/rollback/metric points). */
  evidenceCapture(context: RuntimeEvidenceCaptureContext): RuntimeEvidenceCapture;
}

function requirePort<T>(value: T | undefined | null, name: string): T {
  if (value === undefined || value === null) {
    failV3('RUNTIME_V3_AUTHORITY_REQUIRED', `v0.3 authority port '${name}' is required`);
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
 * Portable v0.3 runtime assembly. Reuses the ONE existing portable Runtime but
 * explicitly enables the already-frozen T-009 processed-command authority on
 * its same RuntimeStore. Legacy createDomainRuntime() remains unchanged.
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

  // R1 P1: the T004 declaration binding reads compiled semantic-decision
  // declarations exclusively through the admission-validated package view the
  // assembled Runtime itself executes against — never through the caller's
  // retained registry references.
  const validatedPackagesHolder: { validatedPackages?: PackageRegistry } = {};
  const runtime = await createDomainRuntimeWithProcessCommandOutcomes(options, validatedPackagesHolder);
  const validatedPackages = requirePort(validatedPackagesHolder.validatedPackages, 'validatedPackages');
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
    try {
      onEvidenceError(error);
    } catch {
      // Host observer failures never rewrite admission truth.
    }
  };

  async function admitTurn(request: CentralAdmissionRequest): Promise<CentralAdmissionOutcome> {
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

  /**
   * v0.6 T004 bounded seam: declaration → existing resolveDecision (data
   * only) → the existing `admitTurn` single path. No second resolver, no
   * second admission path, no engine-state publication, no provider routing.
   */
  async function resolveAndAdmitTurn(request: ResolveAndAdmitTurnRequest): Promise<CentralAdmissionOutcome> {
    const pin = await governance.requirePinnedExecution(request.workflowInstanceId);
    const compiledPackage = resolvePinnedPackage(validatedPackages, pin.packageId);
    const decisions = compiledPackage.manifest.semanticDecisions;
    const declaration = decisions?.find((candidate) => candidate.decisionId === request.decisionId);
    if (declaration === undefined) {
      failV3(
        'RUNTIME_V3_DECISION_BINDING_UNRESOLVED',
        decisions === undefined
          ? `pinned package ${pin.packageId} carries no compiled semantic-decision declarations; decision "${request.decisionId}" cannot run`
          : `no compiled semantic-decision declaration "${request.decisionId}" exists in pinned package ${pin.packageId}; fail closed`,
      );
    }
    const binding = await bindSemanticDecisionTurn(request, {
      declaration,
      governancePin: pin,
      namespace: v3.tenantScope ?? pin.domainId,
      expression: options.bindings.expression,
    });
    // The resolver is proposal authority only: its output is data until
    // Central Admission accepts it. Any resolver failure (schema, harness,
    // currentness) throws and reaches admission never; a denial AFTER a
    // successful resolution is final — the call below resolves exactly once
    // and admits exactly once, with no fallback, retry or alternate path.
    const resolved = await resolveDecision(binding.invocation, request.resolver, sha256);
    return admitTurn({
      target: request.target,
      turn: request.turn,
      trigger: request.trigger,
      workflowInstanceId: request.workflowInstanceId,
      definition: request.definition,
      currentStateKey: request.currentStateKey,
      context: request.context,
      event: request.event,
      resolved,
      decisionSchema: binding.decisionSchema,
      now: request.now,
    });
  }

  return { runtime, activation, governance, admitTurn, resolveAndAdmitTurn, evidenceCapture };
}
