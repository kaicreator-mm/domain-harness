/**
 * changeLifecycle — 冻结转移表校验（invariant #5，表来自 compiled domain
 * data 'lifecycle-transitions'）。非法转移 = 结构化 rejected，绝不抛错。
 */
export default async function changeLifecycle(input, ctx, resources) {
  const { business, domainData } = resources;
  const doc = business.peek('triphub.journey', input.journeyId);
  if (doc === undefined) {
    return { outcome: 'rejected', code: 'unknown_journey', commandId: input.commandId };
  }
  const table = domainData['lifecycle-transitions'].transitions;
  const current = doc.value.lifecycle;
  const allowed = table[current] ?? [];
  if (!allowed.includes(input.target)) {
    return {
      outcome: 'rejected',
      code: 'illegal_transition',
      reason: current + ' -> ' + input.target + ' is not in the frozen transition table',
      commandId: input.commandId,
    };
  }
  business.write('triphub.journey', input.journeyId, {
    ...doc.value,
    lifecycle: input.target,
    updatedAt: ctx.now,
  });
  return { outcome: 'applied', lifecycle: input.target, commandId: input.commandId };
}
