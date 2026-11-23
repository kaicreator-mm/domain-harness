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
