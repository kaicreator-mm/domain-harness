/**
 * #987 V08-B2-R4: the R4 integrated trusted Host constructor — the Domain App
 * facing entry. Returns EXACTLY the frozen façade: ZERO privileged research
 * transport path (P1-b repair), no internals, no override channel, no path to
 * `dispatch`, `admissionPorts`, `activator`, `sha256`, `effectJournal`,
 * policy, binding or the K1 seal.
 *
 * Trusted construction order (all Host-only; the caller of this constructor is
 * the trusted Host assembler, never a Domain App consumer):
 *   1. mint the K1 seal with the genuine `k1Host.sealOperation(selector)`
 *      (the ONLY source of a native selection — K1 #986 READ_ONLY);
 *   2. enforce FULL four-package Assembly currentness BEFORE any bind;
 *   3. adapt the nine-field K1 selection into the eight-key A1 shape over
 *      physically recomputed RAW manifest/module bytes
 *      (../authority/r4-selection-adapter.mjs);
 *   4. bind the whole native authority chain
 *      (../authority/r4-native-join.mjs successor fork of A1 #985);
 *   5. return ONLY the façade.
 *
 * All trusted-constructor material (selector, armed intent, authorized
 * callers) passes through the same descriptor-safe data-only snapshot
 * (../authority/r4-ingress.mjs): the Host keeps no caller-held mutable alias,
 * so post-construction mutation cannot widen authorized scope or alter the
 * armed occurrence (R4-13).
 *
 * Caller authentication obligation (honest, R4-13): the trusted assembler
 * supplies `authorizedCallers`; a real ingress must establish trusted caller
 * identity itself (#972 D2 prerequisite). The façade's `caller` field is a
 * provenance claim checked against the trusted policy tuple — NOT an
 * authenticated identity.
 */

import { fileURLToPath } from 'node:url';
import { adaptK1SealedSelectionToA1 } from '../authority/r4-selection-adapter.mjs';
import { bindR4IntegratedAuthority } from '../authority/r4-native-join.mjs';
import { snapshotTrustedMaterial } from '../authority/r4-ingress.mjs';

export const DEFAULT_K1_ROOT = fileURLToPath(new URL('../../v08-b2-r3-k1/', import.meta.url));

const deny = (code, message) => {
  throw Object.assign(new Error(message ?? code), { code });
};

/**
 * @param {object} trusted {k1Host, k1Root=DEFAULT_K1_ROOT, selector,
 *   armedIntentInput, authorizedCallers, instanceOrdinal} — Host-trusted
 *   assembler material only.
 * @returns {object} the frozen R4 façade (no privileged material).
 */
export async function createR4IntegratedHost(trusted) {
  if (!trusted || typeof trusted !== 'object') deny('E_R4_TRUSTED_INPUT');
  const { k1Host, k1Root = DEFAULT_K1_ROOT, selector, armedIntentInput, authorizedCallers, instanceOrdinal } = trusted;
  if (!k1Host || typeof k1Host.sealOperation !== 'function' || !k1Host.assembly) {
    deny('E_R4_TRUSTED_INPUT', 'a genuine established K1 host is required');
  }
  if (typeof k1Root !== 'string' || k1Root.length === 0) deny('E_R4_TRUSTED_INPUT', 'k1Root required');
  if (!selector || typeof selector !== 'object') deny('E_R4_TRUSTED_INPUT', 'selector required');

  // Descriptor-safe snapshots of ALL trusted material before any Host I/O.
  const selectorSnapshot = snapshotTrustedMaterial(selector, 'selector');
  if (Object.keys(selectorSnapshot).sort().join(',') !== 'componentId,operationId,packageId' ||
      typeof selectorSnapshot.packageId !== 'string' || typeof selectorSnapshot.componentId !== 'string' ||
      typeof selectorSnapshot.operationId !== 'string') {
    deny('E_R4_TRUSTED_INPUT', 'selector must carry exactly {packageId, componentId, operationId}');
  }
  const armedSnapshot = snapshotTrustedMaterial(armedIntentInput, 'armedIntentInput');
  if (armedSnapshot === null || typeof armedSnapshot !== 'object' || Array.isArray(armedSnapshot)) {
    deny('E_R4_TRUSTED_INPUT', 'armedIntentInput must be an object');
  }
  const callersSnapshot = snapshotTrustedMaterial(authorizedCallers, 'authorizedCallers');
  if (!Array.isArray(callersSnapshot) || callersSnapshot.length === 0) {
    deny('E_R4_TRUSTED_INPUT', 'authorizedCallers must be a non-empty array');
  }
  for (const entry of callersSnapshot) {
    if (Object.keys(entry).sort().join(',') !== 'callerId,callerKind' ||
        typeof entry.callerId !== 'string' || typeof entry.callerKind !== 'string') {
      deny('E_R4_TRUSTED_INPUT', 'each authorized caller must carry exactly {callerId, callerKind}');
    }
  }
  if (!Number.isInteger(instanceOrdinal) || instanceOrdinal < 0) {
    deny('E_R4_TRUSTED_INPUT', 'instanceOrdinal must be a non-negative integer');
  }

  // (1) the ONLY selection source is the genuine K1 sealOperation.
  const k1Seal = k1Host.sealOperation(selectorSnapshot);
  // (2) FULL four-package Assembly currentness BEFORE any bind.
  await k1Seal.requirePhysicalCurrentness();
  // (3) trusted adapter: eight-key attested selection over RAW physical bytes.
  const physical = await adaptK1SealedSelectionToA1({ k1Host, k1Seal, k1Root });
  // (4) the whole native authority chain (re-verifies the physical digests).
  const { facade } = await bindR4IntegratedAuthority({
    k1Host, k1Seal, physical, k1Root,
    armedIntentInput: armedSnapshot,
    authorizedCallers: callersSnapshot,
    instanceOrdinal,
  });
  // (5) EXACTLY the façade — zero privileged research transport path (P1-b).
  return facade;
}
