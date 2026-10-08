// A is a non-authoritative uniform runtime-facing view of real frozen v0.7 records.
// All legacy validator/selection/digest calls happen in a separate exact v0.7 checkout.
import {adaptLegacyView, UCError} from './unified.mjs';
export function unifyLegacyRuntime({validatedEnvelopes,selectedProvider,handlers,kindAdapters}) {
 const nodes=new Map(validatedEnvelopes.map(raw=> {
  const view=adaptLegacyView(raw);
  return [view.componentId,{view,raw}];
 }));
 if(nodes.size!==validatedEnvelopes.length) throw new UCError('E_LEGACY_DUPLICATE');
 if (!nodes.has(selectedProvider)) throw new UCError('E_LEGACY_PROVIDER');
 return Object.freeze({
  describe: id=>nodes.get(id)?.view,
  invoke(componentId,operation,input) {
   const node=nodes.get(componentId);
   if (!node) throw new UCError('E_LEGACY_NODE');
   const {view}=node;
   // v0.7 Tool operation declaration is consumed unchanged. Semantic callable
   // exposure requires an explicit selected exact Kind adapter, not a fake Tool family.
   const toolOperation=view.operations.find(x=>x.operationId===operation);
   const selected=handlers?.[componentId];
   const kind=kindAdapters?.[view.kindRef.kindId+'@'+view.kindRef.version];
   if(view.legacyFamily==='tool') {
    if(componentId!==selectedProvider || !toolOperation || typeof selected?.[operation]!=='function')
      throw new UCError('E_LEGACY_NOT_ADMITTED');
    return selected[operation](structuredClone(input));
   }
   if(!kind || typeof kind[operation]!=='function') throw new UCError('E_LEGACY_NOT_CALLABLE');
   return kind[operation](structuredClone(input),structuredClone(view.semanticBody));
  }
 });
}
