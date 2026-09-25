// Issue #308 / A2 I-005: role guards for the DAC UX<->Runtime correlation
// bridge. Mirrors the I-002 adapter's enforcement style: guards authenticate
// against the private minting registry, so only references actually produced
// by this bridge's constructors/adapters pass — and one role never passes
// another role's guard. No conversion function exists between roles: intent
// != command != outcome, and view/snapshot/watch stay distinct identities.
// The I-002 lifecycle reference registry stays separate on purpose — a
// lifecycle ref (e.g. RuntimeActivationRef) is never a bridge ref and vice
// versa (distinct DAC authority categories).
import { DAC_BRIDGE_ADAPTER_VERSION, DAC_BRIDGE_BASELINE, DAC_BRIDGE_ROLES, DacBridgeError, } from './contracts.js';
import { isMintedCorrelation, isMintedReference, } from './registry.js';
function structurallyMintedReference(value) {
    if (!isMintedReference(value))
        return false;
    const candidate = value;
    return (candidate.adapter === DAC_BRIDGE_ADAPTER_VERSION &&
        typeof candidate.role === 'string' &&
        DAC_BRIDGE_ROLES.includes(candidate.role) &&
        candidate.baseline === DAC_BRIDGE_BASELINE);
}
/** Structural guard for any bridge-minted reference (unknown-safe). */
export function isDacBridgeReference(value) {
    return structurallyMintedReference(value);
}
/** Exact role of a bridge-minted reference; `undefined` for non-references. */
export function getDacBridgeRole(value) {
    return structurallyMintedReference(value)
        ? (value.role)
        : undefined;
}
function roleGuard(role, value) {
    return structurallyMintedReference(value) && value.role === role;
}
function expectRole(role, value, description) {
    if (!roleGuard(role, value)) {
        const actual = structurallyMintedReference(value)
            ? `"${String(value.role)}"`
            : 'not a bridge-minted DAC reference';
        throw new DacBridgeError('ROLE_MISMATCH', `expected a ${description} reference, but received ${actual}; DAC UX<->Runtime roles are never interchangeable`);
    }
}
export function isDomainIntentRef(v) {
    return roleGuard('domain-intent', v);
}
export function isSemanticTargetRef(v) {
    return roleGuard('semantic-target', v);
}
export function isCommandRef(v) {
    return roleGuard('command', v);
}
export function isOutcomeRef(v) {
    return roleGuard('outcome', v);
}
export function isViewRef(v) {
    return roleGuard('view', v);
}
export function isSnapshotRef(v) {
    return roleGuard('snapshot', v);
}
export function isWatchRef(v) {
    return roleGuard('watch', v);
}
export function expectDomainIntentRef(v) {
    expectRole('domain-intent', v, 'domain-intent');
}
export function expectSemanticTargetRef(v) {
    expectRole('semantic-target', v, 'semantic-target');
}
export function expectCommandRef(v) {
    expectRole('command', v, 'command');
}
export function expectOutcomeRef(v) {
    expectRole('outcome', v, 'outcome');
}
export function expectViewRef(v) {
    expectRole('view', v, 'view');
}
export function expectSnapshotRef(v) {
    expectRole('snapshot', v, 'snapshot');
}
export function expectWatchRef(v) {
    expectRole('watch', v, 'watch');
}
/** Structural guard for a bridge-minted command correlation envelope. */
export function isDomainCommandCorrelation(value) {
    if (!isMintedCorrelation(value))
        return false;
    const candidate = value;
    return isCommandRef(candidate.command);
}
/** Structural guard for a bridge-minted outcome correlation envelope. */
export function isDomainOutcomeCorrelation(value) {
    if (!isMintedCorrelation(value))
        return false;
    const candidate = value;
    return isOutcomeRef(candidate.outcome);
}
//# sourceMappingURL=guards.js.map