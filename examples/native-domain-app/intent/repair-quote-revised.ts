import { RepairQuoteElement } from './repair-quote.js';
import type { RepairRule } from './repair-quote.js';

/** 示例中的独立新知识修订；不修改已装入旧 Business Package 的任何值。 */
export const revisedRepairKnowledge: readonly RepairRule[] = Object.freeze([
  Object.freeze({ id: 'a-brake-revised', tenant: 'shop-a', service: 'brake', ceiling: 100,
    source: Object.freeze({ id: 'fixture-catalog', revision: 'v2' }),
    validity: Object.freeze({ from: 1, to: 30 }) }),
]);
export class RevisedRepairQuoteElement extends RepairQuoteElement {
  protected override rules(): readonly RepairRule[] { return revisedRepairKnowledge; }
}
