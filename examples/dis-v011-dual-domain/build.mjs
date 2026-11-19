/**
 * D3 (#1532) — real canonical BUILD assembly for the two selected domains.
 *
 * For each domain (tally-engineering, downloads) this composes one Domain
 * App over the workspace's REAL trusted Kernel/Standard bytes and the
 * byte-locked pinned third-party Business/Capability snapshot bytes, then
 * seals it through the actual `buildV10App` (tooling/build dist, the same
 * canonical BUILD the workspace's own tests use). No invented parallel
 * runtime: the pinned source bytes ARE the selected business/capability
 * modules, and BUILD owns integrity (digest) and route (seal) rejection.
 *
 * The tally domain seals one additional capability: THIS example's own
 * read-only observation fixture (src/capability-tally-source-observation-fixture.mjs),
 * standing in for Tally's selected read-only C adapter. The downloads
 * domain seals the pinned acquisition stub exactly as declared
 * (externalEffect: true) — this demo NEVER authorizes its execution.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { V10_TARGET_PROFILE } from '@kaicreator/domain-harness-contracts';
import { buildV10App } from '../../tooling/build/dist/index.js';
import { gitBlobSha, PINNED, qualifyProjectConsumers } from './consumer.mjs';
import * as observationFixture from './src/capability-tally-observation-fixture.mjs';

const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const refuse = (code) => { const e = new Error(code); e.code = code; throw e; };

/** Trusted workspace payload bytes, pinned exactly like the 0.1.0 runtime consumer does. */
const trustedPins = {
  kernel: ['kernel/basic/kernel-mechanism-v1.mjs', 'e1ed59556f8b447b5f559302a893738eeae1d272e3a30ac4545fedfb1da8a3e7'],
  standardSdk: ['standard/basic/standard-sdk-v1.mjs', 'dec042cacee70a8762b693f02b80ce14844b52bdf12969ff2250c7013c67c8bf'],
  standardRouter: ['standard/basic/workflow-router.mjs', 'd9f9c33f08951aacebe1648fb44554ecacb70db6292f02367035d99ea1c112b5'],
};

const KERNEL_PACKAGE_ID = 'v08-kernel-mechanism@1.0.0';
const STANDARD_PACKAGE_ID = 'standard-sdk@v08.1.0.0';

async function trustedPayload() {
  const entries = await Promise.all(Object.entries(trustedPins).map(async ([key, [relative, pin]]) => {
    const bytes = await readFile(new URL('../../domain-packages/' + relative, import.meta.url), 'utf8');
    if (sha256(bytes) !== pin) refuse('TRUSTED_MODULE_BYTES_CHANGED:' + key);
    return [key, bytes];
  }));
  return Object.fromEntries(entries);
}

/** BUILD-style vendored bundle: SDK bytes + the pure Router in one module. */
function standardBundleSource(payload) {
  const routerBody = payload.standardRouter.replace(/^export /gm, '');
  return `${payload.standardSdk}
// D3 dual-domain demo: BUILD-style vendored bundle of the pure WorkflowRouter.
const __dhv10RouterBundle = (() => {
${routerBody}
return { routeWorkflowIntent };
})();
export const routeWorkflowIntent = __dhv10RouterBundle.routeWorkflowIntent;
`;
}

function coreModules(payload, bundle) {
  return [
    {
      packageId: KERNEL_PACKAGE_ID, role: 'kernel-primary', abiVersion: 'v08-kernel-abi/1',
      moduleSource: payload.kernel, moduleSha256: sha256(payload.kernel),
      endpoint: 'occurrence-runtime', dependencies: [], provides: ['kernel:occurrence-runtime/1'], requires: [],
    },
    {
      packageId: STANDARD_PACKAGE_ID, role: 'standard-primary', abiVersion: 'v08-standard-sdk-abi/1',
      moduleSource: bundle, moduleSha256: sha256(bundle),
      endpoint: 'rule-interpreter', dependencies: [], provides: ['standard:interpret/1', 'standard:route/1'], requires: [],
    },
  ];
}

async function pinnedSource(file) {
  const pin = PINNED[file];
  if (!pin) refuse('DIS_SOURCE_NOT_PINNED');
  const bytes = await readFile(new URL('./snapshots/' + file, import.meta.url));
  if (gitBlobSha(bytes) !== pin.gitBlob) refuse('DIS_SOURCE_BYTES_DRIFT');
  return bytes.toString('utf8');
}

/**
 * Tally-engineering Domain App: pinned business bytes + this example's
 * read-only observation capability + one sealed route. The selected rule
 * Function `tally.tasks.assessTaskEvidence` executes inside the real
 * Kernel effect chain of `inspectTaskReadiness`.
 */
export async function buildTallyDomainApp({ override = {} } = {}) {
  const qualified = await qualifyProjectConsumers(
    JSON.parse(await readFile(new URL('./manifest.json', import.meta.url), 'utf8')), override);
  const [payload, tally, observationSource] = await Promise.all([
    trustedPayload(), pinnedSource('tally/business.mjs'),
    readFile(new URL('./src/capability-tally-observation-fixture.mjs', import.meta.url), 'utf8'),
  ]);
  const bundle = standardBundleSource(payload);
  // The declared identity comes from the blob-verified pinned module itself;
  // activation later re-checks loaded MODULE_ID === packageId.
  const tallyPackageId = qualified.modules.get('tally/business.mjs').MODULE_ID;
  if (tallyPackageId !== businessModuleId(tally)) refuse('DIS_BUSINESS_SOURCE_IDENTITY');
  const tallyModule = {
    packageId: tallyPackageId, role: 'business', abiVersion: 'v08-business-abi/1',
    moduleSource: tally, moduleSha256: sha256(tally), endpoint: 'business-policy',
    dependencies: [], requires: [],
    provides: ['business:policy/1', 'intent:inspectTaskReadiness'],
  };
  const observationCapability = {
    packageId: observationFixture.MODULE_ID, role: 'capability', abiVersion: 'v08-capability-abi/1',
    moduleSource: observationSource, moduleSha256: sha256(observationSource),
    endpoint: 'capability-endpoint', dependencies: [], requires: [],
    provides: ['capability:tally-source-observation/1'],
    capabilityId: observationFixture.CAPABILITY_ID,
    handlers: [{ operationId: 'tally.observeReadiness', handler: 'observeReadiness' }],
  };
  const selection = {
    appId: 'app:dis-v011-dual-domain:tally-engineering',
    audience: 'aud:dis-v011-dual-domain',
    targetProfile: V10_TARGET_PROFILE,
    buildId: 'dis-v011-dual-domain-tally',
    modules: [...coreModules(payload, bundle), tallyModule, observationCapability],
    routes: [{
      intentId: 'inspectTaskReadiness', operationId: 'tally.observeReadiness',
      capabilityId: observationFixture.CAPABILITY_ID, handlerId: 'observeReadiness',
    }],
    hardBudget: { maxStepsPerTurn: 8, maxWorkUnitsPerTurn: 64 },
  };
  if (override.modules) override.modules(selection.modules);
  if (override.routes) override.routes(selection.routes);
  const built = buildV10App(selection);
  return {
    built, qualified,
    origins: Object.freeze([Object.freeze({
      packageId: tallyModule.packageId, file: 'tally/business.mjs', gitBlob: PINNED['tally/business.mjs'].gitBlob,
    })]),
  };
}

/**
 * Downloads Domain App: pinned download business bytes + the pinned
 * acquisition stub sealed exactly as declared (externalEffect: true) with
 * its one K→C route. Nothing in this demo authorizes the acquire dispatch.
 */
export async function buildDownloadDomainApp({ override = {} } = {}) {
  const qualified = await qualifyProjectConsumers(
    JSON.parse(await readFile(new URL('./manifest.json', import.meta.url), 'utf8')), override);
  const [payload, download, acquisition] = await Promise.all([
    trustedPayload(),
    pinnedSource('xdownload/business-download.mjs'),
    pinnedSource('xdownload/capability-acquisition-stub.mjs'),
  ]);
  const bundle = standardBundleSource(payload);
  const downloadPackageId = qualified.modules.get('xdownload/business-download.mjs').MODULE_ID;
  const acquisitionPackageId = qualified.modules.get('xdownload/capability-acquisition-stub.mjs').MODULE_ID;
  if (downloadPackageId !== businessModuleId(download)) refuse('DIS_BUSINESS_SOURCE_IDENTITY');
  if (acquisitionPackageId !== capabilityModuleId(acquisition)) refuse('DIS_CAPABILITY_SOURCE_IDENTITY');
  const downloadModule = {
    packageId: downloadPackageId, role: 'business', abiVersion: 'v08-business-abi/1',
    moduleSource: download, moduleSha256: sha256(download), endpoint: 'business-policy',
    dependencies: [], requires: [],
    provides: ['business:policy/1', 'intent:confirmDownload'],
  };
  const acquisitionModule = {
    packageId: acquisitionPackageId, role: 'capability', abiVersion: 'v08-capability-abi/1',
    moduleSource: acquisition, moduleSha256: sha256(acquisition),
    endpoint: 'capability-endpoint', dependencies: [], requires: [],
    provides: ['capability:acquisition/1'],
    capabilityId: 'acquisition',
    handlers: [{ operationId: 'acquisition.acquire', handler: 'acquire' }],
    externalEffect: true,
  };
  const selection = {
    appId: 'app:dis-v011-dual-domain:downloads',
    audience: 'aud:dis-v011-dual-domain',
    targetProfile: V10_TARGET_PROFILE,
    buildId: 'dis-v011-dual-domain-downloads',
    modules: [...coreModules(payload, bundle), downloadModule, acquisitionModule],
    routes: [{
      intentId: 'confirmDownload', operationId: 'acquisition.acquire',
      capabilityId: 'acquisition', handlerId: 'acquire',
    }],
    hardBudget: { maxStepsPerTurn: 8, maxWorkUnitsPerTurn: 64 },
  };
  if (override.modules) override.modules(selection.modules);
  if (override.routes) override.routes(selection.routes);
  const built = buildV10App(selection);
  return {
    built, qualified,
    origins: Object.freeze([
      Object.freeze({ packageId: downloadModule.packageId, file: 'xdownload/business-download.mjs', gitBlob: PINNED['xdownload/business-download.mjs'].gitBlob }),
      Object.freeze({ packageId: acquisitionModule.packageId, file: 'xdownload/capability-acquisition-stub.mjs', gitBlob: PINNED['xdownload/capability-acquisition-stub.mjs'].gitBlob }),
    ]),
  };
}

function businessModuleId(source) {
  const match = source.match(/export const MODULE_ID = '([^']+)';/);
  if (!match) refuse('DIS_BUSINESS_SOURCE_IDENTITY');
  return match[1];
}

function capabilityModuleId(source) {
  return businessModuleId(source);
}
