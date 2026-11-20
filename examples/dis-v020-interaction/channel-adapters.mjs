/**
 * DIS 0.2.0 D03 — distinct deterministic demo consumers for Chat, HTML Form
 * URLSearchParams and process CLI argv. The adapter ONLY shapes user Intent;
 * it cannot submit a KDP intent, call a Host or grant an Effect permit.
 * This is an executable consumer seam, not a production web/chat/CLI app.
 */
const fail=()=>{throw Object.assign(new Error('DIS_ADAPTER_INVALID'),{code:'DIS_ADAPTER_INVALID'})};
const bytes=x=>{
 if(typeof x!=='string'||!/^[1-9][0-9]{0,11}$/.test(x))fail();
 return Number(x);
};
function formFields(form,allowed){
 if(!(form instanceof URLSearchParams))fail();
 const entries=[...form.keys()];
 if(entries.some(k=>!allowed.includes(k))||new Set(entries).size!==entries.length)fail();
}
export function chatInitial(message,requestId){
 if(typeof message!=='string')fail();
 const matched=/^download (https:\/\/\S+)$/u.exec(message.trim());
 if(!matched)fail();
 return {channel:'chat',requestId,url:matched[1]};
}
export function chatFollowUp(message){
 if(typeof message!=='string')fail();
 const matched=/^bytes ([1-9][0-9]{0,11})( confirm)?$/u.exec(message.trim());
 if(!matched)fail();
 return {answers:{declaredBytes:bytes(matched[1])},confirmed:matched[2]!==undefined};
}
export function formInitial(form,requestId){
 formFields(form,['url']);
 if(!form.has('url'))fail();
 return {channel:'form',requestId,url:form.get('url')};
}
export function formFollowUp(form){
 formFields(form,['declaredBytes','confirmed']);
 if(!form.has('declaredBytes'))fail();
 const flag=form.get('confirmed');
 if(flag!==null&&flag!=='on')fail();
 return {answers:{declaredBytes:bytes(form.get('declaredBytes'))},confirmed:flag==='on'};
}
export function cliInitial(argv,requestId){
 if(!Array.isArray(argv)||argv.length!==2||argv[0]!=='download'||typeof argv[1]!=='string')fail();
 return {channel:'cli',requestId,url:argv[1]};
}
export function cliFollowUp(argv){
 if(!Array.isArray(argv)||!([2,3].includes(argv.length))||
    argv[0]!=='--bytes'||(argv.length===3&&argv[2]!=='--confirm'))fail();
 return {answers:{declaredBytes:bytes(argv[1])},confirmed:argv.length===3};
}
export async function consumeDownloadSession(app,{initial,followUp}){
 const inspected=await app.invoke('xdownload.interaction.inspect',initial);
 if(inspected.kind!=='OBSERVATION'||inspected.authority!=='NONE')fail();
 if(inspected.value.status==='REJECTED')return {inspected,final:null};
 const final=await app.invoke('xdownload.interaction.confirm',{
  draft:inspected.value,answers:followUp.answers,confirmed:followUp.confirmed
 });
 if(final.kind!=='OBSERVATION'||final.authority!=='NONE')fail();
 return {inspected,final};
}
