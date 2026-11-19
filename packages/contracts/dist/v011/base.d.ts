/**
 * DomainHarness v0.11.0 T01 (#1575) — L201 base value domains (L2 §2.2).
 *
 * `ContentDigest` is the frozen wire form `sha256:<64 lowercase hex>`;
 * the lowercase-hex constraint is enforced by the v011 validators
 * (schema layer) and by BUILD byte checks (T02), not by the string type.
 */
export type SemVer = `${number}.${number}.${number}`;
export type ContentDigest = `sha256:${string}`;
/** JSON value domain for inline content, applicability predicates and constraints. */
export type JsonValue = null | boolean | number | string | JsonValue[] | {
    [k: string]: JsonValue;
};
