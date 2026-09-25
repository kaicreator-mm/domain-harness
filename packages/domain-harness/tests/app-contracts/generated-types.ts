import type {
  AppCommand,
  AppCommandOutcome,
  AppDomainEvent,
  AppViewRequest,
  AppViewResult,
  AppWatchRequest,
  AppWatchValue,
} from '../fixtures/app-contracts/order-app.generated.js';

const command: AppCommand<'submitOrder'> = {
  commandId: 'submitOrder',
  payload: { orderId: 'O-100', amount: 42, tags: ['priority'] },
};
void command;

const accepted: AppCommandOutcome<'submitOrder'> = { status: 'accepted', sequence: 3 };
void accepted;
const rejected: AppCommandOutcome<'submitOrder'> = {
  status: 'rejected',
  reason: 'credit_hold',
};
void rejected;

const viewRequest: AppViewRequest<'orderSummary'> = {
  viewId: 'orderSummary',
  input: { orderId: 'O-100' },
};
void viewRequest;
const viewResult: AppViewResult<'orderSummary'> = {
  orderId: 'O-100',
  status: 'pending',
  amount: 42,
};
void viewResult;

const watchRequest: AppWatchRequest<'watchOrderSummary'> = {
  watchId: 'watchOrderSummary',
  input: { orderId: 'O-100' },
};
void watchRequest;
const watchValue: AppWatchValue<'watchOrderSummary'> = viewResult;
void watchValue;

const event: AppDomainEvent<'orderChanged'> = {
  type: 'orderChanged',
  payload: { orderId: 'O-100', status: 'accepted' },
};
void event;

const invalidCommand: AppCommand<'submitOrder'> = {
  commandId: 'submitOrder',
  // @ts-expect-error command payload is generated from the exact compiled message schema.
  payload: { amount: 42 },
};
void invalidCommand;

// @ts-expect-error outcome status is constrained by the compiled outcome schema.
const invalidOutcome: AppCommandOutcome<'submitOrder'> = { status: 'unknown' };
void invalidOutcome;

const leakedRouting: AppCommand<'submitOrder'> = {
  commandId: 'submitOrder',
  // @ts-expect-error internal workflow routing is deliberately absent from the App contract.
  workflowId: 'orderLifecycle',
  payload: { orderId: 'O-100', amount: 42 },
};
void leakedRouting;
