// Real Business Package Element implementations, no private SDK or Host access.
import { readJson, writeYaml } from 'r60-standard-files';
const events = (globalThis.__dhR41Events ??= []);
const workflowRef = {"contentId":"decision-flow","element":{"digest":"sha256:c44dc1e5b1ce99a786db6cdb79fa85452bbf8f91c488f0404957d85806042e8b","id":"reference.app","namespace":"reference","version":"1.1.0"}};
const unknown = (code, message) => ({ kind: 'UNKNOWN', unknownReason: { code, message } });

export function recognize(input) {
  if (!input || input.domain !== 'reference-example') {
    return unknown('REFERENCE_DOMAIN_NOT_APPLICABLE', 'input domain is outside reference-example');
  }
  if (typeof input.score !== 'number' || !Number.isFinite(input.score)) {
    return unknown('REFERENCE_SCORE_UNKNOWN', 'score not known');
  }
  if (typeof input.region !== 'string' || !/^[A-Z]{2}$/.test(input.region) ||
      typeof input.asOf !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.asOf) ||
      typeof input.revision !== 'string' || input.revision.length === 0) {
    return unknown('REFERENCE_APPLICABILITY_INPUT_UNKNOWN', 'region/date/revision not known');
  }
  return { kind: 'SUCCEEDED', value: input };
}

export function validate(input) {
  const claim = input?.resolved;
  if (!claim || !Number.isSafeInteger(claim.minimumScore) || claim.minimumScore < 0 ||
      !Array.isArray(claim.evidence) || claim.evidence.length === 0 ||
      claim.evidence.some((source) => source.region !== input.region ||
        source.revision !== input.revision || source.validFrom > input.asOf ||
        source.validTo < input.asOf || !source.sourceId || !source.sourceVersion)) {
    return unknown('REFERENCE_VALIDATION_UNPROVEN', 'decision has no applicable selected evidence');
  }
  return { kind: 'SUCCEEDED', value: input };
}

export function decide(input) {
  const threshold = input?.resolved?.minimumScore;
  if (!Number.isSafeInteger(threshold) || !Array.isArray(input?.resolved?.evidence) ||
      input.resolved.evidence.length === 0) {
    return unknown('REFERENCE_DECISION_EVIDENCE_MISSING', 'validated selected threshold missing');
  }
  return { kind: 'SUCCEEDED', value: {
    decision: input.score >= threshold ? 'ACCEPT' : 'REJECT', minimumScore: threshold,
    region: input.region, domain: input.domain, asOf: input.asOf, revision: input.revision,
    evidence: input.resolved.evidence,
  } };
}

export async function init(context) {
  const order = events.filter((entry) => entry.phase === 'init').map((entry) => entry.packageId);
  if (JSON.stringify(order) !== JSON.stringify(['r41-kdp', 'r41-sdk-base'])) {
    throw new Error('REFERENCE_INIT_ORDER_INVALID:' + JSON.stringify(order));
  }
  events.push({ phase: 'init', packageId: 'reference-business' });
  const resource = context.resources.get('reference-knowledge/content/facts.json');
  if (!resource) throw new Error('REFERENCE_SELECTED_KNOWLEDGE_RESOURCE_MISSING');
  const parsed = readJson({ format: 'json', source: Buffer.from(await resource.read()).toString('utf8') });
  if (parsed.kind !== 'SUCCEEDED' || parsed.value?.schemaVersion !== 'reference.knowledge/1') {
    throw new Error('REFERENCE_SELECTED_KNOWLEDGE_JSON_INVALID');
  }
  const knowledge = parsed.value;
  const written = writeYaml({ format: 'yaml', value: { domain: knowledge.domain, revision: knowledge.revision } });
  if (written.kind !== 'SUCCEEDED' || !written.value.includes('domain: reference-example')) {
    throw new Error('REFERENCE_STANDARD_YAML_INVALID');
  }
  if (!context.workflows) throw new Error('REFERENCE_WORKFLOW_STARTER_MISSING');
  const template = { domain: 'reference-example', asOf: '2026-11-22', revision: '2026.11', knowledge };
  const cases = [
    { name: 'US_ACCEPT', region: 'US', score: 12, status: 'COMPLETE', decision: 'ACCEPT', threshold: 10 },
    { name: 'US_REJECT', region: 'US', score: 5, status: 'COMPLETE', decision: 'REJECT', threshold: 10 },
    { name: 'CA_REJECT', region: 'CA', score: 12, status: 'COMPLETE', decision: 'REJECT', threshold: 20 },
    { name: 'CA_ACCEPT', region: 'CA', score: 22, status: 'COMPLETE', decision: 'ACCEPT', threshold: 20 },
    { name: 'CONFLICT', region: 'EU', score: 22, status: 'UNKNOWN', reason: 'REFERENCE_KNOWLEDGE_CONFLICT' },
    { name: 'MISSING', region: 'JP', score: 22, status: 'UNKNOWN', reason: 'REFERENCE_KNOWLEDGE_NOT_APPLICABLE' },
    { name: 'STALE', region: 'US', score: 22, status: 'UNKNOWN', reason: 'REFERENCE_KNOWLEDGE_STALE', asOf: '2030-01-01' },
    { name: 'VERSION', region: 'US', score: 22, status: 'UNKNOWN', reason: 'REFERENCE_KNOWLEDGE_VERSION_UNAVAILABLE', revision: '2025.01' },
    { name: 'DOMAIN', region: 'US', score: 22, status: 'UNKNOWN', reason: 'REFERENCE_DOMAIN_NOT_APPLICABLE', domain: 'other' },
    { name: 'UNKNOWN_SCORE', region: 'US', score: null, status: 'UNKNOWN', reason: 'REFERENCE_SCORE_UNKNOWN' },
  ];
  const results = [];
  for (const test of cases) {
    const result = await context.workflows.start(workflowRef, { ...template, region: test.region,
      score: test.score, ...(test.asOf ? { asOf: test.asOf } : {}),
      ...(test.revision ? { revision: test.revision } : {}),
      ...(test.domain ? { domain: test.domain } : {}) });
    if (result.status !== test.status ||
        (result.status === 'COMPLETE' &&
          (result.value.decision !== test.decision || result.value.minimumScore !== test.threshold ||
           !Array.isArray(result.value.evidence) || result.value.evidence.length === 0)) ||
        (result.status === 'UNKNOWN' && result.reason?.code !== test.reason)) {
      throw new Error('REFERENCE_DOMAIN_CASE_FAILED:' + test.name + ':' + JSON.stringify(result));
    }
    results.push({ name: test.name, status: result.status,
      ...(result.status === 'COMPLETE' ? { decision: result.value.decision, threshold: result.value.minimumScore,
        evidence: result.value.evidence.map((item) => item.factId) } : { reason: result.reason.code }) });
  }
  const denied = await context.workflows.start({ ...workflowRef, contentId: 'not-selected' }, { ...template, score: 42, region: 'US' });
  if (denied.status !== 'FAILED' || denied.reason?.code !== 'DH_WORKFLOW_UNSELECTED') {
    throw new Error('REFERENCE_WORKFLOW_UNSELECTED_NOT_DENIED:' + JSON.stringify(denied));
  }
  events.push({ phase: 'domain-verified', packageId: 'reference-business', score: 42,
    yaml: written.value, workflow: 'COMPLETE', unknown: 'UNKNOWN', denied: denied.reason.code,
    cases: results, knowledgeRecords: knowledge.facts.length, selectedResourceDigest: resource.ref.digest });
  return { status: 'READY' };
}

export function exit() {
  events.push({ phase: 'exit', packageId: 'reference-business' });
}
