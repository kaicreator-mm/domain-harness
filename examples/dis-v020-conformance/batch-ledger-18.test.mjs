/** B07-01 / R51: independently replay all 18 stored B01-B06 round evidences. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {auditCheckedInBatches,validateRoundEvidence} from './batch-audit.mjs';

const root=new URL('../../',import.meta.url);
const base='docs/standards/domain-intelligence/DIS-0.2.0/conformance/';
const json=async path=>JSON.parse(await readFile(new URL(path,root),'utf8'));
const text=async path=>readFile(new URL(path,root),'utf8');
const clone=structuredClone;
const rejects=code=>e=>e?.code===code;
const scope=['B01','B02','B03','B04','B05','B06'];
async function b06(){
 const manifest=await json(base+'batches/B06/manifest.json');
 const entry=manifest.rounds[0],round=await json(base+'batches/B06/rounds/B06-01/round.json');
 return {manifest,round,receipt:await json(base+round.receipt),matrix:await json(base+'matrix.json'),
  sourceText:await text(entry.testPath),ciFile:await text('.woodpecker/dis-v020-integration.yaml')};
}

test('B07-01 R51 all B01-B06 eighteen immutable native Demo receipts are checked without inventing semantic acceptance',async()=>{
 const result=await auditCheckedInBatches(scope);
 assert.equal(result.auditedRounds,18);
 assert.equal(result.recordedCIValid,18);
 assert.equal(new Set(result.rows.map(x=>x.id)).size,18);
 assert.ok(result.rows.every(x=>x.independentSemanticOracle===false));
 assert.ok(result.rows.every(x=>x.ci==='STORED_CI_3_OF_3_SUCCESS'));
 assert.equal(result.rows.find(x=>x.id==='B06-01').ciPipeline,'2300');
 assert.equal(result.rows.find(x=>x.id==='B02-01').currentBlobMatchesHistorical,false);
});

test('B07-01 R51 actual B06 reordered Woodpecker job numbers still bind exactly three named contexts',async()=>{
 const x=await b06(),out=validateRoundEvidence(x);
 assert.equal(out.id,'B06-01');
 assert.equal(x.receipt.ci.find(c=>c.context.endsWith('verify-min-node')).url.endsWith('/3'),true);
 assert.equal(x.receipt.ci.find(c=>c.context.endsWith('/verify')).url.endsWith('/2'),true);
});

test('B07-01 R51 malicious cross-pipeline CI reuse and duplicate job numbers fail closed',async()=>{
 const x=await b06(),mixed=clone(x);
 mixed.receipt.ci[0].url='https://ci.kaicreator.com/repos/18/pipeline/9999/1';
 mixed.round.checks=clone(mixed.receipt.ci);mixed.manifest.rounds[0].checks=clone(mixed.receipt.ci);
 assert.throws(()=>validateRoundEvidence(mixed),rejects('BATCH_CI_SHA_UNRELATED'));
 const duplicate=clone(x);
 duplicate.receipt.ci[1].url=duplicate.receipt.ci[0].url;
 duplicate.round.checks=clone(duplicate.receipt.ci);
 duplicate.manifest.rounds[0].checks=clone(duplicate.receipt.ci);
 assert.throws(()=>validateRoundEvidence(duplicate),rejects('BATCH_CI_SHA_UNRELATED'));
});

test('B07-01 R51 forged test blob, stale exact TREE and missing matrix link never inherit earlier SUCCESS',async()=>{
 const x=await b06(),source=clone(x);source.round.testGitBlob='0'.repeat(40);
 assert.throws(()=>validateRoundEvidence(source),rejects('BATCH_ROUND_SOURCE_DRIFT'));
 const tree=clone(x);tree.receipt.source.tree='0'.repeat(40);
 assert.throws(()=>validateRoundEvidence(tree),rejects('BATCH_RECEIPT_SOURCE_MISMATCH'));
 const link=clone(x);link.matrix.receipts=link.matrix.receipts.filter(x=>x!==link.receipt.id);
 assert.throws(()=>validateRoundEvidence(link),rejects('BATCH_MATRIX_RECEIPT_UNLINKED'));
});

test('B07-01 R51 unexecuted original native test cannot qualify from a stored CI URL alone',async()=>{
 const x=await b06();x.ciFile=''; 
 assert.throws(()=>validateRoundEvidence(x),rejects('BATCH_SOURCE_OR_CI_MISSING'));
});
