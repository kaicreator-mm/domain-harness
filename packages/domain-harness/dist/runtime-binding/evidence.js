// Issue #307 / A2 I-004 core: minting of Runtime binding (stage 4) and
// technical activation (stage 5) evidence from the exact preceding stage
// evidence only. Binding consumes a genuine #306 verdict; activation consumes
// a genuine binding of this module. No function here selects, substitutes, or
// converts between lifecycle roles — that absence is the enforcement mechanism
// for ApplicationSelectionRef != RuntimeBindingRef != RuntimeActivationRef.
import { DAC_REFERENCE_BASELINE } from '../dac/contracts.js';
import { adoptRuntimeActivationRef, adoptRuntimeBindingRef, isRuntimeBindingRef } from '../dac/guards.js';
import { isSelectedCompositionValidation } from '../composition-intake/validate.js';
import { RUNTIME_ACTIVATION_ADAPTER_VERSION, RUNTIME_BINDING_ADAPTER_VERSION, RuntimeBindingError, } from './contracts.js';
function requireSha256Port(options, stage) {
    if (options === null || typeof options !== 'object') {
        throw new RuntimeBindingError('INVALID_RUNTIME_BINDING_INPUT', `${stage} options must be an object`);
    }
    const candidate = options;
    if (candidate.sha256 === null ||
        typeof candidate.sha256 !== 'object' ||
        typeof candidate.sha256.digestUtf8 !== 'function') {
        throw new RuntimeBindingError('INVALID_RUNTIME_BINDING_INPUT', `${stage} options must declare a sha256 port (digestUtf8) for exact evidence identity derivation`);
    }
}
/**
 * Canonical binding material: the exact identity of everything the binding
 * binds, encoded deterministically (fixed key order). The digest over this
 * material is the content identity of the binding evidence, so any drift in
 * the selected identity, provenance, contract, implementation, target or
 * environment dimensions produces a different binding.
 */
function canonicalBindingMaterial(validation) {
    const selected = validation.selectedDomainData;
    const selection = validation.provenance.applicationSelection;
    const promotion = validation.provenance.promotionDecision;
    const contract = validation.declared.runtimeContract;
    const implementation = validation.declared.runtimeImplementation;
    const target = validation.compatibilityTarget;
    const compatibility = validation.compatibility;
    return JSON.stringify({
        authority: 'domain-harness/runtime-binding',
        intake: validation.intake,
        packageId: validation.validatedPackageId,
        selectedDomainData: {
            semanticIdentity: selected.semanticIdentity,
            authorityScope: selected.authorityScope,
            revisionIdentity: selected.revisionIdentity,
            contentDigest: selected.contentDigest,
        },
        applicationSelection: {
            semanticIdentity: selection.semanticIdentity,
            authorityScope: selection.authorityScope,
            revisionIdentity: selection.revisionIdentity,
            contentDigest: selection.contentDigest,
        },
        promotionDecision: {
            semanticIdentity: promotion.semanticIdentity,
            authorityScope: promotion.authorityScope,
            revisionIdentity: promotion.revisionIdentity,
            contentDigest: promotion.contentDigest,
        },
        runtimeContract: {
            semanticIdentity: contract.semanticIdentity,
            authorityScope: contract.authorityScope,
            revisionIdentity: contract.revisionIdentity,
        },
        runtimeImplementation: {
            semanticIdentity: implementation.semanticIdentity,
            authorityScope: implementation.authorityScope,
            revisionIdentity: implementation.revisionIdentity,
            contentDigest: implementation.contentDigest,
        },
        compatibilityTarget: {
            semanticIdentity: target.semanticIdentity,
            authorityScope: target.authorityScope,
            revisionIdentity: target.revisionIdentity,
            contentDigest: target.contentDigest,
        },
        environment: {
            formatVersion: compatibility.formatVersion,
            runtimeContractMajor: compatibility.runtimeContractMajor,
            executionEngineMajor: compatibility.executionEngineMajor,
            targetProfileId: compatibility.targetProfileId,
            requiredCapabilities: compatibility.requiredCapabilities,
            providedCapabilities: compatibility.providedCapabilities,
            runtimeImplementation: {
                identity: compatibility.runtimeImplementation.identity,
                version: compatibility.runtimeImplementation.version,
                build: compatibility.runtimeImplementation.build,
            },
        },
    });
}
/**
 * Canonical activation material: the exact binding content plus the concrete
 * activation instance identity. An activation is content-distinct from its
 * binding (different material, different digest) while referencing it exactly.
 */
function canonicalActivationMaterial(binding, activationInstanceId) {
    return JSON.stringify({
        authority: 'domain-harness/runtime-activation',
        bindingRef: {
            semanticIdentity: binding.bindingRef.semanticIdentity,
            authorityScope: binding.bindingRef.authorityScope,
            revisionIdentity: binding.bindingRef.revisionIdentity,
            contentDigest: binding.bindingRef.contentDigest,
        },
        activationInstanceId,
        activatedPackageId: binding.validation.validatedPackageId,
    });
}
/**
 * Private minting registry. Only binding evidence actually produced by
 * `bindValidatedComposition` passes `isRuntimeBindingEvidence` — a forged
 * lookalike is rejected, so activation can only ever follow a genuine binding.
 */
const MINTED_BINDINGS = new WeakSet();
/** True only for binding evidence actually minted by `bindValidatedComposition`. */
export function isRuntimeBindingEvidence(value) {
    if (value === null || typeof value !== 'object' || !MINTED_BINDINGS.has(value)) {
        return false;
    }
    const candidate = value;
    return (candidate.binding === RUNTIME_BINDING_ADAPTER_VERSION &&
        isRuntimeBindingRef(candidate.bindingRef) &&
        isSelectedCompositionValidation(candidate.validation));
}
/**
 * Binds an already-validated, already-selected composition to the concrete
 * runtime environment its stage-3 verdict proved compatible. The ONLY accepted
 * input is a verdict actually minted by the #306 composition intake; the ONLY
 * output is separately referrable stage-4 binding evidence. This function
 * never selects, never re-validates a different package, and never emits
 * activation evidence.
 */
export async function bindValidatedComposition(validation, options) {
    requireSha256Port(options, 'bind');
    if (!isSelectedCompositionValidation(validation)) {
        throw new RuntimeBindingError('NOT_A_VALIDATED_COMPOSITION', 'binding input is not a verdict minted by the composition intake; compatibility PASS ' +
            'cannot be claimed or inferred, and no substitute composition is ever bound');
    }
    const digest = await options.sha256.digestUtf8(canonicalBindingMaterial(validation));
    const selected = validation.selectedDomainData;
    const bindingRef = adoptRuntimeBindingRef({
        baseline: { ...DAC_REFERENCE_BASELINE },
        semanticIdentity: `domain-harness/runtime-binding/${selected.semanticIdentity}/${validation.compatibility.targetProfileId}`,
        authorityScope: 'domain-harness://runtime/binding',
        revisionIdentity: selected.revisionIdentity,
        contentDigest: digest,
        opaque: {
            intake: validation.intake,
            validatedPackageId: validation.validatedPackageId,
            targetProfileId: validation.compatibility.targetProfileId,
            runtimeContractMajor: validation.compatibility.runtimeContractMajor,
            executionEngineMajor: validation.compatibility.executionEngineMajor,
        },
    });
    const evidence = Object.freeze({
        binding: RUNTIME_BINDING_ADAPTER_VERSION,
        bindingRef,
        validation,
    });
    MINTED_BINDINGS.add(evidence);
    return evidence;
}
/**
 * Records the concrete technical activation of an exact binding: separately
 * referrable stage-5 evidence identifying the activation instance that
 * executed or is eligible to execute under that binding. The ONLY accepted
 * basis is binding evidence actually minted by this module plus an exact
 * activation instance identity — never a verdict, a bare binding reference, a
 * selection, or an activation. This function never implies application
 * selection and never emits binding evidence.
 */
export async function activateRuntimeBinding(binding, options) {
    requireSha256Port(options, 'activation');
    const instanceId = options.activationInstanceId;
    if (typeof instanceId !== 'string' || instanceId.trim().length === 0) {
        throw new RuntimeBindingError('INVALID_RUNTIME_BINDING_INPUT', 'activation options must declare a non-empty exact activationInstanceId');
    }
    if (!isRuntimeBindingEvidence(binding)) {
        throw new RuntimeBindingError('NOT_A_RUNTIME_BINDING', 'activation input is not binding evidence minted by the runtime-binding module; a verdict, ' +
            'a bare binding reference, a selection or an activation can never stand in for a verified ' +
            'binding basis');
    }
    const digest = await options.sha256.digestUtf8(canonicalActivationMaterial(binding, instanceId));
    const activationRef = adoptRuntimeActivationRef({
        baseline: { ...DAC_REFERENCE_BASELINE },
        semanticIdentity: `domain-harness/runtime-activation/${binding.bindingRef.semanticIdentity}`,
        authorityScope: 'domain-harness://runtime/activation',
        revisionIdentity: instanceId,
        contentDigest: digest,
        opaque: {
            bindingDigest: binding.bindingRef.contentDigest,
            activatedPackageId: binding.validation.validatedPackageId,
        },
    });
    return Object.freeze({
        activation: RUNTIME_ACTIVATION_ADAPTER_VERSION,
        activationRef,
        binding,
        activationInstanceId: instanceId,
        activatedPackageId: binding.validation.validatedPackageId,
    });
}
//# sourceMappingURL=evidence.js.map