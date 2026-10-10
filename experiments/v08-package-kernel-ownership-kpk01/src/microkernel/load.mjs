/**
 * Microkernel — load(package) (experiment KPK-01)
 * ===============================================
 *
 * The entire irreducible SDK bootstrap: verify the sealed root shape against
 * the generic ABI registry, verify EVERY package's module bytes against its
 * sealed SHA-256 at this trusted installation boundary, physically
 * instantiate each module from its exact sealed bytes via a `data:` module
 * import (the executing mechanism code enters the process ONLY through this
 * path), check the module's self-declared identity, and wire the
 * already-resolved endpoints. Then return the UX transport.
 *
 * What this loader deliberately does NOT contain (KPK-02/03/10/12 falsify):
 *   - any v0.7 T002/T003/T004/State/Guard/Journal/Effect engine import or
 *     re-implementation — the physically selected Kernel Domain Package owns
 *     the entire mechanism;
 *   - any business/domain special case (no industry `if` anywhere);
 *   - any provider discovery, dependency solving, semantic graph rebuild or
 *     per-request whole-package hashing — the closure was fixed at build
 *     time by the system producer;
 *   - any runtime package semantic verifier — a raw/unqualified manifest
 *     fails here with a typed installation error, nothing more.
 */

import {
  assertSealedShape,
  assertPlainJsonIntent,
  KERNEL_ABI,
  MicrokernelError,
} from './contracts.mjs';

function importModuleFromBytes(moduleSource) {
  const url = `data:text/javascript;base64,${Buffer.from(moduleSource, 'utf8').toString('base64')}`;
  return import(url);
}

/**
 * Instantiate one sealed package module from its exact bytes and prove the
 * module's self identity against the sealed identity.
 */
async function installPackage(pkg, sha256) {
  const digest = await sha256.digestUtf8(pkg.moduleSource);
  if (digest !== pkg.moduleSha256) {
    throw new MicrokernelError(
      'INSTALL_BYTES_MUTATED',
      `package ${pkg.packageId}: sealed moduleSha256 ${pkg.moduleSha256} does not match the presented module bytes (actual ${digest}); mutated installed bytes fail this trusted installation boundary`,
    );
  }
  const namespace = await importModuleFromBytes(pkg.moduleSource);
  const abi = KERNEL_ABI[pkg.abiVersion];
  for (const exportName of abi.requiredExports) {
    if (namespace[exportName] === undefined) {
      throw new MicrokernelError(
        'MODULE_IDENTITY_MISMATCH',
        `package ${pkg.packageId}: module does not export required ABI member ${exportName}`,
      );
    }
  }
  if (namespace.MODULE_ID !== pkg.packageId) {
    throw new MicrokernelError(
      'MODULE_IDENTITY_MISMATCH',
      `package ${pkg.packageId}: module self-identifies as ${String(namespace.MODULE_ID)}; a mismatched provider can never be installed under another package identity`,
    );
  }
  if (namespace.ABI_VERSION !== pkg.abiVersion) {
    throw new MicrokernelError(
      'MODULE_IDENTITY_MISMATCH',
      `package ${pkg.packageId}: module declares ABI ${String(namespace.ABI_VERSION)} but was sealed as ${pkg.abiVersion}`,
    );
  }
  const exportedKinds = new Set((namespace.ENDPOINTS ?? []).map((endpoint) => endpoint.kind));
  for (const kind of abi.requiredEndpointKinds) {
    if (!exportedKinds.has(kind)) {
      throw new MicrokernelError(
        'ENDPOINT_MISSING',
        `package ${pkg.packageId}: sealed endpoint kind ${kind} is not provided by the module; packages with missing mechanism fail this typed startup`,
      );
    }
  }
  return { pkg, namespace };
}

/**
 * DomainHarness.load(package) — the public consumption abstraction.
 *
 * `packageRoot` is the trusted, producer-controlled sealed Domain Package
 * root (fixed build-produced closure and target bindings). There is no
 * `compiledApp` parameter and no runtime raw compilation: the only runtime
 * work is byte verification, physical module instantiation and endpoint
 * wiring.
 */
export async function load(packageRoot, options = {}) {
  const hostPorts = options.hostPorts;
  if (
    typeof hostPorts?.docs?.get !== 'function'
    || typeof hostPorts?.docs?.put !== 'function'
    || typeof hostPorts?.sha256?.digestUtf8 !== 'function'
  ) {
    throw new MicrokernelError('HOST_PORTS_INVALID', 'load requires Host ports {docs:{get,put}, sha256:{digestUtf8}}');
  }

  assertSealedShape(packageRoot);

  const digestOps = { count: 0 };
  const countingSha256 = {
    digestUtf8: async (value) => {
      digestOps.count += 1;
      return hostPorts.sha256.digestUtf8(value);
    },
  };
  const hostPortsWithCounting = {
    ...hostPorts,
    sha256: countingSha256,
  };

  const installed = [];
  for (const pkg of packageRoot.packages) {
    installed.push(await installPackage(pkg, countingSha256));
  }

  const byPackageId = new Map(installed.map((entry) => [entry.pkg.packageId, entry]));
  const roleBinding = new Map(packageRoot.bindings.map((binding) => [binding.role, binding]));
  const pick = (role) => {
    const binding = roleBinding.get(role);
    const entry = byPackageId.get(binding.packageId);
    if (entry === undefined) {
      throw new MicrokernelError('LOAD_ROLE_BINDING_INVALID', `role ${role} binds unknown package ${binding.packageId}`);
    }
    return entry;
  };
  const kernel = pick('kernel');
  const sdk = pick('rule-interpreter');
  const business = pick('business-policy');

  const observers = new Set();
  const businessPolicy = business.namespace.getPolicy();
  const sdkEndpoint = {
    packageId: sdk.pkg.packageId,
    interpret: sdk.namespace.interpret,
  };

  const kernelRuntime = kernel.namespace.createOccurrenceRuntime({
    moduleIdentity: {
      packageId: kernel.pkg.packageId,
      moduleSha256: kernel.pkg.moduleSha256,
    },
    hostPorts: hostPortsWithCounting,
    sdkEndpoint,
    businessEndpoint: businessPolicy,
    observe: (receipt) => {
      for (const observer of observers) {
        try {
          observer(receipt);
        } catch {
          // An observer failure never mutates the authoritative occurrence.
        }
      }
    },
  });

  const intentIndex = new Map(
    packageRoot.bindings
      .filter((binding) => binding.role === 'intent')
      .map((binding) => [binding.intentType, binding]),
  );

  const runtime = {
    get kernelRuntime() {
      return kernelRuntime;
    },
    get trace() {
      return {
        root: {
          rootPackageId: packageRoot.rootPackageId,
          build: { ...packageRoot.build },
          closureDigest: packageRoot.build.closureDigest,
        },
        packages: installed.map((entry) => ({
          packageId: entry.pkg.packageId,
          kind: entry.pkg.kind,
          abiVersion: entry.pkg.abiVersion,
          moduleSha256: entry.pkg.moduleSha256,
          moduleId: entry.namespace.MODULE_ID,
          endpoints: entry.namespace.ENDPOINTS,
        })),
        digestOpsAtInstall: digestOps.count,
      };
    },

    async openInstance(request) {
      assertPlainJsonIntent(request);
      requireTarget(request.target);
      return kernelRuntime.openInstance(request);
    },

    async send(intent) {
      assertPlainJsonIntent(intent);
      if (typeof intent?.intentType !== 'string' || intent.intentType.length === 0) {
        throw new MicrokernelError('INTENT_MALFORMED', 'intent.intentType must be a non-empty string');
      }
      if (!intentIndex.has(intent.intentType)) {
        throw new MicrokernelError(
          'INTENT_UNBOUND',
          `intent type ${intent.intentType} is not bound in this sealed package closure; no provider discovery or fallback exists at runtime`,
        );
      }
      requireTarget(intent.target);
      if (typeof intent.messageId !== 'string' || intent.messageId.length === 0) {
        throw new MicrokernelError('INTENT_MALFORMED', 'intent.messageId must be a non-empty string');
      }
      return kernelRuntime.submitOccurrence(intent);
    },

    async query(query) {
      assertPlainJsonIntent(query);
      switch (query.kind) {
        case 'instance':
          requireTarget(query.target);
          return kernelRuntime.getSnapshot(query.target);
        case 'journal':
          return kernelRuntime.getJournalRecords();
        case 'mechanism':
          return kernelRuntime.getMechanismIdentity();
        case 'counters':
          return { ...kernelRuntime.counters };
        case 'build':
          return this.trace;
        default:
          throw new MicrokernelError('QUERY_KIND_UNKNOWN', `query kind ${String(query.kind)} is not a transport query`);
      }
    },

    observe(observer) {
      if (typeof observer !== 'function') {
        throw new MicrokernelError('OBSERVER_INVALID', 'observe requires a listener function');
      }
      observers.add(observer);
      return () => observers.delete(observer);
    },

    stop() {
      observers.clear();
    },
  };
  Object.freeze(runtime.trace);
  Object.freeze(runtime);
  return runtime;
}

function requireTarget(target) {
  if (
    typeof target !== 'object' || target === null
    || typeof target.workflowId !== 'string' || target.workflowId.length === 0
    || typeof target.instanceKey !== 'string' || target.instanceKey.length === 0
  ) {
    throw new MicrokernelError('TARGET_MALFORMED', 'target must be {workflowId, instanceKey} non-empty strings');
  }
}
