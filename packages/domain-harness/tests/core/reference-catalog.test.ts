import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const base = new URL('../../../../examples/native-domain-app/combined/',import.meta.url);
for (const scenario of ['approve','decline','stale','revoked']) {
  test('reference catalog actual app '+scenario,()=>{
    const entry=fileURLToPath(new URL('catalog-reasoning-verify.ts',base));
    const p=spawnSync(process.execPath,['--import','tsx',entry,'native',scenario],{encoding:'utf8',timeout:60000,maxBuffer:1024*1024,windowsHide:true});
    assert.equal(p.status,0,p.stderr);
    assert.match(p.stdout,/PASS_CATALOG_/u);
  });
}
test('reference catalog actual CLI input, foreign correlation, decline and EOF',()=>{
  const entry=fileURLToPath(new URL('catalog-cli-verify.ts',base));
  const p=spawnSync(process.execPath,['--import','tsx',entry],{encoding:'utf8',timeout:120000,maxBuffer:1024*1024,windowsHide:true});
  assert.equal(p.status,0,p.stderr);
  assert.match(p.stdout,/CATALOG_REAL_CLI_PASS 4/u);
});

for (const [file,expected] of [['catalog-revision-verify.ts','PASS_CATALOG_MISSING_AND_REVISION'],['catalog-adversarial-verify.ts','CATALOG_ADVERSARIAL_PASS 6']] as const) {
  test('reference catalog '+file,()=>{
    const entry=fileURLToPath(new URL(file,base));
    const p=spawnSync(process.execPath,['--import','tsx',entry],{encoding:'utf8',timeout:120000,maxBuffer:1024*1024,windowsHide:true});
    assert.equal(p.status,0,p.stderr);
    assert.ok(p.stdout.includes(expected),p.stdout);
  });
}

for(const mode of ['fixed','skip']){
  test('reference catalog actual '+mode+' workflow',()=>{
    const entry=fileURLToPath(new URL('catalog-reasoning-verify.ts',base));
    const p=spawnSync(process.execPath,['--import','tsx',entry,'native','approve',mode],{encoding:'utf8',timeout:60000,maxBuffer:1024*1024,windowsHide:true});
    assert.equal(p.status,0,p.stderr);
    assert.match(p.stdout,/PASS_CATALOG_REASONING_SLICE/u);
  });
}

test('reference catalog real Host lost ACK, original-only recovery and app-lifetime fence',()=>{
  const entry=fileURLToPath(new URL('catalog-recovery-verify.ts',base));
  const p=spawnSync(process.execPath,['--import','tsx',entry],{encoding:'utf8',timeout:120000,maxBuffer:1024*1024,windowsHide:true});
  assert.equal(p.status,0,p.stderr);
  assert.match(p.stdout,/PASS_CATALOG_ORIGINAL_RECOVERY/u);
});
