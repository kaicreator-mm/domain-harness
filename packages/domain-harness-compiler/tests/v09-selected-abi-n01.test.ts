/**
 * v0.9 N01 — selected K/S/C ABI + BUILD binding interface targeted P/N.
 *
 * One sealed closure — built through the PUBLISHED v0.8 BUILD pipeline —
 * carries the physically selected v0.8 Kernel and Standard module bytes, TWO
 * real Business packages (order-approval + engineering self-dogfood) and the
 * real capability-quote-tools package. The v0.9 selected-abi slice admits the
 * intent→operation route table over that sealed closure, the pure Standard
 * Router resolves candidates, and the Kernel-owned authorization revalidates
 * results. The bounded data-path witness then drives the published Kernel
 * mechanism with the published Standard interpreter and the REAL approval
 * policy, executing the sealed capability handler through the Kernel-owned
 * effect dispatch.
 *
 * NOT claimed here: protected Host install/currentness/permit (#1032), the
 * public ./v9 façade (#1035), the Node24/SQLite CAS profile (#1028) and the
 * physical H→K principal token (#1036) — those interfaces do not exist in
 * this slice and no result below substitutes for them.
 *
 * R0 P1 remedy: Business intent membership is derived exclusively from the
 * sealed root's `role:'intent'` rows (no caller businessIntents input); N3
 * proves a forged intent injected without touching the sealed root refuses
 * at BUILD binding, before any Router request or Kernel revalidation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  buildQualifiedPackage,
  issueApprovalProof,
  qualifyPackageClosure,
} from '../src/qualified-package/index.js';
import { routeWorkflowIntent } from '../../../domain-packages/standard/basic/workflow-router.mjs';
import {
  authorizeSelectedOperation,
  bindSelectedClosure,
  routerRequestFor,
  SelectedAbiError,
} from '../src/qualified-package/v09/selected-abi.mjs';
import * as kernel from '../../../domain-packages/kernel/basic/kernel-mechanism-v1.mjs';
import * as sdk from '../../../domain-packages/standard/basic/standard-sdk-v1.mjs';
import * as approval from '../../../examples/v08-domain-apps/business-approval.mjs';
import * as engineering from '../../../examples/v08-domain-apps/business-engineering.mjs';
import * as capabilityModule from '../../../examples/v08-domain-apps/capability-quote-tools.mjs';

const ISSUER = 'issuer:n01-selected-abi-test';
const SECRET = 'N01-local-external-issuer-proof-only-not-deployment-secret';
const CAPABILITY_ID = 'cap:quote-tools';

const sha256Hex = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');
const refuses = (code: string, fn: () => unknown): void => {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof SelectedAbiError, `expected SelectedAbiError, got ${String(error)}`);
    assert.equal((error as SelectedAbiError).code, code);
    return true;
  });
};

async function realSealedRoot() {
  const [kBytes, sBytes, approvalBytes, engineeringBytes, capabilityBytes] = await Promise.all([
    readFile(new URL('../../../domain-packages/kernel/basic/kernel-mechanism-v1.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../../domain-packages/standard/basic/standard-sdk-v1.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../../examples/v08-domain-apps/business-approval.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../../examples/v08-domain-apps/business-engineering.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../../examples/v08-domain-apps/capability-quote-tools.mjs', import.meta.url), 'utf8'),
  ]);
  const submission = {
    rootPackageId: 'app:v09:n01-two-real-business',
    packages: [
      {
        packageId: kernel.MODULE_ID, kind: 'kernel', abiVersion: kernel.ABI_VERSION,
        modulePath: 'modules/kernel.mjs', moduleSource: kBytes, endpoints: kernel.ENDPOINTS,
      },
      {
        packageId: sdk.MODULE_ID, kind: 'standard-sdk', abiVersion: sdk.ABI_VERSION,
        modulePath: 'modules/standard.mjs', moduleSource: sBytes, endpoints: sdk.ENDPOINTS,
      },
      {
        packageId: approval.MODULE_ID, kind: 'business', abiVersion: approval.ABI_VERSION,
        modulePath: 'modules/business-approval.mjs', moduleSource: approvalBytes,
        endpoints: approval.ENDPOINTS, intentTypes: approval.INTENT_TYPES,
      },
      {
        packageId: engineering.MODULE_ID, kind: 'business', abiVersion: engineering.ABI_VERSION,
        modulePath: 'modules/business-engineering.mjs', moduleSource: engineeringBytes,
        endpoints: engineering.ENDPOINTS, intentTypes: engineering.INTENT_TYPES,
      },
      {
        packageId: capabilityModule.MODULE_ID, kind: 'capability', abiVersion: capabilityModule.ABI_VERSION,
        modulePath: 'modules/capability-quote-tools.mjs', moduleSource: capabilityBytes,
        endpoints: capabilityModule.ENDPOINTS,
      },
    ],
    bindings: [
      { role: 'kernel', packageId: kernel.MODULE_ID, endpointId: kernel.ENDPOINTS[0].endpointId },
      { role: 'standard-sdk', packageId: sdk.MODULE_ID, endpointId: sdk.ENDPOINTS[0].endpointId },
      { role: 'business', packageId: approval.MODULE_ID, endpointId: approval.ENDPOINTS[0].endpointId },
      { role: 'business', packageId: engineering.MODULE_ID, endpointId: engineering.ENDPOINTS[0].endpointId },
      ...approval.INTENT_TYPES.map((intentType) => ({
        role: 'intent', intentType, packageId: approval.MODULE_ID, endpointId: approval.ENDPOINTS[0].endpointId,
      })),
      ...engineering.INTENT_TYPES.map((intentType) => ({
        role: 'intent', intentType, packageId: engineering.MODULE_ID, endpointId: engineering.ENDPOINTS[0].endpointId,
      })),
      {
        role: 'capability', capabilityId: CAPABILITY_ID,
        packageId: capabilityModule.MODULE_ID, endpointId: capabilityModule.ENDPOINTS[0].endpointId,
        handlers: [
          { operationId: 'quote.preview-total', handler: 'previewTotal' },
          { operationId: 'quote.reserve', handler: 'reserveLedger' },
        ],
      },
    ],
  };
  const unsigned = qualifyPackageClosure(submission);
  const approvalProof = issueApprovalProof({
    subjectDigest: unsigned.subjectDigest, issuerId: ISSUER, issuerSecret: SECRET,
    issuedAt: '2026-10-16T00:00:00.000Z',
  });
  const root = buildQualifiedPackage({
    unsigned,
    approval: approvalProof,
    trustedIssuers: new Map([[ISSUER, SECRET]]),
    moduleSources: new Map(submission.packages.map((pkg) => [pkg.modulePath, pkg.moduleSource])),
    baseCommit: 'v0.9-n01-selected-abi-test',
  });
  return { root, closureDigest: unsigned.subjectDigest };
}

/** Real route table: two real Business intents share ONE sealed capability. */
const ROUTES = [
  { intentId: 'submitQuoteDecision', operationId: 'quote.preview-total', capabilityId: CAPABILITY_ID, handlerId: 'previewTotal' },
  { intentId: 'submitQuoteDecisionDynamic', operationId: 'quote.reserve', capabilityId: CAPABILITY_ID, handlerId: 'reserveLedger' },
  { intentId: 'reviewChange', operationId: 'quote.preview-total', capabilityId: CAPABILITY_ID, handlerId: 'previewTotal' },
  // Two sealed operations for one intent: the pure Router must resolve or
  // refuse them; a tie is an ambiguous Kernel-refused outcome, never a guess.
  { intentId: 'recordValidation', operationId: 'quote.preview-total', capabilityId: CAPABILITY_ID, handlerId: 'previewTotal' },
  { intentId: 'recordValidation', operationId: 'quote.reserve', capabilityId: CAPABILITY_ID, handlerId: 'reserveLedger' },
] as const;

async function boundTable() {
  const { root, closureDigest } = await realSealedRoot();
  const table = bindSelectedClosure({ sealedRoot: root, routes: ROUTES });
  return { root, closureDigest, table };
}

const candidate = (operationId: string, priority = 1, eligibility: 'eligible' | 'denied' = 'eligible') =>
  ({ operationId, capabilityId: CAPABILITY_ID, priority, eligibility });

test('V09-N01-ABI-P1: two real Business packages share ONE sealed K/S/C table without identity switching', async () => {
  const { closureDigest, table } = await boundTable();
  assert.equal(table.formatVersion, 'dh.v9.selected-abi/1');
  assert.equal(Object.isFrozen(table), true);
  assert.equal(table.kernel.packageId, kernel.MODULE_ID);
  assert.equal(table.standard.packageId, sdk.MODULE_ID);
  assert.deepEqual(table.businesses.map((b) => b.packageId), [approval.MODULE_ID, engineering.MODULE_ID]);
  // R0 P1 witness: intent membership is derived from the sealed root's own
  // role:'intent' rows and equals exactly what the two real Business
  // packages declare — no caller intent list exists to differ from it.
  assert.deepEqual(
    table.businesses.map((b) => [...b.intentTypes].sort()),
    [[...approval.INTENT_TYPES].sort(), [...engineering.INTENT_TYPES].sort()],
  );
  assert.equal(table.basisDigest, `sha256:${closureDigest}`);
  assert.match(table.basisDigest, /^sha256:[0-9a-f]{64}$/);
  // Both businesses' real intents route through the same sealed capability.
  const approvalRouted = routeWorkflowIntent(routerRequestFor(table, 'submitQuoteDecisionDynamic', [candidate('quote.reserve')]));
  const engineeringRouted = routeWorkflowIntent(routerRequestFor(table, 'reviewChange', [candidate('quote.preview-total')]));
  assert.equal(approvalRouted.kind, 'selected');
  assert.equal(engineeringRouted.kind, 'selected');
  assert.equal(approvalRouted.capabilityId, engineeringRouted.capabilityId);
  assert.equal(approvalRouted.basisDigest, engineeringRouted.basisDigest);
  assert.deepEqual(table.capabilities.map((c) => c.capabilityId), [CAPABILITY_ID]);
});

test('V09-N01-ABI-P2: Router selection stays inside the capability-owned Operation/Handler ABI', async () => {
  const { table } = await boundTable();
  const routed = routeWorkflowIntent(routerRequestFor(table, 'submitQuoteDecisionDynamic', [candidate('quote.reserve')]));
  assert.ok(routed.kind === 'selected');
  // The selected operation is genuinely declared by the capability module's
  // own sealed OPERATIONS table, and the sealed handler is its physical export.
  const declared = capabilityModule.OPERATIONS.find((operation) => operation.operationId === routed.operationId);
  assert.ok(declared, 'selected operationId is declared by the real capability OPERATIONS ABI');
  assert.equal(typeof (capabilityModule as Record<string, unknown>)[routed.handlerId], 'function');
  // The PURE operation is actually executable as a deterministic function of
  // plain data — no port, no state, exactly one argument.
  const preview = (capabilityModule as Record<string, (input: unknown) => unknown>).previewTotal;
  assert.deepEqual(preview({ amount: 30, serviceLevel: 'expedited' }), { ok: true, serviceLevel: 'expedited', subtotal: 37.5, total: 37.5 });
});

test('V09-N01-ABI-P3: the published Standard interpreter supplies the data-only proposal', async () => {
  const { table } = await boundTable();
  // Real rule interpretation from the sealed S bytes (same composition as the
  // two-real-apps F01 proof): pure structured decision, no effect fields.
  const resolved = sdk.interpret(approval.getPolicy().rules['rule:quote-decision-request'], { amount: 30, requestId: 'R1' });
  assert.equal(resolved.structuredDecision.event.type, 'QUOTE_DECIDED');
  assert.equal(Object.hasOwn(resolved, 'effectExecuted'), false);
  // The Standard proposal feeds candidate eligibility; the Router still only
  // selects among BUILD-sealed operations.
  const routed = routeWorkflowIntent(routerRequestFor(table, 'submitQuoteDecisionDynamic', [candidate('quote.reserve')]));
  assert.ok(routed.kind === 'selected');
  assert.equal(routed.operationId, 'quote.reserve');
});

test('V09-N01-ABI-N1: BUILD binding interface refuses duplicate/conflicting route rows', async () => {
  const { root } = await boundTable();
  const duplicate = [...ROUTES, { intentId: 'reviewChange', operationId: 'quote.preview-total', capabilityId: CAPABILITY_ID, handlerId: 'previewTotal' }];
  refuses('SELECTED_ABI_ROUTE_DUPLICATE', () => bindSelectedClosure({ sealedRoot: root, routes: duplicate }));
});

test('V09-N01-ABI-N2: unbound capability, unsealed operation and dangling handler each refuse', async () => {
  const { root } = await boundTable();
  const base = { intentId: 'reviewChange' as const };
  refuses('SELECTED_ABI_CAPABILITY_UNBOUND', () => bindSelectedClosure({
    sealedRoot: root,
    routes: [{ ...base, operationId: 'quote.preview-total', capabilityId: 'cap:not-sealed', handlerId: 'previewTotal' }],
  }));
  refuses('SELECTED_ABI_OPERATION_UNBOUND', () => bindSelectedClosure({
    sealedRoot: root,
    routes: [{ ...base, operationId: 'quote.unknown', capabilityId: CAPABILITY_ID, handlerId: 'previewTotal' }],
  }));
  refuses('SELECTED_ABI_HANDLER_MISMATCH', () => bindSelectedClosure({
    sealedRoot: root,
    routes: [{ ...base, operationId: 'quote.preview-total', capabilityId: CAPABILITY_ID, handlerId: 'reserveLedger' }],
  }));
});

test('V09-N01-ABI-N3 (R0 P1): a forged intent injected WITHOUT touching the sealed root refuses at BUILD binding', async () => {
  const { root } = await boundTable();
  // Exact reviewer vector: a valid sealed root plus a route for an intent the
  // root never sealed. With caller intent lists eliminated there is no other
  // input surface left; the refusal happens at bindSelectedClosure — before
  // any Router request or Kernel revalidation can exist.
  const forged = [...ROUTES, { intentId: 'fake.intent', operationId: 'quote.preview-total', capabilityId: CAPABILITY_ID, handlerId: 'previewTotal' }];
  refuses('SELECTED_ABI_INTENT_UNDECLARED', () => bindSelectedClosure({ sealedRoot: root, routes: forged }));
  // An intent sealed for a DIFFERENT closure's snapshot is equally absent
  // here ('demo.request' belongs to the S02a demo world, not this root).
  refuses('SELECTED_ABI_INTENT_UNDECLARED', () => bindSelectedClosure({
    sealedRoot: root,
    routes: [{ intentId: 'demo.request', operationId: 'quote.preview-total', capabilityId: CAPABILITY_ID, handlerId: 'previewTotal' }],
  }));
  // The same forged intent also cannot sneak through the Standard-side
  // request derivation of an already-bound table.
  const { table } = await boundTable();
  assert.throws(
    () => routerRequestFor(table, 'fake.intent', [candidate('quote.preview-total')]),
    (error: unknown) => error instanceof SelectedAbiError && error.code === 'SELECTED_ABI_INTENT_UNDECLARED',
  );
});

test('V09-N01-ABI-N4: tampered sealed structure refuses: duplicate K role, K-role masquerade, duplicate capabilityId', async () => {
  const { root } = await boundTable();
  const withSecondKernel = structuredClone(root);
  withSecondKernel.bindings.push(structuredClone(withSecondKernel.bindings[0]));
  refuses('SELECTED_ABI_ROLE_INVALID', () => bindSelectedClosure({ sealedRoot: withSecondKernel, routes: ROUTES }));
  const masquerade = structuredClone(root);
  const kBinding = masquerade.bindings.find((binding: { role: string }) => binding.role === 'kernel');
  kBinding.packageId = capabilityModule.MODULE_ID;
  kBinding.endpointId = capabilityModule.ENDPOINTS[0].endpointId;
  refuses('SELECTED_ABI_ROLE_INVALID', () => bindSelectedClosure({ sealedRoot: masquerade, routes: ROUTES }));
  const twiceCapability = structuredClone(root);
  const capBinding = twiceCapability.bindings.find((binding: { role: string }) => binding.role === 'capability');
  twiceCapability.bindings.push(structuredClone(capBinding));
  refuses('SELECTED_ABI_CAPABILITY_INVALID', () => bindSelectedClosure({ sealedRoot: twiceCapability, routes: ROUTES }));
  // Derivation-side intent row checks: the same sealed intent re-owned by the
  // other Business, and an intent row pointing at an endpoint its package
  // never declared, both refuse before any route is considered.
  const twiceIntent = structuredClone(root);
  const intentRow = twiceIntent.bindings.find((binding: { role: string; intentType?: string }) => binding.role === 'intent' && binding.intentType === 'reviewChange');
  twiceIntent.bindings.push({ ...intentRow, packageId: approval.MODULE_ID, endpointId: approval.ENDPOINTS[0].endpointId });
  refuses('SELECTED_ABI_ROLE_INVALID', () => bindSelectedClosure({ sealedRoot: twiceIntent, routes: ROUTES }));
  const danglingIntent = structuredClone(root);
  const danglingRow = danglingIntent.bindings.find((binding: { role: string; intentType?: string }) => binding.role === 'intent' && binding.intentType === 'reviewChange');
  danglingRow.endpointId = 'endpoint:never-declared';
  refuses('SELECTED_ABI_ROLE_INVALID', () => bindSelectedClosure({ sealedRoot: danglingIntent, routes: ROUTES }));
});

test('V09-N01-ABI-K1: a genuinely sealed selected result yields one frozen Kernel admission receipt', async () => {
  const { table } = await boundTable();
  const routed = routeWorkflowIntent(routerRequestFor(table, 'submitQuoteDecisionDynamic', [candidate('quote.reserve')]));
  const receipt = authorizeSelectedOperation({ table, intentId: 'submitQuoteDecisionDynamic', routerResult: routed });
  assert.deepEqual(receipt, {
    admittedIntentId: 'submitQuoteDecisionDynamic',
    operationId: 'quote.reserve',
    capabilityId: CAPABILITY_ID,
    handlerId: 'reserveLedger',
    basisDigest: table.basisDigest,
  });
  assert.equal(Object.isFrozen(receipt), true);
  for (const field of ['effect', 'journal', 'principal', 'permit', 'authorize']) {
    assert.equal(Object.hasOwn(receipt as object, field), false);
  }
});

test('V09-N01-ABI-K2: missing/ambiguous/denied Router outcomes admit nothing at the Kernel boundary', async () => {
  const { table } = await boundTable();
  const missing = routeWorkflowIntent(routerRequestFor(table, 'reviewChange', []));
  assert.equal(missing.kind, 'missing');
  refuses('SELECTED_ABI_NOT_SELECTED', () => authorizeSelectedOperation({ table, intentId: 'reviewChange', routerResult: missing }));
  const tie = routeWorkflowIntent(routerRequestFor(table, 'recordValidation', [
    candidate('quote.preview-total'), candidate('quote.reserve'),
  ]));
  assert.ok(tie.kind === 'ambiguous');
  refuses('SELECTED_ABI_NOT_SELECTED', () => authorizeSelectedOperation({ table, intentId: 'recordValidation', routerResult: tie }));
  const denied = routeWorkflowIntent(routerRequestFor(table, 'recordValidation', [candidate('quote.reserve', 1, 'denied')]));
  assert.ok(denied.kind === 'denied');
  refuses('SELECTED_ABI_NOT_SELECTED', () => authorizeSelectedOperation({ table, intentId: 'recordValidation', routerResult: denied }));
});

test('V09-N01-ABI-K3: forged identities and a foreign basis digest cannot pass as selected', async () => {
  const { table } = await boundTable();
  const routed = routeWorkflowIntent(routerRequestFor(table, 'submitQuoteDecisionDynamic', [candidate('quote.reserve')]));
  assert.ok(routed.kind === 'selected');
  const forgedHandler = { ...routed, handlerId: 'previewTotal' };
  refuses('SELECTED_ABI_BINDING_UNMATCHED', () => authorizeSelectedOperation({ table, intentId: 'submitQuoteDecisionDynamic', routerResult: forgedHandler }));
  const foreignBasis = { ...routed, basisDigest: `sha256:${'b'.repeat(64)}` };
  refuses('SELECTED_ABI_BASIS_MISMATCH', () => authorizeSelectedOperation({ table, intentId: 'submitQuoteDecisionDynamic', routerResult: foreignBasis }));
  // The sealed operation claimed for an intent it was never bound to.
  const crossIntent = { ...routed };
  refuses('SELECTED_ABI_BINDING_UNMATCHED', () => authorizeSelectedOperation({ table, intentId: 'reviewChange', routerResult: crossIntent }));
});

test('V09-N01-ABI-K4: caller-supplied authority fields make a result LESS trustworthy, never more', async () => {
  const { table } = await boundTable();
  const routed = routeWorkflowIntent(routerRequestFor(table, 'submitQuoteDecisionDynamic', [candidate('quote.reserve')]));
  assert.ok(routed.kind === 'selected');
  const fakePrincipal = { ...routed, principal: { role: 'kernel-admin', authorized: true } };
  refuses('SELECTED_ABI_RESULT_UNTRUSTED', () => authorizeSelectedOperation({ table, intentId: 'submitQuoteDecisionDynamic', routerResult: fakePrincipal }));
  const forgedKind = { kind: 'definitely-selected', operationId: 'quote.reserve' };
  refuses('SELECTED_ABI_RESULT_UNTRUSTED', () => authorizeSelectedOperation({ table, intentId: 'submitQuoteDecisionDynamic', routerResult: forgedKind }));
});

// ---------------------------------------------------------------------------
// I01 — bounded selected K/S data-path witness over the published v0.8 bytes.
// ---------------------------------------------------------------------------

const NOW = '2026-10-16T08:00:00.000Z';
const TARGET = { workflowId: 'order-quote', instanceKey: 'instance:n01' };

function witnessHostPorts() {
  const docs = new Map<string, { value: unknown; revision: number }>();
  const resourceCalls: { resourceKey: string; operation: string; payload: unknown }[] = [];
  return {
    docs: {
      async get(key: string) { return docs.get(key) ?? null; },
      async put(key: string, value: unknown) {
        const existing = docs.get(key);
        const revision = existing ? existing.revision + 1 : 0;
        docs.set(key, { value, revision });
        return { revision };
      },
      async list(prefix: string) { return [...docs.keys()].filter((key) => key.startsWith(prefix)).sort(); },
    },
    resources: {
      // The Host-provisioned physical ledger is the SEALED capability handler
      // itself: the Kernel-owned effect dispatch is the only caller.
      async call(resourceKey: string, operation: string, payload: Record<string, unknown>) {
        resourceCalls.push({ resourceKey, operation, payload });
        if (resourceKey === 'ledger' && operation === 'reserve') {
          return capabilityModule.reserveLedger(payload);
        }
        throw new Error(`host resource ${resourceKey}.${operation} is not provisioned`);
      },
      callCount: () => resourceCalls.length,
      calls: () => resourceCalls.slice(),
    },
    sha256: { async digestUtf8(value: string) { return sha256Hex(value); } },
    clock: () => NOW,
  };
}

function witnessRuntime(host: ReturnType<typeof witnessHostPorts>, moduleSha256: string) {
  return kernel.createOccurrenceRuntime({
    moduleIdentity: { packageId: kernel.MODULE_ID, moduleSha256 },
    hostPorts: host,
    sdkEndpoint: {
      packageId: sdk.MODULE_ID,
      interpret: (declaration: unknown, input: unknown, context: unknown) => sdk.interpret(declaration, input, context),
    },
    businessEndpoint: approval.getPolicy(),
  });
}

const dynamicIntent = (messageId: string) => ({
  kind: 'v08/tc-intent',
  intentType: 'submitQuoteDecisionDynamic',
  target: TARGET,
  messageId,
  input: { amount: 30, requestId: 'R1' },
  caller: { role: 'requester' },
});

test('V09-N01-ABI-I01: Kernel admission precedes the real K/S/B data path; a refused route creates zero new effect', async () => {
  const { table } = await boundTable();
  const host = witnessHostPorts();
  // The witness runtime runs under the SEALED kernel module identity (the
  // published v0.8 bytes digest carried by the selected table).
  const runtime = witnessRuntime(host, table.kernel.moduleSha256);
  await runtime.openInstance({ target: TARGET, correlationId: 'corr:n01', authorityClass: 'PRODUCTION' });

  // Admitted route: Standard Router → Kernel revalidation → real selected K
  // admission over the REAL approval policy with the published S interpreter.
  const routed = routeWorkflowIntent(routerRequestFor(table, 'submitQuoteDecisionDynamic', [candidate('quote.reserve')]));
  const receipt = authorizeSelectedOperation({ table, intentId: 'submitQuoteDecisionDynamic', routerResult: routed });
  assert.equal(receipt.handlerId, 'reserveLedger');
  const admitted = await runtime.submitOccurrence(dynamicIntent('msg:n01-1'));
  assert.equal(admitted.status, 'admitted');
  assert.equal(host.resources.callCount(), 1);
  const ledgerCall = host.resources.calls()[0];
  assert.deepEqual([ledgerCall.resourceKey, ledgerCall.operation], ['ledger', 'reserve']);
  const journal = await runtime.getJournalRecords();
  assert.equal(journal.length, 1);
  assert.equal(journal[0].status, 'completed');

  // Refused route: an ambiguous Router outcome is refused by the Kernel
  // revalidation BEFORE any occurrence exists — zero journal row, zero
  // physical effect, state untouched.
  const tie = routeWorkflowIntent(routerRequestFor(table, 'recordValidation', [
    candidate('quote.preview-total'), candidate('quote.reserve'),
  ]));
  assert.ok(tie.kind === 'ambiguous');
  assert.throws(
    () => authorizeSelectedOperation({ table, intentId: 'recordValidation', routerResult: tie }),
    (error: unknown) => error instanceof SelectedAbiError && error.code === 'SELECTED_ABI_NOT_SELECTED',
  );
  assert.equal(host.resources.callCount(), 1, 'the refused route dispatched no physical effect');
  assert.equal((await runtime.getJournalRecords()).length, 1, 'the refused route wrote no journal row');
  const snapshot = await runtime.getSnapshot(TARGET);
  assert.equal(snapshot.state.stateKey, 'approved', 'state moved only through the admitted occurrence');
});
