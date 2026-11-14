/**
 * DIS v0.2.0 B06 — actual loopback HTTP transport for an AOT-selected,
 * UI-neutral xDownload Interaction Element. Demo only: not public/production.
 * Never forwards a request to KDP Effect, Host, or a trusted installer.
 */
import {createServer} from 'node:http';
import {
 chatInitial,chatFollowUp,formInitial,formFollowUp,consumeDownloadSession
} from './channel-adapters.mjs';

const reject=(code='DIS_HTTP_INVALID')=>{throw Object.assign(new Error(code),{code})};
const validId=x=>typeof x==='string'&&/^[a-zA-Z0-9_.:-]{1,64}$/.test(x);
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
function reply(res,status,body){
 res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store',
  'x-content-type-options':'nosniff'});
 res.end(JSON.stringify(body));
}
async function boundedBody(req,maxBytes){
 const chunks=[];let length=0;
 for await(const chunk of req){
  length+=chunk.length;
  if(length<=maxBytes)chunks.push(chunk);
 }
 if(length>maxBytes)reject('DIS_HTTP_TOO_LARGE');
 return Buffer.concat(chunks).toString('utf8');
}
function decodeForm(text){
 const fields=new URLSearchParams(text);
 const keys=[...fields.keys()];
 if(keys.length!==4&&keys.length!==3)reject();
 if(keys.some(k=>!['requestId','url','declaredBytes','confirmed'].includes(k))||
    new Set(keys).size!==keys.length||
    !fields.has('requestId')||!fields.has('url')||!fields.has('declaredBytes')||
    !validId(fields.get('requestId')))reject();
 const first=formInitial(new URLSearchParams({url:fields.get('url')}),fields.get('requestId'));
 const second=new URLSearchParams({declaredBytes:fields.get('declaredBytes')});
 if(fields.has('confirmed'))second.set('confirmed',fields.get('confirmed'));
 return {initial:first,followUp:formFollowUp(second)};
}
function decodeChat(text){
 let value;
 try{value=JSON.parse(text)}catch{reject()}
 if(!plain(value)||Object.keys(value).sort().join(',')!=='followUpMessage,initialMessage,requestId'||
    !validId(value.requestId))reject();
 return {initial:chatInitial(value.initialMessage,value.requestId),
  followUp:chatFollowUp(value.followUpMessage)};
}
function summarize({inspected,final},initial){
 const result=final??inspected;
 if(result.kind!=='OBSERVATION'||result.authority!=='NONE')reject();
 return {
  kind:'OBSERVATION',channel:initial.channel,requestId:initial.requestId,
  status:result.value.status,disposition:result.disposition,authority:'NONE',
  evidenceAttested:result.evidence?.attested===true,
  permittedEffect:result.value.permittedEffect===true,
  effectDispatched:result.value.effectDispatched===true,
  proposal:result.value.proposal??null
 };
}
export function createDisV020InteractionHttpServer(app,{maxBodyBytes=4096}={}){
 if(!app||typeof app.invoke!=='function'||!Number.isInteger(maxBodyBytes)||maxBodyBytes<128||maxBodyBytes>65536)
  reject();
 const server=createServer(async(req,res)=>{
  try{
   if(req.method!=='POST')reject('DIS_HTTP_METHOD');
   if(!['/interaction/form','/interaction/chat'].includes(req.url))reject('DIS_HTTP_ROUTE');
   if(req.headers.authorization!==undefined||req.headers.cookie!==undefined)
    reject('DIS_HTTP_CREDENTIALS');
   const mime=req.headers['content-type']?.split(';')[0]?.trim()?.toLowerCase();
   const mode=req.url.endsWith('/form')?'form':'chat';
   if(mime!==(mode==='form'?'application/x-www-form-urlencoded':'application/json'))
    reject('DIS_HTTP_CONTENT_TYPE');
   const body=await boundedBody(req,maxBodyBytes);
   const args=mode==='form'?decodeForm(body):decodeChat(body);
   const outcome=await consumeDownloadSession(app,args);
   reply(res,200,summarize(outcome,args.initial));
  }catch(e){
   const code=e?.code??'DIS_HTTP_INTERNAL';
   const status=code==='DIS_HTTP_TOO_LARGE'?413:
    code==='DIS_HTTP_METHOD'?405:code==='DIS_HTTP_ROUTE'?404:
    code==='DIS_APP_NOT_READY'?503:
    ['DIS_HTTP_CONTENT_TYPE','DIS_HTTP_CREDENTIALS','DIS_HTTP_INVALID','DIS_ADAPTER_INVALID'].includes(code)?400:500;
   reply(res,status,{error:status===500?'DIS_HTTP_INTERNAL':code});
  }
 });
 let open=false;
 return Object.freeze({
  async listen(){
   if(open)reject('DIS_HTTP_ALREADY_LISTENING');
   await new Promise((resolve,rejectListen)=>{
    server.once('error',rejectListen);
    server.listen(0,'127.0.0.1',()=>{server.off('error',rejectListen);resolve()});
   });
   open=true;
   return 'http://127.0.0.1:'+server.address().port;
  },
  async close(){
   if(!open)return;
   open=false;
   await new Promise((resolve,rejectClose)=>server.close(err=>err?rejectClose(err):resolve()));
  }
 });
}
