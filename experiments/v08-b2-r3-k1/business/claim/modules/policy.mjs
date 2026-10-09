// K1 hand-authored pure business Rule (std.rule@1.0.0): high-value claim screen.
// Self-contained business semantics: no Host I/O, no model call, no capability
// dispatch, no effect authority. This semantic lives ONLY in this Business
// Package and can never enter the Kernel path.
export function evaluate({input, semanticBody}) {
  if (!input || typeof input.claimAmount !== 'number' || !Number.isFinite(input.claimAmount))
    throw Object.assign(new Error('invalid claim input'), {code:'E_CLAIM_INPUT'});
  if (semanticBody.policyId !== 'high-value-claim' ||
      typeof semanticBody.maxAutoApprove !== 'number')
    throw Object.assign(new Error('unknown claim policy semantic'), {code:'E_CLAIM_POLICY'});
  return input.claimAmount <= semanticBody.maxAutoApprove;
}
