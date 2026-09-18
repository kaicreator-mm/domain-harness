import type {
  ConformanceQueryResult,
  InstanceObservation,
  MessageAcceptanceObservation,
  RuntimeConformanceHost,
} from './contracts.ts';
import {
  APPROVE_PAYLOAD,
  AUDIT_ADDRESS,
  FAIL_PAYLOAD,
  FAILURE_ADDRESS,
  FAILURE_INPUT,
  HAPPY_ADDRESS,
  HAPPY_INPUT,
  PORTABLE_RUNTIME_FIXTURE,
  QUOTE_PAYLOAD,
  RACE_ADDRESS,
} from './fixtures.ts';
import { assertSemanticEqual } from './semantic.ts';

export interface ConformanceReport {
  suite: 'domain-harness-v0.2-g30';
  fixture: string;
  observations: {
    happy: unknown;
    dedupRace: unknown;
    failure: unknown;
  };
}

const EXPECTED_REPORT: ConformanceReport = {
  suite: 'domain-harness-v0.2-g30',
  fixture: PORTABLE_RUNTIME_FIXTURE.id,
  observations: {
    happy: {
      opened: instance({ lifecycle: 'waiting', stateRevision: 0, state: { phase: 'draft', total: null } }),
      unsupported: { status: 'rejected', code: 'message_contract_not_found' },
      quoteAccepted: acceptance('accepted', 'msg-quote-001', 1),
      quoteDuplicate: acceptance('duplicate', 'msg-quote-001', 1),
      afterQuote: instance({ lifecycle: 'waiting', stateRevision: 1, state: { phase: 'quoted', total: 42 } }),
      quoteDisposition: {
        kind: 'message-disposition',
        value: {
          messageId: 'msg-quote-001',
          target: HAPPY_ADDRESS,
          targetSequence: 1,
          disposition: 'processed',
          correlationId: 'corr-happy-001',
        },
      },
      projection: {
        kind: 'projection',
        value: {
          projectionId: PORTABLE_RUNTIME_FIXTURE.projectionId,
          key: HAPPY_ADDRESS.instanceKey,
          value: { orderId: HAPPY_ADDRESS.instanceKey, phase: 'quoted', total: 42 },
          workflowSources: [
            {
              address: HAPPY_ADDRESS,
              stateRevision: 1,
              state: { phase: 'quoted', total: 42 },
            },
          ],
        },
      },
      approveAccepted: acceptance('accepted', 'msg-approve-001', 2),
      completed: instance({
        lifecycle: 'completed',
        stateRevision: 2,
        state: { phase: 'completed', total: 42 },
        output: { total: 42 },
      }),
      afterTerminal: { status: 'rejected', code: 'target_not_accepting' },
      tools: [
        {
          toolId: 'quote-total',
          effect: 'none',
          input: QUOTE_PAYLOAD,
          output: { total: 42 },
        },
      ],
      emitted: [
        {
          target: AUDIT_ADDRESS,
          type: 'order.completed',
          payload: { orderId: HAPPY_ADDRESS.instanceKey, total: 42 },
          correlationId: 'corr-happy-001',
          causationId: 'msg-approve-001',
        },
      ],
    },
    dedupRace: {
      opened: raceInstance({ lifecycle: 'waiting', stateRevision: 0, state: { phase: 'draft', total: null } }),
      outcomes: [
        raceAcceptance('accepted', 'msg-race-001', 1),
        raceAcceptance('duplicate', 'msg-race-001', 1),
      ],
      afterSettle: raceInstance({
        lifecycle: 'waiting',
        stateRevision: 1,
        state: { phase: 'quoted', total: 42 },
      }),
      disposition: {
        kind: 'message-disposition',
        value: {
          messageId: 'msg-race-001',
          target: RACE_ADDRESS,
          targetSequence: 1,
          disposition: 'processed',
          correlationId: 'corr-race-001',
        },
      },
      tools: [
        {
          toolId: 'quote-total',
          effect: 'none',
          input: QUOTE_PAYLOAD,
          output: { total: 42 },
        },
      ],
    },
    failure: {
      opened: failureInstance({ lifecycle: 'waiting', stateRevision: 0, state: { phase: 'draft', total: null } }),
      failAccepted: failureAcceptance('accepted', 'msg-fail-001', 1),
      recoveryRequired: failureInstance({
        lifecycle: 'recovery_required',
        stateRevision: 0,
        state: { phase: 'draft', total: null },
        failure: {
          code: PORTABLE_RUNTIME_FIXTURE.deterministicFailureCode,
          sourceMessageId: 'msg-fail-001',
        },
      }),
      failureQuery: {
        kind: 'runtime-failure',
        value: {
          code: PORTABLE_RUNTIME_FIXTURE.deterministicFailureCode,
          sourceMessageId: 'msg-fail-001',
        },
      },
      failDisposition: {
        kind: 'message-disposition',
        value: {
          messageId: 'msg-fail-001',
          target: FAILURE_ADDRESS,
          targetSequence: 1,
          disposition: 'failed',
          correlationId: 'corr-failure-001',
          failure: {
            code: PORTABLE_RUNTIME_FIXTURE.deterministicFailureCode,
            sourceMessageId: 'msg-fail-001',
          },
        },
      },
      afterFailure: { status: 'rejected', code: 'target_not_accepting' },
      tools: [
        {
          toolId: 'fixture-failure',
          effect: 'idempotent',
          input: FAIL_PAYLOAD,
          failureCode: PORTABLE_RUNTIME_FIXTURE.deterministicFailureCode,
        },
      ],
      emitted: [],
    },
  },
};

export function expectedConformanceReport(): ConformanceReport {
  return clone(EXPECTED_REPORT);
}

export async function collectConformanceReport(host: RuntimeConformanceHost): Promise<ConformanceReport> {
  return {
    suite: 'domain-harness-v0.2-g30',
    fixture: PORTABLE_RUNTIME_FIXTURE.id,
    observations: {
      happy: await collectHappyPath(host),
      dedupRace: await collectDedupRace(host),
      failure: await collectFailurePath(host),
    },
  };
}

export async function runRuntimeConformanceSuite(host: RuntimeConformanceHost): Promise<ConformanceReport> {
  const report = await collectConformanceReport(host);
  assertSemanticEqual(report, EXPECTED_REPORT, `${host.label} G30`);
  return report;
}

async function collectHappyPath(host: RuntimeConformanceHost): Promise<unknown> {
  const session = await host.createSession(PORTABLE_RUNTIME_FIXTURE);
  try {
    const opened = await session.openInstance({
      address: HAPPY_ADDRESS,
      correlationId: 'corr-happy-001',
      input: HAPPY_INPUT,
    });

    const unsupported = await session.send({
      messageId: 'msg-unsupported-001',
      target: HAPPY_ADDRESS,
      type: 'unsupported',
      payload: {},
      contractVersion: PORTABLE_RUNTIME_FIXTURE.messageContractVersion,
    });

    const quote = {
      messageId: 'msg-quote-001',
      target: HAPPY_ADDRESS,
      type: 'quote',
      payload: QUOTE_PAYLOAD,
      correlationId: 'corr-happy-001',
      contractVersion: PORTABLE_RUNTIME_FIXTURE.messageContractVersion,
    } as const;
    const quoteAccepted = await session.send(quote);
    const quoteDuplicate = await session.send(quote);
    await session.settle(HAPPY_ADDRESS);

    const afterQuote = requireInstance(await session.query({ kind: 'instance', target: HAPPY_ADDRESS }));
    const quoteDisposition = await session.query({
      kind: 'message-disposition',
      target: HAPPY_ADDRESS,
      messageId: quote.messageId,
    });
    const projection = await session.query({
      kind: 'projection',
      projectionId: PORTABLE_RUNTIME_FIXTURE.projectionId,
      key: HAPPY_ADDRESS.instanceKey,
    });

    const approveAccepted = await session.send({
      messageId: 'msg-approve-001',
      target: HAPPY_ADDRESS,
      type: 'approve',
      payload: APPROVE_PAYLOAD,
      correlationId: 'corr-happy-001',
      contractVersion: PORTABLE_RUNTIME_FIXTURE.messageContractVersion,
    });
    await session.settle(HAPPY_ADDRESS);

    const completed = requireInstance(await session.query({ kind: 'instance', target: HAPPY_ADDRESS }));
    const afterTerminal = await session.send({
      messageId: 'msg-after-terminal-001',
      target: HAPPY_ADDRESS,
      type: 'quote',
      payload: QUOTE_PAYLOAD,
      contractVersion: PORTABLE_RUNTIME_FIXTURE.messageContractVersion,
    });

    return {
      opened,
      unsupported,
      quoteAccepted,
      quoteDuplicate,
      afterQuote,
      quoteDisposition,
      projection,
      approveAccepted,
      completed,
      afterTerminal,
      tools: await session.toolInvocations(),
      emitted: await session.emittedMessages(),
    };
  } finally {
    await session.dispose();
  }
}

async function collectDedupRace(host: RuntimeConformanceHost): Promise<unknown> {
  const session = await host.createSession(PORTABLE_RUNTIME_FIXTURE);
  try {
    const opened = await session.openInstance({
      address: RACE_ADDRESS,
      correlationId: 'corr-race-001',
      input: HAPPY_INPUT,
    });
    const message = {
      messageId: 'msg-race-001',
      target: RACE_ADDRESS,
      type: 'quote',
      payload: QUOTE_PAYLOAD,
      correlationId: 'corr-race-001',
      contractVersion: PORTABLE_RUNTIME_FIXTURE.messageContractVersion,
    } as const;

    const outcomes = sortAcceptanceOutcomes(
      await Promise.all([session.send(message), session.send(message)]),
    );
    await session.settle(RACE_ADDRESS);

    const afterSettle = requireInstance(await session.query({ kind: 'instance', target: RACE_ADDRESS }));
    const disposition = await session.query({
      kind: 'message-disposition',
      target: RACE_ADDRESS,
      messageId: message.messageId,
    });

    return {
      opened,
      outcomes,
      afterSettle,
      disposition,
      tools: await session.toolInvocations(),
    };
  } finally {
    await session.dispose();
  }
}

async function collectFailurePath(host: RuntimeConformanceHost): Promise<unknown> {
  const session = await host.createSession(PORTABLE_RUNTIME_FIXTURE);
  try {
    const opened = await session.openInstance({
      address: FAILURE_ADDRESS,
      correlationId: 'corr-failure-001',
      input: FAILURE_INPUT,
    });
    const failAccepted = await session.send({
      messageId: 'msg-fail-001',
      target: FAILURE_ADDRESS,
      type: 'fail',
      payload: FAIL_PAYLOAD,
      correlationId: 'corr-failure-001',
      contractVersion: PORTABLE_RUNTIME_FIXTURE.messageContractVersion,
    });
    await session.settle(FAILURE_ADDRESS);

    const recoveryRequired = requireInstance(
      await session.query({ kind: 'instance', target: FAILURE_ADDRESS }),
    );
    const failureQuery = await session.query({ kind: 'runtime-failure', target: FAILURE_ADDRESS });
    const failDisposition = await session.query({
      kind: 'message-disposition',
      target: FAILURE_ADDRESS,
      messageId: 'msg-fail-001',
    });
    const afterFailure = await session.send({
      messageId: 'msg-after-failure-001',
      target: FAILURE_ADDRESS,
      type: 'quote',
      payload: QUOTE_PAYLOAD,
      contractVersion: PORTABLE_RUNTIME_FIXTURE.messageContractVersion,
    });

    return {
      opened,
      failAccepted,
      recoveryRequired,
      failureQuery,
      failDisposition,
      afterFailure,
      tools: await session.toolInvocations(),
      emitted: await session.emittedMessages(),
    };
  } finally {
    await session.dispose();
  }
}

function requireInstance(result: ConformanceQueryResult): InstanceObservation {
  if (result.kind !== 'instance' || result.value === null) {
    throw new Error(`Expected instance query result, received ${result.kind}`);
  }
  return result.value;
}

function acceptance(
  status: 'accepted' | 'duplicate',
  messageId: string,
  targetSequence: number,
): MessageAcceptanceObservation {
  return { status, messageId, target: HAPPY_ADDRESS, targetSequence };
}

function raceAcceptance(
  status: 'accepted' | 'duplicate',
  messageId: string,
  targetSequence: number,
): MessageAcceptanceObservation {
  return { status, messageId, target: RACE_ADDRESS, targetSequence };
}

function failureAcceptance(
  status: 'accepted' | 'duplicate',
  messageId: string,
  targetSequence: number,
): MessageAcceptanceObservation {
  return { status, messageId, target: FAILURE_ADDRESS, targetSequence };
}

function sortAcceptanceOutcomes(
  outcomes: readonly MessageAcceptanceObservation[],
): MessageAcceptanceObservation[] {
  const order = { accepted: 0, duplicate: 1, rejected: 2 } as const;
  return [...outcomes].sort((left, right) => order[left.status] - order[right.status]);
}

function instance(input: Omit<InstanceObservation, 'address' | 'correlationId'>): InstanceObservation {
  return { address: HAPPY_ADDRESS, correlationId: 'corr-happy-001', ...input };
}

function raceInstance(input: Omit<InstanceObservation, 'address' | 'correlationId'>): InstanceObservation {
  return { address: RACE_ADDRESS, correlationId: 'corr-race-001', ...input };
}

function failureInstance(input: Omit<InstanceObservation, 'address' | 'correlationId'>): InstanceObservation {
  return { address: FAILURE_ADDRESS, correlationId: 'corr-failure-001', ...input };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
