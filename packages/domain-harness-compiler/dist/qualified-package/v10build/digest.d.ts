export declare const V10_BUILD_FORMAT: "dh.v10.build/1";
export declare const V10_TARGET_PROFILE: "node24-esm/1";
export declare const V10_RUNTIME_ABI: "dh.v10.selected-abi/1";
export declare const V10_HOST_ABI: "dh.v10.host-abi/1";
export declare const V10_KEXT_ABI: "dh.v10.k-extension/1";
export declare const V10_SFEATURE_ABI: "dh.v10.standard-feature/1";
export declare const V10_IMPORT_POLICY_REVISION: "dh.v10.import-policy/1";
export declare const V10_BUNDLER_REVISION: "dh.v10.bundler/1";
/**
 * [v0.10 #1264] The CLOSED advisory hook set of the selected v0.10 Kernel
 * Primary (PC-03/L2 §C). It mirrors — byte-for-byte, in the Kernel's own
 * sealed order — the `ADVISORY_HOOKS` export of the selected kernel payload
 * (`payload/kernel-mechanism-v1.mjs`); a parity test pins the two together.
 * BUILD (PC-05) rejects a kernel-extension whose single `provides` hook key
 * is outside this set BEFORE any module executes; the Kernel itself refuses
 * unknown hook keys again at its own trusted wiring boundary. The Primary
 * invokes and revalidates these hooks at turn time; extension advice can
 * only tighten the Kernel's own hard limits and never carries authority.
 */
export declare const V10_KERNEL_ADVISORY_HOOKS: readonly string[];
/**
 * Kernel/Standard Router adapter literals selected by this v0.10 ABI.
 * These historical v08 field values are wire-contract pins, NOT reasons
 * to rename frozen implementation directories.
 */
export declare const V10_KERNEL_INTENT_KIND: "v08/tc-intent";
export declare const V10_KERNEL_AUTHORITY_CLASS: "PRODUCTION";
export declare const V10_KERNEL_CALLER_ROLE: "requester";
export declare const V10_ROUTER_PRIORITY: 1;
export declare const V10_ROUTER_ELIGIBILITY: "eligible";
export declare function v10RouterBasisDigest(subjectDigest: string): string;
/**
 * The selected kernel's legacy (host-prefixed) durable doc keys that hold
 * the same-CAS original admission receipt. They mirror the kernel's own
 * `legacyKernelDocKeys().instance` / `.receiptArchive` builders, which the
 * sealed payload does not export; the governed reservation witness test
 * (RES4) is the drift fence for these two literals.
 */
export declare function v10KernelInstanceDocKey(workflowId: string, instanceKey: string): string;
export declare function v10KernelReceiptArchiveDocKey(turnId: string): string;
/** Selected per-role ABI rows of the v0.10 Node24 profile. */
export declare const V10_SELECTED_ROLE_ABI: Readonly<{
    readonly 'kernel-primary': "v08-kernel-abi/1";
    readonly 'standard-primary': "v08-standard-sdk-abi/1";
    readonly business: "v08-business-abi/1";
    readonly capability: "v08-capability-abi/1";
    readonly 'kernel-extension': "dh.v10.k-extension/1";
    readonly 'standard-feature': "dh.v10.standard-feature/1";
}>;
export type V10ModuleRole = keyof typeof V10_SELECTED_ROLE_ABI;
export declare function sha256Hex(value: string): string;
/** Deterministic canonical JSON (sorted plain-data keys; cycles refuse). */
export declare function canonicalJson(value: unknown): string;
export declare function sha256Canonical(value: unknown): string;
