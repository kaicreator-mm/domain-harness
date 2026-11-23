import { JsonReader, YamlReader } from '@kaicreator/domain-harness';

export const packageMeta = { id:'reference-business', role:'core', order:2 };
/** Package 原生模块公开函数，直接供消费者调用。 */
export function sumAmounts(values) { return values.reduce((acc, n) => acc + n, 0); }

export class OrderService {
  #json = new JsonReader();
  #yaml = new YamlReader();
  readFour() {
    const documents = [
      this.#json.read('{"id":"a","amount":1}'),
      this.#json.read('{"id":"b","amount":2}'),
      this.#yaml.read('id: c\namount: 3\n'),
      this.#yaml.read('id: d\namount: 4\n'),
    ];
    if (documents.some(doc => doc.kind !== 'SUCCEEDED')) throw new Error('Invalid business data');
    return documents.map(doc => doc.value);
  }
}
export class Init { start() {} }
