import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { dirname, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
const expected = 'a4a88e6398303cf2f27cda3be061f23b45f07a9e6718af7eaf5d2c6e28e7500d';
const payload = gunzipSync(await readFile(new URL('./payload.json.gz', import.meta.url)));
const actual = createHash('sha256').update(payload).digest('hex');
if (actual !== expected) throw Error('E_TRANSPORT_INTEGRITY ' + actual);
const root = fileURLToPath(new URL('../../', import.meta.url));
const prefix = 'experiments/v08-package-first-bootstrap/';
const files = JSON.parse(payload.toString('utf8')).files;
if (!Array.isArray(files) || files.length !== 16) throw Error('E_TRANSPORT_COUNT');
const seen = new Set();
for (const file of files) {
  if (typeof file.path !== 'string' || !file.path.startsWith(prefix) ||
      typeof file.content !== 'string' || file.path.includes('..') ||
      file.path.includes('\\') || isAbsolute(file.path) || seen.has(file.path))
    throw Error('E_TRANSPORT_PATH');
  seen.add(file.path);
  const fullPath = resolve(root,file.path);
  await mkdir(dirname(fullPath),{recursive:true});
  await writeFile(fullPath,file.content,'utf8');
}
console.log('MATERIALIZED='+files.length+' SHA256='+actual);
