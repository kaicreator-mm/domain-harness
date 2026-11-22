const events = (globalThis.__dhR41Events ??= []);
export async function init(context) {
  events.push({ phase: 'init', packageId: 'r41-sdk-base' });
  return context.nextCore?.init();
}
export function exit() {
  events.push({ phase: 'exit', packageId: 'r41-sdk-base' });
}
