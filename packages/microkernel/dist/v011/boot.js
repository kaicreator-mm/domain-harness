/**
 * DomainHarness v0.11.0 T03 (#1577) — minimal Boot (L2 §6.2).
 *
 * `boot(pin, context)` executes ONLY the frozen verification ladder and
 * nothing else: it never parses a Package DAG, never imports SDK /
 * Business / Extension modules, never binds Hooks, never executes domain
 * rules and never grants Effects (PRD K01–K03). The trust anchor is the
 * `InstalledRecord` at the fixed relative path under the trusted
 * `installRoot`; the pin is untrusted caller input used purely for
 * field-by-field cross-checking (L2 §13.5 P1-02). `installRoot` itself is
 * bound by the authorized installer/Host, not by the invocation payload.
 *
 * All ladder steps live in the SHARED `verify.ts` module — the directly
 * exported KDP Primary consumes the same helpers, so no second trust path
 * exists. Boot's only additions on top are (b) the pin cross-check and
 * (d) the dynamic import + transparent pass-through of the
 * KdpBootstrapResult. Any failure is REFUSED with a typed code, zero side
 * effects and no module loaded.
 */
import { pathToFileURL } from 'node:url';
import { DH_PIN_SCHEMA_VERSION, canonicalJson, isContentDigest } from '@kaicreator/domain-harness-contracts/v011';
import { isRecord, readTrustedRecord, verifyContextPaths, verifyInstallTrust } from './verify.js';
function refused(code, reason) {
    return { status: 'REFUSED', code, reason };
}
// ---------------------------------------------------------------------------
// (b) pin vs record
// ---------------------------------------------------------------------------
function readPin(pin) {
    const problems = [];
    // The pin is arbitrary caller input — it may be a Proxy with throwing
    // traps. Any access failure is an ordinary malformed-pin refusal.
    // (isRecord itself only uses intrinsic typeof checks — trap-safe.)
    const p = isRecord(pin) ? pin : {};
    try {
        if (p['schemaVersion'] !== DH_PIN_SCHEMA_VERSION) {
            problems.push(`pin schemaVersion must be '${DH_PIN_SCHEMA_VERSION}'`);
        }
        if (!isRecord(p['target']))
            problems.push('pin target must be an object');
        if (typeof p['kdpPackageId'] !== 'string' || p['kdpPackageId'].length === 0) {
            problems.push('pin kdpPackageId is not a well-formed package id');
        }
        if (p['kdpPrimaryEntry'] !== 'bootstrap')
            problems.push(`pin kdpPrimaryEntry must be 'bootstrap'`);
        if (!isContentDigest(p['kdpPrimaryDigest']))
            problems.push('pin kdpPrimaryDigest must be sha256:<64 lowercase hex>');
        if (!isContentDigest(p['lockDigest']))
            problems.push('pin lockDigest must be sha256:<64 lowercase hex>');
        if (typeof p['lockPath'] !== 'string' || p['lockPath'].length === 0)
            problems.push('pin lockPath must be a non-empty string');
    }
    catch (error) {
        problems.push(`pin could not be read: ${error.message}`);
    }
    return { pin: p, problems };
}
function checkPinAgainstRecord(pin, record) {
    // The pin target is caller input — cyclic or non-plain values must map to
    // a typed mismatch, never throw out of boot.
    let pinTargetJson;
    try {
        pinTargetJson = canonicalJson(pin.target);
    }
    catch (error) {
        return `pin target is not plain serializable data: ${error.message}`;
    }
    if (pinTargetJson !== canonicalJson(record.target)) {
        return 'pin target does not equal the installed record target';
    }
    if (pin.kdpPackageId !== record.kdpPackageId)
        return 'pin kdpPackageId does not equal the installed record';
    if (pin.kdpPrimaryEntry !== record.kdpPrimaryEntry)
        return 'pin kdpPrimaryEntry does not equal the installed record';
    if (pin.kdpPrimaryDigest !== record.kdpPrimaryDigest) {
        return 'pin kdpPrimaryDigest does not equal the installed record';
    }
    if (pin.lockDigest !== record.lockDigest)
        return 'pin lockDigest does not equal the installed record';
    if (pin.lockPath !== record.lockPath)
        return 'pin lockPath does not equal the installed record';
    return null;
}
// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
/**
 * Minimal Boot: verify, then hand off to the one pinned KDP Primary.
 * Never parses Package DAGs, never preloads SDK/Business/Extensions.
 */
export async function boot(pin, context) {
    // A missing/garbage context is a typed REFUSED, never a TypeError.
    if (!isRecord(context)) {
        return refused('DH_BOOT_RECORD_MISSING', 'boot context is missing or not an object; no trusted install can be addressed');
    }
    // (a) trusted installed record — the only trust anchor (shared helper;
    // a missing/non-string installRoot is typed DH_BOOT_RECORD_MISSING).
    const recordResult = await readTrustedRecord(context.installRoot);
    if (!recordResult.ok)
        return refused(recordResult.failure.code, recordResult.failure.reason);
    const { value: record } = recordResult;
    // (b) pin cross-check against the record; lock/descriptor path binding.
    const { pin: checkedPin, problems } = readPin(pin);
    if (problems.length > 0) {
        return refused('DH_BOOT_PIN_MISMATCH', `pin is malformed: ${problems.join('; ')}`);
    }
    const pinMismatch = checkPinAgainstRecord(checkedPin, record);
    if (pinMismatch !== null)
        return refused('DH_BOOT_PIN_MISMATCH', pinMismatch);
    const pathFailure = verifyContextPaths(context, record);
    if (pathFailure !== null)
        return refused(pathFailure.code, pathFailure.reason);
    // (c) record vs actual bytes: Lock closure digest + KDP entry artifact.
    const trust = await verifyInstallTrust(context);
    if (!trust.ok)
        return refused(trust.failure.code, trust.failure.reason);
    // (d) load and start the pinned KDP Primary only.
    let kdpModule;
    try {
        kdpModule = (await import(pathToFileURL(trust.value.entryPath).href));
    }
    catch (error) {
        return refused('DH_BOOT_KDP_ENTRY_INVALID', `pinned KDP entry failed to import: ${error.message}`);
    }
    const bootstrap = kdpModule['bootstrap'];
    if (typeof bootstrap !== 'function') {
        return refused('DH_BOOT_KDP_ENTRY_INVALID', `pinned KDP entry has no named export 'bootstrap'`);
    }
    // Transparent pass-through: KDP reports BOOTED or ordinary FAILED itself.
    return await bootstrap(context);
}
