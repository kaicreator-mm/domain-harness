import { SQLiteDatabaseElement } from '@kaicreator/domain-harness';
import type { Asset, Result } from './archive.js';
import { FixityElement, type MediaInfo } from './media.js';
import { copyFile, mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
export type Receipt = { tenant:string; original:string; derivative:string; revision:string; source:MediaInfo; output:MediaInfo; duplicate:boolean };
type Stored={revision:string;derivative:string;metadata:string};
const stop=(status:'ASK'|'REJECT'|'UNKNOWN',code:string):Result<never>=>({status,reason:{code,message:code}});
const valid=(tenant:string,hash:string)=>/^[a-zA-Z0-9_-]{1,64}$/.test(tenant)&&/^[a-f0-9]{64}$/.test(hash);
export class CatalogElement {
  private readonly db:SQLiteDatabaseElement;
  private readonly fixity=new FixityElement();
  // Independent storage admission ceiling, not the current transformation policy.
  private readonly maxStoredBytes=8*1024*1024;
  constructor(path:string,private readonly storage:string){this.db=new SQLiteDatabaseElement(path);this.db.transaction(tx=>tx.run('CREATE TABLE IF NOT EXISTS assets (tenant TEXT, hash TEXT, revision TEXT, derivative TEXT, metadata TEXT, PRIMARY KEY(tenant,hash))',[]));}
  private stored(tenant:string,hash:string){return this.db.select<Stored>('SELECT revision,derivative,metadata FROM assets WHERE tenant=? AND hash=?',[tenant,hash],1)[0];}
  private async verifyFiles(folder:string,original:string,derivative:string){return await this.fixity.digest(join(folder,'original'),this.maxStoredBytes)===original&&await this.fixity.digest(join(folder,'access'),this.maxStoredBytes)===derivative;}
  async readback(tenant:string,hash:string):Promise<Result<Receipt>>{
    if(!valid(tenant,hash))return stop('REJECT','ASSET_ID_INVALID');
    try{const row=this.stored(tenant,hash);if(!row)return stop('UNKNOWN','ASSET_NOT_OBSERVED');
      if(!await this.verifyFiles(join(this.storage,tenant,hash),hash,row.derivative))return stop('UNKNOWN','STORAGE_CONFLICT');
      const meta=JSON.parse(row.metadata) as {source:MediaInfo;output:MediaInfo};
      return {status:'COMPLETE',value:{tenant,original:hash,derivative:row.derivative,revision:row.revision,...meta,duplicate:true}};
    }catch{return stop('UNKNOWN','ARCHIVE_READBACK_UNCERTAIN');}
  }
  /** Both files verified in owned staging before publication; a published pair without DB row is not visible and is recoverable by matching re-submission. */
  async register(tenant:string,asset:Asset,approved:boolean):Promise<Result<Receipt>>{
    if(!approved)return stop('ASK','APPROVAL_REQUIRED');
    if(!valid(tenant,asset.original)||!valid(tenant,asset.derivative))return stop('REJECT','ASSET_ID_INVALID');
    let pending:string|undefined;
    try{
      const old=this.stored(tenant,asset.original);const metadata=JSON.stringify({source:asset.source,output:asset.output});
      if(old){if(old.revision!==asset.revision||old.derivative!==asset.derivative||old.metadata!==metadata)return stop('REJECT','ASSET_CONFLICT');return this.readback(tenant,asset.original);}
      const parent=join(this.storage,tenant),folder=join(parent,asset.original);await mkdir(parent,{recursive:true});pending=await mkdtemp(join(parent,'.pending-'));
      await copyFile(asset.originalPath,join(pending,'original'));await copyFile(asset.derivativePath,join(pending,'access'));
      if(!await this.verifyFiles(pending,asset.original,asset.derivative))return stop('UNKNOWN','STAGE_CHANGED');
      try{await rename(pending,folder);pending=undefined;}catch(e){if(!['EEXIST','ENOTEMPTY','EPERM'].includes((e as NodeJS.ErrnoException).code??''))throw e;}
      if(!await this.verifyFiles(folder,asset.original,asset.derivative))return stop('UNKNOWN','STORAGE_CONFLICT');
      return this.db.transaction(tx=>{
        const existing=tx.get<Stored>('SELECT revision,derivative,metadata FROM assets WHERE tenant=? AND hash=?',[tenant,asset.original]);
        if(existing&&(existing.revision!==asset.revision||existing.derivative!==asset.derivative||existing.metadata!==metadata))return stop('REJECT','ASSET_CONFLICT');
        if(!existing)tx.run('INSERT INTO assets VALUES (?,?,?,?,?)',[tenant,asset.original,asset.revision,asset.derivative,metadata]);
        return {status:'COMPLETE',value:{tenant,original:asset.original,derivative:asset.derivative,revision:asset.revision,source:asset.source,output:asset.output,duplicate:!!existing}};
      });
    }catch{return stop('UNKNOWN','ARCHIVE_STORAGE_UNCERTAIN');}finally{if(pending)await rm(pending,{recursive:true,force:true});}
  }
  count(tenant:string):number{return this.db.select<{n:number}>('SELECT COUNT(*) AS n FROM assets WHERE tenant=?',[tenant],1)[0]!.n;}
  close(){this.db.close();}
}
