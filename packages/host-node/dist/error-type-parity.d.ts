/**
 * Cross-package error contract proof, Host-owned since v0.10.2 T03b (#1325).
 * The Host memory error and the Microkernel query error are local siblings
 * over the shared Contracts diagnostic contract: their published error
 * values must match `V10CodedFailure` structurally, without any runtime
 * dependency between the two owners.
 */
import type { V10CodedFailure } from '@kaicreator/domain-harness-contracts';
import type { V10MultiBQueryError } from '@kaicreator/domain-harness-microkernel';
import type { V10MemoryError } from './scoped-memory.js';
type RequireTrue<T extends true> = T;
export type _V10MemoryErrorContract = RequireTrue<V10MemoryError extends V10CodedFailure ? true : false>;
export type _V10QueryErrorContract = RequireTrue<V10MultiBQueryError extends V10CodedFailure ? true : false>;
export {};
