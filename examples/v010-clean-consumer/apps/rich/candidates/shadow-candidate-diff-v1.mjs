/**
 * T11 Shadow L4 candidate that deliberately disagrees with the approved
 * fallback on one projected field. The runner must report a difference while
 * still proving ZERO production writes: a candidate is evidence input only,
 * never a promotion and never a production mutation.
 */
export function evaluate(input) {
  const value = input && typeof input.value === 'object' && input.value !== null ? input.value : {};
  return {
    key: input && input.key,
    revision: input && input.revision,
    state: typeof value.state === 'string' ? value.state : null,
    phase: typeof value.phase === 'string' ? value.phase : null,
    outcome: 'candidate-override',
  };
}
