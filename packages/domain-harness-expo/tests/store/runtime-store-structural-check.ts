import type { RuntimeStore } from '../../../domain-harness/src/v2/contracts/store.js';
import { ExpoSqliteRuntimeStore } from '../../src/store/expo-sqlite-runtime-store.js';

/** Compile-time proof that the Expo adapter satisfies the frozen T-001 RuntimeStore port. */
export const runtimeStoreStructuralCompatibility: RuntimeStore =
  null as unknown as ExpoSqliteRuntimeStore;
