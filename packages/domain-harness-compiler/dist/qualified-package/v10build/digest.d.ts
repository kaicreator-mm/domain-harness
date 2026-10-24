/** v0.10.2 T00: canonical ABI and digest identities are owned by Contracts.
 * A2/T07a3 exposes one ESM singleton for import and require on Node24.
 * K-private document key mirrors remain transitional for T04 only.
 */
export { V10_BUILD_FORMAT, V10_TARGET_PROFILE, V10_RUNTIME_ABI, V10_HOST_ABI, V10_KEXT_ABI, V10_SFEATURE_ABI, V10_IMPORT_POLICY_REVISION, V10_BUNDLER_REVISION, V10_KERNEL_INTENT_KIND, V10_KERNEL_AUTHORITY_CLASS, V10_KERNEL_CALLER_ROLE, V10_ROUTER_PRIORITY, V10_ROUTER_ELIGIBILITY, v10RouterBasisDigest, V10_SELECTED_ROLE_ABI, sha256Hex, canonicalJson, sha256Canonical, } from '@kaicreator/domain-harness-contracts';
export type { V10ModuleRole } from '@kaicreator/domain-harness-contracts';
export declare function v10KernelInstanceDocKey(workflowId: string, instanceKey: string): string;
export declare function v10KernelReceiptArchiveDocKey(turnId: string): string;
