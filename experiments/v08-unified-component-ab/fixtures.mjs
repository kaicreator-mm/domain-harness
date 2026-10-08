// B candidate assembly fixtures: source definitions and implementation bindings stay separate.
export const kind = kindId => ({kindId: 'std.'+kindId,version:'1.0.0'});
export const cap = (capabilityId,operations,version='1.0.0') => ({capabilityId,version,operations});
const op = (operationId,input,output,effect='none')=>({
  operationId,inputSchema:{required:input},outputSchema:{required:output},
  failures:[],effect
});
const component = (packageId,componentId,kindName,semanticBody,provided=[],required=[],relations=[],operations=[])=>({
  schemaVersion:'ucb/1',componentId,packageId,kindRef:kind(kindName),semanticBody,
  requiredSemanticContracts:[],requiresCapabilities:required,
  providesCapabilities:provided,relations,operations
});
export function componentsFor(businessId='approval') {
 const field=businessId==='approval'?'approved':'completed';
 const threshold=businessId==='approval'?70:80;
 return [
  component('sdk','schema','schema',{numberInput:true}),
  component(businessId,'rule','rule',{threshold},
    [cap('rule.check',['test'])],[],[{targetComponentId:'schema',relationKind:'depends-on-schema'}],
    [op('test',{value:'number'},{eligible:'boolean'})]),
  component('sdk','decision','decision',{policy:'lexicographic',empty:'WAIT'},
    [cap('decision.choose',['choose'])],[cap('rule.check',['test'])],[],
    [op('choose',{value:'number',candidates:'object'},{status:'string',selected:'string',candidates:'object'})]),
  component(businessId,'workflow','workflow',{maxSteps:4,wait:'WAIT'},
    [cap('workflow.run',['run'])],[cap('decision.choose',['choose']),cap('business.action',['perform'])],[],
    [op('run',{value:'number',candidates:'object'},{status:'string',facts:'object',selected:'string'})]),
  component(businessId,'action','operation',{field},[cap('business.action',['perform'])],[],[],
    [op('perform',{selected:'string'},{facts:'object'})]),
  component(businessId,'notice','operation',{target:'external'},[cap('business.notify',['send'])],[],[],
    [op('send',{message:'string'},{accepted:'boolean'},'non-idempotent')])
 ];
}
const impl = (c,handlers) => ({
 componentId:c.componentId,kindRef:structuredClone(c.kindRef),
 implementationId:'impl.'+c.componentId,implementationVersion:'1.0.0',
 implementationDigest:'fixed-'+c.packageId+'-'+c.componentId+'-01',handlers
});
export function implementationsFor(components) {
 return components.map(c=>{
  const body=c.semanticBody;
  let handlers={};
  switch(c.componentId){
   case 'schema': handlers={};break;
   case 'rule': handlers={
    test:(ctx,{value})=>{
      const schema=ctx.semantic('schema');
      if (schema.numberInput!==true) throw new Error('schema mismatch');
      return {eligible:value>=body.threshold};
    }
   };break;
   case 'decision': handlers={
    choose:(ctx,{value,candidates})=>{
      const eligible=candidates.filter(x=>ctx.invoke('rule.check@1.0.0','test',{value}).eligible)
        .map(x=>String(x)).sort();
      return {status:eligible.length?'SELECT':'WAIT',selected:eligible[0]||'',candidates:eligible};
    }
   };break;
   case 'workflow': handlers={
    run:(ctx,{value,candidates})=>{
      const choice=ctx.invoke('decision.choose@1.0.0','choose',{value,candidates});
      if(choice.status==='WAIT')return {status:'WAIT',facts:{},selected:''};
      const output=ctx.invoke('business.action@1.0.0','perform',{selected:choice.selected});
      return {status:'COMPLETE',facts:output.facts,selected:choice.selected};
    }
   };break;
   case 'action': handlers={perform:(_,{selected})=>({facts:{[body.field]:true,choice:selected}})};break;
   case 'notice':handlers={send:(_,{message})=>({accepted:message.length>0})};break;
   default:handlers={};
  }
  return impl(c,handlers);
 });
}
export function assemblyInputs(packagePins,businessId) {
 const components=componentsFor(businessId);
 return {packages:packagePins,components,implementations:implementationsFor(components),
  entryCapabilities:['workflow.run@1.0.0','business.notify@1.0.0']};
}
