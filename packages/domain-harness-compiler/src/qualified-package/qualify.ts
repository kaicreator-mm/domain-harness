/**
 * v0.8 BUILD qualification — phase 1 (T-A, #1000).
 * ================================================
 *
 * `qualifyPackageClosure()` performs the bounded build-time static
 * qualification the frozen L2 mandates for the qualified package ABI:
 * Identity (exact module bytes → SHA-256, self-declared module identity
 * exports), Compatibility (ABI registry/kind agreement, required exports
 * AST-verified), Binding (K/S/multiple-B role shape, intent bindings,
 * provider uniqueness) and exact closure (TypeScript-AST static import
 * analysis; no regex-only import filter).
 *
 * The result is an UNSIGNED qualification: it carries a subject digest but
 * no authority. Authority is attached separately and externally
 * (approval.ts, phase 2) — BUILD can never self-mint it.
 *
 * Qualified-Graph identity uses the #956 R3 repaired escaping rule: each
 * tuple member escapes '/' as '%2F' before joining, so slash-bearing IDs
 * stay injective ('a/b' + 'c' never collides with 'a' + 'b/c') while
 * slash-free IDs keep their historical spelling.
 */

import {
  QualifiedPackageError,
  V8_QUALIFIED_ABI,
  canonicalSnapshot,
  computeSubjectDigest,
  sha256Hex,
  type QualifiedBinding,
  type QualifiedCapabilityBinding,
  type QualifiedPackageKind,
} from '@kaicreator/domain-harness/v8';
import { analyzeModuleClosure, assertDeclaredExports, ClosureError } from './closure.js';

export class QualificationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'QualificationError';
    this.code = code;
  }
}

function fail(code: string, detail: string): never {
  throw new QualificationError(code, detail);
}

export interface QualifiedPackageSubmission {
  readonly packageId: string;
  readonly kind: QualifiedPackageKind;
  readonly abiVersion: string;
  /** Sealed module path inside the package (e.g. 'modules/kernel.mjs'). */
  readonly modulePath: string;
  readonly moduleSource: string;
  readonly endpoints: readonly { endpointId: string; kind: string }[];
  /** Business packages advertise the intent types their policy binds. */
  readonly intentTypes?: readonly string[];
}

export interface QualificationSubmission {
  readonly rootPackageId: string;
  readonly packages: readonly QualifiedPackageSubmission[];
  /** Role + intent bindings over the submitted packages. */
  readonly bindings: readonly QualifiedBinding[];
}

export interface UnsignedQualification {
  readonly formatVersion: 'v08-build-qualification/1';
  readonly rootPackageId: string;
  readonly subjectDigest: string;
  readonly packages: readonly {
    packageId: string;
    kind: QualifiedPackageKind;
    abiVersion: string;
    modulePath: string;
    moduleSha256: string;
    endpoints: readonly { endpointId: string; kind: string }[];
    intentTypes: readonly string[];
  }[];
  readonly bindings: readonly QualifiedBinding[];
  readonly qualifiedAt: string;
  readonly producerId: string;
}

/** Escape each tuple member so the joined qualified key stays injective. */
export function qualifiedKey(packageId: string, componentId: string): string {
  return `${packageId.replaceAll('/', '%2F')}/${componentId.replaceAll('/', '%2F')}`;
}

const MODULE_PATH_PATTERN = /^modules\/[a-zA-Z0-9._/-]+\.mjs$/;

/**
 * Phase 1 — qualify one exact closure. Every rejection happens BEFORE any
 * module is executed: qualification is purely static.
 */
export function qualifyPackageClosure(submission: unknown): UnsignedQualification {
  // Descriptor-safe read first: hostile getters/proxies on the submission
  // are refused typed without ever being invoked.
  let snapshot: QualificationSubmission;
  try {
    snapshot = canonicalSnapshot(submission) as QualificationSubmission;
  } catch (error) {
    if (error instanceof QualifiedPackageError) {
      throw new QualificationError('QUALIFY_RECORD_UNSAFE', error.message);
    }
    throw error;
  }
  if (typeof snapshot !== 'object' || snapshot === null) {
    fail('QUALIFY_SUBMISSION_INVALID', 'qualification submission must be a plain object');
  }
  if (typeof snapshot.rootPackageId !== 'string' || snapshot.rootPackageId.length === 0) {
    fail('QUALIFY_SUBMISSION_INVALID', 'rootPackageId must be a non-empty string');
  }
  // Runtime shape checks run on separate unknown aliases: Array.isArray
  // would narrow the typed readonly arrays to any[] and defeat type safety.
  const packagesValue: unknown = snapshot.packages;
  const bindingsValue: unknown = snapshot.bindings;
  if (!Array.isArray(packagesValue) || packagesValue.length === 0 || !Array.isArray(bindingsValue)) {
    fail('QUALIFY_SUBMISSION_INVALID', 'submission must carry a non-empty packages array and a bindings array');
  }

  const seenPackageIds = new Set<string>();
  const qualifiedEndpointKeys = new Set<string>();
  for (const pkg of snapshot.packages) {
    if (typeof pkg.packageId !== 'string' || pkg.packageId.length === 0) {
      fail('QUALIFY_PACKAGE_IDENTITY', 'each package needs a non-empty packageId');
    }
    if (seenPackageIds.has(pkg.packageId)) {
      fail('QUALIFY_DUPLICATE_PACKAGE', `package ${pkg.packageId} appears twice in the closure`);
    }
    seenPackageIds.add(pkg.packageId);
    const abi = V8_QUALIFIED_ABI[pkg.abiVersion];
    if (abi === undefined) {
      fail('QUALIFY_ABI_UNKNOWN', `package ${pkg.packageId} declares unknown abiVersion ${String(pkg.abiVersion)}`);
    }
    if (abi.kind !== pkg.kind) {
      fail('QUALIFY_KIND_ABI_MISMATCH', `package ${pkg.packageId} kind ${String(pkg.kind)} does not match abi ${String(pkg.abiVersion)}`);
    }
    if (typeof pkg.modulePath !== 'string' || !MODULE_PATH_PATTERN.test(pkg.modulePath) || pkg.modulePath.includes('..')) {
      fail('QUALIFY_MODULE_PATH', `package ${pkg.packageId} modulePath must be a sealed 'modules/*.mjs' path`);
    }
    if (typeof pkg.moduleSource !== 'string' || pkg.moduleSource.length === 0) {
      fail('QUALIFY_MODULE_BYTES', `package ${pkg.packageId} must carry non-empty sealed module bytes`);
    }
    const endpointsValue: unknown = pkg.endpoints;
    if (!Array.isArray(endpointsValue) || endpointsValue.length === 0) {
      fail('QUALIFY_ENDPOINT_INVALID', `package ${pkg.packageId} must declare a non-empty endpoints array`);
    }
    for (const endpoint of endpointsValue) {
      const entry = endpoint as { endpointId?: unknown; kind?: unknown };
      if (typeof entry.endpointId !== 'string' || entry.endpointId.length === 0 || typeof entry.kind !== 'string' || entry.kind.length === 0) {
        fail('QUALIFY_ENDPOINT_INVALID', `package ${pkg.packageId} declares a malformed endpoint entry (endpointId/kind must be non-empty strings)`);
      }
    }
    const endpointKinds = (endpointsValue as { kind: string }[]).map((endpoint) => endpoint.kind);
    if (new Set(endpointKinds).size !== endpointKinds.length) {
      fail('QUALIFY_ENDPOINT_INVALID', `package ${pkg.packageId} must declare unique endpoint kinds`);
    }
    // Static AST checks: required exports really declared, closure really
    // static and self-contained. (Byte identity is computed below from the
    // same presented bytes; the sealed root and the trusted installer
    // re-verify it independently.)
    try {
      assertDeclaredExports(pkg.modulePath, pkg.moduleSource, abi.requiredExports);
      analyzeModuleClosure({ entryPath: pkg.modulePath, moduleSources: new Map([[pkg.modulePath, pkg.moduleSource]]) });
    } catch (error) {
      if (error instanceof ClosureError) {
        throw new QualificationError(error.code, error.message);
      }
      throw error;
    }
    if (pkg.kind === 'business') {
      const intentTypes = Array.isArray(pkg.intentTypes) ? pkg.intentTypes : [];
      if (intentTypes.length === 0) {
        fail('QUALIFY_INTENT_TYPES', `business package ${pkg.packageId} must advertise its bound INTENT_TYPES`);
      }
      for (const intentType of intentTypes) {
        if (typeof intentType !== 'string' || intentType.length === 0) {
          fail('QUALIFY_INTENT_TYPES', `business package ${pkg.packageId} advertises a malformed intent type`);
        }
      }
    }
    for (const endpoint of pkg.endpoints) {
      const key = qualifiedKey(pkg.packageId, endpoint.endpointId);
      if (qualifiedEndpointKeys.has(key)) {
        fail('QUALIFY_GRAPH_ID_COLLISION', `qualified graph key ${key} is declared twice; qualified-Graph tuples must stay injective`);
      }
      qualifiedEndpointKeys.add(key);
    }
  }

  // Binding integrity (P1-BIND-02): every K/S/B role binding must target an
  // EXISTING endpoint of a package of the CORRECT kind with the
  // ABI-required endpoint kind — binding Kernel to a Business package or to
  // a dangling endpointId is a static BUILD failure, not a T-B runtime
  // discovery.
  const packagesById = new Map(snapshot.packages.map((pkg) => [pkg.packageId, pkg]));
  function requireRoleTarget(role: 'kernel' | 'standard-sdk' | 'business', packageId: string, endpointId: string): void {
    const target = packagesById.get(packageId);
    if (target === undefined) {
      fail('QUALIFY_ROLE_BINDING_INVALID', `role ${role} binds unknown package ${packageId}`);
    }
    if (target.kind !== role) {
      fail('QUALIFY_ROLE_BINDING_INVALID', `role ${role} binds package ${packageId} of kind ${target.kind}; the role requires a ${role} package`);
    }
    const endpoint = target.endpoints.find((candidate) => candidate.endpointId === endpointId);
    if (endpoint === undefined) {
      fail('QUALIFY_ROLE_BINDING_INVALID', `role ${role} binds endpoint ${endpointId} which package ${packageId} does not declare`);
    }
    const abi = V8_QUALIFIED_ABI[target.abiVersion];
    if (abi !== undefined && !abi.requiredEndpointKinds.includes(endpoint.kind)) {
      fail(
        'QUALIFY_ROLE_BINDING_INVALID',
        `role ${role} endpoint ${endpointId} has kind ${endpoint.kind}; ABI ${target.abiVersion} requires one of [${abi.requiredEndpointKinds.join(', ')}]`,
      );
    }
  }
  for (const role of ['kernel', 'standard-sdk'] as const) {
    const bound = snapshot.bindings.filter((binding) => binding.role === role);
    const [only] = bound;
    if (bound.length !== 1 || only === undefined) {
      fail('QUALIFY_ROLE_BINDING_INVALID', `role ${role} must be bound to exactly one package (found ${bound.length})`);
    }
    requireRoleTarget(role, only.packageId, only.endpointId);
  }
  const businessBound = snapshot.bindings.filter((binding) => binding.role === 'business');
  if (businessBound.length < 1) {
    fail('QUALIFY_ROLE_BINDING_INVALID', 'at least one business package must be selected (K/S/multiple-B closure)');
  }
  for (const bound of businessBound) {
    requireRoleTarget('business', bound.packageId, bound.endpointId);
  }

  // Provider uniqueness: an intent type must be provided by exactly one
  // bound business package; two providers without a unique selection are an
  // ambiguous provider failure (adapted from #956 E_AMBIGUOUS_PROVIDER).
  const intentProviders = new Map<string, string[]>();
  for (const pkg of snapshot.packages) {
    const intentTypesValue: unknown = pkg.intentTypes;
    if (pkg.kind !== 'business' || !Array.isArray(intentTypesValue)) continue;
    const intentTypes = intentTypesValue as readonly string[];
    for (const intentType of intentTypes) {
      const providers = intentProviders.get(intentType) ?? [];
      providers.push(pkg.packageId);
      intentProviders.set(intentType, providers);
    }
  }
  for (const [intentType, providers] of intentProviders) {
    if (providers.length > 1) {
      fail('QUALIFY_PROVIDER_AMBIGUOUS', `intent type ${intentType} is provided by more than one business package (${providers.join(', ')}); BUILD demands a unique selection`);
    }
  }
  const intentBindings = snapshot.bindings.filter((binding) => binding.role === 'intent');
  for (const binding of intentBindings) {
    if (typeof binding.intentType !== 'string' || binding.intentType.length === 0) {
      fail('QUALIFY_INTENT_BINDING_INVALID', 'intent bindings need a non-empty intentType');
    }
    const target = packagesById.get(binding.packageId);
    if (target === undefined) {
      fail('QUALIFY_INTENT_BINDING_INVALID', `intent ${binding.intentType} binds unknown package ${binding.packageId}`);
    }
    // Provider correspondence (P1-BIND-02): the BOUND business package must
    // itself advertise the intent type in INTENT_TYPES — not merely some
    // other business package in the closure.
    if (target.kind !== 'business' || (target.intentTypes ?? []).includes(binding.intentType) !== true) {
      fail(
        'QUALIFY_INTENT_BINDING_INVALID',
        `intent ${binding.intentType} is bound to package ${binding.packageId}, which does not advertise it in INTENT_TYPES`,
      );
    }
    const endpoint = target.endpoints.find((candidate) => candidate.endpointId === binding.endpointId);
    const abi = V8_QUALIFIED_ABI[target.abiVersion];
    if (endpoint === undefined || (abi !== undefined && !abi.requiredEndpointKinds.includes(endpoint.kind))) {
      fail(
        'QUALIFY_INTENT_BINDING_INVALID',
        `intent ${binding.intentType} binds endpoint ${binding.endpointId} which package ${binding.packageId} does not provide as a business endpoint`,
      );
    }
  }

  // ---- Optional BUILD-selected capability packages (#1023 S02a) ----
  // A capability package is admitted ONLY through an exact keyed
  // capabilityId/packageId/endpointId binding with a non-empty, injective
  // operation→handler map whose handler names are AST-verified declared
  // exports of the sealed module bytes. Every submitted capability package
  // must be covered by exactly one such binding — an unbound or multi-bound
  // extra module can never become executable. No runtime discovery, no
  // host-node catch-all: what BUILD binds here is the whole callable
  // surface the installer will later verify on the physical namespace.
  const capabilityBindings = snapshot.bindings.filter(
    (binding): binding is QualifiedCapabilityBinding => binding.role === 'capability',
  );
  const capabilityIds = new Set<string>();
  for (const binding of capabilityBindings) {
    if (typeof binding.capabilityId !== 'string' || binding.capabilityId.length === 0) {
      fail('QUALIFY_CAPABILITY_BINDING_INVALID', 'capability bindings need a non-empty capabilityId');
    }
    if (capabilityIds.has(binding.capabilityId)) {
      fail('QUALIFY_CAPABILITY_BINDING_INVALID', `capabilityId ${binding.capabilityId} is bound more than once; capability identities must stay injective`);
    }
    capabilityIds.add(binding.capabilityId);
    const handlersValue: unknown = binding.handlers;
    if (!Array.isArray(handlersValue) || handlersValue.length === 0) {
      fail('QUALIFY_CAPABILITY_BINDING_INVALID', `capability ${binding.capabilityId} must carry a non-empty exact operation→handler map`);
    }
    const operationIds = new Set<string>();
    const handlerNames = new Set<string>();
    for (const handler of handlersValue) {
      const entry = handler as { operationId?: unknown; handler?: unknown };
      if (typeof entry.operationId !== 'string' || entry.operationId.length === 0 || typeof entry.handler !== 'string' || entry.handler.length === 0) {
        fail('QUALIFY_CAPABILITY_BINDING_INVALID', `capability ${binding.capabilityId} declares a malformed handler entry (operationId/handler must be non-empty strings)`);
      }
      if (operationIds.has(entry.operationId)) {
        fail('QUALIFY_CAPABILITY_BINDING_INVALID', `capability ${binding.capabilityId} binds operation ${entry.operationId} more than once`);
      }
      operationIds.add(entry.operationId);
      handlerNames.add(entry.handler);
    }
    const target = packagesById.get(binding.packageId);
    if (target === undefined) {
      fail('QUALIFY_CAPABILITY_BINDING_INVALID', `capability ${binding.capabilityId} binds unknown package ${binding.packageId}`);
    }
    if (target.kind !== 'capability') {
      fail('QUALIFY_CAPABILITY_BINDING_INVALID', `capability ${binding.capabilityId} binds package ${binding.packageId} of kind ${target.kind}; a capability binding must target a capability package and can never shadow a closed role`);
    }
    const endpoint = target.endpoints.find((candidate) => candidate.endpointId === binding.endpointId);
    if (endpoint === undefined) {
      fail('QUALIFY_CAPABILITY_BINDING_INVALID', `capability ${binding.capabilityId} binds endpoint ${binding.endpointId} which package ${binding.packageId} does not declare`);
    }
    const capabilityAbi = V8_QUALIFIED_ABI[target.abiVersion];
    if (capabilityAbi !== undefined && !capabilityAbi.requiredEndpointKinds.includes(endpoint.kind)) {
      fail(
        'QUALIFY_CAPABILITY_BINDING_INVALID',
        `capability ${binding.capabilityId} endpoint ${binding.endpointId} has kind ${endpoint.kind}; ABI ${target.abiVersion} requires one of [${capabilityAbi.requiredEndpointKinds.join(', ')}]`,
      );
    }
    // BUILD-time exact handler binding: every bound handler name must be a
    // declared export of the sealed module bytes (AST-verified, not a text
    // match — the installer re-verifies callability on the namespace).
    try {
      assertDeclaredExports(target.modulePath, target.moduleSource, [...handlerNames]);
    } catch (error) {
      if (error instanceof ClosureError) {
        throw new QualificationError(error.code, error.message);
      }
      throw error;
    }
  }
  for (const pkg of snapshot.packages) {
    if (pkg.kind !== 'capability') continue;
    const bound = capabilityBindings.filter((binding) => binding.packageId === pkg.packageId);
    if (bound.length !== 1) {
      fail(
        'QUALIFY_CAPABILITY_UNBOUND',
        `capability package ${pkg.packageId} is covered by ${bound.length} capability bindings (exactly one required); an unbound or multi-bound extra module can never become executable`,
      );
    }
  }

  const packages = snapshot.packages.map((pkg) =>
    Object.freeze({
      packageId: pkg.packageId,
      kind: pkg.kind,
      abiVersion: pkg.abiVersion,
      modulePath: pkg.modulePath,
      moduleSha256: sha256Hex(pkg.moduleSource),
      endpoints: Object.freeze((pkg.endpoints as { endpointId: string; kind: string }[]).map((endpoint) => Object.freeze({ ...endpoint }))),
      intentTypes: Object.freeze([...(pkg.intentTypes ?? [])]),
    }),
  );
  const subjectDigest = computeSubjectDigest({
    rootPackageId: snapshot.rootPackageId,
    packages: packages.map((pkg) => ({ packageId: pkg.packageId, moduleSha256: pkg.moduleSha256 })),
    bindings: snapshot.bindings,
  });
  return Object.freeze({
    formatVersion: 'v08-build-qualification/1',
    rootPackageId: snapshot.rootPackageId,
    subjectDigest,
    packages: Object.freeze(packages),
    bindings: Object.freeze((snapshot.bindings as QualifiedBinding[]).map((binding) => Object.freeze({ ...binding }))),
    qualifiedAt: new Date().toISOString(),
    producerId: 'qualified-producer:v08-build',
  });
}
