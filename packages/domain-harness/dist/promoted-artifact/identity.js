import { compileCompiledArtifactIdentity } from '../contracts/domain-data.js';
import { canonicalizeJson } from '../contracts/identity.js';
import { PROMOTED_ARTIFACT_KIND, PromotedArtifactContractError, } from './contracts.js';
function requireNonEmpty(value, label) {
    if (value.length === 0) {
        throw new PromotedArtifactContractError('INVALID_PROMOTED_ARTIFACT', `${label} must be non-empty`);
    }
}
export function normalizePromotedArtifactAuthority(binding) {
    requireNonEmpty(binding.domainId, 'authority domainId');
    requireNonEmpty(binding.packageId, 'authority packageId');
    requireNonEmpty(binding.domainIntelligenceContentDigest, 'authority CDI content digest');
    requireNonEmpty(binding.governanceBaseline.domainId, 'governance domainId');
    requireNonEmpty(binding.governanceBaseline.governanceId, 'governanceId');
    requireNonEmpty(binding.governanceBaseline.schemaVersion, 'governance schemaVersion');
    requireNonEmpty(binding.governanceBaseline.contentDigest, 'governance contentDigest');
    if (binding.domainId !== binding.governanceBaseline.domainId) {
        throw new PromotedArtifactContractError('PROMOTION_AUTHORITY_MISMATCH', 'package/CDI domain and Governance Baseline domain must match exactly');
    }
    return {
        domainId: binding.domainId,
        packageId: binding.packageId,
        domainIntelligenceContentDigest: binding.domainIntelligenceContentDigest,
        governanceBaseline: {
            domainId: binding.governanceBaseline.domainId,
            governanceId: binding.governanceBaseline.governanceId,
            schemaVersion: binding.governanceBaseline.schemaVersion,
            contentDigest: binding.governanceBaseline.contentDigest,
        },
    };
}
export function assertValidatedCandidateAuthority(validation, binding) {
    if (!validation.ok) {
        throw new PromotedArtifactContractError('PROMOTION_REQUIRES_VALIDATED_CANDIDATE', 'a rejected Candidate cannot become a promoted artifact');
    }
    requireNonEmpty(validation.identity.candidateContentDigest, 'candidateContentDigest');
    const authority = normalizePromotedArtifactAuthority(binding);
    const candidateAuthority = validation.identity.governanceBaseline;
    if (candidateAuthority.domainId !== authority.governanceBaseline.domainId
        || candidateAuthority.governanceId !== authority.governanceBaseline.governanceId
        || candidateAuthority.schemaVersion !== authority.governanceBaseline.schemaVersion
        || candidateAuthority.contentDigest !== authority.governanceBaseline.contentDigest) {
        throw new PromotedArtifactContractError('PROMOTION_AUTHORITY_MISMATCH', 'validated Candidate Governance Baseline does not match promotion authority');
    }
    return authority;
}
export function samePromotedArtifactIdentity(left, right) {
    return left.kind === right.kind
        && left.artifactId === right.artifactId
        && left.contentDigest === right.contentDigest;
}
export function samePromotedArtifactAuthority(left, right) {
    return left.domainId === right.domainId
        && left.packageId === right.packageId
        && left.domainIntelligenceContentDigest === right.domainIntelligenceContentDigest
        && left.governanceBaseline.domainId === right.governanceBaseline.domainId
        && left.governanceBaseline.governanceId === right.governanceBaseline.governanceId
        && left.governanceBaseline.schemaVersion === right.governanceBaseline.schemaVersion
        && left.governanceBaseline.contentDigest === right.governanceBaseline.contentDigest;
}
export async function createPromotedArtifactBody(input, sha256) {
    requireNonEmpty(input.artifactId, 'artifactId');
    const semanticMaterial = canonicalizeJson(input.semanticMaterial);
    const compiled = await compileCompiledArtifactIdentity({
        kind: PROMOTED_ARTIFACT_KIND,
        artifactId: input.artifactId,
        semanticMaterial,
    }, sha256);
    const identity = {
        kind: PROMOTED_ARTIFACT_KIND,
        artifactId: compiled.artifactId,
        contentDigest: compiled.contentDigest,
    };
    return { identity, semanticMaterial };
}
export async function verifyPromotedArtifactBody(body, sha256) {
    if (body.identity.kind !== PROMOTED_ARTIFACT_KIND) {
        throw new PromotedArtifactContractError('INVALID_PROMOTED_ARTIFACT', `unexpected artifact kind ${String(body.identity.kind)}`);
    }
    const recomputed = await createPromotedArtifactBody({
        artifactId: body.identity.artifactId,
        semanticMaterial: body.semanticMaterial,
    }, sha256);
    if (!samePromotedArtifactIdentity(body.identity, recomputed.identity)) {
        throw new PromotedArtifactContractError('PROMOTED_ARTIFACT_DIGEST_MISMATCH', `promoted artifact body does not match exact identity ${body.identity.artifactId}@${body.identity.contentDigest}`);
    }
}
//# sourceMappingURL=identity.js.map