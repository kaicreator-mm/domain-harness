/**
 * D3 (#1532) — boot chain and readback for the two selected domains.
 *
 * `openTallyApp` / `openDownloadApp` boot a REAL canonical BUILD product
 * through the public microkernel facade `load()` (packages/microkernel
 * dist): the governed activation over a caller-owned plain CAS document
 * store. The facade's own keys are exactly [send, query, subscribe, stop];
 * every intent crosses the sealed route and the real Kernel admission path,
 * and the K original receipt is returned as-is.
 *
 * Readback is honest and physical for the store in use: the effect journal
 * document is read back at its Kernel-issued address
 * (`v10/k/<subjectDigest>/<tenant>/v08-kernel:effect-journal:<effectId>`)
 * from the SAME store the activation wrote to. This example deliberately
 * uses the in-process plain store — it is NOT physical-host/SQLite evidence;
 * those proofs live in the runtime's own host tests.
 */
import { load } from '../../packages/microkernel/dist/index.js';
import { PlainDocStore } from './src/plain-doc-store.mjs';

export const TENANT_ID = 'tenant:dis-v011-dual-domain';

/** The unscoped activation docs prefix: `v10/k/<subjectDigest>/<tenant>/`. */
export function docsPrefixFor(built, tenantId = TENANT_ID) {
  return `v10/k/${built.subjectDigest}/${tenantId}/`;
}

async function openDomainApp(built, { store } = {}) {
  const docStore = store ?? new PlainDocStore();
  const app = await load(built, { store: docStore, tenantId: TENANT_ID });
  const prefix = docsPrefixFor(built);
  return {
    app,
    built,
    store: docStore,
    docsPrefix: prefix,
    /** Read one document at its Kernel-issued address (K key grammar stays inside this seam). */
    readDoc(key) {
      return docStore.get(prefix + key);
    },
    /** The Kernel's durable effect journal record for one admitted effect. */
    readEffectJournal(effectId) {
      return this.readDoc(`v08-kernel:effect-journal:${effectId}`);
    },
    /** Whether a Kernel external-effect permit exists for one effect id. */
    readEffectPermit(effectId) {
      return this.readDoc(`v08-kernel:effect-permit:${effectId}`);
    },
    close: () => app.stop(),
  };
}

export function openTallyApp(built, options) {
  return openDomainApp(built, options);
}

export function openDownloadApp(built, options) {
  return openDomainApp(built, options);
}
