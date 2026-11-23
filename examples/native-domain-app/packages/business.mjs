import { JsonReader, YamlReader } from '@kaicreator/domain-harness';

export const packageMeta = { id: 'reference-business', role: 'core', order: 2 };

/** 普通 Package Function，不通过 FunctionRef 或 Target 转发。 */
export function sumAmounts(values) {
  return values.reduce((accumulator, value) => accumulator + value, 0);
}

/** 同一 JSON/YAML Reader 实例各自复用两次，解析操作显式消耗根预算。 */
export class OrderService {
  #json = new JsonReader();
  #yaml = new YamlReader();

  async readFour(context, onRead = () => {}) {
    const inputs = [
      {id:'json-a', kind:'json', source:'{"id":"a","amount":1}'},
      {id:'json-b', kind:'json', source:'{"id":"b","amount":2}'},
      {id:'yaml-c', kind:'yaml', source:'id: c\namount: 3\n'},
      {id:'yaml-d', kind:'yaml', source:'id: d\namount: 4\n'},
    ];
    const values = [];
    for (const entry of inputs) {
      const observed = await context.invoke(() => {
        onRead(entry.id);
        return entry.kind === 'json'
          ? this.#json.read(entry.source)
          : this.#yaml.read(entry.source);
      });
      if (observed.status !== 'COMPLETE') return observed;
      if (observed.value.kind !== 'SUCCEEDED') {
        return {
          status: 'FAILED',
          reason: {code:'BUSINESS_DOCUMENT_INVALID',message:'Business document not readable'},
        };
      }
      values.push(observed.value.value);
    }
    return {status:'COMPLETE',value:values};
  }
}

/** 一个普通业务 Element，规则来自领域持有的结构化 JSON 内容，而非 SDK 内置知识引擎。 */
export class OrderPolicyElement {
  evaluate(rule, amounts) {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule) ||
        typeof rule.id !== 'string' ||
        typeof rule.minimumTotal !== 'number' || !Number.isFinite(rule.minimumTotal)) {
      return {status:'UNKNOWN',reason:{code:'ORDER_POLICY_UNKNOWN',message:'Policy is incomplete'}};
    }
    const total=sumAmounts(amounts);
    if(total < rule.minimumTotal) {
      return {status:'REJECT',reason:{code:'ORDER_POLICY_THRESHOLD',message:'Order below policy minimum'}};
    }
    return {status:'COMPLETE',value:{policyId:rule.id,total}};
  }
  finalize(decision) {
    return {status:'COMPLETE',value:{...decision,approved:true}};
  }
}

/** 0-Function 的结构化知识 Element：数据由业务 Package 持有，不是自制 Runtime Schema。 */
export class OrderPolicyKnowledgeElement {
  static metadata = {id:'orderPolicyKnowledge'};
  constructor(content) {
    this.content=Object.freeze({...content});
  }
}
