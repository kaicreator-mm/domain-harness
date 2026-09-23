// Issue #325 / DAC v0.0.3 V3-002 core: the single subject/target-bound
// compatibility-validation authority. Validation sequence (APPLICATION_MANIFEST
// §11/§12, CROSS_LAYER_REFERENCES §8):
//
//   request integrity (incl. lifecycle-binding refutation)
//   -> upstream #306 exact-selection evidence (genuine mint required)
//   -> UX closure shape (exactly-1 definition + exactly-1 interaction
//      contract, no identity collapse)
//   -> explicit target: absent => FAIL_CLOSED; unsupported => INCOMPATIBLE
//   -> Capability/Port/Host-Binding requirement-vs-satisfaction closure
//      (missing required evidence => INCOMPATIBLE, never COMPATIBLE)
//   -> UX semantic-role coverage (missing required role => INCOMPATIBLE)
//   -> deterministic validation identity + separately-encoded result view
//
// Disposition precedence follows the §10/§15 disposition matrix: structural
// absence/contradiction (missing target, revision/digest contradiction) is
// `FAIL_CLOSED`; a well-formed explicit subject that fails an explicit
// compatibility constraint (unsupported target, unsatisfied required
// requirement, uncovered required UX role) is `INCOMPATIBLE`. Only full
// closure satisfaction is `COMPATIBLE`. No path selects, substitutes, binds
// or activates anything, and no path manufactures an ApplicationSelection:
// the only selection evidence is the upstream #306 verdict pass-through.
import { adoptDacV003RegistryReference, assertDacV003ExactnessProfile, assertDacV003RevisionDigestConsistency, dacV003ReferenceDisposition, isRuntimeHostBindingRequirementRef, } from '../dac-v003/guards.js';
import { isSelectedCompositionValidation } from '../composition-intake/validate.js';
import { DAC_V003_BASELINE } from '../dac-v003/contracts.js';
import { DAC_V003_COMPATIBILITY_AUTHORITY_SCOPE, DAC_V003_COMPATIBILITY_AUTHORITY_VERSION, DAC_V003_UX_SEMANTIC_ROLES, DacV003CompatibilityError, } from './contracts.js';
import { assertSameDacV003CompatibilityAuthority, dacV003TargetProfileKey, expectDacV003UxRoleAnchor, isDacV003CapabilityRequirementValue, isDacV003CompatibilityTargetRefValue, isDacV003PortRequirementValue, isDacV003RequirementSatisfactionEvidenceValue, isDomainUXDefinitionRefValue, registerMintedCompatibilityResult, registerMintedCompatibilityValidation, refuteDacV003LifecycleBindingInput, } from './guards.js';
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function freeze(value) {
    return Object.freeze(value);
}
function isUxSemanticRole(value) {
    return (typeof value === 'string' &&
        DAC_V003_UX_SEMANTIC_ROLES.indexOf(value) !== -1);
}
function invalid(detail) {
    throw new DacV003CompatibilityError('INVALID_COMPATIBILITY_REQUEST', detail);
}
function requireArray(value, guard, field) {
    if (!Array.isArray(value))
        invalid(`${field} must be an array`);
    for (const entry of value) {
        if (!guard(entry)) {
            invalid(`${field} contains a foreign or forged entry; every element must be minted by this surface`);
        }
    }
    return value;
}
function validateRequest(request) {
    if (!isRecord(request))
        invalid('compatibility validation request must be an object');
    if (request.sha256 === null ||
        typeof request.sha256 !== 'object' ||
        typeof request.sha256.digestUtf8 !== 'function') {
        invalid('request must declare a portable sha256 digest capability');
    }
    if (!isSelectedCompositionValidation(request.selectionValidation)) {
        throw new DacV003CompatibilityError('NOT_A_SELECTED_COMPOSITION_VALIDATION', 'the upstream selection evidence was not minted by the #306 composition intake; a genuine stage-3 exact-selection validation is mandatory and cannot be claimed by a forged object');
    }
    // Lifecycle-binding refutation over every declared input position: the
    // stage-4/5 binding decision can never occupy a stage-3 position (C56).
    refuteDacV003LifecycleBindingInput(request.compatibilityTarget, request.domainUxDefinition, request.runtimeInteractionContract, ...(request.hostBindingRequirements ?? []), ...(request.capabilityRequirements ?? []), ...(request.portRequirements ?? []), ...(request.satisfactionEvidence ?? []));
    let target;
    let targetProfileKey;
    if (request.compatibilityTarget !== undefined) {
        if (!isDacV003CompatibilityTargetRefValue(request.compatibilityTarget)) {
            invalid('compatibilityTarget must be an adopted DAC v0.0.3 compatibility-target reference (P5)');
        }
        target = request.compatibilityTarget;
        targetProfileKey = dacV003TargetProfileKey(target);
    }
    if (!Array.isArray(request.supportedTargetProfiles)) {
        invalid('supportedTargetProfiles must be an array of exact target profile keys');
    }
    const supportedTargetProfiles = request.supportedTargetProfiles.map((key) => {
        if (typeof key !== 'string' || key.trim().length === 0) {
            invalid('supportedTargetProfiles entries must be non-empty exact target profile keys');
        }
        return key;
    });
    if (!isDomainUXDefinitionRefValue(request.domainUxDefinition)) {
        invalid('domainUxDefinition must be the adopted exactly-1 Domain UX semantic definition (P1)');
    }
    // The #323 foundation gives the interaction contract its nominal
    // role/exactness; here the UX identity collapse is additionally refuted:
    // the UX definition and the interaction contract must stay separately
    // referrable semantic contracts.
    if (request.domainUxDefinition.authorityScope ===
        request.runtimeInteractionContract.authorityScope &&
        request.domainUxDefinition.semanticIdentity ===
            request.runtimeInteractionContract.semanticIdentity &&
        request.domainUxDefinition.revisionIdentity ===
            request.runtimeInteractionContract.revisionIdentity) {
        throw new DacV003CompatibilityError('UX_ROLE_IDENTITY_COLLAPSE', 'DomainUXDefinitionRef and RuntimeInteractionContractRef carry the same identity tuple; the two semantic contracts must remain separately referrable');
    }
    if (!Array.isArray(request.interactionCoverage)) {
        invalid('interactionCoverage must be an array of UX semantic roles');
    }
    const coverage = request.interactionCoverage.map((role) => {
        if (!isUxSemanticRole(role))
            invalid(`"${String(role)}" is not a UX semantic role`);
        return role;
    });
    if (new Set(coverage).size !== coverage.length) {
        invalid('interactionCoverage must not repeat a UX semantic role');
    }
    if (!Array.isArray(request.uxSemanticRoleRequirements)) {
        invalid('uxSemanticRoleRequirements must be an array');
    }
    const uxRequirements = request.uxSemanticRoleRequirements.map((requirement) => {
        if (!isRecord(requirement))
            invalid('each UX semantic-role requirement must be an object');
        if (!isUxSemanticRole(requirement.role)) {
            invalid(`"${String(requirement.role)}" is not a UX semantic role`);
        }
        if (typeof requirement.required !== 'boolean') {
            invalid('each UX semantic-role requirement must declare required true/false');
        }
        expectDacV003UxRoleAnchor(requirement.role, requirement.anchor);
        return { role: requirement.role, required: requirement.required };
    });
    const capabilityRequirements = requireArray(request.capabilityRequirements, isDacV003CapabilityRequirementValue, 'capabilityRequirements');
    const portRequirements = requireArray(request.portRequirements, isDacV003PortRequirementValue, 'portRequirements');
    const hostBindingRequirements = requireArray(request.hostBindingRequirements, isRuntimeHostBindingRequirementRef, 'hostBindingRequirements');
    const evidence = requireArray(request.satisfactionEvidence, isDacV003RequirementSatisfactionEvidenceValue, 'satisfactionEvidence');
    const applicableConditions = new Set((request.applicableConditions ?? []).map((condition) => {
        if (typeof condition !== 'string' || condition.trim().length === 0) {
            invalid('applicableConditions entries must be non-empty condition descriptors');
        }
        return condition;
    }));
    // One closed requirement set: a duplicated requirement identity is an
    // ambiguous/conflicting declaration, not something to average or pick from.
    const seenRequirementIdentities = new Set();
    for (const requirementRef of [
        ...capabilityRequirements.map((r) => r.reference),
        ...portRequirements.map((r) => r.reference),
        ...hostBindingRequirements,
    ]) {
        const identity = requirementRef.primaryIdentity;
        if (seenRequirementIdentities.has(identity)) {
            invalid(`requirement identity "${identity}" is declared more than once; the requirement set must be unambiguous`);
        }
        seenRequirementIdentities.add(identity);
    }
    return {
        target,
        targetProfileKey,
        supportedTargetProfiles,
        applicableConditions,
        uxRequirements,
        capabilityRequirements,
        portRequirements,
        hostBindingRequirements,
        evidence,
    };
}
// ---------------------------------------------------------------------------
// Deterministic identity material (single authority, closure-bound).
// ---------------------------------------------------------------------------
/**
 * Canonical JSON of the full evaluated closure. The digest over this material
 * is the validation identity: identical subject/target/requirement/evidence
 * closures always produce the identical validation identity and disposition
 * (pure evaluation), so no second authority or contradictory disposition can
 * be synthesized for the same exact subject/target.
 */
function canonicalValidationIdentityMaterial(input) {
    const sorted = (values) => [...values].sort();
    return JSON.stringify({
        authority: DAC_V003_COMPATIBILITY_AUTHORITY_SCOPE,
        version: input.version,
        upstream: {
            validatedPackageId: input.upstream.validatedPackageId,
            targetProfileId: input.upstream.targetProfileId,
            implementationIdentity: input.upstream.implementation.identity,
            implementationVersion: input.upstream.implementation.version,
            implementationBuild: input.upstream.implementation.build,
        },
        targetProfile: input.targetProfile,
        requirements: sorted(input.requirements.map((r) => [r.kind, r.identity, r.effectiveStrength])),
        evidence: sorted(input.evidence.map((e) => [e.identity, e.satisfies, e.provider, e.validForTargetProfile])),
        ux: {
            definition: input.ux.definition,
            interactionContract: input.ux.interactionContract,
            coverage: sorted(input.ux.coverage),
            requiredRoles: sorted(input.ux.requiredRoles),
        },
    });
}
// ---------------------------------------------------------------------------
// The single validation authority.
// ---------------------------------------------------------------------------
/**
 * Validates the already-decided composition's DAC v0.0.3 compatibility
 * closure against one exact subject and one explicit target, and mints the
 * single-authority validation act plus its separately-encoded result view.
 * The disposition is exactly one of `COMPATIBLE` / `INCOMPATIBLE` /
 * `FAIL_CLOSED`; missing required evidence can never produce `COMPATIBLE`,
 * and no outcome selects, substitutes, binds or activates anything.
 */
export async function validateDacV003Compatibility(request) {
    const parsed = validateRequest(request);
    const { target, targetProfileKey } = parsed;
    const verdict = request.selectionValidation;
    const findings = [];
    let structuralFailure = false;
    let incompatible = false;
    // --- Explicit target: missing => FAIL_CLOSED; unsupported => INCOMPATIBLE.
    let targetSupported = false;
    if (targetProfileKey === undefined) {
        structuralFailure = true;
        findings.push('missing required compatibility target: no explicit DAC v0.0.3 CompatibilityTargetRef was declared, and an ambient "current runtime" is never assumed (CROSS_LAYER_REFERENCES §8; conformance C43)');
    }
    else if (!parsed.supportedTargetProfiles.includes(targetProfileKey)) {
        incompatible = true;
        findings.push(`explicit compatibility target "${targetProfileKey}" is declared but unsupported by this validator environment (conformance C44)`);
    }
    else {
        targetSupported = true;
    }
    // --- Revision/digest contradiction inside the evaluated closure (C40).
    const closureRefs = [
        ...(target === undefined ? [] : [target]),
        request.domainUxDefinition,
        request.runtimeInteractionContract,
        ...parsed.capabilityRequirements.map((r) => r.reference),
        ...parsed.portRequirements.map((r) => r.reference),
        ...parsed.hostBindingRequirements,
        ...parsed.evidence.map((e) => e.reference),
    ];
    try {
        assertDacV003RevisionDigestConsistency(closureRefs);
    }
    catch {
        structuralFailure = true;
        findings.push('same immutable revision identity with different authoritative digests inside the evaluated closure: identity/integrity contradiction with no identity-preserving reconciliation (C40)');
    }
    // --- Capability / Port / Host-Binding requirement-vs-satisfaction closure.
    const evidenceByRequirement = new Map();
    const declaredRequirementIdentities = new Set();
    for (const requirement of [
        ...parsed.capabilityRequirements.map((r) => r.reference),
        ...parsed.portRequirements.map((r) => r.reference),
        ...parsed.hostBindingRequirements,
    ]) {
        declaredRequirementIdentities.add(requirement.primaryIdentity);
    }
    for (const evidence of parsed.evidence) {
        const identity = evidence.requirement.primaryIdentity;
        const bucket = evidenceByRequirement.get(identity);
        if (bucket === undefined) {
            evidenceByRequirement.set(identity, [evidence]);
        }
        else {
            bucket.push(evidence);
        }
        if (!declaredRequirementIdentities.has(identity)) {
            findings.push(`satisfaction evidence "${evidence.reference.primaryIdentity}" links requirement "${identity}" outside the declared closed requirement set; it is recorded but proves nothing here (§8.3)`);
        }
    }
    const requirementClosure = [];
    const evaluateRequirement = (kind, reference, strength, condition) => {
        let effectiveStrength;
        if (strength === 'conditional') {
            effectiveStrength = condition !== undefined && parsed.applicableConditions.has(condition)
                ? 'required'
                : 'not-applicable';
        }
        else {
            effectiveStrength = strength;
        }
        const matching = (evidenceByRequirement.get(reference.primaryIdentity) ?? []).filter((evidence) => targetProfileKey !== undefined && evidence.validForTargetProfile === targetProfileKey);
        requirementClosure.push(freeze({
            kind,
            requirementIdentity: reference.primaryIdentity,
            effectiveStrength,
            satisfiedBy: freeze(matching.map((evidence) => evidence.reference.primaryIdentity)),
        }));
        if (effectiveStrength === 'required' && matching.length === 0) {
            incompatible = true;
            const reason = targetProfileKey === undefined
                ? 'no explicit target was declared, so no target-bound satisfaction evidence can exist'
                : 'no exact target-bound satisfaction evidence covers it';
            findings.push(`required ${kind} requirement "${reference.primaryIdentity}" is unsatisfied: ${reason} (conformance C57)`);
        }
    };
    for (const requirement of parsed.capabilityRequirements) {
        evaluateRequirement('capability', requirement.reference, requirement.strength, requirement.condition);
    }
    for (const requirement of parsed.portRequirements) {
        evaluateRequirement('port', requirement.reference, requirement.strength, requirement.condition);
    }
    // A declared Host Binding requirement is a requirement: the declaration
    // exists precisely because the composition needs that host-binding role.
    for (const requirement of parsed.hostBindingRequirements) {
        evaluateRequirement('host-binding', requirement, 'required', undefined);
    }
    // --- UX semantic-role coverage (C58).
    const covered = request.interactionCoverage;
    const requiredRoles = parsed.uxRequirements.filter((r) => r.required).map((r) => r.role);
    const missingRequiredRoles = requiredRoles.filter((role) => !covered.includes(role));
    if (missingRequiredRoles.length > 0) {
        incompatible = true;
        findings.push(`the selected UX definition requires semantic roles not covered by the runtime interaction contract: ${missingRequiredRoles.join(', ')} (conformance C58)`);
    }
    // --- Disposition (exactly 1; §10/§15 precedence).
    const dispositionValue = structuralFailure
        ? 'FAIL_CLOSED'
        : incompatible
            ? 'INCOMPATIBLE'
            : 'COMPATIBLE';
    if (dispositionValue === 'COMPATIBLE' && !targetSupported) {
        throw new DacV003CompatibilityError('INVALID_COMPATIBILITY_REQUEST', 'internal closure guard: COMPATIBLE requires a supported explicit target (unreachable by construction)');
    }
    const disposition = dacV003ReferenceDisposition(dispositionValue);
    // --- Deterministic validation identity over the full evaluated closure.
    const identityMaterial = canonicalValidationIdentityMaterial({
        version: DAC_V003_COMPATIBILITY_AUTHORITY_VERSION,
        upstream: {
            validatedPackageId: verdict.validatedPackageId,
            targetProfileId: verdict.compatibility.targetProfileId,
            implementation: verdict.compatibility.runtimeImplementation,
        },
        targetProfile: targetProfileKey ?? null,
        requirements: requirementClosure.map((entry) => ({
            kind: entry.kind,
            identity: entry.requirementIdentity,
            effectiveStrength: entry.effectiveStrength,
        })),
        evidence: parsed.evidence.map((evidence) => ({
            identity: evidence.reference.primaryIdentity,
            satisfies: evidence.requirement.primaryIdentity,
            provider: evidence.provider.primaryIdentity,
            validForTargetProfile: evidence.validForTargetProfile,
        })),
        ux: {
            definition: [
                request.domainUxDefinition.authorityScope,
                request.domainUxDefinition.semanticIdentity,
                request.domainUxDefinition.revisionIdentity,
            ],
            interactionContract: [
                request.runtimeInteractionContract.authorityScope,
                request.runtimeInteractionContract.semanticIdentity,
                request.runtimeInteractionContract.revisionIdentity,
            ],
            coverage: covered,
            requiredRoles,
        },
    });
    const validationIdentity = `sha256:${await request.sha256.digestUtf8(identityMaterial)}`;
    // --- Upstream evidence adoption (identity only; the verdict itself is
    // carried as the pass-through object, never re-minted or re-interpreted).
    const upstreamEvidence = adoptDacV003RegistryReference('evidence', {
        baseline: { ...DAC_V003_BASELINE },
        authorityScope: 'domain-harness://runtime/compatibility',
        primaryIdentity: `composition-intake/${verdict.validatedPackageId}`,
        semanticIdentity: `domain-harness/composition-intake/${verdict.intake}`,
        revisionIdentity: verdict.validatedPackageId,
        opaque: {
            intakeAdapter: verdict.intake,
            targetProfileId: verdict.compatibility.targetProfileId,
        },
    });
    const validationRef = adoptDacV003RegistryReference('compatibility-validation', {
        baseline: { ...DAC_V003_BASELINE },
        authorityScope: DAC_V003_COMPATIBILITY_AUTHORITY_SCOPE,
        primaryIdentity: validationIdentity,
        semanticIdentity: 'dac-v003/compatibility-validation',
        materialInputRefs: closureRefs,
        provenanceRefs: [upstreamEvidence],
    });
    assertDacV003ExactnessProfile(validationRef, 'P6');
    const resultIdentity = `sha256:${await request.sha256.digestUtf8(JSON.stringify([validationIdentity, dispositionValue, 'dac-v003-compatibility-result/1']))}`;
    const resultRef = adoptDacV003RegistryReference('compatibility-result', {
        baseline: { ...DAC_V003_BASELINE },
        authorityScope: DAC_V003_COMPATIBILITY_AUTHORITY_SCOPE,
        primaryIdentity: resultIdentity,
        semanticIdentity: 'dac-v003/compatibility-result',
        materialInputRefs: [validationRef],
        provenanceRefs: [upstreamEvidence],
    });
    assertDacV003ExactnessProfile(resultRef, 'P6');
    const validation = freeze({
        compatibility: DAC_V003_COMPATIBILITY_AUTHORITY_VERSION,
        validationRef,
        resultRef,
        disposition,
        subject: freeze({
            authorityScope: DAC_V003_COMPATIBILITY_AUTHORITY_SCOPE,
            validationIdentity,
            targetProfile: targetProfileKey,
            upstreamSelectionValidation: verdict,
        }),
        requirementClosure: freeze(requirementClosure),
        ux: freeze({
            domainUxDefinition: freeze({
                authorityScope: request.domainUxDefinition.authorityScope,
                semanticIdentity: request.domainUxDefinition.semanticIdentity,
                revisionIdentity: request.domainUxDefinition.revisionIdentity,
            }),
            runtimeInteractionContract: freeze({
                authorityScope: request.runtimeInteractionContract.authorityScope,
                semanticIdentity: request.runtimeInteractionContract.semanticIdentity,
                revisionIdentity: request.runtimeInteractionContract.revisionIdentity,
            }),
            coveredRoles: freeze([...covered]),
            requiredRoles: freeze([...requiredRoles]),
            missingRequiredRoles: freeze([...missingRequiredRoles]),
        }),
        findings: freeze([...findings]),
    });
    registerMintedCompatibilityValidation(validation);
    return validation;
}
/**
 * Derive the separately-encoded result view of exactly one minted validation
 * (CROSS_LAYER_REFERENCES §6.3 / APPLICATION_MANIFEST §12.2): the result view
 * links back to the exact validation act and carries the same authority
 * tuple, so encoding separation never becomes authority separation.
 */
export function deriveDacV003CompatibilityResult(validation) {
    if (!isRecord(validation) ||
        validation.compatibility !== DAC_V003_COMPATIBILITY_AUTHORITY_VERSION) {
        throw new DacV003CompatibilityError('INVALID_COMPATIBILITY_RESULT', 'result derivation requires a validation record actually minted by the DAC v0.0.3 compatibility authority');
    }
    // Enforce the single-authority invariant at derivation time as well.
    assertSameDacV003CompatibilityAuthority(validation, validation.resultRef);
    const result = freeze({
        result: 'dac-v003-compatibility-result/1',
        resultRef: validation.resultRef,
        validationRef: validation.validationRef,
        disposition: validation.disposition,
        authorityScope: validation.subject.authorityScope,
        validationIdentity: validation.subject.validationIdentity,
    });
    registerMintedCompatibilityResult(result);
    return result;
}
//# sourceMappingURL=validate.js.map