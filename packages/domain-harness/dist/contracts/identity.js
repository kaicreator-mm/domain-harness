/** v0.10.2 T00: canonical identity is owned by contracts.
 * One identity with `@kaicreator/domain-harness-contracts` in every load
 * context. Native ESM resolves the package entry via `import.meta.resolve`;
 * the CJS-transpiled root test runner requires the sibling dist file (the
 * contracts exports map has no require condition; manifests are frozen to
 * T07a/T07b). Both forms converge on the same module instance through the
 * ESM cache (require(esm)).
 */
import { createRequire as contractsCreateRequire } from 'node:module';
const contractsSource = typeof require === 'function'
    ? require('../../../contracts/dist/index.js')
    : contractsCreateRequire(import.meta.url)(import.meta.resolve('@kaicreator/domain-harness-contracts'));
export const { IdentityContractError, canonicalizeJson, canonicalJsonStringify, computeCanonicalJsonDigest, isContentDigest, } = contractsSource;
//# sourceMappingURL=identity.js.map