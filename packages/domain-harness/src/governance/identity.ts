import {
  canonicalJsonStringify,
  computeCanonicalJsonDigest,
  isContentDigest,
  type Sha256Port,
} from '../contracts/identity.js';
import type { JsonObject } from '../contracts/json.js';
import {
  GovernanceContractError,
  type GovernanceBaselineAuthorityBinding,
  type GovernanceBaselineBody,
  type GovernanceBaselineIdentity,
  type GovernanceBaselineIdentityInput,
  type GovernanceClassification,
  type GovernancePackageCdiBinding,
  type HumanOperatorGovernanceAuthority,
} from './contracts.js';

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new GovernanceContractError(
      'INVALID_GOVERNANCE_IDENTITY',
      `${field} must be a non-empty string`,
    );
  }
  return value;
}

export function assertGovernanceBaselineIdentity(
  identity: GovernanceBaselineIdentity,
): void {
  requireNonEmptyString(identity.domainId, 'domainId');
  requireNonEmptyString(identity.governanceId, 'governanceId');
  requireNonEmptyString(identity.schemaVersion, 'schemaVersion');
  if (!isContentDigest(identity.contentDigest)) {
    throw new GovernanceContractError(
      'INVALID_GOVERNANCE_IDENTITY',
      'contentDigest must be a non-empty exact content digest',
    );
  }
  if (identity.version !== undefined) requireNonEmptyString(identity.version, 'version');
}

/** Exact registry key. Lifecycle version labels are deliberately excluded. */
export function governanceBaselineKey(identity: GovernanceBaselineIdentity): string {
  assertGovernanceBaselineIdentity(identity);
  return canonicalJsonStringify({
    domainId: identity.domainId,
    governanceId: identity.governanceId,
    schemaVersion: identity.schemaVersion,
    contentDigest: identity.contentDigest,
  });
}

export function sameGovernanceBaselineIdentity(
  left: GovernanceBaselineIdentity,
  right: GovernanceBaselineIdentity,
): boolean {
  return governanceBaselineKey(left) === governanceBaselineKey(right);
}

function semanticDigestMaterial(schemaVersion: string, semantics: JsonObject): JsonObject {
  return { schemaVersion, semantics };
}

export async function computeGovernanceBaselineIdentity(
  input: GovernanceBaselineIdentityInput,
  sha256: Sha256Port,
): Promise<GovernanceBaselineIdentity> {
  const domainId = requireNonEmptyString(input.domainId, 'domainId');
  const governanceId = requireNonEmptyString(input.governanceId, 'governanceId');
  const schemaVersion = requireNonEmptyString(input.schemaVersion, 'schemaVersion');
  const version = input.version === undefined
    ? undefined
    : requireNonEmptyString(input.version, 'version');
  const contentDigest = await computeCanonicalJsonDigest(
    semanticDigestMaterial(schemaVersion, input.semantics),
    sha256,
  );

  return version === undefined
    ? { domainId, governanceId, schemaVersion, contentDigest }
    : { domainId, governanceId, schemaVersion, version, contentDigest };
}

export async function createGovernanceBaselineBody(
  input: GovernanceBaselineIdentityInput,
  sha256: Sha256Port,
): Promise<GovernanceBaselineBody> {
  return {
    identity: await computeGovernanceBaselineIdentity(input, sha256),
    semantics: input.semantics,
  };
}

export async function verifyGovernanceBaselineBody(
  body: GovernanceBaselineBody,
  sha256: Sha256Port,
): Promise<void> {
  assertGovernanceBaselineIdentity(body.identity);
  const expected = await computeCanonicalJsonDigest(
    semanticDigestMaterial(body.identity.schemaVersion, body.semantics),
    sha256,
  );
  if (expected !== body.identity.contentDigest) {
    throw new GovernanceContractError(
      'GOVERNANCE_DIGEST_MISMATCH',
      `Governance Baseline ${body.identity.governanceId} content digest does not match canonical semantics`,
    );
  }
}

export function assertGovernancePackageCdiBinding(
  binding: GovernancePackageCdiBinding,
): void {
  if (typeof binding.domainId !== 'string' || binding.domainId.trim().length === 0) {
    throw new GovernanceContractError(
      'INVALID_PACKAGE_CDI_BINDING',
      'package/CDI binding domainId must be non-empty',
    );
  }
  if (typeof binding.packageId !== 'string' || binding.packageId.trim().length === 0) {
    throw new GovernanceContractError(
      'INVALID_PACKAGE_CDI_BINDING',
      'package/CDI binding packageId must be non-empty',
    );
  }
  if (!isContentDigest(binding.domainIntelligenceContentDigest)) {
    throw new GovernanceContractError(
      'INVALID_PACKAGE_CDI_BINDING',
      'package/CDI binding domainIntelligenceContentDigest must be exact and non-empty',
    );
  }
}

export function createGovernanceBaselineAuthorityBinding(
  packageCdi: GovernancePackageCdiBinding,
  governanceBaseline: GovernanceBaselineIdentity,
): GovernanceBaselineAuthorityBinding {
  assertGovernancePackageCdiBinding(packageCdi);
  assertGovernanceBaselineIdentity(governanceBaseline);
  if (packageCdi.domainId !== governanceBaseline.domainId) {
    throw new GovernanceContractError(
      'GOVERNANCE_DOMAIN_MISMATCH',
      `package/CDI domain ${packageCdi.domainId} does not match Governance Baseline domain ${governanceBaseline.domainId}`,
    );
  }
  return {
    domainId: packageCdi.domainId,
    packageId: packageCdi.packageId,
    domainIntelligenceContentDigest: packageCdi.domainIntelligenceContentDigest,
    governanceBaseline,
  };
}

function asHumanOperatorAuthority(value: unknown): HumanOperatorGovernanceAuthority | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const candidate = value as Partial<HumanOperatorGovernanceAuthority>;
  if (candidate.kind !== 'human-operator-governance') return undefined;
  if (typeof candidate.actorId !== 'string' || candidate.actorId.trim().length === 0) return undefined;
  if (candidate.governingBaseline === undefined) return undefined;
  try {
    assertGovernanceBaselineIdentity(candidate.governingBaseline);
  } catch {
    return undefined;
  }
  return candidate as HumanOperatorGovernanceAuthority;
}

/**
 * Unknown classifications fail safe to governance-critical. The one downgrade
 * path is an explicit non-governance declaration backed by human/operator
 * governance authority under an exact governing baseline.
 */
export function resolveGovernanceClassification(
  classification: unknown,
  authority?: unknown,
): GovernanceClassification {
  if (classification !== 'non-governance') return 'governance-critical';
  if (asHumanOperatorAuthority(authority) === undefined) {
    throw new GovernanceContractError(
      'NON_GOVERNANCE_REQUIRES_OPERATOR_AUTHORITY',
      'non-governance classification requires explicit human/operator governance authority',
    );
  }
  return 'non-governance';
}
