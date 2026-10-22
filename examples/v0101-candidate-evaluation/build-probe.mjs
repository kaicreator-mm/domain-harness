/**
 * v0.10.1 C02 actual v10build selected-closure probe.
 * Uses Rich v2's K/S/B/C graph plus one optional selected Feature.
 * This is BUILD selection, NOT Host physical install or Effect execution.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { V10_TARGET_PROFILE, buildV10App, sha256Hex } from '@kaicreator/domain-harness-compiler/v10build';
import { definitionV2 } from '../v010-clean-consumer/apps/rich/app-definition.mjs';
import { candidateEvaluationFeature } from './feature-manifest.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const RICH = join(HERE, '../v010-clean-consumer/apps/rich');
const PAYLOAD = Object.freeze({
  kernel:'@kaicreator/domain-harness-compiler/v10payload/kernel-mechanism',
  sdk:'@kaicreator/domain-harness-compiler/v10payload/standard-sdk',
  router:'@kaicreator/domain-harness-compiler/v10payload/workflow-router',
  'sfeature-semantic-decision':'@kaicreator/domain-harness-compiler/v10payload/sfeature-semantic-decision',
  'sfeature-workflow-control':'@kaicreator/domain-harness-compiler/v10payload/sfeature-workflow-control',
  'sfeature-context-assembly':'@kaicreator/domain-harness-compiler/v10payload/sfeature-context-assembly',
  'sfeature-decision-evidence':'@kaicreator/domain-harness-compiler/v10payload/sfeature-decision-evidence',
});
function readPayload(name) {
  return readFileSync(fileURLToPath(import.meta.resolve(PAYLOAD[name])), 'utf8');
}
const payloads = {kernel:readPayload('kernel')};
const sdk = readPayload('sdk');
const routerBody = readPayload('router').replace(/^export /gm, '');
payloads.standard = [
  sdk,
  '// v0.10.1 pure selected WorkflowRouter bundle',
  'const __v0101router = (() => {',
  routerBody,
  'return { routeWorkflowIntent };',
  '})();',
  'export const routeWorkflowIntent = __v0101router.routeWorkflowIntent;',
].join('\n');
for (const name of ['sfeature-semantic-decision','sfeature-workflow-control',
  'sfeature-context-assembly','sfeature-decision-evidence']) payloads[name] = readPayload(name);

function input(entry) {
  const bytes = entry.role === 'kernel-primary' ? payloads.kernel
    : entry.role === 'standard-primary' ? payloads.standard
      : entry.payload !== undefined ? payloads[entry.payload]
        : readFileSync(entry === candidateEvaluationFeature
          ? join(HERE, entry.file) : join(RICH, 'modules', entry.file), 'utf8');
  const value = {
    packageId: entry.packageId, role: entry.role, abiVersion: entry.abiVersion,
    moduleSource: bytes, moduleSha256: sha256Hex(bytes), endpoint: entry.endpoint,
    dependencies: [], provides: [...entry.provides], requires: [],
  };
  for (const key of ['providerId','hookExport','featureExport','capabilityId',
    'externalEffect','externalImports']) if (entry[key] !== undefined) value[key] = entry[key];
  if (entry.handlers !== undefined) value.handlers = entry.handlers.map(x => ({...x}));
  return value;
}
const selected = [...definitionV2.modules, candidateEvaluationFeature].map(input);
const buildInput = {
  appId:'app:v0101-candidate-evaluation-probe',
  audience:definitionV2.audience,
  targetProfile:V10_TARGET_PROFILE,
  modules:selected,
  routes:definitionV2.routes.map(x => ({...x})),
  hardBudget:{...definitionV2.hardBudget},
  buildId:'v0101-candidate-evaluation-probe',
};
const built = buildV10App(buildInput);
assert(built.modules.some(x => x.packageId === candidateEvaluationFeature.packageId));
assert.equal(built.modules.filter(x => x.provides.includes('standard:candidate-evaluation/1')).length, 1);
assert.throws(() => buildV10App({
  ...buildInput,
  modules:[...selected, {...selected.at(-1),packageId:'sfeature-diagnostic-duplicate@v0101.0.0'}],
}), /duplicate|conflict|provider|feature/i, 'duplicate Feature must refuse at BUILD');
// Synthetic negative cases — only the actual v10 BUILD owner can refuse these.
const feature = selected.at(-1);
assert.deepEqual(feature.requires, [], 'standalone optional feature has zero BUILD dependencies');
assert.deepEqual(feature.externalImports, {node:[],npm:[],native:[]},
  'selected Feature has no declared external imports');
assert.throws(() => buildV10App({...buildInput,modules:[
  ...selected.slice(0,-1), {...feature,requires:['standard:missing/1']},
]}), (error) => typeof error?.code === 'string', 'missing synthetic required feature must refuse');
assert.throws(() => buildV10App({...buildInput,modules:[
  ...selected.slice(0,-1), {...feature,abiVersion:'dh.v10.standard-feature/99'},
]}), {code:'V10_ABI_UNSUPPORTED'});
assert.throws(() => buildV10App({...buildInput,modules:[
  ...selected.slice(0,-1), {...feature,moduleSha256:'0'.repeat(64)},
]}), {code:'V10_DIGEST_MISMATCH'});
// The source is deliberately changed and REHASHED; this probes the sealed
// import-policy owner, not the digest mismatch owner.
const prohibitedSource = "import { readFileSync } from 'node:fs';\n" + feature.moduleSource;
assert.throws(() => buildV10App({...buildInput,modules:[
  ...selected.slice(0,-1), {...feature,moduleSource:prohibitedSource,
    moduleSha256:sha256Hex(prohibitedSource)},
]}), {code:'V10_IMPORT_POLICY_DENIED'},
  'forbidden side-effect import must fail before module evaluation');
console.log(JSON.stringify({
  status:'BUILD_SELECTED_ONLY', subjectDigest:built.subjectDigest,
  selectedFeature:candidateEvaluationFeature.packageId, totalModules:built.modules.length,
  physicalInstall:'NOT_RUN',
}));
