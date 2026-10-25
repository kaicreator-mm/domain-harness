/**
 * v0.10.2 T11 — one module world for the CJS-transpiled root tests.
 *
 * Root test files run CJS-transpiled under `tsx` (the root manifest has no
 * `type: module` and the runner script is frozen to T07b). The canonical
 * Host package (`@kaicreator/domain-harness-host-node`) and its nested
 * `@kaicreator/domain-harness-microkernel/host-seam` imports ship no
 * `require` condition in their export maps (manifests frozen to T07a/T07b),
 * so a plain transpiled `require` of those specifiers fails resolution, and
 * a dynamic ESM import would load a SECOND module instance — splitting the
 * typed-error class identities and the `isV10AppFacade` WeakSet brand across
 * two module worlds inside one test process.
 *
 * Importing this module FIRST (CJS require order is statement order) keeps
 * every later package-name resolution inside the one tsx-transpiled world by
 * redirecting the two name-only subpaths to the repository sources — the
 * same sources the sibling relative imports already load, so identity stays
 * single: the `host-seam` module and `microkernel/src/internal/activation`
 * share one instance across test and package code.
 */
import { registerHooks } from 'node:module';

const SEAM_SOURCE = new URL('../../packages/microkernel/src/host-seam.ts', import.meta.url).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@kaicreator/domain-harness-microkernel/host-seam') {
      return { url: SEAM_SOURCE, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
