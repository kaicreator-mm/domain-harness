import { V10_ROUTER_ELIGIBILITY, V10_ROUTER_PRIORITY, v10RouterBasisDigest } from '@kaicreator/domain-harness-contracts';
import type { V10BuiltApp } from '@kaicreator/domain-harness-contracts';
import { assertVerifiedSelection, canonicalDigest, digest } from './knowledge.js';
import type { ObjectData, Selection } from './types.js';

export type QualifiedBuild = { app: V10BuiltApp; selection: Selection; adapterSha256: string; selectedDigest: string };
const qualifiedBuilds = new WeakMap<QualifiedBuild, string>();

export function registerBuild(built: QualifiedBuild): QualifiedBuild {
  assertVerifiedSelection(built.selection);
  qualifiedBuilds.set(built, canonicalDigest(built));
  return built;
}

export async function attachConsumer(built: QualifiedBuild, lockSha256: string, kernelSha256: string) {
  if (!qualifiedBuilds.has(built) || qualifiedBuilds.get(built) !== canonicalDigest(built)) throw new Error('BUILD_NOT_QUALIFIED');
  if (built.selection.lockSha256 !== lockSha256) throw new Error('KDP_PACKAGE_LOCK_MISMATCH');
  const { app, selection, selectedDigest } = structuredClone(built);
  const kernel = app.modules.filter((item) => item.role === 'kernel-primary');
  if (kernel.length !== 1 || kernel[0].moduleSha256 !== kernelSha256 || digest(kernel[0].moduleSource) !== kernelSha256) {
    throw new Error('BUILD_KERNEL_NOT_SELECTED');
  }
  const provider = app.modules.filter((item) => item.role === 'capability');
  if (provider.length !== 1 || provider[0].externalEffect !== false || provider[0].capabilityId !== 'dis-player'
      || canonicalDigest(provider[0].handlers) !== canonicalDigest([{ operationId: 'dis.consume', handler: 'consumeObservation' }])) {
    throw new Error('BUILD_PROVIDER_NOT_SELECTED');
  }
  const actual = provider[0];
  const rawDigest = digest(actual.moduleSource);
  if (!selection.providerArtifact || rawDigest !== selection.providerArtifact.sha256 || rawDigest !== actual.moduleSha256) {
    throw new Error('BUILD_PROVIDER_DIGEST_MISMATCH');
  }
  const namespaces = new Map<string, ObjectData>();
  for (const packageId of app.loadOrder) {
    if (packageId === kernel[0].packageId) continue; // Already selected and initialized.
    const entry = app.modules.find((module) => module.packageId === packageId);
    if (!entry || digest(entry.moduleSource) !== entry.moduleSha256) throw new Error('BUILD_MODULE_DIGEST_MISMATCH');
    const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(entry.moduleSource).toString('base64');
    const loaded = await import(moduleUrl) as ObjectData;
    if (loaded.MODULE_ID !== packageId) throw new Error('BUILD_MODULE_IDENTITY_MISMATCH');
    namespaces.set(packageId, loaded);
  }
  const loaded = namespaces.get(actual.packageId);
  if (typeof loaded?.consumeObservation !== 'function') throw new Error('PROVIDER_ENTRY_INVALID');
  const consumeObservation = loaded.consumeObservation as (input: unknown, selection: Selection) => ObjectData;
  const business = app.modules.find((module) => module.role === 'business');
  const standard = app.modules.find((module) => module.role === 'standard-primary');
  const getPolicy = business && namespaces.get(business.packageId)?.getPolicy;
  const route = standard && namespaces.get(standard.packageId)?.routeWorkflowIntent;
  if (typeof getPolicy !== 'function' || typeof route !== 'function') throw new Error('BUILD_APP_ENDPOINT_UNAVAILABLE');
  const policy = getPolicy() as ObjectData;
  if (policy.packageId !== business?.packageId || policy.packageRevision !== selection.revision
      || policy.definitionId !== selection.packageId || policy.graphSha256 !== selection.graphSha256) throw new Error('BUILD_APP_POLICY_MISMATCH');
  const binding = policy.readBinding as {intentId:string;operationId:string;capabilityId:string;handlerId:string;scope:string};
  if (!binding || !selection.businessPolicy || canonicalDigest(binding) !== canonicalDigest(selection.businessPolicy) || binding.scope !== 'PRIVATE_LOCAL_READ_ONLY' || binding.intentId !== 'recognizePlayer'
      || binding.operationId !== 'dis.consume' || binding.capabilityId !== 'dis-player' || binding.handlerId !== 'consumeObservation') throw new Error('BUILD_APP_READ_POLICY_INVALID');
  const basisDigest = v10RouterBasisDigest(app.subjectDigest);
  return {
    authorize(intentId: string) {
      if (intentId !== binding.intentId) throw new Error('BUILD_ROUTE_UNAUTHORIZED');
      const bindings = app.routes.filter((row) => row.intentId === intentId);
      const candidates = bindings.map((row) => ({ operationId: row.operationId, capabilityId: row.capabilityId,
        priority: V10_ROUTER_PRIORITY, eligibility: V10_ROUTER_ELIGIBILITY }));
      const selected = route({ intentId, basisDigest, bindings, candidates }) as ObjectData;
      if (selected.kind !== 'selected' || selected.basisDigest !== basisDigest
          || selected.operationId !== binding.operationId || selected.capabilityId !== binding.capabilityId
          || selected.handlerId !== binding.handlerId) throw new Error('BUILD_ROUTE_UNAUTHORIZED');
    },
    consume(input: unknown) {
      const result = consumeObservation(input, selection);
      return { ...result, selectedDigest, providerArtifact: { ...selection.providerArtifact },
        strategyKnowledge: { ...selection.strategyKnowledge }, buildSubjectDigest: app.subjectDigest };
    },
  };
}
