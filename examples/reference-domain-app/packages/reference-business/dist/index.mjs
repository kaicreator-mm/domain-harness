// 本文件是普通 Business Package 的真实 ESM Function 实现，不使用 SDK 内部入口。
import { readJson, writeYaml } from 'r60-standard-files';
const events = (globalThis.__dhR41Events ??= []);
const workflowRef = {"element":{"namespace":"reference","id":"reference.app","version":"1.0.0","digest":"sha256:378eb7460db80b43776e9605a004b62478226ca82d612e714aa94dc1001330f0"},"contentId":"decision-flow"};

// 真实规则由本 Package.Init 从 BUILD 封存的 Element Definition 只读资源加载。
let selectedThreshold;
export function evaluate(input) {
  if (typeof input?.score !== 'number' || !Number.isFinite(input.score)) {
    return { kind: 'UNKNOWN', unknownReason: { code: 'REFERENCE_SCORE_UNKNOWN', message: 'score unavailable' } };
  }
  if (!Number.isFinite(selectedThreshold)) {
    return { kind: 'FAILED', failure: { code: 'REFERENCE_RULE_UNINITIALIZED', message: 'rule Element content not initialized' } };
  }
  return { kind: 'SUCCEEDED', value: { decision: input.score >= selectedThreshold ? 'ACCEPT' : 'REJECT' } };
}

export async function init(context) {
  const order = events.filter((entry) => entry.phase === 'init').map((entry) => entry.packageId);
  if (JSON.stringify(order) !== JSON.stringify(['r41-kdp', 'r41-sdk-base'])) {
    throw new Error('REFERENCE_INIT_ORDER_INVALID:' + JSON.stringify(order));
  }
  events.push({ phase: 'init', packageId: 'reference-business' });
  // ResourceRef 在 Manifest.Init Binding 中声明，BUILD 封存 SHA256，KDP 只发放本 Package 自己的只读句柄。
  const handle = context.resources.get('reference-business/definitions/rule.json');
  if (!handle) throw new Error('REFERENCE_RULE_RESOURCE_UNSELECTED');
  const rule = readJson({ format: 'json', source: Buffer.from(await handle.read()).toString('utf8') });
  if (rule.kind !== 'SUCCEEDED' || rule.value?.id !== 'reference.rule' ||
      !Array.isArray(rule.value.content)) throw new Error('REFERENCE_RULE_CONTENT_INVALID');
  const scope = rule.value.content.find((item) =>
    item?.id === 'scope' && item.contentKind === 'structured-data' && item.required === true);
  const threshold = scope?.value?.threshold;
  if (scope?.value?.domain !== 'reference-example' || typeof threshold !== 'number' ||
      !Number.isFinite(threshold)) throw new Error('REFERENCE_RULE_THRESHOLD_INVALID');
  if (selectedThreshold !== undefined && selectedThreshold !== threshold) {
    throw new Error('REFERENCE_RULE_ACTIVATION_CONFLICT');
  }
  selectedThreshold = threshold;
  const parsed = readJson({ format: 'json', source: '{"score":42,"domain":"reference"}' });
  if (parsed.kind !== 'SUCCEEDED' || parsed.value.score !== 42) {
    throw new Error('REFERENCE_STANDARD_JSON_INVALID');
  }
  const written = writeYaml({ format: 'yaml', value: parsed.value });
  if (written.kind !== 'SUCCEEDED' || !written.value.includes('score: 42')) {
    throw new Error('REFERENCE_STANDARD_YAML_INVALID');
  }
  if (!context.workflows) throw new Error('REFERENCE_WORKFLOW_STARTER_MISSING');
  const positive = await context.workflows.start(workflowRef, { score: parsed.value.score });
  if (positive.status !== 'COMPLETE' || positive.value?.decision !== 'ACCEPT') {
    throw new Error('REFERENCE_WORKFLOW_INCOMPLETE:' + JSON.stringify(positive));
  }
  const negative = await context.workflows.start(workflowRef, { score: threshold - 1 });
  if (negative.status !== 'COMPLETE' || negative.value?.decision !== 'REJECT') {
    throw new Error('REFERENCE_WORKFLOW_REJECT_MISSING:' + JSON.stringify(negative));
  }
  const unknown = await context.workflows.start(workflowRef, { score: null });
  if (unknown.status !== 'UNKNOWN') throw new Error('REFERENCE_WORKFLOW_UNKNOWN_MISSING:' + JSON.stringify(unknown));
  const denied = await context.workflows.start({ ...workflowRef, contentId: 'not-selected' }, { score: 42 });
  if (denied.status !== 'FAILED' || denied.reason?.code !== 'DH_WORKFLOW_UNSELECTED') {
    throw new Error('REFERENCE_WORKFLOW_UNSELECTED_NOT_DENIED:' + JSON.stringify(denied));
  }
  events.push({ phase: 'domain-verified', packageId: 'reference-business', score: parsed.value.score,
    yaml: written.value, workflow: positive.status, rejection: negative.value.decision,
    threshold, unknown: unknown.status, denied: denied.reason.code });
  return { status: 'READY' };
}

export function exit() {
  events.push({ phase: 'exit', packageId: 'reference-business' });
}
