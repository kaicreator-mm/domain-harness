/** 一个普通 ESM Package 入口，可直接公开业务 Function 而不强制 Element 包装。 */
export const packageMeta = {
  id: 'native-business-fixture',
  role: 'business',
} as const;

/** Package 级公开函数；使用原生 export/import 边界。 */
export function calculateAmount(value: number): number {
  return value * 2;
}

/** 可独立组合使用的复用 Element Class。 */
export class InvoiceElement {
  public calculate(value: number): number {
    return calculateAmount(value) + 1;
  }
}
