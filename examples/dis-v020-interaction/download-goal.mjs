/**
 * DIS v0.2.0 Interaction Element demonstration using the existing xDownload
 * business domain. Chat/Form/CLI are input views, NOT permissions.
 * Source is self-built and sealed; intentionally no I/O, network, Host, LLM,
 * direct KDP Intent, credential access or external effects.
 */
export const INTERACTION_SOURCE_VERSION='dis.v0.2.download-interaction/1';
const MAX_BYTES=1024*1024;
const channels=new Set(['chat','form','cli']);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
  Object.getPrototypeOf(value)===Object.prototype;
const frozen=value=>Object.freeze(value);
const response=(status,data={})=>frozen({status,authority:'NONE',effectDispatched:false,...data});
const permitted=(input,keys)=>Object.keys(input).every(x=>keys.includes(x));
export function inspectDownloadGoal(input){
 if(!plain(input)||!permitted(input,['channel','requestId','url','declaredBytes']))
  return response('REJECTED',{reason:'UNSUPPORTED_INPUT'});
 if(!channels.has(input.channel)||typeof input.requestId!=='string'||
    !/^[A-Za-z0-9:_-]{1,80}$/.test(input.requestId))
  return response('REJECTED',{reason:'INVALID_ORIGIN'});
 const proposal={channel:input.channel,requestId:input.requestId};
 if(input.url!==undefined&&input.url!==null){
  if(typeof input.url!=='string')return response('REJECTED',{reason:'INVALID_URL'});
  try{
   const url=new URL(input.url);
   if(url.protocol!=='https:'||!url.hostname||url.username||url.password||
      url.hash||url.searchParams.has('token'))return response('REJECTED',{reason:'INVALID_URL'});
   proposal.url=url.href;
  }catch{return response('REJECTED',{reason:'INVALID_URL'})}
 }
 if(input.declaredBytes!==undefined&&input.declaredBytes!==null){
  const n=input.declaredBytes;
  if(!Number.isSafeInteger(n)||n<=0||n>MAX_BYTES)
   return response('REJECTED',{reason:'INVALID_SIZE_OR_LIMIT'});
  proposal.declaredBytes=n;
 }
 const missing=[];
 if(!proposal.url)missing.push('url');
 if(!proposal.declaredBytes)missing.push('declaredBytes');
 if(missing.length)return response('CLARIFICATION_REQUIRED',{
  missing:frozen(missing),proposal:frozen(proposal)
 });
 return response('AWAITING_CONFIRMATION',{proposal:frozen(proposal)});
}
export function confirmDownloadGoal(input){
 if(!plain(input)||!permitted(input,['draft','answers','confirmed'])||
    !plain(input.draft)||!plain(input.draft.proposal)||!plain(input.answers??{}))
  return response('REJECTED',{reason:'INVALID_CLARIFICATION'});
 if(!permitted(input.answers??{},['url','declaredBytes']))
  return response('REJECTED',{reason:'UNDECLARED_ANSWER'});
 // Re-evaluate from the original bounded user input, never trust an externally
 // injected status such as "READY" or "approved" carried in draft data.
 const rechecked=inspectDownloadGoal({...input.draft.proposal,...(input.answers??{})});
 if(rechecked.status==='REJECTED'||rechecked.status==='CLARIFICATION_REQUIRED')return rechecked;
 if(input.confirmed!==true)return rechecked;
 return response('READY_FOR_KDP',{
  proposal:rechecked.proposal,
  prerequisite:'A_SEPARATE_SELECTED_KDP_INTENT_CALL_IS_REQUIRED',
  // This result is still an OBSERVATION, NOT a KDP permit/receipt.
  permittedEffect:false
 });
}
