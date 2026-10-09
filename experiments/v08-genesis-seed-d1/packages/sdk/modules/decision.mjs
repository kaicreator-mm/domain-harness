export function select({input, semanticBody}) {
  if (!input || typeof input.accepted !== 'boolean')
    throw Object.assign(new Error('decision input'), {code:'E_DECISION_INPUT'});
  return input.accepted ? semanticBody.onTrue : semanticBody.onFalse;
}
