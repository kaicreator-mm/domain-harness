import { computeCanonicalJsonDigest, type Sha256Port } from '../contracts/identity.js';
import type { WorkflowAddress } from '../v2/contracts/workflow.js';
import type {
  PromotedArtifactAuthorityBinding,
  PromotedArtifactIdentity,
  PromotedArtifactRetentionReference,
  SelectedPromotedArtifact,
} from '../promoted-artifact/contracts.js';
import {
  DynamicChildExecutionError,
  type DynamicChildInvocationSlot,
  type PromotedChildArtifactPort,
  type PromotedChildExpectedAuthority,
  type PromotedChildSelector,
  type ResolvedPromotedChild,
} from './contracts.js';

const FLOATING_SELECTOR_TOKENS = new Set(['latest', 'current', 'active', 'head', 'default', '*']);

function requireNonEmpty(value: string, label: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new DynamicChildExecutionError('DYNAMIC_CHILD_SELECTION_INVALID', `${label} must be non-empty`);
  }
}

function rejectFloatingSelector(value: string, label: string): void {
  requireNonEmpty(value, label);
  if (FLOATING_SELECTOR_TOKENS.has(value.trim().toLowerCase())) {
    throw new DynamicChildExecutionError(
      'DYNAMIC_CHILD_SELECTION_INVALID',
      `${label} must be exact; floating selector ${JSON.stringify(value)} is forbidden`,
    );
  }
}

function assertExpectedAuthority(authority: PromotedChildExpectedAuthority): void {
  requireNonEmpty(authority.domainId, 'expectedAuthority.domainId');
  requireNonEmpty(authority.packageId, 'expectedAuthority.packageId');
  rejectFloatingSelector(authority.domainIntelligenceContentDigest, 'expectedAuthority.domainIntelligenceContentDigest');
  requireNonEmpty(authority.governanceBaseline.domainId, 'expectedAuthority.governanceBaseline.domainId');
  requireNonEmpty(authority.governanceBaseline.governanceId, 'expectedAuthority.governanceBaseline.governanceId');
  requireNonEmpty(authority.governanceBaseline.schemaVersion, 'expectedAuthority.governanceBaseline.schemaVersion');
  rejectFloatingSelector(authority.governanceBaseline.contentDigest, 'expectedAuthority.governanceBaseline.contentDigest');
  if (authority.domainId !== authority.governanceBaseline.domainId) {
    throw new DynamicChildExecutionError(
      'DYNAMIC_CHILD_GOVERNANCE_MISMATCH',
      'invoking package/CDI domain and Governance Baseline domain must match exactly',
    );
  }
}

/**
 * Resolve a configured selector EXACTLY ONCE for one decision invocation.
 * Missing bodies, revoked artifacts, stale alias revisions, corrupt digests and
 * promotion-authority mismatches fail closed inside the T-012 registry seam and
 * propagate as fail-closed selection failures. The returned object is the only
 * resolution reused by compatibility, pinning, compilation and telemetry.
 */
export async function resolvePromotedChildOnce(
  selector: PromotedChildSelector,
  expectedAuthority: PromotedChildExpectedAuthority,
  port: PromotedChildArtifactPort,
): Promise<ResolvedPromotedChild> {
  assertExpectedAuthority(expectedAuthority);
  let selected: SelectedPromotedArtifact;
  switch (selector.kind) {
    case 'exact-digest': {
      requireNonEmpty(selector.artifact.artifactId, 'selector.artifact.artifactId');
      rejectFloatingSelector(selector.artifact.contentDigest, 'selector.artifact.contentDigest');
      selected = await port.resolveExact(selector.artifact, expectedAuthority);
      break;
    }
    case 'version': {
      requireNonEmpty(selector.artifactId, 'selector.artifactId');
      rejectFloatingSelector(selector.version, 'selector.version');
      selected = await port.selectVersion(selector.artifactId, selector.version, expectedAuthority);
      break;
    }
    case 'alias': {
      requireNonEmpty(selector.artifactId, 'selector.artifactId');
      rejectFloatingSelector(selector.alias, 'selector.alias');
      if (selector.expectedRevision !== undefined && (!Number.isInteger(selector.expectedRevision) || selector.expectedRevision < 0)) {
        throw new DynamicChildExecutionError(
          'DYNAMIC_CHILD_SELECTION_INVALID',
          'selector.expectedRevision must be a non-negative integer',
        );
      }
      selected = await port.selectAlias(selector.artifactId, selector.alias, selector.expectedRevision, expectedAuthority);
      break;
    }
    default: {
      throw new DynamicChildExecutionError(
        'DYNAMIC_CHILD_SELECTION_INVALID',
        `unknown promoted child selector kind ${JSON.stringify((selector as { readonly kind?: unknown }).kind)}`,
      );
    }
  }
  return {
    selection: selected.selection,
    body: selected.body,
    promotion: selected.promotion,
  };
}

/** Canonical logical-slot key. One slot is insert-once and never silently reallocated. */
export function dynamicChildSlotKey(slot: DynamicChildInvocationSlot): string {
  assertSlot(slot);
  return JSON.stringify([
    slot.target.workflowId,
    slot.target.instanceKey,
    slot.parentActorId,
    slot.childActorId,
    slot.invocationOrdinal,
  ]);
}

export function assertSlot(slot: DynamicChildInvocationSlot): void {
  requireNonEmpty(slot.target.workflowId, 'slot.target.workflowId');
  requireNonEmpty(slot.target.instanceKey, 'slot.target.instanceKey');
  requireNonEmpty(slot.parentActorId, 'slot.parentActorId');
  requireNonEmpty(slot.childActorId, 'slot.childActorId');
  if (!Number.isSafeInteger(slot.invocationOrdinal) || slot.invocationOrdinal <= 0) {
    throw new DynamicChildExecutionError(
      'DYNAMIC_CHILD_SELECTION_INVALID',
      'slot.invocationOrdinal must be a positive safe integer',
    );
  }
}

export async function computeRetentionReferenceId(
  slot: DynamicChildInvocationSlot,
  invokingPackageId: string,
  artifact: PromotedArtifactIdentity,
  sha256: Sha256Port,
): Promise<string> {
  const digest = await computeCanonicalJsonDigest(
    {
      slot: [
        slot.target.workflowId,
        slot.target.instanceKey,
        slot.parentActorId,
        slot.childActorId,
        slot.invocationOrdinal,
      ],
      invokingPackageId,
      artifact: [artifact.kind, artifact.artifactId, artifact.contentDigest],
    },
    sha256,
  );
  return `dynamic-child-pin:${digest}`;
}

export function createRetentionReference(
  referenceId: string,
  artifact: PromotedArtifactIdentity,
  authorityBinding: PromotedArtifactAuthorityBinding,
): PromotedArtifactRetentionReference {
  return {
    referenceId,
    reason: 'recoverable-execution',
    artifact: {
      kind: artifact.kind,
      artifactId: artifact.artifactId,
      contentDigest: artifact.contentDigest,
    },
    authorityBinding,
  };
}

export function sameSlotAddress(left: WorkflowAddress, right: WorkflowAddress): boolean {
  return left.workflowId === right.workflowId && left.instanceKey === right.instanceKey;
}
