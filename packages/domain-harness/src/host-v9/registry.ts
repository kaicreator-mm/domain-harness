/**
 * DomainHarness v0.9 N06 (#1032) — protected H registry logical layer.
 * =====================================================================
 *
 * Implements the frozen L2 §11 D02 boundary for the first Node24 cohort,
 * over the injected typed storage port (`store-port.ts`; the physical
 * true-CAS store itself is #1028):
 *
 *  - `install(sealedQualifiedRoot, approval, audience)` is the TRUSTED
 *    governance-only entry. It executes NO Domain Package source (inert):
 *    it validates the full sealed-root structure/roles, re-hashes every
 *    package's exact bytes, re-runs the pinned-parser zero-import AST gate
 *    on those bytes, recomputes the `dh.v9.qualified-root.subject/1`
 *    subject digest, verifies the external approval attestation, and only
 *    then stores the immutable content-addressed artifact + approval + a
 *    fresh opaque random installed-reference via CAS create-if-absent
 *    writes.
 *
 *  - `activate(installedRef)` accepts ONLY the Host-issued opaque reference
 *    STRING (no raw-root, no object alternative, no caller-supplied
 *    verifier/Host port). Every activation re-resolves the reference,
 *    re-checks the audience/app/subject/issuer/ABI binding, re-verifies the
 *    stored bytes (SHA-256) and re-runs the zero-import AST gate on the
 *    stored bytes, and re-verifies the current approval attestation. Its
 *    FINAL pre-import step is the shared per-subject CAS authority commit:
 *    a conditional epoch transition on ONE store key per subjectDigest that
 *    is ALSO the key revocation commits through, so activation and revoke
 *    share exactly one CAS linearization point. The conditional write is the
 *    actual activation decision: a revocation that committed earlier either
 *    shows in the observed authority state (typed refusal) or consumes the
 *    expected revision (conflict → re-read → typed refusal), so no
 *    activation can commit an import past an already-committed revocation
 *    (frozen L2 §11 D02). Activation then maps each verified package byte
 *    source to a private Node `data:` ESM URL carrying a fresh nonsecret
 *    per-activation cache discriminator scoped by
 *    (hostAudience, subjectDigest, installedReference, activationNonce,
 *    packageId, moduleSha256), so repeated activations never share mutable
 *    module state. One CAS activation decision record (auditing the
 *    committed authority epoch) is written per activation.
 *
 *  - `revoke(subjectDigest, reason)` is the governance revocation entry; it
 *    commits the revocation record onto the SAME shared per-subject
 *    authority key (conditional create over absent, CAS over a live epoch),
 *    so revoke and activation decide their order at one physical CAS point
 *    instead of two independent keys. A revocation that lands before an
 *    activation's authority commit refuses that activation before any
 *    import. Already-started in-flight work (activation committed before
 *    the revocation landed) is NOT retroactively rolled back (honest
 *    in-flight rule, D02/D03); teardown of loaded resources is lifecycle
 *    integration owned by #1036.
 *
 *  - `load(installedRef)` is the public one-argument forward: exactly one
 *    string into the protected path, with every refusal collapsed into the
 *    caller-visible public family error (`V09PublicRefusalError`:
 *    `PACKAGE_NOT_AUTHORIZED` plus the separate ABI/lifecycle families, a
 *    CONSTANT message per family, and NO protected subcode, `cause` or any
 *    other extra enumerable field — byte-identical per family). The
 *    protected typed diagnostic subcode is recorded on the H-private
 *    trusted diagnostics channel and never travels on the public error
 *    (D04). The public record is redacted — it carries no module
 *    namespace; the namespace-bearing activation record stays on the
 *    protected path for the Microkernel bootstrap (#1036 integration). The
 *    public `./v9` facade and its names are #1035.
 *
 * D03 boundary (per-op H→K principal tokens and one-shot effect permits) is
 * #1036's and is deliberately absent here; nothing in this module mints a
 * principal, a permit or an authorization from caller input.
 */

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { canonicalSnapshot } from '../public-v8/contracts.js';
import { computeV09SealedRootSubjectDigest, V09_IMPORT_POLICY_REVISION, V09_SEALED_ROOT_FORMAT } from './digest.js';
import { governanceRefusal, publicRefusal, V09HostError, V09ProtectedDiagnosticChannel, V09_PUBLIC_FAMILY_HOST_ABI, V09_PUBLIC_FAMILY_LIFECYCLE, V09_PUBLIC_FAMILY_NOT_AUTHORIZED, V09_PUBLIC_FAMILY_RUNTIME_ABI, type V09ProtectedDiagnostic, type V09PublicFamily, type V09PublicRefusalError } from './errors.js';
import { assertZeroImportEsmModule } from './ast-gate.js';
import { verifyV09ApprovalProof, type V09ApprovalProof, type V09TrustedIssuers } from './approval.js';
import { probeV09Store, storeFailureToHostError, V09HostStoreError, type V09HostDocumentStore, type V09StoreDocument, type V09StorePutCondition } from './store-port.js';

const HEX64 = /^[0-9a-f]{64}$/;
const PACKAGE_KINDS = new Set(['kernel', 'standard-sdk', 'business', 'capability']);
const ROOT_FIELDS = new Set(['formatVersion', 'subjectDigest', 'rootPackageId', 'buildId', 'bundlerRevision', 'importPolicyRevision', 'runtimeAbi', 'hostAbi', 'packages', 'bindings']);
const PACKAGE_FIELDS = new Set(['packageId', 'kind', 'abiVersion', 'moduleSource', 'moduleSha256', 'imports']);
const ROLE_BINDING_FIELDS = new Set(['role', 'packageId', 'endpointId']);
const INTENT_BINDING_FIELDS = new Set(['role', 'intentType', 'packageId', 'endpointId']);
const CAPABILITY_BINDING_FIELDS = new Set(['role', 'capabilityId', 'packageId', 'endpointId', 'handlers']);
const ROUTE_BINDING_FIELDS = new Set(['role', 'intentId', 'operationId', 'capabilityId', 'handlerId']);
const HANDLER_FIELDS = new Set(['operationId', 'handler']);
const CLOSED_ROLES = new Set(['kernel', 'standard-sdk', 'business']);
const MAX_ITEMS = 256;
const MAX_STRING = 512;

/** The single self-contained ESM module artifact of one v0.9 package. */
export interface V09SealedPackageData {
  readonly packageId: string;
  readonly kind: string;
  readonly abiVersion: string;
  readonly moduleSource: string;
  readonly moduleSha256: string;
  readonly imports: readonly [];
}

/** Ordered binding records sealed into the subject (roles, intents, capabilities, v0.9 route rows). */
export type V09BindingRecord =
  | Readonly<{ role: 'kernel' | 'standard-sdk' | 'business'; packageId: string; endpointId: string }>
  | Readonly<{ role: 'intent'; intentType: string; packageId: string; endpointId: string }>
  | Readonly<{ role: 'capability'; capabilityId: string; packageId: string; endpointId: string; handlers: readonly { operationId: string; handler: string }[] }>
  | Readonly<{ role: 'route'; intentId: string; operationId: string; capabilityId: string; handlerId: string }>;

/** The v0.9 sealed qualified root produced by BUILD and installed by governance. */
export interface V09SealedQualifiedRootData {
  readonly formatVersion: typeof V09_SEALED_ROOT_FORMAT;
  readonly subjectDigest: string;
  readonly rootPackageId: string;
  readonly buildId: string;
  readonly bundlerRevision: string;
  readonly importPolicyRevision: string;
  readonly runtimeAbi: string;
  readonly hostAbi: string;
  readonly packages: readonly V09SealedPackageData[];
  readonly bindings: readonly V09BindingRecord[];
}

/** Namespace-bearing activation record — PROTECTED path only (Microkernel bootstrap). */
export interface V09ActivationRecord {
  readonly installedRef: string;
  readonly activationNonce: string;
  readonly subjectDigest: string;
  readonly rootPackageId: string;
  readonly runtimeAbi: string;
  readonly hostAbi: string;
  readonly packages: readonly { packageId: string; kind: string; moduleSha256: string }[];
  readonly namespaces: ReadonlyMap<string, Record<string, unknown>>;
}

/** Redacted record returned by the public one-argument `load` forward. */
export interface V09LoadedPackageRecord {
  readonly installedRef: string;
  readonly activationNonce: string;
  readonly subjectDigest: string;
  readonly rootPackageId: string;
  readonly runtimeAbi: string;
  readonly hostAbi: string;
  readonly packages: readonly { packageId: string; kind: string; moduleSha256: string }[];
}

export interface ProtectedHostV09Options {
  /** Injected typed physical store (#1028 implements it; probed at bootstrap). */
  readonly store: V09HostDocumentStore;
  /** Trusted issuer registry supplied by the governance/Host bootstrap. */
  readonly trustedIssuers: V09TrustedIssuers;
  /** The single host audience this registry serves. */
  readonly audience: string;
  readonly runtimeAbi: string;
  readonly hostAbi: string;
}

export interface ProtectedHostV09 {
  readonly audience: string;
  readonly runtimeAbi: string;
  readonly hostAbi: string;
  /** Governance-only inert installation; issues a fresh opaque installedRef. */
  install(sealedRoot: unknown, approval: unknown, audience: unknown): Promise<{
    readonly installedRef: string;
    readonly subjectDigest: string;
    readonly rootPackageId: string;
  }>;
  /** Protected activation of one installed reference string. */
  activate(installedRef: unknown): Promise<V09ActivationRecord>;
  /** Public one-argument forward: exactly one installed-reference string. */
  load(installedRef: unknown): Promise<V09LoadedPackageRecord>;
  /** Governance revocation (shared per-subject CAS authority; first revoke wins). */
  revoke(subjectDigest: unknown, reason: unknown): Promise<{ readonly subjectDigest: string; readonly revokedAt: string }>;
  /** Governance/trusted-internal drain of the protected diagnostics channel (never public). */
  drainProtectedDiagnostics(): readonly V09ProtectedDiagnostic[];
  close(): Promise<void>;
}

function fail(code: string, message: string): never {
  throw governanceRefusal(code, message);
}

function boundedString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_STRING) {
    fail('BUILD_GRAPH_INVALID', `${label} must be a non-empty string of at most ${String(MAX_STRING)} characters`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function strictFields(value: Record<string, unknown>, allowed: Set<string>, label: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      fail('BUILD_GRAPH_INVALID', `${label} carries unknown field '${key}'; the qualified-root boundary refuses unknown fields and aliases instead of ignoring them`);
    }
  }
}

function hex64(value: unknown, label: string): string {
  if (typeof value !== 'string' || !HEX64.test(value)) {
    fail('BUILD_GRAPH_INVALID', `${label} must be a lowercase hex sha-256 digest`);
  }
  return value;
}

function bytesSha256(source: string): string {
  return createHash('sha256').update(source, 'utf8').digest('hex');
}

/**
 * Canonical-snapshot the untrusted presentation first (hostile accessors
 * refused unread), then strict-shape it into a v0.9 sealed-root view. Used
 * at install (governance input) and again at activation (stored artifact).
 */
export function parseV09SealedRoot(input: unknown): V09SealedQualifiedRootData {
  let snapshot: unknown;
  try {
    snapshot = canonicalSnapshot(input);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail('BUILD_GRAPH_INVALID', `the sealed qualified root is not strict canonical plain data: ${detail}`);
  }
  if (!isRecord(snapshot)) {
    fail('BUILD_GRAPH_INVALID', 'the sealed qualified root must be a record');
  }
  strictFields(snapshot, ROOT_FIELDS, 'sealed root');
  if (snapshot.formatVersion !== V09_SEALED_ROOT_FORMAT) {
    fail('BUILD_GRAPH_INVALID', `sealed root formatVersion must be ${V09_SEALED_ROOT_FORMAT}`);
  }
  const rootPackageId = boundedString(snapshot.rootPackageId, 'sealed root rootPackageId');
  const buildId = boundedString(snapshot.buildId, 'sealed root buildId');
  const bundlerRevision = boundedString(snapshot.bundlerRevision, 'sealed root bundlerRevision');
  const importPolicyRevision = boundedString(snapshot.importPolicyRevision, 'sealed root importPolicyRevision');
  if (importPolicyRevision !== V09_IMPORT_POLICY_REVISION) {
    fail('BUILD_GRAPH_INVALID', `sealed root importPolicyRevision must be ${V09_IMPORT_POLICY_REVISION} for the first cohort`);
  }
  const runtimeAbi = boundedString(snapshot.runtimeAbi, 'sealed root runtimeAbi');
  const hostAbi = boundedString(snapshot.hostAbi, 'sealed root hostAbi');
  const subjectDigest = hex64(snapshot.subjectDigest, 'sealed root subjectDigest');

  const packagesValue: unknown = snapshot.packages;
  const bindingsValue: unknown = snapshot.bindings;
  if (!Array.isArray(packagesValue) || packagesValue.length === 0 || packagesValue.length > MAX_ITEMS) {
    fail('BUILD_GRAPH_INVALID', 'sealed root must carry a non-empty bounded packages array');
  }
  if (!Array.isArray(bindingsValue) || bindingsValue.length > MAX_ITEMS) {
    fail('BUILD_GRAPH_INVALID', 'sealed root must carry a bounded bindings array');
  }

  const packages: V09SealedPackageData[] = [];
  const packageIds = new Set<string>();
  for (const raw of packagesValue) {
    if (!isRecord(raw)) {
      fail('BUILD_GRAPH_INVALID', 'each sealed package must be a record');
    }
    strictFields(raw, PACKAGE_FIELDS, 'sealed package');
    const packageId = boundedString(raw.packageId, 'sealed package packageId');
    if (packageIds.has(packageId)) {
      fail('BUILD_GRAPH_INVALID', `duplicate sealed package ${packageId}`);
    }
    packageIds.add(packageId);
    const kind = boundedString(raw.kind, `package ${packageId} kind`);
    if (!PACKAGE_KINDS.has(kind)) {
      fail('BUILD_GRAPH_INVALID', `package ${packageId} has unknown kind ${kind}`);
    }
    const abiVersion = boundedString(raw.abiVersion, `package ${packageId} abiVersion`);
    const moduleSha256 = hex64(raw.moduleSha256, `package ${packageId} moduleSha256`);
    if (typeof raw.moduleSource !== 'string' || raw.moduleSource.length === 0) {
      fail('BUILD_GRAPH_INVALID', `package ${packageId} must carry non-empty sealed module source bytes`);
    }
    if (!Array.isArray(raw.imports) || raw.imports.length !== 0) {
      fail('BUILD_GRAPH_INVALID', `package ${packageId} imports must be exactly [] (the first-cohort package import allowlist is EMPTY)`);
    }
    packages.push(Object.freeze({ packageId, kind, abiVersion, moduleSource: raw.moduleSource, moduleSha256, imports: [] as const }));
  }

  const bindings: V09BindingRecord[] = [];
  const capabilityIds = new Set<string>();
  const capabilityBoundPackages = new Set<string>();
  const roleCounts = new Map<string, number>([['kernel', 0], ['standard-sdk', 0], ['business', 0]]);
  const routeKeys = new Set<string>();
  for (const raw of bindingsValue) {
    if (!isRecord(raw)) {
      fail('BUILD_GRAPH_INVALID', 'each sealed binding must be a record');
    }
    const role = raw.role;
    if (typeof role !== 'string') {
      fail('BUILD_GRAPH_INVALID', 'sealed binding role must be a string');
    }
    if (CLOSED_ROLES.has(role)) {
      strictFields(raw, ROLE_BINDING_FIELDS, `${role} binding`);
      const packageId = boundedString(raw.packageId, `${role} binding packageId`);
      const endpointId = boundedString(raw.endpointId, `${role} binding endpointId`);
      if (!packageIds.has(packageId)) {
        fail('BUILD_GRAPH_INVALID', `${role} binding references unknown package ${packageId}`);
      }
      roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
      bindings.push(Object.freeze({ role: role as 'kernel' | 'standard-sdk' | 'business', packageId, endpointId }));
      continue;
    }
    if (role === 'intent') {
      strictFields(raw, INTENT_BINDING_FIELDS, 'intent binding');
      const intentType = boundedString(raw.intentType, 'intent binding intentType');
      const packageId = boundedString(raw.packageId, 'intent binding packageId');
      const endpointId = boundedString(raw.endpointId, 'intent binding endpointId');
      if (!packageIds.has(packageId)) {
        fail('BUILD_GRAPH_INVALID', `intent binding ${intentType} references unknown package ${packageId}`);
      }
      bindings.push(Object.freeze({ role: 'intent', intentType, packageId, endpointId }));
      continue;
    }
    if (role === 'capability') {
      strictFields(raw, CAPABILITY_BINDING_FIELDS, 'capability binding');
      const capabilityId = boundedString(raw.capabilityId, 'capability binding capabilityId');
      const packageId = boundedString(raw.packageId, 'capability binding packageId');
      const endpointId = boundedString(raw.endpointId, 'capability binding endpointId');
      if (!packageIds.has(packageId)) {
        fail('BUILD_GRAPH_INVALID', `capability ${capabilityId} references unknown package ${packageId}`);
      }
      if (capabilityIds.has(capabilityId)) {
        fail('BUILD_GRAPH_INVALID', `capability identity ${capabilityId} is bound more than once; capability identities must stay injective`);
      }
      capabilityIds.add(capabilityId);
      capabilityBoundPackages.add(packageId);
      const handlersValue: unknown = raw.handlers;
      if (!Array.isArray(handlersValue) || handlersValue.length === 0 || handlersValue.length > MAX_ITEMS) {
        fail('BUILD_GRAPH_INVALID', `capability ${capabilityId} must carry a non-empty bounded operation→handler map`);
      }
      const operations = new Set<string>();
      const handlers: { operationId: string; handler: string }[] = [];
      for (const handlerRaw of handlersValue) {
        if (!isRecord(handlerRaw)) {
          fail('BUILD_GRAPH_INVALID', `capability ${capabilityId} handler entry must be a record`);
        }
        strictFields(handlerRaw, HANDLER_FIELDS, `capability ${capabilityId} handler`);
        const operationId = boundedString(handlerRaw.operationId, `capability ${capabilityId} handler operationId`);
        const handler = boundedString(handlerRaw.handler, `capability ${capabilityId} handler handler`);
        if (operations.has(operationId)) {
          fail('BUILD_GRAPH_INVALID', `capability ${capabilityId} binds operation ${operationId} more than once`);
        }
        operations.add(operationId);
        handlers.push({ operationId, handler });
      }
      bindings.push(Object.freeze({ role: 'capability', capabilityId, packageId, endpointId, handlers: Object.freeze(handlers) }));
      continue;
    }
    if (role === 'route') {
      strictFields(raw, ROUTE_BINDING_FIELDS, 'route binding');
      const intentId = boundedString(raw.intentId, 'route binding intentId');
      const operationId = boundedString(raw.operationId, 'route binding operationId');
      const capabilityId = boundedString(raw.capabilityId, 'route binding capabilityId');
      const handlerId = boundedString(raw.handlerId, 'route binding handlerId');
      const key = `${intentId}\u0000${operationId}`;
      if (routeKeys.has(key)) {
        fail('BUILD_GRAPH_INVALID', `duplicate route binding for intent ${intentId} → operation ${operationId}`);
      }
      routeKeys.add(key);
      bindings.push(Object.freeze({ role: 'route', intentId, operationId, capabilityId, handlerId }));
      continue;
    }
    fail('BUILD_GRAPH_INVALID', `unknown sealed binding role ${role}`);
  }

  for (const pkg of packages) {
    if (pkg.kind === 'capability' && !capabilityBoundPackages.has(pkg.packageId)) {
      fail('BUILD_GRAPH_INVALID', `capability package ${pkg.packageId} is not covered by exactly one capability binding; it can never become executable`);
    }
  }
  if ((roleCounts.get('kernel') ?? 0) !== 1) {
    fail('BUILD_GRAPH_INVALID', 'the sealed closure must select exactly one Kernel role binding');
  }
  if ((roleCounts.get('standard-sdk') ?? 0) !== 1) {
    fail('BUILD_GRAPH_INVALID', 'the sealed closure must select exactly one Standard role binding');
  }
  if ((roleCounts.get('business') ?? 0) < 1) {
    fail('BUILD_GRAPH_INVALID', 'the sealed closure must select at least one Business role binding');
  }

  return Object.freeze({
    formatVersion: V09_SEALED_ROOT_FORMAT,
    subjectDigest,
    rootPackageId,
    buildId,
    bundlerRevision,
    importPolicyRevision,
    runtimeAbi,
    hostAbi,
    packages: Object.freeze(packages),
    bindings: Object.freeze(bindings),
  });
}

function subjectDigestOf(root: V09SealedQualifiedRootData): string {
  return computeV09SealedRootSubjectDigest({
    rootPackageId: root.rootPackageId,
    buildId: root.buildId,
    bundlerRevision: root.bundlerRevision,
    importPolicyRevision: root.importPolicyRevision,
    runtimeAbi: root.runtimeAbi,
    hostAbi: root.hostAbi,
    packages: root.packages,
    bindings: root.bindings,
  });
}

function canonicalEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

interface V09ReferenceDoc {
  readonly kind: 'v9/installed-reference';
  readonly hostAudience: string;
  readonly appId: string;
  readonly rootPackageId: string;
  readonly subjectDigest: string;
  readonly issuerId: string;
  readonly proofDigest: string;
  readonly runtimeAbi: string;
  readonly hostAbi: string;
  readonly installedAt: string;
}

const REF_PREFIX = 'v9/ref/';
const ARTIFACT_PREFIX = 'v9/artifact/';
const APPROVAL_PREFIX = 'v9/approval/';
const REVOCATION_PREFIX = 'v9/revocation/';
const ACTIVATION_PREFIX = 'v9/activation/';

function artifactKey(subjectDigest: string): string {
  return `${ARTIFACT_PREFIX}${subjectDigest}`;
}

function approvalKey(subjectDigest: string): string {
  return `${APPROVAL_PREFIX}${subjectDigest}`;
}

function revocationKey(subjectDigest: string): string {
  return `${REVOCATION_PREFIX}${subjectDigest}`;
}

function refKey(installedRef: string): string {
  return `${REF_PREFIX}${installedRef}`;
}

function activationKey(installedRef: string, nonce: string): string {
  return `${ACTIVATION_PREFIX}${installedRef}/${nonce}`;
}

/**
 * The ONE shared per-subject CAS authority: a single store key per
 * subjectDigest (the revocation key) through which BOTH the activation
 * decision and the governance revocation commit their transition as a
 * conditional write. The key holds either a live epoch record or the
 * revocation record, so the store's serial CAS order — not two independent
 * keys — decides revoke-vs-activate (frozen L2 §11 D02).
 */
interface V09SubjectEpochDoc {
  readonly kind: 'v9/subject-epoch';
  readonly subjectDigest: string;
  readonly epoch: number;
}

interface V09SubjectRevocationDoc {
  readonly kind: 'v9/revocation';
  readonly subjectDigest: string;
  readonly revokedAt: string;
  readonly reason: string;
  readonly epoch: number;
}

type V09SubjectAuthorityState =
  | { readonly status: 'absent' }
  | { readonly status: 'active'; readonly epoch: number; readonly revision: number }
  | { readonly status: 'revoked'; readonly revision: number };

/** Bounded retry budget for authority transitions under physical contention. */
const SUBJECT_AUTHORITY_ATTEMPTS = 8;

/**
 * Nonsecret per-activation `data:` URL cache discriminator scoped by
 * (hostAudience, subjectDigest, installedReference, activationNonce,
 * packageId, moduleSha256) — D01. Fresh per activation, never caller
 * supplied, never reused across activations.
 */
function dataModuleUrl(root: V09SealedQualifiedRootData, audience: string, installedRef: string, nonce: string, pkg: V09SealedPackageData): string {
  const tuple = JSON.stringify({
    audience,
    subjectDigest: root.subjectDigest,
    installedReference: installedRef,
    activationNonce: nonce,
    packageId: pkg.packageId,
    moduleSha256: pkg.moduleSha256,
  });
  const discriminator = `dhv9-${Buffer.from(tuple, 'utf8').toString('base64url')}`;
  return `data:text/javascript;base64,${Buffer.from(pkg.moduleSource, 'utf8').toString('base64')}#${discriminator}`;
}

function artifactValue(root: V09SealedQualifiedRootData): Record<string, unknown> {
  return {
    formatVersion: root.formatVersion,
    subjectDigest: root.subjectDigest,
    rootPackageId: root.rootPackageId,
    buildId: root.buildId,
    bundlerRevision: root.bundlerRevision,
    importPolicyRevision: root.importPolicyRevision,
    runtimeAbi: root.runtimeAbi,
    hostAbi: root.hostAbi,
    packages: root.packages.map((pkg) => ({ ...pkg, imports: [...pkg.imports] })),
    bindings: root.bindings,
  };
}

interface V09PublicRefusalPlan {
  /** The stripped public error thrown to the untrusted caller. */
  readonly refusal: V09PublicRefusalError;
  /** Protected typed subcode — for the H-private diagnostics channel ONLY. */
  readonly diagnosticCode: string;
}

/** Map any protected-path refusal onto the D04 caller-visible families. */
function toPublicLoadError(error: unknown): V09PublicRefusalPlan {
  const plan = (family: V09PublicFamily, diagnosticCode: string): V09PublicRefusalPlan => ({
    refusal: publicRefusal(family, diagnosticCode),
    diagnosticCode,
  });
  if (!(error instanceof V09HostError)) {
    return plan(V09_PUBLIC_FAMILY_NOT_AUTHORIZED, 'UNKNOWN_REFUSAL');
  }
  switch (error.code) {
    case 'UNSUPPORTED_RUNTIME_ABI':
      return plan(V09_PUBLIC_FAMILY_RUNTIME_ABI, error.diagnosticCode);
    case 'UNSUPPORTED_HOST_ABI':
      return plan(V09_PUBLIC_FAMILY_HOST_ABI, error.diagnosticCode);
    case 'ACTIVATION_EVAL_FAILED':
      return plan(V09_PUBLIC_FAMILY_LIFECYCLE, error.diagnosticCode);
    default:
      return plan(V09_PUBLIC_FAMILY_NOT_AUTHORIZED, error.diagnosticCode);
  }
}

/**
 * Create the protected H registry bound to one injected store, one trusted
 * issuer registry and one audience. The store must pass the physical true-CAS
 * probe or the bootstrap refuses typed — a non-CAS store can never back the
 * protected registry (fail closed, D02).
 */
export async function createProtectedHostV09(options: ProtectedHostV09Options): Promise<ProtectedHostV09> {
  if (typeof options !== 'object' || options === null) {
    fail('HOST_INPUT_INVALID', 'createProtectedHostV09 requires an options record');
  }
  const { store, trustedIssuers, audience, runtimeAbi, hostAbi } = options;
  if (typeof store !== 'object' || store === null || typeof store.get !== 'function' || typeof store.put !== 'function' || typeof store.close !== 'function') {
    fail('HOST_INPUT_INVALID', 'createProtectedHostV09 requires an injected V09HostDocumentStore with get/put/close');
  }
  if (!(trustedIssuers instanceof Map) || trustedIssuers.size === 0) {
    fail('HOST_INPUT_INVALID', 'createProtectedHostV09 requires a non-empty trusted issuer registry Map (issuerId → secret)');
  }
  for (const [issuerId, secret] of trustedIssuers) {
    if (typeof issuerId !== 'string' || issuerId.length === 0 || typeof secret !== 'string' || secret.length === 0) {
      fail('HOST_INPUT_INVALID', 'trusted issuer registry entries must be non-empty issuerId/secret strings');
    }
  }
  const hostAudience = boundedString(audience, 'host audience');
  const hostRuntimeAbi = boundedString(runtimeAbi, 'host runtimeAbi');
  const hostHostAbi = boundedString(hostAbi, 'host hostAbi');
  try {
    await probeV09Store(store);
  } catch (error) {
    if (error instanceof V09HostError) {
      throw error;
    }
    throw storeFailureToHostError(error, 'protected H store bootstrap probe');
  }

  async function createIfAbsent(key: string, value: unknown, operation: string): Promise<void> {
    try {
      await store.put(key, value, { kind: 'create' });
    } catch (error) {
      throw storeFailureToHostError(error, operation);
    }
  }

  /** Content-addressed immutable install: idempotent for identical content, hard conflict otherwise. */
  async function installContentAddressed(key: string, value: Record<string, unknown>, operation: string): Promise<void> {
    let existing: unknown;
    try {
      const doc = await store.get(key);
      existing = doc === null ? null : doc.value;
    } catch (error) {
      throw storeFailureToHostError(error, operation);
    }
    if (existing !== null) {
      if (canonicalEqual(existing, value)) {
        return;
      }
      fail('INSTALL_ARTIFACT_CONFLICT', `${operation}: ${key} already holds different content under the same digest; refusing instead of overwriting immutable bytes`);
    }
    try {
      await store.put(key, value, { kind: 'create' });
    } catch (error) {
      if (error instanceof V09HostStoreError && error.code === 'V09_STORE_CONFLICT') {
        // A concurrent install of the identical content won the race; the
        // artifact is content-addressed, so verify it really is identical.
        const doc = await store.get(key);
        if (doc !== null && canonicalEqual(doc.value, value)) {
          return;
        }
        fail('INSTALL_ARTIFACT_CONFLICT', `${operation}: ${key} conflicts with divergent concurrent content; refusing instead of overwriting immutable bytes`);
      }
      throw storeFailureToHostError(error, operation);
    }
  }

  /** H-private trusted diagnostics channel for public-refusal subcodes (D04). */
  const protectedDiagnostics = new V09ProtectedDiagnosticChannel();

  /**
   * Observe the shared per-subject CAS authority. Fails closed typed on ANY
   * store failure and on an unrecognized record shape — the authority is
   * never degraded into an unguarded read.
   */
  async function readSubjectAuthority(subjectDigest: string, operation: string): Promise<V09SubjectAuthorityState> {
    let doc: V09StoreDocument | null;
    try {
      doc = await store.get(revocationKey(subjectDigest));
    } catch (error) {
      throw storeFailureToHostError(error, operation);
    }
    if (doc === null) {
      return { status: 'absent' };
    }
    const value: unknown = doc.value;
    if (isRecord(value) && value.kind === 'v9/revocation') {
      return { status: 'revoked', revision: doc.revision };
    }
    if (isRecord(value) && value.kind === 'v9/subject-epoch' && typeof value.epoch === 'number' && Number.isSafeInteger(value.epoch) && value.epoch >= 1) {
      return { status: 'active', epoch: value.epoch, revision: doc.revision };
    }
    fail('SUBJECT_AUTHORITY_INVALID', `${operation}: ${revocationKey(subjectDigest)} holds an unrecognized authority record; the shared CAS authority fails closed instead of guessing`);
  }

  /**
   * D02 linearization: commit THIS activation's epoch transition on the
   * shared per-subject CAS authority. The conditional write is the actual
   * activation commit/linearization point — it lands only while the
   * authority is still live at the observed revision. A revocation that
   * committed before it either shows in the observed state (typed refusal
   * before any import) or consumes the expected revision (V09_STORE_CONFLICT
   * → re-read → typed refusal), so no activation can commit past an
   * already-committed revocation. The honest in-flight rule is untouched: a
   * revocation landing AFTER this write does not retroactively cancel this
   * activation. Returns the committed epoch for the audit record.
   */
  async function commitActivationEpoch(subjectDigest: string): Promise<number> {
    for (let attempt = 0; attempt < SUBJECT_AUTHORITY_ATTEMPTS; attempt += 1) {
      const state = await readSubjectAuthority(subjectDigest, 'activation authority read');
      if (state.status === 'revoked') {
        fail('APPROVAL_REVOKED', 'the approval for this installed subject has been revoked; activation is refused at the shared per-subject CAS authority before any module import');
      }
      const next: V09SubjectEpochDoc = {
        kind: 'v9/subject-epoch',
        subjectDigest,
        epoch: state.status === 'active' ? state.epoch + 1 : 1,
      };
      const condition: V09StorePutCondition = state.status === 'active' ? { kind: 'cas', revision: state.revision } : { kind: 'create' };
      try {
        await store.put(revocationKey(subjectDigest), next, condition);
        return next.epoch;
      } catch (error) {
        if (error instanceof V09HostStoreError && error.code === 'V09_STORE_CONFLICT') {
          continue; // a concurrent transition won the revision; the next iteration re-reads and decides (revoked → typed refusal)
        }
        throw storeFailureToHostError(error, 'activation authority commit');
      }
    }
    fail('SUBJECT_AUTHORITY_CONTENTION', 'the shared per-subject CAS authority kept conflicting under sustained contention; activation fails closed instead of racing');
  }

  async function installImpl(sealedRoot: unknown, approval: unknown, audience: unknown): Promise<{
    readonly installedRef: string;
    readonly subjectDigest: string;
    readonly rootPackageId: string;
  }> {
    const installAudience = boundedString(audience, 'install audience');
    if (installAudience !== hostAudience) {
      fail('INSTALL_AUDIENCE_MISMATCH', `install targets audience ${installAudience} but this protected host serves ${hostAudience}`);
    }
    const root = parseV09SealedRoot(sealedRoot);
    // Byte identity + the SAME zero-import AST gate BUILD ran, repeated on
    // the exact presented bytes BEFORE anything is stored (inert: nothing
    // here evaluates package source).
    for (const pkg of root.packages) {
      const actual = bytesSha256(pkg.moduleSource);
      if (actual !== pkg.moduleSha256) {
        fail('PACKAGE_BYTES_MISMATCH', `package ${pkg.packageId}: sealed moduleSha256 ${pkg.moduleSha256} does not match the presented module bytes (actual ${actual}); mutated bytes are refused before installation`);
      }
      assertZeroImportEsmModule(`${pkg.packageId}/${pkg.moduleSha256}`, pkg.moduleSource);
    }
    const recomputed = subjectDigestOf(root);
    if (recomputed !== root.subjectDigest) {
      fail('BUILD_GRAPH_INVALID', `sealed root subjectDigest ${root.subjectDigest} does not match the recomputed v0.9 subject digest ${recomputed}; subject drift is refused`);
    }
    const proof: V09ApprovalProof = verifyV09ApprovalProof(approval, root.subjectDigest, trustedIssuers);

    await installContentAddressed(artifactKey(root.subjectDigest), artifactValue(root), 'artifact install');
    await installContentAddressed(approvalKey(root.subjectDigest), proof as unknown as Record<string, unknown>, 'approval install');

    // Fresh opaque random installed reference bound to the exact D02 tuple.
    let lastConflict = false;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const installedRef = `dhv9inst-${randomBytes(32).toString('base64url')}`;
      const doc: V09ReferenceDoc = {
        kind: 'v9/installed-reference',
        hostAudience,
        appId: root.rootPackageId,
        rootPackageId: root.rootPackageId,
        subjectDigest: root.subjectDigest,
        issuerId: proof.issuerId,
        proofDigest: proof.proofDigest,
        runtimeAbi: root.runtimeAbi,
        hostAbi: root.hostAbi,
        installedAt: new Date().toISOString(),
      };
      try {
        await store.put(refKey(installedRef), doc, { kind: 'create' });
        return Object.freeze({ installedRef, subjectDigest: root.subjectDigest, rootPackageId: root.rootPackageId });
      } catch (error) {
        if (error instanceof V09HostStoreError && error.code === 'V09_STORE_CONFLICT') {
          lastConflict = true;
          continue;
        }
        throw storeFailureToHostError(error, 'installed-reference create');
      }
    }
    fail('INSTALL_REFERENCE_COLLISION', `the fresh installed-reference creation conflicted repeatedly (${String(lastConflict)}); refusing instead of reusing a reference`);
  }

  async function activateImpl(installedRef: unknown): Promise<V09ActivationRecord> {
    // The ONE public input shape: the opaque reference string. Objects,
    // raw roots, numbers — everything else is refused before any lookup.
    if (typeof installedRef !== 'string' || installedRef.length === 0 || installedRef.length > MAX_STRING) {
      fail('INSTALL_HANDLE_UNKNOWN', 'activate accepts exactly one Host-issued installed-reference string');
    }
    let refValue: unknown;
    try {
      const doc = await store.get(refKey(installedRef));
      refValue = doc === null ? null : doc.value;
    } catch (error) {
      throw storeFailureToHostError(error, 'installed-reference lookup');
    }
    if (!isRecord(refValue) || refValue.kind !== 'v9/installed-reference') {
      fail('INSTALL_HANDLE_UNKNOWN', 'installed reference is unknown to this protected host registry');
    }
    const refDoc = refValue as unknown as V09ReferenceDoc;
    if (refDoc.hostAudience !== hostAudience) {
      fail('INSTALL_AUDIENCE_MISMATCH', `installed reference is bound to audience ${refDoc.hostAudience}; this host serves ${hostAudience}`);
    }
    if (refDoc.runtimeAbi !== hostRuntimeAbi) {
      fail('UNSUPPORTED_RUNTIME_ABI', `installed reference requires runtime ABI ${refDoc.runtimeAbi}; this host supports ${hostRuntimeAbi}`);
    }
    if (refDoc.hostAbi !== hostHostAbi) {
      fail('UNSUPPORTED_HOST_ABI', `installed reference requires Host ABI ${refDoc.hostAbi}; this host implements ${hostHostAbi}`);
    }

    let artifact: unknown;
    try {
      const doc = await store.get(artifactKey(refDoc.subjectDigest));
      artifact = doc === null ? null : doc.value;
    } catch (error) {
      throw storeFailureToHostError(error, 'artifact lookup');
    }
    if (artifact === null) {
      fail('INSTALL_ARTIFACT_MISSING', 'the installed reference resolves to a missing immutable artifact; the registry is inconsistent and fails closed');
    }
    const root = parseV09SealedRoot(artifact);
    const recomputed = subjectDigestOf(root);
    if (recomputed !== root.subjectDigest || root.subjectDigest !== refDoc.subjectDigest) {
      fail('BUILD_GRAPH_INVALID', `stored artifact subject drift: recomputed ${recomputed}, stored ${root.subjectDigest}, reference ${refDoc.subjectDigest}`);
    }

    // Stored bytes are re-hashed and the SAME zero-import AST gate re-runs
    // on the exact stored bytes — before ANY evaluation — even though BUILD
    // already sealed them (D01 protected H repeat).
    for (const pkg of root.packages) {
      const actual = bytesSha256(pkg.moduleSource);
      if (actual !== pkg.moduleSha256) {
        fail('PACKAGE_BYTES_MISMATCH', `package ${pkg.packageId}: stored bytes hash ${actual} but the sealed subject pins ${pkg.moduleSha256}; post-install byte mutation is refused before any import`);
      }
      assertZeroImportEsmModule(`${pkg.packageId}/${pkg.moduleSha256}`, pkg.moduleSource);
    }

    // Current approval attestation + issuer status, at EVERY activation.
    let approvalStored: unknown;
    try {
      const doc = await store.get(approvalKey(root.subjectDigest));
      approvalStored = doc === null ? null : doc.value;
    } catch (error) {
      throw storeFailureToHostError(error, 'approval lookup');
    }
    if (approvalStored === null) {
      fail('INSTALL_APPROVAL_MISSING', 'the installed artifact has no approval record; fail closed');
    }
    const proof = verifyV09ApprovalProof(approvalStored, root.subjectDigest, trustedIssuers);
    if (proof.proofDigest !== refDoc.proofDigest || proof.issuerId !== refDoc.issuerId) {
      fail('APPROVAL_PROOF_INVALID', 'the current approval proof no longer matches the installed reference binding');
    }

    // D02 revocation-vs-activation linearization at the ACTUAL commit point:
    // the conditional write on the shared per-subject CAS authority below is
    // both the revocation re-check and the activation commit — no unguarded
    // window remains between observing the revocation state and committing.
    const authorityEpoch = await commitActivationEpoch(root.subjectDigest);

    const activationNonce = randomUUID();
    await createIfAbsent(
      activationKey(installedRef, activationNonce),
      { kind: 'v9/activation-decision', installedRef, subjectDigest: root.subjectDigest, authorityEpoch, at: new Date().toISOString() },
      'activation decision record',
    );

    // Activation: only now is any package byte evaluated, and only through
    // the private per-activation `data:` URLs (fresh cache identity; no
    // prior instance state can be shared or reused).
    const namespaces = new Map<string, Record<string, unknown>>();
    try {
      for (const pkg of root.packages) {
        const url = dataModuleUrl(root, hostAudience, installedRef, activationNonce, pkg);
        const namespace = (await import(url)) as Record<string, unknown>;
        if (namespace === null || typeof namespace !== 'object') {
          fail('ACTIVATION_EVAL_FAILED', `package ${pkg.packageId} did not evaluate to a module namespace`);
        }
        namespaces.set(pkg.packageId, namespace);
      }
    } catch (error) {
      if (error instanceof V09HostError) {
        throw error;
      }
      const detail = error instanceof Error ? error.message : String(error);
      fail('ACTIVATION_EVAL_FAILED', `package module evaluation failed after the authorization gate (no rollback of already-evaluated modules is claimed): ${detail}`);
    }

    return Object.freeze({
      installedRef,
      activationNonce,
      subjectDigest: root.subjectDigest,
      rootPackageId: root.rootPackageId,
      runtimeAbi: root.runtimeAbi,
      hostAbi: root.hostAbi,
      packages: Object.freeze(root.packages.map((pkg) => Object.freeze({ packageId: pkg.packageId, kind: pkg.kind, moduleSha256: pkg.moduleSha256 }))),
      namespaces: Object.freeze(namespaces),
    }) satisfies V09ActivationRecord;
  }

  async function loadImpl(installedRef: unknown): Promise<V09LoadedPackageRecord> {
    let record: V09ActivationRecord;
    try {
      record = await activateImpl(installedRef);
    } catch (error) {
      const plan = toPublicLoadError(error);
      // D04: the protected typed subcode is recorded on the H-private
      // trusted channel and NEVER travels on the public error object.
      protectedDiagnostics.record({ at: new Date().toISOString(), channel: 'public-load-refusal', family: plan.refusal.code, diagnosticCode: plan.diagnosticCode });
      throw plan.refusal;
    }
    return Object.freeze({
      installedRef: record.installedRef,
      activationNonce: record.activationNonce,
      subjectDigest: record.subjectDigest,
      rootPackageId: record.rootPackageId,
      runtimeAbi: record.runtimeAbi,
      hostAbi: record.hostAbi,
      packages: record.packages,
    }) satisfies V09LoadedPackageRecord;
  }

  async function revokeImpl(subjectDigest: unknown, reason: unknown): Promise<{ readonly subjectDigest: string; readonly revokedAt: string }> {
    const digest = hex64(subjectDigest, 'revocation subjectDigest');
    const reasonText = boundedString(reason, 'revocation reason');
    const revokedAt = new Date().toISOString();
    // The revocation commits through the SAME shared per-subject conditional
    // transition the activation commits through — one common CAS
    // linearization point (D02): whoever's write lands on the authority
    // first wins the physical order, and a revocation landing before an
    // activation's authority commit refuses that activation before any
    // import. `create` bootstraps the authority on a never-touched subject;
    // CAS over a live epoch replaces it with the revocation record.
    for (let attempt = 0; attempt < SUBJECT_AUTHORITY_ATTEMPTS; attempt += 1) {
      const state = await readSubjectAuthority(digest, 'revocation authority read');
      if (state.status === 'revoked') {
        fail('APPROVAL_ALREADY_REVOKED', 'this subject is already revoked; the first revocation wins (shared per-subject CAS authority)');
      }
      const record: V09SubjectRevocationDoc = {
        kind: 'v9/revocation',
        subjectDigest: digest,
        revokedAt,
        reason: reasonText,
        epoch: state.status === 'active' ? state.epoch + 1 : 1,
      };
      const condition: V09StorePutCondition = state.status === 'active' ? { kind: 'cas', revision: state.revision } : { kind: 'create' };
      try {
        await store.put(revocationKey(digest), record, condition);
        return Object.freeze({ subjectDigest: digest, revokedAt });
      } catch (error) {
        if (error instanceof V09HostStoreError && error.code === 'V09_STORE_CONFLICT') {
          continue; // a concurrent activation/revocation transition won; re-read and retry
        }
        throw storeFailureToHostError(error, 'revocation record create');
      }
    }
    fail('SUBJECT_AUTHORITY_CONTENTION', 'the shared per-subject CAS authority kept conflicting under sustained contention; revocation fails closed instead of overwriting');
  }

  async function closeImpl(): Promise<void> {
    try {
      await store.close();
    } catch (error) {
      throw storeFailureToHostError(error, 'store close');
    }
  }

  return Object.freeze({
    audience: hostAudience,
    runtimeAbi: hostRuntimeAbi,
    hostAbi: hostHostAbi,
    install: installImpl,
    activate: activateImpl,
    load: loadImpl,
    revoke: revokeImpl,
    drainProtectedDiagnostics: (): readonly V09ProtectedDiagnostic[] => protectedDiagnostics.drain(),
    close: closeImpl,
  }) satisfies ProtectedHostV09;
}
