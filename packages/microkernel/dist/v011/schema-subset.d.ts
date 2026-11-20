/**
 * DomainHarness v0.11.0 T03 (#1577) — minimal JSON Schema (draft 2020-12
 * subset) instance validator for runtime ingress enforcement (L2 §7.2.4).
 *
 * The runtime SDK stays minimal (CV-05): no third-party validator, no
 * compilation/AST machinery. Per JSON Schema semantics, keywords outside
 * this subset are ignored (unknown keywords are spec-conformant no-ops);
 * `$ref` resolution is not implemented in 0.11.0 — schemas for runtime
 * validation must be self-contained. Boolean schemas are supported.
 */
export declare function validateJsonSubset(instance: unknown, schema: unknown): boolean;
/** Order-insensitive JSON equality (objects compare by key set recursively). */
export declare function deepJsonEqual(a: unknown, b: unknown): boolean;
