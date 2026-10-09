// #960 R2: generic *derived experimental* Kernel operation dispatcher.
// No Workflow/Action/Kind name, no Host-supplied effect authority, no second
// Journal, and no ambient JS sandbox claim. Host has already attested the
// physical Package/Kind/Component/implementation/operation before binding.
export class NeutralKernelError extends Error {
  constructor(code) { super(code); this.name = 'NeutralKernelError'; this.code = code; }
}
const deny = code => { throw new NeutralKernelError(code); };
const snapshot = value => {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value));
};
export function bindSelectedOperation({assembly, component, operation, selectedMethod}) {
  if (!assembly || !Object.isFrozen(assembly) || typeof assembly.digest !== 'string' ||
      !component || !operation || typeof operation.operationId !== 'string' ||
      !Array.isArray(component.operations) ||
      !component.operations.some(op => op.operationId === operation.operationId &&
        op.effect === operation.effect) ||
      typeof selectedMethod !== 'function') deny('E_KERNEL_BINDING');
  const admittedOperationId = operation.operationId;
  const effect = operation.effect;
  // Immutable closure. A caller can neither rebind the handler nor authorize
  // an effect by passing an 'effectAuthority', 'effectTools' or new Kind.
  return Object.freeze({
    assembly,
    invoke({operationId,input}={}) {
      if (operationId !== admittedOperationId) deny('E_OPERATION_SCOPE');
      if (effect !== 'none') deny('E_EFFECT_ADMISSION_REQUIRED');
      return selectedMethod(snapshot(input));
    },
    rebind() { deny('E_SEALED'); }
  });
}
