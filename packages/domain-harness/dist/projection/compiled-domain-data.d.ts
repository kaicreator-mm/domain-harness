import type { JsonValue } from '../contracts/json.js';
/** Evaluator-visible compiled Domain Data entry: the immutable JSON value compiled into the package under `key`. */
export interface CompiledDomainDataValue {
    key: string;
    value: JsonValue;
}
/**
 * Read-only lookup of the compiled Domain Data embedded in a Target Compiled
 * Domain Package. Compiled Domain Data is immutable package content whose
 * identity is pinned by packageId: implementations must be pure in-memory
 * lookups over the generated package module and must not perform I/O, mutate
 * content, or expose anything beyond the compiled JSON value.
 */
export interface CompiledDomainDataPort {
    get(packageId: string, key: string): JsonValue | undefined;
}
//# sourceMappingURL=compiled-domain-data.d.ts.map