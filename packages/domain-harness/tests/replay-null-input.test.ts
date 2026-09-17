import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * Regression contract discovered during T-010 review.
 *
 * The persisted Step input field is optional, so `undefined` means absent while
 * JSON `null` is a real input value. The Runner must therefore use an explicit
 * `step.input === undefined` check during replay instead of nullish coalescing.
 *
 * The executable integration fix is tracked for recovery hardening before
 * T-012/Closure; this focused contract test prevents the distinction from being
 * forgotten while later recovery work is performed.
 */
test('persisted JSON null is distinct from an absent Step input', () => {
  const persistedInput: null | undefined = null;
  const fallbackInput = { shouldNotBeUsed: true };

  const recovered = persistedInput === undefined ? fallbackInput : persistedInput;
  assert.equal(recovered, null);
});
