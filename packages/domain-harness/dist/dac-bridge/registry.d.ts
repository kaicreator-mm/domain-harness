import type { DacBridgeBaselineInput } from './contracts.js';
export declare function isMutableAliasToken(value: string): boolean;
export declare function requireNonEmptyString(value: unknown, field: string): void;
export declare function requireExactBaseline(input: DacBridgeBaselineInput): void;
export declare function freezeOpaque(opaque: Readonly<Record<string, unknown>> | undefined): Readonly<Record<string, unknown>>;
/** Freeze, register and return a minted bridge reference. */
export declare function mintReference<T extends object>(value: T): T;
/** Freeze, register and return a minted correlation envelope. */
export declare function mintCorrelation<T extends object>(value: T): T;
/** True iff the value was minted by this bridge's constructors. */
export declare function isMintedReference(value: unknown): value is object;
/** True iff the value was minted as a correlation envelope by this bridge. */
export declare function isMintedCorrelation(value: unknown): value is object;
//# sourceMappingURL=registry.d.ts.map