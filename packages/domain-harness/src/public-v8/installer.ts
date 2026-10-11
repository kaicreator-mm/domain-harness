/**
 * v0.8 qualified package installer — INTERNAL protected Host channel (T-A, #1000).
 * =============================================================================
 *
 * Not exported from the public package index. Only `load()` reaches this
 * module: the trusted installation boundary verifies EVERY package's module
 * bytes against its sealed SHA-256 BEFORE the module is imported, then
 * instantiates the module physically from its exact sealed bytes via a
 * `data:` module import (the executing code enters the process ONLY through
 * this path) and checks the module's self-declared identity. A forged
 * producer, mutated bytes or a mismatched provider can therefore never
 * become executable (adapted from #994@b9ea4d1 load.mjs installer part and
 * #978@f87cfdf trusted-anchor install).
 */

import {
  QualifiedPackageError,
  V8_QUALIFIED_ABI,
  sha256Hex,
  type QualifiedPackageDescriptor,
  type SealedQualifiedPackageRoot,
} from './contracts.js';

export interface InstalledQualifiedPackage {
  readonly descriptor: QualifiedPackageDescriptor;
  readonly namespace: Record<string, unknown>;
}

async function importModuleFromBytes(moduleSource: string): Promise<Record<string, unknown>> {
  const url = `data:text/javascript;base64,${Buffer.from(moduleSource, 'utf8').toString('base64')}`;
  return (await import(url)) as Record<string, unknown>;
}

/**
 * Install every sealed package of an already statically qualified root.
 * Order of checks is load-bearing: bytes are verified BEFORE the dynamic
 * import, so mutated code is refused while it is still inert data.
 */
export async function installQualifiedPackages(root: SealedQualifiedPackageRoot): Promise<readonly InstalledQualifiedPackage[]> {
  const installed: InstalledQualifiedPackage[] = [];
  for (const descriptor of root.packages) {
    const digest = sha256Hex(descriptor.moduleSource);
    if (digest !== descriptor.moduleSha256) {
      throw new QualifiedPackageError(
        'INSTALL_BYTES_MUTATED',
        `package ${descriptor.packageId}: sealed moduleSha256 ${descriptor.moduleSha256} does not match the presented module bytes (actual ${digest}); mutated bytes are refused before any executable import`,
      );
    }
    const namespace = await importModuleFromBytes(descriptor.moduleSource);
    const abi = V8_QUALIFIED_ABI[descriptor.abiVersion];
    if (abi === undefined) {
      throw new QualifiedPackageError('LOAD_ABI_UNKNOWN', `package ${descriptor.packageId} declares unknown abiVersion ${descriptor.abiVersion}`);
    }
    for (const exportName of abi.requiredExports) {
      if (namespace[exportName] === undefined) {
        throw new QualifiedPackageError(
          'MODULE_IDENTITY_MISMATCH',
          `package ${descriptor.packageId}: module does not export required ABI member ${exportName}; activation of an unqualified module fails typed`,
        );
      }
    }
    if (namespace.MODULE_ID !== descriptor.packageId) {
      throw new QualifiedPackageError(
        'MODULE_IDENTITY_MISMATCH',
        `package ${descriptor.packageId}: module self-identifies as ${String(namespace.MODULE_ID)}; a mismatched provider can never be installed under another package identity`,
      );
    }
    if (namespace.ABI_VERSION !== descriptor.abiVersion) {
      throw new QualifiedPackageError(
        'MODULE_IDENTITY_MISMATCH',
        `package ${descriptor.packageId}: module declares ABI ${String(namespace.ABI_VERSION)} but was sealed as ${descriptor.abiVersion}`,
      );
    }
    if (namespace.PACKAGE_KIND !== descriptor.kind) {
      throw new QualifiedPackageError(
        'MODULE_IDENTITY_MISMATCH',
        `package ${descriptor.packageId}: module declares PACKAGE_KIND ${String(namespace.PACKAGE_KIND)} but was sealed as ${descriptor.kind}`,
      );
    }
    const endpoints = Array.isArray(namespace.ENDPOINTS) ? (namespace.ENDPOINTS as { kind?: unknown }[]) : [];
    const exportedKinds = new Set(endpoints.map((endpoint) => endpoint.kind));
    for (const kind of abi.requiredEndpointKinds) {
      if (!exportedKinds.has(kind)) {
        throw new QualifiedPackageError(
          'ENDPOINT_MISSING',
          `package ${descriptor.packageId}: sealed endpoint kind ${kind} is not provided by the module`,
        );
      }
    }
    installed.push({ descriptor, namespace });
  }
  return installed;
}
