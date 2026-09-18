import type { RuntimeStore } from '../v2/contracts/store.js';
import type {
  PackageRegistry,
  TargetCompiledDomainPackage,
} from '../v2/contracts/package.js';
import { PackageActivationError } from './errors.js';
import type { CompiledPackageValidationPolicy } from './validation.js';
import { validateCompiledPackage } from './validation.js';
import { resolveDefaultPackage, resolvePinnedPackage } from './registry.js';

export type PackagePinStore = Pick<RuntimeStore, 'listPinnedPackageIds'>;

export interface PackageActivationPreflightRequest {
  readonly registry: PackageRegistry;
  readonly store: PackagePinStore;
  readonly validationPolicy: CompiledPackageValidationPolicy;
}

export interface PackageActivationPreflightResult {
  readonly defaultPackage: TargetCompiledDomainPackage;
  readonly retainedPackageIds: readonly string[];
  readonly retainedPackages: readonly TargetCompiledDomainPackage[];
}

export async function listRetainedPackageIds(store: PackagePinStore): Promise<readonly string[]> {
  const packageIds = await store.listPinnedPackageIds();
  const normalized = new Set<string>();
  for (const packageId of packageIds) {
    if (typeof packageId !== 'string' || packageId.length === 0) {
      throw new PackageActivationError(
        'INVALID_RETAINED_PIN',
        'RuntimeStore returned an invalid retained package pin',
      );
    }
    normalized.add(packageId);
  }
  return [...normalized].sort();
}

export async function preflightPackageActivation(
  request: PackageActivationPreflightRequest,
): Promise<PackageActivationPreflightResult> {
  for (const packageId of request.registry.listPackageIds()) {
    const compiledPackage = request.registry.get(packageId);
    if (compiledPackage === undefined) {
      throw new PackageActivationError(
        'INVALID_COMPILED_PACKAGE',
        `PackageRegistry listed package "${packageId}" but could not resolve it`,
      );
    }
    await validateCompiledPackage(compiledPackage, request.validationPolicy);
  }

  const retainedPackageIds = await listRetainedPackageIds(request.store);
  const missingPins = retainedPackageIds.filter((packageId) => !request.registry.has(packageId));
  if (missingPins.length > 0) {
    throw new PackageActivationError(
      'MISSING_RETAINED_PIN',
      'runtime activation aborted because one or more retained package pins are missing',
      missingPins,
    );
  }

  const retainedPackages = retainedPackageIds.map((packageId) =>
    resolvePinnedPackage(request.registry, packageId),
  );

  return {
    defaultPackage: resolveDefaultPackage(request.registry),
    retainedPackageIds,
    retainedPackages,
  };
}
