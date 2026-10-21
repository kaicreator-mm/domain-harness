/**
 * Compiler-local, type-only cross-package error contract proof.
 * Host/Core cannot extend the Compiler's runtime V10Error class: that
 * would add a circular core -> compiler dependency. Instead its published
 * error values must match the shared structural diagnostic contract.
 */
import type { V10MemoryError, V10MultiBQueryError } from '@kaicreator/domain-harness/v8/host';
import type { V10CodedFailure } from './known-error-codes.js';

type RequireTrue<T extends true> = T;
export type _V10MemoryErrorContract = RequireTrue<V10MemoryError extends V10CodedFailure ? true : false>;
export type _V10QueryErrorContract = RequireTrue<V10MultiBQueryError extends V10CodedFailure ? true : false>;
