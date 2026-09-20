/**
 * recordAuthority — AuthorityDecision append（契约草案 §7：M2/M4）。
 * 幂等：同 commandId 重放返回已记录结果（applied_effects 纪律的模拟）。
 * actor 只信任命令载荷中经 P2 鉴权注入的值（仓库规则：actor 取 session）。
 */
export default async function recordAuthority(input, ctx, resources) {
  const { business } = resources;
  const doc = business.peek('tally.authority', input.projectId) ?? {
    value: { decisions: [], pendingMergeApprovals: [] },
  };
  const decisions = doc.value.decisions;
  const replay = decisions.find((entry) => entry.commandId === input.commandId);
  if (replay !== undefined) {
    return { outcome: 'applied', commandId: input.commandId, replayed: true, recorded: decisions.length };
  }
  const next = [
    ...decisions,
    {
      taskId: input.taskId,
      decision: input.decision,
      actor: input.actor,
      ...(input.reason === undefined ? {} : { reason: input.reason }),
      commandId: input.commandId,
      at: ctx.now,
    },
  ];
  business.write('tally.authority', input.projectId, { ...doc.value, decisions: next });
  return { outcome: 'applied', commandId: input.commandId, recorded: next.length };
}
