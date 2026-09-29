/**
 * Exact locale-independent key ordering used by successor package identity.
 * JavaScript string relational comparison is lexicographic by UTF-16 code
 * units, matching the deterministic ordering used by the shared canonical JSON
 * seam. Locale/ICU collation must never participate in package identity.
 */
export function compareCompiledDomainDataKeys(left, right) {
    if (left < right)
        return -1;
    if (left > right)
        return 1;
    return 0;
}
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
//# sourceMappingURL=package-data.js.map