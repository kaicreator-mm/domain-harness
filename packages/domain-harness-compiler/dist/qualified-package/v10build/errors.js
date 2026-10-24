/** v0.10.2 T00 shim: do not redeclare typed V10 Error classes.
 * One identity with `@kaicreator/domain-harness-contracts` in every load
 * context. Native ESM resolves the package entry via `import.meta.resolve`.
 * The root test runner transpiles this file to CJS under tsx, where the bare
 * name cannot resolve (the contracts exports map has no require condition;
 * manifests are frozen to T07a/T07b), so that path requires the sibling dist
 * file directly. Both forms converge on the same module instance through the
 * ESM cache (require(esm)); collapse to the bare name once T07b owns a
 * require condition.
 */
import { createRequire as contractsCreateRequire } from 'node:module';
const contractsSource = typeof require === 'function'
    ? require('../../../../contracts/dist/index.js')
    : contractsCreateRequire(import.meta.url)(import.meta.resolve('@kaicreator/domain-harness-contracts'));
export const { V10Error, V10BuildError, V10ActivationError, V10ExternalEffectError, V10_ACTIVATION_FAILURE_CODES, } = contractsSource;
