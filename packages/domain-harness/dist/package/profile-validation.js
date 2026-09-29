import { LEGACY_COMPILED_ARTIFACT_PROFILE, SUCCESSOR_COMPILED_ARTIFACT_PROFILE, compiledArtifactProfileKey, isSupportedCompiledArtifactProfile, sameCompiledArtifactProfile, } from '../v2/contracts/compiled-artifact-profile.js';
import { PackageActivationError } from './errors.js';
import { validateCompiledPackage, } from './validation.js';
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function failInvalid(message) {
    throw new PackageActivationError('INVALID_COMPILED_PACKAGE', message);
}
function readManifestProfile(value) {
    if (!isRecord(value))
        failInvalid('compiled package must be an object');
    if (!isRecord(value.manifest))
        failInvalid('compiled package manifest must be an object');
    const manifest = value.manifest;
    const formatVersion = manifest.formatVersion;
    const runtimeContractMajor = manifest.runtimeContractMajor;
    const executionEngineMajor = manifest.executionEngineMajor;
    if (typeof formatVersion !== 'string' || formatVersion.length === 0) {
        failInvalid('compiled package manifest field "formatVersion" must be a non-empty string');
    }
    if (typeof runtimeContractMajor !== 'number' || !Number.isInteger(runtimeContractMajor) || runtimeContractMajor < 0) {
        failInvalid('compiled package manifest field "runtimeContractMajor" must be a non-negative integer');
    }
    if (typeof executionEngineMajor !== 'number' || !Number.isInteger(executionEngineMajor) || executionEngineMajor < 0) {
        failInvalid('compiled package manifest field "executionEngineMajor" must be a non-negative integer');
    }
    return { formatVersion, runtimeContractMajor, executionEngineMajor };
}
function isSupportedPolicy(policy) {
    return 'supportedProfiles' in policy;
}
function normalizeSupportedProfiles(policy) {
    if (!isSupportedPolicy(policy)) {
        const legacyCandidate = {
            formatVersion: policy.formatVersion,
            runtimeContractMajor: policy.runtimeContractMajor,
            executionEngineMajor: policy.executionEngineMajor,
        };
        if (!sameCompiledArtifactProfile(legacyCandidate, LEGACY_COMPILED_ARTIFACT_PROFILE)) {
            throw new PackageActivationError('INCOMPATIBLE_PACKAGE', 'legacy single-profile validation policy may only select the frozen 0.2/2/2 profile', [`policy=${compiledArtifactProfileKey(legacyCandidate)}`]);
        }
        return [LEGACY_COMPILED_ARTIFACT_PROFILE];
    }
    if (policy.supportedProfiles.length === 0) {
        throw new PackageActivationError('INCOMPATIBLE_PACKAGE', 'compiled package validation policy must declare at least one supported profile');
    }
    const unique = new Set();
    for (const profile of policy.supportedProfiles) {
        if (!isSupportedCompiledArtifactProfile(profile)) {
            throw new PackageActivationError('INCOMPATIBLE_PACKAGE', 'compiled package validation policy declares an unsupported profile', [`policy=${compiledArtifactProfileKey(profile)}`]);
        }
        const key = compiledArtifactProfileKey(profile);
        if (unique.has(key)) {
            throw new PackageActivationError('INCOMPATIBLE_PACKAGE', 'compiled package validation policy contains duplicate profiles', [key]);
        }
        unique.add(key);
    }
    return policy.supportedProfiles;
}
function commonPolicy(policy) {
    return {
        hostCapabilities: policy.hostCapabilities,
        sha256: policy.sha256,
        ...(policy.targetProfileId === undefined ? {} : { targetProfileId: policy.targetProfileId }),
    };
}
function asSupportedPolicy(policy, supportedProfiles) {
    const common = commonPolicy(policy);
    return {
        supportedProfiles,
        hostCapabilities: common.hostCapabilities,
        sha256: common.sha256,
        ...(common.targetProfileId === undefined ? {} : { targetProfileId: common.targetProfileId }),
    };
}
export async function validateCompiledPackageByProfile(value, policy, extensions = {}) {
    const profile = readManifestProfile(value);
    if (!isSupportedCompiledArtifactProfile(profile)) {
        throw new PackageActivationError('INCOMPATIBLE_PACKAGE', 'compiled package declares an unsupported format/runtime/engine profile', [`actual=${compiledArtifactProfileKey(profile)}`]);
    }
    const supported = normalizeSupportedProfiles(policy);
    if (!supported.some((candidate) => sameCompiledArtifactProfile(candidate, profile))) {
        throw new PackageActivationError('INCOMPATIBLE_PACKAGE', 'compiled package profile is not enabled by this runtime/host', [
            `actual=${compiledArtifactProfileKey(profile)}`,
            `supported=${supported.map(compiledArtifactProfileKey).sort().join(',')}`,
        ]);
    }
    if (sameCompiledArtifactProfile(profile, LEGACY_COMPILED_ARTIFACT_PROFILE)) {
        return validateCompiledPackage(value, {
            formatVersion: LEGACY_COMPILED_ARTIFACT_PROFILE.formatVersion,
            runtimeContractMajor: LEGACY_COMPILED_ARTIFACT_PROFILE.runtimeContractMajor,
            executionEngineMajor: LEGACY_COMPILED_ARTIFACT_PROFILE.executionEngineMajor,
            ...commonPolicy(policy),
        });
    }
    if (sameCompiledArtifactProfile(profile, SUCCESSOR_COMPILED_ARTIFACT_PROFILE)) {
        if (!extensions.successor) {
            throw new PackageActivationError('INCOMPATIBLE_PACKAGE', 'successor 0.3/2/3 profile is recognized but its DomainHarness feature validator is not installed', ['profile=0.3/2/3', 'feature-semantics=NOT_OWNED_BY_I-FMT-03']);
        }
        return extensions.successor(value, asSupportedPolicy(policy, supported));
    }
    throw new PackageActivationError('INCOMPATIBLE_PACKAGE', 'compiled package profile has no validation dispatch implementation', [`actual=${compiledArtifactProfileKey(profile)}`]);
}
//# sourceMappingURL=profile-validation.js.map