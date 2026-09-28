// Issue #358 / A41-004 — F-04 §4.1 application-identity establishment intake
// (C140/C141 + LIFECYCLE_REFERENCE_REPAIRS §4.1 minima): the exact external
// establishment evidence is VERIFIED, never issued locally; the identity
// chain anti-alias and the establishment-precedes-selection order hold;
// absent/foreign/predecessor-wrapped evidence fails closed.
import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyDacV0041CompositionIntake } from '../../src/dac-v0041/composition-intake/index.js';
import {
  IDENTITY,
  PROFILE,
  ROLE,
  SCOPE,
  buildLeafLink,
  buildRef,
  buildRequestlessInitiation,
  buildRootIssuanceLink,
  buildEstablishmentFacts,
  buildValidIntakeInput,
  v003Predecessor,
} from './helpers.js';

test('a41-004 identity: valid externally-owned establishment evidence verifies at intake', () => {
  const result = verifyDacV0041CompositionIntake(buildValidIntakeInput());
  assert.equal(result.outcome, 'INTAKE_VERIFIED');
  assert.equal(result.establishmentIdentity, 'establishment/record-1');
});

test('a41-004 identity: establishment is verified, never issued — no establishment-issuing verb exists (see ceiling suite) and the intake result is plain evidence classification', () => {
  const result = verifyDacV0041CompositionIntake(buildValidIntakeInput());
  assert.equal(result.outcome, 'INTAKE_VERIFIED');
  // The verified outcome carries identities of EXTERNAL records only.
  assert.deepEqual(result.coveredSubjectIdentities, [
    'subject/selected-alpha',
    'subject/selected-beta',
  ]);
});

test('a41-004 identity: C141 — establishment record aliasing the ApplicationSemanticIdentity fails closed', () => {
  const aliased = buildRef('application-semantic', 'establishment/record-1');
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      applicationIdentityEstablishment: buildEstablishmentFacts({
        applicationSemanticIdentityRef: aliased,
      }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'IDENTITY_ALIAS');
});

test('a41-004 identity: C141 — establishment record aliasing its own request fails closed', () => {
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      applicationIdentityEstablishment: buildEstablishmentFacts({
        establishmentRequestRef: buildRef(
          'application-identity-establishment-request',
          'establishment/record-1',
        ),
      }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'IDENTITY_ALIAS');
});

test('a41-004 identity: absent initiation evidence (no request, no requestless initiation record) fails closed', () => {
  const { establishmentRequestRef: _omitted, ...requestless } = buildEstablishmentFacts();
  void _omitted;
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      applicationIdentityEstablishment: requestless,
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'INVALID_FACTS');
});

test('a41-004 identity: R1/#377 P1-1 — claim-only boolean initiation cannot close identity intake', () => {
  // The pre-R1 shape asserted initiation through a boolean caller claim
  // (`initiationExplicitlyEvidenced: true`) with no externally recoverable
  // initiation record; exactly that claim-only shape must fail closed.
  const claimOnly = {
    establishmentRequestRef: undefined,
    initiationExplicitlyEvidenced: true,
  } as unknown as Parameters<typeof buildEstablishmentFacts>[0];
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      applicationIdentityEstablishment: buildEstablishmentFacts(claimOnly),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'INVALID_FACTS');
});

test('a41-004 identity: requestless seam with an externally recoverable initiation record verifies', () => {
  const { establishmentRequestRef: _omitted, ...requestless } = buildEstablishmentFacts();
  void _omitted;
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      applicationIdentityEstablishment: {
        ...requestless,
        requestlessInitiation: buildRequestlessInitiation(),
      },
    }),
  );
  assert.equal(result.outcome, 'INTAKE_VERIFIED');
});

test('a41-004 identity: R1/#377 P1-1 — both request seam and requestless initiation is an ambiguous seam and fails closed', () => {
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      applicationIdentityEstablishment: buildEstablishmentFacts({
        requestlessInitiation: buildRequestlessInitiation(),
      }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'INVALID_FACTS');
});

test('a41-004 identity: R1/#377 P1-1 — forged requestless initiation carrier fails closed as FOREIGN_EVIDENCE', () => {
  const { establishmentRequestRef: _omitted, ...requestless } = buildEstablishmentFacts();
  void _omitted;
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      applicationIdentityEstablishment: {
        ...requestless,
        requestlessInitiation: buildRequestlessInitiation({
          initiationRef: { role: 'evidence', primaryIdentity: 'x' } as never,
        }),
      },
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'FOREIGN_EVIDENCE');
});

test('a41-004 identity: R1/#377 P1-1 — wrong-role initiation reference fails closed', () => {
  const { establishmentRequestRef: _omitted, ...requestless } = buildEstablishmentFacts();
  void _omitted;
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      applicationIdentityEstablishment: {
        ...requestless,
        requestlessInitiation: buildRequestlessInitiation({
          initiationRef: buildRef(
            'application-identity-establishment-request',
            'initiation/establishment-1',
          ),
        }),
      },
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'ROLE_MISMATCH');
});

test('a41-004 identity: R1/#377 P1-1 — predecessor-wrapped initiation reference fails closed', () => {
  const { establishmentRequestRef: _omitted, ...requestless } = buildEstablishmentFacts();
  void _omitted;
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      applicationIdentityEstablishment: {
        ...requestless,
        requestlessInitiation: buildRequestlessInitiation({
          initiationRef: buildRef('evidence', 'initiation/establishment-1', {
            predecessorOrigin: v003Predecessor(),
          }),
        }),
      },
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'PREDECESSOR_WRAPPED');
});

test('a41-004 identity: R1/#377 P1-1 — initiation reference aliasing the establishment record fails closed', () => {
  const { establishmentRequestRef: _omitted, ...requestless } = buildEstablishmentFacts();
  void _omitted;
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      applicationIdentityEstablishment: {
        ...requestless,
        requestlessInitiation: buildRequestlessInitiation({
          initiationRef: buildRef('evidence', 'establishment/record-1'),
        }),
      },
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'IDENTITY_ALIAS');
});

test('a41-004 identity: R1/#377 P1-1 — unattested requestless initiation provenance fails closed', () => {
  const { establishmentRequestRef: _omitted, ...requestless } = buildEstablishmentFacts();
  void _omitted;
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      applicationIdentityEstablishment: {
        ...requestless,
        requestlessInitiation: buildRequestlessInitiation({
          initiationProvenance: { point: 28, assertedBy: [] },
        }),
      },
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'EVIDENCE_UNESTABLISHED');
});

test('a41-004 identity: R1/#377 P1-1 — initiation issuer not covered by the provenance attestors fails closed', () => {
  const { establishmentRequestRef: _omitted, ...requestless } = buildEstablishmentFacts();
  void _omitted;
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      applicationIdentityEstablishment: {
        ...requestless,
        requestlessInitiation: buildRequestlessInitiation({
          initiationIssuerIdentity: 'id/outsider',
        }),
      },
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'EVIDENCE_UNESTABLISHED');
});

test('a41-004 identity: R1/#377 P1-1 — initiation reference bound to a different application scope fails closed', () => {
  const { establishmentRequestRef: _omitted, ...requestless } = buildEstablishmentFacts();
  void _omitted;
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      applicationIdentityEstablishment: {
        ...requestless,
        requestlessInitiation: buildRequestlessInitiation({
          initiationRef: buildRef('evidence', 'initiation/establishment-1', {
            authorityScope: SCOPE.other,
          }),
        }),
      },
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'SCOPE_MISMATCH');
});

test('a41-004 identity: R1/#377 P1-1 — initiation provenance at/after the establishment issuance point fails closed', () => {
  for (const point of [30, 31] as const) {
    const { establishmentRequestRef: _omitted, ...requestless } = buildEstablishmentFacts();
    void _omitted;
    const result = verifyDacV0041CompositionIntake(
      buildValidIntakeInput({
        applicationIdentityEstablishment: {
          ...requestless,
          requestlessInitiation: buildRequestlessInitiation({
            initiationProvenance: { point, assertedBy: [IDENTITY.witness] },
          }),
        },
      }),
    );
    assert.equal(result.outcome, 'FAIL_CLOSED');
    assert.equal(result.code, 'ESTABLISHMENT_ORDER_VIOLATED');
  }
});

test('a41-004 identity: foreign/forged establishment carrier fails closed', () => {
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      applicationIdentityEstablishment: buildEstablishmentFacts({
        establishmentRef: { role: ROLE.establishment, primaryIdentity: 'x' } as never,
      }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'FOREIGN_EVIDENCE');
});

test('a41-004 identity: wrong-role evidence (semantic identity in the record slot) fails closed', () => {
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      applicationIdentityEstablishment: buildEstablishmentFacts({
        establishmentRef: buildRef('application-semantic', 'establishment/record-1'),
      }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'ROLE_MISMATCH');
});

test('a41-004 identity: C145 — predecessor-wrapped establishment evidence fails closed', () => {
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      applicationIdentityEstablishment: buildEstablishmentFacts({
        establishmentRef: buildRef(ROLE.establishment, 'establishment/record-1', {
          predecessorOrigin: v003Predecessor(),
        }),
      }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'PREDECESSOR_WRAPPED');
});

test('a41-004 identity: unauthorized establishment issuer (chain fails) fails closed', () => {
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      applicationIdentityEstablishment: buildEstablishmentFacts({
        issuerIdentity: IDENTITY.outsider,
      }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'UNAUTHORIZED_ISSUER');
});

test('a41-004 identity: unevidenced establishment issuance point fails closed', () => {
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      applicationIdentityEstablishment: buildEstablishmentFacts({
        issuanceEvidence: { point: 30, assertedBy: [] },
      }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'EVIDENCE_UNESTABLISHED');
});

test('a41-004 identity: an establishment claiming a scope its issuer chain does not cover fails closed', () => {
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      applicationIdentityEstablishment: buildEstablishmentFacts({
        applicationScope: SCOPE.other,
      }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'UNAUTHORIZED_ISSUER');
});

test('a41-004 identity: cross-artifact scope mismatch fails closed even with internally valid chains', () => {
  // The establishment is internally consistent under scope/app-beta (its
  // own chain covers that scope), but selection/Manifest stay under
  // scope/app-alpha: exact scope matching across the F-04 chain fails closed.
  const otherScopeChain = {
    links: [
      {
        ...buildLeafLink('link/establishment-leaf', IDENTITY.establishmentIssuer, ROLE.establishment),
        authorityScope: SCOPE.other,
      },
      buildRootIssuanceLink({
        authorityScope: SCOPE.other,
        delegationEnvelope: {
          delegableRoles: [
            ROLE.establishment,
            ROLE.selection,
            ROLE.manifestIssuance,
            ROLE.runtimeBinding,
          ],
          delegableScopes: [SCOPE.other],
          mandatoryConstraints: [],
          permittedDacProfiles: [PROFILE.v0041],
          delegableSodPermissions: [],
          redelegationDepth: 1,
        },
      }),
    ],
    leafLinkIdentity: 'link/establishment-leaf',
    scopeOwnerAnchors: [
      { ownerIdentity: IDENTITY.owner, provedScopes: [SCOPE.app, SCOPE.other] },
    ],
    evaluationPoint: 30,
  };
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      applicationIdentityEstablishment: buildEstablishmentFacts({
        applicationScope: SCOPE.other,
        issuerDesignationChain: otherScopeChain,
      }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'SCOPE_MISMATCH');
});

test('a41-004 identity: an establishment claiming a profile its issuer chain does not permit fails closed', () => {
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      applicationIdentityEstablishment: buildEstablishmentFacts({
        dacProfileIdentity: PROFILE.other,
      }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'UNAUTHORIZED_ISSUER');
});
