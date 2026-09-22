import { PackageActivationError } from './errors.js';
export class StaticPackageRegistry {
    defaultPackageId;
    #packages;
    #packageIds;
    constructor(packages, defaultPackageId) {
        const byId = new Map();
        for (const compiledPackage of packages) {
            const packageId = compiledPackage.manifest.packageId;
            if (byId.has(packageId)) {
                throw new PackageActivationError('DUPLICATE_PACKAGE_ID', `PackageRegistry contains duplicate packageId "${packageId}"`);
            }
            byId.set(packageId, compiledPackage);
        }
        if (!byId.has(defaultPackageId)) {
            throw new PackageActivationError('DEFAULT_PACKAGE_MISSING', `PackageRegistry default package "${defaultPackageId}" is not present`);
        }
        this.defaultPackageId = defaultPackageId;
        this.#packages = byId;
        this.#packageIds = [...byId.keys()].sort();
    }
    get(packageId) {
        return this.#packages.get(packageId);
    }
    has(packageId) {
        return this.#packages.has(packageId);
    }
    listPackageIds() {
        return this.#packageIds;
    }
}
export function resolveDefaultPackage(registry) {
    const compiledPackage = registry.get(registry.defaultPackageId);
    if (compiledPackage === undefined) {
        throw new PackageActivationError('DEFAULT_PACKAGE_MISSING', `PackageRegistry default package "${registry.defaultPackageId}" is not present`);
    }
    return compiledPackage;
}
export function resolvePinnedPackage(registry, packageId) {
    const compiledPackage = registry.get(packageId);
    if (compiledPackage === undefined) {
        throw new PackageActivationError('MISSING_RETAINED_PIN', `retained Workflow Instance requires missing package "${packageId}"`, [packageId]);
    }
    return compiledPackage;
}
//# sourceMappingURL=registry.js.map