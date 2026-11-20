/**
 * DomainHarness v0.11.0 T02 (#1576) — real resource byte authority.
 *
 * Every ResourceRef in the selected closure is resolved here against the
 * package's on-disk root (containment-enforced: absolute paths, drive
 * prefixes, `..` segments and symlink escapes are all refused), its declared
 * `sha256:` digest verified against the real bytes, and the verified digest
 * recorded into the Lock-wide `resourceDigests` closure map keyed by
 * `<packageId>/<path>` (PRD 5.1). Missing files and digest mismatches fail
 * the BUILD with the exact frozen codes — never repaired, never re-fetched.
 */
import { readFileSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { isRelativeResourcePath } from '@kaicreator/domain-harness-contracts/v011';
import { refusal } from './refusal.js';
export function digestOfBytes(bytes) {
    return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}
export class V011ResourceScope {
    roots;
    /** `<packageId>/<path>` -> verified digest, insertion-ordered. */
    closureDigests = new Map();
    constructor(packageRoots) {
        this.roots = packageRoots;
    }
    rootOf(packageId) {
        const root = this.roots[packageId];
        if (!root) {
            throw refusal('DH_BUILD_RESOURCE_MISSING', `no package root provided for '${packageId}'`);
        }
        return root;
    }
    /** Read package bytes with containment enforcement; no digest bookkeeping. */
    read(packageId, path) {
        // BUILD must use the same canonical POSIX paths that Boot/KDP accepts.
        if (!isRelativeResourcePath(path)) {
            throw refusal('DH_BUILD_RESOURCE_MISSING', `resource '${packageId}/${path}' is not a canonical relative POSIX path`);
        }
        let root;
        let target;
        try {
            // realpath both ends: symlinked package roots or symlinked resource
            // files cannot escape the resolved package root.
            root = realpathSync(resolve(this.rootOf(packageId)));
            target = realpathSync(resolve(root, path));
        }
        catch {
            throw refusal('DH_BUILD_RESOURCE_MISSING', `resource '${packageId}/${path}' does not exist or is not readable`);
        }
        if (target !== root && !target.startsWith(root + sep)) {
            throw refusal('DH_BUILD_RESOURCE_MISSING', `resource path '${path}' escapes package root of '${packageId}'`);
        }
        // The realpath succeeded but the final read can still fail (directory
        // instead of a file, unreadable entry, TOCTOU removal): same frozen code.
        try {
            return readFileSync(target);
        }
        catch {
            throw refusal('DH_BUILD_RESOURCE_MISSING', `resource '${packageId}/${path}' does not exist or is not readable`);
        }
    }
    /** Read + digest-verify + record one declared resource reference. */
    verify(ref) {
        const bytes = this.read(ref.packageId, ref.path);
        const actual = digestOfBytes(bytes);
        if (actual !== ref.digest) {
            throw refusal('DH_BUILD_RESOURCE_DIGEST_MISMATCH', `resource '${ref.packageId}/${ref.path}' digest mismatch: declared ${ref.digest}, actual ${actual}`);
        }
        this.closureDigests.set(`${ref.packageId}/${ref.path}`, ref.digest);
        return bytes;
    }
    /** Record a byte-derived digest for a path with no declared digest (artifacts). */
    record(packageId, path, digest) {
        this.closureDigests.set(`${packageId}/${path}`, digest);
    }
    toLockMap() {
        return Object.fromEntries([...this.closureDigests.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    }
}
