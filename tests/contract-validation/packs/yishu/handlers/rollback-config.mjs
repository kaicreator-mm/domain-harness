/**
 * rollbackConfig — 回滚=active 指针移动（非破坏；历史 tag 不抹除）。
 * 只允许回滚到 previousTags 中仍存在且可校验的 tag。
 */
export default async function rollbackConfig(input, ctx, resources) {
  const { business } = resources;
  const scopeKey = input.scopeKey;
  const govDoc = business.peek('yishu.governance', scopeKey);
  const gov = govDoc.value;
  if ((gov.appliedCommands ?? []).includes(input.commandId)) {
    return { outcome: 'applied', commandId: input.commandId, tag: gov.activeTag, activeRevision: gov.activeRevision, replayed: true };
  }
  const known = new Set([...(gov.previousTags ?? []), gov.activeTag]);
  if (!known.has(input.tag)) {
    return { outcome: 'rejected', code: 'unknown_tag', commandId: input.commandId };
  }
  business.write('yishu.governance', scopeKey, {
    ...gov,
    activeTag: input.tag,
    activeRevision: gov.activeRevision + 1,
    appliedCommands: [...(gov.appliedCommands ?? []), input.commandId],
  });
  return { outcome: 'applied', tag: input.tag, activeRevision: gov.activeRevision + 1, commandId: input.commandId };
}
