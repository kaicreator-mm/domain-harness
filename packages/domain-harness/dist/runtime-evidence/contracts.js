import { isContentDigest } from '../contracts/identity.js';
export class RuntimeEvidenceIntegrationError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'RuntimeEvidenceIntegrationError';
        this.code = code;
    }
}
function fail(code, message) {
    throw new RuntimeEvidenceIntegrationError(code, message);
}
/** Forbidden floating fallback authority tokens (A1 §15.2/§16). */
const FLOATING_FALLBACK_TOKENS = [
    'latest',
    'active',
    'current stable',
    'nearest compatible',
];
function normalized(value) {
    return value.trim().toLowerCase();
}
function assertExactSlot(value, field, digest) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        fail('INVALID_RUNTIME_EVIDENCE_INTEGRATION', `${field} must be a non-empty string`);
    }
    if (digest && !isContentDigest(value)) {
        fail('INVALID_RUNTIME_EVIDENCE_INTEGRATION', `${field} must be a non-empty content digest`);
    }
    if (FLOATING_FALLBACK_TOKENS.includes(normalized(value))) {
        fail('RUNTIME_EVIDENCE_FLOATING_FALLBACK', `${field} uses forbidden floating fallback authority: ${normalized(value)}`);
    }
}
function assertExactArtifactRef(value, field) {
    assertExactSlot(value.kind, `${field}.kind`, false);
    assertExactSlot(value.artifactId, `${field}.artifactId`, false);
    assertExactSlot(value.contentDigest, `${field}.contentDigest`, true);
}
/**
 * Fail-closed validation of the exact stable fallback identity. Any floating
 * alias in any identity slot rejects the representation before it can be used.
 */
export function assertExactStableFallbackIdentity(fallback) {
    assertExactSlot(fallback.packageId, 'stableFallback.packageId', false);
    assertExactSlot(fallback.governanceBaselineContentDigest, 'stableFallback.governanceBaselineContentDigest', true);
    assertExactArtifactRef(fallback.artifact, 'stableFallback.artifact');
}
/** Fail-closed validation of a represented Experimental artifact. */
export function assertExactExperimentalArtifact(reference) {
    assertExactArtifactRef(reference.subjectArtifact, 'subjectArtifact');
    assertExactStableFallbackIdentity(reference.stableFallback);
}
//# sourceMappingURL=contracts.js.map