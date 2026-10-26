/**
 * Private process-wide import resolution for sealed data: modules.
 * [v0.10.2 T04] canonical owner moved from the legacy compiler v10build tree
 * (the legacy file stays as LEGACY_COMPAT_ONLY); imports now target Contracts.
 * Each allowance carries its original activation module URL to preserve
 * default installed dependency resolution when deploymentRoot is absent.
 * Not an untrusted-code sandbox; caller MUST dispose the returned closure.
 */
import { registerHooks } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { V10ActivationError, isPlainRecord } from '@kaicreator/domain-harness-contracts';
import type { V10AppView } from '@kaicreator/domain-harness-contracts';

export function privateModuleFragment(activationNonce: string, packageId: string): string {
  return `#v10-${activationNonce}-${encodeURIComponent(packageId)}`;
}


// ---------------------------------------------------------------------------
// Declared bare-import resolution for sealed npm/native allowances.
//
// A sealed module imported through a `data:` URL has no package hierarchy,
// so a bare npm/native specifier inside it cannot resolve through the
// default resolver (`ERR_UNSUPPORTED_RESOLVE_REQUEST`). BUILD seals each
// module's declared npm/native allowance statically; this activation side
// honors exactly that allowance with ONE process-wide synchronous resolve
// hook (`node:module registerHooks`, Node >= 22.15): when the parent URL is
// a `data:` module this activation minted AND the specifier is in THAT
// module's sealed allowance, the specifier resolves against the deployment
// context's actually installed packages and short-circuits; every other
// request falls through to the default resolver, which fail-closed refuses
// it. Sealed bytes are never rewritten — hooking resolve is the only
// intervention. The hook is reference-counted across concurrent activations
// and deregistered when the last one closes; a runtime without the hook
// refuses allowances-bearing activations typed instead of silently dropping
// their declared resolution context.
// ---------------------------------------------------------------------------

type ModuleHooksHandle = ReturnType<typeof registerHooks>;

interface DeclaredBareImportAllowance {
  readonly specifiers: ReadonlySet<string>;
  readonly deploymentRoot: string | undefined;
  readonly activationModuleUrl: string;
}

/**
 * A separate, injectable registry is exposed only by this INTERNAL module
 * for deterministic hook tests. Every registry owns independent allowances,
 * refcounts and deregistration. The production registry is never reset by
 * tests, and the public compiler barrels do not export this symbol.
 */
export interface V10ImportHookRegistry {
  registerDeclaredBareImports(deps: {
    activationModuleUrl: string;
    activationNonce: string;
    appView: V10AppView;
    deploymentRoot: string | undefined;
  }): () => void;
  snapshot(): Readonly<{ users: number; allowances: number; registered: boolean }>;
}

function createImportHookRegistry(registerHook: typeof registerHooks): V10ImportHookRegistry {
/** Minted parent-URL fragment -> the declared bare specifiers it may resolve. */
const declaredBareImportAllowances = new Map<string, DeclaredBareImportAllowance>();
let importHookHandle: ModuleHooksHandle | null = null;
let importHookUsers = 0;

/** The default deployment anchor: this activation module's own resolution context. */
// Activation URL is supplied from the original activation module, never this helper.

function ensureImportResolveHook(): ModuleHooksHandle | null {
  if (typeof registerHook !== 'function') return null;
  if (importHookHandle === null) {
    importHookHandle = registerHook({
      resolve(specifier, context, nextResolve) {
        const parentURL = context.parentURL;
        // The fragment carries this machinery's per-activation nonce; the
        // keyed lookup is the authority (a foreign URL is never keyed).
        if (typeof parentURL === 'string' && parentURL.startsWith('data:text/javascript;base64,') && parentURL.includes('#v10-')) {
          const allowance = declaredBareImportAllowances.get(parentURL.slice(parentURL.indexOf('#')));
          if (allowance !== undefined && allowance.specifiers.has(specifier)) {
            // Resolve through the REAL default ESM resolver against a
            // synthetic file: parent inside the deployment context (the
            // legitimately deployed node_modules lookup), instead of the
            // hierarchy-less data: parent. Everything unsealed keeps going
            // to the next resolver, which refuses bare specifiers from a
            // data: parent — the fail-closed default.
            const anchorParentURL = allowance.deploymentRoot === undefined
              ? allowance.activationModuleUrl
              : pathToFileURL(join(allowance.deploymentRoot, 'package.json')).href;
            return nextResolve(specifier, { parentURL: anchorParentURL });
          }
        }
        return nextResolve(specifier, context);
      },
    });
  }
  importHookUsers += 1;
  return importHookHandle;
}

function releaseImportResolveHook(): void {
  importHookUsers -= 1;
  if (importHookUsers === 0 && importHookHandle !== null) {
    importHookHandle.deregister();
    importHookHandle = null;
  }
}

/** The npm/native specifiers a consumed module record declares (defensive plain-data read). */
function declaredBareImportsOf(module: V10AppView['modules'][number]): readonly string[] {
  const external = (module as { externalImports?: unknown }).externalImports;
  if (!isPlainRecord(external)) return [];
  const declared: string[] = [];
  for (const kind of ['npm', 'native'] as const) {
    const list = external[kind];
    if (Array.isArray(list)) {
      for (const item of list) {
        if (typeof item === 'string' && item.length > 0) declared.push(item);
      }
    }
  }
  return declared;
}

/**
 * Honor the consumed record's declared npm/native allowances for the `data:`
 * URLs this activation is about to import. Returns the release closure that
 * unregisters the allowances (and the process hook when this was its last
 * user). Refuses typed when the runtime cannot host the resolve hook.
 */
function registerDeclaredBareImports(deps: {
  activationModuleUrl: string;
  activationNonce: string;
  appView: V10AppView;
  deploymentRoot: string | undefined;
}): () => void {
  const mintedFragments: string[] = [];
  let hasDeclaredBareImports = false;
  for (const module of deps.appView.modules) {
    if (typeof module.moduleSource !== 'string' || module.moduleSource.length === 0) continue;
    const declared = declaredBareImportsOf(module);
    const fragment = privateModuleFragment(deps.activationNonce, module.packageId);
    mintedFragments.push(fragment);
    if (declared.length > 0) {
      declaredBareImportAllowances.set(fragment, { specifiers: new Set(declared), deploymentRoot: deps.deploymentRoot, activationModuleUrl: deps.activationModuleUrl });
      hasDeclaredBareImports = true;
    }
  }
  if (!hasDeclaredBareImports) return () => {};
  let handle: ModuleHooksHandle | null;
  try {
    handle = ensureImportResolveHook();
  } catch (error) {
    // An experimental Node registerHooks failure must never leave a stale
    // allowance in the process-global map.
    for (const fragment of mintedFragments) declaredBareImportAllowances.delete(fragment);
    throw error;
  }
  if (handle === null) {
    for (const fragment of mintedFragments) declaredBareImportAllowances.delete(fragment);
    throw new V10ActivationError(
      'V10_IMPORT_HOOK_UNAVAILABLE',
      'this Node runtime lacks the node:module registerHooks resolve seam; an App declaring npm/native external imports refuses fail-closed instead of importing without its declared resolution context',
    );
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const fragment of mintedFragments) declaredBareImportAllowances.delete(fragment);
    releaseImportResolveHook();
  };
}

  return {
    registerDeclaredBareImports,
    snapshot: () => Object.freeze({
      users: importHookUsers,
      allowances: declaredBareImportAllowances.size,
      registered: importHookHandle !== null,
    }),
  };
}

/** Test-only: injected registries never mutate production registration state. */
export function createV10ImportHookRegistryForTests(registerHook: typeof registerHooks): V10ImportHookRegistry {
  return createImportHookRegistry(registerHook);
}

const productionImportHookRegistry = createImportHookRegistry(registerHooks);

/** The single process-scoped production import registry. */
export function registerDeclaredBareImports(
  deps: Parameters<V10ImportHookRegistry['registerDeclaredBareImports']>[0],
): () => void {
  return productionImportHookRegistry.registerDeclaredBareImports(deps);
}
