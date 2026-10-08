// A real hand-authored pure Rule implementation: no Host I/O and no model call.
export function evaluate({input, semanticBody}) {
  if (!input || typeof input.score !== 'number' || !Number.isFinite(input.score))
    throw Object.assign(new Error('non-finite score'), {code:'E_RULE_INPUT'});
  if (semanticBody.operator !== 'gte' || typeof semanticBody.threshold !== 'number')
    throw Object.assign(new Error('unknown Rule semantic'), {code:'E_RULE_SEMANTIC'});
  return input.score >= semanticBody.threshold;
}
