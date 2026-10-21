/**
 * Type-only build gate for the intentionally local compiler Query contract.
 *
 * Importing Host types here (not from the activation/public declarations)
 * lets TypeScript prove exact parity without making packed compiler consumer
 * declarations depend on optional SQLite/better-sqlite3 Host internals.
 * This is intentionally a private module with no public barrel export.
 */
import type { V10MultiBQuerySelector, V10MultiBQueryTarget } from '@kaicreator/domain-harness/v8/host';
import type { V10ScopedQueryTarget, V10ScopedSnapshotQuery } from './activation.js';
type Exact<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? (<T>() => T extends B ? 1 : 2) extends (<T>() => T extends A ? 1 : 2) ? true : false : false;
type RequireTrue<T extends true> = T;
export type _V10TargetParity = RequireTrue<Exact<V10ScopedQueryTarget, V10MultiBQueryTarget>>;
export type _V10SelectorParity = RequireTrue<Exact<V10ScopedSnapshotQuery, V10MultiBQuerySelector>>;
export {};
