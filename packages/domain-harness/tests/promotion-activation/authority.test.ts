import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import type { CandidateValidationResult } from '../../src/candidate/contracts.js';
import { computeCanonicalJsonDigest, type Sha256Port } from '../../src/contracts/identity.js';
import type { JsonValue } from '../../src/contracts/json.js';
import type { GovernanceBaselineAuthorityBinding, GovernanceBaselineIdentity } from '../../src/governance/contracts.js';
import {
  MemoryPromotedArtifactStore,
  PromotedArtifactRegistry,
  createPromotedArtifactBody,
  type PromotedArtifactIdentity,
} from '../../src/promoted-artifact/index.js';
import {
  MemoryAuthorityAuditStore,
  PromotionActivationAuthority,
  PromotionActivationAuthorityError,
  type ActivationAuthorityRequest,
  type FreshSelectionActivationGrant,
  type FreshSelectionActivationPort,
  type GovernanceTransitionRevalidation,
  type PromotionAuthorityRequest,
} from '../../src/promotion-activation/index.js';

const sha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

const b1: GovernanceBaselineIdentity = {
  domainId: 'orders', governanceId: 'orders-governance', schemaVersion: 'governance-v1',
  version: 'B1', contentDigest: 'governance-content-b1',
};
const b2: GovernanceBaselineIdentity = {
  domainId: 'orders', governanceId: 'orders-governance', schemaVersion: 'governance-v1',
  version: 'B2', contentDigest: 'governance-content-b2',
};

function authority(baseline: GovernanceBaselineIdentity = b1): GovernanceBaselineAuthorityBinding {
  return {
    domainId: 'orders',
    packageId: baseline === b1 ? 'pkg-orders-b1' : 'pkg-orders-b2',
    domainIntelligenceContentDigest: baseline === b1 ? 'cdi-orders-b1' : 'cdi-orders-b2',
    governanceBaseline: { ...baseline },
  };
}

const semanticMaterial: JsonValue = { nodes: ['review', 'approved'], transition: 'APPROVE' };

async function validationFor(
  targetAuthority: GovernanceBaselineAuthorityBinding,
  material: JsonValue = semanticMaterial,
): Promise<CandidateValidationResult> {
  return {
    ok: true,
    identity: {
      candidateKind: 'workflow',
      candidateId: 'candidate:orders-review',
      candidateContentDigest: await computeCanonicalJsonDigest(material, sha256),
      validatorContractVersion: 'candidate-validator-v1',
      governanceBaseline: { ...targetAuthority.governanceBaseline },
    },
    grantsExecutionPermission: false,
  };
}

function operatorAction(action: 'promote' | 'activate', actionId = `${action}:orders-review:1`) {
  return {
    action,
    actionId,
    actor: { kind: 'human-operator' as const, actorId: 'user:42', operatorId: 'operator:release-manager' },
    recordedAt: '2026-09-21T02:00:00.000Z',
  };
}

function evaluation(target: GovernanceBaselineIdentity = b1, hardInvariantsSatisfied = true) {
  return {
    evaluationId: `evaluation:${target.version ?? target.contentDigest}`,
    evaluatedUnder: {
      domainId: target.domainId,
      governanceId: target.governanceId,
      schemaVersion: target.schemaVersion,
      contentDigest: target.contentDigest,
    },
    verdict: 'allow' as const,
    hardInvariantsSatisfied,
  };
}

function transition(
  from: GovernanceBaselineIdentity = b1,
  to: GovernanceBaselineIdentity = b2,
  evaluatedUnder: GovernanceBaselineIdentity = from,
): GovernanceTransitionRevalidation {
  return {
    revalidationId: `governance-revalidation:${from.contentDigest}->${to.contentDigest}`,
    fromBaseline: { domainId: from.domainId, governanceId: from.governanceId, schemaVersion: from.schemaVersion, contentDigest: from.contentDigest },
    toBaseline: { domainId: to.domainId, governanceId: to.governanceId, schemaVersion: to.schemaVersion, contentDigest: to.contentDigest },
    evaluatedUnder: { domainId: evaluatedUnder.domainId, governanceId: evaluatedUnder.governanceId, schemaVersion: evaluatedUnder.schemaVersion, contentDigest: evaluatedUnder.contentDigest },
    verdict: 'allow',
  };
}

class RecordingActivationPort implements FreshSelectionActivationPort {
  readonly runningPins = new Map<string, PromotedArtifactIdentity>();
  freshSelection?: FreshSelectionActivationGrant;

  async publishFreshSelection(grant: FreshSelectionActivationGrant): Promise<void> {
    this.freshSelection = structuredClone(grant);
  }
}

function makeSystem() {
  const registry = new PromotedArtifactRegistry(new MemoryPromotedArtifactStore(), sha256);
  const auditStore = new MemoryAuthorityAuditStore();
  const activationPort = new RecordingActivationPort();
  const service = new PromotionActivationAuthority(registry, auditStore, activationPort, sha256);
  return { registry, auditStore, activationPort, service };
}

async function promotionRequest(
  targetAuthority = authority(b1),
  overrides: Partial<PromotionAuthorityRequest> = {},
): Promise<PromotionAuthorityRequest> {
  return {
    action: operatorAction('promote'),
    artifactId: 'orders-review',
    version: targetAuthority.governanceBaseline.contentDigest === b1.contentDigest ? '1.0.0' : '2.0.0',
    validation: await validationFor(targetAuthority),
    authorityBinding: targetAuthority,
    semanticMaterial,
    evaluation: evaluation(targetAuthority.governanceBaseline),
    ...overrides,
  };
}

async function promoteB1(system = makeSystem()) {
  const result = await system.service.promote(await promotionRequest());
  return { ...system, promoted: result };
}

async function activationRequest(
  artifact: PromotedArtifactIdentity,
  targetAuthority = authority(b1),
  overrides: Partial<ActivationAuthorityRequest> = {},
): Promise<ActivationAuthorityRequest> {
  return {
    action: operatorAction('activate'),
    artifactId: artifact.artifactId,
    version: targetAuthority.governanceBaseline.contentDigest === b1.contentDigest ? '1.0.0' : '2.0.0',
    expectedArtifact: artifact,
    authorityBinding: targetAuthority,
    evaluation: evaluation(targetAuthority.governanceBaseline),
    ...overrides,
  };
}

async function expectAuthorityError(promise: Promise<unknown>, code: PromotionActivationAuthorityError['code']) {
  await assert.rejects(
    promise,
    (error: unknown) => error instanceof PromotionActivationAuthorityError && error.code === code,
  );
}

test('T-015 matrix 01: proposal cannot promote', async () => {
  const { service } = makeSystem();
  const request = await promotionRequest();
  const forged = { ...request, action: { ...request.action, action: 'proposal' } } as unknown as PromotionAuthorityRequest;
  await expectAuthorityError(service.promote(forged), 'INVALID_AUTHORITY_ACTION');
});

test('T-015 matrix 02: validation cannot promote', async () => {
  const { service } = makeSystem();
  const request = await promotionRequest();
  const forged = { ...request, action: { ...request.action, action: 'validate' } } as unknown as PromotionAuthorityRequest;
  await expectAuthorityError(service.promote(forged), 'INVALID_AUTHORITY_ACTION');
});

test('T-015 matrix 03: promotion requires explicit human/operator authority', async () => {
  const { service } = makeSystem();
  const request = await promotionRequest();
  const forged = { ...request, action: { ...request.action, actor: { kind: 'candidate', actorId: 'candidate:1', operatorId: 'none' } } } as unknown as PromotionAuthorityRequest;
  await expectAuthorityError(service.promote(forged), 'HUMAN_OPERATOR_AUTHORITY_REQUIRED');
});

test('T-015 matrix 04: promotion does not activate', async () => {
  const system = makeSystem();
  await system.service.promote(await promotionRequest());
  assert.equal(system.activationPort.freshSelection, undefined);
});

test('T-015 matrix 05: activation requires a separate explicit authority action', async () => {
  const { service, promoted } = await promoteB1();
  const request = await activationRequest(promoted.promoted.body.identity);
  const forged = { ...request, action: { ...request.action, action: 'promote' } } as unknown as ActivationAuthorityRequest;
  await expectAuthorityError(service.activate(forged), 'INVALID_AUTHORITY_ACTION');
});

test('T-015 matrix 06: activation of non-promoted artifact is rejected', async () => {
  const { service } = makeSystem();
  const body = await createPromotedArtifactBody({ artifactId: 'missing', semanticMaterial }, sha256);
  await expectAuthorityError(
    service.activate({ ...(await activationRequest(body.identity)), artifactId: 'missing', version: '9.9.9' }),
    'PROMOTED_AUTHORITY_REQUIRED',
  );
});

test('T-015 matrix 07: stale validation is rejected', async () => {
  const { service } = makeSystem();
  const request = await promotionRequest(authority(b2));
  const stale = await validationFor(authority(b1));
  await expectAuthorityError(service.promote({ ...request, validation: stale }), 'STALE_VALIDATION');
});

test('T-015 matrix 08: incompatible Governance Baseline is rejected', async () => {
  const { service } = makeSystem();
  const request = await promotionRequest(authority(b1));
  await expectAuthorityError(
    service.promote({ ...request, evaluation: evaluation(b2) }),
    'GOVERNANCE_BASELINE_MISMATCH',
  );
});

test('T-015 matrix 09: B1 promoted artifact under B2 requires B2 revalidation/promotion', async () => {
  const system = await promoteB1();
  const b2Authority = authority(b2);
  await expectAuthorityError(
    system.service.activate(await activationRequest(system.promoted.promoted.body.identity, b2Authority, {
      preChangeGovernanceBaseline: b1,
      governanceTransition: transition(),
    })),
    'PROMOTED_AUTHORITY_REQUIRED',
  );
});

test('T-015 matrix 10: B2 cannot self-authorize its own governance transition', async () => {
  const { service } = makeSystem();
  await expectAuthorityError(
    service.promote(await promotionRequest(authority(b2), {
      preChangeGovernanceBaseline: b1,
      governanceTransition: transition(b1, b2, b2),
    })),
    'GOVERNANCE_SELF_AUTHORIZATION_FORBIDDEN',
  );
});

test('T-015 matrix 11: exact pre-change B1 authority governs B1 -> B2 decision', async () => {
  const system = makeSystem();
  const promoted = await system.service.promote(await promotionRequest(authority(b2), {
    preChangeGovernanceBaseline: b1,
    governanceTransition: transition(b1, b2, b1),
  }));
  assert.equal(promoted.audit.governance.transition?.evaluatedUnder.contentDigest, b1.contentDigest);
});

test('T-015 matrix 12: activation changes future fresh selection only', async () => {
  const system = await promoteB1();
  const result = await system.service.activate(await activationRequest(system.promoted.promoted.body.identity));
  assert.equal(system.activationPort.freshSelection?.artifact.contentDigest, system.promoted.promoted.body.identity.contentDigest);
  assert.equal(result.audit.action, 'activate');
});

test('T-015 matrix 13: an existing running/pinned instance remains unchanged', async () => {
  const system = await promoteB1();
  const oldPin = await createPromotedArtifactBody({ artifactId: 'orders-review', semanticMaterial: { nodes: ['old-running'] } }, sha256);
  system.activationPort.runningPins.set('run:1', oldPin.identity);
  await system.service.activate(await activationRequest(system.promoted.promoted.body.identity));
  assert.deepEqual(system.activationPort.runningPins.get('run:1'), oldPin.identity);
});

test('T-015 matrix 14: LLM/Harness automatic promotion is rejected', async () => {
  for (const kind of ['llm', 'harness'] as const) {
    const { service } = makeSystem();
    const request = await promotionRequest();
    const forged = { ...request, action: { ...request.action, actor: { kind, actorId: `${kind}:1`, operatorId: 'none' } } } as unknown as PromotionAuthorityRequest;
    await expectAuthorityError(service.promote(forged), 'HUMAN_OPERATOR_AUTHORITY_REQUIRED');
  }
});

test('T-015 matrix 15: LLM/Harness automatic activation is rejected', async () => {
  for (const kind of ['llm', 'harness'] as const) {
    const system = await promoteB1();
    const request = await activationRequest(system.promoted.promoted.body.identity);
    const forged = { ...request, action: { ...request.action, actor: { kind, actorId: `${kind}:1`, operatorId: 'none' } } } as unknown as ActivationAuthorityRequest;
    await expectAuthorityError(system.service.activate(forged), 'HUMAN_OPERATOR_AUTHORITY_REQUIRED');
  }
});

test('T-015 matrix 16: stale/conflicting audit action identity is rejected', async () => {
  const system = makeSystem();
  const first = await promotionRequest();
  await system.service.promote(first);
  const changed = await promotionRequest(authority(b1), { version: '1.0.1' });
  await expectAuthorityError(system.service.promote(changed), 'AUDIT_IDENTITY_CONFLICT');
});

test('T-015 matrix 17: audit identity deterministically binds actor/action/artifact/package/governance tuple', async () => {
  const firstSystem = makeSystem();
  const secondSystem = makeSystem();
  const first = await firstSystem.service.promote(await promotionRequest());
  const second = await secondSystem.service.promote(await promotionRequest());
  assert.equal(first.audit.auditId, second.audit.auditId);
  assert.equal(first.audit.actor.operatorId, 'operator:release-manager');
  assert.equal(first.audit.artifact.contentDigest, first.promoted.body.identity.contentDigest);
  assert.equal(first.audit.package.packageId, authority(b1).packageId);
  assert.equal(first.audit.governance.targetBaseline.contentDigest, b1.contentDigest);
});

test('T-015 matrix 18: human override cannot weaken hard-invariant/governance requirements', async () => {
  const { service } = makeSystem();
  const request = await promotionRequest(authority(b1), { evaluation: evaluation(b1, false) });
  const forged = { ...request, overrideHardInvariants: true } as PromotionAuthorityRequest & { overrideHardInvariants: true };
  await expectAuthorityError(service.promote(forged), 'HARD_INVARIANT_REJECTED');
});
