export class InvalidEffectIdentityError extends Error {
    constructor(message) {
        super(message);
        this.name = 'InvalidEffectIdentityError';
    }
}
function assertNonEmpty(label, value) {
    if (value.trim().length === 0) {
        throw new InvalidEffectIdentityError(`${label} must be non-empty`);
    }
}
export function serializeEffectIdentity(seed) {
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
export async function deriveEffectId(sha256, seed) {
    const digest = await sha256.digestUtf8(serializeEffectIdentity(seed));
    if (digest.trim().length === 0) {
        throw new InvalidEffectIdentityError('sha256 binding returned an empty digest');
    }
    return `effect:v2:${digest}`;
}
//# sourceMappingURL=effect-identity.js.map