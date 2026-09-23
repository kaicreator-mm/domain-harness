// Issue #308 / A2 I-005 (reviewed Product/L2 A2 chain, G3): DAC UX<->Runtime
// correlation bridge — renderer-independent correlation adapters over the
// current DomainMessage / query / workflow / projection / subscription
// mechanisms for the DAC v0.0.2 section-9 UX<->Runtime reference roles:
//
//   DomainIntentRef, SemanticTargetRef, CommandRef, OutcomeRef, ViewRef,
//   SnapshotRef, WatchRef
//
// Authority boundaries frozen by the reviewed chain and enforced here:
//
//   - Correlation only. A DomainIntentRef is an input/correlation reference,
//     never authoritative transition permission; this module exposes no
//     transition/effect/send surface at all, so Runtime transition authority
//     cannot move into it (PRD A2 G3-1/G3-2, DAC C08).
//   - CommandRef adapts the existing DomainMessage identity (messageId,
//     target, correlationId, causationId); no duplicate command authority is
//     minted and CommandRefs can only be derived from an actual DomainMessage
//     (L2 A2 6.4 / 8.5).
//   - OutcomeRef is a narrow correlation carrying Runtime/external ambiguity
//     accurately: a message disposition is Runtime-logical truth only and this
//     type structurally cannot claim an external business outcome
//     (`externalAuthorityOutcome: 'not-claimed'`); external authority
//     observation/commit evidence is a separate concern (I-006 / L2 A2 6.6).
//   - ViewRef / SnapshotRef / WatchRef are renderer-independent identity/
//     revision adapters. No UI component, renderer, presentation host or
//     layout concept exists on this surface (PRD A2 G3-4/G3-5, DAC C10).
//   - Snapshot adapters preserve — never erase — the existing revision
//     relationships (ProjectionSnapshot's own revision, workflow source
//     stateRevisions and business-source revisions; L2 A2 6.5).
//   - Observed-basis handling is fail-safe (L2 A2 6.4):
//
//     observed basis matches authoritative requirement -> proceed under
//     Runtime rules; observed basis is stale/conflicting -> reject / stale /
//     explicit rebase-review; basis required but absent -> fail closed.
//
// Like the I-002 DAC reference adapter core, this module freezes only the
// nominal semantic roles, the exact DAC baseline binding and the minimum
// identity fields needed for fail-closed consumption. It does NOT freeze a
// wire schema or serialization. It deliberately imports nothing from the
// observation stream (#312), the control concern (#313) or any DAC product
// implementation — v2 contract usage is type-only.
import { DAC_REFERENCE_BASELINE } from '../dac/contracts.js';
/**
 * Exact identity of this bridge adapter surface. Carried by every minted
 * reference so foreign/mis-tagged objects fail closed.
 */
export const DAC_BRIDGE_ADAPTER_VERSION = 'dac-bridge-adapter/1';
/**
 * The DAC baseline this bridge is version-bound to — the exact same frozen
 * baseline as the I-002 reference adapter core (single source of truth,
 * imported from it). A reference presented under any other baseline is
 * rejected (`UNSUPPORTED_DAC_BASELINE`).
 */
export const DAC_BRIDGE_BASELINE = DAC_REFERENCE_BASELINE;
/** The seven DAC section-9 UX<->Runtime roles adapted by this bridge. */
export const DAC_BRIDGE_ROLES = [
    'domain-intent',
    'semantic-target',
    'command',
    'outcome',
    'view',
    'snapshot',
    'watch',
];
/** Fail-closed error surface for the DAC UX<->Runtime correlation bridge. */
export class DacBridgeError extends Error {
    code;
    constructor(code, message) {
        super(`[${code}] ${message}`);
        this.name = 'DacBridgeError';
        this.code = code;
    }
}
//# sourceMappingURL=contracts.js.map