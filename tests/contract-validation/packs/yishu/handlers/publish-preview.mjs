/**
 * publishPreview — 发布回归 gate 预览（读+治理记录）：
 * 用「已发布内容 + 当前草稿集」重跑评估案例；任何新失败 → gate=blocked
 * （无强制发布入口）。通过时记录 previewOfFingerprint（ApprovePublish 的
 * TOCTOU 比较锚点）。真实实现=用已发布配置重跑 translator 案例并对比基线。
 */
export default async function publishPreview(input, ctx, resources) {
  const { business, domainData } = resources;
  const scopeKey = input.scopeKey;
  const govDoc = business.peek('yishu.governance', scopeKey);
  const gov = govDoc.value;
  const drafts = (business.peek('yishu.drafts', scopeKey) ?? { value: { drafts: [] } }).value.drafts;
  const evaluation = (business.peek('yishu.evaluation', scopeKey) ?? { value: { cases: [] } }).value;
  const published = String(domainData['published-terms-sim']?.content ?? '');
  const content = published + '\n' + drafts.map((entry) => entry.content).join('\n');
  const newFailures = evaluation.cases
    .filter((entry) => entry.requiresTerm !== undefined && !content.includes(entry.requiresTerm))
    .map((entry) => entry.caseId);
  const gate = newFailures.length === 0 ? 'pass' : 'blocked';
  business.write('yishu.governance', scopeKey, {
    ...gov,
    previewGate: gate,
    previewNewFailures: newFailures,
    previewOfFingerprint: gate === 'pass' ? gov.draftsFingerprint : null,
  });
  return { outcome: 'applied', gate, newFailures, draftsFingerprint: gov.draftsFingerprint, commandId: input.commandId };
}
