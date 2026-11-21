const events = (globalThis.__dhR41Events ??= []);
export async function init() {
  events.push({ phase: 'init', packageId: 'r41-business' });
  return { status: 'READY' };
}
export function exit() {
  events.push({ phase: 'exit', packageId: 'r41-business' });
}
