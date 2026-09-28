// Issue #356 / A41-002 — focused designation-chain structural verification:
// the C131/C132/C159 positive paths and the C118/C129 non-designated /
// self-designation / cycle / Composer fail-closed family, plus adversarial
// malformed-facts negatives (F-01 §§2,6).
import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyDacV0041DesignationChain } from '../../src/dac-v0041/authority/index.js';
import type { DacV0041DesignationChainInput } from '../../src/dac-v0041/authority/index.js';
import {
  IDENTITY,
  SCOPE,
  buildDepthOneChainInput,
  buildMiddleIssuanceLink,
  buildOwnerDirectPromotionLink,
  buildPromotionChainInput,
  buildPromotionLeafLink,
  buildRootIssuanceLink,
} from './helpers.js';

test('a41-002 chain C131: owner-direct designation with distinct issuer, complete minima, independent evidence and anchored owner is CHAIN_CURRENT', () => {
  const result = verifyDacV0041DesignationChain({
    links: [buildOwnerDirectPromotionLink()],
    leafLinkIdentity: 'link/owner-direct-promotion',
    scopeOwnerAnchors: [
      { ownerIdentity: IDENTITY.owner, provedScopes: [SCOPE.domainA] },
    ],
    evaluationPoint: 40,
  });
  assert.equal(result.outcome, 'CHAIN_CURRENT');
  assert.equal(result.rootLinkIdentity, 'link/owner-direct-promotion');
  assert.deepEqual(result.chainLinkIdentities, ['link/owner-direct-promotion']);
  assert.deepEqual(result.rejectedEndActs, []);
});

test('a41-002 chain C132: valid owner-rooted depth-0 delegated promotion grant is CHAIN_CURRENT', () => {
  const result = verifyDacV0041DesignationChain(buildPromotionChainInput(30));
  assert.equal(result.outcome, 'CHAIN_CURRENT');
  assert.equal(result.rootLinkIdentity, 'link/root-iss');
  assert.deepEqual(result.chainLinkIdentities, [
    'link/promotion-b',
    'link/root-iss',
  ]);
});

test('a41-002 chain C159: valid depth-1 re-delegation preserving every ancestor constraint and attenuating role/scope/profile/SoD/depth is CHAIN_CURRENT', () => {
  const result = verifyDacV0041DesignationChain(buildDepthOneChainInput(50));
  assert.equal(result.outcome, 'CHAIN_CURRENT');
  assert.equal(result.rootLinkIdentity, 'link/root-iss');
  assert.deepEqual(result.chainLinkIdentities, [
    'link/grandchild-promotion',
    'link/mid-iss',
    'link/root-iss',
  ]);
});

test('a41-002 chain C118: a promotion-issuer designator (no designation-issuance) cannot designate Runtime activation authority', () => {
  // Root-ish link held by a mere promotion issuer; the leaf cites it as parent.
  const promotionIssuerLink = buildRootIssuanceLink({ authorityRole: 'promotion' });
  delete (promotionIssuerLink as { delegationEnvelope?: unknown }).delegationEnvelope;
  const result = verifyDacV0041DesignationChain(
    buildPromotionChainInput(30, {
      links: [
        buildPromotionLeafLink({ authorityRole: 'runtime-activation' }),
        promotionIssuerLink,
      ],
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'PARENT_ROLE_NOT_DESIGNATION_ISSUANCE');
  assert.equal(result.linkIdentity, 'link/promotion-b');
});

test('a41-002 chain C129: self-designation (designator === designated issuer) fails closed', () => {
  const result = verifyDacV0041DesignationChain(
    buildPromotionChainInput(30, {
      links: [
        buildPromotionLeafLink(),
        buildRootIssuanceLink({ designatedIssuerIdentity: IDENTITY.owner }),
      ],
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'SELF_DESIGNATION');
});

test('a41-002 chain C129: an identity appearing twice as designated issuer in one chain (cycle) fails closed', () => {
  // Chain: leaf (B -> A) cites mid (A -> B) cites root (owner -> A).
  // Identity continuity holds at every hop, but A is the designated issuer
  // of both the root link and the leaf link: a repeated designated issuer.
  const result = verifyDacV0041DesignationChain({
    links: [
      buildPromotionLeafLink({
        linkIdentity: 'link/leaf-repeat',
        designatorIdentity: IDENTITY.midDelegate,
        designatedIssuerIdentity: IDENTITY.delegate,
        parentLinkIdentity: 'link/mid-iss',
      }),
      buildMiddleIssuanceLink(),
      buildRootIssuanceLink({
        delegationEnvelope: {
          delegableRoles: ['promotion', 'designation-issuance'],
          delegableScopes: [SCOPE.domainA],
          mandatoryConstraints: [],
          permittedDacProfiles: ['dac-profile/v0041-a'],
          delegableSodPermissions: [],
          redelegationDepth: 2,
        },
      }),
    ],
    leafLinkIdentity: 'link/leaf-repeat',
    scopeOwnerAnchors: [
      { ownerIdentity: IDENTITY.owner, provedScopes: [SCOPE.domainA] },
    ],
    evaluationPoint: 50,
  });
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'REPEATED_DESIGNATED_ISSUER');
});

test('a41-002 chain C129: a parent-cycle in the cited chain fails closed', () => {
  const leaf = buildPromotionLeafLink({
    parentLinkIdentity: 'link/root-iss',
  });
  const root = buildRootIssuanceLink({
    parentLinkIdentity: 'link/promotion-b',
  });
  const result = verifyDacV0041DesignationChain({
    links: [leaf, root],
    leafLinkIdentity: 'link/promotion-b',
    scopeOwnerAnchors: [
      { ownerIdentity: IDENTITY.owner, provedScopes: [SCOPE.domainA] },
    ],
    evaluationPoint: 30,
  });
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'REPEATED_DESIGNATED_ISSUER');
});

test('a41-002 chain C129: a Composer-role identity cannot be a designator', () => {
  const result = verifyDacV0041DesignationChain(
    buildPromotionChainInput(30, {
      composerRoleIdentities: [IDENTITY.owner],
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'COMPOSER_DESIGNATOR');
  assert.equal(result.linkIdentity, 'link/root-iss');
});

test('a41-002 chain C129: a Composer-role identity cannot hold designation-issuance', () => {
  const result = verifyDacV0041DesignationChain(
    buildPromotionChainInput(30, {
      composerRoleIdentities: [IDENTITY.promoter],
      links: [
        buildPromotionLeafLink({ authorityRole: 'designation-issuance' }),
        buildRootIssuanceLink(),
      ],
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'COMPOSER_DESIGNATOR');
});

test('a41-002 chain: identity discontinuity (child designator is not the parent designated issuer) fails closed', () => {
  const result = verifyDacV0041DesignationChain(
    buildPromotionChainInput(30, {
      links: [
        buildPromotionLeafLink({ designatorIdentity: IDENTITY.outsider }),
        buildRootIssuanceLink(),
      ],
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'IDENTITY_DISCONTINUITY');
});

test('a41-002 chain: a cited parent that was not supplied fails closed as unrecoverable', () => {
  const result = verifyDacV0041DesignationChain({
    links: [buildPromotionLeafLink()],
    leafLinkIdentity: 'link/promotion-b',
    scopeOwnerAnchors: [
      { ownerIdentity: IDENTITY.owner, provedScopes: [SCOPE.domainA] },
    ],
    evaluationPoint: 30,
  });
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'CHAIN_UNRECOVERABLE');
});

test('a41-002 chain: a duplicate link identity makes the chain unrecoverable', () => {
  const result = verifyDacV0041DesignationChain({
    links: [buildPromotionLeafLink(), buildPromotionLeafLink()],
    leafLinkIdentity: 'link/promotion-b',
    scopeOwnerAnchors: [
      { ownerIdentity: IDENTITY.owner, provedScopes: [SCOPE.domainA] },
    ],
    evaluationPoint: 30,
  });
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'CHAIN_UNRECOVERABLE');
});

test('a41-002 chain: a missing leaf link fails closed as unrecoverable', () => {
  const result = verifyDacV0041DesignationChain(
    buildPromotionChainInput(30, { leafLinkIdentity: 'link/nonexistent' }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'CHAIN_UNRECOVERABLE');
});

test('a41-002 chain: a designation-issuance link without an envelope fails closed', () => {
  const envelopeless = buildRootIssuanceLink();
  delete (envelopeless as { delegationEnvelope?: unknown }).delegationEnvelope;
  const result = verifyDacV0041DesignationChain(
    buildPromotionChainInput(30, {
      links: [buildPromotionLeafLink(), envelopeless],
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'INVALID_FACTS');
  assert.match(result.detail, /delegation envelope/);
});

test('a41-002 chain: malformed envelope minima (empty delegable roles / negative or fractional depth) fail closed', () => {
  for (const depth of [-1, 1.5]) {
    const badDepth = verifyDacV0041DesignationChain(
      buildPromotionChainInput(30, {
        links: [
          buildPromotionLeafLink(),
          buildRootIssuanceLink({
            delegationEnvelope: {
              delegableRoles: ['promotion'],
              delegableScopes: [SCOPE.domainA],
              mandatoryConstraints: [],
              permittedDacProfiles: ['dac-profile/v0041-a'],
              delegableSodPermissions: [],
              redelegationDepth: depth,
            },
          }),
        ],
      }),
    );
    assert.equal(badDepth.outcome, 'FAIL_CLOSED');
    assert.equal(badDepth.code, 'INVALID_FACTS');
  }
  const emptyRoles = verifyDacV0041DesignationChain(
    buildPromotionChainInput(30, {
      links: [
        buildPromotionLeafLink(),
        buildRootIssuanceLink({
          delegationEnvelope: {
            delegableRoles: [],
            delegableScopes: [SCOPE.domainA],
            mandatoryConstraints: [],
            permittedDacProfiles: ['dac-profile/v0041-a'],
            delegableSodPermissions: [],
            redelegationDepth: 1,
          },
        }),
      ],
    }),
  );
  assert.equal(emptyRoles.outcome, 'FAIL_CLOSED');
  assert.equal(emptyRoles.code, 'INVALID_FACTS');
});

test('a41-002 chain: malformed link facts (NaN time, empty identity, empty validity window, empty attestors) fail closed', () => {
  const nanFrom = verifyDacV0041DesignationChain(
    buildPromotionChainInput(30, {
      links: [
        buildPromotionLeafLink({ effectiveFrom: Number.NaN }),
        buildRootIssuanceLink(),
      ],
    }),
  );
  assert.equal(nanFrom.outcome, 'FAIL_CLOSED');
  assert.equal(nanFrom.code, 'INVALID_FACTS');

  const emptyScope = verifyDacV0041DesignationChain(
    buildPromotionChainInput(30, {
      links: [
        buildPromotionLeafLink({ authorityScope: '  ' }),
        buildRootIssuanceLink(),
      ],
    }),
  );
  assert.equal(emptyScope.outcome, 'FAIL_CLOSED');
  assert.equal(emptyScope.code, 'INVALID_FACTS');

  const emptyWindow = verifyDacV0041DesignationChain(
    buildPromotionChainInput(30, {
      links: [
        buildPromotionLeafLink({ effectiveFrom: 50, declaredEffectiveEnd: 50 }),
        buildRootIssuanceLink(),
      ],
    }),
  );
  assert.equal(emptyWindow.outcome, 'FAIL_CLOSED');
  assert.equal(emptyWindow.code, 'INVALID_FACTS');

  const noAttestors = verifyDacV0041DesignationChain(
    buildPromotionChainInput(30, {
      links: [
        buildPromotionLeafLink({
          issuanceEvidence: { point: 20, assertedBy: [] },
        }),
        buildRootIssuanceLink(),
      ],
    }),
  );
  assert.equal(noAttestors.outcome, 'FAIL_CLOSED');
  assert.equal(noAttestors.code, 'ISSUANCE_EVIDENCE_UNESTABLISHED');
});

test('a41-002 chain: mutable-alias identities never substitute exact authority identities', () => {
  for (const alias of ['latest', 'current', 'HEAD']) {
    const result = verifyDacV0041DesignationChain(
      buildPromotionChainInput(30, {
        links: [
          buildPromotionLeafLink({ designatorIdentity: alias }),
          buildRootIssuanceLink(),
        ],
      }),
    );
    assert.equal(result.outcome, 'FAIL_CLOSED');
    assert.equal(result.code, 'MUTABLE_ALIAS_IDENTITY');
  }
});

test('a41-002 chain: hostile non-object input fails closed instead of throwing', () => {
  const hostileInputs = [
    null,
    undefined,
    'chain',
    42,
    {},
    { links: [], leafLinkIdentity: 'x', evaluationPoint: 1, scopeOwnerAnchors: [] },
    { links: [{}], leafLinkIdentity: 'x', evaluationPoint: 1, scopeOwnerAnchors: [] },
  ] as unknown as DacV0041DesignationChainInput[];
  for (const hostile of hostileInputs) {
    const result = verifyDacV0041DesignationChain(hostile);
    assert.equal(result.outcome, 'FAIL_CLOSED');
    assert.equal(result.code, 'INVALID_FACTS');
  }
  const nanPoint = verifyDacV0041DesignationChain(
    buildPromotionChainInput(Number.NaN),
  );
  assert.equal(nanPoint.outcome, 'FAIL_CLOSED');
  assert.equal(nanPoint.code, 'INVALID_FACTS');
});

test('a41-002 chain C169 posture: one identity independently designated in separate chains is never globally prohibited', () => {
  // The same dual-role identity is the designated issuer of two leaves in
  // two INDEPENDENT chains (compatibility validation and Runtime binding):
  // both verify CHAIN_CURRENT; only repetition inside ONE chain fails.
  const compatibilityChain = verifyDacV0041DesignationChain({
    links: [
      buildPromotionLeafLink({
        linkIdentity: 'link/compat-dual',
        authorityRole: 'compatibility-validation',
        designatedIssuerIdentity: IDENTITY.dualRole,
      }),
      buildRootIssuanceLink(),
    ],
    leafLinkIdentity: 'link/compat-dual',
    scopeOwnerAnchors: [
      { ownerIdentity: IDENTITY.owner, provedScopes: [SCOPE.domainA] },
    ],
    evaluationPoint: 40,
  });
  assert.equal(compatibilityChain.outcome, 'CHAIN_CURRENT');

  const bindingChain = verifyDacV0041DesignationChain({
    links: [
      buildPromotionLeafLink({
        linkIdentity: 'link/binding-dual',
        authorityRole: 'runtime-binding',
        designatedIssuerIdentity: IDENTITY.dualRole,
      }),
      buildRootIssuanceLink(),
    ],
    leafLinkIdentity: 'link/binding-dual',
    scopeOwnerAnchors: [
      { ownerIdentity: IDENTITY.owner, provedScopes: [SCOPE.domainA] },
    ],
    evaluationPoint: 40,
  });
  assert.equal(bindingChain.outcome, 'CHAIN_CURRENT');
});

test('a41-002 chain: verification is pure — identical facts yield identical verdicts and frozen inputs are never mutated', () => {
  const input = buildPromotionChainInput(30);
  const first = verifyDacV0041DesignationChain(input);
  const second = verifyDacV0041DesignationChain(input);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});
