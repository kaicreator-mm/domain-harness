/** v0.10.2 T00: canonical identity is owned by contracts.
 * One identity with `@kaicreator/domain-harness-contracts` in every load
 * context. This file is portable v0.2 core (#165): no static Node built-in
 * import is allowed, so the ESM branch obtains `createRequire` dynamically
 * via `process.getBuiltinModule` and resolves the package entry through
 * `import.meta.resolve` (native Node ESM — worktree and packed installs; the
 * require(esm) channel there shares the loader cache with imports). The
 * CJS-transpiled branch covers the root test runner under tsx, where the
 * bare name cannot resolve (the contracts exports map has no require
 * condition; manifests are frozen to T07a/T07b) — it requires the sibling
 * dist file directly. Web-bundler runtimes without `require`/`process` are
 * T07b debt: once the contracts manifest owns a require condition, this
 * collapses to a plain bare re-export.
 */
declare const require: NodeRequire | undefined;

type ContractsModule = typeof import('@kaicreator/domain-harness-contracts');

interface ContractsNodeBuiltins {
  readonly createRequire?: (url: string) => NodeRequire;
  readonly fileURLToPath?: (url: string) => string;
}
const nodeBuiltin = (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }).process
  ?.getBuiltinModule as ((id: 'module' | 'url') => ContractsNodeBuiltins | undefined) | undefined;

const contractsSource: ContractsModule =
  typeof require === 'function'
    ? (require('../../../contracts/dist/index.js') as ContractsModule)
    : (() => {
        const createRequire = nodeBuiltin?.('module')?.createRequire;
        const fileURLToPath = nodeBuiltin?.('url')?.fileURLToPath;
        if (createRequire === undefined || fileURLToPath === undefined) {
          throw new Error(
            'contracts identity re-export needs a Node ESM or bundler-CJS host; a plain bare re-export returns once the contracts manifest owns a require condition (T07b)',
          );
        }
        return createRequire(import.meta.url)(
          fileURLToPath(import.meta.resolve('@kaicreator/domain-harness-contracts')),
        ) as ContractsModule;
      })();

export const {
  IdentityContractError,
  canonicalizeJson,
  canonicalJsonStringify,
  computeCanonicalJsonDigest,
  isContentDigest,
} = contractsSource;
// Type-side of the same identity (the const above is value-only).
export type IdentityContractError = import('@kaicreator/domain-harness-contracts').IdentityContractError;
export type { Sha256Port, ContentDigest, ExactContentIdentity, IdentityContractErrorCode } from '@kaicreator/domain-harness-contracts';
