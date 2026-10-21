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
