import assert from 'node:assert/strict';
import {SQLiteDatabaseElement} from '@kaicreator/domain-harness';
const db=new SQLiteDatabaseElement(':memory:');
try{
 db.transaction(tx=>{tx.run('CREATE TABLE t (id TEXT PRIMARY KEY, version INTEGER, value INTEGER)',[]);tx.run('INSERT INTO t VALUES (?,?,?)',['sample',1,8])});
 const update=(value:number)=>db.transaction(tx=>tx.run('UPDATE t SET value=?,version=2 WHERE id=? AND version=1',[value,'sample']));
 assert.equal(update(14).changes,1);assert.equal(update(22).changes,0);
 assert.equal(db.select<{value:number}>('SELECT value FROM t',[],1)[0]?.value,14);
}finally{db.close()}
