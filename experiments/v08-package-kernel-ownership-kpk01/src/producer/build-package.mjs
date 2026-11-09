/**
 * Test-only system producer — sealed package root builder (experiment KPK-01)
 * ===========================================================================
 *
 * PROVENANCE TRUTH (per #993 preflight 6086996409): this is the G0
 * hand-authored, test-controlled SYSTEM producer, NOT domain-forge (whose
 * authorized production today is Domain Data candidates only), NOT
 * domain-simulator validation, NOT a domain-ai-creator build service and NOT
 * a DAC promotion/selection/activation. It performs the BOUNDED build-time
 * static qualification the #993 experiment needs:
 *
 *   controlledSystemSourceSHA (this repository, pinned base commit)
 *     → module raw-byte SHA-256 per package
 *     → static Kind/ABI/endpoint/self-identity qualification (fails typed
 *       BEFORE any runtime load: wrong Kind/provider/ABI never reaches the
 *       Microkernel — KPK-10)
 *     → sealed fixed closure + fixed intent bindings + closureDigest
 *     → handed to `DomainHarness.load(package)` which independently
 *       re-verifies byte immutability at installation (KPK-12).
 *
 * No runtime semantic legality engine exists here either: the producer never
 * evaluates guards/journals/effects; it only qualifies static identity and
 * binding shape.
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const PAYLOAD_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'payload');

export class ProducerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ProducerError';
    this.code = code;
  }
}

const PRODUCER_ABI_REGISTRY = {
  'kpk01-kernel-abi/1': { kind: 'kernel', requiredExports: ['createOccurrenceRuntime', 'MODULE_ID', 'ABI_VERSION', 'ENDPOINTS'] },
  'kpk01-sdk-abi/1': { kind: 'standard-sdk', requiredExports: ['interpret', 'MODULE_ID', 'ABI_VERSION', 'ENDPOINTS'] },
  'kpk01-business-abi/1': { kind: 'business', requiredExports: ['getPolicy', 'INTENT_TYPES', 'MODULE_ID', 'ABI_VERSION', 'ENDPOINTS'] },
};

function sha256Hex(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

async function readPayload(moduleFile) {
  const modulePath = path.join(PAYLOAD_DIR, moduleFile);
  const moduleSource = await readFile(modulePath, 'utf8');
  return { modulePath, moduleSource };
}

async function staticallyQualify({ moduleFile, modulePath, moduleSource, expectedAbi }) {
  const entry = PRODUCER_ABI_REGISTRY[expectedAbi];
  if (entry === undefined) {
    throw new ProducerError('PRODUCER_ABI_UNKNOWN', `abiVersion ${expectedAbi} is not in the producer ABI registry`);
  }
  const namespace = await import(pathToFileURL(modulePath).href);
  for (const exportName of entry.requiredExports) {
    if (namespace[exportName] === undefined) {
      throw new ProducerError('PRODUCER_EXPORT_MISSING', `module ${moduleFile} does not export required ABI member ${exportName}`);
    }
  }
  if (namespace.PACKAGE_KIND !== entry.kind) {
    throw new ProducerError(
      'PRODUCER_KIND_MISMATCH',
      `module ${moduleFile} declares PACKAGE_KIND ${String(namespace.PACKAGE_KIND)} but abi ${expectedAbi} qualifies kind ${entry.kind}`,
    );
  }
  if (namespace.ABI_VERSION !== expectedAbi) {
    throw new ProducerError(
      'PRODUCER_ABI_MISMATCH',
      `module ${moduleFile} declares ABI ${String(namespace.ABI_VERSION)} but was submitted as ${expectedAbi}`,
    );
  }
  const endpointKinds = (namespace.ENDPOINTS ?? []).map((endpoint) => endpoint.kind);
  if (endpointKinds.length === 0 || new Set(endpointKinds).size !== endpointKinds.length) {
    throw new ProducerError('PRODUCER_ENDPOINT_INVALID', `module ${moduleFile} must declare non-empty, unique endpoint kinds`);
  }
  return { namespace, moduleSha256: sha256Hex(moduleSource) };
}

/**
 * Build one sealed package root from physical payload module files.
 *
 * Options:
 *   rootPackageId — versioned root identity, e.g. 'app:demo@1.0.0'
 *   kernelModule / sdkModule / businessModule — payload file names
 *   baseCommit — pinned source commit recorded into build provenance
 */
export async function buildPackageRoot(options = {}) {
  const {
    rootPackageId,
    businessModule,
    kernelModule = 'kernel-mechanism-v1.mjs',
    sdkModule = 'sdk-standard.mjs',
    baseCommit = '3c71b9138056babfafbc7de1349b5924483f2203',
    builtAt = new Date().toISOString(),
  } = options;
  if (typeof rootPackageId !== 'string' || rootPackageId.length === 0) {
    throw new ProducerError('PRODUCER_ROOT_ID_INVALID', 'rootPackageId must be a non-empty versioned identity');
  }
  if (typeof businessModule !== 'string' || businessModule.length === 0) {
    throw new ProducerError('PRODUCER_BUSINESS_REQUIRED', 'businessModule is required: the system producer seals an explicitly selected business package (no built-in business default exists)');
  }

  const specs = [
    { role: 'kernel', abi: 'kpk01-kernel-abi/1', file: kernelModule },
    { role: 'rule-interpreter', abi: 'kpk01-sdk-abi/1', file: sdkModule },
    { role: 'business-policy', abi: 'kpk01-business-abi/1', file: businessModule },
  ];

  const packages = [];
  const bindings = [];
  for (const spec of specs) {
    const { modulePath, moduleSource } = await readPayload(spec.file);
    const { namespace, moduleSha256 } = await staticallyQualify({
      moduleFile: spec.file,
      modulePath,
      moduleSource,
      expectedAbi: spec.abi,
    });
    if (packages.some((pkg) => pkg.packageId === namespace.MODULE_ID)) {
      throw new ProducerError('PRODUCER_DUPLICATE_PACKAGE', `package ${namespace.MODULE_ID} appears twice in the closure`);
    }
    packages.push({
      packageId: namespace.MODULE_ID,
      kind: namespace.PACKAGE_KIND,
      abiVersion: namespace.ABI_VERSION,
      moduleSource,
      moduleSha256,
      endpoints: namespace.ENDPOINTS.map((endpoint) => ({ ...endpoint })),
    });
    bindings.push({
      role: spec.role,
      packageId: namespace.MODULE_ID,
      endpointId: namespace.ENDPOINTS[0].endpointId,
    });
    if (spec.role === 'business-policy') {
      const policy = namespace.getPolicy();
      for (const intentType of namespace.INTENT_TYPES) {
        if (policy.intentBindings[intentType] === undefined) {
          throw new ProducerError(
            'PRODUCER_INTENT_BINDING_MISSING',
            `business module ${spec.file} advertises INTENT_TYPE ${intentType} but its policy binds no such intent`,
          );
        }
        bindings.push({
          role: 'intent',
          intentType,
          packageId: namespace.MODULE_ID,
          endpointId: namespace.ENDPOINTS[0].endpointId,
        });
      }
    }
  }

  const closureDigest = sha256Hex(JSON.stringify({
    packages: packages.map((pkg) => ({ packageId: pkg.packageId, moduleSha256: pkg.moduleSha256 })),
    bindings,
  }));

  const root = {
    formatVersion: 'v08-kpk01-root/1',
    rootPackageId,
    build: {
      producerId: 'system-producer:test',
      builtAt,
      baseCommit,
      closureDigest,
    },
    packages,
    bindings,
  };
  for (const pkg of root.packages) Object.freeze(pkg);
  Object.freeze(root.build);
  Object.freeze(root.bindings);
  Object.freeze(root);
  return root;
}
