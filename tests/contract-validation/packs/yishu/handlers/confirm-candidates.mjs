/**
 * confirmCandidates — 候选确认（先全量预校验再写，避免半提交）。
 * sampling-policy（compiled domain data）：LLM 来源禁批量确认；抽样组禁批量确认。
 * 幂等：appliedCommands 账本按 commandId 去重（applied_effects 模拟）。
 */
export default async function confirmCandidates(input, ctx, resources) {
  const { business, domainData } = resources;
  const policy = domainData['sampling-policy'];
  const scopeKey = input.scopeKey;
  const govDoc = business.peek('yishu.governance', scopeKey);
  if (govDoc === undefined) return { outcome: 'rejected', code: 'unknown_scope', commandId: input.commandId };
  const gov = govDoc.value;
  if ((gov.appliedCommands ?? []).includes(input.commandId)) {
    return { outcome: 'applied', commandId: input.commandId, confirmed: 0, replayed: true, draftsFingerprint: gov.draftsFingerprint };
  }
  const candDoc = business.peek('yishu.candidates', scopeKey);
  const candidates = candDoc === undefined ? [] : candDoc.value.candidates;
  const requested = candidates.filter((entry) => input.candidateIds.includes(entry.candidateId));
  if (requested.length !== input.candidateIds.length) {
    return { outcome: 'rejected', code: 'unknown_or_processed_candidates', commandId: input.commandId };
  }
  if (policy.llmBatchConfirmForbidden && input.candidateIds.length > 1 && requested.some((entry) => entry.source === 'llm')) {
    return { outcome: 'rejected', code: 'llm_batch_confirm_forbidden', reason: 'LLM candidates require per-item human confirmation (AI has no approval authority)', commandId: input.commandId };
  }
  if (policy.sampledGroupBatchConfirmForbidden && input.candidateIds.length > 1 && requested.some((entry) => entry.sampled === true)) {
    return { outcome: 'rejected', code: 'sampled_batch_confirm_forbidden', commandId: input.commandId };
  }

  const draftsDoc = business.peek('yishu.drafts', scopeKey) ?? { value: { drafts: [] } };
  const newDrafts = requested.map((entry) => ({
    path: 'terms/' + scopeKey + '/' + entry.key + '.md',
    content: entry.targetText,
    origin: entry.source,
    confirmedBy: 'admin',
    at: ctx.now,
  }));
  business.write('yishu.candidates', scopeKey, {
    candidates: candidates.filter((entry) => !input.candidateIds.includes(entry.candidateId)),
  });
  const allDrafts = [...draftsDoc.value.drafts, ...newDrafts];
  business.write('yishu.drafts', scopeKey, { drafts: allDrafts });
  const nextFp = bumpFingerprint(gov.draftsFingerprint);
  business.write('yishu.governance', scopeKey, {
    ...gov,
    draftCount: allDrafts.length,
    draftsFingerprint: nextFp,
    previewGate: null,
    previewOfFingerprint: null,
    appliedCommands: [...(gov.appliedCommands ?? []), input.commandId],
  });
  return { outcome: 'applied', commandId: input.commandId, confirmed: requested.length, draftsFingerprint: nextFp };
}

function bumpFingerprint(current) {
  const n = Number.parseInt(String(current).slice(3), 10);
  return 'fp_' + (Number.isFinite(n) ? n + 1 : 1);
}
