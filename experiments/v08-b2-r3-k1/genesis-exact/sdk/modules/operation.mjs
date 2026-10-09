// A *pure* Operation; effectful native T004 execution is expressly out of D1 scope.
export function receipt({input}) {
  if (!input || typeof input.id !== 'string')
    throw Object.assign(new Error('invalid receipt'), {code:'E_RECEIPT_INPUT'});
  return Object.freeze({id:input.id, status:'OBSERVED_NO_EFFECT'});
}
