// Issue #327 / DAC v0.0.3 V3-003 shared test fixture: builders for the ten
// adopted role wrappers (through the real public surface — no forged
// objects) and for genuine #309 upstream evidence records, so every focused
// test file exercises the same fail-closed paths consumers use.
import {
  DacV003ExternalError,
  type DacV003AttemptRef,
  type DacV003AuthoritativeEffectRecordRef,
  type DacV003ExternalAuthorityRef,
  type DacV003ExternalObservationRef,
  type DacV003IdempotencyIdentityRef,
  type DacV003LogicalOperationRef,
  type DacV003ProviderOperationRef,
  type DacV003RecoveryCapabilityRef,
  type DacV003ExternalCapabilityRef,
  adoptDacV003AttemptRef,
  adoptDacV003AuthoritativeEffectRecordRef,
  adoptDacV003ExternalAuthorityRef,
  adoptDacV003ExternalObservationRef,
  adoptDacV003IdempotencyIdentityRef,
  adoptDacV003LogicalOperationRef,
  adoptDacV003ProviderOperationRef,
  declareDacV003ExternalCapability,
  declareDacV003RecoveryCapability,
} from '../../src/dac-v003-external/index.js';
import type { DacV003ExternalOutcomeClass } from '../../src/dac-v003-external/index.js';
import {
  DAC_V003_BASELINE,
  adoptDacV003RegistryReference,
} from '../../src/dac-v003/index.js';
import { EXTERNAL_AUTHORITY_BASELINE } from '../../src/external-authority/index.js';
import {
  adoptExternalAuthorityRef as adoptV002ExternalAuthorityRef,
  adoptExternalObservationEvidence as adoptV002ObservationEvidence,
  adoptExternalReconciliationOutcome as adoptV002ReconciliationOutcome,
  adoptExternalReconciliationRef as adoptV002ReconciliationRef,
  adoptRuntimeLogicalOperationRef as adoptV002RuntimeLogicalOperationRef,
  correlateExternalEffect,
} from '../../src/external-authority/index.js';
import type {
  ExternalObservationClassification,
  ExternalObservationEvidence,
  ExternalReconciliationOutcome,
} from '../../src/external-authority/index.js';

export const BASELINE = { ...DAC_V003_BASELINE } as const;
export const V002_BASELINE = { ...EXTERNAL_AUTHORITY_BASELINE } as const;

export function externalAuthority(
  overrides: Record<string, unknown> = {},
): DacV003ExternalAuthorityRef {
  return adoptDacV003ExternalAuthorityRef({
    baseline: BASELINE,
    authorityId: 'payment-sor',
    authorityScope: 'payments/truth',
    ...overrides,
  } as never);
}

export function logicalOperation(
  overrides: Record<string, unknown> = {},
): DacV003LogicalOperationRef {
  const defaults: Record<string, unknown> = {
    baseline: BASELINE,
    runtimeAuthorityScope: 'app/checkout',
    logicalOperationIdentity: 'logical-op-0001',
    externalAuthority: externalAuthority(),
    operationSemanticIdentity: 'charge-order',
  };
  return adoptDacV003LogicalOperationRef({
    ...defaults,
    ...overrides,
  } as never);
}

export function attempt(
  overrides: Record<string, unknown> = {},
): DacV003AttemptRef {
  const defaults: Record<string, unknown> = {
    baseline: BASELINE,
    deliveryAuthorityScope: 'app/checkout/integration',
    attemptIdentity: 'attempt-0001',
    logicalOperation: logicalOperation(),
    evidenceClass: 'dispatch-outcome-ambiguous',
  };
  return adoptDacV003AttemptRef({
    ...defaults,
    ...overrides,
  } as never);
}

export function providerOperation(
  overrides: Record<string, unknown> = {},
): DacV003ProviderOperationRef {
  const defaults: Record<string, unknown> = {
    baseline: BASELINE,
    externalAuthority: externalAuthority(),
    providerOperationId: 'provider-job-77',
  };
  return adoptDacV003ProviderOperationRef({
    ...defaults,
    ...overrides,
  } as never);
}

export function observation(
  overrides: Record<string, unknown> = {},
): DacV003ExternalObservationRef {
  const defaults: Record<string, unknown> = {
    baseline: BASELINE,
    observationIdentity: 'obs-0001',
    externalAuthority: externalAuthority(),
    logicalOperation: logicalOperation(),
    observedClass: 'UNKNOWN_AMBIGUOUS',
    producer: 'payment-adapter/query',
  };
  return adoptDacV003ExternalObservationRef({
    ...defaults,
    ...overrides,
  } as never);
}

export function effectRecord(
  overrides: Record<string, unknown> = {},
): DacV003AuthoritativeEffectRecordRef {
  const defaults: Record<string, unknown> = {
    baseline: BASELINE,
    externalAuthority: externalAuthority(),
    effectRecordIdentity: 'record-0001',
  };
  return adoptDacV003AuthoritativeEffectRecordRef({
    ...defaults,
    ...overrides,
  } as never);
}

export function provenIdempotency(
  overrides: Record<string, unknown> = {},
): DacV003IdempotencyIdentityRef {
  const defaults: Record<string, unknown> = {
    baseline: BASELINE,
    idempotencyKey: 'idem-key-1',
    issuer: 'payment-sor',
    promisedDeduplicationScope: 'payments/truth:charge-order',
    externalAuthority: externalAuthority(),
    boundLogicalEffectSemanticIdentity: 'charge-order',
    equivalenceRule: {
      kind: 'semantic' as const,
      ruleIdentity: 'payment-sor/semantic-equality@1',
      establishedFromEvidence: true,
    },
    guaranteeEvidenceRefs: [
      adoptDacV003RegistryReference('conformance-evidence', {
        baseline: BASELINE,
        authorityScope: 'payment-sor/idempotency-contract',
        primaryIdentity: 'idem-contract-record',
      }),
    ],
  };
  return adoptDacV003IdempotencyIdentityRef({
    ...defaults,
    ...overrides,
  } as never);
}

export function recoveryCapability(
  overrides: Record<string, unknown> = {},
): DacV003RecoveryCapabilityRef {
  const defaults: Record<string, unknown> = {
    baseline: BASELINE,
    capabilityFamily: 'query-status',
    externalAuthority: externalAuthority(),
    capabilityIdentity: 'cap-query-1',
    issuer: 'payment-adapter',
    applicabilityConditions: ['provider-job-id-known'],
  };
  return declareDacV003RecoveryCapability({
    ...defaults,
    ...overrides,
  } as never);
}

export function externalCapability(
  overrides: Record<string, unknown> = {},
): DacV003ExternalCapabilityRef {
  const defaults: Record<string, unknown> = {
    baseline: BASELINE,
    capabilityFamily: 'idempotent-replay',
    externalAuthority: externalAuthority(),
    capabilityIdentity: 'cap-idem-1',
    issuer: 'payment-adapter',
  };
  return declareDacV003ExternalCapability({
    ...defaults,
    ...overrides,
  } as never);
}

interface V002CorrelationOptions {
  readonly effectId?: string;
  readonly authorityId?: string;
  readonly authorityScope?: string;
}

function v002Correlation(options: V002CorrelationOptions = {}) {
  return correlateExternalEffect({
    correlationId: 'corr-0001',
    runtimeOperation: adoptV002RuntimeLogicalOperationRef({
      baseline: V002_BASELINE,
      effectId: options.effectId ?? 'logical-op-0001',
    }),
    externalAuthority: adoptV002ExternalAuthorityRef({
      baseline: V002_BASELINE,
      authorityId: options.authorityId ?? 'payment-sor',
      authorityScope: options.authorityScope ?? 'payments/truth',
    }),
  });
}

/**
 * A GENUINE #309 (v0.0.2) observation evidence record for the given
 * classification, correlated to effectId `logical-op-0001` under authority
 * `payment-sor` / scope `payments/truth` — the exact identities the default
 * v0.0.3 builders above use.
 */
export function v002ObservationEvidence(
  classification: ExternalObservationClassification,
  options: V002CorrelationOptions = {},
): ExternalObservationEvidence {
  return adoptV002ObservationEvidence({
    correlation: v002Correlation(options),
    classification,
    rawStatement: `provider statement (${classification})`,
  });
}

/**
 * A GENUINE #309 (v0.0.2) reconciliation OUTCOME record for a decisive
 * result, carrying the decisive observation basis the #309 surface itself
 * requires (commit => commit-observed; non-commit =>
 * known-failed-before-commit).
 */
export function v002ReconciliationOutcome(
  result: 'RECONCILED_COMMITTED' | 'RECONCILED_NOT_COMMITTED',
  options: V002CorrelationOptions = {},
): ExternalReconciliationOutcome {
  const correlation = v002Correlation(options);
  const decisive = v002ObservationEvidence(
    result === 'RECONCILED_COMMITTED' ? 'commit-observed' : 'known-failed-before-commit',
    options,
  );
  return adoptV002ReconciliationOutcome({
    correlation,
    reconciliation: adoptV002ReconciliationRef({
      baseline: V002_BASELINE,
      reconciliationId: 'recon-309-0001',
    }),
    result,
    basis: [decisive],
  });
}

export function assertErrorCode(
  fn: () => void,
  code: string,
  label: string,
): void {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  if (!(caught instanceof DacV003ExternalError)) {
    throw new Error(
      `${label}: expected DacV003ExternalError, got ${
        caught instanceof Error ? `${caught.name}: ${caught.message}` : String(caught)
      }`,
    );
  }
  if (caught.code !== code) {
    throw new Error(`${label}: expected code ${code}, got ${caught.code}`);
  }
}

export type { DacV003ExternalOutcomeClass };
