import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { bootKdp, kernelSha256 } from '@kaicreator/domain-harness-dis-v011-runtime/boot';

const appUrl = new URL('./domain/domain-app.yaml', import.meta.url);
const lockUrl = new URL('./domain/runtime-lock.json', import.meta.url);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

export async function loadKernelSource() {
  const raw = await readFile(new URL('../../domain-packages/kernel/basic/kernel-mechanism-v1.mjs', import.meta.url));
  if (digest(raw) !== kernelSha256) throw new Error('TRUSTED_MODULE_BYTES_CHANGED:kernel');
  return raw.toString('utf8');
}

const defaultQualificationSha256 = '78dcb054edcbd5aa8c1b48afa339c799ab2d3ba2dfb29f5029383280491c4261';
export async function deployment(variant, expectedIndexSha256 = defaultQualificationSha256) {
  const [appRaw, qualifiedRaw] = await Promise.all([readFile(appUrl),readFile(lockUrl)]);
  if (!/^[a-f0-9]{64}$/.test(expectedIndexSha256) || digest(qualifiedRaw) !== expectedIndexSha256) throw new Error('QUALIFICATION_INDEX_PIN_MISMATCH');
  const app = JSON.parse(appRaw);
  const qualified = JSON.parse(qualifiedRaw);
  const expected = qualified.variants[variant];
  if (app.format !== 'dis-reference-boot/1' || app.target !== 'node24' || app.kernel !== 'v08-kernel-mechanism@1.0.0'
      || app.package !== 'xdownload.web-media-runtime' || app.runtimePackage !== 'runtime-package.json'
      || app.runtimeLock !== 'runtime-lock.json' || qualified.appSha256 !== digest(appRaw)
      || qualified.format !== 'dis-runtime-qualification-index/1' || qualified.scope !== 'PRIVATE_REFERENCE_ONLY'
      || !Object.hasOwn(qualified.variants,variant)) throw new Error('DEPLOYMENT_NOT_QUALIFIED');
  return { primary: app.primary, primarySha256: qualified.primarySha256, lockSha256: expected.lock, expected };
}

export async function openDemo(sqlitePath, variant = 'baseline') {
  const plan = await deployment(variant);
  const { openSqliteCasStore } = await import('@kaicreator/domain-harness/v8/host');
  const kdp = await bootKdp(plan, await loadKernelSource(), sqlitePath, {primarySha256:plan.primarySha256,lockSha256:plan.expected.lock},openSqliteCasStore);
  let selected;
  try {
    const { buildDemo } = await import('./build.mjs');
    selected = await buildDemo(variant, plan.expected);
    await kdp.attach(selected);
  } catch (error) {
    await kdp.close();
    throw error;
  }
  return {
    selected,
    boot: kdp.identity,
    recognize(observation, messageId = randomUUID(), instanceKey = 'page:demo') {
      return kdp.send({ intentType:'recognizePlayer', input:{ observation }, messageId, instanceKey });
    },
    readOccurrence: kdp.readOccurrence,
    close: kdp.close,
  };
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const sqlitePath = process.argv[2];
  if (!sqlitePath) throw new Error('Supply a SQLite file in the task evidence directory');
  const app = await openDemo(sqlitePath);
  try {
    const receipt = await app.recognize({url:'https://example.test/video',signals:['jwplayer.setup']});
    const effectId = receipt.admitted?.effects?.[0]?.effectId;
    console.log(JSON.stringify({buildId:app.selected.app.buildId,adapterSha256:app.selected.adapterSha256,receipt,journal:effectId ? await app.readOccurrence(effectId) : null},null,2));
  } finally {
    await app.close();
  }
}
