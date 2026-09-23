// Issue #307 / A2 I-004 (reviewed Product/L2 A2 chain): Runtime binding and
// technical activation evidence — stages 4+5 of the five-stage
// composition-to-runtime boundary of L2 A2 §5:
//
// ```text
// promotion decision -> application selection -> compatibility validation (#306)
//   -> RUNTIME BINDING (this module) -> RUNTIME ACTIVATION (this module)
// ```
//
// Boundary C of L2 A2 §6.3: binding and activation become separately
// observable facts, each minted only from the exact preceding stage evidence:
//
//   - `bindValidatedComposition` accepts ONLY a verdict actually minted by the
//     #306 intake (`isSelectedCompositionValidation`) and produces immutable
//     `RuntimeBindingRef` evidence that the already-selected compatible
//     composition was bound to the explicit compatibility target and concrete
//     runtime implementation environment validated in that verdict;
//   - `activateRuntimeBinding` accepts ONLY binding evidence actually minted by
//     this module (`isRuntimeBindingEvidence`) plus an exact caller-supplied
//     technical activation instance identity, and produces immutable
//     `RuntimeActivationRef` evidence identifying the concrete technical
//     activation under that binding.
//
// No path in this module manufactures selection from compatibility or
// activation (N05), activation from selection (N06), or any substitute
// revision/package (N07/C32/C37): there is no registry input, no default, no
// latest, and every input mismatch fails closed without alternatives. The
// mandatory inequalities remain nominal in the #305 adapter and structural
// here:
//
// ```text
// ApplicationSelectionRef != RuntimeBindingRef != RuntimeActivationRef
// ```
//
// Portable leaf module: no Node built-ins, no engine/observation/control
// imports, no DAC product dependency, no Manifest concept (that is #310/I-007;
// L2 A2 §6.3 only requires binding/activation evidence to stay separate from
// any Manifest definition, which holds trivially while none is consumed).
// Composition happens only in the public barrels.
/** Exact identity of the binding evidence surface, carried by every binding. */
export const RUNTIME_BINDING_ADAPTER_VERSION = 'runtime-binding/1';
/** Exact identity of the activation evidence surface, carried by every activation. */
export const RUNTIME_ACTIVATION_ADAPTER_VERSION = 'runtime-activation/1';
/** Fail-closed error surface for Runtime binding/activation evidence. */
export class RuntimeBindingError extends Error {
    code;
    details;
    constructor(code, message, details = []) {
        super(`[${code}] ${message}`);
        this.name = 'RuntimeBindingError';
        this.code = code;
        this.details = details;
    }
}
//# sourceMappingURL=contracts.js.map