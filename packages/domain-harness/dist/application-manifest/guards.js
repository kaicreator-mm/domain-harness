// Issue #310 / A2 I-007: adoption and validation of a PROVISIONAL
// Application Manifest presented by the external composition layer. See
// contracts.ts for the frozen authority boundaries. No function in this
// module promotes, selects, validates compatibility, binds or activates —
// those authorities stay with the upstream composition layer (#305 refs),
// the #306 intake, the #307 binding/activation module and the #309
// external-authority adapter. That absence is the enforcement mechanism for
// "Manifest is composition metadata, not a fourth semantic pillar".
import { DAC_REFERENCE_BASELINE } from '../dac/contracts.js';
import { expectApplicationSelectionRef, expectCompatibilityTargetRef, expectPromotionDecisionRef, expectRuntimeContractRef, expectRuntimeImplementationRef, expectSelectedDomainDataRef, isDacReference, refuteExternalBusinessSoRIdentity, } from '../dac/guards.js';
import { isDacBridgeReference } from '../dac-bridge/guards.js';
import { isExternalAuthorityRef, refuteNonExternalAuthorityIdentity, } from '../external-authority/guards.js';
import { isSelectedCompositionValidation } from '../composition-intake/validate.js';
import { RUNTIME_ACTIVATION_ADAPTER_VERSION } from '../runtime-binding/contracts.js';
import { isRuntimeBindingEvidence } from '../runtime-binding/evidence.js';
import { APPLICATION_MANIFEST_ADAPTER_VERSION, APPLICATION_MANIFEST_CONTRACT_VERSION, ApplicationManifestError, MANIFEST_ACTIVATION_CORRELATION_VERSION, MANIFEST_BINDING_CORRELATION_VERSION, MANIFEST_COMPOSITION_ADAPTER_VERSION, MANIFEST_INSTANCE_STATE_FIELD_VOCABULARY, MANIFEST_UX_CONTRACT_ROLES, } from './contracts.js';
import { isApplicationManifestIdentity, isMutableAliasToken, isMintedActivationCorrelation, isMintedBindingCorrelation, isMintedCompositionEvidence, isMintedManifest, isRecord, mintManifest, } from './registry.js';
const INSTANCE_STATE_FIELDS = new Set(MANIFEST_INSTANCE_STATE_FIELD_VOCABULARY);
const UX_CONTRACT_ROLES = new Set(MANIFEST_UX_CONTRACT_ROLES);
const CAPABILITY_ID_PATTERN = /^.+@\d+$/u;
function requireNonEmptyString(value, field) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new ApplicationManifestError('INVALID_MANIFEST', `manifest field "${field}" must be a non-empty string`);
    }
    return value;
}
function requireExactImmutableIdentity(value, field) {
    const identity = requireNonEmptyString(value, field);
    if (isMutableAliasToken(identity)) {
        throw new ApplicationManifestError('MUTABLE_ALIAS_REJECTED', `manifest field "${field}" carries the mutable alias "${identity}"; an exact immutable identity is required and a locator/alias never substitutes it`);
    }
    return identity;
}
function requireOpaqueRecord(value, field) {
    if (value === undefined || value === null)
        return {};
    if (!isRecord(value)) {
        throw new ApplicationManifestError('INVALID_MANIFEST', `manifest field "${field}" must be an object of unknown/provisional source fields`);
    }
    return value;
}
/**
 * Rejects recognized execution/lifecycle EVIDENCE objects (C38/N18): #306
 * verdicts, #307 binding/activation evidence and binding/activation
 * references can never be presented as manifest definition content. These
 * remain separately-minted evidence referencing the exact manifest
 * identity/digest; absorbing them into the definition is fail-closed.
 */
function rejectEvidenceAbsorption(value, where) {
    if (isRuntimeBindingEvidence(value)) {
        throw new ApplicationManifestError('MANIFEST_EVIDENCE_ABSORPTION', `${where}: #307 runtime binding evidence was presented as manifest definition content; binding evidence stays separate from the Manifest definition and only references its identity/digest`);
    }
    if (isRecord(value) &&
        value.activation === RUNTIME_ACTIVATION_ADAPTER_VERSION) {
        throw new ApplicationManifestError('MANIFEST_EVIDENCE_ABSORPTION', `${where}: #307 runtime activation evidence was presented as manifest definition content; activation evidence stays separate from the Manifest definition`);
    }
    if (isSelectedCompositionValidation(value)) {
        throw new ApplicationManifestError('MANIFEST_EVIDENCE_ABSORPTION', `${where}: a #306 composition-intake verdict was presented as manifest definition content; compatibility validation is a separate stage that consumes the manifest, never part of its definition`);
    }
    if (isDacReference(value) &&
        (value.role === 'runtime-binding' || value.role === 'runtime-activation')) {
        throw new ApplicationManifestError('MANIFEST_EVIDENCE_ABSORPTION', `${where}: a "${value.role}" DAC reference was presented as manifest definition content; binding/activation identity is minted at stages 4/5 after compatibility validation and never inside the Manifest definition`);
    }
}
/**
 * Rejects adapter-recognized live instance-state field names (N17 / DAC
 * §12) at the top level of each opaque-preserved area. Exact-match only, no
 * heuristics: the closed vocabulary is this adapter's recognized subset of
 * DAC §12 instance facts, and unrecognized fields can only ever remain
 * inert opaque content that no API reads back as state.
 */
function rejectInstanceStateLeakage(area, where) {
    for (const key of Object.keys(area)) {
        if (INSTANCE_STATE_FIELDS.has(key)) {
            throw new ApplicationManifestError('INSTANCE_STATE_LEAKAGE', `${where}: field "${key}" is live instance state; the Manifest definition must not absorb live Business/Process/Execution/UX instance facts`);
        }
    }
}
/** Screens one opaque-preserved area for evidence absorption and instance-state leakage. */
function screenOpaqueArea(area, where) {
    rejectInstanceStateLeakage(area, where);
    for (const value of Object.values(area)) {
        rejectEvidenceAbsorption(value, `${where} (field value)`);
    }
}
function validateSelectedEntry(entry, index) {
    const where = `selectedDomainData[${index}]`;
    if (!isRecord(entry)) {
        throw new ApplicationManifestError('INVALID_MANIFEST', `${where} must be an object carrying the exact selected identity plus promotion-decision and application-selection provenance`);
    }
    // Manifest-specific evidence-absorption screen first, then role integrity
    // through the #305 adapter core (forged/wrong-role refs fail closed as
    // DacReferenceError — promotion decision and application selection are
    // distinct authority steps and neither can be synthesized here).
    rejectEvidenceAbsorption(entry.selected, `${where}.selected`);
    rejectEvidenceAbsorption(entry.promotionDecision, `${where}.promotionDecision`);
    rejectEvidenceAbsorption(entry.applicationSelection, `${where}.applicationSelection`);
    expectSelectedDomainDataRef(entry.selected);
    expectPromotionDecisionRef(entry.promotionDecision);
    expectApplicationSelectionRef(entry.applicationSelection);
    return Object.freeze({
        selected: entry.selected,
        promotionDecision: entry.promotionDecision,
        applicationSelection: entry.applicationSelection,
    });
}
function validateUxRequirement(requirement, index) {
    const where = `uxContractRequirements[${index}]`;
    if (!isRecord(requirement)) {
        throw new ApplicationManifestError('INVALID_MANIFEST', `${where} must be an object (UX interaction-contract requirement)`);
    }
    const contractRole = requireNonEmptyString(requirement.contractRole, `${where}.contractRole`);
    if (!UX_CONTRACT_ROLES.has(contractRole)) {
        throw new ApplicationManifestError('INVALID_MANIFEST', `${where}.contractRole "${contractRole}" is not one of the declared UX interaction-contract requirement roles`);
    }
    requireNonEmptyString(requirement.semanticIdentity, `${where}.semanticIdentity`);
    if (requirement.revisionIdentity !== undefined) {
        requireExactImmutableIdentity(requirement.revisionIdentity, `${where}.revisionIdentity`);
    }
    rejectEvidenceAbsorption(requirement.bridgeReference, `${where}.bridgeReference`);
    if (requirement.bridgeReference !== undefined &&
        !isDacBridgeReference(requirement.bridgeReference)) {
        throw new ApplicationManifestError('INVALID_MANIFEST', `${where}.bridgeReference is not a reference minted by the #308 UX<->Runtime correlation bridge; a renderer/component-tree object is never a UX contract anchor`);
    }
    const opaque = requireOpaqueRecord(requirement.opaque, `${where}.opaque`);
    screenOpaqueArea(opaque, `${where}.opaque`);
    const adopted = {
        contractRole: contractRole,
        semanticIdentity: requirement.semanticIdentity,
        ...(requirement.revisionIdentity === undefined
            ? {}
            : { revisionIdentity: requirement.revisionIdentity }),
        ...(requirement.bridgeReference === undefined
            ? {}
            : {
                bridgeReference: requirement.bridgeReference,
            }),
        opaque: Object.freeze({ ...opaque }),
    };
    return Object.freeze(adopted);
}
function validateExternalAuthorityDeclaration(declaration, index) {
    const where = `externalAuthorityDeclarations[${index}]`;
    if (!isRecord(declaration)) {
        throw new ApplicationManifestError('INVALID_MANIFEST', `${where} must be an object (external-authority declaration)`);
    }
    const authority = declaration.authority;
    if (!isExternalAuthorityRef(authority)) {
        // Fail closed through the owning refutes first so the mis-substituted
        // identity class is explicit (N16: Runtime identity never substitutes
        // external Business SoR identity), then the generic rejection for
        // non-references such as a bare provider URL.
        refuteExternalBusinessSoRIdentity(authority);
        refuteNonExternalAuthorityIdentity(authority);
        throw new ApplicationManifestError('EXTERNAL_IDENTITY_SUBSTITUTION', `${where}.authority is not an ExternalAuthorityRef adopted by the #309 external-authority adapter; a provider URL/locator alone is not an authority contract and no Runtime identity can substitute external Business SoR identity`);
    }
    const capabilityRequirements = requireOpaqueRecord(declaration.capabilityRequirements, `${where}.capabilityRequirements`);
    const opaque = requireOpaqueRecord(declaration.opaque, `${where}.opaque`);
    screenOpaqueArea(capabilityRequirements, `${where}.capabilityRequirements`);
    screenOpaqueArea(opaque, `${where}.opaque`);
    return Object.freeze({
        authority,
        capabilityRequirements: Object.freeze({ ...capabilityRequirements }),
        opaque: Object.freeze({ ...opaque }),
    });
}
/**
 * Canonical manifest material: the exact adopted content in THIS adapter's
 * deterministic projection (fixed key order). The digest over this material
 * is the manifest content identity, so any change to identities, entries,
 * declarations, requirements, capabilities, provenance or opaque content
 * produces a different digest — and the same immutable manifest identity
 * resolving to a different authoritative digest fails closed (DAC §3).
 *
 * This canonicalization is revision-bound to {@link
 * APPLICATION_MANIFEST_ADAPTER_VERSION}; it is NOT a DAC wire freeze (L2 A2
 * §7.3). Nested opaque objects are serialized as presented, so the digest
 * binds the exact presented content including unknown-field ordering.
 */
function canonicalManifestMaterial(manifest) {
    return JSON.stringify({
        authority: 'domain-harness/application-manifest',
        adapter: APPLICATION_MANIFEST_ADAPTER_VERSION,
        contractVersion: APPLICATION_MANIFEST_CONTRACT_VERSION,
        applicationSemanticIdentity: manifest.applicationSemanticIdentity,
        applicationRevisionIdentity: manifest.applicationRevisionIdentity,
        manifestIdentity: manifest.manifestIdentity,
        selectedDomainData: manifest.selectedDomainData,
        declared: manifest.declared,
        uxContractRequirements: manifest.uxContractRequirements,
        externalAuthorityDeclarations: manifest.externalAuthorityDeclarations,
        requiredCapabilities: manifest.requiredCapabilities,
        compositionProvenance: manifest.compositionProvenance,
        opaque: manifest.opaque,
    });
}
/**
 * Validates and canonicalizes an adoption input into the frozen manifest
 * record shape (without the digest comparison). Shared by
 * `computeApplicationManifestDigest` and `adoptApplicationManifest`.
 */
async function materializeManifest(input) {
    if (!isRecord(input)) {
        throw new ApplicationManifestError('INVALID_MANIFEST', 'manifest adoption input must be an object');
    }
    const { baseline } = input;
    if (!isRecord(baseline) ||
        baseline.contract !== DAC_REFERENCE_BASELINE.contract ||
        baseline.version !== DAC_REFERENCE_BASELINE.version ||
        baseline.baselineCommit !== DAC_REFERENCE_BASELINE.baselineCommit) {
        throw new ApplicationManifestError('UNSUPPORTED_MANIFEST_BASELINE', `manifest baseline must be exactly ${DAC_REFERENCE_BASELINE.contract}@${DAC_REFERENCE_BASELINE.version} commit ${DAC_REFERENCE_BASELINE.baselineCommit} (the single frozen DAC baseline; no parallel manifest identity authority is forked)`);
    }
    if (input.contractVersion !== APPLICATION_MANIFEST_CONTRACT_VERSION) {
        throw new ApplicationManifestError('UNSUPPORTED_MANIFEST_CONTRACT_VERSION', `manifest contractVersion must be exactly "${APPLICATION_MANIFEST_CONTRACT_VERSION}"; got "${String(input.contractVersion)}"`);
    }
    const applicationSemanticIdentity = requireNonEmptyString(input.applicationSemanticIdentity, 'applicationSemanticIdentity');
    const applicationRevisionIdentity = requireExactImmutableIdentity(input.applicationRevisionIdentity, 'applicationRevisionIdentity');
    const manifestIdentity = requireExactImmutableIdentity(input.manifestIdentity, 'manifestIdentity');
    if (!Array.isArray(input.selectedDomainData) || input.selectedDomainData.length === 0) {
        throw new ApplicationManifestError('INVALID_MANIFEST', 'manifest must carry at least one authoritative selected Domain Data entry; a manifest that selects nothing cannot be composed and is never defaulted');
    }
    const selectedDomainData = input.selectedDomainData.map((entry, index) => validateSelectedEntry(entry, index));
    for (const field of ['runtimeContract', 'runtimeImplementation', 'compatibilityTarget']) {
        rejectEvidenceAbsorption(input[field], `declared.${field}`);
    }
    expectRuntimeContractRef(input.runtimeContract);
    expectRuntimeImplementationRef(input.runtimeImplementation);
    expectCompatibilityTargetRef(input.compatibilityTarget);
    const declared = Object.freeze({
        runtimeContract: input.runtimeContract,
        runtimeImplementation: input.runtimeImplementation,
        compatibilityTarget: input.compatibilityTarget,
    });
    const uxContractRequirements = Array.isArray(input.uxContractRequirements)
        ? input.uxContractRequirements.map((r, i) => validateUxRequirement(r, i))
        : [];
    const externalAuthorityDeclarations = Array.isArray(input.externalAuthorityDeclarations)
        ? input.externalAuthorityDeclarations.map((d, i) => validateExternalAuthorityDeclaration(d, i))
        : [];
    if (input.requiredCapabilities !== undefined) {
        if (!Array.isArray(input.requiredCapabilities)) {
            throw new ApplicationManifestError('INVALID_MANIFEST', 'manifest field "requiredCapabilities" must be an array of name@major capability ids');
        }
        for (const capability of input.requiredCapabilities) {
            if (typeof capability !== 'string' || !CAPABILITY_ID_PATTERN.test(capability)) {
                throw new ApplicationManifestError('INVALID_MANIFEST', `manifest required capability "${String(capability)}" is not a valid name@major capability id`);
            }
        }
    }
    const requiredCapabilities = input.requiredCapabilities ?? [];
    const compositionProvenance = requireOpaqueRecord(input.compositionProvenance, 'compositionProvenance');
    screenOpaqueArea(compositionProvenance, 'compositionProvenance');
    const opaque = requireOpaqueRecord(input.opaque, 'opaque');
    screenOpaqueArea(opaque, 'opaque');
    const record = Object.freeze({
        adapter: APPLICATION_MANIFEST_ADAPTER_VERSION,
        baseline: DAC_REFERENCE_BASELINE,
        contractVersion: APPLICATION_MANIFEST_CONTRACT_VERSION,
        applicationSemanticIdentity,
        applicationRevisionIdentity,
        manifestIdentity,
        selectedDomainData: Object.freeze([...selectedDomainData]),
        declared,
        uxContractRequirements: Object.freeze([...uxContractRequirements]),
        externalAuthorityDeclarations: Object.freeze([...externalAuthorityDeclarations]),
        requiredCapabilities: Object.freeze([...requiredCapabilities]),
        compositionProvenance: Object.freeze({ ...compositionProvenance }),
        opaque: Object.freeze({ ...opaque }),
    });
    return { material: canonicalManifestMaterial(record), record };
}
function requireDigestOptions(options) {
    if (!isRecord(options) ||
        !isRecord(options.sha256) ||
        typeof options.sha256.digestUtf8 !== 'function') {
        throw new ApplicationManifestError('INVALID_MANIFEST', 'options must declare a sha256 port (digestUtf8) for exact manifest content identity derivation');
    }
    return options;
}
/**
 * Computes the canonical manifest content digest for an adoption input
 * (validating its shape fail-closed first). Hosts use this to derive the
 * `manifestContentDigest` they declare when presenting a manifest.
 */
export async function computeApplicationManifestDigest(input, options) {
    requireDigestOptions(options);
    const { material } = await materializeManifest(input);
    return options.sha256.digestUtf8(material);
}
/**
 * Manifest identity → verified digest registry. The same immutable
 * `manifestIdentity` later resolving to a different authoritative digest is
 * the DAC §3 integrity violation and fails closed. This is a
 * conflict-detection registry only — it stores no live instance/process
 * state and confers no authority.
 */
const VERIFIED_DIGEST_BY_MANIFEST_IDENTITY = new Map();
/**
 * Adopts an externally-presented PROVISIONAL Application Manifest as narrow
 * composition metadata: validates every declared identity/reference/
 * declaration fail-closed, verifies the declared content digest against the
 * canonical digest of the presented content, rejects the same manifest
 * identity resolving to a different digest, and returns the deeply frozen
 * adopted record. Adoption never promotes, selects, validates
 * compatibility, binds or activates.
 */
export async function adoptApplicationManifest(input, options) {
    requireDigestOptions(options);
    const declaredDigest = isRecord(input) && typeof input.manifestContentDigest === 'string'
        ? input.manifestContentDigest
        : undefined;
    if (declaredDigest === undefined || declaredDigest.length === 0) {
        throw new ApplicationManifestError('INVALID_MANIFEST', 'manifest field "manifestContentDigest" must be a non-empty string; compute it with computeApplicationManifestDigest and present content and digest together');
    }
    const { material, record } = await materializeManifest(input);
    const canonicalDigest = await options.sha256.digestUtf8(material);
    if (canonicalDigest !== declaredDigest) {
        throw new ApplicationManifestError('MANIFEST_DIGEST_MISMATCH', 'the declared manifest content digest does not match the canonical digest of the presented content; manifest content and declared digest must be adopted together exactly', [`declared=${declaredDigest}`, `canonical=${canonicalDigest}`]);
    }
    const knownDigest = VERIFIED_DIGEST_BY_MANIFEST_IDENTITY.get(record.manifestIdentity);
    if (knownDigest !== undefined && knownDigest !== canonicalDigest) {
        throw new ApplicationManifestError('MANIFEST_IDENTITY_DIGEST_CONFLICT', `the immutable manifest identity "${record.manifestIdentity}" was already adopted under authoritative digest "${knownDigest}" and now resolves to "${canonicalDigest}"; the same ManifestIdentity resolving to different authoritative content digests fails closed`, [`identity=${record.manifestIdentity}`, `first=${knownDigest}`, `second=${canonicalDigest}`]);
    }
    VERIFIED_DIGEST_BY_MANIFEST_IDENTITY.set(record.manifestIdentity, canonicalDigest);
    return mintManifest(Object.freeze({ ...record, manifestContentDigest: canonicalDigest }));
}
/** True only for manifests actually adopted by `adoptApplicationManifest`. */
export function isApplicationManifest(value) {
    if (!isMintedManifest(value))
        return false;
    const candidate = value;
    return (candidate.adapter === APPLICATION_MANIFEST_ADAPTER_VERSION &&
        candidate.contractVersion === APPLICATION_MANIFEST_CONTRACT_VERSION &&
        typeof candidate.manifestIdentity === 'string' &&
        candidate.manifestIdentity.length > 0 &&
        typeof candidate.manifestContentDigest === 'string' &&
        candidate.manifestContentDigest.length > 0 &&
        Array.isArray(candidate.selectedDomainData) &&
        candidate.selectedDomainData.length > 0);
}
/** Projects the carried identity set of an adopted manifest (frozen copy). */
export function manifestIdentityOf(manifest) {
    if (!isApplicationManifest(manifest)) {
        throw new ApplicationManifestError('NOT_AN_ADOPTED_APPLICATION_MANIFEST', 'identity projection requires a manifest actually adopted by the application-manifest adapter');
    }
    return Object.freeze({
        applicationSemanticIdentity: manifest.applicationSemanticIdentity,
        applicationRevisionIdentity: manifest.applicationRevisionIdentity,
        manifestIdentity: manifest.manifestIdentity,
        manifestContentDigest: manifest.manifestContentDigest,
    });
}
/** True only for composition evidence actually minted by this adapter. */
export function isManifestCompositionEvidence(value) {
    if (!isMintedCompositionEvidence(value))
        return false;
    const candidate = value;
    return (candidate.manifestComposition === MANIFEST_COMPOSITION_ADAPTER_VERSION &&
        isApplicationManifestIdentity(candidate.manifestIdentity) &&
        isSelectedCompositionValidation(candidate.validation));
}
/** True only for binding correlations actually minted by this adapter. */
export function isManifestRuntimeBindingCorrelation(value) {
    if (!isMintedBindingCorrelation(value))
        return false;
    const candidate = value;
    return (candidate.manifestBinding === MANIFEST_BINDING_CORRELATION_VERSION &&
        isApplicationManifestIdentity(candidate.manifestIdentity) &&
        isRuntimeBindingEvidence(candidate.binding));
}
/** True only for activation correlations actually minted by this adapter. */
export function isManifestRuntimeActivationCorrelation(value) {
    if (!isMintedActivationCorrelation(value))
        return false;
    const candidate = value;
    return (candidate.manifestActivation === MANIFEST_ACTIVATION_CORRELATION_VERSION &&
        isApplicationManifestIdentity(candidate.manifestIdentity));
}
//# sourceMappingURL=guards.js.map