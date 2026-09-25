// Issue #308 / A2 I-005: fail-safe observed-basis classification (L2 A2 6.4
// / PRD A2 G3-3 / DAC C09, N10):
//
//   observed basis matches authoritative requirement -> proceed under Runtime
//     rules ('CURRENT');
//   observed basis is stale/conflicting             -> 'STALE' for the caller
//     to reject / classify stale / require explicit rebase-review — the
//     bridge itself never auto-proceeds, auto-rebases or auto-rejects;
//   basis required but absent                        -> fail closed
//     (BASIS_REQUIRED).
//
// This classifier is pure correlation evidence: it reads identity/revision
// facts, classifies them, and mutates nothing. Runtime transition authority
// and the actual proceed/reject decision stay with the Runtime and the
// caller's own reviewed rules. Semantic-target-to-workflow-address mapping is
// deliberately NOT attempted here: mapping UX semantic identity to concrete
// Runtime targets is Domain UX / application-composition knowledge, not
// Harness knowledge.
import { DacBridgeError } from './contracts.js';
import type {
  DacObservedBasis,
  DomainCommandCorrelation,
  SnapshotRef,
} from './contracts.js';
import { validateObservedBasis } from './adapters.js';
import type { ProjectionSnapshot } from '../v2/contracts/projection.js';
import type { WorkflowInstanceSnapshot } from '../v2/contracts/workflow.js';

/** The current authoritative observation a basis is classified against. */
export type AuthoritativeObservation =
  | { readonly kind: 'workflow-instance'; readonly snapshot: WorkflowInstanceSnapshot }
  | { readonly kind: 'projection'; readonly snapshot: ProjectionSnapshot }
  | {
      readonly kind: 'revision';
      readonly sourceKind: string;
      readonly targetKey?: string;
      readonly revision: string;
    };

export type ObservedBasisClassification =
  | { readonly status: 'CURRENT' }
  | {
      readonly status: 'STALE';
      readonly observedSourceKind: string;
      readonly observedRevision: string;
      readonly authoritativeRevision: string;
      readonly requiredHandling: 'REJECT_OR_EXPLICIT_REBASE_REVIEW';
    }
  | { readonly status: 'NOT_OBSERVED' };

/** Canonical target identity of a workflow instance observation. */
export function workflowInstanceTargetKey(address: {
  readonly workflowId: string;
  readonly instanceKey: string;
}): string {
  return `${address.workflowId}/${address.instanceKey}`;
}

/** Canonical target identity of a projection observation. */
export function projectionTargetKey(projectionId: string, key: string): string {
  return `${projectionId}/${key}`;
}

interface AuthoritativeFacts {
  readonly sourceKind: string;
  readonly targetKey: string | undefined;
  readonly revision: string;
}

function authoritativeFacts(observation: AuthoritativeObservation): AuthoritativeFacts {
  switch (observation.kind) {
    case 'workflow-instance': {
      const snapshot = observation.snapshot;
      if (snapshot === null || typeof snapshot !== 'object') {
        throw new DacBridgeError('INVALID_REFERENCE', 'observation.snapshot must be a WorkflowInstanceSnapshot');
      }
      if (
        typeof snapshot.stateRevision !== 'number' ||
        !Number.isSafeInteger(snapshot.stateRevision)
      ) {
        throw new DacBridgeError(
          'INVALID_REFERENCE',
          'observation.snapshot.stateRevision must be a safe integer',
        );
      }
      // Canonical string form of the numeric state revision.
      return {
        sourceKind: 'workflow-instance',
        targetKey: workflowInstanceTargetKey(snapshot.address),
        revision: String(snapshot.stateRevision),
      };
    }
    case 'projection': {
      const snapshot = observation.snapshot;
      if (
        snapshot === null ||
        typeof snapshot !== 'object' ||
        typeof snapshot.revision !== 'string' ||
        snapshot.revision.length === 0
      ) {
        throw new DacBridgeError(
          'INVALID_REFERENCE',
          'observation.snapshot must be a ProjectionSnapshot with a non-empty revision',
        );
      }
      return {
        sourceKind: 'projection',
        targetKey: projectionTargetKey(snapshot.projectionId, snapshot.key),
        revision: snapshot.revision,
      };
    }
    case 'revision': {
      if (
        observation === null ||
        typeof observation !== 'object' ||
        typeof observation.revision !== 'string' ||
        observation.revision.length === 0
      ) {
        throw new DacBridgeError(
          'INVALID_REFERENCE',
          'revision observation requires a non-empty revision',
        );
      }
      return {
        sourceKind: observation.sourceKind,
        targetKey: observation.targetKey,
        revision: observation.revision,
      };
    }
    default:
      throw new DacBridgeError(
        'INVALID_REFERENCE',
        `unknown authoritative observation kind "${String((observation as { kind?: unknown }).kind)}"`,
      );
  }
}

function snapshotRefFacts(
  snapshotRef: SnapshotRef,
): { sourceKind: string; targetKey: string; revision: string } {
  if (snapshotRef.sourceKind === 'workflow-instance') {
    return {
      sourceKind: 'workflow-instance',
      targetKey: workflowInstanceTargetKey(snapshotRef.address),
      revision: String(snapshotRef.stateRevision),
    };
  }
  if (snapshotRef.sourceKind === 'projection') {
    return {
      sourceKind: 'projection',
      targetKey: projectionTargetKey(snapshotRef.projectionId, snapshotRef.key),
      revision: snapshotRef.revision,
    };
  }
  return {
    sourceKind: 'business',
    targetKey: `${snapshotRef.source}/${snapshotRef.key}`,
    revision: snapshotRef.revision,
  };
}

/**
 * The observed basis a command correlation carries: the direct correlation
 * basis when supplied, otherwise the intent's basis. Presence in either slot
 * satisfies correlatability (DAC section 9).
 */
export function resolvedObservedBasis(
  correlation: Pick<DomainCommandCorrelation, 'intent' | 'observedBasis'> | undefined,
): DacObservedBasis | undefined {
  return correlation?.observedBasis ?? correlation?.intent?.observedBasis;
}

/**
 * Classify an observed basis against the current authoritative observation.
 *
 * - `requireBasis: true` and no basis anywhere → `BASIS_REQUIRED` (fail
 *   closed for that operation; never "assume current").
 * - A basis for a different source kind or a different target than the
 *   authoritative observation → `TARGET_MISMATCH` (fail closed; a reference
 *   is never silently reinterpreted to another target — DAC section 11).
 * - Exact revision equality → `CURRENT`; otherwise → `STALE` with the
 *   required `REJECT_OR_EXPLICIT_REBASE_REVIEW` handling hint.
 */
export function classifyObservedBasis(
  correlation: Pick<DomainCommandCorrelation, 'intent' | 'observedBasis'> | undefined,
  authoritative: AuthoritativeObservation,
  options: { readonly requireBasis: boolean },
): ObservedBasisClassification {
  if (authoritative === null || typeof authoritative !== 'object') {
    throw new DacBridgeError('INVALID_REFERENCE', 'authoritative observation must be an object');
  }
  const facts = authoritativeFacts(authoritative);
  const basis = resolvedObservedBasis(correlation);
  if (basis === undefined) {
    if (options.requireBasis) {
      throw new DacBridgeError(
        'BASIS_REQUIRED',
        'this operation requires an observed basis (stale-observation semantics) and none was correlated; fail closed instead of assuming current',
      );
    }
    return { status: 'NOT_OBSERVED' };
  }
  validateObservedBasis(basis, 'observedBasis');
  let observed: { sourceKind: string; targetKey: string | undefined; revision: string };
  if (basis.kind === 'snapshot-ref') {
    const snapshotFacts = snapshotRefFacts(basis.snapshotRef);
    observed = snapshotFacts;
  } else {
    observed = {
      sourceKind: basis.sourceKind,
      targetKey: basis.targetKey,
      revision: basis.revision,
    };
  }
  if (observed.sourceKind !== facts.sourceKind) {
    throw new DacBridgeError(
      'TARGET_MISMATCH',
      `observed basis source kind "${observed.sourceKind}" cannot be classified against authoritative source kind "${facts.sourceKind}"; a reference is never silently reinterpreted`,
    );
  }
  if (
    observed.targetKey !== undefined &&
    facts.targetKey !== undefined &&
    observed.targetKey !== facts.targetKey
  ) {
    throw new DacBridgeError(
      'TARGET_MISMATCH',
      `observed basis target "${observed.targetKey}" does not match authoritative target "${facts.targetKey}"; a reference is never silently reinterpreted`,
    );
  }
  if (observed.revision === facts.revision) {
    return { status: 'CURRENT' };
  }
  return {
    status: 'STALE',
    observedSourceKind: observed.sourceKind,
    observedRevision: observed.revision,
    authoritativeRevision: facts.revision,
    requiredHandling: 'REJECT_OR_EXPLICIT_REBASE_REVIEW',
  };
}
