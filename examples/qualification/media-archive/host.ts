import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { CatalogElement } from './catalog.js';
import type { Asset } from './archive.js';
/** Trusted Owner manifest is local to this separate process; clients cannot choose paths or grant themselves approval. */
const [db,storage,manifest]=process.argv.slice(2);if(!db||!storage||!manifest)throw Error('HOST_ARGS');
const catalog=new CatalogElement(db,storage);
const server=createServer(async(req,res)=>{
  const respond=(value:unknown)=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(value));};
  try{
    const owner=JSON.parse(await readFile(manifest,'utf8')) as {token:string;approved:boolean;asset:Asset;tenant:string};
    if(req.method!=='POST'||req.url!=='/register'||req.headers.authorization!==`Bearer ${owner.token}`){respond({status:'REJECT',reason:{code:'HOST_DENIED',message:'HOST_DENIED'}});return;}
    let size=0;const chunks:Buffer[]=[];for await(const chunk of req){const b=Buffer.from(chunk);size+=b.length;if(size>4096){req.destroy();return;}chunks.push(b);}
    const command=JSON.parse(Buffer.concat(chunks).toString('utf8')) as {tenant:string;hash:string;revision:string;derivative:string};
    if(command.tenant!==owner.tenant||command.hash!==owner.asset.original||command.revision!==owner.asset.revision||command.derivative!==owner.asset.derivative){respond({status:'REJECT',reason:{code:'HOST_SCOPE',message:'HOST_SCOPE'}});return;}
    respond(await catalog.register(owner.tenant,owner.asset,owner.approved));
  }catch{respond({status:'UNKNOWN',reason:{code:'HOST_UNKNOWN',message:'HOST_UNKNOWN'}});}
});
server.listen(0,'127.0.0.1',()=>{const a=server.address();if(!a||typeof a==='string')throw Error('HOST_ADDRESS');console.log(JSON.stringify({port:a.port,pid:process.pid}));});
process.once('SIGTERM',()=>{server.close(()=>catalog.close());server.closeAllConnections();});
