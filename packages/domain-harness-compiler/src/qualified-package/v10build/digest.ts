/** v0.10.2 T00: canonical ABI/digest functions have one owner in contracts.
 * K-private legacy key mirrors remain transitional for T04 and are NOT exported by contracts.
 * One identity with `@kaicreator/domain-harness-contracts` in every load
 * context (native ESM via `import.meta.resolve`; CJS-transpiled root test
 * runner via the sibling dist file — the contracts exports map has no
 * require condition and manifests are frozen to T07a/T07b). Both forms
 * converge on the same module instance through the ESM cache (require(esm)).
 */
import { createRequire as contractsCreateRequire } from 'node:module';
import { fileURLToPath as contractsFileURLToPath } from 'node:url';

declare const require: NodeRequire | undefined;

const contractsSource = (
  typeof require === 'function'
    ? require('../../../../contracts/dist/index.js')
    : contractsCreateRequire(import.meta.url)(
        contractsFileURLToPath(import.meta.resolve('@kaicreator/domain-harness-contracts')),
      )
) as typeof import('@kaicreator/domain-harness-contracts');

export const {
  V10_BUILD_FORMAT,
  V10_TARGET_PROFILE,
  V10_RUNTIME_ABI,
  V10_HOST_ABI,
  V10_KEXT_ABI,
  V10_SFEATURE_ABI,
  V10_IMPORT_POLICY_REVISION,
  V10_BUNDLER_REVISION,
  V10_KERNEL_INTENT_KIND,
  V10_KERNEL_AUTHORITY_CLASS,
  V10_KERNEL_CALLER_ROLE,
  V10_ROUTER_PRIORITY,
  V10_ROUTER_ELIGIBILITY,
  v10RouterBasisDigest,
  V10_SELECTED_ROLE_ABI,
  sha256Hex,
  canonicalJson,
  sha256Canonical,
} = contractsSource;
export type { V10ModuleRole } from '@kaicreator/domain-harness-contracts';

export function v10KernelInstanceDocKey(workflowId: string, instanceKey: string): string {
  return `v08-kernel:wf-instance:${workflowId}:${instanceKey}`;
}
export function v10KernelReceiptArchiveDocKey(turnId: string): string {
  return `v08-kernel:receipt-archive:${turnId}`;
}
