import { BoundedQueryElement, StandardWorkflowSession } from '@kaicreator/domain-harness';
import type { BoundedQueryLimits, StandardWorkflowOutcome, WorkflowLimits } from '@kaicreator/domain-harness';

export interface RepairRule {
  readonly id: string;
  readonly tenant: string;
  readonly service: string;
  readonly ceiling: number;
  readonly source: Readonly<{ id: string; revision: string }>;
  readonly validity: Readonly<{ from: number; to: number }>;
}

/** 合成维修规则，仅供示例；所有公开嵌套引用均不可变，日期为示例逻辑日。 */
function rule(id: string, tenant: string, service: string, ceiling: number): RepairRule {
  return Object.freeze({ id, tenant, service, ceiling,
    source: Object.freeze({ id: 'fixture-catalog', revision: 'v1' }),
    validity: Object.freeze({ from: 1, to: 30 }) });
}
export const repairKnowledge = Object.freeze({ rules: Object.freeze([
  rule('a-brake', 'shop-a', 'brake', 80), rule('b-brake', 'shop-b', 'brake', 120),
  rule('a-paint-first', 'shop-a', 'paint', 50), rule('a-paint-second', 'shop-a', 'paint', 70),
]) });

export interface RepairCriteria {
  readonly tenant: string;
  readonly service: string;
  readonly source: string;
  readonly policyRevision: string;
  readonly asOf: number;
}
export interface RepairRequest extends Partial<RepairCriteria> {
  readonly intents?: readonly string[];
  readonly quote?: number;
  readonly inspection?: 'ready' | 'pending';
}
interface RepairIntent {
  readonly quote: number;
  readonly rule: RepairRule;
}
interface RepairDecision {
  readonly tenant: string;
  readonly quote: number;
  readonly ceiling: number;
  readonly approved: true;
  readonly ruleId: string;
}
type NonSuccess = Exclude<StandardWorkflowOutcome<never>, { status: 'COMPLETE' }>;
function stop(status: NonSuccess['status'], code: string): NonSuccess {
  return { status, reason: { code, message: 'Repair quote could not be approved' } };
}

/** 业务实例只拥有本地调用计数；真实维修动作、权威状态与审批不在此只读示例中。 */
export class RepairQuoteElement {
  readonly #tenant: string;
  readonly #query = new BoundedQueryElement();
  #recognitions = 0;
  #handled = 0;
  constructor(tenant: string) { this.#tenant = tenant; }
  protected rules(): readonly RepairRule[] { return repairKnowledge.rules; }
  get counters() { return { recognition: this.#recognitions, handling: this.#handled }; }

  lookup(criteria: RepairCriteria, limits?: BoundedQueryLimits) {
    const rules = this.rules();
    return this.#query.select(rules, item => item.tenant === this.#tenant &&
      item.tenant === criteria.tenant && item.service === criteria.service &&
      item.source.id === criteria.source && item.source.revision === criteria.policyRevision &&
      item.validity.from <= criteria.asOf && criteria.asOf <= item.validity.to,
    limits ?? { maxVisited: rules.length, maxReturned: rules.length + 1 });
  }

  private recognize(request: RepairRequest, limits?: BoundedQueryLimits): StandardWorkflowOutcome<RepairIntent> {
    this.#recognitions += 1;
    const { tenant, intents, service, source, policyRevision, asOf, quote, inspection } = request;
    if (tenant === undefined || intents === undefined || intents.length !== 1 || service === undefined ||
        source === undefined || policyRevision === undefined || asOf === undefined || quote === undefined || inspection === undefined) {
      return stop('ASK', 'REPAIR_INPUT_REQUIRED');
    }
    if (tenant !== this.#tenant || intents[0] !== 'quote' || !Number.isSafeInteger(asOf) || asOf < 1 ||
        !Number.isSafeInteger(quote) || quote < 0 || (inspection !== 'ready' && inspection !== 'pending')) {
      return stop('REJECT', 'REPAIR_SCOPE_OR_INPUT');
    }
    if (inspection === 'pending') return stop('WAIT', 'REPAIR_INSPECTION_PENDING');
    const found = this.lookup({ tenant, service, source, policyRevision, asOf }, limits);
    if (!found.complete) return stop('UNKNOWN', 'REPAIR_QUERY_INCOMPLETE');
    if (found.items.length !== 1) return stop('UNKNOWN', 'REPAIR_RULE_UNRESOLVED');
    const selected = found.items[0];
    if (selected === undefined) return stop('UNKNOWN', 'REPAIR_RULE_UNRESOLVED');
    return { status: 'COMPLETE', value: { quote, rule: selected } };
  }

  private handle(intent: RepairIntent): StandardWorkflowOutcome<RepairDecision> {
    this.#handled += 1;
    const { quote, rule } = intent;
    if (quote > rule.ceiling) return stop('REJECT', 'REPAIR_QUOTE_OVER_LIMIT');
    return { status: 'COMPLETE', value: { tenant: rule.tenant, quote, ceiling: rule.ceiling,
      approved: true, ruleId: rule.id } };
  }

  async run(request: RepairRequest, limits: WorkflowLimits, queryLimits?: BoundedQueryLimits) {
    // 一次业务请求仅一个 Root；两个静态选定子角色共享调用/步骤/深度额度。
    let usedRule: RepairRule | undefined;
    const outcome = await new StandardWorkflowSession(limits).run<RepairDecision>(async root => {
      const recognized = await root.child(0, child => child.invokeOutcome(() => this.recognize(request, queryLimits)));
      if (recognized.status !== 'COMPLETE') return recognized;
      return root.child(0, child => child.invokeOutcome(() => {
        usedRule = recognized.value.rule;
        return this.handle(recognized.value);
      }));
    });
    // 证据属当前业务调用，不放进实例共享的“最近结果”，也不改变 SDK Outcome。
    return { outcome, usedRule };
  }
}
