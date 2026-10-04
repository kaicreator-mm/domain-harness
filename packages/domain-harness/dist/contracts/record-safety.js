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
/**
 * Human-readable, getter-safe reason for a descriptor-safety issue. Only
 * descriptor metadata (violation kind + own key names) participates — no
 * property VALUE is ever read for diagnostics, so a hidden accessor cannot
 * execute as part of failure reporting.
 */
export function describeRecordSafetyIssue(issue) {
    switch (issue.violation) {
        case 'NOT_A_RECORD':
            return 'must be an object record';
        case 'NOT_AN_ARRAY':
            return 'must be an array';
        case 'EXOTIC_PROTOTYPE':
            return 'must be an ordinary or null-prototype record (class/exotic prototypes are not contract input)';
        case 'SYMBOL_KEYED_PROPERTY':
            return issue.key === undefined
                ? 'must not carry symbol-keyed properties (hidden properties are not contract input)'
                : `must not carry symbol-keyed property ${issue.key} (hidden properties are not contract input)`;
        case 'NON_ENUMERABLE_PROPERTY':
            return `must not carry non-enumerable property "${issue.key}" (hidden properties are not contract input)`;
        case 'ACCESSOR_PROPERTY':
            return `must not use accessor property "${issue.key}"; contract fields must be own enumerable data properties`;
        case 'SPARSE_ARRAY':
            return `must not carry sparse/hole entries (entry ${issue.key} is missing)`;
        case 'EXTRA_ARRAY_PROPERTY':
            return `must not carry extra property "${issue.key}" (arrays carry indexed entries only)`;
    }
}
function symbolIssue(symbols) {
    return symbols.length > 0
        ? { violation: 'SYMBOL_KEYED_PROPERTY', key: String(symbols[0]) }
        : { violation: 'SYMBOL_KEYED_PROPERTY' };
}
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
export function safeRecordSnapshot(value, path) {
    void path; // path stays a caller-side concern; issues carry violation metadata only
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return { ok: false, issue: { violation: 'NOT_A_RECORD' } };
    }
    const symbols = Object.getOwnPropertySymbols(value);
    if (symbols.length > 0) {
        return { ok: false, issue: symbolIssue(symbols) };
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
        return { ok: false, issue: { violation: 'EXOTIC_PROTOTYPE' } };
    }
    const snapshot = {};
    for (const key of Object.getOwnPropertyNames(value)) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (descriptor === undefined)
            continue; // cannot happen for own names; defensive
        if (!descriptor.enumerable) {
            return { ok: false, issue: { violation: 'NON_ENUMERABLE_PROPERTY', key } };
        }
        if (!('value' in descriptor)) {
            return { ok: false, issue: { violation: 'ACCESSOR_PROPERTY', key } };
        }
        snapshot[key] = descriptor.value;
    }
    return { ok: true, snapshot };
}
/**
 * Descriptor-safe snapshot of one contract array (indexed entries only).
 *
 * On success returns a fresh dense array holding exactly the caller array's
 * entries (shallow copy). Rejects non-arrays, exotic prototypes, symbol keys,
 * accessor/sparse/extra entries — mirroring the array discipline of the
 * hardened canonical-JSON seam (`identity.ts`). The caller array is never
 * frozen or mutated.
 */
export function safeArraySnapshot(value, path) {
    void path;
    if (!Array.isArray(value)) {
        return { ok: false, issue: { violation: 'NOT_AN_ARRAY' } };
    }
    const symbols = Object.getOwnPropertySymbols(value);
    if (symbols.length > 0) {
        return { ok: false, issue: symbolIssue(symbols) };
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Array.prototype && prototype !== null) {
        return { ok: false, issue: { violation: 'EXOTIC_PROTOTYPE' } };
    }
    const length = value.length;
    const snapshot = new Array(length);
    for (let index = 0; index < length; index += 1) {
        const key = String(index);
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (descriptor === undefined) {
            return { ok: false, issue: { violation: 'SPARSE_ARRAY', key } };
        }
        if (!descriptor.enumerable) {
            return { ok: false, issue: { violation: 'NON_ENUMERABLE_PROPERTY', key } };
        }
        if (!('value' in descriptor)) {
            return { ok: false, issue: { violation: 'ACCESSOR_PROPERTY', key } };
        }
        snapshot[index] = descriptor.value;
    }
    for (const key of Object.getOwnPropertyNames(value)) {
        if (key === 'length')
            continue;
        if (!/^(0|[1-9]\d*)$/.test(key)) {
            return { ok: false, issue: { violation: 'EXTRA_ARRAY_PROPERTY', key } };
        }
        const index = Number(key);
        if (!Number.isSafeInteger(index) || index < 0 || index >= length) {
            return { ok: false, issue: { violation: 'EXTRA_ARRAY_PROPERTY', key } };
        }
    }
    return { ok: true, snapshot };
}
// ---------------------------------------------------------------------------
// Unified exact-reference authority (#557) — predicates only, no throwing, no
// normalization, no semver/range resolution.
// ---------------------------------------------------------------------------
/** Floating selection tokens never occur in an exact identity string. */
const FLOATING_SELECTOR_TOKENS = new Set(['latest', 'current', 'active', 'default', '*', 'x']);
/** Range/wildcard operators never occur in an exact identity string. */
const FLOATING_SELECTOR_PATTERN = /[\^~<>|*]/;
/** Exact-identity precondition: a string that is non-empty after trimming. */
export function isNonEmptyIdentityString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}
/** An exact identity never embeds an `id@version` selector form. */
export function carriesEmbeddedSelector(value) {
    return value.includes('@');
}
/**
 * Canonical identity matrix: floating tokens (`latest`/`current`/`active`/
 * `default`/`*`/`x`, case-insensitive after trim) or range/wildcard
 * operators (`^ ~ < > | *`). Applies to identity AND version strings.
 */
export function carriesFloatingOrRangeSemantics(value) {
    return (FLOATING_SELECTOR_TOKENS.has(value.trim().toLowerCase()) ||
        FLOATING_SELECTOR_PATTERN.test(value));
}
/**
 * Canonical version matrix extension: semver x-range/partial versions
 * (`1.x`, `x`, `1.`, `1.X`, any `.`-separated empty or `x` part) are never
 * exact. Validation only — never resolved against anything.
 */
export function carriesXRangeVersionSemantics(version) {
    return version
        .trim()
        .split('.')
        .some((part) => part.length === 0 || part.toLowerCase() === 'x');
}
//# sourceMappingURL=record-safety.js.map