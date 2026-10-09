// K1 hand-authored effectful business Operation (std.operation@1.0.0,
// effect 'non-idempotent'): settle a claim payout of the given amount. This
// physical callable is NEVER dispatched by the K1 Host pure dispatch path
// (E_EFFECT_ADMISSION_REQUIRED); it only ever executes behind the ORIGINAL
// accepted v0.7 T002B/T003C/T004A/T004C Central Admission and Journal via
// host/native-join.mjs.
export async function charge({input}) {
  if (!input || typeof input.amount !== 'number' || !Number.isFinite(input.amount))
    throw Object.assign(new Error('invalid charge input'), {code:'E_CHARGE_INPUT'});
  return Object.freeze({charged:true, amount:input.amount, fromK1Business:true});
}
