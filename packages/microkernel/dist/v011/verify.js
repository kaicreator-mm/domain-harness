/**
 * DomainHarness v0.11.0 T03 (#1577) — shared install-trust verification
 * (L2 §6.2), the SINGLE trust path consumed by both Boot and the KDP
 * Primary entry.
 *
 * The trust anchor is the `InstalledRecord` at the fixed relative path
 * under the trusted, Host/installer-bound `installRoot` (PRD K02). These
 * helpers implement the frozen ladder steps (a) record read + recordDigest
 * self-check, (b) context lock/descriptor path binding, and (c) record vs
 * actual bytes (Lock closureDigest per L2 §5.3 predecessor image, and the
 * KDP entry artifact sha256). `boot()` maps failures to REFUSED; the
 * directly-exported `bootstrap()` maps the SAME failures to ordinary
 * FAILED — so calling the KDP Primary without Boot never bypasses the
 * trust anchor (self-signed Locks and forged KDP artifacts are refused
 * because the trusted record is not attacker-writable in the 0.11.0
 * threat model).
 */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { DH_INSTALL_RECORD_SCHEMA_VERSION, contentDigestOf, isContentDigest, } from '@kaicreator/domain-harness-contracts/v011';
import { INSTALLED_RECORD_RELATIVE_PATH, isWellFormedPackageId, resolveInRoot, resolvePackageFile, sameResolvedFile, } from './paths.js';
export function trustFailure(code, reason) {
    return { code, reason };
}
function sha256OfBytes(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}
/** Byte digest in the frozen `sha256:<hex>` wire form. */
export function bytesContentDigest(bytes) {
    return `sha256:${sha256OfBytes(bytes)}`;
}
export function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
}
/** SemVer wire form check kept deliberately light (record integrity is the digest). */
function isSemVerLike(value) {
    return typeof value === 'string' && /^\d+\.\d+\.\d+$/u.test(value);
}
// ---------------------------------------------------------------------------
// (a) trusted installed record
// ---------------------------------------------------------------------------
function validateRecordShape(raw) {
    if (raw['kind'] !== 'DomainAppInstallRecord') {
        return `record kind must be 'DomainAppInstallRecord'`;
    }
    if (raw['schemaVersion'] !== DH_INSTALL_RECORD_SCHEMA_VERSION) {
        return `record schemaVersion must be '${DH_INSTALL_RECORD_SCHEMA_VERSION}'`;
    }
    if (!isNonEmptyString(raw['appId']))
        return 'record appId must be a non-empty string';
    if (!isSemVerLike(raw['appVersion']))
        return 'record appVersion must be MAJOR.MINOR.PATCH';
    if (!isRecord(raw['target']))
        return 'record target must be an object';
    if (!isNonEmptyString(raw['lockPath']))
        return 'record lockPath must be a non-empty string';
    if (!isContentDigest(raw['lockDigest']))
        return 'record lockDigest must be sha256:<64 lowercase hex>';
    if (!isWellFormedPackageId(raw['kdpPackageId']))
        return 'record kdpPackageId is not a well-formed package id';
    if (raw['kdpPrimaryEntry'] !== 'bootstrap')
        return `record kdpPrimaryEntry must be 'bootstrap'`;
    if (!isContentDigest(raw['kdpPrimaryDigest'])) {
        return 'record kdpPrimaryDigest must be sha256:<64 lowercase hex>';
    }
    if (!isContentDigest(raw['recordDigest']))
        return 'record recordDigest must be sha256:<64 lowercase hex>';
    return null;
}
/**
 * Read and validate the trusted installed record. A missing/non-string
 * installRoot is an ordinary REFUSED-class failure (DH_BOOT_RECORD_MISSING),
 * never a TypeError — the root is Host-bound, and an absent root simply
 * holds no trusted install.
 */
export async function readTrustedRecord(installRoot) {
    if (typeof installRoot !== 'string' || installRoot.length === 0) {
        return {
            ok: false,
            failure: trustFailure('DH_BOOT_RECORD_MISSING', 'installRoot is missing or not a string; no trusted install can be addressed'),
        };
    }
    const recordPath = resolveInRoot(installRoot, INSTALLED_RECORD_RELATIVE_PATH);
    if (recordPath === null) {
        return {
            ok: false,
            failure: trustFailure('DH_BOOT_RECORD_MISSING', `cannot address ${INSTALLED_RECORD_RELATIVE_PATH} under installRoot`),
        };
    }
    let text;
    try {
        text = await readFile(recordPath, 'utf8');
    }
    catch {
        return {
            ok: false,
            failure: trustFailure('DH_BOOT_RECORD_MISSING', `trusted installed record not readable at ${INSTALLED_RECORD_RELATIVE_PATH}`),
        };
    }
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch {
        return {
            ok: false,
            failure: trustFailure('DH_BOOT_RECORD_MISSING', `trusted installed record is not parseable JSON at ${INSTALLED_RECORD_RELATIVE_PATH}`),
        };
    }
    if (!isRecord(parsed)) {
        return { ok: false, failure: trustFailure('DH_BOOT_RECORD_INVALID', 'installed record is not a JSON object') };
    }
    const shapeError = validateRecordShape(parsed);
    if (shapeError !== null) {
        return { ok: false, failure: trustFailure('DH_BOOT_RECORD_INVALID', shapeError) };
    }
    // recordDigest self-check: sha256(canonicalJson(record without recordDigest)).
    // Shape was validated above, so the parsed plain data is digest-safe JSON.
    const { recordDigest, ...withoutDigest } = parsed;
    if (contentDigestOf(withoutDigest) !== recordDigest) {
        return {
            ok: false,
            failure: trustFailure('DH_BOOT_RECORD_INVALID', 'recordDigest does not match the canonical record without recordDigest'),
        };
    }
    return { ok: true, value: parsed };
}
// ---------------------------------------------------------------------------
// (b) context path binding
// ---------------------------------------------------------------------------
/**
 * Bind the invocation's lock/descriptor paths to the trusted record:
 * context.lockPath must resolve to the SAME in-root file as the record's
 * lockPath, and context.descriptorPath must be an in-root relative path.
 * Absolute / traversal / out-of-root / same-root-different-file aliases
 * are substitution attempts and are refused.
 */
export function verifyContextPaths(context, record) {
    if (typeof context.installRoot !== 'string' || context.installRoot.length === 0) {
        return trustFailure('DH_BOOT_RECORD_MISSING', 'installRoot is missing or not a string; no trusted install can be addressed');
    }
    if (!sameResolvedFile(context.installRoot, context.lockPath, record.lockPath)) {
        return trustFailure('DH_BOOT_PIN_MISMATCH', 'context.lockPath does not resolve to the installed record lockPath inside installRoot');
    }
    if (typeof context.descriptorPath !== 'string' || resolveInRoot(context.installRoot, context.descriptorPath) === null) {
        return trustFailure('DH_BOOT_PIN_MISMATCH', 'context.descriptorPath is not an in-root relative path');
    }
    return null;
}
// ---------------------------------------------------------------------------
// (c) record vs actual bytes
// ---------------------------------------------------------------------------
/** Read the Lock file and verify its sealed closure digest against the record. */
export async function verifyLockAgainstRecord(installRoot, record) {
    const lockPath = resolveInRoot(installRoot, record.lockPath);
    if (lockPath === null) {
        return { ok: false, failure: trustFailure('DH_BOOT_PIN_MISMATCH', `installed record lockPath '${record.lockPath}' is not an in-root relative path`) };
    }
    let bytes;
    try {
        bytes = await readFile(lockPath);
    }
    catch {
        return { ok: false, failure: trustFailure('DH_BOOT_PIN_MISMATCH', `locked Lock file '${record.lockPath}' is not readable under installRoot`) };
    }
    let parsed;
    try {
        parsed = JSON.parse(bytes.toString('utf8'));
    }
    catch {
        return { ok: false, failure: trustFailure('DH_BOOT_PIN_MISMATCH', `locked Lock file '${record.lockPath}' is not parseable JSON`) };
    }
    if (!isRecord(parsed) || !isContentDigest(parsed['closureDigest'])) {
        return { ok: false, failure: trustFailure('DH_BOOT_PIN_MISMATCH', 'locked Lock file has no valid closureDigest field') };
    }
    // L2 §5.3 predecessor image: digest the full Lock value tree minus closureDigest.
    const { closureDigest, ...preimage } = parsed;
    if (contentDigestOf(preimage) !== closureDigest) {
        return { ok: false, failure: trustFailure('DH_BOOT_PIN_MISMATCH', 'Lock closureDigest recomputation failed (one-byte tamper is refused here)') };
    }
    if (closureDigest !== record.lockDigest) {
        return { ok: false, failure: trustFailure('DH_BOOT_PIN_MISMATCH', 'Lock closureDigest does not equal the installed record lockDigest') };
    }
    const lock = parsed;
    if (lock.bootstrapKdpPin.kdpPackageId !== record.kdpPackageId ||
        lock.bootstrapKdpPin.kdpPrimaryEntry !== record.kdpPrimaryEntry ||
        lock.bootstrapKdpPin.kdpPrimaryDigest !== record.kdpPrimaryDigest) {
        return { ok: false, failure: trustFailure('DH_BOOT_PIN_MISMATCH', 'Lock bootstrapKdpPin disagrees with the installed record') };
    }
    return { ok: true, value: lock };
}
/** Locate the KDP entry artifact via node_modules-normal package resolution under installRoot. */
export async function resolveKdpEntryPath(installRoot, kdpPackageId) {
    const manifestPath = resolvePackageFile(installRoot, kdpPackageId, 'package.json');
    if (manifestPath === null)
        return null;
    let manifest;
    try {
        manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    }
    catch {
        return null;
    }
    if (!isRecord(manifest))
        return null;
    let entry = manifest['main'];
    const exportsField = manifest['exports'];
    if (isRecord(exportsField)) {
        const dot = exportsField['.'];
        if (isRecord(dot)) {
            entry = dot['import'] ?? dot['default'] ?? entry;
        }
        else if (typeof dot === 'string') {
            entry = dot;
        }
    }
    else if (typeof exportsField === 'string') {
        entry = exportsField;
    }
    if (typeof entry !== 'string' || !entry.startsWith('./'))
        return null;
    return resolvePackageFile(installRoot, kdpPackageId, entry.slice(2));
}
/** Verify the actual KDP entry artifact bytes against the record digest. */
export async function verifyKdpEntryBytes(installRoot, record) {
    const entryPath = await resolveKdpEntryPath(installRoot, record.kdpPackageId);
    if (entryPath === null) {
        return { ok: false, failure: trustFailure('DH_BOOT_PIN_MISMATCH', `KDP package '${record.kdpPackageId}' entry cannot be resolved under installRoot`) };
    }
    let bytes;
    try {
        bytes = await readFile(entryPath);
    }
    catch {
        return { ok: false, failure: trustFailure('DH_BOOT_PIN_MISMATCH', `KDP entry artifact for '${record.kdpPackageId}' is not readable`) };
    }
    if (bytesContentDigest(bytes) !== record.kdpPrimaryDigest) {
        return { ok: false, failure: trustFailure('DH_BOOT_PIN_MISMATCH', 'KDP entry artifact bytes do not equal the installed record kdpPrimaryDigest') };
    }
    return { ok: true, value: entryPath };
}
/**
 * The full pre-load trust ladder for one installRoot + context: record,
 * context path binding, Lock bytes, KDP entry bytes. Both Boot and the
 * directly-exported KDP Primary consume THIS — there is no second trust
 * path.
 */
export async function verifyInstallTrust(context) {
    const recordResult = await readTrustedRecord(context.installRoot);
    if (!recordResult.ok)
        return recordResult;
    const pathFailure = verifyContextPaths(context, recordResult.value);
    if (pathFailure !== null)
        return { ok: false, failure: pathFailure };
    const installRoot = context.installRoot;
    const lockResult = await verifyLockAgainstRecord(installRoot, recordResult.value);
    if (!lockResult.ok)
        return lockResult;
    const entryResult = await verifyKdpEntryBytes(installRoot, recordResult.value);
    if (!entryResult.ok)
        return entryResult;
    return { ok: true, value: { record: recordResult.value, lock: lockResult.value, entryPath: entryResult.value } };
}
