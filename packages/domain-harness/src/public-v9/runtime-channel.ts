/**
 * v0.9 published DomainHarness.load(installedRef) dispatch boundary.
 *
 * Only a TRUSTED deployment/Host bootstrap may compose and attach an
 * internally authorized H→K bridge. The normal ./v9 public SDK exports
 * DomainHarness (exactly one-argument load), never this registrar or any
 * Host, verifier, store, governance control or module namespace.
 *
 * Having no protected Host installed is a uniform D04 refusal; a valid
 * looking reference is not proof of installation or issuer approval.
 * The selected bridge itself rechecks physical store/current approval,
 * caller scope, and per-effect permits on every relevant operation.
 *
 * This process-local routing registry contains no credentials or protected
 * ports. Its members are the **existing** selected bridge's public facades.
 * Trusted bridge close detaches its routing entry, not an already committed
 * physical effect (which remains Kernel/Journal authority).
 */
import { DomainHarnessV9Error, V9_PUBLIC_ERROR_CODES } from './errors.js';
import type { V9DomainFacade, V9DomainHarness } from './contracts.js';

const trustedBridges = new Set<V9DomainHarness>();

/**
 * TRUSTED INTERNAL ENTRY — never export from ./v9 or package root.
 * Called only by createV09DomainHarnessBridge after its bootstrap checks.
 */
export function attachV09TrustedBridge(harness: V9DomainHarness): () => void {
  if (harness === null || typeof harness !== 'object'
    || typeof harness.load !== 'function') {
    throw new DomainHarnessV9Error(V9_PUBLIC_ERROR_CODES.LIFECYCLE_FAILED);
  }
  trustedBridges.add(harness);
  let attached = true;
  return (): void => {
    if (!attached) return;
    attached = false;
    trustedBridges.delete(harness);
  };
}

/** Exactly one public verb. No public registration or permission capability. */
export const DomainHarness: V9DomainHarness = Object.freeze({
  async load(installedRef: string): Promise<V9DomainFacade> {
    // Reject anything other than one installed-reference string before
    // touching any Host. No caller-supplied raw sealed root or config object.
    if (arguments.length !== 1 || typeof installedRef !== 'string' || installedRef.length === 0) {
      throw new DomainHarnessV9Error(V9_PUBLIC_ERROR_CODES.PACKAGE_NOT_AUTHORIZED);
    }
    // Each attached H independently verifies the opaque ref and current
    // audience/issuer/bytes. A foreign/unknown ref is indistinguishable from
    // an unconfigured Host to the caller (D04).
    for (const trusted of trustedBridges) {
      try {
        return await trusted.load(installedRef);
      } catch (error) {
        // The only reason to try the next trusted Host is that this Host
        // does not recognize/authorize that reference. Never downgrade an
        // authorized Host's other refusal (scope/ABI/lifecycle) into a
        // successful dispatch on another Host.
        if (!(error instanceof DomainHarnessV9Error)
          || error.code !== V9_PUBLIC_ERROR_CODES.PACKAGE_NOT_AUTHORIZED) throw error;
      }
    }
    throw new DomainHarnessV9Error(V9_PUBLIC_ERROR_CODES.PACKAGE_NOT_AUTHORIZED);
  },
});
