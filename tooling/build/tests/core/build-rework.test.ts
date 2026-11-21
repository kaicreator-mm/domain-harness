// BUILD 正反例：只有符合当前契约的资源才能进入 Lock。
import test from 'node:test';
import assert from 'node:assert/strict';
import { symlinkSync, writeFileSync } from 'node:fs';
import { DH_ELEMENT_SCHEMA_VERSION, contentDigestOf } from '@kaicreator/domain-harness-contracts';
import { buildApp, type BuildResult } from '../../src/index.js';
import { functionRefOf, sha256OfBytes, writeJson } from './fixtures.js';
import { standardCase } from './standard-case.js';

function expectRefusal(result: BuildResult, code: string): void {
  assert.equal(result.ok, false, 'BUILD must refuse this input');
  if (!result.ok) {
    assert.equal(result.code, code, `expected ${code}, got ${result.code}: ${result.message}`);
  }
}

test('P1-2: app-level export check is NOT skipped when descriptor.id equals the owner package id', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const appDescriptor = input.descriptor as { id: string };
  appDescriptor.id = 'orders-business';
  const business = input.packages.find((pkg) => (pkg as { id: string }).id === 'orders-business') as {
    exports: { elementId?: string; functionId?: string }[];
  };
  business.exports = business.exports.filter(
    (entry) => !(entry.elementId === 'orders.eligibility' && entry.functionId === 'evaluate'),
  );
  expectRefusal(buildApp(input), 'DH_BUILD_EXPORT_MISSING');
});

test('P2-1: a symlinked resource escaping the package root is RESOURCE_MISSING', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const businessDir = scenario.ws.packageRoots['orders-business']!;
  const escapeBytes = new TextEncoder().encode('{"zones": ["EVIL"]}');
  const escapeTarget = `${scenario.ws.root}/escape-target.json`;
  writeFileSync(escapeTarget, escapeBytes);
  try {
    symlinkSync(escapeTarget, `${businessDir}/content/escape.json`, 'file');
  } catch {
    t.skip('symlink creation unavailable on this host');
    return;
  }
  const eligibilityDef = scenario.eligibility;
  eligibilityDef.content[1]!.ref = {
    packageId: 'orders-business',
    path: 'content/escape.json',
    digest: sha256OfBytes(escapeBytes),
  };
  const defPath = `${businessDir}/definitions/eligibility-1.0.0-1.json`;
  const defBytes = new TextEncoder().encode(JSON.stringify(eligibilityDef));
  writeFileSync(defPath, defBytes);
  const businessManifest = input.packages.find((pkg) => (pkg as { id: string }).id === 'orders-business') as {
    elements: { id: string; definitionRef: { digest: string } }[];
  };
  businessManifest.elements.find((entry) => entry.id === 'orders.eligibility')!.definitionRef.digest =
    sha256OfBytes(defBytes);
  const appDescriptor = input.descriptor as {
    ingress: { function: { element: { digest: string } } }[];
  };
  const newDefinitionDigest = contentDigestOf(JSON.parse(Buffer.from(defBytes).toString('utf8')) as never);
  for (const entry of appDescriptor.ingress) entry.function.element.digest = newDefinitionDigest;
  expectRefusal(buildApp(input), 'DH_BUILD_RESOURCE_MISSING');
});

test('P2-3: known non-document kind with non-JSON ref bytes is SCHEMA_INVALID', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const opaqueBytes = new TextEncoder().encode('# not json at all\n');
  scenario.extraElements.push({
    kind: 'Element',
    schemaVersion: DH_ELEMENT_SCHEMA_VERSION,
    id: 'orders.opaque-rule',
    version: '1.0.0',
    description: 'Rule kind whose ref carries opaque bytes.',
    content: [
      {
        id: 'rule-md',
        contentKind: 'rule',
        schemaRef: { inline: { type: 'object' } },
        required: true,
        ref: { packageId: 'orders-business', path: 'content/opaque-rule.bin', digest: 'sha256:pending' },
      },
    ],
    functions: [],
  } as never);
  scenario.extraElementRawFiles['orders.opaque-rule/rule-md'] = opaqueBytes;
  const { input } = scenario.finalize();
  expectRefusal(buildApp(input), 'DH_BUILD_SCHEMA_INVALID');
});

test('P2-5: caret on the 0.0 line pins the patch segment (^0.0.2 does not match 0.0.1)', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  scenario.faq.version = '0.0.1';
  scenario.eligibility.dependencies = [{ element: 'orders.faq', version: '^0.0.2' }];
  const { input } = scenario.finalize();
  expectRefusal(buildApp(input), 'DH_BUILD_REF_UNRESOLVED');
});

test('P2-5: prerelease ranges are rejected, not silently widened', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  scenario.eligibility.dependencies = [{ element: 'orders.faq', version: '1.0.0-beta' }];
  const { input } = scenario.finalize();
  expectRefusal(buildApp(input), 'DH_BUILD_REF_UNRESOLVED');
});

test('P2-5: malformed ranges are rejected, not silently widened', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  scenario.eligibility.dependencies = [{ element: 'orders.faq', version: 'latest' }];
  const { input } = scenario.finalize();
  expectRefusal(buildApp(input), 'DH_BUILD_REF_UNRESOLVED');
});

test('P2-5 positive: ^0.0.1 matches 0.0.1 exactly on the 0.0 line', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  scenario.faq.version = '0.0.1';
  scenario.eligibility.dependencies = [{ element: 'orders.faq', version: '^0.0.1' }];
  const { input } = scenario.finalize();
  const result = buildApp(input);
  assert.equal(result.ok, true, result.ok ? undefined : `${result.code}: ${result.message}`);
});

test('P2-6: element definitionRef from a different package is SCHEMA_INVALID', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const business = input.packages.find((pkg) => (pkg as { id: string }).id === 'orders-business') as {
    elements: { id: string; definitionRef: { packageId: string } }[];
  };
  business.elements.find((entry) => entry.id === 'orders.eligibility')!.definitionRef.packageId = 'sdk-core';
  expectRefusal(buildApp(input), 'DH_BUILD_SCHEMA_INVALID');
});

test('P2-6: implementation entry module from a different package is SCHEMA_INVALID', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const business = input.packages.find((pkg) => (pkg as { id: string }).id === 'orders-business') as {
    targetVariants: { implementations: { entry: { module: { packageId: string } } }[] }[];
  };
  business.targetVariants[0]!.implementations[0]!.entry.module.packageId = 'sdk-core';
  expectRefusal(buildApp(input), 'DH_BUILD_SCHEMA_INVALID');
});

test('P2-7: target variant without nodeMajor is not selectable', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const business = input.packages.find((pkg) => (pkg as { id: string }).id === 'orders-business') as {
    targetVariants: { target: { nodeMajor?: number } }[];
  };
  delete business.targetVariants[0]!.target.nodeMajor;
  expectRefusal(buildApp(input), 'DH_BUILD_IMPLEMENTATION_MISSING');
});

test('P2-9: businessAppInit owned by a non-business layer is LAYER_ROLE_MISMATCH', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const sdkDir = scenario.ws.packageRoots['sdk-core']!;
  const sdkInitElement = {
    kind: 'Element',
    schemaVersion: DH_ELEMENT_SCHEMA_VERSION,
    id: 'orders.sdk-init',
    version: '1.0.0',
    description: 'Init living on the sdk layer (must be refused).',
    content: [],
    functions: [
      {
        id: 'init',
        contractVersion: '1',
        inputSchemaRef: { inline: { type: 'object' } },
        outputSchemaRef: { inline: { type: 'string' } },
        outcomes: ['SUCCEEDED'],
        effects: 'none',
      },
    ],
  };
  const definitionRef = writeJson(sdkDir, 'definitions/sdk-init.json', sdkInitElement as never);
  const sdk = input.packages.find((pkg) => (pkg as { id: string }).id === 'sdk-core') as {
    elements: unknown[];
  };
  sdk.elements = [{ id: 'orders.sdk-init', version: '1.0.0', definitionRef, visibility: 'public' }];
  (input.descriptor as { businessAppInit: unknown }).businessAppInit = functionRefOf(
    sdkInitElement as never,
    'init',
  );
  expectRefusal(buildApp(input), 'DH_BUILD_LAYER_ROLE_MISMATCH');
});
