import { loadVerifiedDemo } from './verified-loader.mjs';
import { runPipeline } from './runner.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const loaded = await loadVerifiedDemo();
if (process.argv.includes('--provider-probe')) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'dis-provider-conformance-'));
  try {
    const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    await fs.cp(source, temporary, { recursive: true });
    const descriptorPath = path.join(temporary, 'package.json');
    const descriptor = JSON.parse(await fs.readFile(descriptorPath, 'utf8'));
    const recognizer = JSON.parse(await fs.readFile(path.join(temporary, 'domain/units/recognizer.json'), 'utf8'));
    const candidate = recognizer.implementation.candidates.find((item) => item.candidateId === 'signature-normalized-v1');
    Object.assign(descriptor.dis.selectionLock.selectedCapabilities[0].provider, { candidateId: candidate.candidateId, implementationRef: candidate.ref, artifactRef: candidate.artifactRef, artifactDigest: candidate.artifactDigest });
    const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
    descriptor.dis.selectionLockSha256 = createHash('sha256').update(JSON.stringify(canonical(descriptor.dis.selectionLock))).digest('hex');
    await fs.writeFile(descriptorPath, JSON.stringify(descriptor));
    const isolated = await import(pathToFileURL(path.join(temporary, 'src/runner.mjs')).href);
    const instance = await isolated.loadDemo({ expectedSelectionLockSha256: descriptor.dis.selectionLockSha256 });
    const input = { url: 'https://example.test/watch', signals: ['JWPLAYER'] };
    console.log(JSON.stringify({ label: 'normalized-provider', input, ...(await isolated.runPipeline(input, instance)) }));
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
  process.exit(0);
}
if (process.argv.includes('--scope-probes')) {
  const probes = [
    { input: { url: 'ftp://example.test/page', signals: [] }, expected: 'FAILURE_POLICY_REJECT' },
    { input: { url: 'https://example.test/page', signals: [], encryptedPlayer: true }, expected: 'FAILURE_POLICY_REJECT' },
    { input: { url: 'https://example.test/page', signals: [], unsupportedPlayerFamily: true }, expected: 'FAILURE_POLICY_REJECT' },
    { input: { url: 'https://example.test/page' }, expected: 'PRECONDITION_FAILED' },
    { input: { url: 'not a URL', signals: [] }, expected: 'INVALID_INPUT' },
    { input: { url: 'https://example.test/page', signals: [42] }, expected: 'INVALID_INPUT' },
    { input: { url: 'http://', signals: [] }, expected: 'INVALID_INPUT' },
    { input: { url: 'http://[invalid]', signals: [] }, expected: 'INVALID_INPUT' },
    { input: { url: 'https://%zz', signals: [] }, expected: 'INVALID_INPUT' },
    { input: { url: 'https://example.test/a b', signals: [] }, expected: 'INVALID_INPUT' },
    { input: { url: 'https://example.test/a|b', signals: [] }, expected: 'INVALID_INPUT' },
    { input: { url: 'https://example.test/<a>', signals: [] }, expected: 'INVALID_INPUT' },
    { input: { url: 'https://example.test/[a]', signals: [] }, expected: 'INVALID_INPUT' },
    { input: { url: 'ftp://example.test/a|b', signals: [] }, expected: 'INVALID_INPUT' },
    { input: { url: 'https://example.test:000000/', signals: [] }, expected: 'INVALID_INPUT' },
    { input: { url: 'https://example.test/\n', signals: [] }, expected: 'INVALID_INPUT' },
    { input: { url: 'https://example.test/#a#b', signals: [] }, expected: 'INVALID_INPUT' },
  ];
  const result = [];
  for (const { input, expected } of probes) {
    try { await runPipeline(input, loaded); throw new Error('scope exclusion unexpectedly executed'); }
    catch (error) {
      if (error.code !== expected || !Array.isArray(error.trace)) throw error;
      result.push({ input, errorCode: error.code, failurePolicy: error.failurePolicy, trace: error.trace, output: error.trace.at(-1)?.output });
    }
  }
  console.log(JSON.stringify(result));
  process.exit(0);
}
const cases = [
  { label: 'known', input: { url: 'https://example.test/watch', signals: ['jwplayer.setup({})'] } },
  { label: 'ambiguous', input: { url: 'https://example.test/watch', signals: ['jwplayer', 'videojs'] } },
  { label: 'unknown', input: { url: 'https://example.test/watch', signals: ['custom-player'] } },
  { label: 'fixture-hls', input: { url: 'https://example.test/watch', signals: ['hls.js'] } },
  { label: 'conflict', input: { url: 'https://example.test/watch', signals: ['jwplayer'], claims: [{ sourceId: 'browser', playerId: 'videojs' }] } },
];
const results = [];
for (const item of cases) {
  results.push({ label: item.label, input: item.input, packageIdentity: loaded.packageIdentity, ...(await runPipeline(item.input, loaded)) });
}
console.log(JSON.stringify(results));
