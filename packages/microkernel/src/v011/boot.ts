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
 * Ladder (any failure = REFUSED, typed code, ZERO side effects and no
 * module loaded):
 *   (a) read `<installRoot>/dh-install/installed-record.json`; missing /
 *       unreadable / unparseable → DH_BOOT_RECORD_MISSING; kind /
 *       schemaVersion / shape / recordDigest self-check → DH_BOOT_RECORD_INVALID.
 *   (b) pin vs record field equality + context.lockPath / context.descriptorPath
 *       resolving to the same in-root files → DH_BOOT_PIN_MISMATCH.
 *   (c) Lock closureDigest recomputation (L2 §5.3 predecessor image) and
 *       KDP entry artifact bytes vs record digests → DH_BOOT_PIN_MISMATCH.
 *   (d) dynamic-import the pinned KDP entry; named export `bootstrap` →
 *       DH_BOOT_KDP_ENTRY_INVALID; otherwise transparent pass-through of
 *       the KdpBootstrapResult.
 */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import {
  DH_INSTALL_RECORD_SCHEMA_VERSION,
  DH_PIN_SCHEMA_VERSION,
  canonicalJson,
  contentDigestOf,
  isContentDigest,
} from '@kaicreator/domain-harness-contracts/v011';
import type {
  BootResult,
  BootstrapPin,
  DomainAppLock,
  InstalledRecord,
  JsonValue,
  KdpBootstrapContext,
  KdpPrimary,
  V011BootErrorCode,
} from '@kaicreator/domain-harness-contracts/v011';
import {
  INSTALLED_RECORD_RELATIVE_PATH,
  isWellFormedPackageId,
  resolveInRoot,
  resolvePackageFile,
  sameResolvedFile,
} from './paths.js';

function refused(code: V011BootErrorCode, reason: string): BootResult {
  return { status: 'REFUSED', code, reason };
}

function sha256OfBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** SemVer wire form check kept deliberately light (record integrity is the digest). */
function isSemVerLike(value: unknown): value is string {
  return typeof value === 'string' && /^\d+\.\d+\.\d+$/u.test(value);
}

// ---------------------------------------------------------------------------
// (a) trusted installed record
// ---------------------------------------------------------------------------

type RecordRead =
  | { readonly ok: true; readonly record: InstalledRecord; readonly raw: Record<string, unknown> }
  | { readonly ok: false; readonly result: BootResult };

function validateRecordShape(raw: Record<string, unknown>): string | null {
  if (raw['kind'] !== 'DomainAppInstallRecord') {
    return `record kind must be 'DomainAppInstallRecord'`;
  }
  if (raw['schemaVersion'] !== DH_INSTALL_RECORD_SCHEMA_VERSION) {
    return `record schemaVersion must be '${DH_INSTALL_RECORD_SCHEMA_VERSION}'`;
  }
  if (!isNonEmptyString(raw['appId'])) return 'record appId must be a non-empty string';
  if (!isSemVerLike(raw['appVersion'])) return 'record appVersion must be MAJOR.MINOR.PATCH';
  if (!isRecord(raw['target'])) return 'record target must be an object';
  if (!isNonEmptyString(raw['lockPath'])) return 'record lockPath must be a non-empty string';
  if (!isContentDigest(raw['lockDigest'])) return 'record lockDigest must be sha256:<64 lowercase hex>';
  if (!isWellFormedPackageId(raw['kdpPackageId'])) return 'record kdpPackageId is not a well-formed package id';
  if (raw['kdpPrimaryEntry'] !== 'bootstrap') return `record kdpPrimaryEntry must be 'bootstrap'`;
  if (!isContentDigest(raw['kdpPrimaryDigest'])) {
    return 'record kdpPrimaryDigest must be sha256:<64 lowercase hex>';
  }
  if (!isContentDigest(raw['recordDigest'])) return 'record recordDigest must be sha256:<64 lowercase hex>';
  return null;
}

async function readInstalledRecord(installRoot: string): Promise<RecordRead> {
  const recordPath = resolveInRoot(installRoot, INSTALLED_RECORD_RELATIVE_PATH);
  if (recordPath === null) {
    // installRoot itself is Host-bound; a root that cannot hold the fixed
    // relative path is treated as a missing trusted install.
    return { ok: false, result: refused('DH_BOOT_RECORD_MISSING', `cannot address ${INSTALLED_RECORD_RELATIVE_PATH} under installRoot`) };
  }
  let text: string;
  try {
    text = await readFile(recordPath, 'utf8');
  } catch {
    return {
      ok: false,
      result: refused('DH_BOOT_RECORD_MISSING', `trusted installed record not readable at ${INSTALLED_RECORD_RELATIVE_PATH}`),
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      result: refused('DH_BOOT_RECORD_MISSING', `trusted installed record is not parseable JSON at ${INSTALLED_RECORD_RELATIVE_PATH}`),
    };
  }
  if (!isRecord(parsed)) {
    return { ok: false, result: refused('DH_BOOT_RECORD_INVALID', 'installed record is not a JSON object') };
  }
  const shapeError = validateRecordShape(parsed);
  if (shapeError !== null) {
    return { ok: false, result: refused('DH_BOOT_RECORD_INVALID', shapeError) };
  }
  // recordDigest self-check: sha256(canonicalJson(record without recordDigest)).
  // Shape was validated above, so the parsed plain data is digest-safe JSON.
  const { recordDigest, ...withoutDigest } = parsed;
  if (contentDigestOf(withoutDigest as JsonValue) !== recordDigest) {
    return {
      ok: false,
      result: refused('DH_BOOT_RECORD_INVALID', 'recordDigest does not match the canonical record without recordDigest'),
    };
  }
  return { ok: true, record: parsed as unknown as InstalledRecord, raw: parsed };
}

// ---------------------------------------------------------------------------
// (b) pin vs record
// ---------------------------------------------------------------------------

function readPin(pin: unknown): { pin: BootstrapPin; problems: string[] } {
  const problems: string[] = [];
  const p: Record<string, unknown> = isRecord(pin) ? pin : {};
  if (p['schemaVersion'] !== DH_PIN_SCHEMA_VERSION) {
    problems.push(`pin schemaVersion must be '${DH_PIN_SCHEMA_VERSION}'`);
  }
  if (!isRecord(p['target'])) problems.push('pin target must be an object');
  if (!isWellFormedPackageId(p['kdpPackageId'])) problems.push('pin kdpPackageId is not a well-formed package id');
  if (p['kdpPrimaryEntry'] !== 'bootstrap') problems.push(`pin kdpPrimaryEntry must be 'bootstrap'`);
  if (!isContentDigest(p['kdpPrimaryDigest'])) problems.push('pin kdpPrimaryDigest must be sha256:<64 lowercase hex>');
  if (!isContentDigest(p['lockDigest'])) problems.push('pin lockDigest must be sha256:<64 lowercase hex>');
  if (!isNonEmptyString(p['lockPath'])) problems.push('pin lockPath must be a non-empty string');
  return { pin: p as unknown as BootstrapPin, problems };
}

function checkPinAgainstRecord(pin: BootstrapPin, record: InstalledRecord): string | null {
  if (canonicalJson(pin.target) !== canonicalJson(record.target)) {
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
// (c) record vs actual bytes
// ---------------------------------------------------------------------------

async function readLockVerified(installRoot: string, record: InstalledRecord): Promise<DomainAppLock | BootResult> {
  const lockPath = resolveInRoot(installRoot, record.lockPath);
  if (lockPath === null) {
    return refused('DH_BOOT_PIN_MISMATCH', `installed record lockPath '${record.lockPath}' is not an in-root relative path`);
  }
  let bytes: Buffer;
  try {
    bytes = await readFile(lockPath);
  } catch {
    return refused('DH_BOOT_PIN_MISMATCH', `locked Lock file '${record.lockPath}' is not readable under installRoot`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    return refused('DH_BOOT_PIN_MISMATCH', `locked Lock file '${record.lockPath}' is not parseable JSON`);
  }
  if (!isRecord(parsed) || !isContentDigest(parsed['closureDigest'])) {
    return refused('DH_BOOT_PIN_MISMATCH', 'locked Lock file has no valid closureDigest field');
  }
  // L2 §5.3 predecessor image: digest the full Lock value tree minus closureDigest.
  const { closureDigest, ...preimage } = parsed;
  if (contentDigestOf(preimage as JsonValue) !== closureDigest) {
    return refused('DH_BOOT_PIN_MISMATCH', 'Lock closureDigest recomputation failed (one-byte tamper is refused here)');
  }
  if (closureDigest !== record.lockDigest) {
    return refused('DH_BOOT_PIN_MISMATCH', 'Lock closureDigest does not equal the installed record lockDigest');
  }
  return parsed as unknown as DomainAppLock;
}

/** Locate the KDP entry artifact via node_modules-normal package resolution under installRoot. */
async function resolveKdpEntryPath(installRoot: string, kdpPackageId: string): Promise<string | null> {
  const manifestPath = resolvePackageFile(installRoot, kdpPackageId, 'package.json');
  if (manifestPath === null) return null;
  let manifest: unknown;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch {
    return null;
  }
  if (!isRecord(manifest)) return null;
  let entry: unknown = manifest['main'];
  const exportsField = manifest['exports'];
  if (isRecord(exportsField)) {
    const dot = exportsField['.'];
    if (isRecord(dot)) {
      entry = dot['import'] ?? dot['default'] ?? entry;
    } else if (typeof dot === 'string') {
      entry = dot;
    }
  } else if (typeof exportsField === 'string') {
    entry = exportsField;
  }
  if (typeof entry !== 'string' || !entry.startsWith('./')) return null;
  return resolvePackageFile(installRoot, kdpPackageId, entry.slice(2));
}

async function verifyKdpEntryBytes(installRoot: string, record: InstalledRecord): Promise<string | BootResult> {
  const entryPath = await resolveKdpEntryPath(installRoot, record.kdpPackageId);
  if (entryPath === null) {
    return refused('DH_BOOT_PIN_MISMATCH', `KDP package '${record.kdpPackageId}' entry cannot be resolved under installRoot`);
  }
  let bytes: Buffer;
  try {
    bytes = await readFile(entryPath);
  } catch {
    return refused('DH_BOOT_PIN_MISMATCH', `KDP entry artifact for '${record.kdpPackageId}' is not readable`);
  }
  if (`sha256:${sha256OfBytes(bytes)}` !== record.kdpPrimaryDigest) {
    return refused('DH_BOOT_PIN_MISMATCH', 'KDP entry artifact bytes do not equal the installed record kdpPrimaryDigest');
  }
  return entryPath;
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

/**
 * Minimal Boot: verify, then hand off to the one pinned KDP Primary.
 * Never parses Package DAGs, never preloads SDK/Business/Extensions.
 */
export async function boot(pin: BootstrapPin, context: KdpBootstrapContext): Promise<BootResult> {
  const installRoot = context.installRoot;

  // (a) trusted installed record — the only trust anchor.
  const recordRead = await readInstalledRecord(installRoot);
  if (!recordRead.ok) return recordRead.result;
  const { record } = recordRead;

  // (b) pin cross-check against the record; lock/descriptor path substitution refusal.
  const { pin: checkedPin, problems } = readPin(pin);
  if (problems.length > 0) {
    return refused('DH_BOOT_PIN_MISMATCH', `pin is malformed: ${problems.join('; ')}`);
  }
  const pinMismatch = checkPinAgainstRecord(checkedPin, record);
  if (pinMismatch !== null) return refused('DH_BOOT_PIN_MISMATCH', pinMismatch);
  if (!sameResolvedFile(installRoot, context.lockPath, record.lockPath)) {
    return refused('DH_BOOT_PIN_MISMATCH', 'context.lockPath does not resolve to the installed record lockPath inside installRoot');
  }
  if (typeof context.descriptorPath !== 'string' || resolveInRoot(installRoot, context.descriptorPath) === null) {
    return refused('DH_BOOT_PIN_MISMATCH', 'context.descriptorPath is not an in-root relative path');
  }

  // (c) record vs actual bytes: Lock closure digest + KDP entry artifact bytes.
  const lock = await readLockVerified(installRoot, record);
  if ('status' in lock) return lock;
  if (lock.bootstrapKdpPin.kdpPackageId !== record.kdpPackageId ||
      lock.bootstrapKdpPin.kdpPrimaryEntry !== record.kdpPrimaryEntry ||
      lock.bootstrapKdpPin.kdpPrimaryDigest !== record.kdpPrimaryDigest) {
    return refused('DH_BOOT_PIN_MISMATCH', 'Lock bootstrapKdpPin disagrees with the installed record');
  }
  const entryPath = await verifyKdpEntryBytes(installRoot, record);
  if (typeof entryPath !== 'string') return entryPath;

  // (d) load and start the pinned KDP Primary only.
  let kdpModule: Record<string, unknown>;
  try {
    kdpModule = (await import(pathToFileURL(entryPath).href)) as Record<string, unknown>;
  } catch (error) {
    return refused('DH_BOOT_KDP_ENTRY_INVALID', `pinned KDP entry failed to import: ${(error as Error).message}`);
  }
  const bootstrap = kdpModule['bootstrap'];
  if (typeof bootstrap !== 'function') {
    return refused('DH_BOOT_KDP_ENTRY_INVALID', `pinned KDP entry has no named export 'bootstrap'`);
  }
  // Transparent pass-through: KDP reports BOOTED or ordinary FAILED itself.
  return await (bootstrap as KdpPrimary['bootstrap'])(context);
}
