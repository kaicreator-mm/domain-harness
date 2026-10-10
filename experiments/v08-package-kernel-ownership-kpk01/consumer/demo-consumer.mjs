/**
 * Clean public consumer demo (KPK-13)
 * ===================================
 * A real OUTSIDE-package consumer of the experiment's public API, run with
 * STOCK Node (`node consumer/demo-consumer.mjs`, Node 22/24, no loader, no
 * tsx, no runtime compilation): it builds a Host, loads the sealed package
 * via `DomainHarness.load(package)` and performs one typed UX round trip
 * (open → submit → query → observe).
 */

import {
  load,
  buildPackageRoot,
  createMemoryHost,
} from '../index.mjs';
import { createApprovalUx } from '../src/ux/ux-client.mjs';

const host = createMemoryHost({ now: () => '2026-10-10T08:00:00.000Z' });
const pkg = await buildPackageRoot({ rootPackageId: 'app:order-approval@1.0.0', businessModule: 'business-approval.mjs' });

const runtime = await load(pkg, { hostPorts: host });
const ux = createApprovalUx(runtime);

const receipts = [];
ux.observe((receipt) => receipts.push(receipt));

await ux.openInstance({ correlationId: 'demo:1' });
const decision = await ux.submitQuote({ amount: 42, messageId: 'msg:demo-1' });

const instance = await ux.getInstance();
const journal = await ux.getJournal();
const mechanism = await runtime.query({ kind: 'mechanism' });

console.log(JSON.stringify({
  consumer: 'stock-node public consumer (no compiledApp, no runtime compilation)',
  loadedKernel: mechanism.moduleId,
  kernelModuleSha256: mechanism.moduleSha256,
  decision: {
    status: decision.status,
    turn: decision.admitted?.durableControlTurnId,
    transition: decision.admitted?.transitionKey,
    targetState: decision.admitted?.targetState,
    effect: decision.admitted?.effects?.[0]?.disposition,
  },
  instanceState: instance.state,
  journalRows: journal.length,
  observedReceipts: receipts.length,
}, null, 2));
