/**
 * R60 W05: real npm Registry protocol + a single explicitly installed public SDK.
 * The registry is in-process, scoped to this test, and never publishes to a shared
 * external registry. Existing local upstream supplies only reviewed xstate/yaml bytes.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { cp, mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const upstream = process.env.DH_T05_NPM_REGISTRY;
assert.ok(upstream && /^https?:\/\//u.test(upstream),
  'R60 single-SDK Registry E2E requires the configured, bounded trusted npm upstream');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const temporary = await mkdtemp(join(tmpdir(), 'dh-r60-one-sdk-registry-'));
const evidence = { schemaVersion: 'dh.r60.registry/1', node: process.version,
  sdkDirectDependencies: 1, workflowTransitiveSRI: false, boot: false, tamperRejected: false,
  registryWorkflowSelected: 0, registryWorkflowBoot: false, registryDataReads: 0,
  preinstallTamperedSRIRejected: false };
let server;
async function runNpm(cwd, args, env) {
  const result = await new Promise((settle, reject) => {
    const child = spawn(npm, args, {
      cwd, env: { ...process.env, npm_config_ignore_scripts: 'true', ...env },
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (buf) => { stdout += buf.toString(); });
    child.stderr.on('data', (buf) => { stderr += buf.toString(); });
    child.on('error', reject);
    child.on('close', (code) => settle({ code, stdout, stderr }));
  });
  if (result.code !== 0) {
    throw new Error(`R60 npm ${args[0]} failed: ${result.stderr.slice(-6000)} ${result.stdout.slice(-3000)}`);
  }
  return result.stdout;
}
async function runNode(cwd, args, env = {}) {
  return await new Promise((settle, reject) => {
    const child = spawn(process.execPath, args, {
      cwd, env: { ...process.env, ...env }, windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (buf) => { stdout += buf.toString(); });
    child.stderr.on('data', (buf) => { stderr += buf.toString(); });
    child.on('error', reject);
    child.on('close', (code) => settle({ code, stdout, stderr }));
  });
}
async function ensureParent(path) { await mkdir(dirname(path), {recursive:true}); }
try {
  const packed = new Map();
  for (const folder of ['contracts', 'microkernel', 'domain-harness']) {
    const dir = join(repo, 'packages', folder);
    const details = JSON.parse(await runNpm(dir, [
      'pack', '--json', '--ignore-scripts', '--pack-destination', temporary,
    ]))[0];
    const manifest = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
    const bytes = await readFile(join(temporary, details.filename));
    packed.set(manifest.name, {
      manifest, bytes, filename: details.filename,
      integrity: 'sha512-' + createHash('sha512').update(bytes).digest('base64'),
    });
  }
  const serve = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url ?? '/', 'http://127.0.0.1').pathname);
      const name = path.slice(1);
      const pkg = packed.get(name);
      if (pkg) {
        const body = JSON.stringify({
          name, 'dist-tags': { latest: pkg.manifest.version },
          versions: { [pkg.manifest.version]: {
            ...pkg.manifest,
            dist: { integrity: pkg.integrity,
              tarball: `http://127.0.0.1:${server.address().port}/${encodeURIComponent(name)}/-/${pkg.filename}` },
          } },
        });
        res.writeHead(200, {'content-type':'application/vnd.npm.install-v1+json'});
        res.end(body);
        return;
      }
      for (const [packageName, value] of packed.entries()) {
        const tarPath = '/' + packageName + '/-/' + value.filename;
        if (path === tarPath) {
          res.writeHead(200, { 'content-type':'application/octet-stream', 'content-length':value.bytes.byteLength });
          res.end(value.bytes);
          return;
        }
      }
      // Do not turn this into a general-purpose mirror. Only two pinned
      // third-party runtime package names can pass to the preconfigured local registry.
      const first = name.split('/')[0];
      if (!['xstate','yaml'].includes(first)) {
        res.writeHead(404); res.end('R60 unselected npm name'); return;
      }
      const from = new URL(req.url, upstream);
      const remote = await globalThis.fetch(from, { signal: globalThis.AbortSignal.timeout(30_000) });
      res.writeHead(remote.status, { 'content-type': remote.headers.get('content-type') ?? 'application/octet-stream' });
      res.end(Buffer.from(await remote.arrayBuffer()));
    } catch (error) {
      res.writeHead(502); res.end(String(error));
    }
  });
  server = serve;
  await new Promise((ok,fail) => server.once('error',fail).listen(0,'127.0.0.1',ok));
  const registry = `http://127.0.0.1:${server.address().port}/`;
  const env = { npm_config_registry: registry, npm_config_cache: join(temporary,'npm-cache') };
  const consumer = join(temporary, 'consumer');
  await mkdir(consumer, {recursive:true});
  await writeFile(join(consumer,'package.json'), JSON.stringify({
    private:true, name:'dh-r60-single-sdk-consumer', version:'1.0.0', type:'module',
    dependencies: { '@kaicreator/domain-harness':'0.11.0' },
  }));
  await runNpm(consumer, ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], env);
  const consumerLock = JSON.parse(await readFile(join(consumer,'package-lock.json'),'utf8'));
  assert.deepEqual(consumerLock.packages[''].dependencies,
    { '@kaicreator/domain-harness':'0.11.0' });
  assert.ok(consumerLock.packages['node_modules/@kaicreator/domain-harness-contracts']);
  assert.ok(consumerLock.packages['node_modules/@kaicreator/domain-harness-microkernel']);
  for (const name of ['@kaicreator/domain-harness-build', 'typescript', 'ajv']) {
    assert.equal(consumerLock.packages['node_modules/' + name], undefined);
  }
  for (const name of ['xstate','yaml']) {
    const pinned = consumerLock.packages['node_modules/' + name];
    assert.ok(pinned && pinned.integrity.startsWith('sha512-'),
      `transitive ${name} must be exact and content-locked`);
  }
  evidence.workflowTransitiveSRI = true;
  await runNpm(consumer, ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], env);
  const smoke = await runNode(consumer, ['--input-type=module', '--eval', `
import assert from 'node:assert/strict';
import {boot} from '@kaicreator/domain-harness/runtime';
import {buildApp} from '@kaicreator/domain-harness/composition';
assert.equal(typeof boot,'function');assert.equal(typeof buildApp,'function');
console.log('DH_R60_SDK_ONLY_REGISTRY_IMPORTS_OK');
`]);
  assert.equal(smoke.code, 0, smoke.stderr);
  const sdk = await import(pathToFileURL(join(consumer, 'node_modules/@kaicreator/domain-harness/dist/composition.js')).href);
  assert.equal(typeof sdk.buildApp,'function');
  // Compose an actual on-disk K/S/B Domain App through the publicly installed SDK.
  const fixtures = join(repo,'examples/selected-packages');
  const ids=['r41-kdp','r41-sdk-base','r41-business'];
  const packages = [];
  for(const id of ids)packages.push(JSON.parse(await readFile(join(fixtures,'packages',id,'manifest.json'),'utf8')));
  const descriptor = JSON.parse(await readFile(join(fixtures,'apps/basic.json'),'utf8'));
  const assembled = sdk.buildApp({
    descriptor, packages,
    packageRoots:Object.fromEntries(ids.map(id=>[id,join(fixtures,'packages',id)])),
    packageArtifacts:Object.fromEntries(ids.map(id=>[id,'dist/index.mjs'])),
    kdpArtifact:{ packageId:'r41-kdp', path:'dist/bootstrap.js' },
  });
  assert.equal(assembled.ok, true, assembled.ok ? '' : assembled.message);
  const appDir=join(temporary,'composed-app');
  for(const item of assembled.appPackage.files){
    const dest=join(appDir,...item.path.split('/'));
    await ensureParent(dest);
    await writeFile(dest,item.bytes);
  }
  await runNpm(appDir,['install','--package-lock-only','--ignore-scripts','--no-audit','--no-fund'],env);
  await runNpm(appDir,['ci','--ignore-scripts','--no-audit','--no-fund'],env);
  const booted=await runNode(appDir,['boot.mjs']);
  assert.equal(booted.code, 0, booted.stderr+' '+booted.stdout);
  assert.ok(booted.stdout.includes('"status":"BOOTED"'),booted.stdout);
  evidence.boot = true;
  const target=join(appDir,'node_modules/r41-sdk-base/dist/index.mjs');
  await writeFile(target, Buffer.concat([await readFile(target),Buffer.from('\n//r60-tamper\n')]));
  const tamper=await runNode(appDir,['boot.mjs']);
  assert.notEqual(tamper.code,0,'modified selected Package must not reach BOOTED');
  assert.equal(tamper.stdout.includes('"status":"BOOTED"'),false);
  evidence.tamperRejected = true;
  // R70 AC60-06: this same one-SDK Registry-installed consumer composes
  // a real T14 Workflow App; do not supply three first-party tarballs.
  const demo = join(repo, 'examples/basic-domain-app');
  await cp(join(demo, 'consumer.mjs'), join(consumer, 'registry-workflow-fixture.mjs'));
  await cp(join(demo, 'workflow-fixture.mjs'), join(consumer, 'workflow-fixture.mjs'));
  const fileSource = join(temporary, 'selected-packages/packages/r60-standard-files');
  await mkdir(dirname(fileSource), { recursive: true });
  await cp(join(repo, 'examples/selected-packages/packages/r60-standard-files'),
    fileSource, { recursive: true });
  const fixture = await runNode(consumer, ['registry-workflow-fixture.mjs'], {
    ...env, DH_R60_REGISTRY_WORKFLOW_FIXTURE_ONLY: '1',
    DH_T05_EVIDENCE: join(temporary, 'workflow-evidence'),
  });
  assert.equal(fixture.code, 0, 'Registry SDK Workflow fixture: ' +
    fixture.stderr + '\n' + fixture.stdout);
  assert.ok(fixture.stdout.includes('DH_R70_REGISTRY_WORKFLOW_FIXTURE'));
  const workflowRoot = join(consumer, 'registry-workflow-app');
  const sealed = JSON.parse(await readFile(join(workflowRoot, 'dh-lock/app.lock.json'), 'utf8'));
  assert.equal(sealed.selectedWorkflows?.length, 7);
  const appJson = JSON.parse(await readFile(join(workflowRoot, 'package.json'), 'utf8'));
  assert.equal(appJson.dependencies['@kaicreator/domain-harness'], '0.11.0');
  assert.deepEqual(Object.keys(appJson.dependencies).filter((name) =>
    name.startsWith('@kaicreator/')), ['@kaicreator/domain-harness']);
  assert.equal(Object.keys(consumerLock.packages[''].dependencies).length, 1);
  const selectedPins = sealed.trustedRuntimeIntegrity;
  assert.deepEqual(selectedPins?.map((archive) => [archive.name, archive.version]),
    [['xstate', '5.33.2'], ['yaml', '2.9.1']]);
  const runtimeManifest = JSON.parse(await readFile(join(workflowRoot,
    'dh-install/trusted-runtime.json'), 'utf8'));
  assert.deepEqual(runtimeManifest.archives, selectedPins);
  await runNpm(workflowRoot, ['install', '--package-lock-only',
    '--ignore-scripts', '--no-audit', '--no-fund'], env);
  const lockPath = join(workflowRoot, 'package-lock.json');
  const originalLock = await readFile(lockPath);
  const npmLock = JSON.parse(originalLock.toString('utf8'));
  for (const archive of selectedPins) {
    for (const packages of [consumerLock.packages, npmLock.packages]) {
      const found = packages['node_modules/' + archive.name];
      assert.equal(found?.version, archive.version);
      assert.equal(found?.integrity, archive.integrity,
        'Registry npm pin must equal the selected App DomainAppLock SRI');
    }
  }
  const preflight = await runNode(workflowRoot, ['dh-install/verify-preinstall.mjs'], env);
  assert.equal(preflight.code, 0, preflight.stderr);
  assert.ok(preflight.stdout.includes('DH_TRUSTED_RUNTIME_PREINSTALL_APPROVED'));
  evidence.workflowTransitiveSRI = true;
  // Negative runs before npm ci and Boot: an approved archive SRI is changed.
  const bad = structuredClone(npmLock);
  bad.packages['node_modules/yaml'].integrity = 'sha512-' + 'A'.repeat(86) + '==';
  await writeFile(lockPath, JSON.stringify(bad));
  const rejected = await runNode(workflowRoot, ['dh-install/verify-preinstall.mjs'], env);
  assert.notEqual(rejected.code, 0, 'mutated archive SRI must be rejected before install');
  assert.ok(rejected.stderr.includes('DH_TRUSTED_RUNTIME_PREINSTALL_SRI_MISMATCH'),
    rejected.stderr);
  assert.ok(!rejected.stdout.includes('DH_TRUSTED_RUNTIME_PREINSTALL_APPROVED'));
  evidence.preinstallTamperedSRIRejected = true;
  await writeFile(lockPath, originalLock);
  const restored = await runNode(workflowRoot, ['dh-install/verify-preinstall.mjs'], env);
  assert.equal(restored.code, 0, restored.stderr);
  await runNpm(workflowRoot, ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], env);
  const postflight = await runNode(workflowRoot, ['dh-install/verify-runtime.mjs'], env);
  assert.equal(postflight.code, 0, postflight.stderr);
  const workflowBoot = await runNode(workflowRoot,
    ['--input-type=module', '--eval', "\nimport assert from 'node:assert/strict';\nimport { readFile } from 'node:fs/promises';\nimport { boot } from '@kaicreator/domain-harness/runtime';\nconst pin = JSON.parse(await readFile('dh-install/bootstrap-pin.json', 'utf8'));\nconst result = await boot(pin, {\n  installRoot: process.cwd(), descriptorPath: 'descriptor/app.json',\n  lockPath: 'dh-lock/app.lock.json', hostPorts: [],\n  env: {nodeMajor: Number(process.versions.node.split('.')[0]), platform: process.platform},\n});\nassert.equal(result.status, 'BOOTED', JSON.stringify(result));\nassert.equal(result.app.status, 'READY');\nconst events = globalThis.__domainHarnessT05Events ?? [];\nconst cutoff = events.findIndex((item) => item.event === 'workflow-cases-begin');\nassert.ok(cutoff > 0, 'real selected nested Workflow must run during Package.Init');\nconst reads = events.slice(0, cutoff).filter((item) => item.event === 'workflow-read');\nassert.deepEqual(reads.map((item) => [item.format, item.parsed?.id, item.parsed?.result]), [\n  ['json', 'json-a', 1], ['yaml', 'yaml-a', 3],\n  ['json', 'json-b', 2], ['yaml', 'yaml-b', 4],\n]);\nassert.deepEqual(events.find((item) => item.event === 'workflow-outcome')?.outcome,\n  { status: 'COMPLETE', value: {id:'yaml-b',result:4} });\nconst cases = events.filter((item) => item.event === 'workflow-case');\nfor (const [name, status] of [['unknown','UNKNOWN'],['failed','FAILED'],\n  ['shared-budget','FAILED'],['ancestor-depth','FAILED']]) {\n  assert.equal(cases.find((item) => item.name === name)?.outcome.status, status);\n}\nconsole.log('DH_R70_REGISTRY_WORKFLOW_BOOT_OK ' + JSON.stringify({\n  status: result.status, reads: reads.length, cases: cases.length,\n}));\nawait result.app.dispose();\n"], env);
  assert.equal(workflowBoot.code, 0, 'Registry real Workflow Boot: ' +
    workflowBoot.stderr + '\n' + workflowBoot.stdout);
  assert.ok(workflowBoot.stdout.includes('DH_R70_REGISTRY_WORKFLOW_BOOT_OK'));
  evidence.registryWorkflowSelected = sealed.selectedWorkflows.length;
  evidence.registryWorkflowBoot = true;
  evidence.registryDataReads = 4;
  console.log('DH_R60_REAL_REGISTRY_ONE_DIRECT_SDK_PASS '+JSON.stringify(evidence));
} finally {
  if(server) await new Promise(resolve=>server.close(resolve));
  await rm(temporary,{recursive:true,force:true});
}
