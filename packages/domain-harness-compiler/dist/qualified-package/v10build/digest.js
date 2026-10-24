/** v0.10.2 T00: canonical ABI/digest functions have one owner in contracts.
 * K-private legacy key mirrors remain transitional for T04 and are NOT exported by contracts.
 */
export { V10_BUILD_FORMAT, V10_TARGET_PROFILE, V10_RUNTIME_ABI, V10_HOST_ABI, V10_KEXT_ABI, V10_SFEATURE_ABI, V10_IMPORT_POLICY_REVISION, V10_BUNDLER_REVISION, V10_KERNEL_INTENT_KIND, V10_KERNEL_AUTHORITY_CLASS, V10_KERNEL_CALLER_ROLE, V10_ROUTER_PRIORITY, V10_ROUTER_ELIGIBILITY, v10RouterBasisDigest, V10_SELECTED_ROLE_ABI, sha256Hex, canonicalJson, sha256Canonical, } from '@kaicreator/domain-harness-contracts';
export function v10KernelInstanceDocKey(workflowId, instanceKey) {
    return `v08-kernel:wf-instance:${workflowId}:${instanceKey}`;
}
export function v10KernelReceiptArchiveDocKey(turnId) {
    return `v08-kernel:receipt-archive:${turnId}`;
}
