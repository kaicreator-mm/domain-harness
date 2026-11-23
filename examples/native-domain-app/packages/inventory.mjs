import { YamlReader } from '@kaicreator/domain-harness';

/** 独立的库存领域 Package：复用相同 SDK Standard Reader，不属于 KDP Runtime。 */
export class InventoryElement {
  #reader = new YamlReader();

  readPolicy(source) { return this.#reader.read(source); }

  evaluate(policy, stock) {
    if (!policy || typeof policy !== 'object' || Array.isArray(policy) ||
        typeof policy.id !== 'string' ||
        typeof policy.minimumAvailable !== 'number' ||
        !Number.isFinite(policy.minimumAvailable)) {
      return {status:'UNKNOWN',reason:{code:'INVENTORY_POLICY_UNKNOWN',message:'Inventory policy invalid'}};
    }
    return {
      status:'COMPLETE',
      value:{
        policyId:policy.id,
        sku:stock.sku,
        available:stock.available,
        replenish:stock.available < policy.minimumAvailable,
      },
    };
  }
}
