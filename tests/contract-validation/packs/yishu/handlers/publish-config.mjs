/**
 * publishConfig — 发布（git commit+tag+behavior revision+清 draft 的模拟）。
 * 双重守卫：previewGate 必须 pass（新失败阻断，无强制发布入口）；
 * expectedFingerprint 必须等于当前 draftsFingerprint 且等于 preview 锚点
 * （TOCTOU：preview 与 publish 之间草稿集变化 → rejected(stale_drafts)）。
 */
export default async function publishConfig(input, ctx, resources) {
  const { business } = resources;
  const scopeKey = input.scopeKey;
  const govDoc = business.peek('yishu.governance', scopeKey);
  const gov = govDoc.value;
  if ((gov.appliedCommands ?? []).includes(input.commandId)) {
    return { outcome: 'applied', commandId: input.commandId, tag: gov.activeTag, replayed: true };
  }
  if (gov.previewGate !== 'pass') {
    return { outcome: 'rejected', code: 'regression_blocked', reason: 'publish preview gate: ' + String(gov.previewGate), commandId: input.commandId };
  }
  if (input.expectedFingerprint !== gov.draftsFingerprint || gov.previewOfFingerprint !== gov.draftsFingerprint) {
    return { outcome: 'rejected', code: 'stale_drafts', reason: 'drafts changed between preview and publish', commandId: input.commandId };
  }
  const tag = 'v' + ctx.now.slice(0, 10).replaceAll('-', '.') + '-' + (gov.activeRevision + 1);
  business.write('yishu.governance', scopeKey, {
    ...gov,
    activeTag: tag,
    activeRevision: gov.activeRevision + 1,
    previousTags: [...new Set([...(gov.previousTags ?? []), gov.activeTag, tag])],
    draftCount: 0,
    previewGate: null,
    previewOfFingerprint: null,
    previewNewFailures: [],
    appliedCommands: [...(gov.appliedCommands ?? []), input.commandId],
  });
  business.write('yishu.drafts', scopeKey, { drafts: [] });
  return { outcome: 'applied', tag, commandId: input.commandId };
}
