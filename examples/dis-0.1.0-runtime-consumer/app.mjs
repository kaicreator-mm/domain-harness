import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { bootKdp } from '../../packages/dis-v011-runtime/dist/index.js';
import { buildDemo, deployment, loadKernelSource } from './build.mjs';

export async function openDemo(sqlitePath, variant = 'baseline') {
  const kdp = await bootKdp(await deployment(variant), await loadKernelSource(), sqlitePath);
  let selected;
  try {
    selected = await buildDemo(variant);
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
