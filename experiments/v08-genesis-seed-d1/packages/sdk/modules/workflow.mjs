export function advance({input, semanticBody}) {
  if (!input || !semanticBody.stages.includes(input.current))
    throw Object.assign(new Error('unknown workflow stage'), {code:'E_WORKFLOW_STAGE'});
  const at = semanticBody.stages.indexOf(input.current);
  return semanticBody.stages[Math.min(at + 1, semanticBody.stages.length - 1)];
}
