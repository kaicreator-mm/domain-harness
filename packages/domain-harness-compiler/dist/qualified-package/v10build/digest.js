/**
 * DomainHarness v0.10 T00 (#1166) — BUILD format/profile constants and the
 * canonical subject digest of one composed Domain App.
 *
 * The digest binds the composition ROSTER (identities, digests, roles,
 * bindings, allowances) — never raw module bytes; bytes are bound through
 * each entry's `moduleSha256`, which the BUILD verifies against the actual
 * bytes once, statically, before anything is sealed. Digest input is
 * canonical JSON over sorted plain-data keys, so one composition input has
 * exactly one digest on every platform (determinism is a BUILD product).
 *
 * The per-role ABI table below is the SELECTED compatibility table of the
 * v0.10 Node24 profile at this base: the real payload ABIs of the selected
 * kernel/standard/business/capability implementations plus the two v0.10
 * advisory module ABIs (K extension, S feature). BUILD refuses any entry
 * whose declared ABI is not its role's selected row (A01-PC08 "wrong
 * version" is a BUILD failure, not a runtime discovery).
 */
import { createHash } from 'node:crypto';
export const V10_BUILD_FORMAT = 'dh.v10.build/1';
export const V10_TARGET_PROFILE = 'node24-esm/1';
export const V10_RUNTIME_ABI = 'dh.v10.selected-abi/1';
export const V10_HOST_ABI = 'dh.v10.host-abi/1';
export const V10_KEXT_ABI = 'dh.v10.k-extension/1';
export const V10_SFEATURE_ABI = 'dh.v10.standard-feature/1';
export const V10_IMPORT_POLICY_REVISION = 'dh.v10.import-policy/1';
export const V10_BUNDLER_REVISION = 'dh.v10.bundler/1';
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
export const V10_KERNEL_ADVISORY_HOOKS = Object.freeze([
    'admission-budget-advice/v1',
    'turn-observation/v1',
]);
/**
 * Kernel/Standard Router adapter literals selected by this v0.10 ABI.
 * These historical v08 field values are wire-contract pins, NOT reasons
 * to rename frozen implementation directories.
 */
export const V10_KERNEL_INTENT_KIND = 'v08/tc-intent';
export const V10_KERNEL_AUTHORITY_CLASS = 'PRODUCTION';
export const V10_KERNEL_CALLER_ROLE = 'requester';
export const V10_ROUTER_PRIORITY = 1;
export const V10_ROUTER_ELIGIBILITY = 'eligible';
export function v10RouterBasisDigest(subjectDigest) {
    return `sha256:${subjectDigest}`;
}
/**
 * The selected kernel's legacy (host-prefixed) durable doc keys that hold
 * the same-CAS original admission receipt. They mirror the kernel's own
 * `legacyKernelDocKeys().instance` / `.receiptArchive` builders, which the
 * sealed payload does not export; the governed reservation witness test
 * (RES4) is the drift fence for these two literals.
 */
export function v10KernelInstanceDocKey(workflowId, instanceKey) {
    return `v08-kernel:wf-instance:${workflowId}:${instanceKey}`;
}
export function v10KernelReceiptArchiveDocKey(turnId) {
    return `v08-kernel:receipt-archive:${turnId}`;
}
/** Selected per-role ABI rows of the v0.10 Node24 profile. */
export const V10_SELECTED_ROLE_ABI = Object.freeze({
    'kernel-primary': 'v08-kernel-abi/1',
    'standard-primary': 'v08-standard-sdk-abi/1',
    business: 'v08-business-abi/1',
    capability: 'v08-capability-abi/1',
    'kernel-extension': V10_KEXT_ABI,
    'standard-feature': V10_SFEATURE_ABI,
});
export function sha256Hex(value) {
    return createHash('sha256').update(value, 'utf8').digest('hex');
}
/** Deterministic canonical JSON (sorted plain-data keys; cycles refuse). */
export function canonicalJson(value) {
    const seen = new WeakSet();
    const write = (input, out) => {
        if (input === null || typeof input === 'number' || typeof input === 'boolean' || typeof input === 'string') {
            if (typeof input === 'number' && !Number.isFinite(input)) {
                throw new Error('digest input carries a non-finite number');
            }
            out.push(JSON.stringify(input));
            return;
        }
        if (typeof input !== 'object')
            throw new Error('digest input is not plain data');
        if (seen.has(input))
            throw new Error('digest input contains a cycle');
        seen.add(input);
        try {
            if (Array.isArray(input)) {
                out.push('[');
                input.forEach((item, index) => {
                    if (index > 0)
                        out.push(',');
                    write(item, out);
                });
                out.push(']');
                return;
            }
            const keys = Object.keys(input).sort();
            out.push('{');
            keys.forEach((key, index) => {
                if (index > 0)
                    out.push(',');
                out.push(JSON.stringify(key), ':');
                write(input[key], out);
            });
            out.push('}');
        }
        finally {
            seen.delete(input);
        }
    };
    const out = [];
    write(value, out);
    return out.join('');
}
export function sha256Canonical(value) {
    return sha256Hex(canonicalJson(value));
}
