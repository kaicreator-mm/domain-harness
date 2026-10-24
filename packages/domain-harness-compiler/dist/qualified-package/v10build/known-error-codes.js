/** v0.10.2 T00 shim: one canonical error code catalog.
 * One identity with `@kaicreator/domain-harness-contracts` in every load
 * context — see errors.ts for the dual-branch resolution rationale.
 */
import { createRequire as contractsCreateRequire } from 'node:module';
import { fileURLToPath as contractsFileURLToPath } from 'node:url';
const contractsSource = (typeof require === 'function'
    ? require('../../../../contracts/dist/index.js')
    : contractsCreateRequire(import.meta.url)(contractsFileURLToPath(import.meta.resolve('@kaicreator/domain-harness-contracts'))));
export const { V10_KNOWN_ERROR_CODES } = contractsSource;
