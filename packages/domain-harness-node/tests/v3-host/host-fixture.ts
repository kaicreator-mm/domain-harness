import type {
  AdmissionDurableEffectJournal,
  CreateDomainRuntimeV3AuthorityOptions,
  GovernanceBaselineBody,
} from '@kaicreator/domain-harness';
import {
  StaticPackageRegistry,
  createDomainRuntimeV3,
} from '@kaicreator/domain-harness';
import type { TargetCompiledDomainPackage } from '@kaicreator/domain-harness/v2';
import { computeCompiledPackageId } from '../../../domain-harness/src/package/index.js';
import {
  CAP_INVARIANT,
  ScriptedEffectTools,
  makeBaseline,
  sha256,
  target,
  workflowInstanceId,
} from '../../../domain-harness/tests/admission/helpers.js';
import { createRuntimeHostFake } from '../../../domain-harness/tests/helpers/runtime-host-fake.js';
import { NodeSqliteRuntimeStore } from '../../src/store/node-sqlite-runtime-store.js';
import {
  openNodeSqliteAuthorityStores,
  type NodeSqliteAuthorityStores,
} from '../../src/store/node-sqlite-authority-stores.js';

export type HostAssembly = Awaited<ReturnType<typeof createDomainRuntimeV3>>;

export interface HostFixtureOptions {
  /**
   * Crash-window interposition: wrap the durable admission effect journal
   * before the assembly captures it (V8/V9 child processes).
   */
  readonly wrapEffectJournal?: (
    inner: AdmissionDurableEffectJournal,
  ) => AdmissionDurableEffectJournal;
  /** Override the effect tool port (V9 mid-execute crash). */
  readonly effectTools?: ScriptedEffectTools;
}

export interface HostFixture {
  readonly path: string;
  readonly store: NodeSqliteRuntimeStore;
  readonly authorities: NodeSqliteAuthorityStores;
  readonly assembly: HostAssembly;
  readonly tools: ScriptedEffectTools;
  readonly packageId: string;
  readonly b1: GovernanceBaselineBody;
  readonly b2: GovernanceBaselineBody;
  close(): void;
}

/**
 * The T-022 assembled Node Build Host: the ONE v0.2 runtime plus the full
 * v0.3 authority stack, every durable port bound to the same SQLite file
 * (NodeSqliteRuntimeStore + openNodeSqliteAuthorityStores). Mirrors the core
 * assembly fixture, replacing every volatile/memory port with its physical
 * adapter.
 */
export async function bootablePackage(): Promise<TargetCompiledDomainPackage> {
  const manifest: TargetCompiledDomainPackage['manifest'] = {
    formatVersion: '0.2',
    runtimeContractMajor: 2,
    executionEngineMajor: 2,
    domainId: 'orders',
    domainVersion: '0.3.0-node-host-test',
    packageId: 'pending',
    targetProfileId: 't022-node-host@1',
    requiredCapabilities: [],
    workflows: {
      'order-quote': {
        workflowId: 'order-quote',
        definition: {
          initial: 'review',
          states: {
            review: { final: false, done: [], error: [], events: {} },
            approved: { final: true, done: [], error: [], events: {} },
          },
          limits: { maxSteps: 32 },
        },
        messageContracts: {},
      },
    },
    tools: {},
    projections: {},
    schemas: {},
    bindingDigests: {},
  };
  manifest.packageId = await computeCompiledPackageId(manifest, sha256);
  return { manifest, bindings: {} };
}

export async function openHostFixture(
  path: string,
  options: HostFixtureOptions = {},
): Promise<HostFixture> {
  const store = new NodeSqliteRuntimeStore({ path });
  const authorities = openNodeSqliteAuthorityStores({ path });
  const b1 = await makeBaseline('B1', [CAP_INVARIANT]);
  const b2 = await makeBaseline('B2', []);
  await authorities.baselines.putBody(b1);
  await authorities.baselines.putBody(b2);
  const tools = options.effectTools ?? new ScriptedEffectTools({ 'effect:reserve': 'non-idempotent' });
  const bindings = createRuntimeHostFake({ sha256 });
  const compiledPackage = await bootablePackage();
  const v3: CreateDomainRuntimeV3AuthorityOptions = {
    baselines: authorities.baselines,
    activationAuthority: authorities.activation,
    exactPackageCdi: authorities.exactPackageCdi,
    durableExecution: store,
    effectJournal: options.wrapEffectJournal === undefined
      ? authorities.admissionEffectJournal
      : options.wrapEffectJournal(authorities.admissionEffectJournal),
    effectTools: tools,
    evidence: authorities.evidence,
  };
  const assembly = await createDomainRuntimeV3({
    packageRegistry: new StaticPackageRegistry([compiledPackage], compiledPackage.manifest.packageId),
    store,
    bindings,
    v3,
  });
  let closed = false;
  return {
    path,
    store,
    authorities,
    assembly,
    tools,
    packageId: compiledPackage.manifest.packageId,
    b1,
    b2,
    close() {
      if (closed) return;
      closed = true;
      authorities.close();
      store.close();
    },
  };
}

/** Pin the conformance instance to baseline B1 through the assembled governance surface. */
export async function pinInstance(fixture: HostFixture): Promise<void> {
  await fixture.assembly.governance.pinExecution({
    workflowTarget: target.workflowId,
    workflowInstanceId,
    binding: {
      domainId: 'orders',
      packageId: fixture.packageId,
      domainIntelligenceContentDigest: 'cdi-orders-b1',
      governanceBaseline: fixture.b1.identity,
    },
  });
}
