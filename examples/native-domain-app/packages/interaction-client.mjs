import { createInterface } from 'node:readline';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createOrderInteraction } from './interactive-order.mjs';

function envelope(prompt, answer) {
  // 只有无关联的裸终端输入才绑定当前提示；显式关联（包括不完整关联）由协议原样验证。
  if(!answer||typeof answer!=='object'||Array.isArray(answer))return answer;
  if(['intentId','revision','decisionKey'].some(key=>Object.hasOwn(answer,key)))return answer;
  return {...answer,intentId:prompt.intentId,revision:prompt.revision,decisionKey:prompt.decisionKey};
}

/** 终端只显示语义数据并转发明确输入；不会把推荐值直接提交。 */
export async function runOrderCli(input, stdin, stdout) {
  const lines=createInterface({input:stdin,crlfDelay:Infinity});
  const iterator=lines[Symbol.asyncIterator]();
  let pending, wake;
  const active=createOrderInteraction(input,p=>{pending=p;wake?.();});
  let outcome;
  const result=active.run().then(value=>{outcome=value;wake?.();return value;});
  try {
    while(!outcome) {
      if(!pending){await new Promise(resolve=>{wake=resolve;});wake=undefined;continue;}
      const p=pending;pending=undefined;
      stdout.write(JSON.stringify({prompt:p})+'\n');
      while(!outcome&&active.interaction.current()===p){
        const line=await iterator.next();
        if(line.done){active.interaction.cancel();break;}
        let answer;
        try{answer=JSON.parse(line.value);}catch{answer={action:'text',text:line.value};}
        const reply=active.interaction.submit(envelope(p,answer));
        stdout.write(JSON.stringify({response:reply})+'\n');
        if(reply.accepted)break;
      }
    }
    stdout.write(JSON.stringify({outcome:await result})+'\n');
    return outcome;
  }finally{active.interaction.cancel();lines.close();await result;}
}

const page=`<!doctype html><html lang="en"><meta charset="utf-8"><title>Reference order evaluation</title>
<h1>Order policy evaluation</h1><p id="status" role="status"></p><main id="content"></main>
<script>
const content=document.getElementById('content'), status=document.getElementById('status');
let shown, busy=false;
function node(tag,text){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;}
async function send(p,answer){
  if(busy)return;busy=true;
  try{
    const response=await fetch('response',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...answer,intentId:p.intentId,revision:p.revision,decisionKey:p.decisionKey})});
    const result=await response.json();status.textContent=result.accepted?'Accepted':result.code;
  }finally{busy=false;await refresh();}
}
async function refresh(){
  const response=await fetch('state',{cache:'no-store'});const state=await response.json();
  if(state.outcome){content.replaceChildren(node('pre',JSON.stringify(state.outcome)));content.firstChild.id='outcome';return;}
  const p=state.prompt;if(!p||shown===p.revision)return;shown=p.revision;
  content.replaceChildren(node('h2',p.title));if(p.description)content.append(node('p',p.description));
  const form=node('form');content.append(form);const controls=[];
  for(const f of p.fields){
    const label=node('label',f.label+' ');form.append(label);
    let el;
    if(f.kind==='choice'||f.kind==='multi-choice'){
      el=node('select');el.multiple=f.kind==='multi-choice';
      if(!el.multiple){const empty=node('option','Choose…');empty.value='';el.append(empty);}
      for(const o of f.options){const option=node('option',o.label+(o.recommended?' (recommended)':'')+(o.reason?' — '+o.reason:''));option.value=o.id;el.append(option);}
      if(f.comparison?.length){const table=node('table'),head=node('tr');head.append(node('th','Comparison'));for(const o of f.options)head.append(node('th',o.label));table.append(head);
        for(const row of f.comparison){const tr=node('tr');tr.append(node('th',row.label));for(const o of f.options)tr.append(node('td',row.cells[o.id]??''));table.append(tr);}form.append(table);}
      if(f.completeness==='incomplete')form.append(node('p','Candidate list incomplete'));
    }else if(f.kind==='text'){el=node('textarea');}
    else{el=node('input');el.type=f.kind==='number'?'number':f.kind==='boolean'?'checkbox':'text';
      if(f.kind==='file')form.append(node('p','Enter an existing file reference, not an upload.'));
    }
    el.name=f.id;el.required=!!f.required&&f.kind!=='boolean';label.append(el);
    if(f.min!==undefined)el.min=String(f.min);if(f.max!==undefined)el.max=String(f.max);
    if(f.minLength!==undefined)el.minLength=f.minLength;if(f.maxLength!==undefined)el.maxLength=f.maxLength;
    if(f.prefill)form.append(node('p','Suggested: '+JSON.stringify(f.prefill.value)+' (source: '+f.prefill.source+')'));
    controls.push([f,el]);
  }
  if(p.actions.includes('submit')){
    const button=node('button','Submit');button.type='submit';form.append(button);
    form.onsubmit=e=>{e.preventDefault();const values={};for(const [f,el] of controls){
      if(f.kind==='multi-choice')values[f.id]=Array.from(el.selectedOptions,o=>o.value);
      else if(f.kind==='boolean')values[f.id]=el.checked;
      else if(el.value!=='')values[f.id]=f.kind==='number'?Number(el.value):el.value;
    }void send(p,{action:'submit',values});};
  }
  const text=node('input');text.id='free-text';text.placeholder='Revise or describe goal';content.append(text);
  for(const action of p.actions.filter(a=>a!=='submit')){
    const button=node('button',action);button.type='button';button.onclick=()=>{void send(p,action==='text'||action==='revise'?{action,text:text.value}:{action});};content.append(button);
  }
}
setInterval(()=>{if(!busy)void refresh();},250);void refresh();
</script></html>`;

/** 单会话 loopback 适配示例：随机路径隔离请求，只在本机监听，不是生产 Web 服务。 */
export async function serveOrderInteraction(input) {
  const active=createOrderInteraction(input);
  let outcome;
  const result=active.run().then(value=>{outcome=value;return value;});
  const prefix='/'+randomUUID()+'/';
  const server=createServer((req,res)=>{
    void (async()=>{
      const path=req.url;
      const json=(status,body)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(body));};
      if(req.method==='GET'&&path===prefix){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer'});res.end(page);return;}
      if(req.method==='GET'&&path===prefix+'state'){json(200,outcome?{outcome}:{prompt:active.interaction.current()});return;}
      if(req.method==='POST'&&path===prefix+'response'){
        const origin='http://127.0.0.1:'+server.address().port;
        if(req.headers.origin!==origin||req.headers['content-type']!=='application/json'){json(403,{accepted:false,code:'REQUEST_ORIGIN'});return;}
        let size=0;const chunks=[];
        for await(const chunk of req){size+=chunk.length;if(size>65536){json(413,{accepted:false,code:'REQUEST_LIMIT'});return;}chunks.push(chunk);}
        let response;try{response=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{json(400,{accepted:false,code:'INVALID_RESPONSE'});return;}
        json(200,active.interaction.submit(response));return;
      }
      json(404,{code:'NOT_FOUND'});
    })().catch(()=>{if(!res.headersSent)res.writeHead(500);res.end();});
  });
  try{
    server.listen(0,'127.0.0.1');await once(server,'listening');
    return {url:'http://127.0.0.1:'+server.address().port+prefix,result,
      async close(){active.interaction.cancel();await result;const closed=once(server,'close');server.close();server.closeAllConnections();await closed;}};
  }catch(error){active.interaction.cancel();await result;throw error;}
}
