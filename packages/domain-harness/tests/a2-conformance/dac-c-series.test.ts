// Issue #311 / A2 I-008 — INCREMENTAL conformance + negative suite over the
// A2 surface landed in v0.3 at the time of this slice: the DAC cross-layer
// reference adapter (I-002/#305, src/dac/**). The reviewed A2 matrix
// (L2 Amendment A2 DAC v0.0.2 §9/§10) is executed here case by case, but
// ONLY where the currently landed public surface owns the result.
//
// Scope guards (mandatory for this incremental slice):
// - This suite must NOT implement or assume I-003..I-007 semantics (package
//   mapping/validation, binding/activation flows, UX bridge, external
//   authority refs, Application Manifest adapter). Cases whose authoritative
//   result is owned by those not-yet-landed concerns are explicitly deferred
//   in tests/a2-conformance/COVERAGE.md, not faked here.
// - It extends — never duplicates — the #305 dac-refs suites: the exhaustive
//   cross-role matrix, authority-smuggling negatives, alias coverage on all
//   roles, the frozen value-surface snapshot and the coherent positive
//   journey are new pins; single-role adoption/baseline/opaque-verbatim
//   behavior stays pinned by tests/dac-refs/.
//
// Final I-008 PASS remains gated on I-003..I-007 completion (DAG #300).
import assert from 'node:assert/strict';
import test from 'node:test';
import * as dac from '../../src/dac/index.js';
import {
  DacReferenceError,
  refuteExternalBusinessSoRIdentity,
  verifyDacReferenceIdentity,
} from '../../src/dac/index.js';
import { ROLE_TABLE, adoptJourneyRefs, dacInput, JOURNEY } from './dac-fixtures.js';

const ALL_ALIAS_TOKENS = [
  'latest',
  'current',
  'head',
  'main',
  'master',
  'default',
  'stable',
  'tip',
] as const;

function assertDacErrorCode(fn: () => void, code: string, label: string): void {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof DacReferenceError, `${label}: expected DacReferenceError`);
  assert.equal((caught as DacReferenceError).code, code, `${label}: code ${code}`);
}

// ------------------------------------------------------------------ C02 / N01

test('a2 C02/N01: mutable latest/current/head revision identities are rejected for EVERY role', () => {
  // #305 pinned aliases on selected-domain-data + application-selection only.
  // A2 C02 owns the result for every role the adapter adopts: an alias must
  // never enter authoritative Runtime provenance through a side role either.
  for (const row of ROLE_TABLE) {
    for (const alias of ALL_ALIAS_TOKENS) {
      assertDacErrorCode(
        () => row.adopt(dacInput({ revisionIdentity: alias }) as never),
        'MUTABLE_ALIAS_REJECTED',
        `${row.role} with revisionIdentity "${alias}"`,
      );
    }
    // Exact whole-token matching only: an exact revision id that contains an
    // alias word is NOT heuristically rejected (no guessing).
    const exact = row.adopt(
      dacInput({ revisionIdentity: 'rev-latest-snapshot-of-2026-09-23-0001' }) as never,
    ) as { revisionIdentity?: string };
    assert.equal(exact.revisionIdentity, 'rev-latest-snapshot-of-2026-09-23-0001');
  }
});

// -------------------------------------------------- C22 / C31 / N05 / N06

test('a2 C22/C31 exhaustive: no lifecycle role guard accepts any other role (8x8, identical identity fields)', () => {
  // The #305 suite pinned the five pairwise inequalities with a shared input.
  // This exhaustive matrix closes the remaining collapse vectors named by the
  // DAG — in particular selected != binding/activation (C31), selection ->
  // activation (N06) and promotion -> activation (N03) — and proves the
  // distinctness is NOMINAL: identical identity fields on two roles never
  // make them interchangeable.
  const adoptedByRole = new Map<string, unknown>();
  for (const row of ROLE_TABLE) {
    adoptedByRole.set(row.role, row.adopt(dacInput() as never));
  }
  for (const actual of ROLE_TABLE) {
    const ref = adoptedByRole.get(actual.role);
    for (const claimed of ROLE_TABLE) {
      if (claimed.role === actual.role) {
        assert.ok(claimed.isGuard(ref), `${actual.role} passes its own guard`);
        claimed.expectGuard(ref);
        continue;
      }
      assert.ok(
        !claimed.isGuard(ref),
        `${claimed.role} guard must reject a "${actual.role}" reference`,
      );
      assertDacErrorCode(
        () => claimed.expectGuard(ref),
        'ROLE_MISMATCH',
        `${claimed.role} guard rejects "${actual.role}"`,
      );
    }
  }
});

test('a2 C31/N06: selected Domain Data is neither binding nor activation evidence', () => {
  const { selected, binding, activation } = adoptJourneyRefs();
  assertDacErrorCode(
    () => dac.expectRuntimeBindingRef(selected),
    'ROLE_MISMATCH',
    'selected -> binding',
  );
  assertDacErrorCode(
    () => dac.expectRuntimeActivationRef(selected),
    'ROLE_MISMATCH',
    'selected -> activation',
  );
  assertDacErrorCode(
    () => dac.expectRuntimeActivationRef(binding),
    'ROLE_MISMATCH',
    'binding -> activation',
  );
  assertDacErrorCode(
    () => dac.expectRuntimeBindingRef(activation),
    'ROLE_MISMATCH',
    'activation -> binding',
  );
});

// ------------------------------------------------------------- C07 / N03/N04

test('a2 C07/N03: a Simulator PASS / non-promotion ref can never be reclassified as promotion evidence', () => {
  // No conversion surface exists; the only way to a promotion-decision ref is
  // its own adopt constructor with upstream-governance provenance. Every
  // other lifecycle stage fails the promotion guard, and a role discriminant
  // smuggled INTO the adoption input is ignored — the constructor owns the
  // role, never the caller.
  for (const row of ROLE_TABLE) {
    if (row.role === 'promotion-decision') continue;
    const ref = row.adopt(dacInput() as never);
    assertDacErrorCode(
      () => dac.expectPromotionDecisionRef(ref),
      'ROLE_MISMATCH',
      `${row.role} cannot be presented as promotion evidence`,
    );
  }
  const smuggled = dac.adoptApplicationSelectionRef(
    dacInput({ role: 'promotion-decision' }) as never,
  );
  assert.equal(dac.getDacReferenceRole(smuggled), 'application-selection');
  const identityFields = Object.keys(smuggled).sort();
  assert.deepEqual(identityFields, [
    'adapter',
    'authorityScope',
    'baseline',
    'contentDigest',
    'opaque',
    'revisionIdentity',
    'role',
    'semanticIdentity',
  ]);
});

test('a2 N04: defaultPackageId / registry-shaped extra adoption fields never reach authoritative identity', () => {
  // The adapter owns no package registry and no default selection; whatever
  // registry-shaped fields a foreign carrier adds to the adoption input are
  // dropped, not adopted into identity and not silently preserved as if the
  // adapter understood them.
  const adopted = dac.adoptApplicationSelectionRef(
    dacInput({
      defaultPackageId: 'pkg-default-1',
      packageId: 'pkg-9',
      latest: true,
      resolution: { strategy: 'auto-latest' },
    }) as never,
  ) as Record<string, unknown>;
  for (const foreign of ['defaultPackageId', 'packageId', 'latest', 'resolution']) {
    assert.equal(adopted[foreign], undefined, `foreign field "${foreign}" must not be adopted`);
  }
  assert.deepEqual(adopted.opaque, {}, 'unrecognized input fields are not laundered into opaque');
  assert.equal(adopted.revisionIdentity, JOURNEY.revisionIdentity);
});

// -------------------------------------------------------------- C23 / N08/N09

test('a2 C23/N08: RuntimeContractRef and RuntimeImplementationRef stay distinct even with identical identity fields', () => {
  const contract = dac.adoptRuntimeContractRef(dacInput() as never);
  const implementation = dac.adoptRuntimeImplementationRef(dacInput() as never);
  // Identical semanticIdentity/authorityScope/revision/digest on both: the
  // contract-of-the-runtime and the concrete implementation-of-that-contract
  // are still two different authorities (A2 N08).
  assertDacErrorCode(
    () => dac.expectRuntimeImplementationRef(contract),
    'ROLE_MISMATCH',
    'contract -> implementation',
  );
  assertDacErrorCode(
    () => dac.expectRuntimeContractRef(implementation),
    'ROLE_MISMATCH',
    'implementation -> contract',
  );
});

test('a2 C23/N09 (adapter part): an implementation target that only says "current" is not an exact identity', () => {
  // Full N09 (missing port/capability blocks activation) is I-003/I-004
  // territory. The adapter-ownable part: a runtime implementation ref whose
  // revision is a mutable alias — "just run the current DomainHarness" —
  // fails closed instead of adopting a floating identity.
  assertDacErrorCode(
    () => dac.adoptRuntimeImplementationRef(dacInput({ revisionIdentity: 'current' }) as never),
    'MUTABLE_ALIAS_REJECTED',
    'implementation with revisionIdentity "current"',
  );
  assertDacErrorCode(
    () =>
      dac.adoptRuntimeImplementationRef(
        dacInput({
          revisionIdentity: 'current',
          semanticIdentity: JOURNEY.runtimeImplementationSemanticIdentity,
        }) as never,
      ),
    'MUTABLE_ALIAS_REJECTED',
    'named implementation still floating on "current"',
  );
});

// ---------------------------------------------------------------- C09 / N10

test('a2 C09/N10 (adapter part): post-adoption revision/digest drift is impossible — refs are deeply frozen', () => {
  // The runtime-application half of C09 (stale snapshot basis on a live
  // runtime) is I-005; what the landed adapter owns is that an adopted exact
  // basis can never silently drift after adoption.
  const { selected } = adoptJourneyRefs();
  assert.ok(Object.isFrozen(selected));
  assert.ok(Object.isFrozen(selected.opaque));
  for (const [field, value] of [
    ['revisionIdentity', 'rev-000099'],
    ['contentDigest', 'sha256:drifted'],
    ['semanticIdentity', 'domain:billing:other'],
    ['authorityScope', 'dac://other/x'],
  ] as const) {
    assert.throws(
      () => {
        (selected as unknown as Record<string, string>)[field] = value;
      },
      TypeError,
      `writing ${field} must fail`,
    );
  }
  assert.equal(selected.revisionIdentity, JOURNEY.revisionIdentity);
  assert.equal(selected.contentDigest, JOURNEY.contentDigest);
  verifyDacReferenceIdentity(selected, {
    revisionIdentity: JOURNEY.revisionIdentity,
    contentDigest: JOURNEY.contentDigest,
  });
});

// ------------------------------------------------------ C32 / C37 / N07 / N04

test('a2 C32/C37/N07: the adapter value surface is exactly the frozen adoption+guard set — no substitution surface of any name', () => {
  // Incompatibility auto-substitution (C32/C37/N07) and default->selection
  // shortcuts (N04) are I-003 flows, but their absence must already be true
  // on THIS surface: the adapter cannot silently grow an auto-latest /
  // fallback / registry-lookup bridge. The exact snapshot makes any addition
  // a visible, deliberate act that a future increment must review and extend
  // (this allowlist is the extension point for I-003..I-007).
  const exportNames = Object.keys(dac).sort();
  assert.deepEqual(exportNames, [
    'DAC_REFERENCE_ADAPTER_VERSION',
    'DAC_REFERENCE_BASELINE',
    'DAC_REFERENCE_ROLES',
    'DacReferenceError',
    'adoptApplicationSelectionRef',
    'adoptCompatibilityTargetRef',
    'adoptPromotionDecisionRef',
    'adoptRuntimeActivationRef',
    'adoptRuntimeBindingRef',
    'adoptRuntimeContractRef',
    'adoptRuntimeImplementationRef',
    'adoptSelectedDomainDataRef',
    'expectApplicationSelectionRef',
    'expectCompatibilityTargetRef',
    'expectPromotionDecisionRef',
    'expectRuntimeActivationRef',
    'expectRuntimeBindingRef',
    'expectRuntimeContractRef',
    'expectRuntimeImplementationRef',
    'expectSelectedDomainDataRef',
    'getDacReferenceRole',
    'isApplicationSelectionRef',
    'isCompatibilityTargetRef',
    'isDacReference',
    'isPromotionDecisionRef',
    'isRuntimeActivationRef',
    'isRuntimeBindingRef',
    'isRuntimeContractRef',
    'isRuntimeImplementationRef',
    'isSelectedDomainDataRef',
    'refuteExternalBusinessSoRIdentity',
    'verifyDacReferenceIdentity',
  ]);
});

// ------------------------------------------------------------- C36 (positive)

test('a2 C36 (adapter scope): the exact promoted -> selected -> compatible composition journey is separately referrable end to end', () => {
  // Positive path per A2 §11, restricted to the stages whose evidence the
  // landed adapter owns (steps 1-2 refs, step 5 target/implementation refs,
  // steps 7-8 binding/activation refs). Each stage is verified against the
  // SAME exact identity story — and stays a separately referrable role.
  const journey = adoptJourneyRefs();

  verifyDacReferenceIdentity(journey.promotion, {
    semanticIdentity: JOURNEY.semanticIdentity,
    revisionIdentity: JOURNEY.revisionIdentity,
    contentDigest: JOURNEY.contentDigest,
  });
  verifyDacReferenceIdentity(journey.selection, {
    revisionIdentity: JOURNEY.revisionIdentity,
    contentDigest: JOURNEY.contentDigest,
  });
  verifyDacReferenceIdentity(journey.selected, {
    semanticIdentity: JOURNEY.semanticIdentity,
    authorityScope: JOURNEY.authorityScope,
    revisionIdentity: JOURNEY.revisionIdentity,
    contentDigest: JOURNEY.contentDigest,
  });
  verifyDacReferenceIdentity(journey.contract, {
    semanticIdentity: JOURNEY.runtimeContractSemanticIdentity,
    revisionIdentity: JOURNEY.revisionIdentity,
  });
  verifyDacReferenceIdentity(journey.implementation, {
    semanticIdentity: JOURNEY.runtimeImplementationSemanticIdentity,
    revisionIdentity: JOURNEY.revisionIdentity,
  });
  verifyDacReferenceIdentity(journey.target, { revisionIdentity: JOURNEY.revisionIdentity });
  verifyDacReferenceIdentity(journey.binding, { revisionIdentity: JOURNEY.revisionIdentity });
  verifyDacReferenceIdentity(journey.activation, { revisionIdentity: JOURNEY.revisionIdentity });

  // Cross-stage drift still fails closed inside a passing journey: the exact
  // digest proven upstream must not be accepted against another revision.
  assertDacErrorCode(
    () =>
      verifyDacReferenceIdentity(journey.selected, {
        revisionIdentity: 'rev-000043',
        contentDigest: JOURNEY.contentDigest,
      }),
    'IDENTITY_MISMATCH',
    'journey stage revision drift',
  );

  const roles = ROLE_TABLE.map((row) => row.role).sort();
  assert.deepEqual(
    [journey.promotion, journey.selection, journey.selected, journey.contract,
      journey.implementation, journey.target, journey.binding, journey.activation]
      .map((ref) => dac.getDacReferenceRole(ref))
      .sort(),
    roles,
  );
});

// --------------------------------------------------------------------- N16

test('a2 N16 exhaustive: no adopted DAC role — none of the eight — can substitute external Business SoR identity', () => {
  // #305 pinned implementation/contract/selection. A2 N16 owns the result
  // for every role: none of them is external business authority identity.
  const journey = adoptJourneyRefs();
  for (const ref of [
    journey.promotion,
    journey.selection,
    journey.selected,
    journey.contract,
    journey.implementation,
    journey.target,
    journey.binding,
    journey.activation,
  ]) {
    assertDacErrorCode(
      () => refuteExternalBusinessSoRIdentity(ref),
      'EXTERNAL_IDENTITY_FORBIDDEN',
      `role "${dac.getDacReferenceRole(ref)}" as external SoR identity`,
    );
  }
  // A real external identity is none of this adapter's business: the guard
  // refuses only the forbidden substitution, it never fabricates or interprets
  // an external identity itself.
  refuteExternalBusinessSoRIdentity({ externalRecordId: 'sor://erp/invoice/42' });
  refuteExternalBusinessSoRIdentity('sor://erp/customer/7');
  refuteExternalBusinessSoRIdentity(null);
});

// ------------------------------------------------------- PROVISIONAL opaque

test('a2 PROVISIONAL: opaque fields never smuggle authority — forged role/revision/digest keys are preserved but never interpreted', () => {
  const adopted = dac.adoptSelectedDomainDataRef(
    dacInput({
      opaque: {
        role: 'runtime-activation',
        revisionIdentity: 'rev-forged-999',
        contentDigest: 'sha256:forged',
        adapter: 'dac-reference-adapter/1',
        decision: { by: 'composition-layer', why: 'PROVISIONAL field' },
      },
    }) as never,
  );
  // Authoritative fields stay exactly what the adoption constructor decided.
  assert.equal(adopted.role, 'selected-domain-data');
  assert.equal(adopted.revisionIdentity, JOURNEY.revisionIdentity);
  assert.equal(adopted.contentDigest, JOURNEY.contentDigest);
  // The forged keys ride along verbatim (PROVISIONAL preservation) ...
  assert.equal(
    (adopted.opaque as Record<string, unknown>).revisionIdentity,
    'rev-forged-999',
  );
  // ... and identity verification consults ONLY the authoritative fields:
  // an expectation matching the forged opaque value still fails closed.
  assertDacErrorCode(
    () => verifyDacReferenceIdentity(adopted, { revisionIdentity: 'rev-forged-999' }),
    'IDENTITY_MISMATCH',
    'opaque-forged revision must not satisfy verification',
  );
});
