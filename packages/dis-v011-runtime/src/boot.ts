import { readFile } from 'node:fs/promises';
import type { openSqliteCasStore } from '@kaicreator/domain-harness/v8/host';
import { digest } from './knowledge.js';
import type { attachConsumer } from './provider-bindings.js';
import type { startKdpPrimary } from './kdp-primary.js';

export const kernelSha256 = 'e1ed59556f8b447b5f559302a893738eeae1d272e3a30ac4545fedfb1da8a3e7';
export const primaryId = 'dis-kdp-primary@0.11.0-dev.0';

export async function bootKdp(descriptor: { primary: string; primarySha256: string; lockSha256: string }, kernelSource: string, sqlitePath: string, trusted: { primarySha256: string; lockSha256: string }, openHost: typeof openSqliteCasStore) {
  if (descriptor.primary !== primaryId || !/^[a-f0-9]{64}$/.test(trusted?.primarySha256 ?? '') || !/^[a-f0-9]{64}$/.test(trusted?.lockSha256 ?? '') || descriptor.primarySha256 !== trusted.primarySha256 || descriptor.lockSha256 !== trusted.lockSha256) {
    throw new Error('BOOT_DESCRIPTOR_INVALID');
  }
  const bytes = await readFile(new URL('./kdp-primary.js', import.meta.url));
  if (digest(bytes) !== descriptor.primarySha256) throw new Error('KDP_PRIMARY_DIGEST_MISMATCH');
  const moduleUrl = 'data:text/javascript;base64,' + bytes.toString('base64');
  const primary = await import(moduleUrl) as { startKdpPrimary: typeof startKdpPrimary };
  const attach: typeof attachConsumer = async (...args) => (await import('./provider-bindings.js')).attachConsumer(...args);
  return primary.startKdpPrimary({ kernelSource, kernelSha256, primarySha256: trusted.primarySha256,
    lockSha256: trusted.lockSha256, sqlitePath, openSqliteCasStore:openHost, attachConsumer:attach, digest });
}
