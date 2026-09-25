import { ApplicationManifestError, MANIFEST_ACTIVATION_CORRELATION_VERSION, MANIFEST_BINDING_CORRELATION_VERSION, MANIFEST_COMPOSITION_ADAPTER_VERSION, } from './contracts.js';
import { isApplicationManifest, isManifestCompositionEvidence, isManifestRuntimeBindingCorrelation, } from './guards.js';
import { isRecord, mintActivationCorrelation, mintBindingCorrelation, mintCompositionEvidence, } from './registry.js';
import { validateSelectedComposition } from '../composition-intake/validate.js';
import { isRuntimeBindingEvidence } from '../runtime-binding/evidence.js';
import { RUNTIME_ACTIVATION_ADAPTER_VERSION } from '../runtime-binding/contracts.js';
import { isRuntimeActivationRef } from '../dac/guards.js';
function requireExactSelectedIdentity(value) {
    if (!isRecord(value)) {
        throw new ApplicationManifestError('INVALID_MANIFEST_COMPOSITION_REQUEST', 'composition request must state the exact selected entry identity (semanticIdentity, revisionIdentity, contentDigest) being consumed; the manifest never chooses by order or default');
    }
    for (const field of ['semanticIdentity', 'revisionIdentity', 'contentDigest']) {
        const fieldValue = value[field];
        if (typeof fieldValue !== 'string' || fieldValue.length === 0) {
            throw new ApplicationManifestError('INVALID_MANIFEST_COMPOSITION_REQUEST', `exactSelected.${field} must be a non-empty string; a partial identity can never resolve an exact selected entry`);
        }
    }
    return value;
}
/**
 * Composes an adopted Application Manifest: validates the exact stated
 * selected entry against the concrete compiled package and declared runtime
 * compatibility target through the #306 intake, checks the manifest's
 * capability declarations against the validated target, and returns SEPARATE
 * stage evidence referencing the exact manifest identity/digest.
 *
 * Never selects (the only selection evidence in the verdict is the
 * pass-through upstream ref), never substitutes (incompatibility fails
 * closed exactly as the #306 intake does), never binds or activates.
 */
export async function composeSelectedApplicationManifest(request) {
    if (!isRecord(request)) {
        throw new ApplicationManifestError('INVALID_MANIFEST_COMPOSITION_REQUEST', 'composition request must be an object');
    }
    const manifest = request.manifest;
    if (!isApplicationManifest(manifest)) {
        throw new ApplicationManifestError('NOT_AN_ADOPTED_APPLICATION_MANIFEST', 'composition input is not a manifest adopted by the application-manifest adapter; a foreign/forged manifest object can never be composed');
    }
    const exactSelected = requireExactSelectedIdentity(request.exactSelected);
    // Exact-entry lookup: first entry whose full identity triple matches the
    // stated identity. A miss fails closed with the available identities —
    // there is no order-based, default or fuzzy fallback anywhere (L2 A2
    // §7.2: a manifest must not silently choose a different Domain Data
    // revision, and neither does its consumer).
    const entry = manifest.selectedDomainData.find((candidate) => candidate.selected.semanticIdentity === exactSelected.semanticIdentity &&
        candidate.selected.revisionIdentity === exactSelected.revisionIdentity &&
        candidate.selected.contentDigest === exactSelected.contentDigest);
    if (entry === undefined) {
        throw new ApplicationManifestError('SELECTED_ENTRY_NOT_FOUND', 'the exact stated selected Domain Data identity is not carried by this manifest; the manifest never chooses a revision by order/defaults and no substitution is attempted', [
            `requested=${exactSelected.semanticIdentity}/${exactSelected.revisionIdentity}/${exactSelected.contentDigest}`,
            ...manifest.selectedDomainData.map((candidate, index) => `available[${index}]=${candidate.selected.semanticIdentity}/${candidate.selected.revisionIdentity}/${candidate.selected.contentDigest}`),
        ]);
    }
    // The intake request is built ONLY from the manifest's own declared
    // references plus the caller's concrete package/environment — the adapter
    // contributes no identity of its own. Compatibility validation, integrity
    // and provenance-chain checks remain entirely the #306 intake's authority.
    const intakeRequest = {
        promotionDecision: entry.promotionDecision,
        applicationSelection: entry.applicationSelection,
        selectedDomainData: entry.selected,
        runtimeContract: manifest.declared.runtimeContract,
        runtimeImplementation: manifest.declared.runtimeImplementation,
        compatibilityTarget: manifest.declared.compatibilityTarget,
        compiledPackage: request.compiledPackage,
        environment: request.environment,
    };
    const validation = await validateSelectedComposition(intakeRequest);
    // DAC §9/§13.2: capability declarations are requirements, not proof of
    // availability. A declared capability the validated target does not
    // provide blocks composition (never activation) — fail closed with the
    // exact missing set and no substitution.
    const provided = new Set(validation.compatibility.providedCapabilities);
    const missing = manifest.requiredCapabilities.filter((capability) => !provided.has(capability));
    if (missing.length > 0) {
        throw new ApplicationManifestError('CAPABILITY_DECLARATION_UNSATISFIED', 'the manifest declares required capabilities the validated compatibility target does not provide; a declaration is a requirement, not proof of availability, and no substitution is attempted', missing);
    }
    const manifestIdentity = Object.freeze({
        applicationSemanticIdentity: manifest.applicationSemanticIdentity,
        applicationRevisionIdentity: manifest.applicationRevisionIdentity,
        manifestIdentity: manifest.manifestIdentity,
        manifestContentDigest: manifest.manifestContentDigest,
    });
    return mintCompositionEvidence(Object.freeze({
        manifestComposition: MANIFEST_COMPOSITION_ADAPTER_VERSION,
        manifestIdentity,
        validation,
    }));
}
/**
 * Correlates one exact #307 runtime binding with this manifest composition:
 * the binding must have been minted from THIS composition's verdict object
 * (object identity, not structural equality), so the binding transitively
 * references the exact manifest identity/digest (L2 A2 §6.3). The returned
 * correlation is separate evidence — the manifest definition is never
 * mutated and structurally has no slot for it (C38/N18).
 */
export function correlateManifestRuntimeBinding(evidence, binding) {
    if (!isManifestCompositionEvidence(evidence)) {
        throw new ApplicationManifestError('NOT_A_MANIFEST_COMPOSITION', 'binding correlation input is not manifest composition evidence minted by the application-manifest adapter');
    }
    if (!isRuntimeBindingEvidence(binding)) {
        throw new ApplicationManifestError('NOT_A_RUNTIME_BINDING_EVIDENCE', 'binding correlation input is not #307 runtime binding evidence; a verdict, a bare reference, a selection or a forged lookalike can never stand in for a genuine binding');
    }
    if (binding.validation !== evidence.validation) {
        throw new ApplicationManifestError('CORRELATION_MISMATCH', 'the binding evidence was minted from a different composition verdict object than the one this manifest composition produced; a correlation references only the exact evidence chain it was derived from');
    }
    return mintBindingCorrelation(Object.freeze({
        manifestBinding: MANIFEST_BINDING_CORRELATION_VERSION,
        manifestIdentity: evidence.manifestIdentity,
        bindingRef: binding.bindingRef,
        binding,
    }));
}
/** Structural check for #307 activation evidence (the minted marker + refs). */
function isRuntimeActivationEvidence(value) {
    if (!isRecord(value))
        return false;
    return (value.activation === RUNTIME_ACTIVATION_ADAPTER_VERSION &&
        isRuntimeActivationRef(value.activationRef) &&
        isRuntimeBindingEvidence(value.binding));
}
/**
 * Correlates one exact #307 technical activation with this manifest
 * composition's binding correlation: the activation must have been minted
 * under THIS correlation's binding object. Activation evidence stays outside
 * the manifest definition (DAC §5); this record is the separate
 * correlation referencing the exact manifest identity/digest.
 */
export function correlateManifestRuntimeActivation(correlation, activation) {
    if (!isManifestRuntimeBindingCorrelation(correlation)) {
        throw new ApplicationManifestError('NOT_A_MANIFEST_BINDING_CORRELATION', 'activation correlation input is not a manifest binding correlation minted by the application-manifest adapter');
    }
    if (!isRuntimeActivationEvidence(activation)) {
        throw new ApplicationManifestError('NOT_A_RUNTIME_ACTIVATION_EVIDENCE', 'activation correlation input is not #307 runtime activation evidence minted under a genuine binding');
    }
    if (activation.binding !== correlation.binding) {
        throw new ApplicationManifestError('CORRELATION_MISMATCH', 'the activation evidence was minted under a different binding than the one this manifest correlation references; a correlation references only the exact evidence chain it was derived from');
    }
    return mintActivationCorrelation(Object.freeze({
        manifestActivation: MANIFEST_ACTIVATION_CORRELATION_VERSION,
        manifestIdentity: correlation.manifestIdentity,
        activationRef: activation.activationRef,
        bindingRef: correlation.bindingRef,
        activationInstanceId: activation.activationInstanceId,
        activatedPackageId: activation.activatedPackageId,
    }));
}
//# sourceMappingURL=compose.js.map