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
import type {
  BootResult,
  BootstrapPin,
  InstalledRecord,
  KdpBootstrapContext,
  KdpPrimary,
  V011BootErrorCode,
} from '@kaicreator/domain-harness-contracts/v011';
import { isRecord, normalizeBootstrapContext, readTrustedRecord, verifyContextPaths, verifyInstallTrust } from './verify.js';

function refused(code: V011BootErrorCode, reason: string): BootResult {
  return { status: 'REFUSED', code, reason };
}

// ---------------------------------------------------------------------------
// (b) pin vs record
// ---------------------------------------------------------------------------

/**
 * Snapshot the untrusted pin ONCE: every field is read exactly one time
 * inside the guard and copied into a plain object, so a Proxy pin with
 * throwing/lazy getters has no second read to escape through. Any access
 * failure is an ordinary malformed-pin refusal.
 */
function readPin(pin: unknown): { pin: BootstrapPin; problems: string[] } {
  const problems: string[] = [];
  // isRecord itself only uses intrinsic typeof checks — trap-safe.
  const source: Record<string, unknown> = isRecord(pin) ? pin : {};
  const snapshot: Record<string, unknown> = {};
  try {
    snapshot['schemaVersion'] = source['schemaVersion'];
    snapshot['target'] = source['target'];
    snapshot['kdpPackageId'] = source['kdpPackageId'];
    snapshot['kdpPrimaryEntry'] = source['kdpPrimaryEntry'];
    snapshot['kdpPrimaryDigest'] = source['kdpPrimaryDigest'];
    snapshot['lockDigest'] = source['lockDigest'];
    snapshot['lockPath'] = source['lockPath'];
    if (snapshot['schemaVersion'] !== DH_PIN_SCHEMA_VERSION) {
      problems.push(`pin schemaVersion must be '${DH_PIN_SCHEMA_VERSION}'`);
    }
    if (!isRecord(snapshot['target'])) problems.push('pin target must be an object');
    if (typeof snapshot['kdpPackageId'] !== 'string' || snapshot['kdpPackageId'].length === 0) {
      problems.push('pin kdpPackageId is not a well-formed package id');
    }
    if (snapshot['kdpPrimaryEntry'] !== 'bootstrap') problems.push(`pin kdpPrimaryEntry must be 'bootstrap'`);
    if (!isContentDigest(snapshot['kdpPrimaryDigest'])) problems.push('pin kdpPrimaryDigest must be sha256:<64 lowercase hex>');
    if (!isContentDigest(snapshot['lockDigest'])) problems.push('pin lockDigest must be sha256:<64 lowercase hex>');
    if (typeof snapshot['lockPath'] !== 'string' || snapshot['lockPath'].length === 0) problems.push('pin lockPath must be a non-empty string');
  } catch (error) {
    problems.push(`pin could not be read: ${(error as Error).message}`);
  }
  return { pin: snapshot as unknown as BootstrapPin, problems };
}

function checkPinAgainstRecord(pin: BootstrapPin, record: InstalledRecord): string | null {
  // The pin target is caller input — cyclic or non-plain values must map to
  // a typed mismatch, never throw out of boot.
  let pinTargetJson: string;
  try {
    pinTargetJson = canonicalJson(pin.target);
  } catch (error) {
    return `pin target is not plain serializable data: ${(error as Error).message}`;
  }
  if (pinTargetJson !== canonicalJson(record.target)) {
    return 'pin target does not equal the installed record target';
  }
  if (pin.kdpPackageId !== record.kdpPackageId) return 'pin kdpPackageId does not equal the installed record';
  if (pin.kdpPrimaryEntry !== record.kdpPrimaryEntry) return 'pin kdpPrimaryEntry does not equal the installed record';
  if (pin.kdpPrimaryDigest !== record.kdpPrimaryDigest) {
    return 'pin kdpPrimaryDigest does not equal the installed record';
  }
  if (pin.lockDigest !== record.lockDigest) return 'pin lockDigest does not equal the installed record';
  if (pin.lockPath !== record.lockPath) return 'pin lockPath does not equal the installed record';
  return null;
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

/**
 * Minimal Boot: verify, then hand off to the one pinned KDP Primary.
 * Never parses Package DAGs, never preloads SDK/Business/Extensions.
 */
export async function boot(pin: BootstrapPin, context: KdpBootstrapContext): Promise<BootResult> {
  // Normalize the invocation context ONCE: every field is read exactly one
  // time into a plain snapshot, so a hostile context Proxy cannot fire
  // later. A missing/garbage context is a typed REFUSED, never a TypeError.
  const normalized = normalizeBootstrapContext(context);
  if (!normalized.ok) return refused(normalized.failure.code, normalized.failure.reason);
  const safeContext = normalized.value;

  // (a) trusted installed record — the only trust anchor (shared helper;
  // a missing/non-string installRoot is typed DH_BOOT_RECORD_MISSING).
  const recordResult = await readTrustedRecord(safeContext.installRoot);
  if (!recordResult.ok) return refused(recordResult.failure.code, recordResult.failure.reason);
  const { value: record } = recordResult;

  // (b) pin cross-check against the record (plain snapshot, single read);
  // lock/descriptor path binding.
  const { pin: checkedPin, problems } = readPin(pin);
  if (problems.length > 0) {
    return refused('DH_BOOT_PIN_MISMATCH', `pin is malformed: ${problems.join('; ')}`);
  }
  const pinMismatch = checkPinAgainstRecord(checkedPin, record);
  if (pinMismatch !== null) return refused('DH_BOOT_PIN_MISMATCH', pinMismatch);
  const pathFailure = verifyContextPaths(safeContext, record);
  if (pathFailure !== null) return refused(pathFailure.code, pathFailure.reason);

  // (c) record vs actual bytes: Lock closure digest + KDP entry artifact.
  const trust = await verifyInstallTrust(safeContext);
  if (!trust.ok) return refused(trust.failure.code, trust.failure.reason);

  // (d) load and start the pinned KDP Primary only. The normalized context
  // is handed over — KDP re-normalizes it (plain reads) as its first step.
  let kdpModule: Record<string, unknown>;
  try {
    kdpModule = (await import(pathToFileURL(trust.value.entryPath).href)) as Record<string, unknown>;
  } catch (error) {
    return refused('DH_BOOT_KDP_ENTRY_INVALID', `pinned KDP entry failed to import: ${(error as Error).message}`);
  }
  const bootstrap = kdpModule['bootstrap'];
  if (typeof bootstrap !== 'function') {
    return refused('DH_BOOT_KDP_ENTRY_INVALID', `pinned KDP entry has no named export 'bootstrap'`);
  }
  // Transparent pass-through: KDP reports BOOTED or ordinary FAILED itself.
  return await (bootstrap as KdpPrimary['bootstrap'])(safeContext);
}
