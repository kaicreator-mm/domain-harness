import type { CommandRef, DacBridgeRole, DomainCommandCorrelation, DomainIntentRef, DomainOutcomeCorrelation, OutcomeRef, SemanticTargetRef, SnapshotRef, ViewRef, WatchRef } from './contracts.js';
type AnyBridgeReference = {
    role: unknown;
} & Record<string, unknown>;
/** Structural guard for any bridge-minted reference (unknown-safe). */
export declare function isDacBridgeReference(value: unknown): value is AnyBridgeReference;
/** Exact role of a bridge-minted reference; `undefined` for non-references. */
export declare function getDacBridgeRole(value: unknown): DacBridgeRole | undefined;
export declare function isDomainIntentRef(v: unknown): v is DomainIntentRef;
export declare function isSemanticTargetRef(v: unknown): v is SemanticTargetRef;
export declare function isCommandRef(v: unknown): v is CommandRef;
export declare function isOutcomeRef(v: unknown): v is OutcomeRef;
export declare function isViewRef(v: unknown): v is ViewRef;
export declare function isSnapshotRef(v: unknown): v is SnapshotRef;
export declare function isWatchRef(v: unknown): v is WatchRef;
export declare function expectDomainIntentRef(v: unknown): asserts v is DomainIntentRef;
export declare function expectSemanticTargetRef(v: unknown): asserts v is SemanticTargetRef;
export declare function expectCommandRef(v: unknown): asserts v is CommandRef;
export declare function expectOutcomeRef(v: unknown): asserts v is OutcomeRef;
export declare function expectViewRef(v: unknown): asserts v is ViewRef;
export declare function expectSnapshotRef(v: unknown): asserts v is SnapshotRef;
export declare function expectWatchRef(v: unknown): asserts v is WatchRef;
/** Structural guard for a bridge-minted command correlation envelope. */
export declare function isDomainCommandCorrelation(value: unknown): value is DomainCommandCorrelation;
/** Structural guard for a bridge-minted outcome correlation envelope. */
export declare function isDomainOutcomeCorrelation(value: unknown): value is DomainOutcomeCorrelation;
export {};
//# sourceMappingURL=guards.d.ts.map