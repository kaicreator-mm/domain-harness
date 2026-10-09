// K1 hand-authored pure business Operation (std.operation@1.0.0): claim
// underwriting. Uses ONLY its declared capability (rule.score@1.0.0 provided by
// the byte-exact D1 genesis.sdk). Pure: the K1 Host dispatches it directly; no
// effect authority is touched.
export async function underwrite({input, invokeCapability}) {
  if (!input || typeof input.claimAmount !== 'number' || !Number.isFinite(input.claimAmount))
    throw Object.assign(new Error('invalid claim input'), {code:'E_UNDERWRITE_INPUT'});
  const withinSdkRule = await invokeCapability({capabilityId:'rule.score', version:'1.0.0',
    operationId:'evaluate', input:{score:input.claimAmount}});
  return Object.freeze({claim:input.claimAmount,
    underwriting:withinSdkRule ? 'auto-accept' : 'adjuster-review'});
}
