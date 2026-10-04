/**
 * v0.7 shared descriptor-safe data-record primitive and unified
 * exact-reference authority (issues #557 + #578, coordinated landing #588).
 *
 * This module is the ONE internal low-level safety layer for v0.7 contract
 * validation. It is consumed by the v0.7 contract modules
 * (`component.ts`, `component-admission.ts`, `tool-component.ts`,
 * `kind-compatibility.ts`, `resource-requirements.ts`, `definition-graph.ts`)
 * and is deliberately NOT exposed through any public barrel (`./v7` or
 * legacy): the runtime export surfaces of the consumer modules stay
 * unchanged, and no new public name is added.
 *
 * Descriptor-safe record discipline (#578):
 *
 * - Authority-bearing contract records must be ordinary or null-prototype
 *   objects whose own properties are all enumerable DATA properties. Accessor
 *   (getter/setter) properties are rejected because they can make validation
 *   and a later read observe different values within one call chain;
 * - symbol-keyed own properties and non-enumerable own properties are
 *   rejected on closed-world/exact-shape contracts — hidden material is not
 *   contract input;
 * - exotic/class/custom prototypes are rejected. The declared prototype
 *   posture is deterministic: `Object.prototype` or `null` for records,
 *   `Array.prototype` or `null` for arrays. Ordinary AND intended
 *   null-prototype records are accepted;
 * - every validator works on a SNAPSHOT: a fresh value object holding exactly
 *   the validated own data values. Callers never re-read pluggable
 *   caller-owned objects after validation, so validation-to-use TOCTOU drift
 *   is impossible by construction. Caller input is never frozen or mutated;
 * - diagnostics identify the offending key from property descriptors only
 *   (`Object.getOwnPropertyDescriptor` / `Object.getOwnPropertySymbols` never
 *   execute getters), so a hidden getter cannot run as part of failure
 *   reporting.
 *
 * Unified exact-reference matrix (#557), validation only (NO semver/range
 * resolution, ever):
 *
 * - identity strings (kindId/contractId/capabilityId/componentId/operationId/
 *   resourceKey/relationId/relationKind/graphId/...): reject floating tokens
 *   (`latest`/`current`/`active`/`default`/`*`/`x`), reject range/wildcard
 *   operators (`^ ~ < > | *`), reject embedded `id@version` selectors;
 * - version strings: the identity matrix PLUS semver x-range/partial forms
 *   (`1.x`, `x`, `1.`, any `.`-separated empty or `x` part);
 * - the strictest pre-existing seam (`component-admission.ts` /
 *   `kind-compatibility.ts`) is the canonical matrix; inputs previously
 *   accepted by laxer seams (e.g. `1.x` versions in `component.ts`) are now
 *   rejected with the seam's typed floating-selector failure.
 *
 * The module is intentionally dependency-free (it imports nothing from the
 * package) so that seam-independence rules of consumers — notably
 * `kind-compatibility.ts`, which must not couple to admission or legacy
 * modules — remain intact.
 */
/** Discriminated descriptor-safety violations for closed-world contract input. */
export type RecordSafetyViolation = 'NOT_A_RECORD' | 'NOT_AN_ARRAY' | 'EXOTIC_PROTOTYPE' | 'SYMBOL_KEYED_PROPERTY' | 'NON_ENUMERABLE_PROPERTY' | 'ACCESSOR_PROPERTY' | 'SPARSE_ARRAY' | 'EXTRA_ARRAY_PROPERTY';
/** One typed descriptor-safety issue; `key` names the offending own property. */
export interface RecordSafetyIssue {
    readonly violation: RecordSafetyViolation;
    readonly key?: string;
}
export type SafeRecordSnapshotResult = {
    readonly ok: true;
    readonly snapshot: Record<string, unknown>;
} | {
    readonly ok: false;
    readonly issue: RecordSafetyIssue;
};
export type SafeArraySnapshotResult = {
    readonly ok: true;
    readonly snapshot: unknown[];
} | {
    readonly ok: false;
    readonly issue: RecordSafetyIssue;
};
/**
 * Human-readable, getter-safe reason for a descriptor-safety issue. Only
 * descriptor metadata (violation kind + own key names) participates — no
 * property VALUE is ever read for diagnostics, so a hidden accessor cannot
 * execute as part of failure reporting.
 */
export declare function describeRecordSafetyIssue(issue: RecordSafetyIssue): string;
/**
 * Descriptor-safe snapshot of one closed-world contract record.
 *
 * On success returns a fresh plain object holding exactly the caller record's
 * own enumerable data values (shallow copy — nested records are re-snapshotted
 * by their own validation layer). On failure returns a typed issue; no getter
 * was executed and the caller input was neither frozen nor mutated.
 *
 * Posture: ordinary (`Object.prototype`) or null-prototype records only.
 */
export declare function safeRecordSnapshot(value: unknown, path: string): SafeRecordSnapshotResult;
/**
 * Descriptor-safe snapshot of one contract array (indexed entries only).
 *
 * On success returns a fresh dense array holding exactly the caller array's
 * entries (shallow copy). Rejects non-arrays, exotic prototypes, symbol keys,
 * accessor/sparse/extra entries — mirroring the array discipline of the
 * hardened canonical-JSON seam (`identity.ts`). The caller array is never
 * frozen or mutated.
 */
export declare function safeArraySnapshot(value: unknown, path: string): SafeArraySnapshotResult;
/** Exact-identity precondition: a string that is non-empty after trimming. */
export declare function isNonEmptyIdentityString(value: unknown): value is string;
/** An exact identity never embeds an `id@version` selector form. */
export declare function carriesEmbeddedSelector(value: string): boolean;
/**
 * Canonical identity matrix: floating tokens (`latest`/`current`/`active`/
 * `default`/`*`/`x`, case-insensitive after trim) or range/wildcard
 * operators (`^ ~ < > | *`). Applies to identity AND version strings.
 */
export declare function carriesFloatingOrRangeSemantics(value: string): boolean;
/**
 * Canonical version matrix extension: semver x-range/partial versions
 * (`1.x`, `x`, `1.`, `1.X`, any `.`-separated empty or `x` part) are never
 * exact. Validation only — never resolved against anything.
 */
export declare function carriesXRangeVersionSemantics(version: string): boolean;
//# sourceMappingURL=record-safety.d.ts.map