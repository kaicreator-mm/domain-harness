/** Exact locale-independent ordering used by successor package identity. */
export function compareCompiledPackageDataKeys(left, right) {
    if (left < right)
        return -1;
    if (left > right)
        return 1;
    return 0;
}
/** Compatibility name retained for I-PKG-DATA callers. */
export const compareCompiledDomainDataKeys = compareCompiledPackageDataKeys;
export const compareCompiledBusinessSourceKeys = compareCompiledPackageDataKeys;
/** One authoritative projection from a validated/compiled Domain Data section into identity material. */
export function compiledDomainDataIdentityMaterial(section) {
    return {
        descriptors: section.descriptors.map((descriptor) => ({
            key: descriptor.key,
            contentDigest: descriptor.contentDigest,
            ...(descriptor.valueSchema === undefined ? {} : { valueSchema: descriptor.valueSchema }),
        })),
        packageDataBounds: { ...section.packageDataBounds },
    };
}
export function compiledBusinessSourceIdentityMaterial(section) {
    return {
        schemaContractVersion: section.schemaContractVersion,
        descriptors: section.descriptors.map((descriptor) => ({
            source: descriptor.source,
            valueSchema: descriptor.valueSchema,
            ...(descriptor.validatorBindingDigest === undefined
                ? {}
                : { validatorBindingDigest: descriptor.validatorBindingDigest }),
        })),
    };
}
//# sourceMappingURL=package-data.js.map