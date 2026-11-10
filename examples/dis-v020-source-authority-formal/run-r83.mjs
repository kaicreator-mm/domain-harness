#!/usr/bin/env node
// Source-pinned portable CLI for R33 original-data → DIS B22 authority boundary.
// Run from any checkout: node examples/dis-v020-source-authority-formal/run-r83.mjs
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {validateOriginalEvidence,modelCheck,ORIGINAL,stateOf,futureRowSap,actualB22Observation} from './model-r83.mjs';
import {runR83Tests} from './test-r83.mjs';
const FILES={
 producer:'examples/dis-v020-native-sdk/fixtures/dke-r33-original-full-triage-receipt.json',
 nativeReceipt:'docs/standards/domain-intelligence/DIS-0.2.0/conformance/receipts/r82-b22-r33-source-native-ci.json',
 batch:'docs/standards/domain-intelligence/DIS-0.2.0/conformance/batches/B22/manifest.json',
 matrix:'docs/standards/domain-intelligence/DIS-0.2.0/conformance/matrix.json',
 nativeTest:'examples/dis-v020-native-sdk/b22-r33-go-triage-native.test.mjs',
 reader:'examples/dis-v020-native-sdk/dke-r33-go-reader.mjs',
 model:'examples/dis-v020-source-authority-formal/model-r83.mjs',
 tests:'examples/dis-v020-source-authority-formal/test-r83.mjs'
};
const EXPECTED_CODE_BLOBS={
 model:'bca64ed278d3e12ee4a0e65533c89901eb94157d',
 tests:'b634bd7a99ab013f84e5d9367a6fc18a9546b7ec'
};
const blob=s=>{
 const b=Buffer.from(s,'utf8'),h=createHash('sha1');
 h.update(Buffer.from('blob '+b.byteLength+'\0','utf8'));
 h.update(b);
 return h.digest('hex');
};
const raw={};
for(const [key,path] of Object.entries(FILES))
 raw[key]=await readFile(new URL('../../'+path,import.meta.url),'utf8');
const pins={producerBlob:blob(raw.producer),nativeTestBlob:blob(raw.nativeTest),
 readerBlob:blob(raw.reader)};
if(pins.producerBlob!==ORIGINAL.producerBlob||
 pins.nativeTestBlob!==ORIGINAL.nativeTestBlob||
 pins.readerBlob!==ORIGINAL.readerBlob||
 blob(raw.model)!==EXPECTED_CODE_BLOBS.model||
 blob(raw.tests)!==EXPECTED_CODE_BLOBS.tests)
 throw Error('R83_ORIGINAL_CODE_OR_RECEIPT_GIT_BLOB_DRIFT');
const parsed=['producer','nativeReceipt','batch','matrix'].map(k=>JSON.parse(raw[k]));
const result=runR83Tests(...parsed,pins,{
 validateOriginalEvidence,modelCheck,ORIGINAL,stateOf,futureRowSap,actualB22Observation
});
console.log(JSON.stringify({...result,sourcePins:{
 originalProducerBlob:pins.producerBlob,
 nativeTestBlob:pins.nativeTestBlob,readerBlob:pins.readerBlob,
 modelBlob:blob(raw.model),testBlob:blob(raw.tests)
},qualifiedOriginalNativeCI:'#2397/1-3 SUCCESS at '+ORIGINAL.nativeHead,
 originalR82EvidenceCommitCI:'SEPARATE_FROM_SOURCE_NATIVE_QUALIFICATION_NOT_INFERRED'},null,2));
