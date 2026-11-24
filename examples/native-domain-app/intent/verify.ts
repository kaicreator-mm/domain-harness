import type { StandardWorkflowOutcome, WorkflowLimits } from '@kaicreator/domain-harness';
import { RepairQuoteElement, repairKnowledge } from './repair-quote.js';
import type { RepairRequest } from './repair-quote.js';
import { RevisedRepairQuoteElement, revisedRepairKnowledge } from './repair-quote-revised.js';
import { AirQualityElement, airKnowledge } from './air-quality.js';
import type { AirRequest } from './air-quality.js';

// 同一份验证代码既在仓内测试，也在独立安装的 Consumer 中运行。
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function expectStop(result: StandardWorkflowOutcome<unknown>, status: Exclude<StandardWorkflowOutcome<unknown>['status'], 'COMPLETE'>, code: string) {
  check(result.status === status, 'outcome: expected ' + status + ', got ' + result.status);
  check(result.reason.code === code && !Object.hasOwn(result, 'value'), 'wrong reason or nested non-success: ' + code);
}
const budget: WorkflowLimits = { maxCalls: 2, maxSteps: 5, maxDepth: 1 };
const criteria = { tenant: 'shop-a', service: 'brake', source: 'fixture-catalog', policyRevision: 'v1', asOf: 10 } as const;
const repair = { ...criteria, intents: ['quote'], quote: 70, inspection: 'ready' } as const satisfies RepairRequest;
function air(index: number): AirRequest {
  return { station: 'station-a', scheme: 'US_EPA_AQI', requestedDay: 10,
    observation: { index, day: 10, source: 'example-observation' } };
}

export const intentCases = [
  ['direct bounded queries share the SDK without mixing domain facts', async () => {
    const shop = new RepairQuoteElement('shop-a');
    const station = new AirQualityElement('station-a');
    const result = shop.lookup(criteria);
    check(result.complete && result.items.length === 1 && result.items[0] === repairKnowledge.rules[0], 'selected repair knowledge');
    check(shop.lookup({ ...criteria, tenant: 'shop-b' }).items.length === 0, 'cross-tenant lookup');
    check(shop.lookup({ ...criteria, source: 'other' }).items.length === 0, 'source filter');
    check(shop.lookup({ ...criteria, policyRevision: 'v2' }).items.length === 0, 'revision filter');
    check(shop.lookup({ ...criteria, asOf: 31 }).items.length === 0, 'validity filter');
    const partial = shop.lookup(criteria, { maxVisited: 1, maxReturned: 5 });
    check(!partial.complete && partial.items.length === 1 && partial.truncationReason === 'VISIT_LIMIT', 'partial positive is not a decision');
    const classified = station.lookup(51);
    check(classified.complete && classified.items.length === 1 && classified.items[0]?.category === 'MODERATE', 'air quality direct lookup');
    check(!station.lookup(51, { maxVisited: 1, maxReturned: 7 }).complete, 'air lookup truncation');
    check(shop.counters.recognition === 0 && station.counters.recognition === 0, 'direct lookups do not run workflows');
  }],
  ['immutable nested knowledge and statically selected revision', async () => {
    const original = repairKnowledge.rules[0];
    const revised = revisedRepairKnowledge[0];
    const firstBand = airKnowledge.bands[0];
    check(original && revised && firstBand, 'fixtures exist');
    for (const object of [repairKnowledge, repairKnowledge.rules, original, original.source, original.validity,
      revisedRepairKnowledge, revised, revised.source, revised.validity, airKnowledge, airKnowledge.source, airKnowledge.bands, firstBand]) {
      check(Object.isFrozen(object), 'knowledge nested object is frozen');
    }
    check(!Reflect.set(repairKnowledge.rules, '0', revised), 'cannot replace rule');
    check(!Reflect.set(original, 'ceiling', 1000), 'cannot change threshold');
    check(!Reflect.set(original.source, 'revision', 'v2'), 'cannot change source revision');
    check(!Reflect.set(original.validity, 'to', 999), 'cannot change applicability');
    check(!Reflect.set(airKnowledge.bands, 'length', 0) && !Reflect.set(firstBand, 'max', 500), 'cannot change AQI bands');
    check(!Reflect.set(airKnowledge.source, 'url', 'changed'), 'cannot change provenance');
    const oldShop = new RepairQuoteElement('shop-a');
    const newShop = new RevisedRepairQuoteElement('shop-a');
    const oldBefore = await oldShop.run({ ...repair, quote: 90 }, budget);
    expectStop(oldBefore.outcome, 'REJECT', 'REPAIR_QUOTE_OVER_LIMIT');
    const changed = await newShop.run({ ...repair, quote: 90, policyRevision: 'v2' }, budget);
    check(changed.outcome.status === 'COMPLETE' && changed.outcome.value.ceiling === 100 && changed.usedRule === revised, 'revised package decision');
    const oldAfter = await oldShop.run({ ...repair, quote: 90 }, budget);
    expectStop(oldAfter.outcome, 'REJECT', 'REPAIR_QUOTE_OVER_LIMIT');
    check(oldBefore.usedRule === original && oldAfter.usedRule === original && original.ceiling === 80, 'old package remains unchanged');
    expectStop((await oldShop.run({ ...repair, policyRevision: 'v2' }, budget)).outcome, 'UNKNOWN', 'REPAIR_RULE_UNRESOLVED');
  }],
  ['repair recognition preserves ASK REJECT WAIT UNKNOWN; only valid intents reach handling', async () => {
    const shop = new RepairQuoteElement('shop-a');
    const negatives: ReadonlyArray<readonly [RepairRequest, 'ASK' | 'REJECT' | 'WAIT' | 'UNKNOWN', string]> = [
      [{}, 'ASK', 'REPAIR_INPUT_REQUIRED'], [{ ...repair, intents: ['quote', 'status'] }, 'ASK', 'REPAIR_INPUT_REQUIRED'],
      [{ ...repair, tenant: 'shop-b' }, 'REJECT', 'REPAIR_SCOPE_OR_INPUT'], [{ ...repair, intents: ['cancel'] }, 'REJECT', 'REPAIR_SCOPE_OR_INPUT'],
      [{ ...repair, quote: -1 }, 'REJECT', 'REPAIR_SCOPE_OR_INPUT'], [{ ...repair, inspection: 'pending' }, 'WAIT', 'REPAIR_INSPECTION_PENDING'],
      [{ ...repair, source: 'unknown' }, 'UNKNOWN', 'REPAIR_RULE_UNRESOLVED'], [{ ...repair, policyRevision: 'v2' }, 'UNKNOWN', 'REPAIR_RULE_UNRESOLVED'],
      [{ ...repair, asOf: 31 }, 'UNKNOWN', 'REPAIR_RULE_UNRESOLVED'], [{ ...repair, service: 'paint' }, 'UNKNOWN', 'REPAIR_RULE_UNRESOLVED'],
      [{ ...repair, service: 'absent' }, 'UNKNOWN', 'REPAIR_RULE_UNRESOLVED'],
    ];
    for (const [input, status, code] of negatives) {
      const result = await shop.run(input, budget);
      expectStop(result.outcome, status, code);
      check(result.usedRule === undefined && shop.counters.handling === 0, 'recognition rejection cannot enter handler');
    }
    for (const query of [{ maxVisited: 1, maxReturned: 5 }, { maxVisited: 4, maxReturned: 1 }]) {
      const result = await shop.run(repair, budget, query);
      expectStop(result.outcome, 'UNKNOWN', 'REPAIR_QUERY_INCOMPLETE');
      check(result.usedRule === undefined && shop.counters.handling === 0, 'incomplete query cannot enter handler');
    }
    const good = await shop.run(repair, budget);
    check(good.outcome.status === 'COMPLETE' && good.outcome.value.approved && good.outcome.value.ruleId === 'a-brake' && good.usedRule === repairKnowledge.rules[0], 'repair successful evidence');
    const high = await shop.run({ ...repair, quote: 81 }, budget);
    expectStop(high.outcome, 'REJECT', 'REPAIR_QUOTE_OVER_LIMIT');
    check(high.usedRule === repairKnowledge.rules[0] && shop.counters.handling === 2, 'valid but refused intent uses actual evidence');
  }],
  ['source-derived AQI classification at all six range boundaries', async () => {
    const station = new AirQualityElement('station-a');
    const samples = [[0, 50, 'GOOD'], [51, 100, 'MODERATE'], [101, 150, 'SENSITIVE'],
      [151, 200, 'UNHEALTHY'], [201, 300, 'VERY_UNHEALTHY'], [301, 500, 'HAZARDOUS']] as const;
    for (const [min, max, category] of samples) {
      for (const value of [min, max]) {
        const result = await station.run(air(value), budget);
        check(result.status === 'COMPLETE' && result.value.index === value && result.value.category === category && result.value.day === 10, 'AQI category boundary');
        check(result.value.evidence.rule.category === category && result.value.evidence.source === airKnowledge.source && result.value.evidence.observationSource === 'example-observation', 'source and observation evidence');
      }
    }
    check(station.counters.recognition === 12 && station.counters.handling === 12, 'all boundaries used both roles');
  }],
  ['AQI missing stale foreign invalid and truncated facts never enter handling', async () => {
    const station = new AirQualityElement('station-a');
    const negatives: ReadonlyArray<readonly [AirRequest, 'ASK' | 'REJECT' | 'WAIT' | 'UNKNOWN', string]> = [
      [{ station: 'station-a' }, 'ASK', 'AQI_INPUT_REQUIRED'],
      [{ station: 'station-a', scheme: 'US_EPA_AQI', requestedDay: 10 }, 'ASK', 'AQI_OBSERVATION_REQUIRED'],
      [{ ...air(20), station: 'station-b' }, 'REJECT', 'AQI_SCOPE'], [{ ...air(20), scheme: 'other-scale' }, 'REJECT', 'AQI_SCOPE'],
      [{ ...air(20), pending: true }, 'WAIT', 'AQI_OBSERVATION_PENDING'], [air(-1), 'REJECT', 'AQI_INVALID_OBSERVATION'],
      [air(10.5), 'REJECT', 'AQI_INVALID_OBSERVATION'], [air(501), 'UNKNOWN', 'AQI_FACT_UNRESOLVED'],
      [{ ...air(20), requestedDay: 11 }, 'UNKNOWN', 'AQI_FACT_UNRESOLVED'],
      [{ ...air(20), observation: { index: 20, day: 10, source: 'unknown' } }, 'UNKNOWN', 'AQI_FACT_UNRESOLVED'],
    ];
    for (const [input, status, code] of negatives) expectStop(await station.run(input, budget), status, code);
    expectStop(await station.run(air(20), budget, { maxVisited: 1, maxReturned: 7 }), 'UNKNOWN', 'AQI_QUERY_INCOMPLETE');
    check(station.counters.handling === 0, 'unresolved AQI cannot enter handler');
  }],
  ['shared exact call step and depth budgets deny handling before invocation', async () => {
    const denied = [
      [{ ...budget, maxCalls: 1 }, 'WORKFLOW_CALL_BUDGET', 1],
      [{ ...budget, maxCalls: 0 }, 'WORKFLOW_CALL_BUDGET', 0],
      [{ ...budget, maxSteps: 3 }, 'WORKFLOW_STEP_BUDGET', 1],
      [{ ...budget, maxSteps: 4 }, 'WORKFLOW_STEP_BUDGET', 1],
      [{ ...budget, maxDepth: 0 }, 'WORKFLOW_DEPTH_LIMIT', 0],
    ] as const;
    for (const [limits, code, recognized] of denied) {
      const shop = new RepairQuoteElement('shop-a');
      const station = new AirQualityElement('station-a');
      const quote = await shop.run(repair, limits);
      expectStop(quote.outcome, 'FAILED', code);
      expectStop(await station.run(air(51), limits), 'FAILED', code);
      check(quote.usedRule === undefined && shop.counters.handling === 0 && station.counters.handling === 0, 'denied budget cannot enter handling');
      check(shop.counters.recognition === recognized && station.counters.recognition === recognized, 'budget counted actual entry');
    }
    const shop = new RepairQuoteElement('shop-a');
    const station = new AirQualityElement('station-a');
    check((await shop.run(repair, budget)).outcome.status === 'COMPLETE', 'exact repair budget');
    check((await station.run(air(51), budget)).status === 'COMPLETE', 'exact AQI budget');
    check(shop.counters.handling === 1 && station.counters.handling === 1, 'exact successful handling count');
  }],
  ['concurrent roots and independent local instances retain their own state and evidence', async () => {
    const a = new RepairQuoteElement('shop-a');
    const b = new RepairQuoteElement('shop-b');
    const [one, two, three] = await Promise.all([a.run(repair, budget), b.run({ ...repair, tenant: 'shop-b', quote: 90 }, budget), a.run({ ...repair, quote: 90 }, budget)]);
    check(one.outcome.status === 'COMPLETE' && one.outcome.value.tenant === 'shop-a' && one.outcome.value.ceiling === 80, 'tenant A decision');
    check(two.outcome.status === 'COMPLETE' && two.outcome.value.tenant === 'shop-b' && two.outcome.value.ceiling === 120, 'tenant B decision');
    expectStop(three.outcome, 'REJECT', 'REPAIR_QUOTE_OVER_LIMIT');
    check(one.usedRule === three.usedRule && one.usedRule !== two.usedRule && two.usedRule?.tenant === 'shop-b', 'per-request evidence');
    check(a.counters.recognition === 2 && a.counters.handling === 2 && b.counters.recognition === 1 && b.counters.handling === 1, 'independent instance counters');
    check(new RepairQuoteElement('shop-a').counters.handling === 0, 'new instance starts without old state');
    const first = new AirQualityElement('station-a');
    const second = new AirQualityElement('station-b');
    const results = await Promise.all([first.run(air(20), budget), second.run({ ...air(301), station: 'station-b' }, budget)]);
    check(results[0]?.status === 'COMPLETE' && results[0].value.station === 'station-a' && results[0].value.category === 'GOOD', 'first station');
    check(results[1]?.status === 'COMPLETE' && results[1].value.station === 'station-b' && results[1].value.category === 'HAZARDOUS', 'second station');
    check(first.counters.handling === 1 && second.counters.handling === 1, 'station instances isolated');
  }],
  ['actual query exception becomes FAILED and is not wrapped in COMPLETE', async () => {
    const shop = new RepairQuoteElement('shop-a');
    const station = new AirQualityElement('station-a');
    const invalid = { maxVisited: -1, maxReturned: 2 };
    const quote = await shop.run(repair, budget, invalid);
    expectStop(quote.outcome, 'FAILED', 'WORKFLOW_EXECUTION_FAILED');
    expectStop(await station.run(air(51), budget, invalid), 'FAILED', 'WORKFLOW_EXECUTION_FAILED');
    check(quote.usedRule === undefined && shop.counters.handling === 0 && station.counters.handling === 0, 'failed recognition cannot enter handler');
  }],
] as const;
