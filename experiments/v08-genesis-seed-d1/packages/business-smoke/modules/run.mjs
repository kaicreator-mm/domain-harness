// Only declared capability dispatch; never import the SDK module directly.
export async function run({input, invokeCapability}) {
  const accepted = await invokeCapability({capabilityId:'rule.score', version:'1.0.0',
    operationId:'evaluate', input});
  return Object.freeze({accepted, label:accepted ? 'eligible' : 'manual-review'});
}
