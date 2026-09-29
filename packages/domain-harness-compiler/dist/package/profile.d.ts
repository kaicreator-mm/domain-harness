/**
 * Public compiler output remains frozen on the legacy profile until the later
 * I-03-ASSEMBLY node authorizes publication of a complete successor artifact.
 */
export declare const PUBLIC_COMPILER_OUTPUT_PROFILE: {
    readonly formatVersion: "0.2";
    readonly runtimeContractMajor: 2;
    readonly executionEngineMajor: 2;
};
/**
 * Internal scaffold identity available to downstream successor feature work.
 * Its presence does not authorize compileDomainPackage() to emit it.
 */
export declare const SUCCESSOR_COMPILER_PROFILE_SCAFFOLD: {
    readonly formatVersion: "0.3";
    readonly runtimeContractMajor: 2;
    readonly executionEngineMajor: 3;
};
