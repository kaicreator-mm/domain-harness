/**
 * Microkernel contracts — experiment KPK-01 (thin loader ABI)
 * ===========================================================
 *
 * The irreducible SDK bootstrap surface. This module defines ONLY the
 * generic, domain-neutral shapes of a sealed package root and the typed
 * Microkernel error taxonomy. It contains — and may never contain — any
 * workflow/admission/guard/journal/effect/state-transition mechanism
 * (that is physically owned by the loaded Kernel Domain Package) or any
 * business-domain special case (KPK-02 falsifies this statically).
 */

export const ROOT_FORMAT_VERSION = 'v08-kpk01-root/1';

/** ABI knowledge the Microkernel needs to wire endpoints generically. */
export const KERNEL_ABI = {
  'kpk01-kernel-abi/1': {
    kind: 'kernel',
    requiredRole: 'kernel',
    requiredExports: ['createOccurrenceRuntime'],
    requiredEndpointKinds: ['occurrence-runtime'],
  },
  'kpk01-sdk-abi/1': {
    kind: 'standard-sdk',
    requiredRole: 'rule-interpreter',
    requiredExports: ['interpret'],
    requiredEndpointKinds: ['rule-interpreter'],
  },
  'kpk01-business-abi/1': {
    kind: 'business',
    requiredRole: 'business-policy',
    requiredExports: ['getPolicy', 'INTENT_TYPES'],
    requiredEndpointKinds: ['business-policy'],
  },
};

export class MicrokernelError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MicrokernelError';
    this.code = code;
  }
}

const HEX64 = /^[0-9a-f]{64}$/;

export function isSealedPackageRootShape(value) {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && typeof value.formatVersion === 'string'
    && typeof value.rootPackageId === 'string'
    && typeof value.build === 'object' && value.build !== null
    && typeof value.build.producerId === 'string'
    && typeof value.build.builtAt === 'string'
    && Array.isArray(value.packages)
    && value.packages.length > 0
    && value.packages.every((pkg) => typeof pkg === 'object' && pkg !== null
      && typeof pkg.packageId === 'string'
      && typeof pkg.kind === 'string'
      && typeof pkg.abiVersion === 'string'
      && typeof pkg.moduleSource === 'string'
      && typeof pkg.moduleSha256 === 'string'
      && Array.isArray(pkg.endpoints))
    && Array.isArray(value.bindings)
    && value.bindings.every((binding) => typeof binding === 'object' && binding !== null
      && typeof binding.role === 'string'
      && typeof binding.packageId === 'string');
}

export function assertSealedShape(root) {
  if (!isSealedPackageRootShape(root)) {
    throw new MicrokernelError(
      'LOAD_NOT_A_SEALED_ROOT',
      'load() accepts only a system-produced sealed package root; the supplied value does not have the sealed root shape (raw/unqualified manifests are rejected at this trusted installation boundary)',
    );
  }
  if (root.formatVersion !== ROOT_FORMAT_VERSION) {
    throw new MicrokernelError('LOAD_FORMAT_UNSUPPORTED', `root formatVersion ${root.formatVersion} is not ${ROOT_FORMAT_VERSION}`);
  }
  if (!root.build.producerId.startsWith('system-producer:')) {
    throw new MicrokernelError('LOAD_PRODUCER_UNTRUSTED', `root was not produced by a controlled system producer (${root.build.producerId})`);
  }
  for (const pkg of root.packages) {
    if (!HEX64.test(pkg.moduleSha256)) {
      throw new MicrokernelError('LOAD_DIGEST_MALFORMED', `package ${pkg.packageId} moduleSha256 is not a lowercase hex sha-256`);
    }
    if (KERNEL_ABI[pkg.abiVersion] === undefined) {
      throw new MicrokernelError('LOAD_ABI_UNKNOWN', `package ${pkg.packageId} declares unknown abiVersion ${pkg.abiVersion}`);
    }
    if (KERNEL_ABI[pkg.abiVersion].kind !== pkg.kind) {
      throw new MicrokernelError('LOAD_KIND_ABI_MISMATCH', `package ${pkg.packageId} kind ${pkg.kind} does not match abi ${pkg.abiVersion}`);
    }
  }
  const packageIds = root.packages.map((pkg) => pkg.packageId);
  if (new Set(packageIds).size !== packageIds.length) {
    throw new MicrokernelError('LOAD_DUPLICATE_PACKAGE', 'root closure contains duplicate packageIds');
  }
  for (const role of ['kernel', 'rule-interpreter', 'business-policy']) {
    const bound = root.bindings.filter((binding) => binding.role === role);
    if (bound.length !== 1) {
      throw new MicrokernelError('LOAD_ROLE_BINDING_INVALID', `role ${role} must be bound to exactly one package (found ${bound.length})`);
    }
    if (!packageIds.includes(bound[0].packageId)) {
      throw new MicrokernelError('LOAD_ROLE_BINDING_INVALID', `role ${role} binds unknown package ${bound[0].packageId}`);
    }
  }
}

/** Structurally validate ONE generic intent (JSON-only, no functions/symbols). */
export function assertPlainJsonIntent(intent) {
  const stack = [['$intent', intent]];
  while (stack.length > 0) {
    const [path, value] = stack.pop();
    if (value === null || typeof value === 'string' || typeof value === 'boolean') continue;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new MicrokernelError('INTENT_NOT_JSON', `${path} contains a non-finite number`);
      }
      continue;
    }
    if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint' || typeof value === 'undefined') {
      throw new MicrokernelError('INTENT_NOT_JSON', `${path} carries a non-JSON ${typeof value}; intents are data only and can never carry handles, ports or callables`);
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => stack.push([`${path}[${index}]`, item]));
      continue;
    }
    if (typeof value !== 'object') {
      throw new MicrokernelError('INTENT_NOT_JSON', `${path} carries unsupported ${typeof value}`);
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new MicrokernelError('INTENT_NOT_JSON', `${path} must be a plain JSON object`);
    }
    for (const key of Object.keys(value)) {
      stack.push([`${path}.${key}`, value[key]]);
    }
  }
}
