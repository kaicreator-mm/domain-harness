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
import type { JsonValue } from '@kaicreator/domain-harness-contracts/v011';
export declare function validateJsonSubset(instance: unknown, schema: unknown): boolean;
/**
 * Strict plain-JSON value guard: only null, booleans, finite numbers,
 * strings, plain arrays and plain objects (Object.prototype or a null
 * prototype, the two shapes JSON.parse can produce). Date, Map, Set,
 * class instances and primitive wrappers are refused — they are not JSON
 * values and must never cross the FunctionOutcome boundary.
 */
export declare function isPlainJsonValue(value: unknown): value is JsonValue;
/** Order-insensitive JSON equality (objects compare by key set recursively). */
export declare function deepJsonEqual(a: unknown, b: unknown): boolean;
