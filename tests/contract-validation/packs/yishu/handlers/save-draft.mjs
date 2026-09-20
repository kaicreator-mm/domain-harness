/**
 * saveDraft — 草稿保存（同 path 覆盖），bump draftsFingerprint 并使
 * 既有 preview 失效（TOCTOU 锚点变化）。
 */
export default async function saveDraft(input, ctx, resources) {
  const { business } = resources;
  const scopeKey = input.scopeKey;
  const govDoc = business.peek('yishu.governance', scopeKey);
  if (govDoc === undefined) return { outcome: 'rejected', code: 'unknown_scope', commandId: input.commandId };
  const gov = govDoc.value;
  if ((gov.appliedCommands ?? []).includes(input.commandId)) {
    return { outcome: 'applied', commandId: input.commandId, draftsFingerprint: gov.draftsFingerprint, draftCount: gov.draftCount, replayed: true };
  }
  const draftsDoc = business.peek('yishu.drafts', scopeKey) ?? { value: { drafts: [] } };
  const existing = draftsDoc.value.drafts.filter((entry) => entry.path !== input.path);
  const nextDrafts = [...existing, { path: input.path, content: input.content, origin: 'manual-edit', confirmedBy: 'admin', at: ctx.now }];
  business.write('yishu.drafts', scopeKey, { drafts: nextDrafts });
  const n = Number.parseInt(String(gov.draftsFingerprint).slice(3), 10);
  const nextFp = 'fp_' + (Number.isFinite(n) ? n + 1 : 1);
  business.write('yishu.governance', scopeKey, {
    ...gov,
    draftCount: nextDrafts.length,
    draftsFingerprint: nextFp,
    previewGate: null,
    previewOfFingerprint: null,
    appliedCommands: [...(gov.appliedCommands ?? []), input.commandId],
  });
  return { outcome: 'applied', commandId: input.commandId, draftsFingerprint: nextFp, draftCount: nextDrafts.length };
}
