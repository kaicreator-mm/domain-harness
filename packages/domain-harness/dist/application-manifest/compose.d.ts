import type { ManifestCompositionEvidence, ManifestCompositionRequest, ManifestRuntimeActivationCorrelation, ManifestRuntimeBindingCorrelation } from './contracts.js';
import type { RuntimeActivationEvidence, RuntimeBindingEvidence } from '../runtime-binding/contracts.js';
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
export declare function composeSelectedApplicationManifest(request: ManifestCompositionRequest): Promise<ManifestCompositionEvidence>;
/**
 * Correlates one exact #307 runtime binding with this manifest composition:
 * the binding must have been minted from THIS composition's verdict object
 * (object identity, not structural equality), so the binding transitively
 * references the exact manifest identity/digest (L2 A2 §6.3). The returned
 * correlation is separate evidence — the manifest definition is never
 * mutated and structurally has no slot for it (C38/N18).
 */
export declare function correlateManifestRuntimeBinding(evidence: ManifestCompositionEvidence, binding: RuntimeBindingEvidence): ManifestRuntimeBindingCorrelation;
/**
 * Correlates one exact #307 technical activation with this manifest
 * composition's binding correlation: the activation must have been minted
 * under THIS correlation's binding object. Activation evidence stays outside
 * the manifest definition (DAC §5); this record is the separate
 * correlation referencing the exact manifest identity/digest.
 */
export declare function correlateManifestRuntimeActivation(correlation: ManifestRuntimeBindingCorrelation, activation: RuntimeActivationEvidence): ManifestRuntimeActivationCorrelation;
//# sourceMappingURL=compose.d.ts.map