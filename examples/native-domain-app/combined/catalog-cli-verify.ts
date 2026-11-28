import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ts = import.meta.url.endsWith('.ts');
const entry = fileURLToPath(new URL(ts ? './catalog-cli.ts' : './catalog-cli.js', import.meta.url));
const args = [...(ts?['--import','tsx']:[]),entry,'native','9780131103627','1','4500'];
const quantity = '{"action":"submit","values":{"quantity":4}}';
const approve = '{"action":"submit","values":{"approve":"yes"}}';
const decline = '{"action":"submit","values":{"approve":"no"}}';
const stale = '{"intentId":"foreign","revision":1,"decisionKey":"quantity","action":"submit","values":{"quantity":3}}';
function invoke(input: string) {
  const p = spawnSync(process.execPath,args,{input,encoding:'utf8',timeout:30000,maxBuffer:1024*1024,windowsHide:true});
  if (p.error || p.status !== 0) throw Error('CATALOG_CLI_PROCESS_FAILED');
  return p.stdout.trim().split(/\r?\n/u).map(line=>JSON.parse(line));
}
const positive = invoke([stale,quantity,approve].join('\n')+'\n');
const first = positive.at(-1);
assert.equal(first.outcome.status,'COMPLETE');
assert.equal(first.outcome.value.initial.totalCents,1000);
assert.equal(first.outcome.value.final.totalCents,4000);
assert.equal(first.outcome.value.receipt.remaining,4);
assert.deepEqual(first.stock,{version:1,stock:4,effects:1});
assert.equal(first.oneRoot,true);
assert.equal(first.modelAttempts,0);
assert.deepEqual(positive.filter(v=>v.response).map(v=>v.response.accepted),[false,true,true]);
assert.equal(positive.find(v=>v.response?.accepted===false).response.code,'WRONG_INTENT');
const negative=invoke([quantity,decline].join('\n')+'\n').at(-1);
assert.equal(negative.outcome.status,'REJECT');
assert.deepEqual(negative.stock,{version:0,stock:8,effects:0});
const eof=invoke(quantity+'\n').at(-1);
assert.equal(eof.outcome.status,'REJECT');
assert.deepEqual(eof.stock,{version:0,stock:8,effects:0});
const stock=spawnSync(process.execPath,[...(ts?['--import','tsx']:[]),entry,'stock','9780131103627'],{encoding:'utf8',timeout:30000,maxBuffer:1024*1024,windowsHide:true});
assert.equal(stock.status,0,stock.stderr);
assert.deepEqual(JSON.parse(stock.stdout),{outcome:{status:'COMPLETE',value:{isbn:'9780131103627',resource:'book-b',stock:8,version:0}},modelAttempts:0});
console.log('CATALOG_REAL_CLI_PASS 4');
