/**
 * C01 fixture (#1222) — a minimal NON-external read-only capability
 * ("directory"), the ordinary read Tool the read-then-external witness needs.
 * ============================================================================
 *
 * It seals exactly one read operation, `directory.lookup` (effectClass
 * 'none'): plain in-memory reference data, no external system, no K authority,
 * no permit. Its only job in the suite is to be called FIRST inside one
 * effect whose binding IS external — proving an ordinary read Tool call never
 * consumes that effect's one durable dispatch claim (#1222).
 *
 * The sealed module instance is imported through the activation's private
 * module URL, so the lookup count is observed through globalThis (the same
 * cross-instance discipline as the extjob console's pinned SQLite store).
 */

export const MODULE_ID = 'capability-directory-read@v010.1.0.0';
export const PACKAGE_KIND = 'capability';
export const CAPABILITY_ID = 'directory';
export const ABI_VERSION = 'v08-capability-abi/1';
export const ENDPOINTS = [
  { endpointId: 'capability:directory', kind: 'capability-endpoint' },
];
export const OPERATIONS = [
  { operationId: 'directory.lookup', effectClass: 'none' },
];

export function directoryLookup(payload) {
  globalThis.__c01DirectoryLookups = (globalThis.__c01DirectoryLookups ?? 0) + 1;
  return {
    found: true,
    key: payload?.key ?? null,
    entry: { name: 'ops-directory', contact: 'ops@example.invalid' },
  };
}

/** Test-side observation of the sealed instance's physical read count. */
export function directoryLookupCount() {
  return globalThis.__c01DirectoryLookups ?? 0;
}
