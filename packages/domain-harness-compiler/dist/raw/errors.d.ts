export declare class RawPackageDefinitionError extends Error {
    readonly issues: readonly string[];
    constructor(issues: readonly string[]);
}
