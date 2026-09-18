import type {
  PackageRegistry,
  TargetCompiledDomainPackage,
} from '../v2/contracts/package.js';
import { PackageActivationError } from './errors.js';

export class StaticPackageRegistry implements PackageRegistry {
  readonly defaultPackageId: string;
  readonly #packages: ReadonlyMap<string, TargetCompiledDomainPackage>;
  readonly #packageIds: readonly string[];

  constructor(
    packages: readonly TargetCompiledDomainPackage[],
    defaultPackageId: string,
  ) {
    const byId = new Map<string, TargetCompiledDomainPackage>();
    for (const compiledPackage of packages) {
      const packageId = compiledPackage.manifest.packageId;
      if (byId.has(packageId)) {
        throw new PackageActivationError(
          'DUPLICATE_PACKAGE_ID',
          `PackageRegistry contains duplicate packageId "${packageId}"`,
        );
      }
      byId.set(packageId, compiledPackage);
    }

    if (!byId.has(defaultPackageId)) {
      throw new PackageActivationError(
        'DEFAULT_PACKAGE_MISSING',
        `PackageRegistry default package "${defaultPackageId}" is not present`,
      );
    }

    this.defaultPackageId = defaultPackageId;
    this.#packages = byId;
    this.#packageIds = [...byId.keys()].sort();
  }

  get(packageId: string): TargetCompiledDomainPackage | undefined {
    return this.#packages.get(packageId);
  }

  has(packageId: string): boolean {
    return this.#packages.has(packageId);
  }

  listPackageIds(): readonly string[] {
    return this.#packageIds;
  }
}

export function resolveDefaultPackage(registry: PackageRegistry): TargetCompiledDomainPackage {
  const compiledPackage = registry.get(registry.defaultPackageId);
  if (compiledPackage === undefined) {
    throw new PackageActivationError(
      'DEFAULT_PACKAGE_MISSING',
      `PackageRegistry default package "${registry.defaultPackageId}" is not present`,
    );
  }
  return compiledPackage;
}

export function resolvePinnedPackage(
  registry: PackageRegistry,
  packageId: string,
): TargetCompiledDomainPackage {
  const compiledPackage = registry.get(packageId);
  if (compiledPackage === undefined) {
    throw new PackageActivationError(
      'MISSING_RETAINED_PIN',
      `retained Workflow Instance requires missing package "${packageId}"`,
      [packageId],
    );
  }
  return compiledPackage;
}
