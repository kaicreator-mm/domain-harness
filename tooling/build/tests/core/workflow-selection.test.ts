/** v0.11.1 T12：复用现有 BUILD/Lock/Package 安装闭包的 Workflow 静态选定反例。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DH_WORKFLOW_SCHEMA_VERSION,
  contentDigestOf,
  type DomainPackageManifest,
  type ElementDefinition,
  type JsonValue,
  type WorkflowDefinition,
} from '@kaicreator/domain-harness-contracts';
import { buildApp, type BuildResult } from '../../src/index.js';
import { elementRefOf, functionRefOf, sha256OfBytes, writeRaw } from './fixtures.js';
import { standardCase } from './standard-case.js';

const textEncoder = new TextEncoder();
const YAML_BYTES = textEncoder.encode('record: order-7\nvalid: true\n');
const JSON_BYTES = textEncoder.encode('{"record":"order-7","valid":true}');

function workflowCase(
  t: import('node:test').TestContext,
  options: {
    readonly format?: 'json' | 'yaml';
    readonly withData?: boolean;
    readonly dataMaxBytes?: number;
    readonly sourcePackage?: string;
    readonly badNodeFunction?: boolean;
    readonly workflowElementId?: string;
  } = {},
) {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const bytes = options.format === 'yaml' ? YAML_BYTES : JSON_BYTES;
  const resource = {
    packageId: options.sourcePackage ?? 'orders-business',
    path: options.format === 'yaml' ? 'data/order.yml' : 'data/order.json',
    digest: sha256OfBytes(bytes),
  };
  const check = functionRefOf(scenario.eligibility as ElementDefinition, 'evaluate');
  const workflow: WorkflowDefinition = {
    kind: 'Workflow',
    schemaVersion: DH_WORKFLOW_SCHEMA_VERSION,
    id: 'order-verification',
    entryNodeId: 'assess',
    maxElementCalls: 4,
    maxDescendantWorkflowDepth: 0,
    nodes: [{
      id: 'assess', kind: 'function',
      function: options.badNodeFunction ? { ...check, functionId: 'missing' } : check,
      ...(options.withData ? { data: {
        format: options.format ?? 'json', resource,
        maxBytes: options.dataMaxBytes ?? 4096,
      } } : {}),
      switch: { exits: [
        { label: 'SUCCEEDED', target: { terminal: 'COMPLETE' } },
        { label: 'UNKNOWN', target: { terminal: 'UNKNOWN' } },
        { label: 'FAILED', target: { terminal: 'FAILED' } },
      ] },
    }],
  };
  scenario.appMain.content.push({
    id: 'business-flow', contentKind: 'workflow-definition',
    schemaRef: { inline: { type: 'object' } },
    required: true, value: workflow as unknown as JsonValue,
  });
  const { input } = scenario.finalize();
  if (options.withData && resource.packageId === 'orders-business') {
    const onDisk = writeRaw(scenario.ws.packageRoots['orders-business']!, resource.path, bytes);
    assert.equal(onDisk.digest, resource.digest);
  }
  const ref = elementRefOf(scenario.appMain as ElementDefinition);
  const packages: DomainPackageManifest[] = (input.packages as readonly DomainPackageManifest[]).map((pkg) =>
    pkg.id === 'orders-business'
      ? { ...pkg, workflowRoots: [{
        element: options.workflowElementId ? { ...ref, id: options.workflowElementId } : ref,
        contentId: 'business-flow',
      }] }
      : pkg);
  return {
    input: { ...input, packages },
    ref, resource, workflow,
  };
}

function accepted(result: BuildResult): Extract<BuildResult, { ok: true }> {
  assert.equal(result.ok, true, result.ok ? '' : `${result.code}: ${result.message}`);
  if (!result.ok) throw new Error(result.message);
  return result;
}

function rejected(result: BuildResult, code: string): void {
  assert.equal(result.ok, false, result.ok ? 'BUILD must reject' : result.message);
  if (!result.ok) assert.equal(result.code, code);
}

test('T12 R1: the existing BUILD selects and pins one real Workflow definition and Function in one Lock', (t) => {
  const { input, ref, workflow } = workflowCase(t);
  const a = accepted(buildApp(input));
  const b = accepted(buildApp(input));
  assert.deepEqual(a.lockBytes, b.lockBytes, 'only one deterministic Lock is used');
  assert.equal(a.appPackage.packageDigest, b.appPackage.packageDigest);
  assert.equal(a.lock.selectedWorkflows?.length, 1);
  const selected = a.lock.selectedWorkflows![0]!;
  assert.deepEqual(selected.ref, { element: ref, contentId: 'business-flow' });
  assert.equal(selected.ownerPackageId, 'orders-business');
  assert.equal(selected.definitionDigest, contentDigestOf(workflow as unknown as JsonValue));
  assert.equal(selected.definition.nodes[0]?.id, 'assess');
  assert.ok(a.lock.selectedPackages.find((pkg) =>
    pkg.packageId === 'orders-business')?.workflowRoots?.some((root) => root.element.digest === ref.digest));
  assert.ok(a.lock.selectedFunctions.some((selectedFunction) =>
    selectedFunction.ref.element.id === 'orders.eligibility' &&
    selectedFunction.ref.functionId === 'evaluate'));
});

test('T12 R1: real YAML resource bytes are sealed without pretending a generic ContentBlock.ref is JSON', (t) => {
  const { input, resource } = workflowCase(t, { format: 'yaml', withData: true });
  const a = accepted(buildApp(input));
  assert.equal(a.lock.resourceDigests[`${resource.packageId}/${resource.path}`], resource.digest);
  assert.ok(a.appPackage.files.some((file) => file.digest === resource.digest),
    'verified YAML bytes must enter actual composed App Package');
});

test('T12 R1: real JSON reader data is also sealed into the existing package', (t) => {
  const { input, resource } = workflowCase(t, { format: 'json', withData: true });
  const a = accepted(buildApp(input));
  assert.equal(a.lock.resourceDigests[`${resource.packageId}/${resource.path}`], resource.digest);
});

test('T12 R1: malformed selected Workflow identity is rejected before Runtime', (t) => {
  const { input } = workflowCase(t, { workflowElementId: 'orders.missing' });
  rejected(buildApp(input), 'DH_BUILD_REF_UNRESOLVED');
});

test('T12 R1: the existing BUILD rejects a selected workflow node without real FunctionRef', (t) => {
  const { input } = workflowCase(t, { badNodeFunction: true });
  rejected(buildApp(input), 'DH_BUILD_REF_UNRESOLVED');
});

test('T12 R1: Reader data cannot grow past declared UTF-8 size', (t) => {
  const { input } = workflowCase(t, { format: 'yaml', withData: true, dataMaxBytes: 2 });
  rejected(buildApp(input), 'DH_BUILD_SCHEMA_INVALID');
});

test('T12 R1: a Workflow cannot read unselected or undeclared Extension data', (t) => {
  const { input } = workflowCase(t, { format: 'yaml', withData: true, sourcePackage: 'unauthorized-provider' });
  rejected(buildApp(input), 'DH_BUILD_DEPENDS_ON_UNSELECTED');
});

test('T12 R1: a Package without Workflow is still valid and has no synthetic Task', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const result = accepted(buildApp(input));
  assert.equal(result.lock.selectedWorkflows, undefined);
  assert.equal(result.lock.selectedPackages.some((pkg) => pkg.workflowRoots !== undefined), false);
});
