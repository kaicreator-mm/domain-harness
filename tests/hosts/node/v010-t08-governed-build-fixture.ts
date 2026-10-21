/**
 * v0.10 T08 (#1175) — two independently BUILT versions A/B of ONE selected
 * Domain App, plus the trusted Host deployment-authorization authority used
 * by the physical witness and its real second-process restore child.
 *
 * A and B share the stable logical app/deployment identity, audience, target
 * profile and selected Kernel/Standard/capability bytes. B independently
 * bumps the alpha Business package revision and the BUILD id, so the BUILD
 * `subjectDigest` and package closure differ while `appId` stays stable.
 * Both builds also select a second Business package (beta) that shares the
 * SAME policy workflow key `order-quote` as alpha; that is what makes the
 * `(workflowId, instanceKey)` collision and per-B separation physically
 * observable instead of an artifact of different instance keys.
 */
import type {
  V10BuiltApp,
  V10BuildActivationDecision,
  V10DeploymentAuthorizationRequest,
  V10DeploymentAuthorizationVerdict,
  V10DeploymentIdentity,
  V10ModuleInput,
} from '../../../packages/domain-harness-compiler/src/qualified-package/v10build/index.js';
import type { V10DocStore, V10DocWriteCondition } from '../../../packages/domain-harness-compiler/src/qualified-package/v10build/index.js';
import {
  V10_BUILD_FORMAT,
  V10_HOST_ABI,
  V10_RUNTIME_ABI,
  V10_TARGET_PROFILE,
  buildV10App,
  sha256Canonical,
  sha256Hex,
  v10BuildActivationDecisionDigest,
  v10BuildPackageClosureDigest,
} from '../../../packages/domain-harness-compiler/src/qualified-package/v10build/index.js';
import type { SqliteCasStore } from '../../../packages/domain-harness/src/host-v8/index.js';
import { basicComposition } from '../../assembly/helpers-v010.js';
import Database from 'better-sqlite3';

export const T08_APP_ID = 'app:v010-t08-governed-build';
export const T08_DEPLOYMENT: V10DeploymentIdentity = Object.freeze({
  deployedAppId: 'deploy:v010-t08-governed',
  tenantId: 'tenant:v010-t08-primary',
  appId: T08_APP_ID,
});
export const T08_OTHER_TENANT: V10DeploymentIdentity = Object.freeze({
  deployedAppId: T08_DEPLOYMENT.deployedAppId,
  tenantId: 'tenant:v010-t08-other',
  appId: T08_APP_ID,
});

export const T08_BUSINESS_ALPHA = 'business-order-approval-alpha@v08.1.0.0';
export const T08_BUSINESS_BETA = 'business-order-approval-beta@v08.1.0.0';
export const T08_CAPABILITY_A = 'capability-quote-tools@v08.1.0.0';
export const T08_CAPABILITY_B = 'capability-quote-tools@v08.1.0.1';
export const T08_WORKFLOW_ID = 'order-quote';
export const T08_NOW = Date.UTC(2026, 9, 20, 12, 0, 0);
export const T08_T1 = Date.UTC(2026, 9, 20, 13, 0, 0);
export const T08_T2 = Date.UTC(2026, 9, 20, 16, 0, 0);
export const T08_APPROVED_AT = '2026-10-20T11:00:00.000Z';
export const T08_VALID_UNTIL = '2026-10-20T15:00:00.000Z';

export const T08_OLD_INTENT = Object.freeze({
  intentType: 'submitQuoteDecisionDynamic',
  instanceKey: 'inst-old',
  messageId: 'msg:t08:old:1',
  input: { amount: 30, requestId: 'R-t08-old' },
});
export const T08_NEW_INTENT = Object.freeze({
  intentType: 'submitQuoteDecisionDynamic',
  instanceKey: 'inst-new',
  messageId: 'msg:t08:new:2',
  input: { amount: 40, requestId: 'R-t08-new' },
});
export const T08_SECOND_B_INTENT = Object.freeze({
  intentType: 'submitQuoteDecisionStrict',
  instanceKey: 'inst-old',
  messageId: 'msg:t08:second-b:1',
  input: { amount: 25, requestId: 'R-t08-second-b' },
});

export type T08BuildVersion = 'A' | 'B';

/**
 * BUILD exactly one version. The call is a real `buildV10App` over the same
 * selected payload bytes; the alpha Business package revision and BUILD id
 * are the independent-version inputs.
 */
export async function buildT08GovernedApp(
  version: T08BuildVersion,
  overrides: { readonly buildId?: string; readonly ambiguousAlphaRoute?: boolean } = {},
): Promise<V10BuiltApp> {
  const composition = await basicComposition({
    routes: [
      { intentId: 'submitQuoteDecisionDynamic', operationId: 'reserve', capabilityId: 'ledger', handlerId: 'reserveLedger' },
      // An authorized BUILD can still have a deterministically ambiguous
      // Standard route; governed send must refuse it BEFORE pin minting.
      ...(overrides.ambiguousAlphaRoute === true
        ? [{ intentId: 'submitQuoteDecisionDynamic', operationId: 'preview', capabilityId: 'ledger', handlerId: 'previewTotal' }]
        : []),
      { intentId: 'submitQuoteDecisionStrict', operationId: 'reserve', capabilityId: 'ledger', handlerId: 'reserveLedger' },
    ],
  });
  const alpha = composition.modules.find((module) => module.role === 'business');
  if (alpha === undefined) throw new Error('the T08 composition requires its selected Business package');
  const modules: V10ModuleInput[] = [];
  for (const module of composition.modules) {
    if (module === alpha) {
      // The same logical alpha Business identity across A/B: the K02 scope
      // must stay stable so an old A occurrence is genuinely addressable
      // through B and the immutable pin (not a different B key) is what
      // refuses the misroute.
      modules.push({ ...module, packageId: T08_BUSINESS_ALPHA });
      modules.push({
        ...module,
        packageId: T08_BUSINESS_BETA,
        provides: ['business:policy/1', 'intent:submitQuoteDecisionStrict'],
      });
    } else if (module.role === 'capability') {
      // The independent BUILD difference is the selected capability revision,
      // not the Business target identity.
      modules.push({ ...module, packageId: version === 'A' ? T08_CAPABILITY_A : T08_CAPABILITY_B });
    } else {
      modules.push({ ...module });
    }
  }
  return buildV10App({
    ...composition,
    appId: T08_APP_ID,
    modules,
    buildId: overrides.buildId ?? `t08-governed-${version}`,
  });
}

/** The exact decision a deployer submits for one built version. */
export function t08Decision(
  app: V10BuiltApp,
  version: T08BuildVersion,
  deployment: V10DeploymentIdentity = T08_DEPLOYMENT,
  overrides: Partial<V10BuildActivationDecision> = {},
): V10BuildActivationDecision {
  return Object.freeze({
    kind: 'v10/build-activation-decision',
    decisionId: `t08-decision-${version}-${deployment.tenantId}`,
    deployedAppId: deployment.deployedAppId,
    tenantId: deployment.tenantId,
    appId: deployment.appId,
    subjectDigest: app.subjectDigest,
    buildId: app.buildId,
    packageClosureDigest: v10BuildPackageClosureDigest(app),
    runtimeAbi: V10_RUNTIME_ABI,
    hostAbi: V10_HOST_ABI,
    targetProfile: V10_TARGET_PROFILE,
    approvalRef: `approval:t08:${version}:${deployment.tenantId}`,
    approvedAt: T08_APPROVED_AT,
    validUntil: T08_VALID_UNTIL,
    ...overrides,
  });
}

export function t08DecisionDigest(decision: V10BuildActivationDecision): string {
  return v10BuildActivationDecisionDigest(decision);
}

interface T08Grant {
  readonly decisionDigest: string;
  readonly subjectDigest: string;
  readonly packageClosureDigest: string;
  readonly deployedAppId: string;
  readonly tenantId: string;
  readonly appId: string;
  readonly authorizedAt: string;
  readonly expiresAt: string;
  revoked: boolean;
}

export interface T08AuthorizationAuthority {
  verify(request: V10DeploymentAuthorizationRequest): V10DeploymentAuthorizationVerdict;
  grant(decision: V10BuildActivationDecision, overrides?: Partial<Pick<T08Grant, 'authorizedAt' | 'expiresAt'>>): void;
  revoke(approvalRef: string): void;
  readonly grants: ReadonlyMap<string, T08Grant>;
}

/**
 * A trusted Host deployment-authorization authority over an in-memory grant
 * ledger. The test controls grants/revocation explicitly; a candidate,
 * Shadow report or caller-provided `approved` flag is never consulted.
 */
export function createT08AuthorizationAuthority(): T08AuthorizationAuthority {
  const grants = new Map<string, T08Grant>();
  return {
    grants,
    grant(decision, overrides = {}) {
      grants.set(decision.approvalRef, {
        decisionDigest: t08DecisionDigest(decision),
        subjectDigest: decision.subjectDigest,
        packageClosureDigest: decision.packageClosureDigest,
        deployedAppId: decision.deployedAppId,
        tenantId: decision.tenantId,
        appId: decision.appId,
        authorizedAt: overrides.authorizedAt ?? T08_APPROVED_AT,
        expiresAt: overrides.expiresAt ?? T08_VALID_UNTIL,
        revoked: false,
      });
    },
    revoke(approvalRef) {
      const grant = grants.get(approvalRef);
      if (grant === undefined) throw new Error(`no T08 authorization grant ${approvalRef}`);
      grant.revoked = true;
    },
    verify(request) {
      const grant = grants.get(request.decision.approvalRef);
      if (grant === undefined) {
        return { status: 'DENIED', reasonCode: 'DEPLOYMENT_APPROVAL_MISSING', reason: 'no external deployment approval record' };
      }
      if (grant.revoked) {
        return { status: 'DENIED', reasonCode: 'DEPLOYMENT_APPROVAL_REVOKED', reason: 'the external deployment approval was revoked' };
      }
      if (Date.parse(request.nowIso) >= Date.parse(grant.expiresAt)) {
        return { status: 'DENIED', reasonCode: 'DEPLOYMENT_APPROVAL_STALE', reason: 'the external deployment approval expired' };
      }
      if (grant.decisionDigest !== request.decisionDigest
        || grant.subjectDigest !== request.build.subjectDigest
        || grant.packageClosureDigest !== request.build.packageClosureDigest
        || grant.deployedAppId !== request.build.deployedAppId
        || grant.tenantId !== request.build.tenantId
        || grant.appId !== request.build.appId) {
        return {
          status: 'DENIED',
          reasonCode: 'DEPLOYMENT_AUTHORIZATION_UNAUTHORIZED',
          reason: 'the approval record does not bind this exact decision/BUILD/deployment tuple',
        };
      }
      return {
        status: 'AUTHORIZED',
        decisionDigest: request.decisionDigest,
        authorizationRef: request.decision.approvalRef,
        subjectDigest: request.build.subjectDigest,
        packageClosureDigest: request.build.packageClosureDigest,
        authorizedAt: grant.authorizedAt,
        expiresAt: grant.expiresAt,
      };
    },
  };
}

/** A refusal witness used by the physical suite. */
export async function t08Refusal(
  promise: Promise<unknown>,
  expectedCode: string,
): Promise<{ readonly code: string; readonly message: string }> {
  try {
    await promise;
  } catch (error) {
    const code = String((error as { code?: unknown }).code ?? 'NO_CODE');
    if (code !== expectedCode) {
      throw new Error(`expected refusal ${expectedCode}, received ${code}: ${String((error as Error).message ?? error)}`, { cause: error });
    }
    return { code, message: String((error as Error).message ?? error) };
  }
  throw new Error(`expected refusal ${expectedCode}, but the operation succeeded`);
}

/** One canonical row snapshot of the real v8_host_docs table. */
export interface T08SqliteRow {
  readonly key: string;
  readonly revision: number;
  readonly value: string;
}

/** The exact identity a governed pin must carry; keeps test assertions short. */
export function t08ExpectedBuildIdentity(app: V10BuiltApp): {
  readonly deployedAppId: string;
  readonly tenantId: string;
  readonly appId: string;
  readonly subjectDigest: string;
  readonly packageClosureDigest: string;
  readonly buildId: string;
} {
  if (app.formatVersion !== V10_BUILD_FORMAT) throw new Error('not a v10 BUILD output');
  return Object.freeze({
    deployedAppId: T08_DEPLOYMENT.deployedAppId,
    tenantId: T08_DEPLOYMENT.tenantId,
    appId: app.appId,
    subjectDigest: app.subjectDigest,
    packageClosureDigest: v10BuildPackageClosureDigest(app),
    buildId: app.buildId,
  });
}

/**
 * The durable-receipt core of one K02 replay: the original acknowledged
 * receipt envelope, excluding the optional healed `turnDisposition`
 * observation (which is a derived index, never replay truth).
 */
export function t08ReceiptCore(receipt: Record<string, unknown>): Record<string, unknown> {
  return {
    status: receipt.status,
    idempotentReplay: receipt.idempotentReplay,
    turnId: receipt.turnId,
    intentType: receipt.intentType,
    inputDigest: receipt.inputDigest,
    admitted: receipt.admitted,
    instance: receipt.instance,
    occurrence: receipt.occurrence,
    attributedAt: receipt.attributedAt,
  };
}

export function t08ReceiptCoreDigest(receipt: Record<string, unknown>): string {
  return sha256Canonical(t08ReceiptCore(receipt));
}

export function t08HashText(value: string): string {
  return sha256Hex(value);
}

/** V10DocStore over the REAL file-backed SQLite CAS store, with K write counters. */
export class T08CountingStore implements V10DocStore {
  gets = 0;
  puts = 0;
  removes = 0;
  readonly putKeys: string[] = [];
  readonly removeKeys: string[] = [];
  constructor(private readonly inner: SqliteCasStore) {}
  async get(key: string): Promise<{ value: unknown; revision: number } | null> {
    this.gets += 1;
    return await this.inner.get(key);
  }
  async put(key: string, value: unknown, condition: V10DocWriteCondition): Promise<{ revision: number }> {
    this.puts += 1;
    this.putKeys.push(key);
    return await this.inner.put(key, value, condition.kind === 'create'
      ? { mustBeAbsent: true }
      : { mustMatchRevision: condition.revision });
  }
  async remove(key: string, condition: V10DocWriteCondition): Promise<void> {
    this.removes += 1;
    this.removeKeys.push(key);
    await this.inner.remove(key, condition.kind === 'create'
      ? { mustBeAbsent: true }
      : { mustMatchRevision: condition.revision });
  }
  async keys(): Promise<readonly string[]> {
    return await this.inner.list('');
  }
  reset(): void {
    this.gets = 0;
    this.puts = 0;
    this.removes = 0;
    this.putKeys.length = 0;
    this.removeKeys.length = 0;
  }
  kPuts(): number {
    return this.putKeys.filter((key) => key.startsWith('v10/k/')).length;
  }
  kRemoves(): number {
    return this.removeKeys.filter((key) => key.startsWith('v10/k/')).length;
  }
}

/** Direct canonical row snapshot (the whole physical table). */
export function readT08Rows(kPath: string): readonly T08SqliteRow[] {
  const db = new Database(kPath, { readonly: true, fileMustExist: true });
  db.pragma('query_only = ON');
  try {
    return db.prepare('SELECT key, revision, value FROM v8_host_docs ORDER BY key').all() as T08SqliteRow[];
  } finally {
    db.close();
  }
}

/** Escape one physical key component exactly like the writer's encodeK02Component. */
function encKeyComponent(value: string): string {
  return value.replace(/%/g, '%25').replace(/:/g, '%3A');
}

/**
 * The ONE governed K-docs outer prefix (#1217): the stable
 * `deployment:<deployedAppId>:<tenantId>:<appId>` tuple. A BUILD subjectDigest
 * is a revision OF the deployment, never a physical address component — A and
 * B share this namespace, and BUILD attribution is the occurrence pin, not a
 * key prefix.
 */
export function deploymentKPrefix(deployment: V10DeploymentIdentity): string {
  return `v10/k/deployment:${encKeyComponent(deployment.deployedAppId)}:${encKeyComponent(deployment.tenantId)}:${encKeyComponent(deployment.appId)}/`;
}

/** All physical K rows of one governed deployment (every BUILD revision shares it). */
export function kRowsOf(rows: readonly T08SqliteRow[], deployment: V10DeploymentIdentity): readonly T08SqliteRow[] {
  return rows.filter((row) => row.key.startsWith(deploymentKPrefix(deployment)));
}

/** Every physical instance row of one occurrence inside one B's K02 scope. */
export function instanceRowsOf(
  rows: readonly T08SqliteRow[],
  deployment: V10DeploymentIdentity,
  businessPackageId: string,
  workflowId: string,
  instanceKey: string,
): readonly T08SqliteRow[] {
  const scope = `v010-k02:${[
    deployment.deployedAppId,
    deployment.tenantId,
    deployment.appId,
    businessPackageId,
  ].map(encKeyComponent).join(':')}:`;
  const suffix = `v08-kernel:wf-instance:${workflowId}:${instanceKey}`;
  return rows.filter((row) => row.key.startsWith(deploymentKPrefix(deployment))
    && row.key.includes(scope)
    && row.key.endsWith(suffix));
}

/** The physical instance row of one occurrence (first match), or undefined. */
export function instanceRowOf(
  rows: readonly T08SqliteRow[],
  deployment: V10DeploymentIdentity,
  businessPackageId: string,
  workflowId: string,
  instanceKey: string,
): T08SqliteRow | undefined {
  return instanceRowsOf(rows, deployment, businessPackageId, workflowId, instanceKey)[0];
}

