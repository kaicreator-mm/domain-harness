/** Error inheritance and refusal-code distinctions under v0.10. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  V10Error, V10BuildError, V10ExternalEffectError, V10_ACTIVATION_FAILURE_CODES,
} from '../../packages/domain-harness-compiler/src/qualified-package/v10build/errors.js';
import { V10ActivationError, V10PortDeniedError } from '../../packages/domain-harness-compiler/src/qualified-package/v10build/activation.js';
import { V10DeploymentError } from '../../packages/domain-harness-compiler/src/qualified-package/v10build/deployment.js';
import { normalizeExternalEffectEnvelope } from '../../packages/domain-harness-compiler/src/qualified-package/v10build/external-effect.js';

test('P-I1231: BUILD, deployment and external-effect errors share a typed base', () => {
  const errors = [
    new V10BuildError('BUILD_INPUT_INVALID', 'bad input'),
    new V10ActivationError('V10_APP_INVALID', 'bad app'),
    new V10PortDeniedError('docs'),
    new V10DeploymentError('OCCURRENCE_BUILD_PIN_INVALID', 'bad pin'),
    new V10ExternalEffectError('V10_EFFECT_PERMIT_EXPIRED', 'expired'),
  ];
  for (const error of errors) {
    assert.ok(error instanceof V10Error);
    assert.equal(typeof error.code, 'string');
    assert.match(error.name, /Error$/);
  }
  assert.ok(errors[4] instanceof V10ActivationError, 'existing runtime catch boundary must remain valid');
});

test('N-I1231: invalid adapter envelope is an external-effect subtype', () => {
  assert.throws(() => normalizeExternalEffectEnvelope({ phase: 'impossible' }), (error: unknown) => {
    assert.ok(error instanceof V10ExternalEffectError);
    assert.ok(error instanceof V10ActivationError);
    assert.equal(error.code, 'V10_EXTERNAL_ENVELOPE_INVALID');
    return true;
  });
});

test('P-I1231: activation invalid app/options/business policy codes are distinct', () => {
  const codes = Object.values(V10_ACTIVATION_FAILURE_CODES);
  assert.equal(new Set(codes).size, codes.length);
  assert.ok(codes.every((code) => /^V10_[A-Z_]+$/.test(code)));
});
