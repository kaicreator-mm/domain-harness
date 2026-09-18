import type { RuntimeStore } from '../v2/contracts/store.js';
import type {
  PackageRegistry,
  TargetCompiledDomainPackage,
} from '../v2/contracts/package.js';
import { PackageActivationError } from './errors.js';
import type { CompiledPackageValidationPolicy } from './validation.js';
import { validateCompiledPackage } from './validation.js';

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

async function validateRegistryPackages(
  registry: PackageRegistry,
  policy: CompiledPackageValidationPolicy,
): Promise<ReadonlyMap<string, TargetCompiledDomainPackage>> {
  const validated = new Map<string, TargetCompiledDomainPackage>();
  for (const packageId of registry.listPackageIds()) {
    if (typeof packageId !== 'string' || packageId.length === 0 || validated.has(packageId)) {
      throw new PackageActivationError(
        'INVALID_COMPILED_PACKAGE',
        'PackageRegistry listPackageIds() must return unique non-empty package ids',
      );
    }
    const compiledPackage = registry.get(packageId);
    if (compiledPackage === undefined) {
      throw new PackageActivationError(
        'INVALID_COMPILED_PACKAGE',
        `PackageRegistry listed package "${packageId}" but could not resolve it`,
      );
    }
    if (compiledPackage.manifest.packageId !== packageId) {
      throw new PackageActivationError(
        'PACKAGE_ID_MISMATCH',
        `PackageRegistry key "${packageId}" does not match resolved manifest packageId "${compiledPackage.manifest.packageId}"`,
      );
    }
    validated.set(packageId, await validateCompiledPackage(compiledPackage, policy));
  }
  return validated;
}

export async function preflightPackageActivation(
  request: PackageActivationPreflightRequest,
): Promise<PackageActivationPreflightResult> {
  const validatedPackages = await validateRegistryPackages(
    request.registry,
    request.validationPolicy,
  );

  const defaultPackage = validatedPackages.get(request.registry.defaultPackageId);
  if (defaultPackage === undefined) {
    throw new PackageActivationError(
      'DEFAULT_PACKAGE_MISSING',
      `PackageRegistry default package "${request.registry.defaultPackageId}" was not listed and validated`,
    );
  }

  const retainedPackageIds = await listRetainedPackageIds(request.store);
  const missingPins = retainedPackageIds.filter((packageId) => !validatedPackages.has(packageId));
  if (missingPins.length > 0) {
    throw new PackageActivationError(
      'MISSING_RETAINED_PIN',
      'runtime activation aborted because one or more retained package pins are missing',
      missingPins,
    );
  }

  const retainedPackages = retainedPackageIds.map((packageId) => {
    const compiledPackage = validatedPackages.get(packageId);
    if (compiledPackage === undefined) {
      throw new PackageActivationError(
        'MISSING_RETAINED_PIN',
        `retained Workflow Instance requires missing package "${packageId}"`,
        [packageId],
      );
    }
    return compiledPackage;
  });

  return {
    defaultPackage,
    retainedPackageIds,
    retainedPackages,
  };
}
