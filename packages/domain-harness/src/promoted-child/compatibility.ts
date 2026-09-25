import type { CandidateEnvelope, CandidateExactReference } from '../candidate/contracts.js';
import type { CompiledArtifactIdentity } from '../contracts/domain-data.js';
import type { PromotedArtifactAuthorityBinding } from '../promoted-artifact/contracts.js';
import {
  DynamicChildExecutionError,
  type PromotedChildInvokingContext,
} from './contracts.js';

function referenceMatches(reference: CandidateExactReference, artifact: CompiledArtifactIdentity): boolean {
  return reference.kind === artifact.kind
    && reference.artifactId === artifact.artifactId
    && reference.contentDigest === artifact.contentDigest;
}

function requireReference(
  reference: CandidateExactReference,
  availableArtifacts: readonly CompiledArtifactIdentity[],
  label: string,
): void {
  const satisfied = availableArtifacts.some((artifact) => referenceMatches(reference, artifact));
  if (!satisfied) {
    throw new DynamicChildExecutionError(
      'DYNAMIC_CHILD_INCOMPATIBLE',
      `${label} reference ${reference.kind}:${reference.artifactId}@${reference.contentDigest} cannot be satisfied by the invoking pinned package`,
    );
  }
}

/**
 * Frozen L2 §11.4: promotion authority and every referenced rule/knowledge/skill/
 * tool identity are evaluated against the INVOKING instance's pinned package
 * context, never the globally active package.
 */
export function assertPromotedChildCompatible(
  envelope: CandidateEnvelope,
  promotionAuthority: PromotedArtifactAuthorityBinding,
  invoking: PromotedChildInvokingContext,
): void {
  if (promotionAuthority.packageId !== invoking.packageId) {
    throw new DynamicChildExecutionError(
      'DYNAMIC_CHILD_PACKAGE_MISMATCH',
      `promoted artifact was promoted for package ${promotionAuthority.packageId}, not invoking pinned package ${invoking.packageId}`,
    );
  }
  if (promotionAuthority.domainIntelligenceContentDigest !== invoking.domainIntelligenceContentDigest) {
    throw new DynamicChildExecutionError(
      'DYNAMIC_CHILD_PACKAGE_MISMATCH',
      'promoted artifact CDI digest does not match the invoking pinned package CDI digest',
    );
  }
  const promotedBaseline = promotionAuthority.governanceBaseline;
  const invokingBaseline = invoking.governanceBaseline;
  if (
    promotedBaseline.domainId !== invokingBaseline.domainId
    || promotedBaseline.governanceId !== invokingBaseline.governanceId
    || promotedBaseline.schemaVersion !== invokingBaseline.schemaVersion
    || promotedBaseline.contentDigest !== invokingBaseline.contentDigest
  ) {
    throw new DynamicChildExecutionError(
      'DYNAMIC_CHILD_GOVERNANCE_MISMATCH',
      'promoted artifact Governance Baseline does not match the invoking pinned Governance Baseline',
    );
  }

  for (const reference of envelope.references) {
    requireReference(reference, invoking.availableArtifacts, 'envelope.references');
  }
  for (const reference of envelope.io.inputs) {
    requireReference(reference, invoking.availableArtifacts, 'envelope.io.inputs');
  }
  for (const reference of envelope.io.outputs) {
    requireReference(reference, invoking.availableArtifacts, 'envelope.io.outputs');
  }
  for (const tool of envelope.tools) {
    requireReference(tool, invoking.availableArtifacts, 'envelope.tools');
  }
  for (const reference of envelope.hardInvariants) {
    requireReference(reference, invoking.availableArtifacts, 'envelope.hardInvariants');
  }
  if (envelope.mutation.kind === 'durable-effect') {
    for (const effect of envelope.mutation.effects) {
      requireReference(effect, invoking.availableArtifacts, 'envelope.mutation.effects');
    }
  }
}

/** Applicability is evaluated against the decision invocation's exact facts. */
export function assertPromotedChildApplicable(
  envelope: CandidateEnvelope,
  invoking: PromotedChildInvokingContext,
): void {
  for (const reference of envelope.applicability) {
    const satisfied = invoking.applicabilityFacts.some((fact) => referenceMatches(reference, fact));
    if (!satisfied) {
      throw new DynamicChildExecutionError(
        'DYNAMIC_CHILD_NOT_APPLICABLE',
        `applicability reference ${reference.kind}:${reference.artifactId}@${reference.contentDigest} is not applicable to this decision invocation`,
      );
    }
  }
}
