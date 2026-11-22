// Pure query, restricted to the exact authored and BUILD-selected knowledge file digest.
import { createHash } from 'node:crypto';
const AUTHORED_FACTS_DIGEST = 'sha256:249c0808b5b353f8a65a25adebe97f7c27cb0e1ae01a75707082c7dec32c8429';
const unknown = (code, message) => ({ kind: 'UNKNOWN', unknownReason: { code, message } });
export function queryFacts(input) {
  const facts = input?.knowledge;
  if (!facts || facts.schemaVersion !== 'reference.knowledge/1' ||
      facts.domain !== 'reference-example' || !Array.isArray(facts.facts) || facts.facts.length > 64) {
    return unknown('REFERENCE_KNOWLEDGE_UNAVAILABLE', 'selected bounded knowledge has invalid identity or shape');
  }
  // Caller-supplied facts are NOT automatically trusted even if the caller owns a selected WorkflowRoot.
  // Only the content bytes pinned by the authored ContentBlock.ref may yield accepted evidence.
  const actual = 'sha256:' + createHash('sha256').update(JSON.stringify(facts) + '\n').digest('hex');
  if (actual !== AUTHORED_FACTS_DIGEST) {
    return unknown('REFERENCE_KNOWLEDGE_DIGEST_MISMATCH', 'caller facts differ from selected source digest');
  }
  const all = facts.facts.filter((fact) => fact?.key === 'minimum-score' &&
    fact.region === input.region);
  if (all.length === 0) return unknown('REFERENCE_KNOWLEDGE_NOT_APPLICABLE', 'no fact matches selected region');
  const versioned = all.filter((fact) => fact.revision === input.revision);
  if (versioned.length === 0) return unknown('REFERENCE_KNOWLEDGE_VERSION_UNAVAILABLE', 'no approved fact at requested version');
  const current = versioned.filter((fact) => typeof fact.validFrom === 'string' &&
    typeof fact.validTo === 'string' && fact.validFrom <= input.asOf &&
    input.asOf <= fact.validTo);
  if (current.length === 0) return unknown('REFERENCE_KNOWLEDGE_STALE', 'no applicable fact within requested date');
  if (current.some((fact) => !Number.isSafeInteger(fact.value) || fact.value < 0 ||
      typeof fact.id !== 'string' || !fact.source ||
      typeof fact.source.id !== 'string' || typeof fact.source.version !== 'string')) {
    return unknown('REFERENCE_KNOWLEDGE_INVALID', 'selected knowledge has incomplete provenance or value');
  }
  const unique = new Set(current.map((fact) => fact.value));
  if (unique.size !== 1) return unknown('REFERENCE_KNOWLEDGE_CONFLICT', 'multiple conflicting authoritative values');
  const evidence = current.map((fact) => ({
    factId: fact.id, sourceId: fact.source.id, sourceVersion: fact.source.version,
    revision: fact.revision, region: fact.region, validFrom: fact.validFrom, validTo: fact.validTo,
  }));
  return { kind: 'SUCCEEDED', value: {
    score: input.score, domain: input.domain, region: input.region, asOf: input.asOf,
    revision: input.revision, resolved: { minimumScore: current[0].value, evidence },
  } };
}
