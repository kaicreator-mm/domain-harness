/**
 * #987 V08-B2-R4: trusted Host-only K1→A1 selection projection adapter.
 *
 * Resolves the mechanical K1→A1 ABI mismatch documented by the Controller
 * handoffs #983@6083264345 / #984@6083262997 WITHOUT touching either sibling
 * source (K1 #986 @ 3fde560baaf36da89a9de9cd1327be3a88a77570 and A1 #985 @
 * 0ef92f9433ba9e2d32260c32961859e1c686a63e are READ_ONLY):
 *
 * - K1 `sealOperation().nativeSelection()` yields NINE own fields
 *   {packageId,componentId,operationId,kindRef,component,operation,
 *    implementation,moduleSha256,handler} with `implementation` =
 *   {implementationId,sha256,path} and NO `manifestSha256`.
 * - A1 `requireSelectionShape` (experiments/v08-b2-r3-a1/authority/
 *   native-projection.mjs, READ_ONLY) accepts EXACTLY EIGHT keys
 *   {packageId,manifestSha256,moduleSha256,kindRef,component,implementation,
 *    operation,handler} and mandates `implementation.componentId`. The raw K1
 *   selection deterministically fails E_PROJECTION_SELECTION_SHAPE (proven by
 *   R4-03 before any adaptation).
 *
 * This adapter is TRUSTED HOST-ONLY glue: it never accepts caller-supplied
 * selection material. It starts from a seal obtained by calling the genuine
 * K1 `host.sealOperation(selector)` itself, then:
 *
 * 1. binds the seal to the exact K1 host Assembly (same frozen object AND
 *    digest — a seal minted elsewhere, or a forged caller-supplied
 *    full-Assembly root, fails E_INTEGRATION_BLOCKED);
 * 2. re-reads EVERY member package physically through the SAME frozen K1
 *    trust anchor (`readTrustedEntries`: canonical manifest bytes, module
 *    byte pins, D1 genesis root pins, business-token scan), so the manifest
 *    SHA is computed from the genuine bytes, not from an untrusted JSON
 *    label;
 * 3. anchors all four packages against `TRUST_ROOTS` AND the K1 Assembly
 *    package list (caller self-signed digests can never enter);
 * 4. recomputes the RAW SHA256 of the genuine Charge `manifest.json` BYTES
 *    (hex, distinct from the manifest `integrity`/packageDigest field — no
 *    double signing, no re-minted package digest) and re-hashes the module
 *    bytes against the attested module SHA;
 * 5. verifies the selected component/operation/kindRef snapshots are verbatim
 *    the physical manifest records, and that the implementation record owner
 *    is the selected component;
 * 6. emits the frozen EIGHT-key A1 shape carrying the EXACT physical `handler`
 *    function (identity preserved: the T003C binding's implementationHandle
 *    stays the genuine K1 callable; no synthetic callback, no wrapper).
 */

import { createHash } from 'node:crypto';
import { readTrustedEntries, buildKindRegistry } from '../../v08-b2-r3-k1/host/bootstrap.mjs';
import {
  TRUST_ROOTS,
  D1_GENESIS_ROOT_DIGESTS,
  D1_KERNEL_LINK_MODULE_SHA,
} from '../../v08-b2-r3-k1/host/trust-roots.mjs';
import { stableStringify } from '../../v08-b2-r3-a1/authority/native-projection.mjs';
import { verifyDefinitionGraph } from '../../v08-gatea-b1-955-r2/reference956/candidate-validator.mjs';

export class R4AdapterError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = 'R4AdapterError';
  }
}

const deny = (code, message) => {
  throw new R4AdapterError(code, message);
};

const snap = (value) => JSON.parse(JSON.stringify(value));
const rawSha256Hex = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** The exact nine own keys K1 `nativeSelection()` declares (K1 contract). */
export const K1_NATIVE_SELECTION_KEYS = Object.freeze(
  ['packageId', 'componentId', 'operationId', 'kindRef', 'component', 'operation', 'implementation', 'moduleSha256', 'handler'],
);

/**
 * Adapt a K1-sealed effectful selection into the A1 eight-key shape.
 *
 * @param {object} input {k1Host, k1Seal, k1Root} — k1Seal MUST be the object
 *   returned by `k1Host.sealOperation(...)` on the SAME host instance; k1Root
 *   is the physical package root the K1 host was established from.
 * @returns {object} frozen eight-key A1 physical selection snapshot.
 */
export async function adaptK1SealedSelectionToA1({ k1Host, k1Seal, k1Root } = {}) {
  if (!k1Host || typeof k1Host.sealOperation !== 'function' ||
      !k1Host.assembly || typeof k1Host.assembly.digest !== 'string') {
    deny('E_INTEGRATION_BLOCKED', 'a genuine K1 host (sealOperation + sealed Assembly) is required');
  }
  if (!k1Seal || typeof k1Seal.nativeSelection !== 'function' ||
      typeof k1Seal.requirePhysicalCurrentness !== 'function' || !k1Seal.assembly) {
    deny('E_INTEGRATION_BLOCKED', 'a genuine K1 seal (sealOperation product) is required');
  }
  // (1) seal ↔ host Assembly exact identity: same frozen object AND digest.
  if (k1Seal.assembly !== k1Host.assembly || k1Seal.assembly.digest !== k1Host.assembly.digest) {
    deny('E_INTEGRATION_BLOCKED',
      'the seal is not bound to the exact K1 host Assembly (forged or foreign full-Assembly root rejected)');
  }
  const selection = k1Seal.nativeSelection();
  const shape = Object.keys(selection).sort();
  if (stableStringify(shape) !== stableStringify([...K1_NATIVE_SELECTION_KEYS].sort())) {
    deny('E_INTEGRATION_BLOCKED',
      'K1 nativeSelection must carry exactly the nine declared fields; got ' + shape.join(','));
  }
  if (typeof selection.handler !== 'function' || typeof selection.moduleSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(selection.moduleSha256)) {
    deny('E_INTEGRATION_BLOCKED', 'K1 nativeSelection handler/moduleSha256 are malformed');
  }

  // (2) physical re-read through the SAME frozen trust anchor the K1 host used.
  const entries = await readTrustedEntries(k1Root);
  const byId = new Map(entries.map((entry) => [entry.id, entry]));

  // (3) four-package Assembly anchoring: every member package digest equals
  // the frozen trust-root pin AND the digest anchored in the sealed Assembly.
  if (entries.length !== 4 || k1Host.assembly.packages.length !== 4) {
    deny('E_INTEGRATION_BLOCKED', 'the K1 Assembly must be the sealed FOUR-package Assembly');
  }
  for (const pkg of k1Host.assembly.packages) {
    const entry = byId.get(pkg.id);
    const pin = TRUST_ROOTS[pkg.id];
    if (!entry || !pin) deny('E_INTEGRATION_BLOCKED', 'unknown Assembly member package ' + String(pkg.id));
    if (entry.manifest.integrity !== pkg.digest || pin.packageDigest !== pkg.digest) {
      deny('E_INTEGRATION_BLOCKED',
        'Assembly member ' + pkg.id + ' digest does not match the frozen trust root (self-signed digest rejected)');
    }
  }
  if (TRUST_ROOTS['genesis.kernel'].packageDigest !== D1_GENESIS_ROOT_DIGESTS.kernel ||
      TRUST_ROOTS['genesis.sdk'].packageDigest !== D1_GENESIS_ROOT_DIGESTS.sdk) {
    deny('E_INTEGRATION_BLOCKED', 'D1 genesis root pins drifted');
  }
  // The claimed Assembly GRAPH digest must recompute from the freshly read
  // physical bytes (a forged graphDigest on a lookalike Assembly root cannot
  // enter; re-attested graph variants fail their own typed codes here).
  const sdkEntry = byId.get('genesis.sdk');
  const { registry } = buildKindRegistry(sdkEntry.manifest);
  const recheckedGraph = verifyDefinitionGraph(
    entries.map(({ manifest, artifacts }) => ({ manifest, artifacts })), {}, registry,
  );
  if (recheckedGraph.digest !== k1Host.assembly.graphDigest) {
    deny('E_INTEGRATION_BLOCKED',
      'the Assembly graph digest does not recompute from the current physical bytes');
  }
  // Signed kernel.link module source must be the original D1 module (R4-04):
  // no derived/neutral kernel may sit behind the sealed link callable.
  const kernel = byId.get('genesis.kernel');
  const kernelLink = kernel.manifest.implementations.find(
    (impl) => impl.implementationId === 'genesis.kernel.link.v1',
  );
  if (!kernelLink || kernelLink.sha256 !== D1_KERNEL_LINK_MODULE_SHA) {
    deny('E_INTEGRATION_BLOCKED', 'the sealed kernel.link module is not the original D1 module');
  }

  // (4) selected package must be a Business package of this Assembly.
  const entry = byId.get(selection.packageId);
  if (!entry || selection.packageId === 'genesis.kernel' || selection.packageId === 'genesis.sdk') {
    deny('E_INTEGRATION_BLOCKED', 'the native selection must be a Business package member');
  }

  // (5) implementation record owner + module bytes over the genuine manifest.
  const impl = entry.manifest.implementations.find((i) => i.componentId === selection.componentId);
  if (!impl) {
    deny('E_INTEGRATION_BLOCKED',
      'no physical implementation record is owned by the selected component (wrong owner rejected)');
  }
  if (selection.implementation.implementationId !== impl.implementationId ||
      selection.implementation.sha256 !== impl.sha256 ||
      selection.implementation.path !== impl.path) {
    deny('E_INTEGRATION_BLOCKED', 'selection implementation record drifts from the physical manifest record');
  }
  if (impl.sha256 !== 'sha256:' + selection.moduleSha256) {
    deny('E_INTEGRATION_BLOCKED', 'attested module SHA does not match the physical implementation record');
  }
  const moduleBytes = Buffer.from(entry.artifacts[impl.path], 'utf8');
  if (rawSha256Hex(moduleBytes) !== selection.moduleSha256) {
    deny('E_INTEGRATION_BLOCKED', 'physically recomputed module SHA mismatch');
  }
  // RAW SHA256 of the genuine manifest.json bytes — distinct from the
  // manifest `integrity` (packageDigest) field; never minted from a label.
  const manifestSha256 = rawSha256Hex(entry.raw);

  // (6) component/operation/kindRef snapshots are verbatim physical records.
  const component = entry.manifest.components.find(
    (c) => c.componentId === selection.componentId && c.packageId === selection.packageId,
  );
  if (!component) {
    deny('E_INTEGRATION_BLOCKED', 'selected component is not a verbatim physical manifest component');
  }
  if (stableStringify(snap(selection.component)) !== stableStringify(snap(component))) {
    deny('E_INTEGRATION_BLOCKED', 'selection component snapshot drifts from the physical manifest');
  }
  const operationRecord = component.operations.find((op) => op.operationId === selection.operationId);
  if (!operationRecord ||
      stableStringify(snap(selection.operation)) !== stableStringify(snap(operationRecord)) ||
      stableStringify(snap(selection.kindRef)) !== stableStringify(snap(component.kindRef))) {
    deny('E_INTEGRATION_BLOCKED', 'selection operation/kindRef snapshots drift from the physical manifest');
  }

  // The trusted eight-key A1 shape: EXACTLY these keys, frozen, data-only
  // snapshots, and the EXACT physical handler function reference.
  return Object.freeze({
    packageId: selection.packageId,
    manifestSha256,
    moduleSha256: selection.moduleSha256,
    kindRef: snap(selection.kindRef),
    component: snap(selection.component),
    implementation: Object.freeze({
      implementationId: impl.implementationId,
      sha256: impl.sha256,
      path: impl.path,
      componentId: impl.componentId,
    }),
    operation: snap(selection.operation),
    handler: selection.handler,
  });
}
