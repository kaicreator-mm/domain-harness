// Issue #327 / DAC v0.0.3 V3-003 — the ten external-operation roles:
// adoption minimums, the exhaustive role-guard matrix, the §3 relationship
// bindings (exactly-1 authority per logical operation, 1 -> 0..n distinct
// attempts, provider-operation continuation proof / preserved ambiguity),
// attempt-identity non-collapse (C67), provider-job != effect record (C68),
// Harness-side identity never substituting external SoR identity (C60/C76),
// the §13 declarative composition handoff boundary, and the source-level
// boundary that the leaf stays dependency-light and execution-redesign-free.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  DAC_V003_PROVIDER_PROOF_PROTOCOL_OWNERSHIP,
  DAC_V003_QUERY_WATCH_RECONCILE_IS_NOT_A_NEW_EFFECT_ATTEMPT,
  DacV003ExternalError,
  adoptDacV003AttemptRef,
  adoptDacV003ExternalAuthorityRef,
  adoptDacV003ExternalObservationRef,
  adoptDacV003IdempotencyIdentityRef,
  adoptDacV003LogicalOperationRef,
  adoptDacV003ProviderOperationRef,
  assertDacV003AttemptIdentitiesDistinct,
  assertDacV003CompositionHandoffIsDeclarative,
  assertDacV003LogicalOperationContinuity,
  expectDacV003AttemptRef,
  expectDacV003AuthoritativeEffectRecordRef,
  expectDacV003ExternalAuthorityRef,
  expectDacV003ExternalObservationRef,
  expectDacV003IdempotencyIdentityRef,
  expectDacV003LogicalOperationRef,
  expectDacV003ProviderOperationRef,
  isDacV003AttemptRef,
  isDacV003AuthoritativeEffectRecordRef,
  isDacV003ExternalAuthorityRef,
  isDacV003ExternalObservationRef,
  isDacV003IdempotencyIdentityRef,
  isDacV003LogicalOperationRef,
  isDacV003ProviderOperationRef,
  refuteDacV003AttemptAsLogicalOperation,
  refuteDacV003HarnessSideIdentityAsExternalAuthority,
  refuteDacV003ProviderOperationAsAuthoritativeEffectRecord,
} from '../../src/dac-v003-external/index.js';
import {
  adoptDacV003RegistryReference,
  isDacV003Reference,
} from '../../src/dac-v003/index.js';
import {
  assertErrorCode,
  attempt,
  effectRecord,
  externalAuthority,
  logicalOperation,
  observation,
  providerOperation,
  provenIdempotency,
  BASELINE,
} from './external-fixture.js';

const srcDir = fileURLToPath(new URL('../../src/dac-v003-external/', import.meta.url));

function sourceText(name: string): string {
  return readFileSync(`${srcDir}${name}`, 'utf8');
}

test('v3-003 ten roles: adoption carries the exact baseline and the P7 envelope', () => {
  const authority = externalAuthority();
  const logical = logicalOperation();
  const att = attempt();
  const provider = providerOperation();
  const obs = observation();
  const record = effectRecord();
  const idem = provenIdempotency();
  assert.equal(authority.reference.role, 'external-authority');
  assert.equal(logical.reference.role, 'logical-operation');
  assert.equal(logical.reference.logicalOperationIdentity, 'logical-op-0001');
  assert.equal(att.reference.role, 'attempt');
  assert.equal(att.reference.logicalOperationIdentity, 'logical-op-0001');
  assert.equal(provider.reference.role, 'provider-operation');
  assert.equal(obs.reference.role, 'external-observation');
  assert.equal(record.reference.role, 'authoritative-effect-record');
  assert.equal(idem.reference.role, 'idempotency-identity');
  for (const wrapper of [authority, logical, att, provider, obs, record, idem]) {
    assert.ok(isDacV003Reference(wrapper.reference));
    assert.deepEqual(wrapper.reference.baseline, BASELINE);
    assert.ok(Object.isFrozen(wrapper));
  }
  assert.equal(
    DAC_V003_PROVIDER_PROOF_PROTOCOL_OWNERSHIP,
    'OPEN_NOT_OWNED',
    'provider-private proof protocols stay OPEN_NOT_OWNED',
  );
  assert.equal(
    DAC_V003_QUERY_WATCH_RECONCILE_IS_NOT_A_NEW_EFFECT_ATTEMPT,
    true,
    'query/watch/reconcile is not a new effect attempt',
  );
});

test('v3-003 role guard matrix: every is/expect accepts only its own minted role', () => {
  const samples = {
    'external-authority': externalAuthority(),
    'logical-operation': logicalOperation(),
    attempt: attempt(),
    'provider-operation': providerOperation(),
    'external-observation': observation(),
    'authoritative-effect-record': effectRecord(),
    'idempotency-identity': provenIdempotency(),
  } as const;
  const guards = {
    'external-authority': {
      is: isDacV003ExternalAuthorityRef,
      expect: expectDacV003ExternalAuthorityRef,
    },
    'logical-operation': {
      is: isDacV003LogicalOperationRef,
      expect: expectDacV003LogicalOperationRef,
    },
    attempt: { is: isDacV003AttemptRef, expect: expectDacV003AttemptRef },
    'provider-operation': {
      is: isDacV003ProviderOperationRef,
      expect: expectDacV003ProviderOperationRef,
    },
    'external-observation': {
      is: isDacV003ExternalObservationRef,
      expect: expectDacV003ExternalObservationRef,
    },
    'authoritative-effect-record': {
      is: isDacV003AuthoritativeEffectRecordRef,
      expect: expectDacV003AuthoritativeEffectRecordRef,
    },
    'idempotency-identity': {
      is: isDacV003IdempotencyIdentityRef,
      expect: expectDacV003IdempotencyIdentityRef,
    },
  } as const;
  for (const [role, sample] of Object.entries(samples)) {
    for (const [otherRole, otherSample] of Object.entries(samples)) {
      const isMatch = role === otherRole;
      assert.equal(
        (guards[role as keyof typeof guards] as { is: (v: unknown) => boolean }).is(
          otherSample,
        ),
        isMatch,
        `is-guard for ${role} on ${otherRole}`,
      );
      if (!isMatch) {
        assert.throws(
          () => {
            (
              guards[role as keyof typeof guards] as {
                expect: (v: unknown) => void;
              }
            ).expect(otherSample);
          },
          (error: unknown) =>
            error instanceof DacV003ExternalError && error.code === 'ROLE_MISMATCH',
          `expect-guard for ${role} must reject ${otherRole}`,
        );
      }
    }
    // A structurally identical forged wrapper never passes.
    const forged = { ...(sample as object) };
    assert.equal(
      (guards[role as keyof typeof guards] as { is: (v: unknown) => boolean }).is(forged),
      false,
      `forged ${role} fails closed`,
    );
  }
});

test('v3-003 logical operation: exactly 1 bound external authority; wrong baseline fails closed', () => {
  const logical = logicalOperation();
  assert.equal(
    logical.externalAuthority.reference.primaryIdentity,
    'payment-sor',
  );
  assert.throws(
    () =>
      adoptDacV003LogicalOperationRef({
        baseline: {
          contract: 'domain-application-contract',
          version: 'v0.0.3',
          semanticFreezeCommit: 'ffffffffffffffffffffffffffffffffffffffff',
          semanticFreezeTree: '163d2a4d9eb5b1659f35df1a0bb73bcaef96cd06',
        },
        runtimeAuthorityScope: 'app/checkout',
        logicalOperationIdentity: 'logical-op-x',
        externalAuthority: externalAuthority(),
        operationSemanticIdentity: 'charge-order',
      }),
    (error: unknown) =>
      error instanceof Error &&
      error.message.includes('UNSUPPORTED_DAC_BASELINE'),
    'wrong baseline is rejected by the shared V3-001 adoption core',
  );
  assertErrorCode(
    () => adoptDacV003ExternalAuthorityRef({
      baseline: BASELINE,
      authorityId: '  ',
      authorityScope: 'payments/truth',
    }),
    'INVALID_EXTERNAL_BINDING',
    'empty authority id fails',
  );
});

test('v3-003 attempt: identity may never collapse into the logical operation (C67)', () => {
  const logical = logicalOperation();
  assertErrorCode(
    () =>
      adoptDacV003AttemptRef({
        baseline: BASELINE,
        deliveryAuthorityScope: 'app/checkout/integration',
        attemptIdentity: 'logical-op-0001',
        logicalOperation: logical,
        evidenceClass: 'dispatch-outcome-ambiguous',
      }),
    'IDENTITY_MISMATCH',
    'attempt identity == logical operation identity fails closed',
  );
  assertErrorCode(
    () =>
      adoptDacV003AttemptRef({
        baseline: BASELINE,
        deliveryAuthorityScope: 'app/checkout/integration',
        attemptIdentity: 'attempt-0001',
        logicalOperation: logical,
        evidenceClass: 'no-such-class',
      } as never),
    'INVALID_EXTERNAL_BINDING',
    'unknown evidence class fails closed',
  );
  const a1 = attempt({ attemptIdentity: 'attempt-A', logicalOperation: logical });
  const a2 = attempt({ attemptIdentity: 'attempt-B', logicalOperation: logical });
  assertDacV003AttemptIdentitiesDistinct([a1, a2]);
  assertErrorCode(
    () => assertDacV003AttemptIdentitiesDistinct([a1, a1]),
    'IDENTITY_MISMATCH',
    'duplicate attempt identity for one logical operation fails (replay overwrites nothing)',
  );
  // Cross-logical-operation reuse of one attempt identity is also forbidden.
  const other = logicalOperation({ logicalOperationIdentity: 'logical-op-0002' });
  const a3 = attempt({ attemptIdentity: 'attempt-A', logicalOperation: other });
  assertErrorCode(
    () => assertDacV003AttemptIdentitiesDistinct([a1, a3]),
    'IDENTITY_MISMATCH',
    'attempt identity reused across logical operations fails',
  );
  assert.throws(
    () => refuteDacV003AttemptAsLogicalOperation(a1),
    (error: unknown) =>
      error instanceof DacV003ExternalError && error.code === 'ROLE_MISMATCH',
  );
});

test('v3-003 provider operation: continuation requires proof; ambiguity is preserved, never merged (§6)', () => {
  assertErrorCode(
    () =>
      adoptDacV003ProviderOperationRef({
        baseline: BASELINE,
        externalAuthority: externalAuthority(),
        providerOperationId: 'provider-job-78',
        continuationOfProviderOperationId: 'provider-job-77',
      }),
    'IDENTITY_MISMATCH',
    'same provider operation across retries without proof fails closed',
  );
  assertErrorCode(
    () =>
      adoptDacV003ProviderOperationRef({
        baseline: BASELINE,
        externalAuthority: externalAuthority(),
        providerOperationId: 'provider-job-77',
        continuationOfProviderOperationId: 'provider-job-77',
      }),
    'IDENTITY_MISMATCH',
    'self-continuation is rejected',
  );
  const ambiguous = adoptDacV003ProviderOperationRef({
    baseline: BASELINE,
    externalAuthority: externalAuthority(),
    providerOperationId: 'provider-job-78',
    preservedAmbiguityWithProviderOperationIds: ['provider-job-77'],
  });
  assert.deepEqual(ambiguous.preservedAmbiguityWithProviderOperationIds, [
    'provider-job-77',
  ]);
  // Cross-authority correlation fails closed.
  const otherAuthority = externalAuthority({
    authorityId: 'ledger-sor',
    authorityScope: 'ledger/truth',
  });
  assertErrorCode(
    () =>
      adoptDacV003ProviderOperationRef({
        baseline: BASELINE,
        externalAuthority: otherAuthority,
        providerOperationId: 'provider-job-99',
        correlatedLogicalOperation: logicalOperation(),
      }),
    'CORRELATION_CONFLICT',
    'provider operation cannot correlate a logical operation of another authority',
  );
  // C68: provider job never substitutes the authoritative effect record.
  const record = effectRecord();
  refuteDacV003ProviderOperationAsAuthoritativeEffectRecord(record);
  expectDacV003AuthoritativeEffectRecordRef(record);
});

test('v3-003 observation: exactly-1 authority/logical-operation correlation fails closed on drift (§8)', () => {
  const otherAuthority = externalAuthority({
    authorityId: 'ledger-sor',
    authorityScope: 'ledger/truth',
  });
  assertErrorCode(
    () =>
      adoptDacV003ExternalObservationRef({
        baseline: BASELINE,
        observationIdentity: 'obs-x',
        externalAuthority: otherAuthority,
        logicalOperation: logicalOperation(),
        observedClass: 'UNKNOWN_AMBIGUOUS',
        producer: 'adapter',
      }),
    'CORRELATION_CONFLICT',
    'observation bound to a logical operation of another authority fails',
  );
  assertErrorCode(
    () =>
      adoptDacV003ExternalObservationRef({
        baseline: BASELINE,
        observationIdentity: 'obs-x',
        externalAuthority: externalAuthority(),
        logicalOperation: logicalOperation(),
        observedClass: 'DEFINITELY_COMMITTED',
        producer: 'adapter',
      } as never),
    'INVALID_EXTERNAL_BINDING',
    'unknown outcome class fails closed',
  );
});

test('v3-003 logical operation continuity: changed intent requires a NEW logical operation (§4 rule 2)', () => {
  const logical = logicalOperation();
  assertDacV003LogicalOperationContinuity(logical, {
    externalAuthority: logical.externalAuthority,
    operationSemanticIdentity: 'charge-order',
    semanticTargetRefs: [],
  });
  assertErrorCode(
    () =>
      assertDacV003LogicalOperationContinuity(logical, {
        externalAuthority: logical.externalAuthority,
        operationSemanticIdentity: 'refund-order',
        semanticTargetRefs: [],
      }),
    'IDENTITY_MISMATCH',
    'changed command semantics cannot continue the same logical operation',
  );
  assertErrorCode(
    () =>
      assertDacV003LogicalOperationContinuity(logical, {
        externalAuthority: externalAuthority({
          authorityId: 'ledger-sor',
          authorityScope: 'ledger/truth',
        }),
        operationSemanticIdentity: 'charge-order',
        semanticTargetRefs: [],
      }),
    'IDENTITY_MISMATCH',
    'changed external authority creates a new logical operation',
  );
});

test('v3-003 idempotency binding: one identity, one logical effect (C66 binding side)', () => {
  const logical = logicalOperation({ idempotencyIdentity: provenIdempotency() });
  assert.ok(logical.idempotencyIdentity !== undefined);
  assertErrorCode(
    () =>
      adoptDacV003LogicalOperationRef({
        baseline: BASELINE,
        runtimeAuthorityScope: 'app/checkout',
        logicalOperationIdentity: 'logical-op-0003',
        externalAuthority: externalAuthority(),
        operationSemanticIdentity: 'charge-order',
        idempotencyIdentity: provenIdempotency({
          boundLogicalEffectSemanticIdentity: 'refund-order',
        }),
      }),
    'IDEMPOTENCY_REUSE_FORBIDDEN',
    'an idempotency identity bound to a different semantic effect cannot bind this operation',
  );
  assertErrorCode(
    () =>
      adoptDacV003IdempotencyIdentityRef({
        baseline: BASELINE,
        idempotencyKey: 'idem-key-2',
        issuer: 'payment-sor',
        promisedDeduplicationScope: 'payments/truth:charge-order',
        externalAuthority: externalAuthority(),
        boundLogicalEffectSemanticIdentity: 'charge-order',
        equivalenceRule: {
          kind: 'semantic',
          establishedFromEvidence: true,
        },
      }),
    'INVALID_EXTERNAL_BINDING',
    'an evidence-established equivalence rule must name the rule identity',
  );
});

test('v3-003 C60/C76: Harness-side v0.0.3 identity never substitutes external SoR identity', () => {
  const harnessSide = adoptDacV003RegistryReference('runtime-implementation', {
    baseline: BASELINE,
    authorityScope: 'runtime/env',
    primaryIdentity: 'node-runtime-1',
  });
  assert.throws(
    () => refuteDacV003HarnessSideIdentityAsExternalAuthority(harnessSide),
    (error: unknown) =>
      error instanceof DacV003ExternalError && error.code === 'EXTERNAL_IDENTITY_FORBIDDEN',
  );
  // The genuine external authority passes the refute untouched.
  refuteDacV003HarnessSideIdentityAsExternalAuthority(externalAuthority());
  // And other minted role wrappers are rejected as SoR identity too.
  assert.throws(
    () => refuteDacV003HarnessSideIdentityAsExternalAuthority(logicalOperation()),
    (error: unknown) =>
      error instanceof DacV003ExternalError && error.code === 'EXTERNAL_IDENTITY_FORBIDDEN',
  );
});

test('v3-003 §13 composition handoff: only declarative material passes, live operation state fails closed', () => {
  const authority = externalAuthority();
  const declarativeHarnessRef = adoptDacV003RegistryReference('capability-requirement', {
    baseline: BASELINE,
    authorityScope: 'composition/example-app',
    primaryIdentity: 'cap-req-1',
  });
  assertDacV003CompositionHandoffIsDeclarative([
    authority,
    declarativeHarnessRef,
    { foreign: true },
  ]);
  for (const live of [
    logicalOperation(),
    attempt(),
    providerOperation(),
    observation(),
    effectRecord(),
    provenIdempotency(),
  ]) {
    assert.throws(
      () => assertDacV003CompositionHandoffIsDeclarative([authority, live]),
      (error: unknown) =>
        error instanceof DacV003ExternalError &&
        error.code === 'COMPOSITION_LIVE_OPERATION_STATE_FORBIDDEN',
      `live ${live.reference.role} must not enter the composition handoff`,
    );
  }
  // A bare adopted envelope of a live role equally fails (no wrapper needed).
  const bareLiveEnvelope = adoptDacV003RegistryReference('logical-operation', {
    baseline: BASELINE,
    authorityScope: 'app/checkout',
    primaryIdentity: 'logical-op-bare',
  });
  assert.throws(
    () => assertDacV003CompositionHandoffIsDeclarative([bareLiveEnvelope]),
    (error: unknown) =>
      error instanceof DacV003ExternalError &&
      error.code === 'COMPOSITION_LIVE_OPERATION_STATE_FORBIDDEN',
  );
});

test('v3-003 boundary: dependency-light leaf — no store/engine/journal/execution redesign', () => {
  for (const name of ['contracts.ts', 'guards.ts', 'evaluate.ts', 'index.ts']) {
    const text = sourceText(name);
    const imports = [...text.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1] ?? '');
    for (const specifier of imports) {
      assert.ok(
        specifier.startsWith('./') ||
          specifier === '../dac-v003/contracts.js' ||
          specifier === '../dac-v003/guards.js' ||
          specifier === '../external-authority/contracts.js' ||
          specifier === '../external-authority/guards.js',
        `${name} has a non-leaf import "${specifier}"`,
      );
    }
    assert.ok(!/from\s+['"]\.\.\/dac\//.test(text), `${name} must not import the v0.0.2 DAC adapter`);
    assert.ok(!/from\s+['"]\.\.\/observation/.test(text), `${name} must not import #312 observation`);
    assert.ok(!/from\s+['"]\.\.\/control/.test(text), `${name} must not import #313 control`);
    assert.ok(
      !/\b(DurableExecutionStore|RuntimeStore|beginEffect|completeEffect|transitionRequest)\b/.test(
        text.replace(/^[/ ]*\*.*$/gm, '').replace(/^\s*\/\/.*$/gm, ''),
      ),
      `${name} must not name any runtime store/journal mutation channel`,
    );
  }
});

test('v3-003 boundary: no runtime authority channel or local-cause inference on the surface', () => {
  const surface = sourceText('index.ts') + sourceText('guards.ts') + sourceText('evaluate.ts');
  assert.ok(surface.includes('LOCAL_CAUSE_FORBIDDEN'));
  assert.ok(surface.includes('runtimeExecutionAuthority'));
  // Every minted derived record carries no runtime execution authority.
  assert.ok(!/(Store|Persist|Transition|Admit|Mutate|Execute)\w*\(/.test(surface));
  // No function invents remote truth from local material.
  assert.ok(!/(infer|assume|presume)\w*RemoteTruth/i.test(surface));
});
