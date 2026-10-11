/**
 * v0.8 qualified package/component ABI — public contract (T-A, #1000).
 * =========================================================================
 *
 * Frozen source basis: #1000 L3 pack; L2 freeze facts (#999@6108813765):
 * public `DomainHarness.load(package)` loads ONE fully selected/approved
 * sealed package closure — one Kernel (K), one Standard SDK (S), one or more
 * Business (B) packages. There is no `compiledApp` and no public
 * Host-verifier/port argument. BUILD qualification and external approval
 * happen in `@kaicreator/domain-harness-compiler`; this module defines only
 * the generic, domain-neutral sealed-root shapes, the ABI knowledge the
 * installer needs, the approval binding checks, and the typed error
 * taxonomy.
 *
 * Selectively adapted from the pinned research sources (exact SHAs in
 * docs/research/V08_PRE_RESEARCH_ASSET_INDEX.json @c38d65a):
 *   - #994@b9ea4d1 src/microkernel/contracts.mjs (ABI registry, sealed shape),
 *   - #956@16037896 candidate-validator.mjs (record-safe canonical snapshot,
 *     qualified-ID injectivity),
 *   - #963@d9fd8b9 attested-binding.mjs (byte-attested physical identity),
 *   - #978@f87cfdf host/trust-roots.mjs (trusted-anchor install boundary).
 *
 * This module contains — and may never contain — any workflow/admission/
 * guard/journal/effect/state-transition mechanism or business special case.
 */

import { createHash } from 'node:crypto';

/** Typed error taxonomy for the public v8 qualified-package ABI. */
export class QualifiedPackageError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'QualifiedPackageError';
    this.code = code;
  }
}

export const V8_QUALIFIED_ROOT_FORMAT = 'dhpkg/v8-qualified-root/1';
export const V8_APPROVAL_PROOF_TYPE = 'v08-external-approval/1';
export const V8_QUALIFIED_PRODUCER_PREFIX = 'qualified-producer:';

export type QualifiedPackageKind = 'kernel' | 'standard-sdk' | 'business';

export type QualifiedRole = 'kernel' | 'standard-sdk' | 'business';

export interface QualifiedEndpoint {
  readonly endpointId: string;
  readonly kind: string;
}

/**
 * ABI knowledge the trusted installer needs to verify a module generically.
 * The executing mechanism itself stays inside the physically selected Kernel
 * package; the loader never re-implements it (#994 KPK-02 heritage).
 */
export const V8_QUALIFIED_ABI: Readonly<
  Record<string, { readonly kind: QualifiedPackageKind; readonly role: QualifiedRole; readonly requiredExports: readonly string[]; readonly requiredEndpointKinds: readonly string[] }>
> = Object.freeze({
  'v08-kernel-abi/1': {
    kind: 'kernel',
    role: 'kernel',
    requiredExports: ['createOccurrenceRuntime', 'MODULE_ID', 'PACKAGE_KIND', 'ABI_VERSION', 'ENDPOINTS'],
    requiredEndpointKinds: ['occurrence-runtime'],
  },
  'v08-standard-sdk-abi/1': {
    kind: 'standard-sdk',
    role: 'standard-sdk',
    requiredExports: ['interpret', 'MODULE_ID', 'PACKAGE_KIND', 'ABI_VERSION', 'ENDPOINTS'],
    requiredEndpointKinds: ['rule-interpreter'],
  },
  'v08-business-abi/1': {
    kind: 'business',
    role: 'business',
    requiredExports: ['getPolicy', 'INTENT_TYPES', 'MODULE_ID', 'PACKAGE_KIND', 'ABI_VERSION', 'ENDPOINTS'],
    requiredEndpointKinds: ['business-policy'],
  },
});

/** Externally issued approval proof (DAC/governance side owns issuance). */
export interface ApprovalProof {
  readonly proofType: string;
  readonly subjectDigest: string;
  readonly issuerId: string;
  readonly issuedAt: string;
  /** Binding digest over the proof material; recomputed at every boundary. */
  readonly proofDigest: string;
  /**
   * Issuer attestation (HMAC-SHA256 over the binding digest, computed by the
   * external issuer). Verified by the compiler attach boundary with trusted
   * issuer keys; the core load() verifies the binding digest only — full
   * cryptographic issuer authority is the external DAC/Host channel (L2
   * fact 3), never minted here.
   */
  readonly issuerAttestation: string;
}

export interface QualifiedPackageDescriptor {
  readonly packageId: string;
  readonly kind: QualifiedPackageKind;
  readonly abiVersion: string;
  readonly moduleSource: string;
  readonly moduleSha256: string;
  readonly endpoints: readonly QualifiedEndpoint[];
}

export interface QualifiedRoleBinding {
  readonly role: QualifiedRole;
  readonly packageId: string;
  readonly endpointId: string;
}

export interface QualifiedIntentBinding {
  readonly role: 'intent';
  readonly intentType: string;
  readonly packageId: string;
  readonly endpointId: string;
}

export type QualifiedBinding = QualifiedRoleBinding | QualifiedIntentBinding;

export interface QualifiedBuildProvenance {
  readonly producerId: string;
  readonly builtAt: string;
  readonly baseCommit: string;
  readonly closureDigest: string;
}

export interface SealedQualifiedPackageRoot {
  readonly formatVersion: string;
  readonly rootPackageId: string;
  readonly build: QualifiedBuildProvenance;
  readonly approval: ApprovalProof;
  readonly packages: readonly QualifiedPackageDescriptor[];
  readonly bindings: readonly QualifiedBinding[];
}

const HEX64 = /^[0-9a-f]{64}$/;

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Record-safe canonical JSON snapshot (adapted from #956 R3 repaired
 * candidate-validator `data()`): descriptors are inspected BEFORE any value
 * is read, so hostile getters/accessors on an untrusted root are never
 * invoked, own `__proto__`/`constructor`/`prototype` keys are refused, and
 * the result is a plain, prototype-free canonical value.
 */
export function canonicalSnapshot(value: unknown, path = '$'): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new QualifiedPackageError('ROOT_RECORD_UNSAFE', `${path} carries a non-canonical number`);
    }
    return value;
  }
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint' || typeof value === 'undefined') {
    throw new QualifiedPackageError('ROOT_RECORD_UNSAFE', `${path} carries a non-JSON ${typeof value}`);
  }
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      throw new QualifiedPackageError('ROOT_RECORD_UNSAFE', `${path} is not a plain array`);
    }
    // The lib typings model the array length slot as `number`; we must
    // inspect its actual descriptor shape instead.
    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor | undefined>;
    const lengthDescriptor = descriptors.length;
    if (
      lengthDescriptor === undefined
      || !Object.hasOwn(lengthDescriptor, 'value')
      || !Number.isSafeInteger(lengthDescriptor.value)
      || lengthDescriptor.value < 0
      || lengthDescriptor.enumerable
      || lengthDescriptor.configurable
    ) {
      throw new QualifiedPackageError('ROOT_RECORD_UNSAFE', `${path}.length descriptor is not the intrinsic array length`);
    }
    const length = lengthDescriptor.value as number;
    if (Reflect.ownKeys(descriptors).length !== length + 1) {
      throw new QualifiedPackageError('ROOT_RECORD_UNSAFE', `${path} has non-index own keys`);
    }
    const items: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (descriptor === undefined || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
        throw new QualifiedPackageError('ROOT_RECORD_UNSAFE', `${path}[${index}] is not an own enumerable data slot`);
      }
      items.push(canonicalSnapshot(descriptor.value, `${path}[${index}]`));
    }
    return items;
  }
  if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new QualifiedPackageError('ROOT_RECORD_UNSAFE', `${path} must be a plain JSON object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor | undefined>;
  const result = Object.create(null) as Record<string, unknown>;
  for (const key of Object.keys(value).sort()) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      throw new QualifiedPackageError('ROOT_RECORD_UNSAFE', `${path}.${key} is a dangerous own key`);
    }
    const descriptor = descriptors[key];
    if (descriptor === undefined || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw new QualifiedPackageError('ROOT_RECORD_UNSAFE', `${path}.${key} is not an own enumerable data slot (accessors are refused)`);
    }
    result[key] = canonicalSnapshot(descriptor.value, `${path}.${key}`);
  }
  if (Reflect.ownKeys(descriptors).length !== Object.keys(value).length) {
    throw new QualifiedPackageError('ROOT_RECORD_UNSAFE', `${path} has non-enumerable own keys`);
  }
  return result;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalSnapshot(value));
}

/**
 * Binding digest of an approval proof: commits the issuer to exactly one
 * qualification subject. Recomputed (never trusted) at every boundary.
 */
export function approvalBindingDigest(proof: ApprovalProof): string {
  return sha256Hex(`${proof.proofType}\n${proof.subjectDigest}\n${proof.issuerId}\n${proof.issuedAt}`);
}

/**
 * Subject digest of a sealed closure: the exact package byte identities plus
 * the role/intent bindings. BUILD computes it at qualification time; load()
 * recomputes it from the presented root and refuses any divergence, so an
 * approval can never be replayed onto a different closure.
 */
export function computeSubjectDigest(input: {
  rootPackageId: string;
  packages: readonly { packageId: string; moduleSha256: string }[];
  bindings: readonly QualifiedBinding[];
}): string {
  return sha256Hex(
    canonicalJson({
      domain: 'dh.v8.qualified-root.subject/1',
      rootPackageId: input.rootPackageId,
      packages: input.packages.map((pkg) => ({ packageId: pkg.packageId, moduleSha256: pkg.moduleSha256 })),
      bindings: input.bindings.map((binding) => ({ ...binding })),
    }),
  );
}

function isPlainStringRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isApprovalProofShape(value: unknown): value is ApprovalProof {
  if (!isPlainStringRecord(value)) return false;
  return (
    value.proofType === V8_APPROVAL_PROOF_TYPE
    && typeof value.subjectDigest === 'string'
    && HEX64.test(value.subjectDigest)
    && typeof value.issuerId === 'string'
    && value.issuerId.length > 0
    && typeof value.issuedAt === 'string'
    && !Number.isNaN(Date.parse(value.issuedAt))
    && typeof value.proofDigest === 'string'
    && HEX64.test(value.proofDigest)
    && typeof value.issuerAttestation === 'string'
    && value.issuerAttestation.startsWith('hmac-sha256:')
  );
}

/**
 * Full static qualification of a presented sealed root: shape, producer
 * trust prefix, ABI/kind agreement, closure uniqueness, K/S/B binding shape
 * (exactly one kernel, exactly one standard-sdk, at least one business) and
 * the approval-proof binding to THIS exact closure. Bytes and module
 * self-identity are verified afterwards by the internal installer.
 *
 * Returns the CANONICAL SNAPSHOT of the root (descriptor-safe, plain,
 * freshly materialized). Callers must use the returned snapshot — never the
 * original presentation — so a hostile object whose getters return different
 * values per read cannot pass qualification and then smuggle different
 * bytes into installation.
 */
export function assertQualifiedRoot(root: unknown): SealedQualifiedPackageRoot {
  if (!isPlainStringRecord(root)) {
    throw new QualifiedPackageError('LOAD_NOT_A_QUALIFIED_ROOT', 'load() accepts only a sealed qualified package root object');
  }
  // Descriptor-safe read of the untrusted value BEFORE any field is used:
  // hostile getters are never invoked (canonicalSnapshot throws typed first).
  const snapshot = canonicalSnapshot(root) as SealedQualifiedPackageRoot;
  if (snapshot.formatVersion !== V8_QUALIFIED_ROOT_FORMAT) {
    throw new QualifiedPackageError('LOAD_FORMAT_UNSUPPORTED', `root formatVersion ${String(snapshot.formatVersion)} is not ${V8_QUALIFIED_ROOT_FORMAT}`);
  }
  if (typeof snapshot.rootPackageId !== 'string' || snapshot.rootPackageId.length === 0) {
    throw new QualifiedPackageError('LOAD_NOT_A_QUALIFIED_ROOT', 'rootPackageId must be a non-empty string');
  }
  if (!isPlainStringRecord(snapshot.build)) {
    throw new QualifiedPackageError('LOAD_NOT_A_QUALIFIED_ROOT', 'root must carry a plain build provenance record');
  }
  const producerId: unknown = snapshot.build.producerId;
  if (typeof producerId !== 'string' || !producerId.startsWith(V8_QUALIFIED_PRODUCER_PREFIX)) {
    throw new QualifiedPackageError(
      'LOAD_PRODUCER_UNTRUSTED',
      `root was not produced by a controlled qualified producer (${typeof producerId === 'string' ? producerId : 'malformed producer identity'})`,
    );
  }
  // Runtime shape checks run on separate unknown aliases: Array.isArray
  // would narrow the typed readonly arrays to any[] and defeat type safety.
  const packagesValue: unknown = snapshot.packages;
  const bindingsValue: unknown = snapshot.bindings;
  if (!Array.isArray(packagesValue) || packagesValue.length === 0 || !Array.isArray(bindingsValue)) {
    throw new QualifiedPackageError('LOAD_NOT_A_QUALIFIED_ROOT', 'root must carry a non-empty packages array and a bindings array');
  }
  if (!isApprovalProofShape(snapshot.approval)) {
    throw new QualifiedPackageError('LOAD_APPROVAL_MALFORMED', 'root does not carry a well-formed externally issued approval proof');
  }
  if (snapshot.approval.proofDigest !== approvalBindingDigest(snapshot.approval)) {
    throw new QualifiedPackageError('LOAD_APPROVAL_MALFORMED', 'approval proof binding digest does not match its own material');
  }
  for (const pkg of snapshot.packages) {
    if (!isPlainStringRecord(pkg)) {
      throw new QualifiedPackageError('LOAD_NOT_A_QUALIFIED_ROOT', 'each package entry must be a plain object');
    }
    if (typeof pkg.packageId !== 'string' || pkg.packageId.length === 0) {
      throw new QualifiedPackageError('LOAD_NOT_A_QUALIFIED_ROOT', 'package.packageId must be a non-empty string');
    }
    if (typeof pkg.moduleSha256 !== 'string' || !HEX64.test(pkg.moduleSha256)) {
      throw new QualifiedPackageError('LOAD_DIGEST_MALFORMED', `package ${pkg.packageId} moduleSha256 is not a lowercase hex sha-256`);
    }
    const abi = V8_QUALIFIED_ABI[pkg.abiVersion];
    if (abi === undefined) {
      throw new QualifiedPackageError('LOAD_ABI_UNKNOWN', `package ${pkg.packageId} declares unknown abiVersion ${String(pkg.abiVersion)}`);
    }
    if (abi.kind !== pkg.kind) {
      throw new QualifiedPackageError('LOAD_KIND_ABI_MISMATCH', `package ${pkg.packageId} kind ${String(pkg.kind)} does not match abi ${String(pkg.abiVersion)}`);
    }
    if (typeof pkg.moduleSource !== 'string') {
      throw new QualifiedPackageError('LOAD_NOT_A_QUALIFIED_ROOT', `package ${pkg.packageId} must carry sealed module source bytes`);
    }
    const endpointsValue: unknown = pkg.endpoints;
    if (!Array.isArray(endpointsValue) || endpointsValue.length === 0) {
      throw new QualifiedPackageError('LOAD_NOT_A_QUALIFIED_ROOT', `package ${pkg.packageId} must declare a non-empty endpoints array`);
    }
  }
  const packageIds = snapshot.packages.map((pkg) => pkg.packageId);
  if (new Set(packageIds).size !== packageIds.length) {
    throw new QualifiedPackageError('LOAD_DUPLICATE_PACKAGE', 'root closure contains duplicate packageIds');
  }
  for (const role of ['kernel', 'standard-sdk'] as const) {
    const bound = snapshot.bindings.filter((binding) => binding.role === role);
    const [only] = bound;
    if (bound.length !== 1 || only === undefined) {
      throw new QualifiedPackageError('LOAD_ROLE_BINDING_INVALID', `role ${role} must be bound to exactly one package (found ${bound.length})`);
    }
    if (!packageIds.includes(only.packageId)) {
      throw new QualifiedPackageError('LOAD_ROLE_BINDING_INVALID', `role ${role} binds unknown package ${only.packageId}`);
    }
  }
  const businessBound = snapshot.bindings.filter((binding) => binding.role === 'business');
  if (businessBound.length < 1) {
    throw new QualifiedPackageError('LOAD_ROLE_BINDING_INVALID', 'at least one business package must be selected (K/S/multiple-B closure)');
  }
  for (const bound of businessBound) {
    if (!packageIds.includes(bound.packageId)) {
      throw new QualifiedPackageError('LOAD_ROLE_BINDING_INVALID', `role business binds unknown package ${bound.packageId}`);
    }
  }
  const intentBindings = snapshot.bindings.filter((binding) => binding.role === 'intent');
  const intentKeys = intentBindings.map((binding) => binding.intentType);
  if (new Set(intentKeys).size !== intentKeys.length) {
    throw new QualifiedPackageError('LOAD_INTENT_BINDING_AMBIGUOUS', 'an intent type is bound to more than one provider in this sealed closure');
  }
  const subjectDigest = computeSubjectDigest({
    rootPackageId: snapshot.rootPackageId,
    packages: snapshot.packages.map((pkg) => ({ packageId: pkg.packageId, moduleSha256: pkg.moduleSha256 })),
    bindings: snapshot.bindings,
  });
  if (snapshot.approval.subjectDigest !== subjectDigest) {
    throw new QualifiedPackageError(
      'LOAD_APPROVAL_SUBJECT_MISMATCH',
      `approval proof subjects digest ${snapshot.approval.subjectDigest} but this closure digests ${subjectDigest}; an approval can never be replayed onto a different closure`,
    );
  }
  if (snapshot.build.closureDigest !== subjectDigest) {
    throw new QualifiedPackageError(
      'LOAD_APPROVAL_SUBJECT_MISMATCH',
      `build.closureDigest ${snapshot.build.closureDigest} does not match the presented closure ${subjectDigest}`,
    );
  }
  return snapshot;
}
