/** v0.10.2 T00 shim: predicates are shared by BUILD and runtime.
 * One identity with `@kaicreator/domain-harness-contracts` in every load
 * context — see errors.ts for the dual-branch resolution rationale.
 */
import { createRequire as contractsCreateRequire } from 'node:module';

declare const require: NodeRequire | undefined;

const contractsSource: typeof import('@kaicreator/domain-harness-contracts') =
  typeof require === 'function'
    ? (require('../../../../contracts/dist/index.js') as typeof import('@kaicreator/domain-harness-contracts'))
    : contractsCreateRequire(import.meta.url)(
        import.meta.resolve('@kaicreator/domain-harness-contracts'),
      );

export const { isObjectRecord, isPlainRecord } = contractsSource;
