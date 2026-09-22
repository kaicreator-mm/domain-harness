import type { LoadedRawDomainPackage } from './types.js';
export interface LoadRawDomainPackageOptions {
    root: string;
    registeredTools?: ReadonlySet<string>;
}
export declare function loadRawDomainPackage(options: LoadRawDomainPackageOptions): Promise<LoadedRawDomainPackage>;
