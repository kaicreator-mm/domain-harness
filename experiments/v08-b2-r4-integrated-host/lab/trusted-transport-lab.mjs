/**
 * #987 V08-B2-R4 (P1-b repair): TEST-ONLY trusted-transport laboratory.
 *
 * This module is NOT part of the R4 production Host. The production entry
 * (../host/r4-host.mjs) returns EXACTLY the frozen façade with ZERO privileged
 * research transport path — no `internals`, no `dispatch`, no override
 * channel. This laboratory exists SEPARATELY (obvious name, separate
 * directory, explicit acknowledgment token) to record the INHERITED original
 * v0.7 trusted-transport truth found by Fresh Review #984@6084161227 (P1-b):
 *
 *   The ORIGINAL v0.7 seam treats a well-shaped in-process dispatch port as
 *   TRUSTED transport (shape gate only, effectful-invocation.ts L841/L1040
 *   heritage). A holder of separately exposed privileged Host-internal
 *   material CAN inject a well-shaped dispatch that (a) bypasses the Host
 *   dispatch port, (b) forges `{charged:'FAKE'}` output the ORIGINAL journal
 *   commits as a `completed` row, and (c) replays that fake output on a later
 *   façade invocation of the same occurrence.
 *
 * R4 states this HONESTLY: it is an inherited trusted-transport hazard of the
 * original v0.7 research seam, NOT a property R4 "fixed", and NEVER a claim
 * that "well-shaped injected ports are rejected by original v0.7" (that claim
 * would be false). The R4 accepted business path removes the injection
 * channel entirely (façade-only return + closed descriptor-safe ingress);
 * the hazard is preserved here only as a fenced falsification laboratory so
 * reviewers can re-derive the inherited truth on fresh occurrences (F8a/F8b/
 * F8c → R4-14). A fake completed row produced here is test evidence of the
 * hazard, NEVER a valid authorized business outcome.
 *
 * Bounds: the acknowledgment token must be passed verbatim; every lab host is
 * a normal R4 construction (same trusted gates); nothing here is imported by
 * the production entry or by the R4 façade object graph.
 */

import { adaptK1SealedSelectionToA1 } from '../authority/r4-selection-adapter.mjs';
import { bindR4IntegratedAuthority } from '../authority/r4-native-join.mjs';
import { snapshotTrustedMaterial } from '../authority/r4-ingress.mjs';
import { invokeWithExistingV07Authority } from '../../v08-b2-r3-a1/authority/invoke-v07.mjs';
import { DEFAULT_K1_ROOT } from '../host/r4-host.mjs';

export const LAB_ACKNOWLEDGMENT_TOKEN =
  'I_ACKNOWLEDGE_ORIGINAL_V07_TRUSTS_WELL_SHAPED_IN_PROCESS_DISPATCH_THIS_IS_A_TEST_ONLY_HAZARD_LAB';

export const LAB_NAME = 'R4_TRUSTED_TRANSPORT_LAB_TEST_ONLY_NOT_PRODUCTION';

const deny = (code, message) => {
  throw Object.assign(new Error(message ?? code), { code });
};

/**
 * Build ONE R4 chain plus the fenced lab port (same trusted construction as
 * the production entry; the lab port additionally exposes the well-shaped
 * dispatch injection channel on purpose).
 *
 * @param {object} trusted {acknowledgeInheritedV07TrustedTransportHazard,
 *   k1Host, k1Root, selector, armedIntentInput, authorizedCallers,
 *   instanceOrdinal}
 */
export async function createR4TrustedTransportLab(trusted) {
  if (!trusted || typeof trusted !== 'object') deny('E_LAB_INPUT');
  const {
    acknowledgeInheritedV07TrustedTransportHazard,
    k1Host, k1Root = DEFAULT_K1_ROOT, selector, armedIntentInput, authorizedCallers, instanceOrdinal,
  } = trusted;
  if (acknowledgeInheritedV07TrustedTransportHazard !== LAB_ACKNOWLEDGMENT_TOKEN) {
    deny('E_LAB_ACK_REQUIRED',
      'this test-only laboratory records the inherited original-v0.7 trusted-transport hazard; pass LAB_ACKNOWLEDGMENT_TOKEN verbatim');
  }
  // Same trusted gates as the production constructor.
  const selectorSnapshot = snapshotTrustedMaterial(selector, 'selector');
  const armedSnapshot = snapshotTrustedMaterial(armedIntentInput, 'armedIntentInput');
  const callersSnapshot = snapshotTrustedMaterial(authorizedCallers, 'authorizedCallers');
  const k1Seal = k1Host.sealOperation(selectorSnapshot);
  await k1Seal.requirePhysicalCurrentness();
  const physical = await adaptK1SealedSelectionToA1({ k1Host, k1Seal, k1Root });
  const { facade, internals } = await bindR4IntegratedAuthority({
    k1Host, k1Seal, physical, k1Root,
    armedIntentInput: armedSnapshot,
    authorizedCallers: callersSnapshot,
    instanceOrdinal,
  });
  const lab = Object.freeze({
    name: LAB_NAME,
    /** Provenance export of the lab (test evidence bookkeeping). */
    hazardStatement:
      'ORIGINAL v0.7 trusts well-shaped in-process dispatch: a forged well-shaped dispatch CAN commit a fake completed journal row and replay it. Inherited hazard — NOT fixed by R4, NOT reachable through the R4 public façade.',
    /**
     * The deliberate injection channel (F8a/F8b/F8c). `overrides` follow the
     * A1 trustedResearchPort.invokeWithMaterial shape; the ORIGINAL v0.7
     * seam itself validates whatever ports it receives.
     */
    async invokeWithWellShapedDispatch(overrides = {}) {
      await k1Seal.requirePhysicalCurrentness();
      const { admitted } = await internals.admitFor(internals.armedIntentInput, internals.armedCaller);
      return invokeWithExistingV07Authority({ ...internals.baseRequest, request: admitted, ...overrides });
    },
    internals,
  });
  return Object.freeze({ facade, lab });
}
