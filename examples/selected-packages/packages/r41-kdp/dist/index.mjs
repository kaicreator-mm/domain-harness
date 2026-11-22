import { activateSelectedKdpHostInit } from '@kaicreator/domain-harness-microkernel';

const events = (globalThis.__dhR41Events ??= []);
export async function init(context) {
  events.push({ phase: 'init', packageId: 'r41-kdp' });
  return activateSelectedKdpHostInit(context);
}
export function exit() {
  events.push({ phase: 'exit', packageId: 'r41-kdp' });
}
