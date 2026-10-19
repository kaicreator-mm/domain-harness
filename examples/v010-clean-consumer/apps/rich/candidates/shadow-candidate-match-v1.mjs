/**
 * T11 Shadow L4 candidate (approved-shaped, byte-allowed) that projects every
 * observed K document exactly like the selected approved fallback. It runs
 * only inside the Shadow runner's isolated read-only evaluation context; it
 * has no K permit, no Effect dispatch and no production namespace.
 */
export function evaluate(input) {
  const value = input && typeof input.value === 'object' && input.value !== null ? input.value : {};
  return {
    key: input && input.key,
    revision: input && input.revision,
    state: typeof value.state === 'string' ? value.state : null,
    phase: typeof value.phase === 'string' ? value.phase : null,
    outcome: typeof value.outcome === 'string' ? value.outcome : null,
  };
}
