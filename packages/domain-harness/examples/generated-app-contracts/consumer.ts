import type {
  AppCommand,
  AppCommandOutcome,
  AppDomainEvent,
  AppViewRequest,
  AppWatchRequest,
} from './order-app.generated.js';

export function submitOrder(orderId: string, amount: number): AppCommand<'submitOrder'> {
  return {
    commandId: 'submitOrder',
    payload: { orderId, amount },
  };
}

export function orderSummary(orderId: string): AppViewRequest<'orderSummary'> {
  return { viewId: 'orderSummary', input: { orderId } };
}

export function watchOrderSummary(orderId: string): AppWatchRequest<'watchOrderSummary'> {
  return { watchId: 'watchOrderSummary', input: { orderId } };
}

export function handleSubmitOutcome(outcome: AppCommandOutcome<'submitOrder'>): string {
  return outcome.status === 'accepted'
    ? `accepted:${outcome.sequence}`
    : `rejected:${outcome.reason}`;
}

export function handleDomainEvent(event: AppDomainEvent<'orderChanged'>): string {
  return `${event.payload.orderId}:${event.payload.status}`;
}
