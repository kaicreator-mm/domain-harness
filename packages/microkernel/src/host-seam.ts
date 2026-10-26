/**
 * DomainHarness v0.10.2 T04 (#1324) — the Host bootstrap seam.
 * =====================================================================
 *
 * `./host-seam` is the exact, enumerated API-hygiene boundary for trusted
 * Host bootstrap code (CV-01). It is NOT a protection mechanism: any
 * installed consumer can import it, and authority never rests on it —
 * holding the raw internal facade confers no K permit, no admission and no
 * effect (permits live in K documents and the gate re-reads durable truth,
 * CV-06). The namespace is EXACTLY the frozen L2 §3 allowlist:
 *
 *   - `activateV10App(app, options)` returns the NARROWED `HostActivation`
 *     (`{ facade, dispose(), [Symbol.dispose]() }` — the live counters
 *     object is NOT a field and `HostActivateOptions` has no `counters`
 *     member; the in-repo diagnostic path keeps the internal activation);
 *   - `isV10AppFacade(x)` — the true module-private WeakSet brand;
 *   - `readSelectedShadowBinding(facade)` — the original prototype getter,
 *     captured once at module load;
 *   - `v10SelectedKernelIdentity(facade)` — the loaded selected kernel's
 *     own identity derivations and doc-key/K02-prefix/effect-view protocol;
 *   - `v10DeploymentDocsPrefix(deployment)` — the Host-owned outer prefix;
 *   - types only: `V10AppFacade`, `HostActivation`, `HostActivateOptions`,
 *     `V10SelectedKernelIdentity`.
 *
 * Everything else (the effect gate and its deps, the docs port, the
 * counters factory, the import-hook registry, the facade constructor) is
 * absent and unreachable through any consumer surface.
 */
import { activateV10App as activateInternal } from './internal/activation.js';
import type { V10AppFacade } from './internal/activation.js';

/** The governed Host activation options: no `counters` member (L2 §3). */
export interface HostActivateOptions {
  readonly store: import('@kaicreator/domain-harness-contracts').V10DocStore;
  readonly tenantId?: string;
  readonly deploymentIdentity?: {
    readonly deployedAppId: string;
    readonly tenantId: string;
    readonly appId: string;
  };
  readonly queryAuthority?: import('@kaicreator/domain-harness-contracts').V10QueryAuthority;
  readonly deploymentRoot?: string;
  readonly now?: () => number;
}

/**
 * The NARROWED activation the Host seam returns: exactly `{ facade,
 * dispose(), [Symbol.dispose]() }`. The internal full activation (with the
 * live counters object) stays reachable only through relative source
 * imports inside the repository.
 */
export interface HostActivation {
  readonly facade: V10AppFacade;
  /** Explicit, idempotent cleanup: closes the facade and all import allowances. */
  dispose(): void;
  /** Node >=22.15: permits `using activation = await activateV10App(...)`. */
  [Symbol.dispose](): void;
}

/** Governed activation over the trusted prebuilt App, narrowed for Host bootstrap. */
export async function activateV10App(app: unknown, options: HostActivateOptions): Promise<HostActivation> {
  const activation = await activateInternal(app, options);
  const dispose = (): void => activation.dispose();
  const narrowed: HostActivation = {
    facade: activation.facade,
    dispose,
    [Symbol.dispose]: dispose,
  };
  return Object.freeze(narrowed);
}

export { isV10AppFacade, readSelectedShadowBinding, v10SelectedKernelIdentity, v10DeploymentDocsPrefix } from './internal/activation.js';
export type { V10AppFacade, V10SelectedKernelIdentity } from './internal/activation.js';
