import { LEGACY_COMPILED_ARTIFACT_PROFILE, SUCCESSOR_COMPILED_ARTIFACT_PROFILE, compiledArtifactProfileKey, isSupportedCompiledArtifactProfile, sameCompiledArtifactProfile, } from '../v2/contracts/compiled-artifact-profile.js';
import { PackageActivationError } from './errors.js';
import { validateCompiledPackage, } from './validation.js';
const PACKAGE_DATA_BOUND_KEYS = [
    'maxDomainDataEntries',
    'maxDomainDataEntryCanonicalBytes',
    'maxTotalDomainDataCanonicalBytes',
    'maxBusinessSources',
    'maxSchemaCanonicalBytes',
];
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function failInvalid(message) {
    throw new PackageActivationError('INVALID_COMPILED_PACKAGE', message);
}
/** Exact five-field package-data bounds reader shared by validation paths. */
export function normalizePackageDataBounds(value, label) {
    if (!isRecord(value)) {
        throw new PackageActivationError('INCOMPATIBLE_PACKAGE', `${label} must be an object`);
    }
    const actualKeys = Object.keys(value).sort();
    const expectedKeys = [...PACKAGE_DATA_BOUND_KEYS].sort();
    if (actualKeys.length !== expectedKeys.length
        || actualKeys.some((key, index) => key !== expectedKeys[index])) {
        throw new PackageActivationError('INCOMPATIBLE_PACKAGE', `${label} must contain exactly the frozen package-data bound fields`, actualKeys);
    }
    const result = {};
    for (const key of PACKAGE_DATA_BOUND_KEYS) {
        const bound = value[key];
        if (typeof bound !== 'number' || !Number.isSafeInteger(bound) || bound < 0) {
            throw new PackageActivationError('INCOMPATIBLE_PACKAGE', `${label}.${key} must be a non-negative safe integer`);
        }
        result[key] = bound;
    }
    return result;
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
    if (policy.supportedProfiles.some((profile) => sameCompiledArtifactProfile(profile, SUCCESSOR_COMPILED_ARTIFACT_PROFILE))) {
        if (policy.supportedPackageDataBounds === undefined) {
            throw new PackageActivationError('INCOMPATIBLE_PACKAGE', 'successor 0.3/2/3 support requires supportedPackageDataBounds');
        }
        normalizePackageDataBounds(policy.supportedPackageDataBounds, 'supportedPackageDataBounds');
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
        ...(isSupportedPolicy(policy) && policy.supportedPackageDataBounds !== undefined
            ? { supportedPackageDataBounds: normalizePackageDataBounds(policy.supportedPackageDataBounds, 'supportedPackageDataBounds') }
            : {}),
    };
}
/**
 * Successor validators call this before package admission. Package-recorded
 * maxima are never allowed to exceed host-supported maxima or be silently
 * truncated/raised.
 */
export function assertPackageDataBoundsSupported(packageBounds, policy) {
    const actual = normalizePackageDataBounds(packageBounds, 'packageDataBounds');
    if (policy.supportedPackageDataBounds === undefined) {
        throw new PackageActivationError('INCOMPATIBLE_PACKAGE', 'successor package validation requires supportedPackageDataBounds');
    }
    const supported = normalizePackageDataBounds(policy.supportedPackageDataBounds, 'supportedPackageDataBounds');
    const exceeded = PACKAGE_DATA_BOUND_KEYS.filter((key) => actual[key] > supported[key]);
    if (exceeded.length > 0) {
        throw new PackageActivationError('INCOMPATIBLE_PACKAGE', 'package-recorded data bounds exceed host-supported maxima', exceeded.map((key) => `${key}: package=${actual[key]} host=${supported[key]}`));
    }
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
            throw new PackageActivationError('INCOMPATIBLE_PACKAGE', 'successor 0.3/2/3 profile is recognized but its DomainHarness feature validator is not installed', ['profile=0.3/2/3', 'feature-semantics=NOT_YET_ASSEMBLED']);
        }
        return extensions.successor(value, asSupportedPolicy(policy, supported));
    }
    throw new PackageActivationError('INCOMPATIBLE_PACKAGE', 'compiled package profile has no validation dispatch implementation', [`actual=${compiledArtifactProfileKey(profile)}`]);
}
//# sourceMappingURL=profile-validation.js.map