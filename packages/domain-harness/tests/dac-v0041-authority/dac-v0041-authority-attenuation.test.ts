// Issue #356 / A41-002 — focused directed-attenuation verification: the
// C119–C124 and C159–C162 fail-closed matrix plus the C130/C168 root-anchor
// obligations (F-01 §§3–5, §6 steps 4–5). Every widening, exception or
// undecidable comparison fails closed; nothing is silently narrowed.
import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyDacV0041DesignationChain } from '../../src/dac-v0041/authority/index.js';
import {
  CONSTRAINT,
  IDENTITY,
  PROFILE,
  SCOPE,
  SOD_PERMISSION,
  buildDepthOneChainInput,
  buildMiddleIssuanceLink,
  buildPromotionChainInput,
  buildPromotionLeafLink,
  buildRootIssuanceLink,
} from './helpers.js';

function failCode(links: Parameters<typeof buildPromotionChainInput>[1]): string {
  const result = verifyDacV0041DesignationChain(buildPromotionChainInput(30, links));
  assert.equal(result.outcome, 'FAIL_CLOSED');
  return result.code;
}

test('a41-002 attenuation C119: a role outside the delegable roles fails closed', () => {
  assert.equal(
    failCode({
      links: [
        buildPromotionLeafLink({ authorityRole: 'runtime-activation' }),
        buildRootIssuanceLink(),
      ],
    }),
    'ROLE_NOT_ENVELOPED',
  );
});

test('a41-002 attenuation C120: a scope outside the envelope, including another owner scope, fails closed', () => {
  assert.equal(
    failCode({
      links: [
        buildPromotionLeafLink({ authorityScope: SCOPE.domainB }),
        buildRootIssuanceLink(),
      ],
    }),
    'SCOPE_NOT_ENVELOPED',
  );
});

test('a41-002 attenuation C121: a profile outside the envelope fails closed', () => {
  assert.equal(
    failCode({
      links: [
        buildPromotionLeafLink({ dacProfileIdentity: PROFILE.other }),
        buildRootIssuanceLink(),
      ],
    }),
    'PROFILE_NOT_PERMITTED',
  );
});

test('a41-002 attenuation C121: dropping an inherited mandatory constraint fails closed (no silent truncation)', () => {
  assert.equal(
    failCode({
      links: [
        buildPromotionLeafLink({ holderConstraints: [] }),
        buildRootIssuanceLink(),
      ],
    }),
    'CONSTRAINT_NOT_INHERITED',
  );
});

test('a41-002 attenuation C121: a differently spelled "stricter" restriction is undecidable and fails closed', () => {
  // The child narrows to an EU sub-restriction but no longer carries the
  // exact inherited token: semantic implication is not deterministically
  // verifiable, so the comparison fails closed instead of being repaired.
  assert.equal(
    failCode({
      links: [
        buildPromotionLeafLink({ holderConstraints: [CONSTRAINT.euOnly] }),
        buildRootIssuanceLink(),
      ],
    }),
    'CONSTRAINT_NOT_INHERITED',
  );
});

test('a41-002 attenuation C122: a child window exceeding the parent declared end fails closed', () => {
  assert.equal(
    failCode({
      links: [
        buildPromotionLeafLink({ declaredEffectiveEnd: 120 }),
        buildRootIssuanceLink(),
      ],
    }),
    'WINDOW_NOT_ATTENUATED',
  );
});

test('a41-002 attenuation C122: a bounded parent cannot create an unbounded child', () => {
  const unbounded = {
    linkIdentity: 'link/promotion-b',
    designatorIdentity: IDENTITY.delegate,
    designatedIssuerIdentity: IDENTITY.promoter,
    authorityRole: 'promotion',
    authorityScope: SCOPE.domainA,
    dacProfileIdentity: PROFILE.v0041a,
    holderConstraints: [CONSTRAINT.tenantAlpha],
    sodPermissions: [],
    effectiveFrom: 20,
    issuanceEvidence: { point: 20, assertedBy: [IDENTITY.witness] },
    parentLinkIdentity: 'link/root-iss',
  };
  const result = verifyDacV0041DesignationChain(
    buildPromotionChainInput(30, {
      links: [unbounded, buildRootIssuanceLink()],
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'WINDOW_NOT_ATTENUATED');
});

test('a41-002 attenuation C122: an effective-from before the link\'s own evidenced issuance point fails closed', () => {
  assert.equal(
    failCode({
      links: [
        buildPromotionLeafLink({ effectiveFrom: 15 }),
        buildRootIssuanceLink(),
      ],
    }),
    'BACKDATED_EFFECTIVE_FROM',
  );
});

test('a41-002 attenuation C123: a SoD/co-location permission excluded by the envelope fails closed', () => {
  assert.equal(
    failCode({
      links: [
        buildPromotionLeafLink({
          sodPermissions: [SOD_PERMISSION.admin],
        }),
        buildRootIssuanceLink(),
      ],
    }),
    'SOD_PERMISSION_NOT_PERMITTED',
  );
});

test('a41-002 attenuation C124: re-delegating designation-issuance without envelope permission fails closed', () => {
  assert.equal(
    failCode({
      links: [
        buildPromotionLeafLink({
          authorityRole: 'designation-issuance',
          delegationEnvelope: {
            delegableRoles: ['promotion'],
            delegableScopes: [SCOPE.domainA],
            mandatoryConstraints: [CONSTRAINT.tenantAlpha],
            permittedDacProfiles: [PROFILE.v0041a],
            delegableSodPermissions: [],
            redelegationDepth: 0,
          },
        }),
        buildRootIssuanceLink({
          delegationEnvelope: {
            delegableRoles: ['promotion', 'selection'],
            delegableScopes: [SCOPE.domainA],
            mandatoryConstraints: [],
            permittedDacProfiles: [PROFILE.v0041a],
            delegableSodPermissions: [],
            redelegationDepth: 1,
          },
        }),
      ],
    }),
    'REDELEGATION_NOT_PERMITTED',
  );
});

test('a41-002 attenuation C124: re-delegating designation-issuance after depth exhaustion fails closed', () => {
  // The middle link carries depth 0, so the grandchild's own depth-0
  // designation-issuance grant exceeds the exhausted parent depth (0 <= -1
  // is impossible): re-delegation is denied.
  const result = verifyDacV0041DesignationChain(
    buildDepthOneChainInput(50, {
      links: [
        buildPromotionLeafLink({
          linkIdentity: 'link/grandchild-promotion',
          designatorIdentity: IDENTITY.midDelegate,
          designatedIssuerIdentity: IDENTITY.promoterC,
          parentLinkIdentity: 'link/mid-iss',
          authorityRole: 'designation-issuance',
          delegationEnvelope: {
            delegableRoles: ['promotion', 'designation-issuance'],
            delegableScopes: [SCOPE.domainA],
            mandatoryConstraints: [CONSTRAINT.tenantAlpha],
            permittedDacProfiles: [PROFILE.v0041a],
            delegableSodPermissions: [],
            redelegationDepth: 0,
          },
        }),
        buildMiddleIssuanceLink(),
        buildRootIssuanceLink({
          delegationEnvelope: {
            delegableRoles: ['promotion', 'designation-issuance'],
            delegableScopes: [SCOPE.domainA],
            mandatoryConstraints: [CONSTRAINT.tenantAlpha],
            permittedDacProfiles: [PROFILE.v0041a],
            delegableSodPermissions: [],
            redelegationDepth: 2,
          },
        }),
      ],
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'REDELEGATION_NOT_PERMITTED');
});

test('a41-002 attenuation C160: a grandchild envelope dropping the root mandatory constraint fails closed', () => {
  const result = verifyDacV0041DesignationChain(
    buildDepthOneChainInput(50, {
      links: [
        buildPromotionLeafLink({
          linkIdentity: 'link/grandchild-promotion',
          designatorIdentity: IDENTITY.midDelegate,
          designatedIssuerIdentity: IDENTITY.promoterC,
          parentLinkIdentity: 'link/mid-iss',
          authorityRole: 'designation-issuance',
          delegationEnvelope: {
            delegableRoles: ['promotion'],
            delegableScopes: [SCOPE.domainA],
            mandatoryConstraints: [],
            permittedDacProfiles: [PROFILE.v0041a],
            delegableSodPermissions: [],
            redelegationDepth: 0,
          },
        }),
        buildMiddleIssuanceLink({
          delegationEnvelope: {
            delegableRoles: ['promotion', 'designation-issuance'],
            delegableScopes: [SCOPE.domainA],
            mandatoryConstraints: [CONSTRAINT.tenantAlpha],
            permittedDacProfiles: [PROFILE.v0041a],
            delegableSodPermissions: [],
            redelegationDepth: 1,
          },
        }),
        buildRootIssuanceLink({
          delegationEnvelope: {
            delegableRoles: ['promotion', 'designation-issuance'],
            delegableScopes: [SCOPE.domainA],
            mandatoryConstraints: [CONSTRAINT.tenantAlpha],
            permittedDacProfiles: [PROFILE.v0041a],
            delegableSodPermissions: [],
            redelegationDepth: 2,
          },
        }),
      ],
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'CONSTRAINT_NOT_INHERITED');
});

test('a41-002 attenuation C160: an intermediate designator cannot drop a root constraint via its own link facts', () => {
  const result = verifyDacV0041DesignationChain(
    buildDepthOneChainInput(50, {
      links: [
        {
          ...buildPromotionLeafLink(),
          linkIdentity: 'link/grandchild-promotion',
          designatorIdentity: IDENTITY.midDelegate,
          parentLinkIdentity: 'link/mid-iss',
        },
        buildMiddleIssuanceLink({ holderConstraints: [] }),
        buildRootIssuanceLink({
          delegationEnvelope: {
            delegableRoles: ['promotion', 'designation-issuance'],
            delegableScopes: [SCOPE.domainA],
            mandatoryConstraints: [CONSTRAINT.tenantAlpha],
            permittedDacProfiles: [PROFILE.v0041a],
            delegableSodPermissions: [],
            redelegationDepth: 2,
          },
        }),
      ],
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'CONSTRAINT_NOT_INHERITED');
});

test('a41-002 attenuation C161: a child envelope widening the permitted profiles beyond an ancestor fails closed', () => {
  const result = verifyDacV0041DesignationChain(
    buildDepthOneChainInput(50, {
      links: [
        buildPromotionLeafLink({
          linkIdentity: 'link/grandchild-promotion',
          designatorIdentity: IDENTITY.midDelegate,
          parentLinkIdentity: 'link/mid-iss',
        }),
        buildMiddleIssuanceLink({
          delegationEnvelope: {
            delegableRoles: ['promotion'],
            delegableScopes: [SCOPE.domainA],
            mandatoryConstraints: [CONSTRAINT.tenantAlpha],
            permittedDacProfiles: [PROFILE.v0041a, PROFILE.other],
            delegableSodPermissions: [],
            redelegationDepth: 0,
          },
        }),
        buildRootIssuanceLink({
          delegationEnvelope: {
            delegableRoles: ['promotion', 'designation-issuance'],
            delegableScopes: [SCOPE.domainA],
            mandatoryConstraints: [CONSTRAINT.tenantAlpha],
            permittedDacProfiles: [PROFILE.v0041a],
            delegableSodPermissions: [],
            redelegationDepth: 2,
          },
        }),
      ],
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'ENVELOPE_WIDENING');
});

test('a41-002 attenuation C162: a child envelope widening SoD permissions beyond an ancestor fails closed', () => {
  const result = verifyDacV0041DesignationChain(
    buildDepthOneChainInput(50, {
      links: [
        buildPromotionLeafLink({
          linkIdentity: 'link/grandchild-promotion',
          designatorIdentity: IDENTITY.midDelegate,
          parentLinkIdentity: 'link/mid-iss',
        }),
        buildMiddleIssuanceLink({
          delegationEnvelope: {
            delegableRoles: ['promotion'],
            delegableScopes: [SCOPE.domainA],
            mandatoryConstraints: [CONSTRAINT.tenantAlpha],
            permittedDacProfiles: [PROFILE.v0041a],
            delegableSodPermissions: [SOD_PERMISSION.cohostComposer, SOD_PERMISSION.admin],
            redelegationDepth: 0,
          },
        }),
        buildRootIssuanceLink({
          delegationEnvelope: {
            delegableRoles: ['promotion', 'designation-issuance'],
            delegableScopes: [SCOPE.domainA],
            mandatoryConstraints: [CONSTRAINT.tenantAlpha],
            permittedDacProfiles: [PROFILE.v0041a],
            delegableSodPermissions: [SOD_PERMISSION.cohostComposer],
            redelegationDepth: 2,
          },
        }),
      ],
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'ENVELOPE_WIDENING');
});

test('a41-002 attenuation: child envelopes widening roles or scopes beyond the parent fail closed', () => {
  const rolesWidened = verifyDacV0041DesignationChain(
    buildPromotionChainInput(30, {
      links: [
        buildPromotionLeafLink({
          authorityRole: 'designation-issuance',
          delegationEnvelope: {
            delegableRoles: ['promotion', 'selection'],
            delegableScopes: [SCOPE.domainA],
            mandatoryConstraints: [],
            permittedDacProfiles: [PROFILE.v0041a],
            delegableSodPermissions: [],
            redelegationDepth: 0,
          },
        }),
        buildRootIssuanceLink({
          delegationEnvelope: {
            delegableRoles: ['promotion', 'designation-issuance'],
            delegableScopes: [SCOPE.domainA],
            mandatoryConstraints: [],
            permittedDacProfiles: [PROFILE.v0041a],
            delegableSodPermissions: [],
            redelegationDepth: 1,
          },
        }),
      ],
    }),
  );
  assert.equal(rolesWidened.outcome, 'FAIL_CLOSED');
  assert.equal(rolesWidened.code, 'ENVELOPE_WIDENING');

  const scopesWidened = verifyDacV0041DesignationChain(
    buildPromotionChainInput(30, {
      links: [
        buildPromotionLeafLink({
          authorityRole: 'designation-issuance',
          delegationEnvelope: {
            delegableRoles: ['promotion'],
            delegableScopes: [SCOPE.domainA, SCOPE.domainB],
            mandatoryConstraints: [],
            permittedDacProfiles: [PROFILE.v0041a],
            delegableSodPermissions: [],
            redelegationDepth: 0,
          },
        }),
        buildRootIssuanceLink({
          delegationEnvelope: {
            delegableRoles: ['promotion', 'designation-issuance'],
            delegableScopes: [SCOPE.domainA],
            mandatoryConstraints: [],
            permittedDacProfiles: [PROFILE.v0041a],
            delegableSodPermissions: [],
            redelegationDepth: 1,
          },
        }),
      ],
    }),
  );
  assert.equal(scopesWidened.outcome, 'FAIL_CLOSED');
  assert.equal(scopesWidened.code, 'ENVELOPE_WIDENING');
});

test('a41-002 attenuation C130: a root designator without an owner anchor fails closed', () => {
  const result = verifyDacV0041DesignationChain(
    buildPromotionChainInput(30, {
      scopeOwnerAnchors: [
        { ownerIdentity: IDENTITY.outsider, provedScopes: [SCOPE.domainA] },
      ],
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'ROOT_ANCHOR_UNESTABLISHED');
  assert.equal(result.linkIdentity, 'link/root-iss');
});

test('a41-002 attenuation C168: an anchor proving the chain scope but not another envelope scope fails the root and every grant', () => {
  const result = verifyDacV0041DesignationChain(
    buildPromotionChainInput(30, {
      links: [
        buildPromotionLeafLink(),
        buildRootIssuanceLink({
          delegationEnvelope: {
            delegableRoles: ['promotion'],
            delegableScopes: [SCOPE.domainA, SCOPE.domainB],
            mandatoryConstraints: [CONSTRAINT.tenantAlpha],
            permittedDacProfiles: [PROFILE.v0041a],
            delegableSodPermissions: [],
            redelegationDepth: 0,
          },
        }),
      ],
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'ROOT_ANCHOR_UNESTABLISHED');
  assert.match(result.detail, /scope\/domain-b/);
});

test('a41-002 attenuation: partial owner anchors are never merged into coverage', () => {
  // Two anchors for the same owner each prove one of the two required
  // scopes: deterministic verification requires ONE anchor record proving
  // every required scope; aggregation would silently repair coverage.
  const result = verifyDacV0041DesignationChain(
    buildPromotionChainInput(30, {
      links: [
        buildPromotionLeafLink(),
        buildRootIssuanceLink({
          delegationEnvelope: {
            delegableRoles: ['promotion'],
            delegableScopes: [SCOPE.domainA, SCOPE.domainB],
            mandatoryConstraints: [CONSTRAINT.tenantAlpha],
            permittedDacProfiles: [PROFILE.v0041a],
            delegableSodPermissions: [],
            redelegationDepth: 0,
          },
        }),
      ],
      scopeOwnerAnchors: [
        { ownerIdentity: IDENTITY.owner, provedScopes: [SCOPE.domainA] },
        { ownerIdentity: IDENTITY.owner, provedScopes: [SCOPE.domainB] },
      ],
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'ROOT_ANCHOR_UNESTABLISHED');
});
