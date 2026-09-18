import type { Sha256Port } from '../../v2/contracts/host.js';
import type { WorkflowAddress } from '../../v2/contracts/workflow.js';

export interface EffectIdentitySeed {
  target: WorkflowAddress;
  sourceMessageId: string;
  workflowStepIdentity: string;
  stepVisit: number;
}

export class InvalidEffectIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidEffectIdentityError';
  }
}

function assertNonEmpty(label: string, value: string): void {
  if (value.trim().length === 0) {
    throw new InvalidEffectIdentityError(`${label} must be non-empty`);
  }
}

export function serializeEffectIdentity(seed: EffectIdentitySeed): string {
  assertNonEmpty('target.workflowId', seed.target.workflowId);
  assertNonEmpty('target.instanceKey', seed.target.instanceKey);
  assertNonEmpty('sourceMessageId', seed.sourceMessageId);
  assertNonEmpty('workflowStepIdentity', seed.workflowStepIdentity);

  if (!Number.isSafeInteger(seed.stepVisit) || seed.stepVisit < 0) {
    throw new InvalidEffectIdentityError('stepVisit must be a non-negative safe integer');
  }

  return JSON.stringify([
    'domain-harness-effect-v2',
    seed.target.workflowId,
    seed.target.instanceKey,
    seed.sourceMessageId,
    seed.workflowStepIdentity,
    seed.stepVisit,
  ]);
}

export async function deriveEffectId(
  sha256: Sha256Port,
  seed: EffectIdentitySeed,
): Promise<string> {
  const digest = await sha256.digestUtf8(serializeEffectIdentity(seed));
  if (digest.trim().length === 0) {
    throw new InvalidEffectIdentityError('sha256 binding returned an empty digest');
  }
  return `effect:v2:${digest}`;
}
