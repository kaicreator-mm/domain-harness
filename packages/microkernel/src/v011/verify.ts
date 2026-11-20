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
import {
  DH_INSTALL_RECORD_SCHEMA_VERSION,
  contentDigestOf,
  isContentDigest,
} from '@kaicreator/domain-harness-contracts/v011';
import type {
  DomainAppLock,
  HostPortBinding,
  InstalledRecord,
  JsonValue,
  KdpBootstrapContext,
  V011BootErrorCode,
} from '@kaicreator/domain-harness-contracts/v011';
import {
  INSTALLED_RECORD_RELATIVE_PATH,
  isWellFormedPackageId,
  resolveInRoot,
  resolvePackageFile,
  sameResolvedFile,
} from './paths.js';

export interface TrustFailure {
  readonly code: V011BootErrorCode;
  readonly reason: string;
}

export type TrustResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: TrustFailure };

export function trustFailure(code: V011BootErrorCode, reason: string): TrustFailure {
  return { code, reason };
}

function sha256OfBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Byte digest in the frozen `sha256:<hex>` wire form. */
export function bytesContentDigest(bytes: Uint8Array): string {
  return `sha256:${sha256OfBytes(bytes)}`;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
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

/**
 * Read and validate the trusted installed record. A missing/non-string
 * installRoot is an ordinary REFUSED-class failure (DH_BOOT_RECORD_MISSING),
 * never a TypeError — the root is Host-bound, and an absent root simply
 * holds no trusted install.
 */
export async function readTrustedRecord(installRoot: unknown): Promise<TrustResult<InstalledRecord>> {
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
  let text: string;
  try {
    text = await readFile(recordPath, 'utf8');
  } catch {
    return {
      ok: false,
      failure: trustFailure('DH_BOOT_RECORD_MISSING', `trusted installed record not readable at ${INSTALLED_RECORD_RELATIVE_PATH}`),
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
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
  if (contentDigestOf(withoutDigest as JsonValue) !== recordDigest) {
    return {
      ok: false,
      failure: trustFailure('DH_BOOT_RECORD_INVALID', 'recordDigest does not match the canonical record without recordDigest'),
    };
  }
  return { ok: true, value: parsed as unknown as InstalledRecord };
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
export function verifyContextPaths(context: KdpBootstrapContext, record: InstalledRecord): TrustFailure | null {
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
export async function verifyLockAgainstRecord(installRoot: string, record: InstalledRecord): Promise<TrustResult<DomainAppLock>> {
  const lockPath = resolveInRoot(installRoot, record.lockPath);
  if (lockPath === null) {
    return { ok: false, failure: trustFailure('DH_BOOT_PIN_MISMATCH', `installed record lockPath '${record.lockPath}' is not an in-root relative path`) };
  }
  let bytes: Buffer;
  try {
    bytes = await readFile(lockPath);
  } catch {
    return { ok: false, failure: trustFailure('DH_BOOT_PIN_MISMATCH', `locked Lock file '${record.lockPath}' is not readable under installRoot`) };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    return { ok: false, failure: trustFailure('DH_BOOT_PIN_MISMATCH', `locked Lock file '${record.lockPath}' is not parseable JSON`) };
  }
  if (!isRecord(parsed) || !isContentDigest(parsed['closureDigest'])) {
    return { ok: false, failure: trustFailure('DH_BOOT_PIN_MISMATCH', 'locked Lock file has no valid closureDigest field') };
  }
  // L2 §5.3 predecessor image: digest the full Lock value tree minus closureDigest.
  const { closureDigest, ...preimage } = parsed;
  if (contentDigestOf(preimage as JsonValue) !== closureDigest) {
    return { ok: false, failure: trustFailure('DH_BOOT_PIN_MISMATCH', 'Lock closureDigest recomputation failed (one-byte tamper is refused here)') };
  }
  if (closureDigest !== record.lockDigest) {
    return { ok: false, failure: trustFailure('DH_BOOT_PIN_MISMATCH', 'Lock closureDigest does not equal the installed record lockDigest') };
  }
  const lock = parsed as unknown as DomainAppLock;
  if (!Array.isArray(lock.selectedPackages) || !lock.selectedPackages.every((candidate) =>
    isRecord(candidate) && typeof candidate['technicalLifecycle'] === 'boolean' &&
    isRecord(candidate['artifact']) && typeof candidate['packageId'] === 'string')) {
    return { ok: false, failure: trustFailure('DH_BOOT_PIN_MISMATCH', 'Lock selectedPackages lacks required lifecycle declarations or artifact entries') };
  }
  // Structural shape checks on the fields the runtime dereferences: a
  // digest-consistent but malformed Lock must be a typed mismatch, never a
  // TypeError downstream.
  if (!isRecord(lock.target) || typeof lock.target['profile'] !== 'string') {
    return { ok: false, failure: trustFailure('DH_BOOT_PIN_MISMATCH', 'Lock target is malformed (expected an object with a profile string)') };
  }
  if (
    !isRecord(lock.bootstrapKdpPin) ||
    typeof lock.bootstrapKdpPin['kdpPackageId'] !== 'string' ||
    lock.bootstrapKdpPin['kdpPrimaryEntry'] !== 'bootstrap' ||
    typeof lock.bootstrapKdpPin['kdpPrimaryDigest'] !== 'string'
  ) {
    return { ok: false, failure: trustFailure('DH_BOOT_PIN_MISMATCH', 'Lock bootstrapKdpPin is malformed (expected kdpPackageId/kdpPrimaryEntry/kdpPrimaryDigest)') };
  }
  if (
    !isRecord(lock.appIdentity) ||
    typeof lock.appIdentity['descriptorDigest'] !== 'string'
  ) {
    return { ok: false, failure: trustFailure('DH_BOOT_PIN_MISMATCH', 'Lock appIdentity is malformed (expected a descriptorDigest string)') };
  }
  if (
    lock.bootstrapKdpPin.kdpPackageId !== record.kdpPackageId ||
    lock.bootstrapKdpPin.kdpPrimaryEntry !== record.kdpPrimaryEntry ||
    lock.bootstrapKdpPin.kdpPrimaryDigest !== record.kdpPrimaryDigest
  ) {
    return { ok: false, failure: trustFailure('DH_BOOT_PIN_MISMATCH', 'Lock bootstrapKdpPin disagrees with the installed record') };
  }
  return { ok: true, value: lock };
}

/**
 * Resolve a conditional-exports value for the runtime conditions
 * ['node', 'import'], falling back to 'default'. Nested condition objects
 * are supported ('node' -> { import: ... }); a string resolves directly.
 * Returns null when no condition path yields a string — the caller turns
 * that into a typed entry-invalid failure, never a silently wrong import.
 */
function resolveConditionalExports(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (isRecord(value)) {
    for (const condition of ['node', 'import', 'default'] as const) {
      if (hasOwn(value, condition)) {
        const resolved = resolveConditionalExports(value[condition]);
        if (resolved !== null) return resolved;
      }
    }
  }
  return null;
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/**
 * Locate the KDP entry artifact via node_modules-normal package resolution
 * under installRoot. Returns { ok, entryPath } or a typed entry-invalid
 * failure when the manifest/exports shape cannot be resolved (a resolved
 * but unreadable/mismatched entry stays a PIN_MISMATCH-class failure).
 */
export async function resolveKdpEntryPath(
  installRoot: string,
  kdpPackageId: string,
): Promise<TrustResult<string>> {
  const invalid = (reason: string): TrustResult<string> => ({
    ok: false,
    failure: trustFailure('DH_BOOT_KDP_ENTRY_INVALID', reason),
  });
  const manifestPath = resolvePackageFile(installRoot, kdpPackageId, 'package.json');
  if (manifestPath === null) {
    return invalid(`KDP package '${kdpPackageId}' manifest cannot be addressed under installRoot`);
  }
  let manifest: unknown;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch {
    return invalid(`KDP package '${kdpPackageId}' manifest is not readable parseable JSON`);
  }
  if (!isRecord(manifest)) {
    return invalid(`KDP package '${kdpPackageId}' manifest is not a JSON object`);
  }
  let dot: unknown;
  if (hasOwn(manifest, 'exports')) {
    const exportsField = manifest['exports'];
    if (typeof exportsField === 'string') {
      dot = exportsField;
    } else if (isRecord(exportsField) && hasOwn(exportsField, '.')) {
      dot = exportsField['.'];
    } else {
      return invalid(`KDP package '${kdpPackageId}' exports map has no '.' entry`);
    }
  } else {
    dot = manifest['main'];
  }
  const entry = resolveConditionalExports(dot);
  if (entry === null || !entry.startsWith('./')) {
    return invalid(
      `KDP package '${kdpPackageId}' entry cannot be resolved from node/import/default conditions (got ${JSON.stringify(entry)})`,
    );
  }
  const resolved = resolvePackageFile(installRoot, kdpPackageId, entry.slice(2));
  if (resolved === null) {
    return invalid(`KDP package '${kdpPackageId}' entry '${entry}' is not an in-package relative path`);
  }
  return { ok: true, value: resolved };
}

/** Verify the actual KDP entry artifact bytes against the record digest. */
export async function verifyKdpEntryBytes(installRoot: string, record: InstalledRecord): Promise<TrustResult<string>> {
  const entryResult = await resolveKdpEntryPath(installRoot, record.kdpPackageId);
  if (!entryResult.ok) return entryResult;
  const entryPath = entryResult.value;
  let bytes: Buffer;
  try {
    bytes = await readFile(entryPath);
  } catch {
    return { ok: false, failure: trustFailure('DH_BOOT_PIN_MISMATCH', `KDP entry artifact for '${record.kdpPackageId}' is not readable`) };
  }
  if (bytesContentDigest(bytes) !== record.kdpPrimaryDigest) {
    return { ok: false, failure: trustFailure('DH_BOOT_PIN_MISMATCH', 'KDP entry artifact bytes do not equal the installed record kdpPrimaryDigest') };
  }
  return { ok: true, value: entryPath };
}

/**
 * Plain, once-extracted snapshot of the invocation context. Every field is
 * read exactly ONCE at entry (inside a guard), so a caller-supplied Proxy
 * with throwing/lazy getters can never fire later in the pipeline — there
 * are no second reads to escape the typed REFUSED/FAILED mapping.
 */
export interface NormalizedBootstrapContext {
  readonly installRoot: string;
  readonly descriptorPath: string;
  readonly lockPath: string;
  readonly hostPorts: readonly HostPortBinding[];
  readonly env: { readonly nodeMajor: number; readonly platform: string };
}

/**
 * Normalize an arbitrary invocation context at entry. Missing/garbage
 * values map to typed failures (never a TypeError); each well-formed field
 * is copied into a plain snapshot so downstream code never touches the
 * original (possibly hostile) object again.
 */
export function normalizeBootstrapContext(context: unknown): TrustResult<NormalizedBootstrapContext> {
  if (!isRecord(context)) {
    return {
      ok: false,
      failure: trustFailure('DH_BOOT_RECORD_MISSING', 'bootstrap context is missing or not an object'),
    };
  }
  try {
    const installRoot = context['installRoot'];
    if (typeof installRoot !== 'string' || installRoot.length === 0) {
      return {
        ok: false,
        failure: trustFailure('DH_BOOT_RECORD_MISSING', 'installRoot is missing or not a string; no trusted install can be addressed'),
      };
    }
    const lockPath = context['lockPath'];
    const descriptorPath = context['descriptorPath'];
    if (typeof lockPath !== 'string' || lockPath.length === 0) {
      return { ok: false, failure: trustFailure('DH_BOOT_PIN_MISMATCH', 'context.lockPath is missing or not a string') };
    }
    if (typeof descriptorPath !== 'string' || descriptorPath.length === 0) {
      return { ok: false, failure: trustFailure('DH_BOOT_PIN_MISMATCH', 'context.descriptorPath is missing or not a string') };
    }
    const hostPortsRaw = context['hostPorts'];
    const hostPorts: readonly HostPortBinding[] = Array.isArray(hostPortsRaw)
      ? hostPortsRaw.filter(
          (entry): entry is HostPortBinding =>
            isRecord(entry) && typeof entry['name'] === 'string' && typeof entry['port'] === 'number',
        )
      : [];
    const envRaw = context['env'];
    const env = isRecord(envRaw) && typeof envRaw['nodeMajor'] === 'number' && typeof envRaw['platform'] === 'string'
      ? { nodeMajor: envRaw['nodeMajor'], platform: envRaw['platform'] }
      : { nodeMajor: 0, platform: 'unknown' };
    return {
      ok: true,
      value: { installRoot, descriptorPath, lockPath, hostPorts, env },
    };
  } catch (error) {
    return {
      ok: false,
      failure: trustFailure('DH_BOOT_RECORD_MISSING', `bootstrap context could not be read: ${(error as Error).message}`),
    };
  }
}

/**
 * The full pre-load trust ladder for one installRoot + context: normalized
 * context, record, context path binding, Lock bytes, KDP entry bytes. Both
 * Boot and the directly-exported KDP Primary consume THIS — there is no
 * second trust path.
 */
export async function verifyInstallTrust(
  context: unknown,
): Promise<TrustResult<{ record: InstalledRecord; lock: DomainAppLock; entryPath: string; context: NormalizedBootstrapContext }>> {
  const normalized = normalizeBootstrapContext(context);
  if (!normalized.ok) return normalized;
  const recordResult = await readTrustedRecord(normalized.value.installRoot);
  if (!recordResult.ok) return recordResult;
  const pathFailure = verifyContextPaths(normalized.value, recordResult.value);
  if (pathFailure !== null) return { ok: false, failure: pathFailure };
  const installRoot = normalized.value.installRoot;
  const lockResult = await verifyLockAgainstRecord(installRoot, recordResult.value);
  if (!lockResult.ok) return lockResult;
  const entryResult = await verifyKdpEntryBytes(installRoot, recordResult.value);
  if (!entryResult.ok) return entryResult;
  return {
    ok: true,
    value: {
      record: recordResult.value,
      lock: lockResult.value,
      entryPath: entryResult.value,
      context: normalized.value,
    },
  };
}
