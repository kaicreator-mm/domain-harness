// Issue #356 / A41-002 — focused currentness/end-act verification: validity
// windows, ordinary prospective ends, retroactive void cascade, issuance
// evidence independence, end-act authorization, and the deterministic
// invalid > revoked/void > stale precedence (F-01 §§1,6–8; C125–C128,
// C166–C168, C172).
import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyDacV0041DesignationChain } from '../../src/dac-v0041/authority/index.js';
import {
  IDENTITY,
  buildEndAct,
  buildPromotionChainInput,
  buildPromotionLeafLink,
  buildRootIssuanceLink,
} from './helpers.js';

test('a41-002 currentness C125: ordinary ancestor expiry makes the chain STALE (prospective, history intact)', () => {
  const result = verifyDacV0041DesignationChain(
    buildPromotionChainInput(30, {
      links: [
        buildPromotionLeafLink(),
        buildRootIssuanceLink({
          endActs: [
            buildEndAct({
              actIdentity: 'act/expire-root',
              kind: 'ordinary-expiry',
              issuerIdentity: IDENTITY.owner,
              issuanceEvidence: { point: 25, assertedBy: [IDENTITY.witness] },
              effectivePoint: 25,
            }),
          ],
        }),
      ],
    }),
  );
  assert.equal(result.outcome, 'STALE');
  assert.equal(result.reason, 'expired');
  assert.equal(result.endKind, 'ordinary-expiry');
  assert.equal(result.lapsedLinkIdentity, 'link/root-iss');
});

test('a41-002 currentness C125: a descendant issuing at or after an ancestor end is not validly issued', () => {
  // The root is prospectively revoked at 40; the leaf's issuance evidence
  // point (45) lies after the ancestor end, so the leaf is not validly
  // issued even though its own window and attenuation are well-formed.
  const result = verifyDacV0041DesignationChain(
    buildPromotionChainInput(50, {
      links: [
        buildPromotionLeafLink({
          effectiveFrom: 45,
          issuanceEvidence: { point: 45, assertedBy: [IDENTITY.witness] },
        }),
        buildRootIssuanceLink({
          endActs: [
            buildEndAct({
              actIdentity: 'act/revoke-root',
              kind: 'prospective-revocation',
              issuerIdentity: IDENTITY.owner,
              issuanceEvidence: { point: 40, assertedBy: [IDENTITY.witness] },
              effectivePoint: 40,
            }),
          ],
        }),
      ],
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'ANCESTOR_NOT_CURRENT_AT_ISSUANCE');
  assert.equal(result.linkIdentity, 'link/promotion-b');
});

test('a41-002 currentness: a chain is not yet effective before any link start', () => {
  const result = verifyDacV0041DesignationChain(buildPromotionChainInput(5));
  assert.equal(result.outcome, 'STALE');
  assert.equal(result.reason, 'not-yet-effective');
  assert.equal(result.lapsedLinkIdentity, 'link/promotion-b');
});

test('a41-002 currentness: a later declared effective-from delays the start without backdating', () => {
  const result = verifyDacV0041DesignationChain(
    buildPromotionChainInput(24, {
      links: [
        buildPromotionLeafLink({ effectiveFrom: 25 }),
        buildRootIssuanceLink(),
      ],
    }),
  );
  assert.equal(result.outcome, 'STALE');
  assert.equal(result.reason, 'not-yet-effective');
  assert.equal(result.lapsedLinkIdentity, 'link/promotion-b');
});

test('a41-002 currentness C126: authorized retroactive void makes post-void authoritative use unusable', () => {
  const rootVoid = buildEndAct({
    actIdentity: 'act/void-root',
    kind: 'retroactive-void',
    issuanceEvidence: { point: 60, assertedBy: [IDENTITY.witness] },
    effectivePoint: 50,
  });
  const links = [
    buildPromotionLeafLink(),
    buildRootIssuanceLink({ endActs: [rootVoid] }),
  ];
  const beforeVoid = verifyDacV0041DesignationChain(
    buildPromotionChainInput(45, { links }),
  );
  assert.equal(beforeVoid.outcome, 'CHAIN_CURRENT');
  const afterVoid = verifyDacV0041DesignationChain(
    buildPromotionChainInput(55, { links }),
  );
  assert.equal(afterVoid.outcome, 'FAIL_CLOSED');
  assert.equal(afterVoid.code, 'CHAIN_VOIDED');
  assert.equal(afterVoid.linkIdentity, 'link/root-iss');
});

test('a41-002 currentness C126: a descendant issued at or after the ancestor void point is not validly issued', () => {
  const result = verifyDacV0041DesignationChain(
    buildPromotionChainInput(55, {
      links: [
        buildPromotionLeafLink({
          issuanceEvidence: { point: 55, assertedBy: [IDENTITY.witness] },
          effectiveFrom: 55,
        }),
        buildRootIssuanceLink({
          endActs: [
            buildEndAct({
              actIdentity: 'act/void-root',
              kind: 'retroactive-void',
              issuanceEvidence: { point: 60, assertedBy: [IDENTITY.witness] },
              effectivePoint: 50,
            }),
          ],
        }),
      ],
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'VOID_INVALIDATES_DESCENDANT');
  assert.equal(result.linkIdentity, 'link/promotion-b');
});

test('a41-002 currentness C127: a void by a non-entitled identity is rejected and has no effect', () => {
  const result = verifyDacV0041DesignationChain(
    buildPromotionChainInput(55, {
      links: [
        buildPromotionLeafLink(),
        buildRootIssuanceLink({
          endActs: [
            buildEndAct({
              actIdentity: 'act/void-outsider',
              kind: 'retroactive-void',
              issuerIdentity: IDENTITY.outsider,
              issuanceEvidence: { point: 60, assertedBy: [IDENTITY.witness] },
              effectivePoint: 50,
            }),
          ],
        }),
      ],
    }),
  );
  assert.equal(result.outcome, 'CHAIN_CURRENT');
  assert.equal(result.rejectedEndActs.length, 1);
  assert.equal(result.rejectedEndActs[0]?.reason, 'unauthorized-issuer');
});

test('a41-002 currentness C127: a link holder cannot void an ancestor', () => {
  const result = verifyDacV0041DesignationChain(
    buildPromotionChainInput(55, {
      links: [
        buildPromotionLeafLink(),
        buildRootIssuanceLink({
          endActs: [
            buildEndAct({
              actIdentity: 'act/void-by-holder',
              kind: 'retroactive-void',
              issuerIdentity: IDENTITY.delegate,
              issuanceEvidence: { point: 60, assertedBy: [IDENTITY.witness] },
              effectivePoint: 50,
            }),
          ],
        }),
      ],
    }),
  );
  assert.equal(result.outcome, 'CHAIN_CURRENT');
  assert.equal(result.rejectedEndActs[0]?.reason, 'unauthorized-issuer');
});

test('a41-002 currentness C127: a void point outside [issuance(G), issuance(void act)] is rejected', () => {
  for (const voidPoint of [5, 65]) {
    const result = verifyDacV0041DesignationChain(
      buildPromotionChainInput(70, {
        links: [
          buildPromotionLeafLink(),
          buildRootIssuanceLink({
            endActs: [
              buildEndAct({
                actIdentity: `act/void-${voidPoint}`,
                kind: 'retroactive-void',
                issuanceEvidence: { point: 60, assertedBy: [IDENTITY.witness] },
                effectivePoint: voidPoint,
              }),
            ],
          }),
        ],
      }),
    );
    assert.equal(result.outcome, 'CHAIN_CURRENT');
    assert.equal(result.rejectedEndActs[0]?.reason, 'void-point-outside-interval');
  }
});

test('a41-002 currentness C166: prospective revocation by the covering ancestor designator ends the chain prospectively', () => {
  // The root designator's delegate (the leaf's designator, holder of the
  // root designation-issuance link covering promotion in scope/domain-a)
  // revokes the leaf's grant; the root chain is current at the act point.
  const result = verifyDacV0041DesignationChain(
    buildPromotionChainInput(75, {
      links: [
        buildPromotionLeafLink({
          endActs: [
            buildEndAct({
              actIdentity: 'act/revoke-leaf',
              kind: 'prospective-revocation',
              issuerIdentity: IDENTITY.delegate,
              issuanceEvidence: { point: 70, assertedBy: [IDENTITY.witness] },
              effectivePoint: 70,
            }),
          ],
        }),
        buildRootIssuanceLink(),
      ],
    }),
  );
  assert.equal(result.outcome, 'STALE');
  assert.equal(result.reason, 'revoked');
  assert.equal(result.endKind, 'prospective-revocation');
  assert.equal(result.lapsedLinkIdentity, 'link/promotion-b');
});

test('a41-002 currentness C166: a non-owner, non-covering-ancestor revocation is rejected with no effect', () => {
  const result = verifyDacV0041DesignationChain(
    buildPromotionChainInput(75, {
      links: [
        buildPromotionLeafLink({
          endActs: [
            buildEndAct({
              actIdentity: 'act/revoke-outsider',
              kind: 'prospective-revocation',
              issuerIdentity: IDENTITY.outsider,
              issuanceEvidence: { point: 70, assertedBy: [IDENTITY.witness] },
              effectivePoint: 70,
            }),
          ],
        }),
        buildRootIssuanceLink(),
      ],
    }),
  );
  assert.equal(result.outcome, 'CHAIN_CURRENT');
  assert.equal(result.rejectedEndActs[0]?.reason, 'unauthorized-issuer');
});

test('a41-002 currentness C166: a covering ancestor must itself be chain-current at the end-act issuance point', () => {
  // The root expires at 40 (evidenced ordinary end act); the delegate's
  // designation-issuance authority derives from that root, so a delegate
  // revocation evidenced at 70 cannot act on the leaf.
  const result = verifyDacV0041DesignationChain(
    buildPromotionChainInput(75, {
      links: [
        buildPromotionLeafLink({
          endActs: [
            buildEndAct({
              actIdentity: 'act/revoke-lapsed-ancestor',
              kind: 'prospective-revocation',
              issuerIdentity: IDENTITY.delegate,
              issuanceEvidence: { point: 70, assertedBy: [IDENTITY.witness] },
              effectivePoint: 70,
            }),
          ],
        }),
        buildRootIssuanceLink({
          endActs: [
            buildEndAct({
              actIdentity: 'act/expire-root-40',
              kind: 'ordinary-expiry',
              issuerIdentity: IDENTITY.owner,
              issuanceEvidence: { point: 40, assertedBy: [IDENTITY.witness] },
              effectivePoint: 40,
            }),
          ],
        }),
      ],
    }),
  );
  assert.equal(result.outcome, 'STALE');
  assert.equal(result.reason, 'expired');
  assert.equal(result.lapsedLinkIdentity, 'link/root-iss');
  assert.equal(result.rejectedEndActs[0]?.reason, 'unauthorized-issuer');
});

test('a41-002 currentness C167: only the exact holder may relinquish, and relinquishment is prospective', () => {
  const holderRelinquishes = verifyDacV0041DesignationChain(
    buildPromotionChainInput(75, {
      links: [
        buildPromotionLeafLink({
          endActs: [
            buildEndAct({
              actIdentity: 'act/relinquish-holder',
              kind: 'relinquishment',
              issuerIdentity: IDENTITY.promoter,
              issuanceEvidence: { point: 70, assertedBy: [IDENTITY.witness] },
              effectivePoint: 70,
            }),
          ],
        }),
        buildRootIssuanceLink(),
      ],
    }),
  );
  assert.equal(holderRelinquishes.outcome, 'STALE');
  assert.equal(holderRelinquishes.reason, 'relinquished');
  assert.equal(holderRelinquishes.lapsedLinkIdentity, 'link/promotion-b');

  const ownerRelinquishesOthersLink = verifyDacV0041DesignationChain(
    buildPromotionChainInput(75, {
      links: [
        buildPromotionLeafLink({
          endActs: [
            buildEndAct({
              actIdentity: 'act/relinquish-wrong-issuer',
              kind: 'relinquishment',
              issuerIdentity: IDENTITY.owner,
              issuanceEvidence: { point: 70, assertedBy: [IDENTITY.witness] },
              effectivePoint: 70,
            }),
          ],
        }),
        buildRootIssuanceLink(),
      ],
    }),
  );
  assert.equal(ownerRelinquishesOthersLink.outcome, 'CHAIN_CURRENT');
  assert.equal(ownerRelinquishesOthersLink.rejectedEndActs[0]?.reason, 'issuer-not-holder');
});

test('a41-002 currentness C172: a prospective end act claiming an earlier point than its own evidenced issuance is rejected', () => {
  const result = verifyDacV0041DesignationChain(
    buildPromotionChainInput(45, {
      links: [
        buildPromotionLeafLink({
          endActs: [
            buildEndAct({
              actIdentity: 'act/backdated-revocation',
              kind: 'prospective-revocation',
              issuerIdentity: IDENTITY.owner,
              issuanceEvidence: { point: 50, assertedBy: [IDENTITY.witness] },
              effectivePoint: 40,
            }),
          ],
        }),
        buildRootIssuanceLink(),
      ],
    }),
  );
  assert.equal(result.outcome, 'CHAIN_CURRENT');
  assert.equal(result.rejectedEndActs[0]?.reason, 'backdated');
  // The backdated interval [.., 40) is unaffected: evaluating inside it the
  // chain is current because the act has no effect at all.
  const insideClaimedInterval = verifyDacV0041DesignationChain(
    buildPromotionChainInput(42, {
      links: [
        buildPromotionLeafLink(),
        buildRootIssuanceLink(),
      ],
    }),
  );
  assert.equal(insideClaimedInterval.outcome, 'CHAIN_CURRENT');
});

test('a41-002 currentness C128: a link issuance point asserted solely by its designator or solely by its designated issuer fails closed', () => {
  const solelyDesignator = verifyDacV0041DesignationChain(
    buildPromotionChainInput(30, {
      links: [
        buildPromotionLeafLink(),
        buildRootIssuanceLink({
          issuanceEvidence: { point: 10, assertedBy: [IDENTITY.owner] },
        }),
      ],
    }),
  );
  assert.equal(solelyDesignator.outcome, 'FAIL_CLOSED');
  assert.equal(solelyDesignator.code, 'ISSUANCE_EVIDENCE_UNESTABLISHED');

  const solelyDesignatedIssuer = verifyDacV0041DesignationChain(
    buildPromotionChainInput(30, {
      links: [
        buildPromotionLeafLink(),
        buildRootIssuanceLink({
          issuanceEvidence: { point: 10, assertedBy: [IDENTITY.delegate] },
        }),
      ],
    }),
  );
  assert.equal(solelyDesignatedIssuer.outcome, 'FAIL_CLOSED');
  assert.equal(solelyDesignatedIssuer.code, 'ISSUANCE_EVIDENCE_UNESTABLISHED');
});

test('a41-002 currentness C128: two-party assertion (designator plus designated issuer, no third party) satisfies the letter of the rule', () => {
  // The rule forbids evidence asserted SOLELY by either party; assertion by
  // both link parties is not solely-by-either and passes the letter.
  const result = verifyDacV0041DesignationChain(
    buildPromotionChainInput(30, {
      links: [
        buildPromotionLeafLink(),
        buildRootIssuanceLink({
          issuanceEvidence: {
            point: 10,
            assertedBy: [IDENTITY.owner, IDENTITY.delegate],
          },
        }),
      ],
    }),
  );
  assert.equal(result.outcome, 'CHAIN_CURRENT');
});

test('a41-002 currentness C128: an end act whose evidence is asserted solely by its own issuer is rejected', () => {
  const result = verifyDacV0041DesignationChain(
    buildPromotionChainInput(75, {
      links: [
        buildPromotionLeafLink({
          endActs: [
            buildEndAct({
              actIdentity: 'act/self-asserted-revocation',
              kind: 'prospective-revocation',
              issuerIdentity: IDENTITY.owner,
              issuanceEvidence: { point: 70, assertedBy: [IDENTITY.owner] },
              effectivePoint: 70,
            }),
          ],
        }),
        buildRootIssuanceLink(),
      ],
    }),
  );
  assert.equal(result.outcome, 'CHAIN_CURRENT');
  assert.equal(result.rejectedEndActs[0]?.reason, 'evidence-unestablished');
});

test('a41-002 currentness precedence: structural invalidity dominates coexisting staleness', () => {
  // The chain is BOTH out-of-envelope (role widening) and expired; the
  // structural FAIL_CLOSED verdict is reported, mirroring C152/C171.
  const result = verifyDacV0041DesignationChain(
    buildPromotionChainInput(30, {
      links: [
        buildPromotionLeafLink({ authorityRole: 'runtime-activation' }),
        buildRootIssuanceLink({ declaredEffectiveEnd: 25 }),
      ],
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'ROLE_NOT_ENVELOPED');
});

test('a41-002 currentness precedence: a retroactive void dominates an ordinary lapse', () => {
  // The root is both ordinarily expired (evidenced end act at 40) and
  // voided at 30; at evaluation 50 the void verdict (FAIL_CLOSED) dominates
  // the ordinary lapse.
  const result = verifyDacV0041DesignationChain(
    buildPromotionChainInput(50, {
      links: [
        buildPromotionLeafLink(),
        buildRootIssuanceLink({
          endActs: [
            buildEndAct({
              actIdentity: 'act/expire-root-40',
              kind: 'ordinary-expiry',
              issuerIdentity: IDENTITY.owner,
              issuanceEvidence: { point: 40, assertedBy: [IDENTITY.witness] },
              effectivePoint: 40,
            }),
            buildEndAct({
              actIdentity: 'act/void-root',
              kind: 'retroactive-void',
              issuanceEvidence: { point: 60, assertedBy: [IDENTITY.witness] },
              effectivePoint: 30,
            }),
          ],
        }),
      ],
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'CHAIN_VOIDED');
});

test('a41-002 currentness precedence: supersession and expiry resolve to their distinct deterministic lapse reasons', () => {
  const superseded = verifyDacV0041DesignationChain(
    buildPromotionChainInput(75, {
      links: [
        buildPromotionLeafLink({
          endActs: [
            buildEndAct({
              actIdentity: 'act/supersede-leaf',
              kind: 'supersession',
              issuerIdentity: IDENTITY.owner,
              issuanceEvidence: { point: 70, assertedBy: [IDENTITY.witness] },
              effectivePoint: 70,
              replacementLinkIdentity: 'link/promotion-b2',
            }),
          ],
        }),
        buildRootIssuanceLink(),
      ],
    }),
  );
  assert.equal(superseded.outcome, 'STALE');
  assert.equal(superseded.reason, 'superseded');
  assert.equal(superseded.endKind, 'supersession');

  const expiredByAct = verifyDacV0041DesignationChain(
    buildPromotionChainInput(75, {
      links: [
        buildPromotionLeafLink({
          endActs: [
            buildEndAct({
              actIdentity: 'act/expire-leaf',
              kind: 'ordinary-expiry',
              issuerIdentity: IDENTITY.owner,
              issuanceEvidence: { point: 70, assertedBy: [IDENTITY.witness] },
              effectivePoint: 70,
            }),
          ],
        }),
        buildRootIssuanceLink(),
      ],
    }),
  );
  assert.equal(expiredByAct.outcome, 'STALE');
  assert.equal(expiredByAct.reason, 'expired');
  assert.equal(expiredByAct.endKind, 'ordinary-expiry');
});

test('a41-002 currentness: superseded descendants are not re-parented and history is never rewritten', () => {
  // After supersession at 70, an artifact whose issuance point (60) lies
  // inside the chain's validity window still verifies chain-current AT ITS
  // ISSUANCE POINT (ordinary ends are prospective only).
  const links = [
    buildPromotionLeafLink({
      endActs: [
        buildEndAct({
          actIdentity: 'act/supersede-leaf',
          kind: 'supersession',
          issuerIdentity: IDENTITY.owner,
          issuanceEvidence: { point: 70, assertedBy: [IDENTITY.witness] },
          effectivePoint: 70,
        }),
      ],
    }),
    buildRootIssuanceLink(),
  ];
  const atHistoricalIssuance = verifyDacV0041DesignationChain(
    buildPromotionChainInput(60, { links }),
  );
  assert.equal(atHistoricalIssuance.outcome, 'CHAIN_CURRENT');
});
