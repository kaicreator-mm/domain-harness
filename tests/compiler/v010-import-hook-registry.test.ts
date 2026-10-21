/** Isolated Hook Registry does not touch the production process-global hook. */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { registerHooks } from 'node:module';
import type { V10AppView } from '../../packages/domain-harness-compiler/src/qualified-package/v10build/activation.js';
import { createV10ImportHookRegistryForTests, privateModuleFragment } from '../../packages/domain-harness-compiler/src/qualified-package/v10build/import-hook.js';
import { V10ActivationError } from '../../packages/domain-harness-compiler/src/qualified-package/v10build/errors.js';

const view = {
  modules: [{
    packageId: 'feature-yaml',
    moduleSource: 'export const loaded = true;',
    externalImports: { npm: ['yaml'], native: [] },
  }],
} as unknown as V10AppView;

test('P-I1228: independent injected registry pins only the declaring data URL and refcounts all activations', () => {
  let installed = 0;
  let deregistered = 0;
  let resolveHook: (...args: unknown[]) => unknown = () => { throw new Error('hook not installed'); };
  const fakeRegister = ((hooks: { resolve: (...args: unknown[]) => unknown }) => {
    installed += 1;
    resolveHook = hooks.resolve;
    return { deregister: () => { deregistered += 1; } };
  }) as unknown as typeof registerHooks;
  const registry = createV10ImportHookRegistryForTests(fakeRegister);
  const make = (activationNonce: string) => registry.registerDeclaredBareImports({
    activationNonce,
    activationModuleUrl: 'file:///deployment/activation.mjs',
    appView: view,
    deploymentRoot: undefined,
  });
  const releaseA = make('nonce-a');
  const releaseB = make('nonce-b');
  assert.equal(installed, 1, 'two overlapping activations share ONE hook');
  assert.deepEqual(registry.snapshot(), { users: 2, allowances: 2, registered: true });
  const urlA = 'data:text/javascript;base64,YQ==' + privateModuleFragment('nonce-a', 'feature-yaml');
  const urlB = 'data:text/javascript;base64,YQ==' + privateModuleFragment('nonce-b', 'feature-yaml');
  const nextResolve = (specifier: string, context: { parentURL: string }) => ({ specifier, parentURL: context.parentURL });
  assert.deepEqual(resolveHook('yaml', { parentURL: urlA }, nextResolve),
    { specifier: 'yaml', parentURL: 'file:///deployment/activation.mjs' });
  assert.deepEqual(resolveHook('yaml', { parentURL: urlB }, nextResolve),
    { specifier: 'yaml', parentURL: 'file:///deployment/activation.mjs' });
  assert.deepEqual(resolveHook('not-declared', { parentURL: urlA }, nextResolve),
    { specifier: 'not-declared', parentURL: urlA }, 'undeclared edge must fall through unchanged');
  releaseA();
  releaseA();
  assert.deepEqual(registry.snapshot(), { users: 1, allowances: 1, registered: true });
  assert.deepEqual(resolveHook('yaml', { parentURL: urlA }, nextResolve),
    { specifier: 'yaml', parentURL: urlA }, 'released parent loses authority');
  releaseB();
  releaseB();
  assert.deepEqual(registry.snapshot(), { users: 0, allowances: 0, registered: false });
  assert.equal(deregistered, 1, 'last release removes only this injected hook');
});

test('N-I1228: failed hook registration rolls back all minted allowances', () => {
  const registry = createV10ImportHookRegistryForTests((() => {
    throw new Error('synthetic registerHooks failure');
  }) as typeof registerHooks);
  assert.throws(() => registry.registerDeclaredBareImports({
    activationNonce: 'failed',
    activationModuleUrl: 'file:///activation.mjs',
    appView: view,
    deploymentRoot: undefined,
  }), /synthetic registerHooks failure/);
  assert.deepEqual(registry.snapshot(), { users: 0, allowances: 0, registered: false },
    'failed registration must not leave a process-global allowance behind');
});

test('N-I1228: runtime without registerHooks refuses typed fail-closed and rolls back', () => {
  const registry = createV10ImportHookRegistryForTests(undefined as unknown as typeof registerHooks);
  assert.throws(() => registry.registerDeclaredBareImports({
    activationNonce: 'no-hook',
    activationModuleUrl: 'file:///activation.mjs',
    appView: view,
    deploymentRoot: undefined,
  }), (error: unknown) => {
    assert.ok(error instanceof V10ActivationError, 'must refuse with the typed activation error');
    assert.equal((error as V10ActivationError).code, 'V10_IMPORT_HOOK_UNAVAILABLE');
    return true;
  });
  assert.deepEqual(registry.snapshot(), { users: 0, allowances: 0, registered: false },
    'a runtime lacking the hook seam must not mint or retain any allowance');
});
