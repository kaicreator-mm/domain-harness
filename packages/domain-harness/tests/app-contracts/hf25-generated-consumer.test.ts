/**
 * v0.8 T-G #1006 / HF25: consumer of the REAL generated TypeScript App
 * contract artifact. The existing generation.test.ts pins this exact artifact
 * byte-for-byte to generateTypedAppContracts() output.
 *
 * Every conditional-type "false" below is a compile-time NEGATIVE oracle:
 * if codegen silently widens a literal command/view/event ID, drops a
 * required field, or widens a schema, the TS test-tail fails to compile.
 * No runtime authority or API-compatibility promise is inferred from this.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { APP_CONTRACT_FORMAT } from '../fixtures/app-contracts/order-app.generated.js';
import type {
  AppCommand,
  AppCommandId,
  AppCommandOutcome,
  AppDomainEvent,
  AppDomainEventId,
  AppViewId,
  AppViewRequest,
  AppWatchId,
  AppWatchRequest,
  Schema_SubmitOrderOutcome,
  Schema_SubmitOrderPayload,
} from '../fixtures/app-contracts/order-app.generated.js';

test('HF25-P: a typed consumer constructs a real generated command, outcome, view, watch and event', () => {
  const command: AppCommand<'submitOrder'> = {
    commandId: 'submitOrder',
    payload: { orderId: 'order-1', amount: 10, tags: ['retail'] },
  };
  const outcome: AppCommandOutcome<'submitOrder'> = { status: 'accepted', sequence: 1 };
  const view: AppViewRequest<'orderSummary'> = { viewId: 'orderSummary', input: { orderId: 'order-1' } };
  const watch: AppWatchRequest<'watchOrderSummary'> = { watchId: 'watchOrderSummary', input: { orderId: 'order-1' } };
  const event: AppDomainEvent<'orderChanged'> = {
    type: 'orderChanged',
    payload: { orderId: 'order-1', status: 'accepted' },
  };

  assert.equal(APP_CONTRACT_FORMAT, 'domain-harness.app-contracts.v1');
  assert.equal(command.payload.amount, 10);
  assert.equal(outcome.status, 'accepted');
  assert.equal(view.input.orderId, watch.input.orderId);
  assert.equal(event.payload.status, 'accepted');
});

test('HF25-N: generated type consumer rejects unknown IDs and widened/incomplete schema statically', () => {
  const unknownCommandAllowed: 'deleteOrder' extends AppCommandId ? true : false = false;
  const unknownViewAllowed: 'secretView' extends AppViewId ? true : false = false;
  const unknownWatchAllowed: 'hiddenWatch' extends AppWatchId ? true : false = false;
  const unknownEventAllowed: 'adminOverride' extends AppDomainEventId ? true : false = false;

  const missingRequiredAmountAllowed: { readonly orderId: string } extends Schema_SubmitOrderPayload ? true : false = false;
  const stringAmountAllowed: { readonly orderId: string; readonly amount: string } extends Schema_SubmitOrderPayload ? true : false = false;
  const acceptedWithoutSequenceAllowed: { readonly status: 'accepted' } extends Schema_SubmitOrderOutcome ? true : false = false;
  const inventedOutcomeStatusAllowed: { readonly status: 'undocumented' } extends Schema_SubmitOrderOutcome ? true : false = false;

  assert.deepEqual(
    {
      unknownCommandAllowed,
      unknownViewAllowed,
      unknownWatchAllowed,
      unknownEventAllowed,
      missingRequiredAmountAllowed,
      stringAmountAllowed,
      acceptedWithoutSequenceAllowed,
      inventedOutcomeStatusAllowed,
    },
    {
      unknownCommandAllowed: false,
      unknownViewAllowed: false,
      unknownWatchAllowed: false,
      unknownEventAllowed: false,
      missingRequiredAmountAllowed: false,
      stringAmountAllowed: false,
      acceptedWithoutSequenceAllowed: false,
      inventedOutcomeStatusAllowed: false,
    },
  );
});
