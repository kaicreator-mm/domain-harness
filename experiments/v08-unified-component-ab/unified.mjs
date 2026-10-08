// Candidate B only: no production state/effect/replay authority.
import { createHash } from 'node:crypto';

export class UCError extends Error {
  constructor(code, detail = code) { super(detail); this.name = 'UCError'; this.code = code; }
}
const deny = (code, message) => { throw new UCError(code, message); };
const clone = v => structuredClone(v);
const eq = (a,b) => a.kindId === b.kindId && a.version === b.version;
const exact = v => typeof v === 'string' && v.length > 0 && !/(latest|default|current|active|\*|\^|~|^x$)/i.test(v);
const sortKeys = v => Array.isArray(v) ? v.map(sortKeys)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])])) : v;
export const digest = v => createHash('sha256').update(JSON.stringify(sortKeys(v))).digest('hex');
const snapshot = v => {
  try { return clone(v); } catch { deny('E_INVALID_RECORD'); }
};
function fields(value, contract, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) deny(code);
  for (const [field,type] of Object.entries(contract?.required || {})) {
    if (!(field in value) || (type !== 'any' && typeof value[field] !== type)) deny(code, field);
  }
}
export function validateComponent(component) {
  if (!component || typeof component !== 'object' || Array.isArray(component)) deny('E_COMPONENT');
  const allowed = ['schemaVersion','componentId','packageId','kindRef','semanticBody',
    'requiredSemanticContracts','requiresCapabilities','providesCapabilities','relations','operations'];
  if (Object.keys(component).some(k => !allowed.includes(k))) deny('E_COMPONENT_FIELD');
  if (component.schemaVersion !== 'ucb/1' || !exact(component.componentId) || !exact(component.packageId)
    || !exact(component.kindRef?.kindId) || !/^\d+\.\d+\.\d+$/.test(component.kindRef?.version))
    deny('E_COMPONENT');
  if (!Array.isArray(component.requiredSemanticContracts) ||
      !Array.isArray(component.requiresCapabilities) ||
      !Array.isArray(component.providesCapabilities) ||
      !Array.isArray(component.relations) ||
      (component.operations !== undefined && !Array.isArray(component.operations)))
    deny('E_COMPONENT');
  if (component.semanticBody === undefined) deny('E_SEMANTIC_BODY');
  const ops = component.operations || [];
  if (new Set(ops.map(op => op.operationId)).size !== ops.length) deny('E_OPERATION_DUPLICATE');
  for (const op of ops) {
    if (!exact(op.operationId) || !['none','idempotent','non-idempotent'].includes(op.effect)
      || !op.inputSchema || !op.outputSchema || !Array.isArray(op.failures))
      deny('E_OPERATION_CONTRACT');
  }
  for (const group of ['requiresCapabilities','providesCapabilities']) {
    for (const cap of component[group]) {
      if (!exact(cap.capabilityId) || !/^\d+\.\d+\.\d+$/.test(cap.version)
        || !Array.isArray(cap.operations) || !cap.operations.length || cap.operations.some(o => !exact(o)))
        deny('E_CAPABILITY_CONTRACT');
      if (group === 'providesCapabilities' && cap.operations.some(o => !ops.some(x => x.operationId === o)))
        deny('E_UNDECLARED_OPERATION', cap.capabilityId);
    }
  }
  for (const relation of component.relations) {
    if (!exact(relation.targetComponentId) || !exact(relation.relationKind)) deny('E_RELATION');
  }
  return component;
}
export function adaptLegacyView(envelope) {
  // View only. NEVER serialize this as a replacement for historical digest inputs.
  if (!['semantic','tool'].includes(envelope?.family)) deny('E_LEGACY_FAMILY');
  const ops = envelope.family === 'tool' ? envelope.semanticBody.operations : [];
  const provided = envelope.family === 'tool' ? envelope.semanticBody.providesCapabilities : [];
  if (!Array.isArray(ops) || !Array.isArray(provided)) deny('E_LEGACY_TOOL');
  return Object.freeze({
    legacyFamily: envelope.family,
    componentId: envelope.componentId,
    kindRef: clone(envelope.kind),
    semanticBody: clone(envelope.semanticBody),
    requiredCapabilities: clone(envelope.requiredCapabilities),
    providedCapabilities: clone(provided),
    operations: clone(ops),
    callable: ops.length > 0
  });
}
const capKey = cap => cap.capabilityId + '@' + cap.version;
const sorted = items => [...items].sort((a,b) => a.localeCompare(b));
const freezeDeep = v => {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.values(v).forEach(freezeDeep); Object.freeze(v);
  } return v;
};
export function sealB({ packages, components, implementations, entryCapabilities, effectAuthority = null }) {
  if (!Array.isArray(packages) || !packages.length || !Array.isArray(components)
    || !Array.isArray(implementations) || !Array.isArray(entryCapabilities))
    deny('E_GRAPH');
  const pkgMap = new Map();
  for (const pkg of packages) {
    if (!exact(pkg.id) || !exact(pkg.version) || !exact(pkg.digest) || pkgMap.has(pkg.id))
      deny('E_PACKAGE_IDENTITY');
    pkgMap.set(pkg.id,pkg);
  }
  const graph = new Map(), providers = new Map();
  for (const raw of components) {
    const c = snapshot(raw); validateComponent(c);
    if (!pkgMap.has(c.packageId) || graph.has(c.componentId)) deny('E_GRAPH_COMPONENT');
    graph.set(c.componentId,c);
    for (const cap of c.providesCapabilities) {
      const key = capKey(cap);
      if (providers.has(key)) deny('E_AMBIGUOUS_PROVIDER',key);
      providers.set(key,{ component:c, capability:cap });
    }
  }
  for (const c of graph.values()) {
    for (const rel of c.relations) if (!graph.has(rel.targetComponentId))
      deny('E_RELATION_TARGET',rel.targetComponentId);
    for (const req of c.requiresCapabilities) {
      const p=providers.get(capKey(req));
      if (!p) deny('E_MISSING_PROVIDER',capKey(req));
      if (req.operations.some(op=>!p.capability.operations.includes(op)))
        deny('E_UNDECLARED_OPERATION',capKey(req));
    }
  }
  const seen = new Set(), running = new Set();
  function visit(id) {
    if (running.has(id)) deny('E_CAPABILITY_CYCLE');
    if (seen.has(id)) return;
    running.add(id);
    for(const req of graph.get(id).requiresCapabilities) visit(providers.get(capKey(req)).component.componentId);
    running.delete(id);seen.add(id);
  }
  for (const id of graph.keys()) visit(id);
  const byComponent = new Map();
  for (const binding of implementations) {
    const c=graph.get(binding.componentId);
    if (!c || byComponent.has(binding.componentId)) deny('E_BINDING');
    if (!eq(c.kindRef,binding.kindRef)) deny('E_KIND_BINDING_MISMATCH');
    if (!exact(binding.implementationId) || !exact(binding.implementationVersion) || !exact(binding.implementationDigest))
      deny('E_BINDING_IDENTITY');
    const operations=c.operations || [];
    if (operations.some(op=>typeof binding.handlers?.[op.operationId]!=='function')) deny('E_BINDING_OPERATION');
    byComponent.set(c.componentId,binding);
  }
  for(const c of graph.values()) if ((c.operations||[]).length && !byComponent.has(c.componentId))
    deny('E_MISSING_IMPLEMENTATION');
  for(const entry of entryCapabilities) if(!providers.has(entry)) deny('E_MISSING_ENTRY');
  const orderedComponents=[...graph.values()].sort((a,b)=>a.componentId.localeCompare(b.componentId));
  const definitionDigest=digest({domain:'ucb.definition.v1',components:orderedComponents});
  const assemblyIdentity={
    domain:'ucb.assembly.v1',definitionDigest,
    packages:[...pkgMap.values()].sort((a,b)=>a.id.localeCompare(b.id)).map(p=>({id:p.id,version:p.version,digest:p.digest})),
    bindings:[...byComponent].sort((a,b)=>a[0].localeCompare(b[0])).map(([id,b])=>({
      componentId:id,kindRef:b.kindRef,implementationId:b.implementationId,
      implementationVersion:b.implementationVersion,implementationDigest:b.implementationDigest}))
  };
  const assembly=freezeDeep({...assemblyIdentity,digest:digest(assemblyIdentity)});
  function execute(callerId, capabilityId, operation, input, expectedAssembly) {
    if(expectedAssembly!==assembly.digest) deny('E_FOREIGN_ASSEMBLY');
    const target=providers.get(capabilityId), c=target?.component;
    if (!target) deny('E_MISSING_PROVIDER',capabilityId);
    if (!target.capability.operations.includes(operation)) deny('E_UNDECLARED_OPERATION');
    if (callerId === 'host') {
      if (!entryCapabilities.includes(capabilityId)) deny('E_UNAUTHORIZED');
    } else {
      const caller=graph.get(callerId);
      if (!caller || !caller.requiresCapabilities.some(r=>capKey(r)===capabilityId&&r.operations.includes(operation)))
        deny('E_UNAUTHORIZED',callerId);
    }
    const op = (c.operations||[]).find(o=>o.operationId===operation);
    if(!op)deny('E_UNDECLARED_OPERATION');
    fields(input,op.inputSchema,'E_INPUT_SCHEMA');
    const implementation=byComponent.get(c.componentId);
    if (!implementation)deny('E_MISSING_IMPLEMENTATION');
    const ctx=Object.freeze({
      assemblyDigest:assembly.digest,
      invoke:(cap,operation,args)=>execute(c.componentId,cap,operation,args,assembly.digest),
      semantic: targetId => {
        if(!c.relations.some(r=>r.targetComponentId===targetId))deny('E_UNAUTHORIZED_SEMANTIC');
        return snapshot(graph.get(targetId).semanticBody);
      }
    });
    let out;
    if (op.effect === 'none') out = implementation.handlers[operation](ctx,snapshot(input));
    else {
      if (!effectAuthority || typeof effectAuthority.invoke !== 'function') deny('E_EFFECT_AUTHORITY');
      // This port is host-owned; the candidate never commits state or owns a journal.
      out = effectAuthority.invoke({assemblyDigest:assembly.digest,componentId:c.componentId,
        operation,effect:op.effect,input:snapshot(input),
        perform:()=>implementation.handlers[operation](ctx,snapshot(input))});
    }
    fields(out,op.outputSchema,'E_OUTPUT_SCHEMA');
    return snapshot(out);
  }
  return Object.freeze({
    assembly,
    inspect: id => snapshot(graph.get(id)),
    invoke: (cap,operation,input,{expectedAssembly=assembly.digest}={}) =>
      execute('host',cap,operation,input,expectedAssembly)
  });
}
