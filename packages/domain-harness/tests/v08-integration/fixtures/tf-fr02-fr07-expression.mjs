/**
 * Business Domain Package — #1018 T-F FR02 selected-path expression oracle v1.0.0
 * ===============================================================================
 *
 * Test-only Business package authored for the #1003 / PR #1018 selected-path
 * rebind of the WEB-ORACLE-1 FR02 sentinels (V08-FR02-P-F01, N-F02, N-F03).
 *
 * Every intent is bound to a data-only Standard SDK Rule declaration that
 * carries a `payloadExpression` (merged FR02, PR #1019). The selected path is:
 *
 *   authenticated gateway.send → K per-instance lane → S interpret(rule)
 *     → bounded deterministic expression (logical-time $now/$millis,
 *       $eval/$random/clock-argument denials, UTF-8 byte limits,
 *       deterministic step budget)
 *     → K central admission (this schema → guard → transition →
 *       durable Effect Journal → state CAS).
 *
 * The K guard `guard:fr02-legacy-exact` is the K-owned observation of the
 * EXACT v0.7 result: an admitted occurrence proves the event payload had
 * value=42, now=2026-09-17T02:00:00.123Z and millis=1789610400123, and the
 * schema below proves the payload carries no other key.
 *
 * This package owns business policy ONLY — no admission/journal/state
 * mechanism code, no kernel imports, no imports at all.
 *
 * Kernel ABI: v08-business-abi/1 — endpoint export `getPolicy()`.
 */

export const MODULE_ID = 'business-tf-fr02-expression@v08.1.0.0';
export const PACKAGE_KIND = 'business';
export const ABI_VERSION = 'v08-business-abi/1';
export const ENDPOINTS = [
  { endpointId: 'business:tf-fr02-expression', kind: 'business-policy' },
];

const LEGACY_CLOCK = '2026-09-17T02:00:00.123Z';
const LEGACY_MILLIS = 1789610400123;
const SHIFTED_CLOCK = '2027-01-02T03:04:05.678Z';
const SHIFTED_MILLIS = 1798859045678;
const LEGACY_EXPRESSION = '{"value": input.value * 2, "now": $now(), "millis": $millis()}';
const BUDGET_EXPRESSION = `{"items": [${Array.from({ length: 1000 }, () => '1').join(',')}]}`;

/** Intent type → [ruleId, event type, payloadExpression]. */
const SCENARIOS = {
  evaluateLegacy: ['rule:fr02-legacy', 'FR02_LEGACY', { source: LEGACY_EXPRESSION, logicalTime: LEGACY_CLOCK }],
  evaluateShifted: ['rule:fr02-shifted', 'FR02_SHIFTED', { source: LEGACY_EXPRESSION, logicalTime: SHIFTED_CLOCK }],
  evaluateEval: ['rule:fr02-eval', 'FR02_DENIED', { source: '$eval("1+1")', logicalTime: LEGACY_CLOCK }],
  evaluateEvalVariable: ['rule:fr02-eval-variable', 'FR02_DENIED', { source: '{"v": input.value + $eval}', logicalTime: LEGACY_CLOCK }],
  evaluateRandom: ['rule:fr02-random', 'FR02_DENIED', { source: '{"r": $random()}', logicalTime: LEGACY_CLOCK }],
  evaluateNowArgument: ['rule:fr02-now-argument', 'FR02_DENIED', { source: '{"now": $now("[Y]")}', logicalTime: LEGACY_CLOCK }],
  evaluateMillisArgument: ['rule:fr02-millis-argument', 'FR02_DENIED', { source: '{"millis": $millis("ignored")}', logicalTime: LEGACY_CLOCK }],
  // '{"input":{"text":"缅甸"}}' is 23 UTF-16 code units but 27 UTF-8 bytes.
  evaluateInputBytesOver: ['rule:fr02-input-bytes-over', 'FR02_BYTES', { source: '{"t": input.text}', logicalTime: LEGACY_CLOCK, maxInputBytes: 26 }],
  evaluateInputBytesExact: ['rule:fr02-input-bytes-exact', 'FR02_BYTES', { source: '{"t": input.text}', logicalTime: LEGACY_CLOCK, maxInputBytes: 27 }],
  // '{"t":"缅甸"}' is 10 UTF-16 code units but 14 UTF-8 bytes.
  evaluateOutputBytesOver: ['rule:fr02-output-bytes-over', 'FR02_BYTES', { source: '{"t": input.text}', logicalTime: LEGACY_CLOCK, maxOutputBytes: 13 }],
  evaluateOutputBytesExact: ['rule:fr02-output-bytes-exact', 'FR02_BYTES', { source: '{"t": input.text}', logicalTime: LEGACY_CLOCK, maxOutputBytes: 14 }],
  // timeoutMs is a deterministic step budget (512 steps per declared ms).
  evaluateBudgetOver: ['rule:fr02-budget-over', 'FR02_BUDGET', { source: BUDGET_EXPRESSION, logicalTime: LEGACY_CLOCK, timeoutMs: 1 }],
  evaluateBudgetFits: ['rule:fr02-budget-fits', 'FR02_BUDGET', { source: BUDGET_EXPRESSION, logicalTime: LEGACY_CLOCK, timeoutMs: 2 }],
};

/** Intent types this policy binds. */
export const INTENT_TYPES = Object.keys(SCENARIOS);
/** Effect types this policy declares handlers for. */
export const EFFECT_TYPES = ['effect:record'];

const EVENT_TYPES = ['FR02_LEGACY', 'FR02_SHIFTED', 'FR02_DENIED', 'FR02_BYTES', 'FR02_BUDGET'];

function eventEquals(field, value) {
  return {
    op: 'eq',
    left: { source: 'event', path: ['payload', field] },
    right: { source: 'literal', value },
  };
}

const GUARDS = [
  {
    guardId: 'guard:fr02-legacy-exact',
    predicate: {
      op: 'all',
      predicates: [eventEquals('value', 42), eventEquals('now', LEGACY_CLOCK), eventEquals('millis', LEGACY_MILLIS)],
    },
  },
  {
    guardId: 'guard:fr02-shifted-exact',
    predicate: {
      op: 'all',
      predicates: [eventEquals('value', 42), eventEquals('now', SHIFTED_CLOCK), eventEquals('millis', SHIFTED_MILLIS)],
    },
  },
  { guardId: 'guard:fr02-bytes-exact', predicate: eventEquals('t', '缅甸') },
];

const GUARD_FOR_EVENT = {
  FR02_LEGACY: 'guard:fr02-legacy-exact',
  FR02_SHIFTED: 'guard:fr02-shifted-exact',
  FR02_BYTES: 'guard:fr02-bytes-exact',
};

function expressionDefinition() {
  return {
    workflowKey: 'tf-fr02-expression',
    initialState: 'review',
    initialContext: {},
    guards: GUARDS,
    states: [
      {
        stateKey: 'review',
        transitions: EVENT_TYPES.map((eventType) => ({
          transitionKey: `evaluate:${eventType}`,
          trigger: { kind: 'event', eventType },
          targetState: 'evaluated',
          ...(GUARD_FOR_EVENT[eventType] === undefined ? {} : { guardId: GUARD_FOR_EVENT[eventType] }),
          effectIntents: [
            {
              effectType: 'effect:record',
              input: { record: `fr02:${eventType}` },
              idempotencyKey: `record:fr02:${eventType}`,
            },
          ],
        })),
      },
      { stateKey: 'evaluated', kind: 'final' },
    ],
  };
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

const EXACT_KEYS = {
  FR02_LEGACY: { value: 'number', now: 'string', millis: 'number' },
  FR02_SHIFTED: { value: 'number', now: 'string', millis: 'number' },
  FR02_BYTES: { t: 'string' },
};

/**
 * Business-owned structural schema evaluated inside K central admission:
 * the Standard Rule shape (outcome 'decide', decision.data identical to the
 * event payload) and, for the oracle events, the EXACT key set and types.
 */
const decisionSchema = {
  isValid(value) {
    if (!isRecord(value) || !isRecord(value.decision) || !isRecord(value.event)) return false;
    if (value.decision.outcome !== 'decide') return false;
    if (!EVENT_TYPES.includes(value.event.type)) return false;
    const payload = value.event.payload;
    if (!isRecord(payload) || !sameJson(value.decision.data, payload)) return false;
    const exact = EXACT_KEYS[value.event.type];
    if (exact === undefined) return true;
    const keys = Object.keys(payload).sort();
    if (!sameJson(keys, Object.keys(exact).sort())) return false;
    return keys.every((key) => typeof payload[key] === exact[key]);
  },
};

function rules() {
  const out = {};
  for (const [ruleId, eventType, payloadExpression] of Object.values(SCENARIOS)) {
    out[ruleId] = { kind: 'rule', id: ruleId, eventType, payloadExpression: { ...payloadExpression } };
  }
  return out;
}

function intentBindings() {
  const out = {};
  for (const [intentType, [ruleId, eventType]] of Object.entries(SCENARIOS)) {
    out[intentType] = {
      trigger: { kind: 'event', eventType },
      ruleId,
      roles: ['requester'],
    };
  }
  return out;
}

export function getPolicy() {
  return {
    packageId: MODULE_ID,
    policyId: 'tf-fr02-expression',
    domainId: 'oracle',
    workflowDefinition: expressionDefinition(),
    strictWorkflowDefinition: expressionDefinition(),
    decisionSchema,
    governanceSemantics: { hardInvariants: [] },
    initialStateKey: 'review',
    initialContext: {},
    rules: rules(),
    intentBindings: intentBindings(),
    effectBindings: {
      'effect:record': {
        semantics: 'non-idempotent',
        handler: async ({ input, effectId, resources }) => {
          if (resources === undefined) {
            throw new Error('effect:record requires the Host resource port');
          }
          return resources.call('ledger', 'record', { ...input, effectId });
        },
      },
    },
  };
}
