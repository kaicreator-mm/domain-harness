import type { V9DomainHarness } from './contracts.js';
/**
 * TRUSTED INTERNAL REGISTRATION — never re-exported from the published SDK.
 * A same-shape object cannot bind itself: only the actual #1036 selected
 * H→K bridge module can mint the module-private WeakSet brand.
 */
export declare function attachV09TrustedBridge(harness: V9DomainHarness): () => void;
/**
 * TRUSTED Host dispatch-only wrapper. Public clients cannot select the Host,
 * inject a presentation or create an AsyncLocalStorage caller scope through
 * DomainHarness.load. The privileged bootstrap must enter its own context
 * after it has authenticated the ambient caller/presentation.
 */
export declare function runV09InTrustedHostScope<T>(harness: V9DomainHarness, action: () => T | Promise<T>): Promise<T>;
/** Exactly one public verb: select ONLY the Host bound to this request. */
export declare const DomainHarness: V9DomainHarness;
//# sourceMappingURL=runtime-channel.d.ts.map