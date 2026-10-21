/**
 * v0.10 #1219 F2 second-process witness.
 *
 * Usage:
 *   node --import tsx v010-t08-reservation-f2-child.ts <kPath> <outFile>
 *
 * The parent has already arranged, over the SAME file-backed SQLite store:
 * an admitted seed turn plus a RESERVED occurrence pin whose writer slot is
 * held by a stalled attempt, and has RUN recovery against it (PENDING — no
 * delete). This child then opens the same physical file in a REAL second
 * Node24 process, continues the EXACT reserved message (the adopt path),
 * and proves the admission lands on the SURVIVING pin of the original BUILD.
 */
import { readFile, writeFile } from 'node:fs/promises';

import {
  activateGovernedV10Build,
  buildV10App,
  readV10OccurrenceBuildPin,
} from '../../../packages/domain-harness-compiler/src/qualified-package/v10build/index.js';
import type { V10BuiltApp, V10ModuleInput } from '../../../packages/domain-harness-compiler/src/qualified-package/v10build/index.js';
import { openSqliteCasStore } from '../../../packages/domain-harness/src/host-v8/index.js';
import { basicComposition, sha256HexSource } from '../../assembly/helpers-v010.js';
import {
  T08_APP_ID,
  T08_DEPLOYMENT,
  T08_NOW,
  T08CountingStore,
  createT08AuthorizationAuthority,
  t08Decision,
} from './v010-t08-governed-build-fixture.js';

const RESTRICTED_BUSINESS = 'business-restricted-approval@v010.1.0.0';

async function buildReservationApp(buildId: string): Promise<V10BuiltApp> {
  const composition = await basicComposition({
    routes: [
      { intentId: 'submitQuoteDecisionDynamic', operationId: 'reserve', capabilityId: 'ledger', handlerId: 'reserveLedger' },
      { intentId: 'submitRestrictedDecision', operationId: 'reserve', capabilityId: 'ledger', handlerId: 'reserveLedger' },
    ],
  });
  const restrictedSource = await readFile(
    new URL('../../assembly/fixtures-v010/business-restricted-approval-v1.mjs', import.meta.url), 'utf8');
  const modules: V10ModuleInput[] = composition.modules.map((module) => ({ ...module }));
  modules.push({
    packageId: RESTRICTED_BUSINESS,
    role: 'business',
    abiVersion: 'v08-business-abi/1',
    moduleSource: restrictedSource,
    moduleSha256: sha256HexSource(restrictedSource),
    endpoint: 'business-policy',
    dependencies: [],
    provides: ['business:policy/1', 'intent:submitRestrictedDecision'],
    requires: [],
  } as unknown as V10ModuleInput);
  return await buildV10App({ ...composition, appId: T08_APP_ID, modules, buildId });
}

async function main(): Promise<void> {
  const [kPathArg, outPathArg] = process.argv.slice(2);
  if (kPathArg === undefined || outPathArg === undefined) throw new Error('usage: v010-t08-reservation-f2-child.ts <kPath> <outFile>');
  const kPath = kPathArg;

  const inner = await openSqliteCasStore({ path: kPath });
  const store = new T08CountingStore(inner);
  const appA = await buildReservationApp('t08-reservation-a');
  const decisionA = t08Decision(appA, 'A', T08_DEPLOYMENT, { buildId: appA.buildId, approvalRef: 'approval:res:a' });
  const authority = createT08AuthorizationAuthority();
  authority.grant(decisionA);
  const activation = await activateGovernedV10Build(appA, {
    store, deployment: T08_DEPLOYMENT, decision: decisionA, authorization: authority, selection: 'CURRENT', now: () => T08_NOW,
  });

  const target = { ...activation.resolveIntentTarget('submitQuoteDecisionDynamic'), instanceKey: 'inst-f2' };
  const receipt = await activation.send({
    intentType: 'submitQuoteDecisionDynamic',
    instanceKey: 'inst-f2',
    messageId: 'msg:res:f2:1',
    input: { amount: 36, requestId: 'R-msg:res:f2:1' },
  });
  const pin = await readV10OccurrenceBuildPin(store, T08_DEPLOYMENT, target);
  activation.close();
  inner.close();
  await writeFile(outPathArg, JSON.stringify({
    ok: receipt.status === 'admitted',
    status: receipt.status,
    pinPhase: pin?.phase ?? 'ABSENT',
    buildId: pin?.buildId ?? 'ABSENT',
  }), 'utf8');
}

void main();
