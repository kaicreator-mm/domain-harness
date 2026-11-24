import { SQLiteDatabaseElement } from '@kaicreator/domain-harness';
import type { Asset, Result } from './archive.js';
import { FixityElement, policy } from './media.js';
import { copyFile, mkdir, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
export type Receipt = { original:string; derivative:string; revision:string; duplicate:boolean };
const stop=(status:'ASK'|'REJECT'|'UNKNOWN',code:string):Result<never>=>({status,reason:{code,message:code}});
export class CatalogElement {
  private readonly db:SQLiteDatabaseElement;
  private readonly fixity=new FixityElement();
  constructor(path:string,private readonly storage:string){this.db=new SQLiteDatabaseElement(path);this.db.transaction(tx=>tx.run('CREATE TABLE IF NOT EXISTS assets (tenant TEXT, hash TEXT, revision TEXT, derivative TEXT, PRIMARY KEY(tenant,hash))',[]));}
  /** Owner-selected trusted stage only. File publication and catalog commit are not distributed ACID. */
  async register(tenant:string,asset:Asset,approved:boolean):Promise<Result<Receipt>>{
    if(!approved)return stop('ASK','APPROVAL_REQUIRED');
    const old=this.db.select<{revision:string;derivative:string}>('SELECT revision,derivative FROM assets WHERE tenant=? AND hash=?',[tenant,asset.original],1)[0];
    if(old&&(old.revision!==asset.revision||old.derivative!==asset.derivative))return stop('REJECT','ASSET_CONFLICT');
    try{
      const folder=join(this.storage,tenant,asset.original);await mkdir(folder,{recursive:true});
      for(const [source,name,hash] of [[asset.originalPath,'original',asset.original],[asset.derivativePath,'access',asset.derivative]] as const){
        const dest=join(folder,name);
        if(!old){if(await this.fixity.digest(source,policy.maxBytes)!==hash)return stop('UNKNOWN','STAGE_CHANGED');
          try{await copyFile(source,dest,constants.COPYFILE_EXCL);}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}}
        if(!(await stat(dest)).isFile()||await this.fixity.digest(dest,policy.maxBytes)!==hash)return stop('UNKNOWN','STORAGE_CONFLICT');
      }
      return this.db.transaction(tx=>{
        const existing=tx.get<{revision:string;derivative:string}>('SELECT revision,derivative FROM assets WHERE tenant=? AND hash=?',[tenant,asset.original]);
        if(existing&&(existing.revision!==asset.revision||existing.derivative!==asset.derivative))return stop('REJECT','ASSET_CONFLICT');
        if(!existing)tx.run('INSERT INTO assets VALUES (?,?,?,?)',[tenant,asset.original,asset.revision,asset.derivative]);
        return {status:'COMPLETE',value:{original:asset.original,derivative:asset.derivative,revision:asset.revision,duplicate:!!existing}};
      });
    }catch{return stop('UNKNOWN','ARCHIVE_STORAGE_UNCERTAIN');}
  }
  count(tenant:string):number{return this.db.select<{n:number}>('SELECT COUNT(*) AS n FROM assets WHERE tenant=?',[tenant],1)[0]!.n;}
  close(){this.db.close();}
}
