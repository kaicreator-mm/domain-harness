// Issue #306 / A2 I-003 (reviewed Product/L2 A2 chain): DAC-aware composition
// intake + exact selected package/runtime compatibility validation.
//
// Boundary B of L2 A2 §6.2: a Runtime composition entry path that ACCEPTS
// already-decided composition/selection evidence (the DAC lifecycle refs
// adopted through the #305 adapter core) and VALIDATES it against the concrete
// compiled package and a declared runtime compatibility target. The intake
// performs validation only — stage 3 of the five-stage composition boundary:
//
// ```text
// promotion decision -> application selection -> COMPATIBILITY VALIDATION
//   -> runtime binding -> runtime activation
// ```
//
// It never performs selection (no ApplicationSelectionRef is ever created,
// re-classified or synthesized here; the only selection evidence in a verdict
// is the exact upstream pass-through object), never consults a package
// registry or its default, and never resolves an incompatibility by choosing
// another revision — incompatibility fails closed and requires explicit
// upstream reselection (PRD A2 §§3.3/10.6, L2 A2 §5.1, DAC C32/C37).
//
// The canonical mapping this intake validates (its own reviewed contract, not
// a DAC wire freeze — DAC envelope encodings remain PROVISIONAL):
//
// ```text
// selected.semanticIdentity === manifest.domainId      (which logical domain)
// selected.revisionIdentity === manifest.domainVersion (which immutable revision)
// selected.contentDigest    === manifest.packageId     (content-derived identity)
// contract.revisionIdentity === String(runtimeContractMajor) (contract revision)
// implementation.semanticIdentity/revisionIdentity/contentDigest
//                            === implementation identity/version/build
// target.revisionIdentity    === targetProfileId
// ```
//
// Portable leaf module: no Node built-ins, no engine/observation/control
// imports, no DAC product dependency. Composition happens only in the public
// barrels.
/** Exact identity of this intake surface, carried by every validation verdict. */
export const COMPOSITION_INTAKE_ADAPTER_VERSION = 'composition-intake/1';
/**
 * Fail-closed error surface for the composition intake. Incompatibility is
 * terminal here: no error carries a substitute/default/latest suggestion —
 * the only resolution is explicit upstream reselection.
 */
export class CompositionIntakeError extends Error {
    code;
    details;
    constructor(code, message, details = []) {
        super(`[${code}] ${message}`);
        this.name = 'CompositionIntakeError';
        this.code = code;
        this.details = details;
    }
}
//# sourceMappingURL=contracts.js.map