import { canonicalJsonStringify, computeCanonicalJsonDigest, type Sha256Port } from '../contracts/identity.js';
import type { JsonValue } from '../contracts/json.js';
import type { GovernanceBaselineAuthorityBinding, GovernanceBaselineIdentity } from '../governance/contracts.js';
import { createPromotedArtifactBody } from '../promoted-artifact/identity.js';
import type { PromotedArtifactIdentity, SelectedPromotedArtifact } from '../promoted-artifact/contracts.js';
import {
  PromotionActivationAuthorityError,
  type ActivationAuthorityRequest,
  type ActivationAuthorityResult,
  type ExactGovernanceBaselineAuditIdentity,
  type ExplicitAuthorityAction,
  type FreshSelectionActivationPort,
  type GovernanceEvaluationEvidence,
  type GovernanceTransitionRevalidation,
  type HumanOperatorActorIdentity,
  type PromotedArtifactAuthorityPort,
  type PromotionActivationAuditRecord,
  type PromotionActivationAuditStore,
  type PromotionAuthorityRequest,
  type PromotionAuthorityResult,
} from './contracts.js';

const FLOATING_TOKENS = new Set(['latest', 'current', 'active', 'head', 'default', '*']);

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function requireNonEmpty(value: string, label: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new PromotionActivationAuthorityError('INVALID_EXACT_AUTHORITY', `${label} must be non-empty`);
  }
}

function rejectFloating(value: string, label: string): void {
  requireNonEmpty(value, label);
  if (FLOATING_TOKENS.has(value.trim().toLowerCase())) {
    throw new PromotionActivationAuthorityError(
      'FLOATING_AUTHORITY_FORBIDDEN',
      `${label} must be an exact immutable identity, not ${value}`,
    );
  }
}

function exactBaseline(identity: GovernanceBaselineIdentity): ExactGovernanceBaselineAuditIdentity {
  return {
    domainId: identity.domainId,
    governanceId: identity.governanceId,
    schemaVersion: identity.schemaVersion,
    contentDigest: identity.contentDigest,
  };
}

function sameBaseline(
  left: ExactGovernanceBaselineAuditIdentity,
  right: ExactGovernanceBaselineAuditIdentity,
): boolean {
  return left.domainId === right.domainId
    && left.governanceId === right.governanceId
    && left.schemaVersion === right.schemaVersion
    && left.contentDigest === right.contentDigest;
}

function sameArtifact(left: PromotedArtifactIdentity, right: PromotedArtifactIdentity): boolean {
  return left.kind === right.kind
    && left.artifactId === right.artifactId
    && left.contentDigest === right.contentDigest;
}

function assertActor(actor: HumanOperatorActorIdentity): void {
  if (actor?.kind !== 'human-operator') {
    throw new PromotionActivationAuthorityError(
      'HUMAN_OPERATOR_AUTHORITY_REQUIRED',
      'promotion and activation require explicit human/operator authority',
    );
  }
  requireNonEmpty(actor.actorId, 'action.actor.actorId');
  requireNonEmpty(actor.operatorId, 'action.actor.operatorId');
}

function assertAction<Action extends 'promote' | 'activate'>(
  action: ExplicitAuthorityAction<Action>,
  expected: Action,
): void {
  if (action?.action !== expected) {
    throw new PromotionActivationAuthorityError(
      'INVALID_AUTHORITY_ACTION',
      `${expected} requires a distinct explicit ${expected} authority action`,
    );
  }
  requireNonEmpty(action.actionId, 'action.actionId');
  requireNonEmpty(action.recordedAt, 'action.recordedAt');
  assertActor(action.actor);
}

function assertAuthorityBinding(binding: GovernanceBaselineAuthorityBinding): void {
  requireNonEmpty(binding.domainId, 'authorityBinding.domainId');
  requireNonEmpty(binding.packageId, 'authorityBinding.packageId');
  rejectFloating(binding.domainIntelligenceContentDigest, 'authorityBinding.domainIntelligenceContentDigest');
  const baseline = binding.governanceBaseline;
  requireNonEmpty(baseline.domainId, 'governanceBaseline.domainId');
  requireNonEmpty(baseline.governanceId, 'governanceBaseline.governanceId');
  requireNonEmpty(baseline.schemaVersion, 'governanceBaseline.schemaVersion');
  rejectFloating(baseline.contentDigest, 'governanceBaseline.contentDigest');
  if (binding.domainId !== baseline.domainId) {
    throw new PromotionActivationAuthorityError(
      'GOVERNANCE_BASELINE_MISMATCH',
      'package/CDI domain and Governance Baseline domain must match exactly',
    );
  }
}

function assertEvaluation(
  evidence: GovernanceEvaluationEvidence,
  target: ExactGovernanceBaselineAuditIdentity,
): void {
  requireNonEmpty(evidence.evaluationId, 'evaluation.evaluationId');
  if (!sameBaseline(evidence.evaluatedUnder, target)) {
    throw new PromotionActivationAuthorityError(
      'GOVERNANCE_BASELINE_MISMATCH',
      'evaluation is not bound to the exact target Governance Baseline',
    );
  }
  if (evidence.verdict !== 'allow') {
    throw new PromotionActivationAuthorityError(
      'GOVERNANCE_TRANSITION_REJECTED',
      'governance evaluation did not authorize the requested lifecycle action',
    );
  }
  if (evidence.hardInvariantsSatisfied !== true) {
    throw new PromotionActivationAuthorityError(
      'HARD_INVARIANT_REJECTED',
      'human/operator authority cannot override failed Hard Invariants',
    );
  }
}

function normalizeTransition(
  preChange: ExactGovernanceBaselineAuditIdentity,
  target: ExactGovernanceBaselineAuditIdentity,
  evidence: GovernanceTransitionRevalidation | undefined,
): GovernanceTransitionRevalidation | undefined {
  if (sameBaseline(preChange, target)) {
    if (evidence !== undefined) {
      throw new PromotionActivationAuthorityError(
        'GOVERNANCE_TRANSITION_MISMATCH',
        'transition evidence was supplied although Governance Baseline did not change',
      );
    }
    return undefined;
  }

  if (evidence === undefined) {
    throw new PromotionActivationAuthorityError(
      'GOVERNANCE_REVALIDATION_REQUIRED',
      'Governance Baseline change requires explicit baseline-bound revalidation',
    );
  }
  requireNonEmpty(evidence.revalidationId, 'governanceTransition.revalidationId');
  if (!sameBaseline(evidence.fromBaseline, preChange) || !sameBaseline(evidence.toBaseline, target)) {
    throw new PromotionActivationAuthorityError(
      'GOVERNANCE_TRANSITION_MISMATCH',
      'Governance transition evidence does not bind the exact pre-change and target baselines',
    );
  }
  if (sameBaseline(evidence.evaluatedUnder, target)) {
    throw new PromotionActivationAuthorityError(
      'GOVERNANCE_SELF_AUTHORIZATION_FORBIDDEN',
      'a new Governance Baseline cannot authorize its own transition',
    );
  }
  if (!sameBaseline(evidence.evaluatedUnder, preChange)) {
    throw new PromotionActivationAuthorityError(
      'GOVERNANCE_TRANSITION_MISMATCH',
      'Governance transition must be evaluated under exact pre-change baseline authority',
    );
  }
  if (evidence.verdict !== 'allow') {
    throw new PromotionActivationAuthorityError(
      'GOVERNANCE_TRANSITION_REJECTED',
      'pre-change Governance Baseline rejected the transition',
    );
  }
  return cloneJson(evidence);
}

function assertExactVersion(version: string): void {
  rejectFloating(version, 'artifactVersion');
}

function assertValidationBaseline(
  request: PromotionAuthorityRequest,
  target: ExactGovernanceBaselineAuditIdentity,
): asserts request is PromotionAuthorityRequest & { readonly validation: Extract<PromotionAuthorityRequest['validation'], { readonly ok: true }> } {
  if (!request.validation.ok) {
    throw new PromotionActivationAuthorityError(
      'PROMOTION_REQUIRES_VALIDATED_CANDIDATE',
      'proposal/evaluation/rejected validation cannot grant promotion authority',
    );
  }
  if (!sameBaseline(exactBaseline(request.validation.identity.governanceBaseline), target)) {
    throw new PromotionActivationAuthorityError(
      'STALE_VALIDATION',
      'Candidate validation is stale for the exact target Governance Baseline',
    );
  }
}

function authorityTuple(
  action: ExplicitAuthorityAction<'promote' | 'activate'>,
  artifact: PromotedArtifactIdentity,
  candidate: Extract<PromotionAuthorityRequest['validation'], { readonly ok: true }>['identity'],
  binding: GovernanceBaselineAuthorityBinding,
  preChange: ExactGovernanceBaselineAuditIdentity,
  evaluation: GovernanceEvaluationEvidence,
  version: string,
  transition: GovernanceTransitionRevalidation | undefined,
): Omit<PromotionActivationAuditRecord, 'auditId'> {
  return {
    actionId: action.actionId,
    action: action.action,
    actor: cloneJson(action.actor),
    recordedAt: action.recordedAt,
    artifact: cloneJson(artifact),
    candidate: cloneJson(candidate),
    package: {
      domainId: binding.domainId,
      packageId: binding.packageId,
      domainIntelligenceContentDigest: binding.domainIntelligenceContentDigest,
    },
    governance: {
      preChangeBaseline: cloneJson(preChange),
      targetBaseline: exactBaseline(binding.governanceBaseline),
      evaluatedUnder: cloneJson(evaluation.evaluatedUnder),
      ...(transition === undefined ? {} : { transition: cloneJson(transition) }),
    },
    evaluationId: evaluation.evaluationId,
    artifactVersion: version,
  };
}

async function makeAudit(
  tuple: Omit<PromotionActivationAuditRecord, 'auditId'>,
  sha256: Sha256Port,
): Promise<PromotionActivationAuditRecord> {
  const auditId = await computeCanonicalJsonDigest(tuple as unknown as JsonValue, sha256);
  return { auditId, ...tuple };
}

export class MemoryAuthorityAuditStore implements PromotionActivationAuditStore {
  private readonly records = new Map<string, PromotionActivationAuditRecord>();

  async getByActionId(actionId: string): Promise<PromotionActivationAuditRecord | undefined> {
    const record = this.records.get(actionId);
    return record === undefined ? undefined : cloneJson(record);
  }

  async put(record: PromotionActivationAuditRecord): Promise<void> {
    const existing = this.records.get(record.actionId);
    if (existing !== undefined) {
      throw new PromotionActivationAuthorityError(
        'AUDIT_IDENTITY_CONFLICT',
        `authority action ${record.actionId} is already bound to audit ${existing.auditId}`,
      );
    }
    this.records.set(record.actionId, cloneJson(record));
  }
}

export class PromotionActivationAuthority {
  constructor(
    private readonly registry: PromotedArtifactAuthorityPort,
    private readonly auditStore: PromotionActivationAuditStore,
    private readonly activationPort: FreshSelectionActivationPort,
    private readonly sha256: Sha256Port,
  ) {}

  private async assertUnusedAction(actionId: string): Promise<void> {
    const existing = await this.auditStore.getByActionId(actionId);
    if (existing !== undefined) {
      throw new PromotionActivationAuthorityError(
        'AUDIT_IDENTITY_CONFLICT',
        `authority action ${actionId} is already bound to audit ${existing.auditId}`,
      );
    }
  }

  private async readPreChangeBaseline(domainId: string): Promise<ExactGovernanceBaselineAuditIdentity> {
    let baseline: GovernanceBaselineIdentity;
    try {
      baseline = await this.activationPort.readCurrentGovernanceBaseline(domainId);
    } catch (error) {
      throw new PromotionActivationAuthorityError(
        'STALE_GOVERNANCE_BASELINE',
        'exact pre-change Governance Baseline could not be read from the activation authority seam',
        error,
      );
    }
    if (baseline.domainId !== domainId) {
      throw new PromotionActivationAuthorityError(
        'STALE_GOVERNANCE_BASELINE',
        'activation authority seam returned a Governance Baseline for a different domain',
      );
    }
    rejectFloating(baseline.contentDigest, 'preChangeGovernanceBaseline.contentDigest');
    return exactBaseline(baseline);
  }

  private async assertPreChangeStillCurrent(
    domainId: string,
    expected: ExactGovernanceBaselineAuditIdentity,
  ): Promise<void> {
    const current = await this.readPreChangeBaseline(domainId);
    if (!sameBaseline(current, expected)) {
      throw new PromotionActivationAuthorityError(
        'STALE_GOVERNANCE_BASELINE',
        'pre-change Governance Baseline changed while authority action was being evaluated',
      );
    }
  }

  async promote(request: PromotionAuthorityRequest): Promise<PromotionAuthorityResult> {
    assertAction(request.action, 'promote');
    assertExactVersion(request.version);
    assertAuthorityBinding(request.authorityBinding);
    const target = exactBaseline(request.authorityBinding.governanceBaseline);
    const preChange = await this.readPreChangeBaseline(request.authorityBinding.domainId);
    assertValidationBaseline(request, target);
    assertEvaluation(request.evaluation, target);
    const governanceTransition = normalizeTransition(preChange, target, request.governanceTransition);

    const expectedBody = await createPromotedArtifactBody({
      artifactId: request.artifactId,
      semanticMaterial: request.semanticMaterial,
    }, this.sha256);
    if (expectedBody.identity.contentDigest !== request.validation.identity.candidateContentDigest) {
      throw new PromotionActivationAuthorityError(
        'STALE_VALIDATION',
        'validated Candidate semantic digest no longer matches promotion material',
      );
    }

    const tuple = authorityTuple(
      request.action,
      expectedBody.identity,
      request.validation.identity,
      request.authorityBinding,
      preChange,
      request.evaluation,
      request.version,
      governanceTransition,
    );
    const audit = await makeAudit(tuple, this.sha256);
    await this.assertUnusedAction(request.action.actionId);
    await this.assertPreChangeStillCurrent(request.authorityBinding.domainId, preChange);

    const promoted = await this.registry.promote({
      artifactId: request.artifactId,
      version: request.version,
      validation: request.validation,
      authorityBinding: request.authorityBinding,
      semanticMaterial: request.semanticMaterial,
      promotion: {
        recordId: request.action.actionId,
        authorityRef: `${request.action.actor.actorId}/${request.action.actor.operatorId}`,
        recordedAt: request.action.recordedAt,
      },
    });

    if (!sameArtifact(promoted.body.identity, expectedBody.identity)) {
      throw new PromotionActivationAuthorityError(
        'PROMOTED_ARTIFACT_MISMATCH',
        'promoted registry returned an artifact different from the authorized exact identity',
      );
    }

    try {
      await this.auditStore.put(audit);
    } catch (error) {
      if (error instanceof PromotionActivationAuthorityError) throw error;
      throw new PromotionActivationAuthorityError(
        'AUTHORITY_AUDIT_WRITE_FAILED',
        'promotion committed registry provenance but full authority audit persistence failed',
        error,
      );
    }
    return { promoted, audit };
  }

  async activate(request: ActivationAuthorityRequest): Promise<ActivationAuthorityResult> {
    assertAction(request.action, 'activate');
    assertExactVersion(request.version);
    assertAuthorityBinding(request.authorityBinding);
    rejectFloating(request.expectedArtifact.contentDigest, 'expectedArtifact.contentDigest');
    const target = exactBaseline(request.authorityBinding.governanceBaseline);
    const preChange = await this.readPreChangeBaseline(request.authorityBinding.domainId);
    assertEvaluation(request.evaluation, target);
    const governanceTransition = normalizeTransition(preChange, target, request.governanceTransition);
    await this.assertUnusedAction(request.action.actionId);

    let selected: SelectedPromotedArtifact;
    try {
      selected = await this.registry.selectVersion({
        artifactId: request.artifactId,
        version: request.version,
        expectedAuthority: request.authorityBinding,
      });
    } catch (error) {
      throw new PromotionActivationAuthorityError(
        'PROMOTED_AUTHORITY_REQUIRED',
        'activation requires an exact promoted artifact under the target package/CDI/Governance authority',
        error,
      );
    }
    if (!sameArtifact(selected.body.identity, request.expectedArtifact)) {
      throw new PromotionActivationAuthorityError(
        'PROMOTED_ARTIFACT_MISMATCH',
        'selected promoted artifact does not equal the exact artifact authorized for activation',
      );
    }
    if (!sameBaseline(exactBaseline(selected.promotion.sourceCandidate.governanceBaseline), target)) {
      throw new PromotionActivationAuthorityError(
        'STALE_VALIDATION',
        'promoted artifact source Candidate was not revalidated against the target Governance Baseline',
      );
    }

    const tuple = authorityTuple(
      request.action,
      selected.body.identity,
      selected.promotion.sourceCandidate,
      request.authorityBinding,
      preChange,
      request.evaluation,
      request.version,
      governanceTransition,
    );
    const audit = await makeAudit(tuple, this.sha256);

    // Persist the exact activation grant before exposing it to T-014. The grant
    // carries exact expected pre-change authority so T-014 can atomically fail
    // closed if the active binding changed after this evaluation snapshot.
    try {
      await this.auditStore.put(audit);
    } catch (error) {
      if (error instanceof PromotionActivationAuthorityError) throw error;
      throw new PromotionActivationAuthorityError(
        'AUTHORITY_AUDIT_WRITE_FAILED',
        'activation authority audit persistence failed before fresh binding publication',
        error,
      );
    }

    try {
      await this.activationPort.publishFreshSelection({
        artifact: selected.body.identity,
        authorityBinding: cloneJson(request.authorityBinding),
        expectedPreChangeGovernanceBaseline: cloneJson(preChange),
        audit,
      });
    } catch (error) {
      throw new PromotionActivationAuthorityError(
        'ACTIVATION_BINDING_FAILED',
        'T-014 fresh-selection activation seam rejected or failed the authority grant',
        error,
      );
    }

    return { selected, audit };
  }
}

/** Deterministic equality helper for review/tests; audit identity never relies on object insertion order. */
export function samePromotionActivationAudit(
  left: PromotionActivationAuditRecord,
  right: PromotionActivationAuditRecord,
): boolean {
  return canonicalJsonStringify(left) === canonicalJsonStringify(right);
}
