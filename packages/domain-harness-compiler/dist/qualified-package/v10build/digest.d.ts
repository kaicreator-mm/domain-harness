export declare const V10_BUILD_FORMAT: "dh.v10.build/1", V10_TARGET_PROFILE: "node24-esm/1", V10_RUNTIME_ABI: "dh.v10.selected-abi/1", V10_HOST_ABI: "dh.v10.host-abi/1", V10_KEXT_ABI: "dh.v10.k-extension/1", V10_SFEATURE_ABI: "dh.v10.standard-feature/1", V10_IMPORT_POLICY_REVISION: "dh.v10.import-policy/1", V10_BUNDLER_REVISION: "dh.v10.bundler/1", V10_KERNEL_INTENT_KIND: "v08/tc-intent", V10_KERNEL_AUTHORITY_CLASS: "PRODUCTION", V10_KERNEL_CALLER_ROLE: "requester", V10_ROUTER_PRIORITY: 1, V10_ROUTER_ELIGIBILITY: "eligible", v10RouterBasisDigest: typeof import("@kaicreator/domain-harness-contracts").v10RouterBasisDigest, V10_SELECTED_ROLE_ABI: Readonly<{
    readonly 'kernel-primary': "v08-kernel-abi/1";
    readonly 'standard-primary': "v08-standard-sdk-abi/1";
    readonly business: "v08-business-abi/1";
    readonly capability: "v08-capability-abi/1";
    readonly 'kernel-extension': "dh.v10.k-extension/1";
    readonly 'standard-feature': "dh.v10.standard-feature/1";
}>, sha256Hex: typeof import("@kaicreator/domain-harness-contracts").sha256Hex, canonicalJson: typeof import("@kaicreator/domain-harness-contracts").canonicalJson, sha256Canonical: typeof import("@kaicreator/domain-harness-contracts").sha256Canonical;
export type { V10ModuleRole } from '@kaicreator/domain-harness-contracts';
export declare function v10KernelInstanceDocKey(workflowId: string, instanceKey: string): string;
export declare function v10KernelReceiptArchiveDocKey(turnId: string): string;
