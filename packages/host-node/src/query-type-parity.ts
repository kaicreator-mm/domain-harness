/**
 * Type-only build gate for the Host Query contract parity proof
 * (Host-owned since v0.10.2 T03b, #1325).
 *
 * The legacy Compiler-local proof compared the published scoped Query types
 * against the Multi-B selector types of `@kaicreator/domain-harness/v8/host`.
 * Those selector types are now Microkernel-internal (not on the frozen public
 * entry or `./host-seam` allowlist), so this moved proof pins the parity that
 * is actually reachable and drift-prone for Host consumers: the
 * `./host-seam` facade's own query method contract must stay EXACTLY the
 * Contracts-published selector/answer/target types — the Microkernel may not
 * quietly narrow or widen one side. Intentionally not re-exported from the
 * package index.
 */
import type {
  V10ScopedQueryTarget,
  V10ScopedSnapshotAnswer,
  V10ScopedSnapshotQuery,
} from '@kaicreator/domain-harness-contracts';
import type { V10AppFacade } from '@kaicreator/domain-harness-microkernel/host-seam';

type Exact<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2)
    ? (<T>() => T extends B ? 1 : 2) extends (<T>() => T extends A ? 1 : 2)
      ? true : false
    : false;
type RequireTrue<T extends true> = T;

// Build breaks if the seam facade's selector contract drifts from the
// Contracts-published query selector type.
export type _V10SelectorParity = RequireTrue<
  Exact<Parameters<V10AppFacade['queryScopedSnapshot']>[0], V10ScopedSnapshotQuery>
>;
// Build breaks if the seam facade's answer contract drifts from the
// Contracts-published scoped snapshot answer type.
export type _V10AnswerParity = RequireTrue<
  Exact<Awaited<ReturnType<V10AppFacade['queryScopedSnapshot']>>, V10ScopedSnapshotAnswer>
>;
// Build breaks if the answer's authorized target drifts from the
// Contracts-published scoped query target type.
export type _V10TargetParity = RequireTrue<
  Exact<Awaited<ReturnType<V10AppFacade['queryScopedSnapshot']>>['target'], V10ScopedQueryTarget>
>;
