import type { ConformanceFixture, JsonValue, WorkflowAddress } from './contracts.ts';

export const PORTABLE_RUNTIME_FIXTURE: ConformanceFixture = Object.freeze({
  id: 'domain-harness-v0.2-portability',
  workflowId: 'order',
  auditWorkflowId: 'audit',
  messageContractVersion: '1',
  deterministicQuoteAdjustment: 2,
  deterministicFailureCode: 'fixture_tool_failure',
  projectionId: 'order-summary',
});

export const HAPPY_ADDRESS: WorkflowAddress = Object.freeze({
  workflowId: PORTABLE_RUNTIME_FIXTURE.workflowId,
  instanceKey: 'order-001',
});

export const FAILURE_ADDRESS: WorkflowAddress = Object.freeze({
  workflowId: PORTABLE_RUNTIME_FIXTURE.workflowId,
  instanceKey: 'order-failure',
});

export const RACE_ADDRESS: WorkflowAddress = Object.freeze({
  workflowId: PORTABLE_RUNTIME_FIXTURE.workflowId,
  instanceKey: 'order-race',
});

export const AUDIT_ADDRESS: WorkflowAddress = Object.freeze({
  workflowId: PORTABLE_RUNTIME_FIXTURE.auditWorkflowId,
  instanceKey: 'audit-001',
});

export const HAPPY_INPUT: JsonValue = Object.freeze({ customerId: 'customer-001' });
export const FAILURE_INPUT: JsonValue = Object.freeze({ customerId: 'customer-failure' });

export const QUOTE_PAYLOAD: JsonValue = Object.freeze({ quantity: 2, unitPrice: 20 });
export const APPROVE_PAYLOAD: JsonValue = Object.freeze({ approvedBy: 'fixture-user' });
export const FAIL_PAYLOAD: JsonValue = Object.freeze({ reason: 'fixture-controlled-failure' });
