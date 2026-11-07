import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildConsumer, digest, selectKnowledge } from '../../packages/dis-v011-runtime/dist/index.js';

const frozenRoot = fileURLToPath(new URL('../dis-0.1.0-player-recognition/', import.meta.url));
export const frozenPins = Object.freeze({
  descriptor:'5734bba9e82e63d9f69b004a0bd16e631638cd512c09020bd951e1e2f676e0f6',
  closure:'2548b63764b72eeef3226dc77c2de305fcf1bc5d61f2a54593d83550dea421d8',
  lock:'2d34f56732b49e33c0638fb2bc1afe5799c777098ebd853272358874729b8a58',
});
const payloads = {
  kernel:['kernel/basic/kernel-mechanism-v1.mjs','e1ed59556f8b447b5f559302a893738eeae1d272e3a30ac4545fedfb1da8a3e7'],
  standard:['standard/basic/standard-sdk-v1.mjs','dec042cacee70a8762b693f02b80ce14844b52bdf12969ff2250c7013c67c8bf'],
  router:['standard/basic/workflow-router.mjs','d9f9c33f08951aacebe1648fb44554ecacb70db6292f02367035d99ea1c112b5'],
};
export async function buildDemo(root = frozenRoot, expectedPins = frozenPins) {
  const selection = await selectKnowledge(root, expectedPins);
  const payload = Object.fromEntries(await Promise.all(Object.entries(payloads).map(async ([key,[relative,pin]]) => {
    const bytes = await readFile(new URL('../../domain-packages/' + relative, import.meta.url));
    if (digest(bytes) !== pin) throw new Error('TRUSTED_MODULE_BYTES_CHANGED:' + key);
    return [key, bytes.toString('utf8')];
  })));
  return { ...buildConsumer(selection,payload), selection };
}
