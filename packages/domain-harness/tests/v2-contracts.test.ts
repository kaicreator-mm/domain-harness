import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  DomainMessage,
  MessageAcceptedAck,
  PackageRegistry,
  RuntimeHostBindings,
  RuntimeStore,
  TargetCompiledDomainPackage,
  WorkflowAddress,
} from '../src/v2/index.js';
import { STANDARD_CAPABILITIES } from '../src/v2/index.js';

test('v0.2 contract foundation exposes stable workflow address and capability ids', () => {
  const address: WorkflowAddress = { workflowId: 'design', instanceKey: 'project-42' };
  const message: DomainMessage = {
    messageId: 'm-1',
    target: address,
    type: 'DesignRequested',
    payload: { revision: 1 },
    correlationId: 'project-42',
  };

  assert.equal(message.target.instanceKey, 'project-42');
  assert.equal(STANDARD_CAPABILITIES.sqliteRuntimeStore, 'sqlite-runtime-store@1');
});

type ContractSentinel =
  | RuntimeStore
  | RuntimeHostBindings
  | TargetCompiledDomainPackage
  | PackageRegistry
  | MessageAcceptedAck;

const contractSentinel: ContractSentinel | undefined = undefined;
void contractSentinel;
