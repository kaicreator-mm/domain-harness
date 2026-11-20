/**
 * DomainHarness v0.11.0 T04 (#1578) — the ONE canonical public SDK entry
 * (`@kaicreator/domain-harness`, package root `.`, L2 §8.3 ruling).
 *
 * This facade is a pure composition root: it re-exports the actual frozen
 * contracts (`@kaicreator/domain-harness-contracts/v011`), the canonical
 * BUILD (`@kaicreator/domain-harness-build`, `buildV011App`), and the
 * Boot/KDP/DomainApp runtime (`@kaicreator/domain-harness-microkernel`).
 * It adds NO second Runtime/Kernel/BUILD, NO second App Init, NO Router, NO
 * workflow, NO schema authority and NO Function dispatcher — App Init,
 * ingress selection, outcome normalization and dispatch remain solely in
 * the locked microkernel runtime (PRD AR-12/D01, L2 §8.1/§8.3).
 *
 * Legacy v0.10.x surfaces remain reachable from the workspace through the
 * explicit `./legacy` subpath only; the packed tarball excludes the legacy
 * dist, so the old executable App ABI is unreachable from the published
 * artifact (L2 §8.3 fenced legacy map).
 */
export * from '@kaicreator/domain-harness-contracts/v011';
export {
  buildV011App,
  V011BuildRefusal,
  digestOfBytes,
} from '@kaicreator/domain-harness-build';
export type {
  V011BuildInput,
  V011BuildResult,
  V011BuildSuccess,
  V011BuildFailure,
  V011KdpArtifactInput,
} from '@kaicreator/domain-harness-build';
export { boot, bootstrap } from '@kaicreator/domain-harness-microkernel';
