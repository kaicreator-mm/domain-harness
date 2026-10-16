/**
 * v0.9 N02 (#1028) — internal barrel of the Node24/SQLite physical layer.
 *
 * This barrel belongs to #1028's write set only. The package root
 * `src/index.ts` stays untouched (that is #1032/#1035 integration surface);
 * consumers (tests today, #1032 host-v9 port alignment and #1036 lifecycle
 * integration later) import from `../src/v09/index.js` or the concrete
 * modules directly.
 */

export {
  isV09CasStoreError,
  parseV09CasValue,
  probeV09PhysicalCasStore,
  serializeV09CasValue,
  validateV09CasKey,
  validateV09WriteCondition,
  V09CasStoreError,
  type V09CasErrorCode,
  type V09CasGetResult,
  type V09CasMutation,
  type V09CasTransactionEntry,
  type V09CasWriteCondition,
  type V09PhysicalCasStore,
} from './physical-cas.js';
export {
  classifySqliteFailure,
  openV09SqlitePhysicalCasStore,
  V09_REGISTRY_DOCS_TABLE,
  V09SqlitePhysicalCasStore,
  type V09SqlitePhysicalCasStoreOptions,
} from './sqlite-physical-cas.js';
export {
  isV09ResourceError,
  V09CapabilityResourceSpace,
  V09ResourceError,
  type V09CapabilityResourcePort,
  type V09OwnedResourceHandle,
  type V09ResourceErrorCode,
} from './capability-resource-port.js';
