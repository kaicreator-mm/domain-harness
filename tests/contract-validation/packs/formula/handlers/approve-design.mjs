/**
 * approveDesign — 项目绑定 Tool 模拟（PRD-CR-1 ProjectToolImpl 签名）。
 * 契约草案 §3：事务内重校验权威事实（最新评审 verdict + 选中 artifact 存在），
 * 业务结论以结构化 outcome 返回（R3），幂等靠 applied_effects(commandId)。
 */
export default async function approveDesign(input, ctx, resources) {
  const { business } = resources;
  const design = business.peek('formula.design', input.designId);
  if (design === undefined) {
    return { outcome: 'rejected', code: 'unknown_design', commandId: input.commandId };
  }

  const appliedDoc = business.peek('formula.appliedEffects', input.designId);
  const effects = appliedDoc === undefined ? [] : appliedDoc.value.effects;
  const replay = effects.find((entry) => entry.commandId === input.commandId);
  if (replay !== undefined) return replay.result;

  const reviewsDoc = business.peek('formula.reviews', input.designId);
  const reviews = reviewsDoc === undefined ? [] : reviewsDoc.value.reviews;
  const latest = reviews.length > 0 ? reviews[reviews.length - 1] : null;

  const artifactsDoc = business.peek('formula.artifacts', input.designId);
  const artifacts = artifactsDoc === undefined ? [] : artifactsDoc.value.artifacts;
  const selected = artifacts.find((entry) => entry.artifactId === design.value.selectedArtifactId);

  let result;
  if (latest === null || latest.verdict !== 'certified') {
    result = {
      outcome: 'rejected',
      code: 'quality_not_passed',
      reason: 'latest review verdict: ' + (latest === null ? 'missing' : latest.verdict),
      commandId: input.commandId,
    };
  } else if (selected === undefined) {
    result = { outcome: 'rejected', code: 'stale_selection', commandId: input.commandId };
  } else {
    business.write('formula.design', input.designId, {
      ...design.value,
      approvalStatus: 'approved',
      approvedAt: ctx.now,
      approvedVersionId: design.value.headVersionId,
    });
    result = {
      outcome: 'applied',
      commandId: input.commandId,
      approvedVersionId: design.value.headVersionId,
    };
  }

  business.write('formula.appliedEffects', input.designId, {
    effects: [...effects, { commandId: input.commandId, result, at: ctx.now }],
  });
  return result;
}
